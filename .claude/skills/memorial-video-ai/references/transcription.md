# Video/Audio Transcription (Gemini)

Source: `website/services/transcriptionService.ts` (`initFFmpeg`, `extractAudioFromVideo`, `transcribeAudio`, `transcribeVideo`).

**Depends on:** `@ffmpeg/ffmpeg` + `@ffmpeg/util` (client-side transcoding, loaded from a CDN at runtime — no server ffmpeg needed for this path) and `@google/genai`. No other project services required — this one is a true leaf capability. `frame-voice-extraction.md` in this same skill folder imports `initFFmpeg` from here rather than reloading FFmpeg itself, so if you port this file, port the singleton loader (`initFFmpeg`) along with it, not just `transcribeAudio`.

## Copy-paste example: transcribe a video file end to end

```ts
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { GoogleGenAI } from '@google/genai';

let ffmpeg: FFmpeg | null = null;

export async function initFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  return ffmpeg;
}

export async function extractAudioFromVideo(videoFile: File, onProgress?: (msg: string) => void): Promise<Blob> {
  const ff = await initFFmpeg(onProgress);
  await ff.writeFile('input_video', await fetchFile(videoFile));
  await ff.exec(['-i', 'input_video', '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k', 'output.mp3']);
  const data = await ff.readFile('output.mp3');
  return new Blob([data], { type: 'audio/mp3' });
}

export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string,
): Promise<{ text: string; language: string }> {
  const ai = new GoogleGenAI({ apiKey });
  const base64Audio = await blobToBase64(audioBlob); // FileReader.readAsDataURL, strip the "data:...base64," prefix

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{
      parts: [
        { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
        { text: `Transcribe this recording verbatim. Mark speaker changes as "Speaker 1:", "Speaker 2:". Use [pause]/[inaudible] where needed. Do not summarize.
Return JSON: {"transcript": "...", "language": "detected language name"}` },
      ],
    }],
    config: { temperature: 0.1 },
  });

  const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return { text: parsed.transcript || response.text, language: parsed.language || 'Unknown' };
  }
  return { text: response.text || '', language: 'Unknown' };
}

// Usage:
// const audio = await extractAudioFromVideo(videoFile);
// if (audio.size / (1024*1024) > 20) throw new Error('Audio too large — trim or chunk first (see memorial-audio-ai)');
// const { text, language } = await transcribeAudio(audio, GEMINI_API_KEY);
```

## Gotchas worth keeping

- **20MB hard limit** on the inline-audio request. `transcribeVideo()` in the source checks this explicitly and throws with a clear message rather than letting Gemini fail with a generic error — keep that check.
- `temperature: 0.1` is deliberate — transcription wants low creativity, unlike narration prompts elsewhere which use 0.4–0.7.
- The prompt asks for verbatim transcription with speaker labels and `[pause]`/`[inaudible]` markers — useful for oral history where filler words and hesitation carry meaning; don't let the model "clean up" the speech.

## When the file is audio-only, not video

Skip `extractAudioFromVideo` and go straight to `transcribeAudio` with the file's blob (converted to MP3 first if it isn't already — see `memorial-audio-ai/references/transcription-chunking.md` for the compress/split helpers for long recordings).
