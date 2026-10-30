# Person Knowledge Aggregation ("Everything We Know About This Person", Cached)

Source: `website/services/personSummaryService.ts`.

**Depends on — this is the hub every other text/map skill reads from, not a leaf:**
- GEDCOM parsing (`parseGedcomRelationships`) — parents/siblings/spouse/children
- Face-tag data (`findPhotoAppearances`, ties into `memorial-image-ai/references/face-detection-recognition.md`'s registry) — which photos this person appears in
- `summarize-entities.md`'s attachment analysis (`searchAttachments`) — documents that mention this person
- `timeline-extraction.md`'s output (`extractTimelineEvents`) — this person's timeline events
- A historical-context generator (`generateHistoricalContext`) derived from birth/death dates and places

## Copy-paste example: cached aggregation

```ts
export interface PersonSummary {
  personId: string;
  name: string;
  basicInfo: { birth: { date: string; place: string }; death: { date: string; place: string }; sex: string; profession: string; age: string };
  relationships: { parents: string[]; siblings: string[]; spouse: string[]; children: string[] };
  appearances: /* photos this person is tagged in */ any[];
  mentionsInAttachments: any[];
  mentionsInStories: any[];
  timelineEvents: any[];
  historicalContext: string;
  generatedAt: string;
}

export async function getPersonSummary(familyName: string, personId: string, forceRegenerate = false): Promise<PersonSummary> {
  const summaryPath = `resources/families/${familyName}/summary/${personId}_summary.json`;

  // Cache-first: regenerating means re-running every sub-step above (GEDCOM parse, photo scan, attachment
  // search, timeline extraction) — expensive, so only do it when explicitly asked or the cache is empty.
  if (!forceRegenerate && fs.existsSync(summaryPath)) {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  }

  const summary = await generatePersonSummary(familyName, personId); // orchestrates all the sub-steps below
  fs.mkdirSync(require('path').dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  return summary;
}

async function generatePersonSummary(familyName: string, personId: string): Promise<PersonSummary> {
  // 1. Basic info from a person record (.info file / your person table)
  // 2. Relationships — parse from GEDCOM
  const relationships = await parseGedcomRelationships(familyName, personId);
  // 3. Photos they appear in — face-tag registry (see memorial-image-ai/references/face-detection-recognition.md)
  const appearances = await findPhotoAppearances(familyName, personId, personName);
  // 4. Documents mentioning them — reuses summarize-entities.md's entity extraction, searched by name
  const attachmentMentions = await searchAttachments(familyName, personName);
  // 5. Their timeline — reuses timeline-extraction.md's output
  const timelineEvents = await extractTimelineEvents(familyName, personName);
  // 6. Stories mentioning them
  const storyMentions = await searchStories(familyName, personName);
  // 7. Historical context, generated from dates/places alone — no Gemini call, just lookup tables
  const historicalContext = generateHistoricalContext(basicInfo);

  return { personId, name: personName, basicInfo, relationships, appearances,
           mentionsInAttachments: attachmentMentions, mentionsInStories: storyMentions,
           timelineEvents, historicalContext, generatedAt: new Date().toISOString() };
}
```

## Why this exists as one function instead of calling each sub-service ad hoc

`podcast-generation.md` and `storyline-generation.md` both need "everything about person X" as a single input; without this aggregator, each caller would re-implement its own version of "go find the GEDCOM relationships, go find the photos, go find the mentions" — and they'd drift out of sync. Build one aggregation function per entity type (here: person) and have every downstream feature call *that*, not the underlying sources directly.

## Portability checklist

1. The cache-then-generate pattern (write to `{personId}_summary.json`, read on next call) trades staleness for speed — if a family record or a newly-uploaded document should retroactively change a person's summary, you need an explicit invalidation trigger (`forceRegenerate: true`) wired to "person record changed" / "new attachment tagged with this person" events, or the cache will silently go stale.
2. `generateHistoricalContext(basicInfo)` makes no LLM call — it's a lookup/rule-based function keyed on birth/death year and place (e.g. mapping a birth year + location to relevant historical events). Keep this distinction: not every step in an "AI aggregation" pipeline needs to be a model call.
