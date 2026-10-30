#!/usr/bin/env node
/**
 * Collects testimony videos from Zikaron BaSalon's official YouTube channel
 * (https://www.youtube.com/@zikaronbasalon, confirmed via the channel's own
 * description text matching the org's mission statement) and writes a static
 * JSON file consumed by the Presentation Wizard's example-stories gallery.
 *
 * Only public metadata (title, video ID, duration, thumbnail URL) is collected —
 * no video content is downloaded. Requires `yt-dlp` on PATH.
 *
 * Usage: node scripts/collect-testimony-videos.mjs
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CHANNEL_URL = "https://www.youtube.com/@zikaronbasalon/videos";
// The channel listing doesn't repeat a per-video channel name field — it's always this channel.
const CHANNEL_NAME = "זיכרון בסלון";
const OUTPUT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app/src/features/presentation/exampleTestimonies.json"
);

const MIN_DURATION_SECONDS = 90;

// Title must match one of these to be considered testimony content.
const INCLUDE_PATTERNS = [/עדות/, /שורד/, /ניצול/, /סיפור(ה|ו) של/, /fighting to remember/i, /survivor/i];

// Title matching one of these is excluded even if it also matches an include
// pattern (e.g. "סרטוני היכרות: עדות" is a demo/explainer clip, not real testimony).
const EXCLUDE_PATTERNS = [
  /איך נרשמים/,
  /איך להרשם/,
  /הרשמה של/,
  /ערכת אירוח/,
  /פסקול שלישי/,
  /פאנל/,
  /מפגש עם פרופ/,
  /סרטון הדרכה/,
  /תוכן משמעותי/,
  /טיקטוק/,
  /פודקאסט/,
  /הדרכה לדור שני/,
  /מסורת ישראלית/,
  /מה זה זיכרון בסלון/,
  /סרטוני היכרות/,
  /case study/i,
];

// Specific video IDs to exclude regardless of title/keyword match — for one-off manual
// corrections (e.g. a video that matched the keyword filter but isn't real testimony).
const EXCLUDED_IDS = new Set([
  "VI597DAZIlU", // "Fighting to Remember- case study" — campaign explainer, not a testimony
]);

function isTestimony(video) {
  if (EXCLUDED_IDS.has(video.id)) return false;
  const title = video.title ?? "";
  if (EXCLUDE_PATTERNS.some((re) => re.test(title))) return false;
  return INCLUDE_PATTERNS.some((re) => re.test(title));
}

function fetchChannelVideos() {
  const raw = execFileSync("yt-dlp", ["--dump-json", "--flat-playlist", CHANNEL_URL], {
    maxBuffer: 32 * 1024 * 1024,
    encoding: "utf8",
  });
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function main() {
  console.log(`Fetching video list from ${CHANNEL_URL} ...`);
  const videos = fetchChannelVideos();
  console.log(`Found ${videos.length} videos on the channel.`);

  const testimonies = videos
    .filter((v) => (v.duration ?? 0) >= MIN_DURATION_SECONDS && isTestimony(v))
    .map((v) => ({
      id: v.id,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      durationSeconds: v.duration ?? null,
      channel: CHANNEL_NAME,
    }));

  writeFileSync(OUTPUT_PATH, JSON.stringify(testimonies, null, 2) + "\n");
  console.log(`Wrote ${testimonies.length} testimony videos to ${OUTPUT_PATH}`);
  console.log("\nTitles included:");
  testimonies.forEach((t) => console.log(`  - [${t.id}] ${t.title}`));

  const skippedLongNameOnly = videos.filter(
    (v) => (v.duration ?? 0) >= 300 && !isTestimony(v) && !EXCLUDE_PATTERNS.some((re) => re.test(v.title ?? "")) && !EXCLUDED_IDS.has(v.id)
  );
  if (skippedLongNameOnly.length) {
    console.log(
      "\nNote: these long videos didn't match the title keyword filter (often a bare person's name) " +
        "and were left out — check manually and add to the JSON if they're testimony:"
    );
    skippedLongNameOnly.forEach((v) => console.log(`  - [${v.id}] ${v.title} (${v.duration}s)`));
  }
}

main();
