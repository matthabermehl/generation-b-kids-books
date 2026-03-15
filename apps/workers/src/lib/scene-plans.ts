import type {
  BeatSheet,
  ImagePlanArtifact,
  ImagePlanPage,
  ScenePlanArtifact,
  StoryPage
} from "@book/domain";

interface PersistedStoryPage extends StoryPage {
  id: string;
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

export function buildScenePlanArtifact(input: {
  bookId: string;
  title: string;
  beatSheet: BeatSheet;
  pages: StoryPage[];
  generatedAt: string;
}): ScenePlanArtifact {
  const scenes = new Map<
    string,
    {
      sceneId: string;
      sceneVisualDescription: string;
      beatIndices: number[];
      pageIndices: number[];
    }
  >();

  const ensureScene = (sceneId: string, sceneVisualDescription: string) => {
    const existing = scenes.get(sceneId);
    if (existing) {
      if (!existing.sceneVisualDescription && sceneVisualDescription) {
        existing.sceneVisualDescription = sceneVisualDescription;
      }
      return existing;
    }

    const created = {
      sceneId,
      sceneVisualDescription,
      beatIndices: [],
      pageIndices: []
    };
    scenes.set(sceneId, created);
    return created;
  };

  input.beatSheet.beats.forEach((beat, beatIndex) => {
    ensureScene(beat.sceneId, beat.sceneVisualDescription).beatIndices.push(beatIndex);
  });

  input.pages.forEach((page) => {
    ensureScene(page.sceneId, page.sceneVisualDescription).pageIndices.push(page.pageIndex);
  });

  return {
    bookId: input.bookId,
    title: input.title,
    generatedAt: input.generatedAt,
    scenes: Array.from(scenes.values())
      .map((scene) => ({
        sceneId: scene.sceneId,
        sceneVisualDescription: scene.sceneVisualDescription,
        beatIndices: uniqueSorted(scene.beatIndices),
        pageIndices: uniqueSorted(scene.pageIndices)
      }))
      .sort((left, right) => {
        const leftAnchor = left.pageIndices[0] ?? left.beatIndices[0] ?? 0;
        const rightAnchor = right.pageIndices[0] ?? right.beatIndices[0] ?? 0;
        return leftAnchor - rightAnchor;
      })
  };
}

export function buildImagePlanArtifact(input: {
  bookId: string;
  title: string;
  pages: PersistedStoryPage[];
  generatedAt: string;
}): ImagePlanArtifact {
  const priorByScene = new Map<string, string[]>();
  const sortedPages = [...input.pages].sort((left, right) => left.pageIndex - right.pageIndex);

  const pages: ImagePlanPage[] = sortedPages.map((page) => {
    const priorSameScenePageIds = [...(priorByScene.get(page.sceneId) ?? [])].slice(-2);
    const existing = priorByScene.get(page.sceneId) ?? [];
    priorByScene.set(page.sceneId, [...existing, page.id]);

    return {
      pageId: page.id,
      pageIndex: page.pageIndex,
      sceneId: page.sceneId,
      sceneVisualDescription: page.sceneVisualDescription,
      priorSameScenePageIds,
      pageArtPromptInputs: {
        pageText: page.pageText,
        illustrationBrief: page.illustrationBrief,
        sceneVisualDescription: page.sceneVisualDescription
      }
    };
  });

  return {
    bookId: input.bookId,
    title: input.title,
    generatedAt: input.generatedAt,
    pages
  };
}
