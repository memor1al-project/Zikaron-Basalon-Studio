# Long-Form Narrated Podcast Generation (Person Data → Script → WAV)

Source: `website/services/podcastService.ts`.

**Depends on:** `person-knowledge-aggregation.md` (`getPersonSummary`) and `memorial-events-map-ai/references/timeline-index.md` (`getTimelineFilesForPerson`) to build the context text; `@google/genai` for both script writing and TTS. Unlike `storyline-generation.md`, this pipeline uses **Gemini TTS only** — no ElevenLabs cloned-voice branch — because it's meant to work with zero setup (single narrator voice, `'Kore'`) even for people with no voice sample.

## The pipeline

```
getPersonSummary() + getTimelineFilesForPerson()
        │
        ▼
buildPodcastContext()      — turns structured data into prose "source data" for the prompt
        │
        ▼
generatePodcastScript()    — Gemini, single documentary-style narration, no stage directions
        │
        ▼
splitIntoChunks()          — sentence-boundary-aware, ≤4000 chars per chunk
        │
        ▼
generateTtsChunk() × N     — Gemini TTS, raw PCM per chunk, with ~0.5s silence stitched between chunks
        │
        ▼
pcmToWavBuffer()           — wrap concatenated PCM in a WAV header → save
```

## Script generation prompt (the load-bearing part)

```ts
const prompt = `You are a professional podcast script writer for a memorial project that preserves family history.
Write a podcast narration script about ${focus}.

IMPORTANT RULES:
- Write the script in ${languageName}
- Target length: ${targetWordCount} words   // "600-800" for SHORT, "1200-1500" for STANDARD
- Write ONLY the narration text — no stage directions, no [PAUSE], no speaker labels
- Use a warm, respectful, documentary-style narrative voice
- Start with a brief, engaging introduction of the person
- Tell their story chronologically, weaving in family relationships, historical context, and personal details
- End with a reflective closing that honors their memory and legacy
- Be factual — only include information present in the source data below
- If information is limited, focus on what IS known and the historical context of their era

SOURCE DATA:
${sourceData}`; // config: { temperature: 0.7 } — higher than extraction tasks, this is narrative writing
```

**"Be factual — only include information present in the source data" + "if information is limited, focus on what IS known"** are the two lines doing the most work here: they stop Gemini from inventing biographical detail to fill gaps, which is exactly the failure mode a memorial project can't tolerate. Keep both instructions verbatim in any adaptation.

## Chunking + WAV wrapping (copy-paste, no external audio library needed)

```ts
function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/); // split at sentence boundaries, not mid-sentence
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += (currentChunk ? ' ' : '') + sentence;
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks;
}

async function generateTtsChunk(text: string, apiKey: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text }] }],
    config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error('Gemini TTS returned no audio data');
  return Buffer.from(base64Audio, 'base64'); // raw PCM: 24kHz, 16-bit, mono
}

/** Gemini TTS returns raw PCM, not a playable file — this is the entire WAV-header-writing logic, ~30 lines, zero deps. */
function pcmToWavBuffer(pcmData: Buffer): Buffer {
  const SAMPLE_RATE = 24000, BITS = 16, CHANNELS = 1;
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS / 8);
  const blockAlign = CHANNELS * (BITS / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(44 - 8 + pcmData.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22); header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28); header.writeUInt16LE(blockAlign, 32); header.writeUInt16LE(BITS, 34);
  header.write('data', 36); header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

async function generatePodcastAudio(script: string, apiKey: string): Promise<Buffer> {
  const chunks = splitIntoChunks(script, 4000);
  const pcmBuffers: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    pcmBuffers.push(await generateTtsChunk(chunks[i], apiKey));
    if (i < chunks.length - 1) pcmBuffers.push(Buffer.alloc(Math.floor(SAMPLE_RATE * CHANNELS * (BITS / 8) * 0.5))); // ~0.5s silence between chunks
  }
  return pcmToWavBuffer(Buffer.concat(pcmBuffers));
}
```

## Portability checklist

1. This is the reusable recipe for **any** Gemini-TTS-to-playable-audio need, not just podcasts — the chunk/TTS/WAV-wrap sequence is identical to what `storyline-generation.md`'s Gemini-TTS fallback does; if you extract it once into a shared `geminiTts.ts`, both callers can share it.
2. `LANGUAGE_NAMES` maps locale codes (`en-US`, `he-IL`, `pl-PL`, `de-DE`, `fr-FR`) to prompt-friendly language names — extend this map rather than passing a raw locale code into the prompt, since "write in he-IL" is a worse instruction than "write in Hebrew."
3. `gemini-3-pro-preview` is used for the script (long-form narrative quality), `gemini-2.5-flash-preview-tts` for audio — two different Gemini models in one pipeline, matched to task, not one model for everything.
