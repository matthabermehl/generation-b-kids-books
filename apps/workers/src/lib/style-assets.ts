import sharp from "sharp";
import { putBuffer, presignGetObjectFromS3Url } from "./storage.js";

async function pngFromSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export async function pictureBookStyleBoardPng(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#faf7ef" />
    <rect x="32" y="32" width="208" height="208" rx="24" fill="#d8a48f" />
    <rect x="272" y="32" width="208" height="208" rx="24" fill="#98b6b1" />
    <rect x="32" y="272" width="208" height="208" rx="24" fill="#d9c9a3" />
    <rect x="272" y="272" width="208" height="208" rx="24" fill="#c8d8a0" />
    <circle cx="144" cy="144" r="52" fill="#faf7ef" opacity="0.7" />
    <circle cx="368" cy="360" r="72" fill="#faf7ef" opacity="0.65" />
  </svg>`;
  return pngFromSvg(svg);
}

export async function pictureBookPaperTexturePng(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#fffdf7" />
    <g opacity="0.2" stroke="#d9d2bf" stroke-width="2">
      <path d="M32 96 C128 64, 192 140, 288 112 S448 128, 480 96" fill="none" />
      <path d="M16 224 C112 192, 224 252, 352 220 S432 236, 496 208" fill="none" />
      <path d="M24 368 C112 336, 208 392, 312 360 S432 380, 488 352" fill="none" />
    </g>
  </svg>`;
  return pngFromSvg(svg);
}

export async function ensurePictureBookStyleReferenceUrls(): Promise<{
  styleBoardS3Url: string;
  styleBoardReferenceUrl: string;
  paperTextureS3Url: string;
  paperTextureReferenceUrl: string;
}> {
  const styleBoardS3Url = await putBuffer(
    "shared/style-guides/picture-book-watercolor-v1/style-board.png",
    await pictureBookStyleBoardPng(),
    "image/png"
  );
  const paperTextureS3Url = await putBuffer(
    "shared/style-guides/picture-book-watercolor-v1/paper-texture.png",
    await pictureBookPaperTexturePng(),
    "image/png"
  );

  const styleBoardReferenceUrl = await presignGetObjectFromS3Url(styleBoardS3Url);
  const paperTextureReferenceUrl = await presignGetObjectFromS3Url(paperTextureS3Url);
  if (!styleBoardReferenceUrl || !paperTextureReferenceUrl) {
    throw new Error("Unable to create style reference URLs");
  }

  return {
    styleBoardS3Url,
    styleBoardReferenceUrl,
    paperTextureS3Url,
    paperTextureReferenceUrl
  };
}
