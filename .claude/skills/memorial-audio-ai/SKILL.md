---
name: memorial-audio-ai
description: Reference for AI audio processing in oral-history/memorial projects — transcribing audio testimony to text, compressing/chunking long recordings to fit model limits, and cloning a person's voice for text-to-speech narration. Use when building or adapting a feature that transcribes an audio file, needs to split a long recording before sending it to a model, or narrates generated text in a specific person's voice. Every pattern here is copied from working code in the sibling `website` Firebase project (Zikaron BaSalon) — check the referenced files there before assuming an API has changed.
---

# Audio AI Services

Two capability groups: get text out of audio, and get audio (in a specific voice) out of text.

## Capabilities

| Capability | Reference | Core technique |
|---|---|---|
| Transcribe | [references/transcription-chunking.md](references/transcription-chunking.md) | Gemini `generateContent` with `inlineData` audio (mp3), JSON response `{transcript, language}` |
| Compress / chunk | [references/transcription-chunking.md](references/transcription-chunking.md) | FFmpeg.wasm: mono 16kHz 64kbps MP3 for speech; `-ss/-t` loop to split into N-second chunks when still too large |
| Voice cloning + TTS | [references/voice-cloning-tts.md](references/voice-cloning-tts.md) | ElevenLabs IVC (instant voice clone) from a sample file, cached by person+source; Gemini TTS as a fallback when no sample exists |

## Composition note

No standalone audio summarizer exists — transcribe first (this skill), then summarize the transcript with `memorial-text-ai`'s `summarize-entities.md`. Same reasoning as the video skill: two small composable steps beat one hidden mega-prompt.

## Size-limit gotcha (real bug this code works around)

Gemini's inline-audio request has a practical size ceiling. The working code checks `audioBlob.size / (1024*1024) > 20` and throws before sending — it does **not** silently truncate. Any new implementation should keep an explicit size check with a clear error message rather than letting the API call fail with an opaque 400.

## Portability checklist

1. Voice cloning needs an actual voice **sample file** on disk first (`findVoiceSample` looks in fixed `resources/.../audio/voice-samples/{safeName}_voice_sample.mp3` paths) — in a new project, this becomes: user uploads a sample → your storage provider → pass the resolved path/buffer to `cloneVoice`.
2. The voice-ID cache (`elevenlabs-voice-cache.json`) is a flat JSON file keyed by `sourceId` + person name/ID — fine for a single-server prototype, but move to a real datastore before concurrent writers exist.
3. `ElevenLabsClient` from `@elevenlabs/elevenlabs-js` requires a paid API key; Gemini TTS (`gemini-2.5-flash-preview-tts`, voice `Kore`) is the free-tier-friendly fallback used elsewhere in this codebase (see `storyline-generation.md` and `podcast-generation.md` in `memorial-text-ai`).
