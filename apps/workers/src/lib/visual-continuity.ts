import {
  buildSupportingCharacterReferencePrompt,
  buildVisualStoryBible,
  type StoryPackage,
  type VisualEntity,
  type VisualIdentityAnchor,
  type VisualStoryBible
} from "@book/domain";
import { resolveImageProvider } from "../providers/image.js";
import { insertCurrentBookArtifact, insertCurrentImageRecord } from "./records.js";
import { fileExtensionForContentType, logStructured, safeJsonParse } from "./helpers.js";
import { query } from "./rds.js";
import { getJson, presignGetObjectFromS3Url, putBuffer, putJson } from "./storage.js";

const visualBibleArtifactType = "visual_bible";

interface SupportingCharacterReferenceRow {
  image_id: string;
  s3_url: string | null;
  input_assets_json: string | null;
}

export interface SupportingCharacterReferenceAsset {
  imageId: string;
  entityId: string;
  label: string;
  identityAnchors: VisualIdentityAnchor[];
  s3Url: string;
  url: string;
}

export function visualBibleObjectKey(bookId: string): string {
  return `books/${bookId}/visual-bible.json`;
}

export async function persistVisualStoryBibleArtifact(input: {
  bookId: string;
  childFirstName: string;
  story: StoryPackage;
  generatedAt?: string;
}): Promise<{ visualBible: VisualStoryBible; s3Url: string }> {
  const visualBible = buildVisualStoryBible({
    bookId: input.bookId,
    title: input.story.title,
    childFirstName: input.childFirstName,
    story: input.story,
    generatedAt: input.generatedAt
  });
  const s3Url = await putJson(visualBibleObjectKey(input.bookId), visualBible);
  await insertCurrentBookArtifact({
    bookId: input.bookId,
    artifactType: visualBibleArtifactType,
    s3Url
  });

  return { visualBible, s3Url };
}

export async function loadVisualStoryBible(bookId: string): Promise<VisualStoryBible | null> {
  try {
    return await getJson<VisualStoryBible>(visualBibleObjectKey(bookId));
  } catch {
    return null;
  }
}

function isSupportingReferenceEntity(entity: VisualEntity): boolean {
  return entity.kind === "supporting_character" && entity.referenceStrategy === "generated_supporting_reference";
}

async function loadCurrentSupportingReferences(
  bookId: string
): Promise<Map<string, { imageId: string; s3Url: string; label: string }>> {
  const rows = await query<SupportingCharacterReferenceRow>(
    `
      SELECT id::text AS image_id, s3_url, input_assets_json::text AS input_assets_json
      FROM images
      WHERE book_id = CAST(:bookId AS uuid)
        AND page_id IS NULL
        AND role = 'supporting_character_reference'
        AND is_current = TRUE
      ORDER BY created_at DESC
    `,
    [{ name: "bookId", value: { stringValue: bookId } }]
  );

  const assets = new Map<string, { imageId: string; s3Url: string; label: string }>();
  for (const row of rows) {
    const inputAssets = safeJsonParse<Record<string, unknown>>(row.input_assets_json ?? "{}", {});
    const entityId = typeof inputAssets.entityId === "string" ? inputAssets.entityId : null;
    const label = typeof inputAssets.entityLabel === "string" ? inputAssets.entityLabel : "";
    if (!entityId || !row.s3_url || assets.has(entityId)) {
      continue;
    }
    assets.set(entityId, {
      imageId: row.image_id,
      s3Url: row.s3_url,
      label
    });
  }

  return assets;
}

async function generateSupportingReference(input: {
  bookId: string;
  entity: VisualEntity;
  mockRunTag?: string | null;
}): Promise<{ imageId: string; s3Url: string }> {
  const provider = await resolveImageProvider({
    mockRunTag: input.mockRunTag,
    source: "supporting_character_reference"
  });
  const prompt = buildSupportingCharacterReferencePrompt(input.entity);
  const generated = await provider.generate(
    {
      bookId: input.bookId,
      pageIndex: input.entity.pageIndices[0] ?? 0,
      prompt,
      role: "supporting_character_reference"
    },
    1
  );

  if (!generated.qa.passed) {
    throw new Error(`Supporting character reference generation failed for ${input.entity.entityId}`);
  }

  const extension = fileExtensionForContentType(generated.contentType);
  const s3Url = await putBuffer(
    `books/${input.bookId}/images/supporting-character-${input.entity.entityId}.${extension}`,
    generated.bytes,
    generated.contentType
  );
  const imageId = await insertCurrentImageRecord({
    bookId: input.bookId,
    role: "supporting_character_reference",
    scopeEntityId: input.entity.entityId,
    endpoint: generated.endpoint,
    prompt,
    seed: generated.seed,
    requestId: generated.requestId,
    width: generated.width,
    height: generated.height,
    s3Url,
    qaJson: {
      ...generated.qa,
      generatedFor: input.entity.entityId
    },
    status: "ready",
    inputAssets: {
      entityId: input.entity.entityId,
      entityLabel: input.entity.label,
      entityKind: input.entity.kind,
      anchors: input.entity.anchors,
      identityAnchors: input.entity.identityAnchors ?? [],
      pageIndices: input.entity.pageIndices,
      sceneIds: input.entity.sceneIds,
      referenceStrategy: input.entity.referenceStrategy
    }
  });

  logStructured("SupportingCharacterReferenceGenerated", {
    bookId: input.bookId,
    entityId: input.entity.entityId,
    label: input.entity.label,
    imageId
  });

  return { imageId, s3Url };
}

export async function ensureSupportingCharacterReferences(input: {
  bookId: string;
  visualBible: VisualStoryBible;
  entityIds: string[];
  mockRunTag?: string | null;
}): Promise<SupportingCharacterReferenceAsset[]> {
  const requestedEntityIds = new Set(input.entityIds);
  const targetEntities = input.visualBible.entities.filter(
    (entity) => requestedEntityIds.has(entity.entityId) && isSupportingReferenceEntity(entity)
  );
  if (targetEntities.length === 0) {
    return [];
  }

  const currentAssets = await loadCurrentSupportingReferences(input.bookId);
  const results: SupportingCharacterReferenceAsset[] = [];

  for (const entity of targetEntities) {
    let current = currentAssets.get(entity.entityId);
    if (!current) {
      const generated = await generateSupportingReference({
        bookId: input.bookId,
        entity,
        mockRunTag: input.mockRunTag
      });
      current = {
        imageId: generated.imageId,
        s3Url: generated.s3Url,
        label: entity.label
      };
      currentAssets.set(entity.entityId, current);
    }

    const url = await presignGetObjectFromS3Url(current.s3Url);
    if (!url) {
      throw new Error(`Unable to presign supporting character reference for ${entity.entityId}`);
    }

    results.push({
      imageId: current.imageId,
      entityId: entity.entityId,
      label: entity.label,
      identityAnchors: entity.identityAnchors ?? [],
      s3Url: current.s3Url,
      url
    });
  }

  return results;
}

export async function prepareRecurringSupportingCharacterReferences(input: {
  bookId: string;
  visualBible: VisualStoryBible;
  mockRunTag?: string | null;
}): Promise<SupportingCharacterReferenceAsset[]> {
  const recurringSupportingEntityIds = input.visualBible.entities
    .filter((entity) => isSupportingReferenceEntity(entity))
    .map((entity) => entity.entityId);

  if (recurringSupportingEntityIds.length === 0) {
    return [];
  }

  return ensureSupportingCharacterReferences({
    bookId: input.bookId,
    visualBible: input.visualBible,
    entityIds: recurringSupportingEntityIds,
    mockRunTag: input.mockRunTag
  });
}
