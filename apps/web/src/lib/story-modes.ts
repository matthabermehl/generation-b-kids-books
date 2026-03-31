import type { StoryMode } from "@book/domain";

export const storyModeOptions: Array<{
  value: StoryMode;
  label: string;
  helperText: string;
}> = [
  {
    value: "sound_money_implicit",
    label: "Sound money only",
    helperText: "No Bitcoin mention. The story teaches the money lesson through the child's problem alone."
  },
  {
    value: "bitcoin_reveal_8020",
    label: "Late Bitcoin reveal",
    helperText: "Most of the story sets up the problem first, then Bitcoin arrives late as the warm solution."
  },
  {
    value: "bitcoin_forward",
    label: "Bitcoin forward",
    helperText: "Bitcoin appears early in grown-up framing while the child's concrete problem stays primary."
  }
];

export function getStoryModeLabel(mode: StoryMode): string {
  return storyModeOptions.find((option) => option.value === mode)?.label ?? mode;
}

export function getStoryModeHelperText(mode: StoryMode): string {
  return storyModeOptions.find((option) => option.value === mode)?.helperText ?? "";
}
