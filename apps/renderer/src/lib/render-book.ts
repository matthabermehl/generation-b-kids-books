import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Resvg } from "@resvg/resvg-js";
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

function contentTypeMatches(contentType: string, expected: "svg" | "png" | "jpeg"): boolean {
  const lowered = contentType.toLowerCase();
  if (expected === "svg") {
    return lowered.includes("image/svg+xml");
  }
  if (expected === "png") {
    return lowered.includes("image/png");
  }
  return lowered.includes("image/jpeg") || lowered.includes("image/jpg");
}

function keyMatches(key: string, expected: "svg" | "png" | "jpeg"): boolean {
  const lowered = key.toLowerCase();
  if (expected === "svg") {
    return lowered.endsWith(".svg");
  }
  if (expected === "png") {
    return lowered.endsWith(".png");
  }
  return lowered.endsWith(".jpg") || lowered.endsWith(".jpeg");
}

export async function loadPageImageForPdf(
  imageS3Url: string,
  s3Client: Pick<S3Client, "send"> = s3
): Promise<Buffer> {
  const { bucket, key } = parseS3Url(imageS3Url);
  const imageObject = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );

  const bytes = await imageObject.Body?.transformToByteArray();
  if (!bytes || bytes.length === 0) {
    throw new Error(`Missing image payload: ${imageS3Url}`);
  }

  const imageBuffer = Buffer.from(bytes);
  const contentType = imageObject.ContentType ?? "";

  if (contentTypeMatches(contentType, "png") || contentTypeMatches(contentType, "jpeg")) {
    return imageBuffer;
  }

  if (contentTypeMatches(contentType, "svg") || keyMatches(key, "svg")) {
    try {
      const rendered = new Resvg(imageBuffer, {
        fitTo: {
          mode: "width",
          value: 1536
        }
      }).render();
      return Buffer.from(rendered.asPng());
    } catch (error) {
      throw new Error(
        `Failed to rasterize SVG image ${imageS3Url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (keyMatches(key, "png") || keyMatches(key, "jpeg")) {
    return imageBuffer;
  }

  throw new Error(`Unsupported image format for PDF embed: ${imageS3Url} (${contentType || "unknown"})`);
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

export async function renderLegacyPdf(
  input: RenderInput,
  s3Client: Pick<S3Client, "send"> = s3
): Promise<Buffer> {
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
    const imageBytes = await loadPageImageForPdf(page.imageS3Url, s3Client);
    const imageTop = doc.y + 8;
    doc.image(imageBytes, 72, imageTop, {
      fit: [468, 300],
      align: "center",
      valign: "center"
    });
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

  let hasRenderedSpread = false;
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

    if (hasRenderedSpread) {
      doc.addPage({ size: [pageSize, pageSize], margin: 0 });
    }
    hasRenderedSpread = true;

    const textLeft = page.composition.leftPage.textBox.x * pageSize;
    const textTop = page.composition.leftPage.textBox.y * pageSize;
    const boxWidth = page.composition.leftPage.textBox.width * pageSize;
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

    doc.addPage({ size: [pageSize, pageSize], margin: 0 });
    doc.image(rendered.rightPagePng, 0, 0, { width: pageSize, height: pageSize });
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
