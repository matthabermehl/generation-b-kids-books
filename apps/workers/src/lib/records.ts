import type { SqlParameter } from "@aws-sdk/client-rds-data";
import { execute, withTransaction, txExecute } from "./rds.js";
import { makeId } from "./helpers.js";

interface InsertBookArtifactInput {
  bookId: string;
  artifactType: string;
  s3Url: string;
  sha256?: string | null;
}

interface InsertImageRecordInput {
  bookId: string;
  pageId?: string | null;
  role: string;
  scopeEntityId?: string | null;
  endpoint: string;
  prompt: string;
  seed: number;
  requestId?: string | null;
  width?: number | null;
  height?: number | null;
  s3Url?: string | null;
  qaJson?: Record<string, unknown>;
  status: string;
  parentImageId?: string | null;
  inputAssets?: Record<string, unknown>;
  maskS3Url?: string | null;
}

export async function insertCurrentBookArtifact(input: InsertBookArtifactInput): Promise<string> {
  const id = makeId();
  await withTransaction(async (tx) => {
    await txExecute(
      tx,
      `
        UPDATE book_artifacts
        SET is_current = FALSE
        WHERE book_id = CAST(:bookId AS uuid) AND artifact_type = :artifactType AND is_current = TRUE
      `,
      [
        { name: "bookId", value: { stringValue: input.bookId } },
        { name: "artifactType", value: { stringValue: input.artifactType } }
      ]
    );

    await txExecute(
      tx,
      `
        INSERT INTO book_artifacts (id, book_id, artifact_type, s3_url, sha256, is_current)
        VALUES (CAST(:id AS uuid), CAST(:bookId AS uuid), :artifactType, :s3, NULLIF(:sha256, ''), TRUE)
      `,
      [
        { name: "id", value: { stringValue: id } },
        { name: "bookId", value: { stringValue: input.bookId } },
        { name: "artifactType", value: { stringValue: input.artifactType } },
        { name: "s3", value: { stringValue: input.s3Url } },
        { name: "sha256", value: { stringValue: input.sha256 ?? "" } }
      ]
    );
  });

  return id;
}

export async function insertCurrentImageRecord(input: InsertImageRecordInput): Promise<string> {
  const id = makeId();
  const scopeSql = input.pageId
    ? "book_id = CAST(:bookId AS uuid) AND page_id = CAST(:pageId AS uuid) AND role = :role"
    : input.scopeEntityId
      ? "book_id = CAST(:bookId AS uuid) AND page_id IS NULL AND role = :role AND COALESCE(input_assets_json->>'entityId', '') = :scopeEntityId"
      : "book_id = CAST(:bookId AS uuid) AND page_id IS NULL AND role = :role";
  const scopeParams: SqlParameter[] = [
    { name: "bookId", value: { stringValue: input.bookId } },
    ...(input.pageId ? [{ name: "pageId", value: { stringValue: input.pageId } }] : []),
    ...(input.pageId || !input.scopeEntityId
      ? []
      : [{ name: "scopeEntityId", value: { stringValue: input.scopeEntityId } }]),
    { name: "role", value: { stringValue: input.role } }
  ];

  await withTransaction(async (tx) => {
    await txExecute(
      tx,
      `
        UPDATE images
        SET is_current = FALSE
        WHERE ${scopeSql} AND is_current = TRUE
      `,
      scopeParams
    );

    await txExecute(
      tx,
      `
        INSERT INTO images (
          id, book_id, page_id, role, model_endpoint, prompt, seed, provider_request_id, width, height, s3_url, qa_json, status, parent_image_id, input_assets_json, mask_s3_url, is_current
        ) VALUES (
          CAST(:id AS uuid),
          CAST(:bookId AS uuid),
          ${input.pageId ? "CAST(:pageId AS uuid)" : "NULL"},
          :role,
          :endpoint,
          :prompt,
          :seed,
          :requestId,
          :width,
          :height,
          NULLIF(:s3, ''),
          CAST(:qa AS jsonb),
          :status,
          NULLIF(:parentImageId, '')::uuid,
          CAST(:inputAssets AS jsonb),
          NULLIF(:maskS3, ''),
          TRUE
        )
      `,
      [
        { name: "id", value: { stringValue: id } },
        { name: "bookId", value: { stringValue: input.bookId } },
        ...(input.pageId ? [{ name: "pageId", value: { stringValue: input.pageId } }] : []),
        { name: "role", value: { stringValue: input.role } },
        { name: "endpoint", value: { stringValue: input.endpoint } },
        { name: "prompt", value: { stringValue: input.prompt } },
        { name: "seed", value: { longValue: input.seed } },
        { name: "requestId", value: { stringValue: input.requestId ?? "" } },
        { name: "width", value: { longValue: input.width ?? 2048 } },
        { name: "height", value: { longValue: input.height ?? 2048 } },
        { name: "s3", value: { stringValue: input.s3Url ?? "" } },
        { name: "qa", value: { stringValue: JSON.stringify(input.qaJson ?? {}) } },
        { name: "status", value: { stringValue: input.status } },
        { name: "parentImageId", value: { stringValue: input.parentImageId ?? "" } },
        { name: "inputAssets", value: { stringValue: JSON.stringify(input.inputAssets ?? {}) } },
        { name: "maskS3", value: { stringValue: input.maskS3Url ?? "" } }
      ]
    );
  });

  return id;
}

export async function clearCurrentImagesForPage(pageId: string, roles: string[]): Promise<void> {
  if (roles.length === 0) {
    return;
  }

  await execute(
    `
      UPDATE images
      SET is_current = FALSE
      WHERE page_id = CAST(:pageId AS uuid)
        AND role = ANY(string_to_array(:roles, ','))
        AND is_current = TRUE
    `,
    [
      { name: "pageId", value: { stringValue: pageId } },
      { name: "roles", value: { stringValue: roles.join(",") } }
    ]
  );
}
