import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";
import { rendererFonts } from "../templates/fonts.js";
import { renderPictureBookPreview, type PageCompositionSpec } from "../templates/picture-book-page.js";

const s3 = new S3Client({});

interface LegacyRenderPage {
  index: number;
  text: string;
  imageS3Url: string;
}

interface PictureBookRenderPage {
  index: number;
  text: string;
  composition: PageCompositionSpec;
  artImageS3Url: string;
  previewOutputKey: string;
}

export interface RenderInput {
  bookId: string;
  title: string;
  productFamily?: "picture_book_fixed_layout" | "chapter_book_reflowable";
  layoutProfileId?: string;
  pages: Array<LegacyRenderPage | PictureBookRenderPage>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
}

function parseS3Url(url: string): { bucket: string; key: string } {
  if (!url.startsWith("s3://")) {
    throw new Error(`Invalid s3 url: ${url}`);
  }

  const withoutPrefix = url.slice("s3://".length);
  const slash = withoutPrefix.indexOf("/");
  return {
    bucket: withoutPrefix.slice(0, slash),
    key: withoutPrefix.slice(slash + 1)
  };
}

async function getS3Buffer(url: string): Promise<Buffer> {
  const { bucket, key } = parseS3Url(url);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await response.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Missing bytes for ${url}`);
  }
  return Buffer.from(bytes);
}

async function putS3Buffer(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: required("ARTIFACT_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType
    })
  );
}

function isPictureBookPage(page: LegacyRenderPage | PictureBookRenderPage): page is PictureBookRenderPage {
  return "composition" in page && "artImageS3Url" in page && "previewOutputKey" in page;
}

async function renderLegacyPdf(input: RenderInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(24).text(input.title);
  doc.moveDown();
  doc.fontSize(12).text(`Book ID: ${input.bookId}`);
  doc.moveDown();

  for (const page of input.pages) {
    if (isPictureBookPage(page)) {
      continue;
    }
    doc.addPage();
    doc.fontSize(18).text(`Page ${page.index + 1}`);
    doc.moveDown();
    doc.fontSize(12).text(page.text);
    doc.moveDown();
    doc.fontSize(10).fillColor("#64748b").text(`Illustration source: ${page.imageS3Url}`);
    doc.fillColor("#111827");
  }

  doc.end();
  return done;
}

async function renderPictureBookPdf(input: RenderInput): Promise<Buffer> {
  const pageSize = 612;
  const doc = new PDFDocument({ size: [pageSize, pageSize], margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  let firstPage = true;
  for (const page of input.pages) {
    if (!isPictureBookPage(page)) {
      continue;
    }

    const artBytes = await getS3Buffer(page.artImageS3Url);
    const rendered = await renderPictureBookPreview({
      artBytes,
      text: page.text,
      composition: page.composition
    });
    await putS3Buffer(page.previewOutputKey, rendered.previewPng, "image/png");

    if (!firstPage) {
      doc.addPage({ size: [pageSize, pageSize], margin: 0 });
    }
    firstPage = false;

    doc.image(rendered.artBackgroundPng, 0, 0, { width: pageSize, height: pageSize });
    const textLeft = page.composition.textBox.x * pageSize;
    const textTop = page.composition.textBox.y * pageSize;
    const boxWidth = page.composition.textBox.width * pageSize;
    const lineHeight = rendered.textFit.fontPx * (pageSize / page.composition.canvas.width) * page.composition.textStyle.lineHeight;
    const fontSize = rendered.textFit.fontPx * (pageSize / page.composition.canvas.width);
    doc.fillColor("#111827");
    doc.font(rendererFonts.bodyPdf).fontSize(fontSize);
    rendered.textFit.lines.forEach((line, index) => {
      doc.text(line, textLeft, textTop + index * lineHeight, {
        width: boxWidth,
        lineBreak: false
      });
    });
  }

  doc.end();
  return done;
}

export async function renderBook(input: RenderInput): Promise<Buffer> {
  if (input.productFamily === "picture_book_fixed_layout") {
    return renderPictureBookPdf(input);
  }

  return renderLegacyPdf(input);
}
