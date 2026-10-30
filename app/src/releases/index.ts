/**
 * Release notes, one JSON file per release in this folder.
 *
 * Kept in the codebase rather than a changelog somewhere else so a release is described in
 * the same commit that ships it, and so the running app can tell you exactly what it is.
 * To add one: drop `<version>.json` in here with the same shape — nothing else to wire up.
 */

export interface Release {
  /** Semver-ish, and the filename. Sorted numerically, so 0.10.0 lands after 0.9.0. */
  version: string;
  date: string;
  title: string;
  changes: string[];
}

import featuresFile from "./features.json";

// features.json and current.json describe the build, not a release, so they're excluded.
const files = import.meta.glob<Release>("./[0-9]*.json", { eager: true, import: "default" });

function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (right[i] ?? 0) - (left[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Newest first — the order anyone reading "what changed" expects. */
export const releases: Release[] = Object.values(files).sort((a, b) => compareVersions(a.version, b.version));

export const currentVersion: string = releases[0]?.version ?? "0.0.0";

/** Everything the Studio does today, grouped — not a history, the current picture. */
export interface FeatureSection {
  title: string;
  items: string[];
}

export const featureSections: FeatureSection[] = (
  featuresFile as { sections?: FeatureSection[] }
).sections ?? [];
