# Contextual Map From Locations + Timeline (Migration Path)

Source: `website/services/migrationMapService.ts` (`computeMigrationMapData`).

**Depends on:** `timeline-index.md`'s `getTimelineFilesForPerson()` (fast lookup, don't re-scan every timeline file); `proximityService.ts`'s `parseYear`/`extractCityName` (shared date/place parsing utilities — see the note on their limitations in `proximity-graph.md`); a person record with `birth`/`death` date+place; and `memorial-text-ai/references/timeline-extraction.md`'s output shape (`TimelineEntry` with `date`/`title`/`places`). No AI/LLM call — this is pure computation over already-extracted data.

## Copy-paste example

```ts
import { parseYear, extractCityName } from './proximityService';
import { getTimelineFilesForPerson } from './timelineIndexService';

const COLOR_PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#8b5cf6', '#84cc16', '#e11d48'];

export interface MigrationWaypoint { year: number; date: string; place: string; eventTitle: string; source: 'birth' | 'timeline' | 'death'; timelineFile?: string; timelineEventIndex?: number; }
export interface MigrationPersonPath { personId: string; personName: string; color: string; imageUrl?: string; birthYear?: number; deathYear?: number; waypoints: MigrationWaypoint[]; }

export function computeMigrationMapData(familyName: string, personIds: string[]) {
  const people: MigrationPersonPath[] = [];
  const allPlaces = new Set<string>();

  personIds.forEach((personId, pi) => {
    const info = loadPersonInfo(familyName, personId); // { name, birth: {date, place}, death: {date, place} }
    const color = COLOR_PALETTE[pi % COLOR_PALETTE.length];
    const waypoints: MigrationWaypoint[] = [];

    // Birth waypoint
    if (info?.birth?.place && info.birth.place !== 'Unknown') {
      const year = parseYear(info.birth.date);
      if (year) { waypoints.push({ year, date: info.birth.date, place: info.birth.place, eventTitle: 'Birth', source: 'birth' }); allPlaces.add(info.birth.place); }
    }

    // Every timeline event that has BOTH a parseable year AND at least one place
    const timelineFiles = getTimelineFilesForPerson(timelineDir, personId); // fast index lookup, not a directory scan
    for (const file of timelineFiles) {
      const events = loadTimelineEvents(file); // TimelineEntry[]
      events.forEach((event, eventIdx) => {
        if (!event.places?.length) return;
        const year = parseYear(event.date);
        if (!year) return;
        const place = event.places[event.places.length - 1]; // last place = destination, not origin
        if (!place || place === 'Unknown') return;
        waypoints.push({ year, date: event.date, place, eventTitle: event.title, source: 'timeline', timelineFile: file, timelineEventIndex: eventIdx });
        event.places.forEach(p => { if (p && p !== 'Unknown') allPlaces.add(p); });
      });
    }

    // Death waypoint
    if (info?.death?.place && info.death.place !== 'Unknown') {
      const year = parseYear(info.death.date);
      if (year) { waypoints.push({ year, date: info.death.date, place: info.death.place, eventTitle: 'Death', source: 'death' }); allPlaces.add(info.death.place); }
    }

    waypoints.sort((a, b) => a.year - b.year || a.date.localeCompare(b.date));

    // Dedupe CONSECUTIVE waypoints at the same city — but never drop birth/death even if same city as neighbor
    const deduped: MigrationWaypoint[] = [];
    for (const wp of waypoints) {
      const city = extractCityName(wp.place);
      const lastCity = deduped.length ? extractCityName(deduped[deduped.length - 1].place) : '';
      if (city !== lastCity || wp.source === 'birth' || wp.source === 'death') deduped.push(wp);
    }

    if (deduped.length) {
      people.push({ personId, personName: info?.name ? `${info.name.first} ${info.name.last}`.trim() : personId,
                    color, imageUrl: info?.faceImagePath, birthYear: parseYear(info?.birth?.date), deathYear: parseYear(info?.death?.date), waypoints: deduped });
    }
  });

  const years = people.flatMap(p => p.waypoints.map(w => w.year));
  return { people, yearRange: { min: years.length ? Math.min(...years) : 1900, max: years.length ? Math.max(...years) : 2000 }, uniquePlaces: Array.from(allPlaces) };
}
```

## Design choices worth keeping

- **Last place in `event.places[]` = destination**, not the first — a timeline event describing "fled Warsaw for Kraków" has `places: ["Warsaw", "Kraków"]`; the waypoint should land on where they ended up, not where they started.
- **Dedup by consecutive city, never by birth/death** — a person who was born and later returned to die in the same city should still show both endpoints on the map, even though the "current city" didn't visibly change in between.
- **Per-person distinct color from a fixed palette** (indexed by array position, wrapping with `%`) — makes a multi-person map immediately legible without a legend lookup.

## Portability checklist

1. This function returns `{ people, yearRange, uniquePlaces }` — a UI layer (map component, timeline slider) consumes this directly; keep that contract stable even if you change where the underlying person/timeline data comes from.
2. Waypoint imagery (a photo for each place) is a separate concern — see the sibling "find/attribute images for a place" capability (`migrationImageService.ts` in the source repo: matches local family photos first, falls back to a Wikimedia Commons search+cache) if you want photos alongside each map pin.
3. Both `parseYear` and `extractCityName` have known false-positive risks (see `proximity-graph.md`'s portability notes) — a bad year or a coarse city match here silently produces a wrong-looking map pin rather than an error. Consider surfacing per-waypoint confidence in the UI rather than treating every pin as equally certain.
