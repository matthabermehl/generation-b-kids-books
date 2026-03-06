import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { renderBook, type RenderInput } from "../lib/render-book.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }

  return value;
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
  const pdf = await renderBook(input);

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
