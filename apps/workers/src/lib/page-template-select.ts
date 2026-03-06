import {
  selectPageComposition,
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
