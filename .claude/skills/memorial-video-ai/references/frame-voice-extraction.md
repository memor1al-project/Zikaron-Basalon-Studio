# Frame Extraction, Face Scoring & Voice Sample Extraction

Source: `website/services/videoExtractionService.ts` (client-side, FFmpeg.wasm + face-api.js) and `website/services/educationVideoExtractionService.ts` (server-side, system `ffmpeg` via `execFile`) — same ffmpeg args, two runtimes.

**Depends on:** `transcriptionService.ts`'s `initFFmpeg()` singleton (see [transcription.md](transcription.md) — don't duplicate the FFmpeg loader), `face-api.js` + its model weight files served from `/models`, and — for face *matching* against known people rather than just extraction — `memorial-image-ai/references/face-detection-recognition.md` (`faceRecognitionService.ts`), which is a separate downstream step, not part of this file.

## Copy-paste example: extract frames, find the best face, crop it

```ts
import * as faceapi from 'face-api.js';
import { initFFmpeg } from './transcriptionService'; // see memorial-video-ai/references/transcription.md
import { fetchFile } from '@ffmpeg/util';

let modelsLoaded = false;
async function ensureFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  const MODEL_URL = '/models'; // serve face-api.js weight files from your own public/models
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

export async function extractFramesFromVideo(videoFile: File, intervalSeconds = 5, maxFrames = 20): Promise<Blob[]> {
  const ff = await initFFmpeg();
  await ff.writeFile('input_video', await fetchFile(videoFile));
  await ff.exec(['-i', 'input_video', '-vf', `fps=1/${intervalSeconds}`, '-frames:v', String(maxFrames), '-q:v', '2', '-f', 'image2', 'frame_%03d.jpg']);
  const blobs: Blob[] = [];
  for (let i = 1; i <= maxFrames; i++) {
    try {
      const data = await ff.readFile(`frame_${String(i).padStart(3, '0')}.jpg`);
      blobs.push(new Blob([data], { type: 'image/jpeg' }));
    } catch { break; } // no more frames
  }
  return blobs;
}

/** Pick the single best face across all frames: largest area × highest detector confidence. */
export async function detectBestFace(frameBlobs: Blob[]) {
  await ensureFaceModels();
  let bestFace: { frameIndex: number; box: any; descriptor: Float32Array; score: number } | null = null;
  let bestScore = 0;
  for (let i = 0; i < frameBlobs.length; i++) {
    const img = await loadImage(URL.createObjectURL(frameBlobs[i]));
    const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();
    for (const d of detections) {
      const box = d.detection.box;
      const combined = box.width * box.height * d.detection.score;
      if (combined > bestScore) {
        bestScore = combined;
        bestFace = { frameIndex: i, box, descriptor: d.descriptor, score: d.detection.score };
      }
    }
  }
  return bestFace;
}
```

## Voice sample extraction (client-side, FFmpeg.wasm)

```ts
export async function extractVoiceSample(mediaFile: File, startSeconds = 10, durationSeconds = 45): Promise<Blob> {
  const ff = await initFFmpeg();
  const inputName = 'voice_input' + (mediaFile.name.endsWith('.mp3') ? '.mp3' : '.mp4');
  await ff.writeFile(inputName, await fetchFile(mediaFile));
  await ff.exec(['-i', inputName, '-ss', String(startSeconds), '-t', String(durationSeconds), '-vn', '-acodec', 'libmp3lame', '-ar', '22050', '-ac', '1', '-b:a', '128k', '-f', 'mp3', 'voice_sample.mp3']);
  return new Blob([await ff.readFile('voice_sample.mp3')], { type: 'audio/mp3' });
}
```

## Server-side equivalent (Node, system ffmpeg — same flags, no browser needed)

```ts
import { execFile } from 'child_process';

export function extractFramesServerSide(videoPath: string, outputDir: string, intervalSeconds = 5, maxFrames = 20): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const args = ['-i', videoPath, '-vf', `fps=1/${intervalSeconds}`, '-frames:v', String(maxFrames), '-q:v', '2', '-f', 'image2', `${outputDir}/frame_%03d.jpg`];
    execFile('ffmpeg', args, { timeout: 120000 }, (error, _stdout, stderr) => {
      if (error) return reject(new Error(`ffmpeg failed: ${stderr || error.message}`));
      resolve(/* fs.readdirSync(outputDir).filter/sort/map as in source */ []);
    });
  });
}
```

## Why these exact numbers

- `fps=1/5, maxFrames=20` → samples ~100 seconds of a testimony video, enough to find one clear face without processing the whole file.
- Voice sample: `22050Hz mono 128kbps MP3`, 45s starting at 10s in — long enough for a good voice clone (ElevenLabs IVC), short enough to keep the sample file small; starting at 10s skips the usual "testing, testing" / setup noise at a recording's start.
- Face scoring is `area × confidence`, not confidence alone — a small, distant face can have high detector confidence but is a bad crop source. Multiply, don't just threshold.

## Cropping the chosen face (circular, saturation-boosted PNG)

See `videoExtractionService.ts:extractFaceImageFromElement` in the source for the canvas-based circular-crop + saturation-boost routine (pads the bounding box by 30px, clips to a circle, boosts saturation 1.2×). Copy verbatim if you want the same "memorial portrait" look; it's ~40 lines of canvas 2D code with no external deps.
