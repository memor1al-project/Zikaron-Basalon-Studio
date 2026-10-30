#!/usr/bin/env node
/**
 * Builds the chapter data behind the Testimony Navigator.
 *
 * For each example testimony video it extracts the audio, transcribes it with
 * sentence-level timestamps, and asks Gemini to divide it into navigable chapters —
 * so an elderly viewer gets a list of named parts they can tap instead of dragging a
 * scrub bar through a 45-minute recording.
 *
 * The AI itself is NOT reimplemented here: this requires the same compiled
 * `functions/src/services/geminiMaterials.ts` the live /api/materials routes use, so
 * the prompts stay in one place. The script builds `functions/` if `dist/` is stale.
 *
 * Input:  resources/stories/Example Stories/*.mp4  (matched to a YouTube id by the
 *         "[videoId]" suffix in the filename) plus app/src/features/presentation/exampleTestimonies.json
 * Output: app/src/features/testimony/exampleChapters/<videoId>.json       (chapters — bundled)
 *         app/src/features/testimony/exampleChapters/cues/<videoId>.json  (subtitles — lazy-loaded)
 *
 * Requires `ffmpeg` + `ffprobe` on PATH and GEMINI_API_KEY (read from app/.env.local if not exported).
 *
 * Usage:
 *   node scripts/segment-testimony-videos.mjs                 # every video that has no chapters yet
 *   node scripts/segment-testimony-videos.mjs --only qs58RTZfVdY
 *   node scripts/segment-testimony-videos.mjs --force         # redo ones already done
 *   node scripts/segment-testimony-videos.mjs --max-minutes 5 # only short videos (cheap smoke test)
 *   node scripts/segment-testimony-videos.mjs --dry-run      # match + extract audio, no AI calls, no cost
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_DIR = path.join(ROOT, "resources/stories/Example Stories");
const TESTIMONY_JSON = path.join(ROOT, "app/src/features/presentation/exampleTestimonies.json");
const OUT_DIR = path.join(ROOT, "app/src/features/testimony/exampleChapters");
const CUES_DIR = path.join(OUT_DIR, "cues");

/** 10 min of 64kbps mono MP3 is ~4.8MB — comfortably inside Gemini's ~20MB inline-audio ceiling. */
const CHUNK_SECONDS = 600;

/* ── args ── */

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

const ONLY = value("--only");
const DRY_RUN = flag("--dry-run");
const FORCE = flag("--force");
const MAX_MINUTES = value("--max-minutes") ? Number(value("--max-minutes")) : null;

/* ── setup ── */

const ENV_FILES = ["functions/.env.local", "functions/.env", "app/.env.local"];

function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const rel of ENV_FILES) {
    const envPath = path.join(ROOT, rel);
    if (!fs.existsSync(envPath)) continue;
    // Skip commented-out lines — app/.env.local mentions the key in a comment.
    const match = fs.readFileSync(envPath, "utf8").match(/^\s*(?:VITE_)?GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(
    `GEMINI_API_KEY not found. Set it one of these ways:\n` +
      `  - export GEMINI_API_KEY=...\n` +
      `  - put GEMINI_API_KEY=... in ${ENV_FILES.join(" or ")}\n` +
      `  - GEMINI_API_KEY=$(firebase functions:secrets:access GEMINI_API_KEY) node scripts/segment-testimony-videos.mjs`
  );
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

/* ── ffmpeg ── */

function probeDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" }
  );
  return Number(out.trim());
}

/**
 * Extracts the audio as 64kbps mono 16kHz MP3 chunks — the same speech-optimized
 * settings the in-browser pipeline uses (app/src/features/collection/transcriptionService.ts),
 * just with system ffmpeg, which handles hour-long files far better than ffmpeg.wasm.
 */
function extractAudioChunks(videoFile, workDir) {
  const pattern = path.join(workDir, "chunk_%03d.mp3");
  execFileSync(
    "ffmpeg",
    [
      "-v", "error", "-i", videoFile,
      "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k",
      "-f", "segment", "-segment_time", String(CHUNK_SECONDS), "-reset_timestamps", "1",
      pattern,
    ],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  return fs
    .readdirSync(workDir)
    .filter((f) => f.startsWith("chunk_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => path.join(workDir, f));
}

/* ── per-video pipeline ── */

/**
 * Retries a Gemini call through transient transport errors.
 *
 * "fetch failed" (a dropped connection, not an API rejection) turned up sporadically
 * across a 13-video batch and cost whole videos that were otherwise fine. API errors —
 * a bad key, a retired model, a rejected schema — are not retried: they will never
 * succeed on a second attempt and the failure should surface immediately.
 */
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

async function transcribeWithTimestamps(gemini, videoFile, workDir) {
  const chunks = extractAudioChunks(videoFile, workDir);
  const cues = [];
  const parts = [];
  let language = "Unknown";

  // Offsets accumulate from each chunk's MEASURED length: ffmpeg's segmenter cuts on frame
  // boundaries, so assuming an exact CHUNK_SECONDS per chunk would slide later cues out of sync.
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    process.stdout.write(`    transcribing part ${i + 1}/${chunks.length} ... `);
    const chunkDuration = probeDuration(chunks[i]);
    const base64 = fs.readFileSync(chunks[i]).toString("base64");
    const result = await withRetry("transcribe", () => gemini.transcribeAudioClip(base64, true, chunkDuration));

    // Cue times come back relative to the chunk — shift them onto the full recording's clock.
    for (const cue of result.cues ?? []) {
      cues.push({
        start: Number(cue.start) + offset,
        end: Number(cue.end) + offset,
        text: String(cue.text ?? "").trim(),
      });
    }
    offset += chunkDuration;
    parts.push(result.transcript ?? "");
    if (result.language && result.language !== "Unknown") language = result.language;
    console.log(`${result.cues?.length ?? 0} cues`);
  }

  const cleaned = cues
    .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .sort((a, b) => a.start - b.start);

  return { transcript: parts.join("\n\n").trim(), cues: cleaned, language };
}

async function processVideo(gemini, video, videoFile) {
  const outFile = path.join(OUT_DIR, `${video.id}.json`);
  const duration = probeDuration(videoFile);
  console.log(`\n[${video.id}] ${video.title}`);
  console.log(`    ${Math.round(duration)}s — ${path.basename(videoFile)}`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `testimony-${video.id}-`));
  try {
    if (DRY_RUN) {
      const chunks = extractAudioChunks(videoFile, workDir);
      const totalMb = chunks.reduce((sum, c) => sum + fs.statSync(c).size, 0) / (1024 * 1024);
      console.log(`    dry run: ${chunks.length} audio chunk(s), ${totalMb.toFixed(1)}MB total — no AI calls made`);
      return;
    }

    const { transcript, cues, language } = await transcribeWithTimestamps(gemini, videoFile, workDir);
    if (!transcript) throw new Error("transcription came back empty");

    process.stdout.write("    finding chapters ... ");
    const chapters = await withRetry("segment", () =>
      gemini.segmentTestimony({ transcript, cues, durationSeconds: duration, language })
    );
    console.log(`${chapters.segments.length} chapters (${chapters.language}, ${chapters.dir})`);

    fs.writeFileSync(
      outFile,
      JSON.stringify(
        {
          videoId: video.id,
          title: video.title,
          durationSeconds: Math.round(duration),
          language: chapters.language,
          dir: chapters.dir,
          generatedAt: new Date().toISOString(),
          segments: chapters.segments,
        },
        null,
        2
      ) + "\n"
    );

    // Subtitles live in their own directory: the navigator only fetches them when the viewer
    // turns captions on, so a 45-minute testimony's cues never weigh down the bundle.
    fs.writeFileSync(
      path.join(CUES_DIR, `${video.id}.json`),
      JSON.stringify({ videoId: video.id, dir: chapters.dir, cues }, null, 2) + "\n"
    );

    chapters.segments.forEach((s, i) => console.log(`      ${i + 1}. ${fmt(s.startTime)}  ${s.title}`));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── main ── */

async function main() {
  // A dry run proves the video matching and the ffmpeg half without spending a single AI call.
  const gemini = DRY_RUN ? null : (((process.env.GEMINI_API_KEY = loadApiKey()), loadGeminiService()));
  fs.mkdirSync(CUES_DIR, { recursive: true });

  const testimonies = JSON.parse(fs.readFileSync(TESTIMONY_JSON, "utf8"));
  const files = fs.existsSync(VIDEO_DIR)
    ? fs.readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".mp4") && !f.startsWith("._"))
    : [];

  // Downloaded filenames end in "[videoId].mp4" — that suffix is the join key back to the JSON.
  const byId = new Map();
  for (const f of files) {
    const match = f.match(/\[([A-Za-z0-9_-]{11})\]\.mp4$/);
    if (match) byId.set(match[1], path.join(VIDEO_DIR, f));
  }

  const queue = [];
  const skipped = [];
  for (const video of testimonies) {
    if (ONLY && video.id !== ONLY) continue;
    if (!byId.has(video.id)) {
      skipped.push(`${video.id} — no local mp4 in "${path.basename(VIDEO_DIR)}"`);
      continue;
    }
    if (!FORCE && fs.existsSync(path.join(OUT_DIR, `${video.id}.json`))) {
      skipped.push(`${video.id} — already has chapters (use --force to redo)`);
      continue;
    }
    if (MAX_MINUTES && (video.durationSeconds ?? 0) > MAX_MINUTES * 60) {
      skipped.push(`${video.id} — longer than --max-minutes ${MAX_MINUTES}`);
      continue;
    }
    queue.push([video, byId.get(video.id)]);
  }

  console.log(`${queue.length} video(s) to process, ${skipped.length} skipped.`);
  skipped.forEach((s) => console.log(`  skip: ${s}`));

  const failures = [];
  for (const [video, file] of queue) {
    try {
      await processVideo(gemini, video, file);
    } catch (error) {
      // One bad video shouldn't abandon the rest of a long batch.
      console.error(`    FAILED: ${error.message}`);
      failures.push(`${video.id}: ${error.message}`);
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
