# Timeline Extraction (Per-Document & Per-Person-Across-Many-Documents)

Source: `website/services/attachmentAnalysisService.ts` (`extractTimeline`, `generatePersonTimeline`).

**Depends on:** `@google/genai` only for generation. The output (`TimelineEntry[]`) is written to disk in the source project as `{person}_timeline.json` and is what `memorial-events-map-ai`'s `migration-map.md` and `proximity-graph.md` consume (both read timeline events with `places[]`/`date` fields) — so keep the exact field names (`date`, `title`, `story`, `people`, `places`, `events`) if you want those downstream skills to work unmodified.

## Shared shape

```ts
export interface TimelineEntry {
  date: string;    // YYYY, YYYY-MM, or YYYY-MM-DD
  title: string;   // 5-10 word event title
  story: string;   // 2-3 sentence narrative
  people: string[];
  places: string[];
  events: string[]; // e.g. "birth", "migration", "marriage" — free-text categories, not an enum
}
export interface TimelineResult { timeline: TimelineEntry[]; confidence: number; }
```

## Entry point 1 — one document → its timeline

```ts
export async function extractTimeline(fileContent: string, apiKey: string): Promise<TimelineResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Extract a chronological timeline of events from this document.\n\n${fileContent}`,
    config: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: TIMELINE_SCHEMA /* see below */ },
  });
  return JSON.parse(response.text);
}
```

## Entry point 2 — one person, many documents → a cross-referenced timeline

This is the more valuable of the two: it merges evidence from multiple sources for the *same person* into one chronology, rather than one timeline per document.

```ts
export interface DocumentSource { fileName: string; description: string; content: string; }

export async function generatePersonTimeline(personName: string, documents: DocumentSource[], apiKey: string): Promise<TimelineResult & { sources: Array<{ fileName: string; description: string }> }> {
  const ai = new GoogleGenAI({ apiKey });
  const combinedText = documents.map((doc, i) => `\n=== DOCUMENT ${i + 1}: ${doc.description} ===\n${doc.content}\n=== END DOCUMENT ${i + 1} ===\n`).join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Create a comprehensive chronological timeline specifically for "${personName}" based on these documents:
${combinedText}

Focus ONLY on events directly involving "${personName}". Order strictly chronologically.
Include life milestones (birth, education, marriage, children, career, migration, death) AND historical events that affected their life.
Cross-reference information across documents describing the same events; if documents conflict, note the most likely account.`,
    config: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: TIMELINE_SCHEMA },
  });

  const result = JSON.parse(response.text) as TimelineResult;
  return { ...result, sources: documents.map(d => ({ fileName: d.fileName, description: d.description })) };
}

const TIMELINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    timeline: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
      date: { type: Type.STRING }, title: { type: Type.STRING }, story: { type: Type.STRING },
      people: { type: Type.ARRAY, items: { type: Type.STRING } },
      places: { type: Type.ARRAY, items: { type: Type.STRING } },
      events: { type: Type.ARRAY, items: { type: Type.STRING } },
    }, required: ['date', 'title', 'story', 'people', 'places', 'events'] } },
    confidence: { type: Type.NUMBER },
  },
  required: ['timeline', 'confidence'],
};
```

## Why cross-referencing matters here specifically

The prompt explicitly instructs Gemini to reconcile conflicting accounts across documents ("if documents conflict, note the most likely account based on context") rather than silently picking one. For oral-history/genealogy material — where a birth date might differ by a year between a GEDCOM record and a memoir — surfacing rather than hiding the conflict is a deliberate choice; don't strip that instruction out when adapting the prompt.

## Portability checklist

1. `temperature: 0.4` is higher than the `0.1`–`0.3` used for transcription/entity-extraction — timeline generation involves some narrative judgment (writing the 2-3 sentence "story" field), so a little more creativity is intentional here, unlike verbatim-transcription tasks.
2. Downstream consumers (`migration-map.md`) only use events that have a **parseable year** and a **non-empty `places[]`** — a `TimelineEntry` with neither is still valid output from this function but contributes nothing to a map; don't treat "not on the map" as an extraction bug.
