import { afterEach, describe, expect, it } from "vitest";
import { publicArtifactUrl } from "../src/lib/storage.js";

describe("publicArtifactUrl", () => {
  afterEach(() => {
    delete process.env.ARTIFACT_PUBLIC_BASE_URL;
  });

  it("maps s3 artifact urls onto the CloudFront books path", () => {
    process.env.ARTIFACT_PUBLIC_BASE_URL = "https://cdn.example.com";

    expect(publicArtifactUrl("s3://artifact-bucket/books/book-1/render/previews/page-1.png")).toBe(
      "https://cdn.example.com/books/book-1/render/previews/page-1.png"
    );
  });

  it("passes through non-s3 urls unchanged", () => {
    process.env.ARTIFACT_PUBLIC_BASE_URL = "https://cdn.example.com";

    expect(publicArtifactUrl("https://example.com/page.png")).toBe("https://example.com/page.png");
    expect(publicArtifactUrl(null)).toBeNull();
  });
});
