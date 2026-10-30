# Timeline Lookup Index (personId → Timeline Files, Without Rescanning Everything)

Source: `website/services/timelineIndexService.ts`.

**Depends on:** nothing else — this is infrastructure the other events-map capabilities (`migration-map.md`, `proximity-graph.md`) and the text skill (`podcast-generation.md`) all call into. It exists purely so those callers don't each re-implement "scan every `_timeline.json` file in this directory."

## Copy-paste example

```ts
const INDEX_FILENAME = 'index.json';
const CURRENT_VERSION = 1;
export interface TimelineIndexEntry { personName: string; files: string[]; }
export interface TimelineIndex { version: number; lastUpdated: string; entries: Record<string, TimelineIndexEntry>; }

const indexCache = new Map<string, TimelineIndex>(); // in-memory, keyed by resolved directory path

export function loadTimelineIndex(timelineDir: string): TimelineIndex {
  const cacheKey = path.resolve(timelineDir);
  if (indexCache.has(cacheKey)) return indexCache.get(cacheKey)!;

  const indexPath = path.join(timelineDir, INDEX_FILENAME);
  if (fs.existsSync(indexPath)) {
    try {
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      if (index.version && index.entries) { indexCache.set(cacheKey, index); return index; }
    } catch { /* corrupt — fall through to rebuild */ }
  }
  return rebuildTimelineIndex(timelineDir); // missing or corrupt → full scan, once
}

export function rebuildTimelineIndex(timelineDir: string): TimelineIndex {
  const entries: Record<string, TimelineIndexEntry> = {};
  const files = fs.readdirSync(timelineDir).filter(f => f.endsWith('_timeline.json') && !f.startsWith('.'));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(timelineDir, file), 'utf-8'));
    const personId = normalizePersonId(data.personId || '_unassigned');
    if (!entries[personId]) entries[personId] = { personName: data.personName || '', files: [] };
    if (!entries[personId].files.includes(file)) entries[personId].files.push(file);
  }
  const index = { version: CURRENT_VERSION, lastUpdated: new Date().toISOString(), entries };
  fs.writeFileSync(path.join(timelineDir, INDEX_FILENAME), JSON.stringify(index, null, 2));
  indexCache.set(path.resolve(timelineDir), index);
  return index;
}

/** Write-through: call this every time a timeline file is created/updated, instead of waiting for the next rebuild. */
export function updateTimelineIndex(timelineDir: string, personId: string, personName: string, filename: string): void {
  const index = loadTimelineIndex(timelineDir);
  const id = normalizePersonId(personId);
  if (!index.entries[id]) index.entries[id] = { personName, files: [] };
  if (!index.entries[id].files.includes(filename)) index.entries[id].files.push(filename);
  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(path.join(timelineDir, INDEX_FILENAME), JSON.stringify(index, null, 2));
  indexCache.set(path.resolve(timelineDir), index);
}

/** The actual fast-path lookup every other service calls. */
export function getTimelineFilesForPerson(timelineDir: string, personId: string): string[] {
  return loadTimelineIndex(timelineDir).entries[normalizePersonId(personId)]?.files || [];
}
```

## The three-layer caching shape (reuse this for any "index over many small files" problem)

1. **In-memory `Map`** keyed by resolved directory path — free on every call after the first, for the lifetime of the process.
2. **On-disk `index.json`** — survives process restarts, avoids the full-scan cost on every cold start.
3. **Full rebuild on miss/corruption** — the index is a cache, not a source of truth; if it's missing or fails to parse, the code silently rebuilds from the real `_timeline.json` files rather than erroring. This makes the index safe to delete manually for debugging.

**Write-through on every write, not batch-rebuilt periodically** — `updateTimelineIndex` is called at the moment a timeline file is saved, so the index is never more than one write stale. A periodic-rebuild-only approach would leave a window where a freshly-created timeline isn't found yet.

## Portability checklist

1. In a database-backed project, this whole file becomes unnecessary — replace with a straightforward indexed query (`WHERE personId = ?`) or a `person_id` foreign key on a `timeline_events` table, and delete the file-scanning entirely. Keep the call shape (`getTimelineFilesForPerson(scope, personId) → string[]` or the DB equivalent) so `migration-map.md` and `proximity-graph.md` don't need to change.
2. `normalizePersonId` (strips GEDCOM `@...@` wrapping, e.g. `@I1@` → `I1`) must be applied consistently everywhere a personId is used as a map/object key, or lookups will silently miss due to `@I1@` !== `I1`.
