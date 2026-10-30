---
name: memorial-events-map-ai
description: Reference for building a contextual map and closeness graph from a person's locations and timeline in oral-history/genealogy projects — computing a migration path (birth → timeline waypoints → death, in order, with imagery), maintaining a fast person-to-timeline-file index, and computing a multi-metric proximity graph between people (family, time-overlap, geography, co-occurrence, cross-reference). Use when building or adapting a "where did this person go and when" map, a "who else was there" feature, or any lookup that needs a person's timeline without re-scanning every file. Every pattern here is copied from working code in the sibling `website` Firebase project (Zikaron BaSalon) — check the referenced files there before assuming an API has changed.
---

# Events Map & Timeline Services

No Gemini calls here — this is pure data computation over a person's existing structured records (info files + timeline events), not a generative-AI capability. It's the layer that makes the video/image/audio/text extraction outputs *useful* as a map and as "closeness" context.

## Capabilities

| Capability | Reference | Core technique |
|---|---|---|
| Contextual map from locations + timeline | [references/migration-map.md](references/migration-map.md) | Birth waypoint + every timeline event with a `places[]` and a parseable year + death waypoint, sorted chronologically, deduped by consecutive city |
| Timeline lookup index | [references/timeline-index.md](references/timeline-index.md) | `personId → timeline filenames` index written to `timeline/index.json`, lazily rebuilt if missing/corrupt, in-memory cache keyed by resolved directory path |
| Proximity graph (people × time × place) | [references/proximity-graph.md](references/proximity-graph.md) | Five independent metrics (family/time/geography/interaction/reference), each 0–1, computed per pair and combined |

## Why the index exists (don't skip it)

`computeMigrationMapData` and the proximity metrics both need "all timeline events for person X" repeatedly. Scanning every `_timeline.json` file on each lookup is the naive approach and it's what this index was built to eliminate — see `timeline-index.md`. Any port of this capability to a database-backed project should replace the index with a straightforward query (`WHERE personId = ?`), but keep the same call shape (`getTimelineFilesForPerson(dir, personId) → string[]`) so the map/proximity code above it doesn't need to change.

## Portability checklist

1. `computeMigrationMapData` reads `.info` files and `_timeline.json` files straight off disk via `process.cwd()`-relative paths — swap for your storage/data layer, keep the output shape (`MigrationPersonPath[]` with sorted, deduped `waypoints`).
2. Place names are matched by **city-level substring** (`extractCityName` = everything before the first comma, lowercased) — good enough for "Warsaw, Poland" vs "Warsaw" but will conflate two different towns that happen to share a first-comma-segment name; tighten this before trusting it on a much larger corpus.
3. Year parsing (`parseYear`) is a naive `\b(\d{4})\b` regex — it will grab the wrong 4-digit number out of a date string with multiple years in it (e.g. "moved in 1943, returned in 1946" as one string). Keep dates as separate fields upstream rather than relying on this regex to disambiguate.
4. The proximity graph's five metrics are independent and cheap to compute pairwise, but pairwise cost is O(n²) in the number of people — fine for a family (dozens), reconsider before running it across thousands of people in one call.
