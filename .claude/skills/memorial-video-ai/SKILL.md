---
name: memorial-video-ai
description: Reference for AI video processing in oral-history/memorial projects — transcribing testimony videos, segmenting frames and voice samples for face/voice extraction, and animating a still photo into a talking video (image-to-video). Use when building or adapting a feature that needs to transcribe a video, pull a face image or voice clip out of one, or generate a talking-photo/avatar video. Every pattern here is copied from working code in the sibling `website` Firebase project (Zikaron BaSalon), not invented — check the referenced files there before assuming an API has changed.
---

# Video AI Services

Three independent capabilities, each usable on its own. All are Node/browser TypeScript; none of the source paths below carry over automatically to a new project — re-point the constants marked `resources/...` at whatever storage layer that project uses.

## Capabilities

| Capability | Reference | Core technique |
|---|---|---|
| Transcribe (voice-to-text) | [references/transcription.md](references/transcription.md) | FFmpeg.wasm extracts audio client-side → Gemini `generateContent` with `inlineData` audio → JSON `{transcript, language}` |
| Segment (frames + voice sample) | [references/frame-voice-extraction.md](references/frame-voice-extraction.md) | FFmpeg `-vf fps=1/N` for frames, `-ss/-t` trim for a voice clip; face-api.js scores frames to pick the best face |
| Animate (photo → talking video) | [references/talking-photo-animation.md](references/talking-photo-animation.md) | Provider-factory pattern: HeyGen (talking-photo API) or Gemini Veo, selected by env var |

## Composition note

There is no dedicated video summarizer. The working pattern is **transcribe → hand the transcript to a text-summarization skill** (see the `memorial-text-ai` skill's `summarize-entities.md`) rather than sending raw video/audio to a summarization prompt. Don't build a shortcut unless a concrete product step needs one call.

## Shared dependencies

- `@ffmpeg/ffmpeg` + `@ffmpeg/util` — client-side transcoding (loaded lazily from CDN, see `initFFmpeg` in transcription.md)
- `@google/genai` — Gemini SDK, used for both transcription and Veo animation
- `face-api.js` — face detection/descriptors, browser-side (needs model files served at `/models`)
- System `ffmpeg` binary — for the server-side frame/voice extraction variant (`execFile('ffmpeg', ...)`)

## Portability checklist

1. Swap any `resources/families/{name}/...` or `process.cwd()`-relative path for your project's storage abstraction (Drive, S3, local FS provider — whatever `getStorageProvider()` equivalent exists).
2. Gemini/HeyGen/ElevenLabs API keys are read from `process.env.*` — replace with your own secrets mechanism, but keep the same fallback-chain shape (`VITE_X_API_KEY || X_API_KEY`) if both client and server builds need the key.
3. The face-api.js model files (`ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet`) must be hosted at a public URL the browser can fetch — copy them into the new project's `public/models`.
