# Narrated Storyline Generation (Events → Narration → Voice → Matched Media)

Source: `website/services/storylineService.ts`.

**Depends on — this is a genuine multi-service pipeline, not a leaf capability:**
- `timeline-extraction.md` — supplies the `NarrationEvent[]` input (a user-selected subset of a person's `TimelineEntry[]`)
- `memorial-audio-ai/references/voice-cloning-tts.md` (`textToSpeechWithClonedVoice`, `findVoiceSample`) — primary voice path
- Gemini TTS as fallback when no cloned voice exists (see that same reference file's fallback section)
- `nameMatchingService.ts`'s `matchesName()` — fuzzy-matches event places/people against media metadata

## The four-stage pipeline

```
Selected Events (NarrationEvent[])
        │
        ▼
1. generateEventNarration()   — Gemini writes 2-3 paragraphs per event, in narrative continuity with the previous one
        │
        ▼
2. generateEventAudio()       — cloned voice (ElevenLabs) first, Gemini TTS fallback
        │
        ▼
3. matchMediaToEvent()        — scan existing photos/videos, attach ones matching the event's place + year
        │
        ▼
4. saveStoryline()             — persist StorylineData to disk (or your data store)
```

## Stage 1 — narration with continuity

```ts
export async function generateEventNarration(event: NarrationEvent, personName: string, previousContext: string, apiKey: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You are a family history narrator creating an immersive storyline about ${personName}'s life.
Generate a vivid narration (2-3 paragraphs) for this event. Write in third person, past tense.
Maintain narrative continuity with the previous event context.

EVENT: ${event.date} — ${event.title}
${event.description || event.story || ''}
People: ${event.people?.join(', ') || 'Unknown'}   Locations: ${event.places?.join(', ') || 'Unknown'}

${previousContext ? `PREVIOUS STORYLINE CONTEXT:\n${previousContext}\n` : 'This is the first event.'}

Write a compelling narrative that brings this moment to life, honors the memory of those involved, and is historically respectful and factually grounded. Write only the narration, no meta-commentary.`;
  const result = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
  return result.text || '';
}
```

**Feed each event's generated narration as the next event's `previousContext`** — that's what makes the sequence read as one continuous story instead of N disconnected paragraphs. This is the single most important detail to preserve when porting.

## Stage 3 — matching existing media to a generated event (fuzzy place + year matching)

```ts
function matchesMediaToEvent(meta: { location?: string; year?: string; date?: string; era?: string }, eventPlaces: string[], eventYear: number | null): boolean {
  const locationMatch = meta.location && eventPlaces.some(place => matchesName(place, meta.location!, { useVariants: true }));
  const metaYear = meta.year ? parseInt(meta.year) : (meta.date ? extractYear(meta.date) : null);
  const yearMatch = eventYear && metaYear ? Math.abs(eventYear - metaYear) <= 10 : false; // within a decade counts as a match
  const eraMatch = meta.era && eventPlaces.some(place => matchesName(place, meta.era!, { useVariants: true }));
  return !!(locationMatch || (yearMatch && (locationMatch || eraMatch)));
}
// Sort matched media: exact location match first, then by proximity of year to the event's year.
```

**Why `matchesName()` and not `===`**: place names in family archives come from multiple eras/languages/transliterations ("Lwów" / "Lviv" / "Lemberg"). Plain string equality would silently drop correct matches. This same function is reused for person-name matching throughout the codebase — see the note in `memorial-text-ai/SKILL.md`'s portability checklist.

## Portability checklist

1. `generateEventAudio` needs a `familyName`/`personId` to look up (or clone) a voice — if your project's person model uses different keys, adapt the lookup, but keep the "try cloned voice, fall back to generic TTS" order.
2. `matchMediaToEvent` currently scans flat JSON sidecar files per media item (`*.mp4.json`, `*.png.json`) under fixed folders — replace with a media-metadata query in a database-backed project, keeping the same `{ location, year, era }`-based matching function.
3. `TTS_CHUNK_MAX_CHARS = 4000` — narration longer than this must be split before TTS; Gemini TTS output is raw PCM that needs WAV-header wrapping (see `podcast-generation.md`, which shares these same TTS constants).
