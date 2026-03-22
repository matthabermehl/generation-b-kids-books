import type {
  PageArtVisualGuidance,
  StoryPackage,
  VisualCountConstraint,
  VisualEntity,
  VisualIdentityAnchor,
  VisualPageContract,
  VisualStateConstraint,
  VisualStoryBible
} from "./types.js";
import { watercolorStyleGuide } from "./image-prompts.js";

const numberWords = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
  ["twenty", 20]
]);

const ignoredCapitalizedWords = new Set([
  "Bitcoin",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
]);

const supportingRolePatterns = [
  /grandma/gi,
  /grandpa/gi,
  /teacher/gi,
  /coach/gi,
  /friend/gi,
  /neighbor/gi,
  /cashier/gi,
  /shopkeeper/gi,
  /clerk/gi,
  /brother/gi,
  /sister/gi
];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function uniqueIdentityAnchors(values: VisualIdentityAnchor[]): VisualIdentityAnchor[] {
  const seen = new Set<string>();
  const result: VisualIdentityAnchor[] = [];
  for (const anchor of values) {
    const key = `${anchor.trait}::${anchor.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(anchor);
  }
  return result;
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function singularize(label: string): string {
  const trimmed = normalizeSpace(label.toLowerCase());
  if (trimmed.endsWith("ies")) {
    return `${trimmed.slice(0, -3)}y`;
  }
  if (trimmed.endsWith("s") && !trimmed.endsWith("ss")) {
    return trimmed.slice(0, -1);
  }
  return trimmed;
}

function normalizeEntityLabel(label: string): string {
  return singularize(label.replace(/\b(the|a|an)\b/gi, ""));
}

function parseNumberToken(raw: string): number | null {
  const lowered = raw.toLowerCase();
  if (/^\d+$/.test(lowered)) {
    return Number(lowered);
  }
  return numberWords.get(lowered) ?? null;
}

function sentenceFragments(text: string): string[] {
  return text
    .split(/[.,;!?]/)
    .map((part) => normalizeSpace(part))
    .filter(Boolean);
}

export function extractExactCountConstraints(text: string): Array<{ label: string; quantity: number; sourceText: string }> {
  const results: Array<{ label: string; quantity: number; sourceText: string }> = [];
  const fragments = sentenceFragments(text);

  for (const fragment of fragments) {
    const match = fragment.match(
      /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+([a-z][a-z-]*)(?:\s+(?!by\b|in\b|on\b|at\b|with\b|near\b|beside\b|next\b|into\b|from\b|for\b|to\b|under\b|over\b)([a-z][a-z-]*))?\b/i
    );
    if (!match) {
      continue;
    }

    const quantity = parseNumberToken(match[1]);
    if (quantity === null) {
      continue;
    }

    const rawLabel = normalizeEntityLabel([match[2], match[3]].filter(Boolean).join(" "));
    if (rawLabel.length === 0) {
      continue;
    }

    results.push({
      label: rawLabel,
      quantity,
      sourceText: fragment
    });
  }

  return results;
}

export function extractStateConstraints(text: string): Array<{ label: string; state: string; sourceText: string }> {
  const results: Array<{ label: string; state: string; sourceText: string }> = [];
  const fragments = sentenceFragments(text);

  for (const fragment of fragments) {
    const normalized = fragment.toLowerCase();
    const trailingState = normalized.match(
      /\b((?:the|a|an)\s+)?([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,1})\s+(is|are)\s+(empty|full|open|closed)\b/
    );
    if (trailingState) {
      results.push({
        label: normalizeEntityLabel([trailingState[1], trailingState[2]].filter(Boolean).join(" ")),
        state: trailingState[4],
        sourceText: fragment
      });
      continue;
    }

    const directState = normalized.match(/\b(empty|full|open|closed)\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,1})\b/);
    if (directState) {
      results.push({
        label: normalizeEntityLabel(directState[2]),
        state: directState[1],
        sourceText: fragment
      });
    }
  }

  return results;
}

export function extractSceneAnchors(sceneVisualDescription: string): string[] {
  return unique(
    sceneVisualDescription
      .split(/\bwith\b|,|\band\b/gi)
      .map((part) => normalizeSpace(part.toLowerCase().replace(/[.!?]+$/g, "")))
      .filter((part) => part.length >= 3)
      .filter((part) => part.split(" ").length <= 6)
  ).slice(0, 6);
}

function findCapitalizedNames(text: string, childFirstName: string, caregiverLabel: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+\b/g) ?? [];
  return unique(
    matches.filter((token) => {
      if (ignoredCapitalizedWords.has(token)) {
        return false;
      }
      if (token === childFirstName || token === caregiverLabel) {
        return false;
      }
      return true;
    })
  );
}

function supportingCharacterCandidates(text: string, childFirstName: string, caregiverLabel: string): string[] {
  const candidates: string[] = [];
  if (text.includes(caregiverLabel)) {
    candidates.push(caregiverLabel);
  }

  for (const pattern of supportingRolePatterns) {
    const matches = text.match(pattern) ?? [];
    matches.forEach((match) => candidates.push(normalizeSpace(match.toLowerCase())));
  }

  findCapitalizedNames(text, childFirstName, caregiverLabel).forEach((name) => candidates.push(name));
  return unique(candidates);
}

function supportingCharacterDescription(label: string, caregiverLabel: string): string {
  const lowered = label.toLowerCase();
  if (label === caregiverLabel) {
    return `${label} is the child's calm caregiver, drawn as the same adult across every page with gentle expression and practical everyday clothes.`;
  }
  if (lowered === "teacher") {
    return "The teacher is a warm adult with classroom-ready clothes and a calm, encouraging expression.";
  }
  if (lowered === "coach") {
    return "The coach is a friendly adult with simple sporty clothes and a steady, encouraging presence.";
  }
  if (lowered === "cashier" || lowered === "shopkeeper" || lowered === "clerk") {
    return "The shop helper is a friendly adult with simple store clothes and consistent face, hair, and colors.";
  }
  if (lowered === "friend") {
    return "The friend is another child with a consistent face, hair, outfit colors, and proportions across pages.";
  }
  return `${label} is a recurring supporting character who should keep the same face, hair, outfit colors, and proportions whenever they appear.`;
}

function buildMainCharacterIdentityAnchors(childFirstName: string): VisualIdentityAnchor[] {
  return [
    {
      trait: "reference",
      value: `Use the approved ${childFirstName} reference as the source of truth for face, hair, skin tone, outfit palette, and proportions.`
    }
  ];
}

function buildSupportingCharacterIdentityAnchors(label: string, caregiverLabel: string): VisualIdentityAnchor[] {
  const lowered = label.toLowerCase();

  if (label === caregiverLabel) {
    return [
      { trait: "role", value: "same calm caregiver adult across every page" },
      { trait: "features", value: "same face shape, hair, and overall proportions whenever this caregiver appears" },
      { trait: "expression", value: "gentle, reassuring expression" },
      { trait: "wardrobe", value: "practical everyday clothes with a consistent outfit palette" }
    ];
  }

  if (lowered === "teacher") {
    return [
      { trait: "role", value: "same warm classroom teacher whenever this adult appears" },
      { trait: "features", value: "consistent face, hair, and adult proportions" },
      { trait: "wardrobe", value: "classroom-ready clothes with a stable palette and silhouette" }
    ];
  }

  if (lowered === "coach") {
    return [
      { trait: "role", value: "same friendly coach whenever this adult appears" },
      { trait: "features", value: "consistent face, hair, and adult proportions" },
      { trait: "wardrobe", value: "simple sporty clothes with a consistent palette and silhouette" }
    ];
  }

  if (lowered === "friend") {
    return [
      { trait: "role", value: "same child friend whenever they reappear" },
      { trait: "features", value: "consistent child face, hair, and proportions" },
      { trait: "wardrobe", value: "stable outfit colors and recognizable silhouette" }
    ];
  }

  if (lowered === "cashier" || lowered === "shopkeeper" || lowered === "clerk") {
    return [
      { trait: "role", value: "same friendly shop helper whenever this adult reappears" },
      { trait: "features", value: "consistent face, hair, and adult proportions" },
      { trait: "wardrobe", value: "simple store clothes with stable colors and silhouette" }
    ];
  }

  return [
    { trait: "identity", value: `${label} should read as the same recurring person whenever they appear` },
    { trait: "features", value: "keep the same face shape, hair, and overall proportions across pages" },
    { trait: "wardrobe", value: "keep a consistent outfit palette and recognizable silhouette" }
  ];
}

function renderIdentityAnchors(identityAnchors: VisualIdentityAnchor[] | undefined): string | null {
  if (!identityAnchors || identityAnchors.length === 0) {
    return null;
  }

  return identityAnchors.map((anchor) => `${anchor.trait}: ${anchor.value}`).join("; ");
}

function ensureEntity(
  entities: Map<string, VisualEntity>,
  entity: VisualEntity
): VisualEntity {
  const existing = entities.get(entity.entityId);
  if (existing) {
    existing.pageIndices = unique([...existing.pageIndices, ...entity.pageIndices]).sort((left, right) => left - right);
    existing.sceneIds = unique([...existing.sceneIds, ...entity.sceneIds]).sort();
    existing.anchors = unique([...existing.anchors, ...entity.anchors]).slice(0, 8);
    existing.identityAnchors = uniqueIdentityAnchors([...(existing.identityAnchors ?? []), ...(entity.identityAnchors ?? [])]);
    if (!existing.description && entity.description) {
      existing.description = entity.description;
    }
    return existing;
  }

  entities.set(entity.entityId, {
    ...entity,
    pageIndices: [...entity.pageIndices].sort((left, right) => left - right),
    sceneIds: [...entity.sceneIds].sort()
  });
  return entities.get(entity.entityId) as VisualEntity;
}

function propLabelFromSource(source: string): string {
  return normalizeEntityLabel(source);
}

function propEntityFromLabel(label: string, pageIndex: number, sceneId: string): VisualEntity {
  const normalized = propLabelFromSource(label);
  return {
    entityId: `prop_${slugify(normalized)}`,
    kind: "prop",
    label: normalized,
    description: `Keep the ${normalized} visually recognizable and consistent whenever it matters to the story.`,
    anchors: [normalized],
    identityAnchors: [],
    pageIndices: [pageIndex],
    sceneIds: [sceneId],
    importance: "story_critical",
    recurring: false,
    referenceStrategy: "prompt_only"
  };
}

export function buildVisualStoryBible(input: {
  bookId: string;
  title: string;
  childFirstName: string;
  story: StoryPackage;
  generatedAt?: string;
}): VisualStoryBible {
  const entities = new Map<string, VisualEntity>();
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  ensureEntity(entities, {
    entityId: "main_character",
    kind: "main_character",
    label: input.childFirstName,
    description: `Use the approved ${input.childFirstName} character reference for face, hair, outfit colors, and proportions.`,
    anchors: [input.childFirstName.toLowerCase()],
    identityAnchors: buildMainCharacterIdentityAnchors(input.childFirstName),
    pageIndices: input.story.pages.map((page) => page.pageIndex),
    sceneIds: input.story.pages.map((page) => page.sceneId),
    importance: "story_critical",
    recurring: true,
    referenceStrategy: "approved_character"
  });

  const storyCriticalPropLabels = unique([
    input.story.concept.targetItem,
    input.story.concept.temptation,
    ...input.story.concept.requiredSetups,
    ...input.story.concept.requiredPayoffs
  ])
    .map((label) => propLabelFromSource(label))
    .filter(Boolean);

  const pageContracts: VisualPageContract[] = input.story.pages.map((page) => {
    const pageText = `${page.pageText} ${page.illustrationBrief}`;
    const exactCountConstraints = extractExactCountConstraints(pageText);
    const stateConstraints = extractStateConstraints(pageText);
    const characterMentions = unique(
      supportingCharacterCandidates(page.pageText, input.childFirstName, input.story.concept.caregiverLabel).concat(
        supportingCharacterCandidates(page.illustrationBrief, input.childFirstName, input.story.concept.caregiverLabel)
      )
    );
    const settingEntityId = `setting_${slugify(page.sceneId)}`;
    const settingAnchors = extractSceneAnchors(page.sceneVisualDescription);

    ensureEntity(entities, {
      entityId: settingEntityId,
      kind: "setting",
      label: page.sceneId,
      description: page.sceneVisualDescription,
      anchors: settingAnchors,
      identityAnchors: [],
      pageIndices: [page.pageIndex],
      sceneIds: [page.sceneId],
      importance: "story_critical",
      recurring: true,
      referenceStrategy: "scene_anchor"
    });

    const requiredCharacterIds = ["main_character"];
    const supportingCharacterIds: string[] = [];

    for (const label of characterMentions) {
      const entityId = `supporting_character_${slugify(label)}`;
      const entity = ensureEntity(entities, {
        entityId,
        kind: "supporting_character",
        label,
        description: supportingCharacterDescription(label, input.story.concept.caregiverLabel),
        anchors: [label.toLowerCase()],
        identityAnchors: buildSupportingCharacterIdentityAnchors(label, input.story.concept.caregiverLabel),
        pageIndices: [page.pageIndex],
        sceneIds: [page.sceneId],
        importance: label === input.story.concept.caregiverLabel ? "story_critical" : "supporting",
        recurring: false,
        referenceStrategy: "prompt_only"
      });

      if (entity.label === input.story.concept.caregiverLabel || entity.pageIndices.length >= 2) {
        entity.recurring = true;
        entity.importance = "story_critical";
        entity.referenceStrategy = "generated_supporting_reference";
      }

      if (entity.importance === "story_critical") {
        requiredCharacterIds.push(entity.entityId);
        supportingCharacterIds.push(entity.entityId);
      }
    }

    const requiredPropIds: string[] = [];
    const allCountConstraints: VisualCountConstraint[] = exactCountConstraints.map((constraint) => {
      const entity = ensureEntity(entities, propEntityFromLabel(constraint.label, page.pageIndex, page.sceneId));
      return {
        entityId: entity.entityId,
        label: entity.label,
        quantity: constraint.quantity,
        sourceText: constraint.sourceText
      };
    });

    const allStateConstraints: VisualStateConstraint[] = stateConstraints.map((constraint) => {
      const entity = ensureEntity(entities, propEntityFromLabel(constraint.label, page.pageIndex, page.sceneId));
      return {
        entityId: entity.entityId,
        label: entity.label,
        state: constraint.state,
        sourceText: constraint.sourceText
      };
    });

    for (const label of storyCriticalPropLabels) {
      if (pageText.toLowerCase().includes(label.toLowerCase())) {
        const entity = ensureEntity(entities, propEntityFromLabel(label, page.pageIndex, page.sceneId));
        requiredPropIds.push(entity.entityId);
      }
    }

    allCountConstraints.forEach((constraint) => requiredPropIds.push(constraint.entityId));
    allStateConstraints.forEach((constraint) => requiredPropIds.push(constraint.entityId));

    return {
      pageIndex: page.pageIndex,
      sceneId: page.sceneId,
      settingEntityId,
      requiredCharacterIds: unique(requiredCharacterIds),
      supportingCharacterIds: unique(supportingCharacterIds),
      requiredPropIds: unique(requiredPropIds),
      exactCountConstraints: allCountConstraints,
      stateConstraints: allStateConstraints,
      settingAnchors,
      continuityNotes: unique([
        page.sceneVisualDescription,
        page.illustrationBrief
      ]),
      mustNotShow: allCountConstraints.map(
        (constraint) => `more than ${constraint.quantity} ${constraint.label}${constraint.quantity === 1 ? "" : "s"}`
      )
    };
  });

  for (const entity of entities.values()) {
    if (
      entity.kind === "supporting_character" &&
      (entity.pageIndices.length >= 2 || entity.label === input.story.concept.caregiverLabel)
    ) {
      entity.recurring = true;
      entity.importance = "story_critical";
      entity.referenceStrategy = "generated_supporting_reference";
    }
  }

  return {
    bookId: input.bookId,
    title: input.title,
    childFirstName: input.childFirstName,
    generatedAt,
    entities: Array.from(entities.values()).sort((left, right) => {
      if (left.kind === right.kind) {
        return left.label.localeCompare(right.label);
      }
      return left.kind.localeCompare(right.kind);
    }),
    pages: pageContracts.sort((left, right) => left.pageIndex - right.pageIndex)
  };
}

export function buildPageArtVisualGuidance(
  visualBible: VisualStoryBible,
  pageContract: VisualPageContract
): PageArtVisualGuidance {
  const entityById = new Map(visualBible.entities.map((entity) => [entity.entityId, entity]));
  const mustShow = pageContract.requiredCharacterIds
    .map((entityId) => entityById.get(entityId))
    .filter((entity): entity is VisualEntity => Boolean(entity))
    .map((entity) => {
      const identityAnchorSummary = renderIdentityAnchors(entity.identityAnchors);
      return identityAnchorSummary
        ? `${entity.label}: ${entity.description} Locked identity anchors: ${identityAnchorSummary}.`
        : `${entity.label}: ${entity.description}`;
    })
    .concat(
      pageContract.requiredPropIds
        .map((entityId) => entityById.get(entityId))
        .filter((entity): entity is VisualEntity => Boolean(entity))
        .map((entity) => `${entity.label}: ${entity.description}`)
    );

  const mustMatch = pageContract.stateConstraints
    .map((constraint) => `${constraint.label} is ${constraint.state}`)
    .concat(
      pageContract.requiredCharacterIds
        .map((entityId) => entityById.get(entityId))
        .filter((entity): entity is VisualEntity => Boolean(entity))
        .flatMap((entity) =>
          (entity.identityAnchors ?? []).map((anchor) => `${entity.label} ${anchor.trait}: ${anchor.value}`)
        )
    );
  const showExactly = pageContract.exactCountConstraints.map(
    (constraint) => `${constraint.quantity} ${constraint.label}${constraint.quantity === 1 ? "" : "s"}`
  );

  return {
    mustShow: unique(mustShow),
    mustMatch: unique(mustMatch),
    showExactly: unique(showExactly),
    mustNotShow: unique(pageContract.mustNotShow),
    settingAnchors: unique(pageContract.settingAnchors),
    continuityNotes: unique(pageContract.continuityNotes)
  };
}

export function buildSupportingCharacterReferencePrompt(entity: VisualEntity): string {
  const identityAnchors = entity.identityAnchors ?? [];

  return [
    "Character:",
    `${entity.label}. ${entity.description}`,
    "",
    "Anchors:",
    entity.anchors.join(", ") || entity.label,
    "",
    ...(identityAnchors.length > 0
      ? [
          "Locked identity anchors:",
          ...identityAnchors.map((anchor) => `- ${anchor.trait}: ${anchor.value}`),
          ""
        ]
      : []),
    "Style:",
    watercolorStyleGuide,
    "",
    "Composition:",
    "Create one full-body supporting character portrait on bright white paper with generous breathing room.",
    "",
    "Constraints:",
    "Keep the same visible identity anchors, face, hair, outfit palette, and proportions whenever this character reappears later in the book.",
    "Keep the background plain white or a minimal wash.",
    "No text, no logos, no frame, and no extra props unless directly required by the description."
  ].join("\n");
}
