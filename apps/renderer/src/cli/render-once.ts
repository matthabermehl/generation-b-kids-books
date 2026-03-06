import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import PDFDocument from "pdfkit";

export interface RenderPage {
  index: number;
  text: string;
  imageS3Url: string;
}

export interface RenderInput {
  bookId: string;
  title: string;
  pages: RenderPage[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }

  return value;
}

export function parseS3Url(url: string): { bucket: string; key: string } {
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
  s3: Pick<S3Client, "send">,
  imageS3Url: string
): Promise<Buffer> {
  const { bucket, key } = parseS3Url(imageS3Url);
  const imageObject = await s3.send(
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

export async function renderPdf(input: RenderInput, s3: Pick<S3Client, "send">): Promise<Buffer> {
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
    const imageBytes = await loadPageImageForPdf(s3, page.imageS3Url);
    doc.addPage();
    doc.fontSize(18).text(`Page ${page.index + 1}`);
    doc.moveDown();
    doc.fontSize(12).text(page.text);
    doc.moveDown();
    const imageTop = doc.y + 8;
    doc.image(imageBytes, 72, imageTop, {
      fit: [468, 300],
      align: "center",
      valign: "center"
    });
    doc.fillColor("#111827").moveDown();
  }

  doc.end();

  return done;
}

async function main(): Promise<void> {
  const s3 = new S3Client({});
  const artifactBucket = required("ARTIFACT_BUCKET");
  const renderInputKey = required("RENDER_INPUT_KEY");
  const outputPdfKey = required("OUTPUT_PDF_KEY");

  const inputObject = await s3.send(
    new GetObjectCommand({
      Bucket: artifactBucket,
      Key: renderInputKey
    })
  );

  const payload = await inputObject.Body?.transformToString();
  if (!payload) {
    throw new Error("Missing render input payload");
  }

  const input = JSON.parse(payload) as RenderInput;
  const pdf = await renderPdf(input, s3);

  await s3.send(
    new PutObjectCommand({
      Bucket: artifactBucket,
      Key: outputPdfKey,
      Body: pdf,
      ContentType: "application/pdf"
    })
  );

  console.log(JSON.stringify({ ok: true, output: `s3://${artifactBucket}/${outputPdfKey}` }));
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
