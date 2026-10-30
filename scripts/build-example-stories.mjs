#!/usr/bin/env node
/**
 * Back-engineers each example testimony into a Collection Wizard story.
 *
 * Families using the wizard face a blank form and a set of questions they've never been
 * asked before. This produces a worked example for every example testimony: the same
 * questions, answered from a real recording, with each answer linked to the chapters it
 * came from — so the story page and the video stay tied together.
 *
 * It reuses the chapters and cues that scripts/segment-testimony-videos.mjs already wrote,
 * so it needs NO video, NO ffmpeg and NO re-transcription: the cue text is the transcript.
 * Run it after that script; it costs one Gemini call per testimony.
 *
 * The questions come from app/src/features/collection/storySections.json — the same file the
 * wizard renders — so a worked example can never answer a question the wizard doesn't ask.
 *
 * Input:  app/src/features/testimony/exampleChapters/<videoId>.json + cues/<videoId>.json
 * Output: app/src/features/testimony/exampleChapters/stories/<videoId>.json
 *
 * Usage:
 *   node scripts/build-example-stories.mjs                   # every testimony without a story yet
 *   node scripts/build-example-stories.mjs --only qs58RTZfVdY
 *   node scripts/build-example-stories.mjs --force           # redo ones already done
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHAPTERS_DIR = path.join(ROOT, "app/src/features/testimony/exampleChapters");
const CUES_DIR = path.join(CHAPTERS_DIR, "cues");
const STORIES_DIR = path.join(CHAPTERS_DIR, "stories");
const TEMPLATE_PATH = path.join(ROOT, "app/src/features/collection/storySections.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const ONLY = value("--only");
const FORCE = flag("--force");

const ENV_FILES = ["functions/.env.local", "functions/.env", "app/.env.local"];

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const rel of ENV_FILES) {
    const envPath = path.join(ROOT, rel);
    if (!fs.existsSync(envPath)) continue;
    const match = fs.readFileSync(envPath, "utf8").match(/^\s*(?:VITE_)?GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`GEMINI_API_KEY not found — set it, or put it in ${ENV_FILES.join(" or ")}`);
}

/** Rebuilds functions/dist when a source file is newer than the compiled output. */
function loadGeminiService() {
  const distFile = path.join(ROOT, "functions/dist/services/geminiMaterials.js");
  const srcFile = path.join(ROOT, "functions/src/services/geminiMaterials.ts");
  const stale = !fs.existsSync(distFile) || fs.statSync(srcFile).mtimeMs > fs.statSync(distFile).mtimeMs;
  if (stale) {
    console.log("Building functions/ (compiled AI service is out of date) ...");
    execFileSync("npm", ["--prefix", path.join(ROOT, "functions"), "run", "build"], { stdio: "inherit" });
  }
  return createRequire(import.meta.url)(distFile);
}

/** Same transient-error retry as the segmentation script — a dropped connection isn't a real failure. */
async function withRetry(label, fn, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = String(error?.message ?? error);
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|network|503|502|429/i.test(message);
      if (!transient || attempt >= attempts) throw error;
      const waitMs = 2000 * 2 ** (attempt - 1);
      process.stdout.write(`[${label} failed, retry ${attempt}/${attempts - 1} in ${waitMs / 1000}s] `);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function buildStory(gemini, template, videoId) {
  const chapters = JSON.parse(fs.readFileSync(path.join(CHAPTERS_DIR, `${videoId}.json`), "utf8"));
  const cuesPath = path.join(CUES_DIR, `${videoId}.json`);
  if (!fs.existsSync(cuesPath)) throw new Error("no cues file — re-run segment-testimony-videos.mjs");

  // The cue text IS the transcript, already sentence-split and in order.
  const cues = JSON.parse(fs.readFileSync(cuesPath, "utf8")).cues ?? [];
  const transcript = cues.map((c) => c.text).join(" ").trim();
  if (!transcript) throw new Error("cues file has no text");

  console.log(`\n[${videoId}] ${chapters.title}`);
  process.stdout.write(`    ${chapters.segments.length} chapters, ${cues.length} cues — building story ... `);

  const story = await withRetry("story", () =>
    gemini.backEngineerStory({
      transcript,
      segments: chapters.segments,
      template,
      language: chapters.language,
    })
  );

  const answered = story.sections.flatMap((s) => s.answers).filter((a) => a.answer);
  const total = story.sections.flatMap((s) => s.answers).length;
  console.log(`${answered.length}/${total} questions answered, ${story.events.length} events`);

  fs.writeFileSync(
    path.join(STORIES_DIR, `${videoId}.json`),
    JSON.stringify({ videoId, title: chapters.title, generatedAt: new Date().toISOString(), ...story }, null, 2) + "\n"
  );

  for (const section of story.sections) {
    const filled = section.answers.filter((a) => a.answer).length;
    console.log(`      ${section.title}: ${filled}/${section.answers.length}`);
  }
}

async function main() {
  process.env.GEMINI_API_KEY = loadApiKey();
  const gemini = loadGeminiService();
  fs.mkdirSync(STORIES_DIR, { recursive: true });

  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, "utf8")).map((section) => ({
    key: section.key,
    slug: section.slug,
    title: section.title,
    fields: section.fields.map((f) => ({ key: f.key, label: f.label })),
  }));

  const videoIds = fs
    .readdirSync(CHAPTERS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("._"))
    .map((f) => f.replace(/\.json$/, ""));

  const queue = [];
  const skipped = [];
  for (const videoId of videoIds) {
    if (ONLY && videoId !== ONLY) continue;
    if (!FORCE && fs.existsSync(path.join(STORIES_DIR, `${videoId}.json`))) {
      skipped.push(`${videoId} — already has a story (use --force to redo)`);
      continue;
    }
    queue.push(videoId);
  }

  console.log(`${queue.length} testimony/ies to process, ${skipped.length} skipped.`);
  skipped.forEach((s) => console.log(`  skip: ${s}`));

  const failures = [];
  for (const videoId of queue) {
    try {
      await buildStory(gemini, template, videoId);
    } catch (error) {
      console.error(`    FAILED: ${error.message}`);
      failures.push(`${videoId}: ${error.message}`);
    }
  }

  console.log(`\nDone. ${queue.length - failures.length}/${queue.length} succeeded.`);
  if (failures.length) {
    console.log("Failures:");
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
