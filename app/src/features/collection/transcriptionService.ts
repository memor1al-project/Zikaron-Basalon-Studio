import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import { transcribeAudioClip, type MaterialTranscript, type TestimonyCue } from "./materialsAiService";
import type { ProviderFile } from "../../lib/storage/types";

const MAX_INLINE_AUDIO_BYTES = 20 * 1024 * 1024; // Gemini's inline-audio request ceiling
const CHUNK_DURATION_SECONDS = 300; // ~5 min per chunk when a recording is too long to fit in one call

/**
 * Hard ceiling on what may be sent for transcription.
 *
 * Cost, not capability. Anything longer is split into five-minute chunks below, one
 * billed Gemini call each, so a 45-minute testimony quietly becomes nine requests — the
 * bill grows with the recording while the click that caused it looks identical. Fifteen
 * minutes fits in a single call at the compressed bitrate, which makes the cost of
 * pressing the button predictable.
 *
 * This caps *transcription only*. A long recording is still perfectly good material to
 * collect, tag, and attach to a story event — it just can't be sent to the model whole.
 */
export const MAX_TRANSCRIBE_SECONDS = 15 * 60;

/** Everything here is encoded at this rate, so bytes convert back to seconds reliably. */
const COMPRESSED_BITS_PER_SECOND = 64 * 1024;

export class RecordingTooLongError extends Error {
  // Declared and assigned rather than a constructor parameter property: the app builds
  // with erasableSyntaxOnly, which allows only type syntax that vanishes at compile time.
  readonly seconds: number;

  constructor(seconds: number) {
    super(
      `This recording is ${formatDuration(seconds)} long. Transcription is limited to ${
        MAX_TRANSCRIBE_SECONDS / 60
      } minutes to keep costs predictable — trim it, or split it into shorter parts first.`
    );
    this.seconds = seconds;
    this.name = "RecordingTooLongError";
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, "0")}s` : `${secs}s`;
}

/** Duration of the original file, read from metadata alone — no decoding, no ffmpeg. */
export function readMediaDuration(url: string, isVideo: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(isVideo ? "video" : "audio");
    element.preload = "metadata";
    element.onloadedmetadata = () => {
      const { duration } = element;
      element.removeAttribute("src");
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("Could not read the recording's length"));
    };
    element.onerror = () => reject(new Error("Could not read the recording's length"));
    element.src = url;
  });
}

let ffmpeg: FFmpeg | null = null;

/** ff.readFile() returns Uint8Array<ArrayBufferLike>, which TS won't accept as a Blob part as-is. */
function toBlob(data: Awaited<ReturnType<FFmpeg["readFile"]>>, type: string): Blob {
  return new Blob([data as BlobPart], { type });
}

/** Loads the FFmpeg.wasm core (idempotent, from CDN — no server ffmpeg needed). */
async function initFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  onProgress?.("Loading audio engine...");
  ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return ffmpeg;
}

/** Extracts the audio track from a video as a compressed (64kbps mono 16kHz) MP3. */
async function extractAudioFromVideo(source: string, onProgress?: (msg: string) => void): Promise<Blob> {
  const ff = await initFFmpeg(onProgress);
  onProgress?.("Extracting audio from video...");
  await ff.writeFile("input_video", await fetchFile(source));
  await ff.exec(["-i", "input_video", "-vn", "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k", "output.mp3"]);
  const data = await ff.readFile("output.mp3");
  await Promise.all([safeDelete(ff, "input_video"), safeDelete(ff, "output.mp3")]);
  return toBlob(data, "audio/mp3");
}

/** Compresses an audio file to 64kbps mono 16kHz MP3 — optimized for speech recognition, not listening quality. */
async function compressAudioFile(source: string, ext: string, onProgress?: (msg: string) => void): Promise<Blob> {
  const ff = await initFFmpeg(onProgress);
  onProgress?.("Compressing audio...");
  const inputName = `input.${ext}`;
  await ff.writeFile(inputName, await fetchFile(source));
  await ff.exec(["-i", inputName, "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-f", "mp3", "output.mp3"]);
  const data = await ff.readFile("output.mp3");
  await Promise.all([safeDelete(ff, inputName), safeDelete(ff, "output.mp3")]);
  return toBlob(data, "audio/mp3");
}

/** Splits a (already-referenced) source into fixed-length MP3 chunks — naive time-slices, may cut mid-sentence. */
async function splitAudioIntoChunks(
  source: string,
  ext: string,
  totalDuration: number,
  chunkDurationSeconds: number,
  onProgress?: (msg: string) => void
): Promise<Blob[]> {
  const ff = await initFFmpeg(onProgress);
  const inputName = `input.${ext}`;
  await ff.writeFile(inputName, await fetchFile(source));

  const numChunks = Math.max(1, Math.ceil(totalDuration / chunkDurationSeconds));
  const chunks: Blob[] = [];
  for (let i = 0; i < numChunks; i++) {
    onProgress?.(`Splitting audio (${i + 1}/${numChunks})...`);
    const outputFileName = `chunk_${i}.mp3`;
    await ff.exec([
      "-i", inputName,
      "-ss", String(i * chunkDurationSeconds),
      "-t", String(chunkDurationSeconds),
      "-acodec", "libmp3lame", "-ar", "16000", "-ac", "1", "-b:a", "64k", "-f", "mp3",
      outputFileName,
    ]);
    chunks.push(toBlob(await ff.readFile(outputFileName), "audio/mp3"));
    await safeDelete(ff, outputFileName);
  }
  await safeDelete(ff, inputName);
  return chunks;
}

async function safeDelete(ff: FFmpeg, name: string): Promise<void> {
  try {
    await ff.deleteFile(name);
  } catch {
    // already gone — fine
  }
}

/** Reads audio duration via a browser <audio> element — browser-only, matches the ffmpeg.wasm approach. */
function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const url = URL.createObjectURL(blob);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio duration"));
    };
    audio.src = url;
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function transcribeCompressedAudio(
  compressed: Blob,
  originalExt: string,
  originalSource: string,
  withTimestamps: boolean,
  onProgress?: (msg: string) => void
): Promise<MaterialTranscript> {
  // Backstop for files whose metadata wouldn't parse. We produced this encode ourselves at
  // a known bitrate, so its size is a dependable measure of how long it runs.
  const encodedSeconds = (compressed.size * 8) / COMPRESSED_BITS_PER_SECOND;
  if (encodedSeconds > MAX_TRANSCRIBE_SECONDS) {
    throw new RecordingTooLongError(encodedSeconds);
  }

  if (compressed.size <= MAX_INLINE_AUDIO_BYTES) {
    onProgress?.("Transcribing...");
    return transcribeAudioClip(await blobToBase64(compressed), withTimestamps);
  }

  // Still too large after compression (a genuinely long recording) — chunk and join.
  onProgress?.("Recording is long — splitting into chunks...");
  const totalDuration = await getAudioDuration(compressed).catch(
    () => compressed.size / ((64 * 1024) / 8) // rough fallback estimate at 64kbps
  );
  const chunks = await splitAudioIntoChunks(originalSource, originalExt, totalDuration, CHUNK_DURATION_SECONDS, onProgress);

  const transcripts: string[] = [];
  const cues: TestimonyCue[] = [];
  let language = "Unknown";
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(`Transcribing part ${i + 1}/${chunks.length}...`);
    const result = await transcribeAudioClip(await blobToBase64(chunks[i]), withTimestamps);
    transcripts.push(`[--- part ${i + 1} ---]\n${result.transcript}`);
    // Cue times come back relative to the chunk — shift them onto the full recording's clock.
    const offset = i * CHUNK_DURATION_SECONDS;
    for (const cue of result.cues ?? []) {
      cues.push({ start: cue.start + offset, end: cue.end + offset, text: cue.text });
    }
    if (result.language && result.language !== "Unknown") language = result.language;
  }
  return { transcript: transcripts.join("\n\n"), language, ...(cues.length ? { cues } : {}) };
}

/**
 * Full pipeline: get the file's audio (extracting from video if needed), compress,
 * transcribe (chunking if too long).
 *
 * `withTimestamps` additionally returns sentence-level cues timed against the original
 * recording — what the Testimony Navigator needs to place chapter boundaries accurately.
 */
export async function transcribeMaterial(
  file: ProviderFile,
  onProgress?: (msg: string) => void,
  options: { withTimestamps?: boolean } = {}
): Promise<MaterialTranscript> {
  const withTimestamps = options.withTimestamps ?? false;
  const isVideo = file.mimeType.startsWith("video/");
  const source = await getObjectUrlFor(file);

  // Checked before any ffmpeg work: extracting audio from a 45-minute video costs the
  // user minutes of their own CPU before we'd otherwise discover we won't send it.
  // A file whose metadata won't parse falls through to the post-compression check below,
  // rather than blocking material that is probably fine.
  const declaredDuration = await readMediaDuration(source, isVideo).catch(() => null);
  if (declaredDuration !== null && declaredDuration > MAX_TRANSCRIBE_SECONDS) {
    throw new RecordingTooLongError(declaredDuration);
  }
  // ffmpeg's demuxer detects the real container from content, not this extension — it's only
  // used to name the chunking fallback's input file, so any original-file-derived value is fine.
  const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "mp3");

  if (isVideo) {
    const audio = await extractAudioFromVideo(source, onProgress);
    // extractAudioFromVideo already compresses to 64kbps mono 16kHz — no separate compress step needed.
    // If chunking is still needed, it re-reads the original video (`source`), not this extracted audio.
    return transcribeCompressedAudio(audio, ext, source, withTimestamps, onProgress);
  }

  const compressed = await compressAudioFile(source, ext, onProgress);
  return transcribeCompressedAudio(compressed, ext, source, withTimestamps, onProgress);
}
