import type { Database, SqlJsStatic } from "sql.js";
import type { MaterialMeta } from "../../features/collection/materialsMetaService";
import { getConnectedDirectory, METADATA_FILENAME } from "./localFsProvider";
import { loadChunk } from "../loadChunk";

/**
 * Material metadata for a local folder, stored as a SQLite file inside that same folder.
 *
 * Why not the cloud: when someone points the Studio at a folder on their own machine, the
 * metadata belongs with the materials. Keeping it here means it survives signing out,
 * clearing the browser, switching machines, or Firestore being unreachable — and it moves
 * with the folder if it's copied to a colleague or an external drive. A family can also
 * open the file in any SQLite tool and read exactly what the Studio recorded about them.
 *
 * Keyed by metaKeyFor(ref), which for local files is the filename — stable across sessions,
 * unlike the directory handle.
 */

const SCHEMA_VERSION = "5";

let sqlPromise: Promise<SqlJsStatic> | null = null;

/**
 * Every database operation runs one at a time.
 *
 * Each one reads the whole file, mutates in memory, and writes the whole file back. Two
 * overlapping operations therefore lose data outright: the second reads the state from
 * before the first wrote, then overwrites it. Worse, createWritable() truncates on open,
 * so a read landing mid-write sees a half-written file and fails to parse. The thumbnail
 * backfill runs alongside the page's own loads, which makes that overlap routine rather
 * than theoretical.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  // Keep the chain alive even when one operation rejects.
  queue = result.catch(() => {});
  return result;
}

/**
 * Loaded on demand — the WASM binary is ~1MB and only matters once someone connects a
 * local folder, so it must never land in the initial bundle.
 */
async function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= (async () => {
    const [{ default: initSqlJs }, wasmUrl] = await Promise.all([
      loadChunk(() => import("sql.js"), "The local database"),
      loadChunk(() => import("sql.js/dist/sql-wasm.wasm?url"), "The local database").then(
        (m) => m.default as string
      ),
    ]);
    return initSqlJs({ locateFile: () => wasmUrl });
  })();
  return sqlPromise;
}

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS materials (
  key            TEXT PRIMARY KEY,
  name           TEXT,
  tags           TEXT,
  notes          TEXT,
  location       TEXT,
  location_lat   REAL,
  location_lon   REAL,
  connections    TEXT,
  ai_summary     TEXT,
  ai_timeline    TEXT,
  ai_story       TEXT,
  faces          TEXT,
  ai_transcript  TEXT,
  ai_chapters    TEXT,
  updated_at     TEXT,
  source         TEXT,
  origin         TEXT,
  thumbnail      TEXT,
  removed        INTEGER DEFAULT 0,
  extracted_text TEXT
);
CREATE TABLE IF NOT EXISTS studio_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

/** True when this session has a folder it can actually write the sidecar into. */
export function localMetaStoreAvailable(): boolean {
  return getConnectedDirectory() !== null;
}

function requireDirectory(): FileSystemDirectoryHandle {
  const dir = getConnectedDirectory();
  if (!dir) throw new Error("No writable local folder is connected");
  return dir;
}

async function readDbFile(): Promise<Uint8Array | null> {
  try {
    const handle = await requireDirectory().getFileHandle(METADATA_FILENAME);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    // NotFoundError on first use — a fresh database is the right answer.
    return null;
  }
}

async function writeDbFile(data: Uint8Array): Promise<void> {
  const handle = await requireDirectory().getFileHandle(METADATA_FILENAME, { create: true });
  const writable = await handle.createWritable();
  try {
    // Wrapped in a Blob because sql.js hands back a Uint8Array over ArrayBufferLike, which
    // the writable stream's typing won't take directly.
    await writable.write(new Blob([data as BlobPart]));
  } finally {
    await writable.close();
  }
}

async function openDb(): Promise<Database> {
  const SQL = await loadSqlJs();
  const existing = await readDbFile();
  const db = existing ? new SQL.Database(existing) : new SQL.Database();
  db.run(CREATE_SQL);
  migrate(db);
  db.run("INSERT OR REPLACE INTO studio_meta (key, value) VALUES ('schema_version', ?)", [SCHEMA_VERSION]);

  // Write a brand-new database to disk straight away rather than waiting for the first
  // save. Two reasons: the file is visibly there in the folder as soon as it's connected,
  // and a folder we can't actually write to fails now — not after an afternoon of tagging.
  if (!existing) await writeDbFile(db.export());

  return db;
}

/**
 * Adds columns introduced after a folder's database was first written.
 *
 * CREATE TABLE IF NOT EXISTS leaves an existing table exactly as it was, so a v1 sidecar
 * keeps its original shape and every later query for a new column fails. Each addition is
 * applied individually and only when missing.
 */
function migrate(db: Database): void {
  const existingColumns = new Set<string>();
  const statement = db.prepare("PRAGMA table_info(materials)");
  while (statement.step()) {
    existingColumns.add(String((statement.getAsObject() as { name?: unknown }).name));
  }
  statement.free();

  for (const [column, type] of [
    ["source", "TEXT"],
    ["origin", "TEXT"],
    ["thumbnail", "TEXT"],
    ["removed", "INTEGER DEFAULT 0"],
    ["extracted_text", "TEXT"],
  ]) {
    if (!existingColumns.has(column)) db.run(`ALTER TABLE materials ADD COLUMN ${column} ${type}`);
  }
}

async function persist(db: Database): Promise<void> {
  await writeDbFile(db.export());
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** One material as the sidecar remembers it — the name is what makes a missing file nameable. */
export interface LocalMaterialRecord {
  key: string;
  name: string;
  meta: MaterialMeta;
  /** "folder" = inside the connected folder; "external" = added from another location. */
  source: "folder" | "external";
  /** Human-readable note about where it came from — browsers never reveal a real path. */
  origin: string;
  /** Small JPEG data URL, so the material still shows a preview with no file to read. */
  thumbnail: string | null;
}

/**
 * Every material this folder has ever recorded, whether or not the file is still present.
 *
 * The database — not the directory scan — is the story's record of what belongs to it. A
 * file that was added from elsewhere on the drive, renamed, or moved away still has notes
 * and tags worth keeping, and the caller decides how to show that it can't be opened.
 */
async function listLocalMaterialsImpl(): Promise<LocalMaterialRecord[]> {
  if (!localMetaStoreAvailable()) return [];
  const db = await openDb();
  try {
    const records: LocalMaterialRecord[] = [];
    const statement = db.prepare("SELECT * FROM materials WHERE removed IS NULL OR removed = 0");
    while (statement.step()) {
      const row = statement.getAsObject() as Record<string, unknown>;
      const lat = row.location_lat;
      const lon = row.location_lon;
      const key = String(row.key);
      records.push({
        key,
        name: typeof row.name === "string" && row.name ? row.name : key,
        source: row.source === "external" ? "external" : "folder",
        origin: typeof row.origin === "string" ? row.origin : "",
        thumbnail: typeof row.thumbnail === "string" && row.thumbnail ? row.thumbnail : null,
        meta: {
          tags: parseJson(row.tags, [] as string[]),
          notes: typeof row.notes === "string" ? row.notes : "",
          location: typeof row.location === "string" && row.location ? row.location : undefined,
          locationCoords:
            typeof lat === "number" && typeof lon === "number" ? { lat, lon } : undefined,
          connections: parseJson(row.connections, []),
          aiSummary: parseJson(row.ai_summary, undefined),
          aiTimeline: parseJson(row.ai_timeline, undefined),
          aiStory: parseJson(row.ai_story, undefined),
          faces: parseJson(row.faces, undefined),
          aiTranscript: parseJson(row.ai_transcript, undefined),
          aiChapters: parseJson(row.ai_chapters, undefined),
          extractedText: parseJson(row.extracted_text, undefined),
        },
      });
    }
    statement.free();
    return records;
  } finally {
    db.close();
  }
}

/** The same records keyed for lookup, for callers that only need the metadata. */
export async function listLocalMaterialMetas(): Promise<Record<string, MaterialMeta>> {
  const records = await listLocalMaterials();
  return Object.fromEntries(records.map((r) => [r.key, r.meta]));
}

/**
 * Writes one material's metadata into the folder's sidecar.
 *
 * The whole file is rewritten on every save, which is fine at this scale — a folder of a
 * few hundred materials is tens of kilobytes — and keeps the file consistent on disk
 * rather than half-updated if the tab closes mid-edit.
 */
async function saveLocalMaterialMetaImpl(
  key: string,
  name: string,
  meta: MaterialMeta,
  provenance: { source: "folder" | "external"; origin: string } = { source: "folder", origin: "" }
): Promise<void> {
  const db = await openDb();
  try {
    // UPSERT rather than INSERT OR REPLACE: REPLACE deletes the existing row and inserts a
    // fresh one, which would silently blank every column this statement doesn't list —
    // the stored thumbnail among them.
    db.run(
      `INSERT INTO materials
         (key, name, tags, notes, location, location_lat, location_lon, connections,
          ai_summary, ai_timeline, ai_story, faces, ai_transcript, ai_chapters, updated_at,
          source, origin, extracted_text)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET
         name=excluded.name, tags=excluded.tags, notes=excluded.notes,
         location=excluded.location, location_lat=excluded.location_lat,
         location_lon=excluded.location_lon, connections=excluded.connections,
         ai_summary=excluded.ai_summary, ai_timeline=excluded.ai_timeline,
         ai_story=excluded.ai_story, faces=excluded.faces,
         ai_transcript=excluded.ai_transcript, ai_chapters=excluded.ai_chapters,
         updated_at=excluded.updated_at, source=excluded.source, origin=excluded.origin,
         extracted_text=excluded.extracted_text`,
      [
        key,
        name,
        JSON.stringify(meta.tags ?? []),
        meta.notes ?? "",
        meta.location ?? "",
        meta.locationCoords?.lat ?? null,
        meta.locationCoords?.lon ?? null,
        JSON.stringify(meta.connections ?? []),
        meta.aiSummary ? JSON.stringify(meta.aiSummary) : null,
        meta.aiTimeline ? JSON.stringify(meta.aiTimeline) : null,
        meta.aiStory ? JSON.stringify(meta.aiStory) : null,
        meta.faces ? JSON.stringify(meta.faces) : null,
        meta.aiTranscript ? JSON.stringify(meta.aiTranscript) : null,
        meta.aiChapters ? JSON.stringify(meta.aiChapters) : null,
        new Date().toISOString(),
        provenance.source,
        provenance.origin,
        meta.extractedText ? JSON.stringify(meta.extractedText) : null,
      ]
    );
    await persist(db);
  } finally {
    db.close();
  }
}

/**
 * Stores a material's preview image without touching the rest of its row.
 *
 * Kept separate from saveLocalMaterialMeta because thumbnails are generated in the
 * background for files already on disk, long before (and often instead of) anyone editing
 * that material's metadata.
 */
async function saveLocalThumbnailImpl(key: string, name: string, thumbnail: string): Promise<void> {
  const db = await openDb();
  try {
    // The row may not exist yet for a file nobody has edited, so insert a bare one first.
    db.run("INSERT OR IGNORE INTO materials (key, name, source, origin) VALUES (?,?,?,?)", [
      key,
      name,
      "folder",
      "",
    ]);
    db.run("UPDATE materials SET thumbnail = ? WHERE key = ?", [thumbnail, key]);
    await persist(db);
  } finally {
    db.close();
  }
}

/** Keys that already have a preview stored, so a backfill can skip them cheaply. */
async function listThumbnailedKeysImpl(): Promise<Set<string>> {
  if (!localMetaStoreAvailable()) return new Set();
  const db = await openDb();
  try {
    const keys = new Set<string>();
    const statement = db.prepare("SELECT key FROM materials WHERE thumbnail IS NOT NULL AND thumbnail <> ''");
    while (statement.step()) keys.add(String((statement.getAsObject() as { key?: unknown }).key));
    statement.free();
    return keys;
  } finally {
    db.close();
  }
}

/**
 * Drops a material from the story.
 *
 * The row is kept as a tombstone rather than deleted, because the file itself is left
 * alone on disk — without a marker the next folder scan would simply add it back. Its
 * metadata and preview are cleared, so nothing lingers about a material the family chose
 * to take out.
 */
async function removeLocalMaterialImpl(key: string, name: string): Promise<void> {
  const db = await openDb();
  try {
    db.run("INSERT OR IGNORE INTO materials (key, name) VALUES (?,?)", [key, name]);
    db.run(
      `UPDATE materials SET
         removed = 1, tags = NULL, notes = NULL, location = NULL,
         location_lat = NULL, location_lon = NULL, connections = NULL,
         ai_summary = NULL, ai_timeline = NULL, ai_story = NULL, faces = NULL,
         ai_transcript = NULL, ai_chapters = NULL, thumbnail = NULL,
         updated_at = ?
       WHERE key = ?`,
      [new Date().toISOString(), key]
    );
    await persist(db);
  } finally {
    db.close();
  }
}

/**
 * Moves a row onto a different key, keeping its metadata.
 *
 * Material ids have changed shape twice — folder files went from bare filename to path
 * within the folder, and outside files gained an "external:" prefix — so rows written by
 * an earlier build can point at a key nothing matches any more. That looks to the UI like
 * a file that has gone missing, when the file is sitting right there under a new id.
 * Re-keying rescues the tags and notes instead of stranding them.
 */
async function rekeyLocalMaterialImpl(oldKey: string, newKey: string, newName: string): Promise<void> {
  const db = await openDb();
  try {
    // OR REPLACE: if something already occupies the new key, the recovered row wins rather
    // than the statement failing on the primary key.
    db.run("UPDATE OR REPLACE materials SET key = ?, name = ? WHERE key = ?", [newKey, newName, oldKey]);
    await persist(db);
  } finally {
    db.close();
  }
}

/** Puts a removed material back. Its tags and notes were cleared on removal and don't return. */
async function restoreLocalMaterialImpl(key: string): Promise<void> {
  const db = await openDb();
  try {
    db.run("UPDATE materials SET removed = 0, updated_at = ? WHERE key = ?", [new Date().toISOString(), key]);
    await persist(db);
  } finally {
    db.close();
  }
}

/** Removed materials, so the UI can show what's being held back rather than just hiding it. */
async function listRemovedMaterialsImpl(): Promise<{ key: string; name: string }[]> {
  if (!localMetaStoreAvailable()) return [];
  const db = await openDb();
  try {
    const rows: { key: string; name: string }[] = [];
    const statement = db.prepare("SELECT key, name FROM materials WHERE removed = 1");
    while (statement.step()) {
      const row = statement.getAsObject() as { key?: unknown; name?: unknown };
      rows.push({ key: String(row.key), name: typeof row.name === "string" ? row.name : String(row.key) });
    }
    statement.free();
    return rows;
  } finally {
    db.close();
  }
}

/** Keys the story has removed, so a folder scan doesn't quietly reinstate them. */
async function listRemovedKeysImpl(): Promise<Set<string>> {
  if (!localMetaStoreAvailable()) return new Set();
  const db = await openDb();
  try {
    const keys = new Set<string>();
    const statement = db.prepare("SELECT key FROM materials WHERE removed = 1");
    while (statement.step()) keys.add(String((statement.getAsObject() as { key?: unknown }).key));
    statement.free();
    return keys;
  } finally {
    db.close();
  }
}

/** Where the sidecar lives, for telling someone what the Studio just wrote. */
export function localMetaStoreFilename(): string {
  return METADATA_FILENAME;
}

/** How many rows carry each optional field, so a catalog dashboard can show real coverage rather than a row count alone. */
export interface CatalogFieldCoverage {
  tags: number;
  notes: number;
  location: number;
  connections: number;
  aiSummary: number;
  aiTimeline: number;
  aiStory: number;
  faces: number;
  aiTranscript: number;
  aiChapters: number;
  extractedText: number;
  thumbnail: number;
}

export interface CatalogStats {
  /** False when no local folder is connected — there is no sidecar file to describe. */
  available: boolean;
  filename: string;
  fileSizeBytes: number;
  schemaVersion: string | null;
  totalMaterials: number;
  activeMaterials: number;
  removedMaterials: number;
  bySource: { folder: number; external: number };
  fieldCoverage: CatalogFieldCoverage;
  latestUpdatedAt: string | null;
  oldestUpdatedAt: string | null;
}

function emptyFieldCoverage(): CatalogFieldCoverage {
  return {
    tags: 0,
    notes: 0,
    location: 0,
    connections: 0,
    aiSummary: 0,
    aiTimeline: 0,
    aiStory: 0,
    faces: 0,
    aiTranscript: 0,
    aiChapters: 0,
    extractedText: 0,
    thumbnail: 0,
  };
}

/** True for a JSON-encoded array/value column that actually holds something, not just "[]" or null. */
function hasJsonContent(value: unknown): boolean {
  if (typeof value !== "string" || !value) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed);
  } catch {
    return false;
  }
}

function readSchemaVersion(db: Database): string | null {
  const statement = db.prepare("SELECT value FROM studio_meta WHERE key = 'schema_version'");
  try {
    if (!statement.step()) return null;
    const value = (statement.getAsObject() as { value?: unknown }).value;
    return typeof value === "string" && value ? value : null;
  } finally {
    statement.free();
  }
}

/**
 * A snapshot of the folder's sidecar file itself, for an admin-style dashboard rather than
 * the material-by-material views the rest of the wizard uses.
 */
async function getCatalogStatsImpl(): Promise<CatalogStats> {
  if (!localMetaStoreAvailable()) {
    return {
      available: false,
      filename: METADATA_FILENAME,
      fileSizeBytes: 0,
      schemaVersion: null,
      totalMaterials: 0,
      activeMaterials: 0,
      removedMaterials: 0,
      bySource: { folder: 0, external: 0 },
      fieldCoverage: emptyFieldCoverage(),
      latestUpdatedAt: null,
      oldestUpdatedAt: null,
    };
  }

  // Read alongside openDb() rather than through it: openDb() may rewrite the file (a
  // brand-new sidecar, or a migration adding a column), and the on-disk size before that
  // happens is the honest answer to "how big is the file this folder is carrying."
  const raw = await readDbFile();
  const db = await openDb();
  try {
    const fieldCoverage = emptyFieldCoverage();
    let totalMaterials = 0;
    let activeMaterials = 0;
    let removedMaterials = 0;
    let folderCount = 0;
    let externalCount = 0;
    let latestUpdatedAt: string | null = null;
    let oldestUpdatedAt: string | null = null;

    const statement = db.prepare("SELECT * FROM materials");
    while (statement.step()) {
      const row = statement.getAsObject() as Record<string, unknown>;
      totalMaterials++;

      if (Number(row.removed) === 1) removedMaterials++;
      else activeMaterials++;

      if (row.source === "external") externalCount++;
      else folderCount++;

      const updatedAt = typeof row.updated_at === "string" && row.updated_at ? row.updated_at : null;
      if (updatedAt) {
        if (!latestUpdatedAt || updatedAt > latestUpdatedAt) latestUpdatedAt = updatedAt;
        if (!oldestUpdatedAt || updatedAt < oldestUpdatedAt) oldestUpdatedAt = updatedAt;
      }

      if (hasJsonContent(row.tags)) fieldCoverage.tags++;
      if (typeof row.notes === "string" && row.notes.trim()) fieldCoverage.notes++;
      if (typeof row.location === "string" && row.location.trim()) fieldCoverage.location++;
      if (hasJsonContent(row.connections)) fieldCoverage.connections++;
      if (typeof row.ai_summary === "string" && row.ai_summary) fieldCoverage.aiSummary++;
      if (typeof row.ai_timeline === "string" && row.ai_timeline) fieldCoverage.aiTimeline++;
      if (typeof row.ai_story === "string" && row.ai_story) fieldCoverage.aiStory++;
      if (typeof row.faces === "string" && row.faces) fieldCoverage.faces++;
      if (typeof row.ai_transcript === "string" && row.ai_transcript) fieldCoverage.aiTranscript++;
      if (typeof row.ai_chapters === "string" && row.ai_chapters) fieldCoverage.aiChapters++;
      if (typeof row.extracted_text === "string" && row.extracted_text) fieldCoverage.extractedText++;
      if (typeof row.thumbnail === "string" && row.thumbnail) fieldCoverage.thumbnail++;
    }
    statement.free();

    return {
      available: true,
      filename: METADATA_FILENAME,
      fileSizeBytes: raw ? raw.length : db.export().length,
      schemaVersion: readSchemaVersion(db),
      totalMaterials,
      activeMaterials,
      removedMaterials,
      bySource: { folder: folderCount, external: externalCount },
      fieldCoverage,
      latestUpdatedAt,
      oldestUpdatedAt,
    };
  } finally {
    db.close();
  }
}

/* ── public API ──
 * Thin serialized wrappers: the implementations above assume they have the file to
 * themselves, and serialize() is what makes that true. */

export const listLocalMaterials = (): Promise<LocalMaterialRecord[]> => serialize(listLocalMaterialsImpl);

export const saveLocalMaterialMeta = (
  key: string,
  name: string,
  meta: MaterialMeta,
  provenance?: { source: "folder" | "external"; origin: string }
): Promise<void> => serialize(() => saveLocalMaterialMetaImpl(key, name, meta, provenance));

export const saveLocalThumbnail = (key: string, name: string, thumbnail: string): Promise<void> =>
  serialize(() => saveLocalThumbnailImpl(key, name, thumbnail));

export const listThumbnailedKeys = (): Promise<Set<string>> => serialize(listThumbnailedKeysImpl);

export const removeLocalMaterial = (key: string, name: string): Promise<void> =>
  serialize(() => removeLocalMaterialImpl(key, name));

export const restoreLocalMaterial = (key: string): Promise<void> => serialize(() => restoreLocalMaterialImpl(key));

export const listRemovedMaterials = (): Promise<{ key: string; name: string }[]> =>
  serialize(listRemovedMaterialsImpl);

export const listRemovedKeys = (): Promise<Set<string>> => serialize(listRemovedKeysImpl);

export const rekeyLocalMaterial = (oldKey: string, newKey: string, newName: string): Promise<void> =>
  serialize(() => rekeyLocalMaterialImpl(oldKey, newKey, newName));

export const getCatalogStats = (): Promise<CatalogStats> => serialize(getCatalogStatsImpl);
