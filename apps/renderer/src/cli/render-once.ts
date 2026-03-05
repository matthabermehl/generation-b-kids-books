import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";

interface RenderPage {
  index: number;
  text: string;
  imageS3Url: string;
}

interface RenderInput {
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

async function renderPdf(input: RenderInput): Promise<Buffer> {
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
  const pdf = await renderPdf(input);

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
