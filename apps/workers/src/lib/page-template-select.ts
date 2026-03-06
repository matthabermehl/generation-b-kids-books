import {
  compositionForTemplate,
  selectPageComposition,
  selectAlternatePageTemplate,
  type PageCompositionSpec,
  type PageTemplateId,
  type PictureBookReadingProfile
} from "@book/domain";

export function selectPictureBookComposition(input: {
  bookId: string;
  pageIndex: number;
  text: string;
  readingProfileId: PictureBookReadingProfile;
  previousTemplateId?: PageTemplateId | null;
}): PageCompositionSpec {
  return selectPageComposition(input);
}

export function selectAlternatePictureBookComposition(input: {
  text: string;
  currentTemplateId: PageTemplateId;
  readingProfileId: PictureBookReadingProfile;
}): PageCompositionSpec | null {
  const alternateTemplateId = selectAlternatePageTemplate({
    currentTemplateId: input.currentTemplateId,
    readingProfileId: input.readingProfileId,
    text: input.text
  });

  if (!alternateTemplateId) {
    return null;
  }

  return compositionForTemplate(alternateTemplateId, input.readingProfileId);
}
