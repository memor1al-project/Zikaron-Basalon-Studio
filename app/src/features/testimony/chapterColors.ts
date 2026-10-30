/**
 * One colour per chapter, used everywhere that chapter appears — its slice of the
 * progress strip, its row in the chapter list, and the panel for the chapter playing
 * now — so a viewer can match "the orange part" across all three without reading.
 *
 * Fourteen hues because that's the most chapters segmentation will produce
 * (see targetChapterCount in functions/src/services/geminiMaterials.ts): the longest
 * testimony in the set has 12, and none should ever have to reuse a colour.
 */
export const CHAPTER_COLORS = [
  "oklch(60% 0.13 25)",
  "oklch(63% 0.12 55)",
  "oklch(66% 0.11 85)",
  "oklch(62% 0.10 115)",
  "oklch(58% 0.10 145)",
  "oklch(56% 0.08 175)",
  "oklch(58% 0.09 205)",
  "oklch(55% 0.10 240)",
  "oklch(52% 0.11 270)",
  "oklch(55% 0.11 300)",
  "oklch(56% 0.12 325)",
  "oklch(58% 0.12 350)",
  "oklch(48% 0.07 60)",
  "oklch(45% 0.03 250)",
];

export const colorFor = (index: number) => CHAPTER_COLORS[index % CHAPTER_COLORS.length];

