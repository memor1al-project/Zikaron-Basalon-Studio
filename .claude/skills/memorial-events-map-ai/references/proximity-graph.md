# Proximity Graph (Family × Time × Geography × Interaction × Cross-Reference)

Source: `website/services/proximityService.ts`.

**Depends on:** GEDCOM parsing (`buildGedcomFamilyGraph`, `bfsFamilyPath` — family-relation distance via breadth-first search over parsed FAM/INDI records), `nameMatchingService.ts`'s `matchesName()` (person-name fuzzy matching, used in the interaction and reference metrics), and `memorial-text-ai/references/timeline-extraction.md`'s output (`PersonTimeline` — every metric except the family one reads timeline events). No LLM call — five independent numeric scorers, each 0–1, computed per pair of people.

## The five metrics (each returns `{ score: 0-1, details: ProximityEdgeDetail[] }`)

### 1. Family — BFS shortest path over the GEDCOM graph
Not reproduced here in full (see `buildGedcomFamilyGraph`/`bfsFamilyPath`/`describeRelationshipPath` in source) — walks parent/child/spouse edges to find the shortest relationship path between two people and scores closeness by path length.

### 2. Time overlap — shared lifespan + shared timeline event years

```ts
export function computeTimeMetric(personA: PersonData, personB: PersonData, timelineA: PersonTimeline | null, timelineB: PersonTimeline | null) {
  let score = 0;
  if (personA.birthYear && personB.birthYear) {
    const startA = personA.birthYear, endA = personA.deathYear || startA + 80; // assume ~80yr lifespan if death unknown
    const startB = personB.birthYear, endB = personB.deathYear || startB + 80;
    const overlap = Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
    const maxSpan = Math.max(endA - startA, endB - startB, 1);
    if (overlap > 0) score = Math.min(1.0, overlap / maxSpan);
  }
  if (timelineA && timelineB) {
    const yearsA = new Set(timelineA.timeline.map(e => parseYear(e.date)).filter(Boolean));
    const yearsB = new Set(timelineB.timeline.map(e => parseYear(e.date)).filter(Boolean));
    const shared = [...yearsA].filter(y => yearsB.has(y));
    if (shared.length) score = Math.max(score, (score + Math.min(1.0, shared.length / Math.max(yearsA.size, yearsB.size, 1))) / 2);
  }
  return { score: Math.min(1.0, score), details: [/* human-readable strings, see source */] };
}
```

### 3. Geography — shared cities across birth/death/timeline places

```ts
export function computeGeographicMetric(personA: PersonData, personB: PersonData, timelineA: PersonTimeline | null, timelineB: PersonTimeline | null) {
  const collectPlaces = (p: PersonData, t: PersonTimeline | null) => {
    const places = [p.birthPlace, p.deathPlace].filter(x => x && x !== 'Unknown') as string[];
    t?.timeline.forEach(e => e.places.forEach(place => { if (place && place !== 'Unknown') places.push(place); }));
    return places;
  };
  const placesA = collectPlaces(personA, timelineA), placesB = collectPlaces(personB, timelineB);
  const shared = new Set<string>();
  for (const a of placesA) for (const b of placesB) if (placesOverlap(a, b)) shared.add(extractCityName(a));
  if (!shared.size) return { score: 0, details: [] };
  const totalUnique = new Set([...placesA, ...placesB].map(extractCityName)).size;
  return { score: Math.min(1.0, shared.size / Math.max(totalUnique, 1)), details: [{ type: 'geographic', description: `Shared locations: ${[...shared].join(', ')}`, weight: shared.size / totalUnique }] };
}
```

### 4. Interaction — one person's timeline literally mentions the other by name

```ts
export function computeInteractionMetric(personA: PersonData, personB: PersonData, timelineA: PersonTimeline | null, timelineB: PersonTimeline | null) {
  let coOccurrences = 0, totalEvents = 0;
  const checkMentions = (timeline: PersonTimeline | null, other: PersonData) => {
    if (!timeline) return;
    totalEvents += timeline.timeline.length;
    timeline.timeline.forEach(event => {
      if (event.people.some(name => matchesName(name, `${other.firstName} ${other.lastName}`.trim(), { useVariants: true, usePhonetic: true }))) coOccurrences++;
    });
  };
  checkMentions(timelineA, personB); checkMentions(timelineB, personA);
  if (!totalEvents) return { score: 0, details: [] };
  return { score: Math.min(1.0, coOccurrences / Math.max(totalEvents * 0.3, 1)), details: [] }; // ~30% co-occurrence rate = max score
}
```

### 5. Reference — cross-mentions in shared documents (see `computeReferenceMetric` in source; same `matchesName()`-based shape as #4, applied to attachment metadata instead of timeline events)

## Why five separate metrics instead of one "closeness" score

Each metric answers a different question a UI might want to show separately ("they were alive at the same time" vs. "they were literally in the same place" vs. "one mentions the other directly") — collapsing them into a single number loses that distinction and makes the `details[]` explanations (which quote the actual evidence, e.g. "Sarah present in 'Wedding' (1938)") impossible to attach to a single score. Keep the metrics separate and let the caller decide how to combine or display them.

## Portability checklist

1. `placesOverlap`/`extractCityName` do **string-prefix-before-first-comma** matching — "Warsaw, Poland" and "Warsaw, Mazovia" both extract to `"warsaw"` and match, which is usually right but will also match two genuinely different towns that happen to share a name pre-comma. Same caveat as noted in `migration-map.md`; don't treat a geographic-metric match as guaranteed-correct without a way to inspect the underlying place strings.
2. `parseYear` is a bare `\b(\d{4})\b` regex — a date string containing more than one 4-digit number will grab whichever comes first, not necessarily the intended one. Keep dates in a single unambiguous field upstream rather than depending on this regex to disambiguate free text.
3. All five metrics are O(1) per pair but the graph itself is O(n²) pairs — computing this across a full family (dozens of people) is fine; across a large community archive (thousands), you'd want to pre-filter candidate pairs (e.g. only compute for people who share at least one place or overlap in time) rather than running all five metrics on every pair.
