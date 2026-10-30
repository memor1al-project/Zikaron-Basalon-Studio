import type { StorySectionKey } from "./interviewService";
import sections from "./storySections.json";

export interface StoryField {
  key: string;
  label: string;
  placeholder: string;
}

export interface StorySectionConfig {
  key: StorySectionKey;
  slug: string;
  title: string;
  intro: string;
  fields: StoryField[];
}

/**
 * Reworded from Zikaron BaSalon's own Speakers Kit guided-interview outline.
 *
 * The questions live in storySections.json rather than here because
 * scripts/build-example-stories.mjs asks Gemini to answer these exact questions from a
 * real testimony. A plain JSON file is the one thing both the wizard and a Node script
 * can read, so the worked examples can't drift away from the questions the wizard asks.
 */
export const storySections = sections as StorySectionConfig[];

export function sectionBySlug(slug: string | undefined): StorySectionConfig | undefined {
  return storySections.find((s) => s.slug === slug);
}
