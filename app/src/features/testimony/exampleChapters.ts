import type { ExampleStoryFile, TestimonyChaptersFile, TestimonyCue } from "./types";

/**
 * The chapter data generated for the example stories by
 * `node scripts/segment-testimony-videos.mjs`.
 *
 * Chapters are small and load with the page. Subtitle cues are a separate lazy import —
 * a 45-minute testimony's sentence list is far too heavy to ship to every visitor when
 * most of them will never turn captions on.
 */

const chapterFiles = import.meta.glob<TestimonyChaptersFile>("./exampleChapters/*.json", {
  eager: true,
  import: "default",
});

const cueFiles = import.meta.glob<{ cues: TestimonyCue[] }>("./exampleChapters/cues/*.json", {
  import: "default",
});

const storyFiles = import.meta.glob<ExampleStoryFile>("./exampleChapters/stories/*.json", {
  eager: true,
  import: "default",
});

function idFromPath(filePath: string): string {
  return filePath.split("/").pop()!.replace(/\.json$/, "");
}

const byVideoId = new Map<string, TestimonyChaptersFile>(
  Object.entries(chapterFiles).map(([filePath, data]) => [idFromPath(filePath), data])
);

const cueLoaderByVideoId = new Map<string, () => Promise<{ cues: TestimonyCue[] }>>(
  Object.entries(cueFiles).map(([filePath, load]) => [idFromPath(filePath), load])
);

/** Chapters for a YouTube video id, or null if this one hasn't been processed yet. */
export function chaptersForVideo(videoId: string): TestimonyChaptersFile | null {
  return byVideoId.get(videoId) ?? null;
}

/** A lazy subtitle loader for a video, or undefined when no cues were generated. */
export function cueLoaderForVideo(videoId: string): (() => Promise<TestimonyCue[]>) | undefined {
  const load = cueLoaderByVideoId.get(videoId);
  if (!load) return undefined;
  return () => load().then((data) => data.cues ?? []);
}

const storyByVideoId = new Map<string, ExampleStoryFile>(
  Object.entries(storyFiles).map(([filePath, data]) => [idFromPath(filePath), data])
);

/** The wizard-shaped worked example for a video, or null if it hasn't been built yet. */
export function storyForVideo(videoId: string): ExampleStoryFile | null {
  return storyByVideoId.get(videoId) ?? null;
}

/** How many example stories currently have chapters — used to explain an empty gallery state. */
export function chapteredVideoCount(): number {
  return byVideoId.size;
}
