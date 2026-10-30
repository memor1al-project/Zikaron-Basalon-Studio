# Voice Cloning & Text-to-Speech (ElevenLabs, with Gemini TTS fallback)

Source: `website/services/elevenLabsService.ts`.

**Depends on:** `@elevenlabs/elevenlabs-js` (paid API) for cloning + high-quality TTS; `nameMatchingService.ts`'s `matchesName()` for looking up a cached voice by person name (fuzzy — handles name variants); a voice **sample file** that must already exist on disk (produced by `memorial-video-ai/references/frame-voice-extraction.md`'s `extractVoiceSample`, or a direct audio upload). Consumed by `memorial-text-ai/references/storyline-generation.md` and `podcast-generation.md`, both of which call `textToSpeechWithClonedVoice` rather than talking to ElevenLabs directly.

## Copy-paste example: clone once, cache, reuse

```ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';

export async function cloneVoice(apiKey: string, personName: string, voiceSampleAbsPath: string): Promise<string> {
  const client = new ElevenLabsClient({ apiKey });
  const result = await client.voices.ivc.create({
    files: [fs.createReadStream(voiceSampleAbsPath)],
    name: personName,
    description: `Voice clone of ${personName}`,
  });
  return result.voiceId;
}

export async function generateSpeechElevenLabs(apiKey: string, voiceId: string, text: string): Promise<Buffer> {
  const client = new ElevenLabsClient({ apiKey });
  const audioStream = await client.textToSpeech.convert(voiceId, {
    text,
    modelId: 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
    voiceSettings: { stability: 0.5, similarityBoost: 0.75, speed: 1.0, style: 0 },
  });
  const reader = audioStream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; if (value) chunks.push(value); }
  return Buffer.concat(chunks);
}

/** High-level entry point: clone-if-needed (cached by person+source) then synthesize. */
export async function ensureVoiceCloned(apiKey: string, sourceId: string, personName: string, personId?: string) {
  const cached = getCachedVoiceId(sourceId, personName, personId); // matches by personId first, then matchesName() fallback
  if (cached) return { voiceId: cached.voiceId, alreadyCached: true };

  const sample = findVoiceSample(sourceId, personName); // looks in fixed resources/.../voice-samples/{safeName}_voice_sample.mp3 paths
  if (!sample) throw new Error(`No voice sample found for "${personName}" in source "${sourceId}"`);

  const voiceId = await cloneVoice(apiKey, personName, sample.absolutePath);
  setCachedVoiceId({ voiceId, personName, voiceSamplePath: sample.relativePath, sourceType: sample.sourceType, sourceId, clonedAt: new Date().toISOString() });
  return { voiceId, alreadyCached: false };
}
```

## The cache is what makes this cheap — don't skip it

Cloning is a billed, rate-limited operation. The cache (`resources/elevenlabs-voice-cache.json`, a flat JSON array keyed by `sourceId` + person name/ID) means a person is cloned **once**, ever, and every subsequent narration reuses the same `voiceId`. Any port of this needs the same "check cache → clone only on miss → write to cache" shape; skipping the cache means re-cloning (and re-billing) on every request.

## Fallback when there's no voice sample (Gemini TTS)

When no sample exists yet (e.g. before a video/audio testimony has been uploaded and had a voice clip extracted), the calling code (`storylineService.ts`, `podcastService.ts`) falls back to Gemini's built-in TTS instead of failing outright:

```ts
import { GoogleGenAI, Modality } from '@google/genai';

async function generateSpeechGemini(text: string, apiKey: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });
  // model: 'gemini-2.5-flash-preview-tts', voice: 'Kore', response modality: AUDIO
  // output is raw PCM (24kHz, 16-bit, mono) — must be wrapped in a WAV header before saving/playing, see podcast-generation.md
}
```

Always design a voice-output feature with this two-tier fallback (cloned voice → generic TTS voice) rather than making cloning a hard requirement — a memorial project will often have people with no clean audio sample at all.

## Portability checklist

1. `findVoiceSample`/`getVoiceSamplePath` assume a fixed filesystem layout (`resources/{education|families}/{sourceId}/.../{safeName}_voice_sample.mp3`) — replace with your storage provider, but keep the "one canonical sample path per person" contract other services rely on.
2. `safeName(personName)` = `personName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()` — the same normalization must be used everywhere a person-name-derived filename is written or looked up, or lookups will silently miss. This exact function appears in at least two source files (`elevenLabsService.ts`, `educationVideoExtractionService.ts`) — keep them in sync if you copy it.
3. ElevenLabs voice deletion (`deleteElevenLabsVoice`) exists in the source for cleanup/quota management — don't forget an admin path to remove clones once you add cloning to a new project, or you'll silently accumulate billed voices.
