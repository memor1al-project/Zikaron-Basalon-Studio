import { loadChunk } from "../../lib/loadChunk";
import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import { getConnectedDirectory, METADATA_FILENAME } from "../../lib/storage/localFsProvider";
import type { ProviderFile } from "../../lib/storage/types";
import type { LocalMaterialRecord } from "../../lib/storage/localMetaStore";

/**
 * Taking a story somewhere else.
 *
 * A testimony giver who gathered their materials on one machine has no way to continue on
 * another: the catalog lives in a folder, the materials sit beside it, and the browser's
 * hold on that folder doesn't travel. An export is one file containing both, so the work
 * can be backed up, handed to a family member, or moved to another computer.
 *
 * Written and read as a stream. A family archive is routinely gigabytes, and building a
 * zip in memory before writing it would fail on exactly the collections most worth saving.
 */

export const BUNDLE_FORMAT = "zikaron-story-export";
export const BUNDLE_FORMAT_VERSION = 1;
const MATERIALS_PREFIX = "materials/";
const MANIFEST_NAME = "manifest.json";

/** One material as the export recorded it — the bill of materials. */
export interface BomEntry {
  key: string;
  name: string;
  /** Path inside the archive, or null when the file couldn't be included. */
  path: string | null;
  sizeBytes: number | null;
  source: "folder" | "external";
  included: boolean;
  /** Why a material is listed but not included — its file wasn't reachable. */
  reason?: string;
}

export interface BundleManifest {
  format: typeof BUNDLE_FORMAT;
  formatVersion: number;
  exportedAt: string;
  app: { version: string; build: number };
  story: { label: string };
  database: {
    filename: string;
    /** Schema version of the catalog, so an import knows what it's reading. */
    schemaVersion: string | null;
    /** Latest updated_at across materials — which edit of the catalog this is. */
    revision: string | null;
    sizeBytes: number;
  };
  counts: { materials: number; included: number; missing: number };
  bom: BomEntry[];
}

export interface ExportProgress {
  (message: string, done: number, total: number): void;
}

/**
 * Writes the story as a single archive.
 *
 * `files` are the materials currently reachable; `records` is what the catalog remembers.
 * A material in the catalog with no reachable file is still listed in the bill of
 * materials, marked as not included — an export that quietly omitted it would look
 * complete while losing part of the story.
 */
export async function exportStory(input: {
  files: ProviderFile[];
  records: LocalMaterialRecord[];
  storyLabel: string;
  /** From catalogStats() — the catalog already knows its own schema and latest edit. */
  schemaVersion: string | null;
  revision: string | null;
  onProgress?: ExportProgress;
}): Promise<{ manifest: BundleManifest; filename: string }> {
  const { files, records, storyLabel, schemaVersion, revision, onProgress } = input;

  const directory = getConnectedDirectory();
  if (!directory) throw new Error("Connect the story's folder before exporting.");

  const { Zip, ZipPassThrough } = await loadChunk(() => import("fflate"), "The archive writer");

  const filesByKey = new Map(files.map((f) => [keyOf(f), f]));
  const dbBytes = await readDatabase(directory);
  const filename = `${safeName(storyLabel)}-${new Date().toISOString().slice(0, 10)}.zikaron.zip`;

  const sink = await openWritable(filename);

  // fflate pushes chunks as they're produced; they go straight to disk.
  const chunks: Uint8Array[] = [];
  let sinkError: unknown = null;
  const zip = new Zip((err, chunk, final) => {
    if (err) {
      sinkError = err;
      return;
    }
    chunks.push(chunk);
    void final;
  });

  const flush = async () => {
    while (chunks.length > 0) {
      const chunk = chunks.shift()!;
      await sink.write(chunk);
    }
    if (sinkError) throw sinkError;
  };

  const addFile = async (path: string, bytes: Uint8Array) => {
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(bytes, true);
    await flush();
  };

  const bom: BomEntry[] = [];
  let included = 0;
  const total = records.length;

  for (const [index, record] of records.entries()) {
    onProgress?.(`Packing ${index + 1} of ${total}…`, index, total);
    const file = filesByKey.get(record.key);

    if (!file) {
      bom.push({
        key: record.key,
        name: record.name,
        path: null,
        sizeBytes: null,
        source: record.source,
        included: false,
        reason: "File was not reachable when this export was made",
      });
      continue;
    }

    try {
      const bytes = await readFileBytes(file);
      const path = MATERIALS_PREFIX + archivePathFor(record.name);
      await addFile(path, bytes);
      bom.push({
        key: record.key,
        name: record.name,
        path,
        sizeBytes: bytes.byteLength,
        source: record.source,
        included: true,
      });
      included++;
    } catch (error) {
      bom.push({
        key: record.key,
        name: record.name,
        path: null,
        sizeBytes: null,
        source: record.source,
        included: false,
        reason: error instanceof Error ? error.message : "Could not be read",
      });
    }
  }

  onProgress?.("Packing the catalog…", total, total);
  await addFile(METADATA_FILENAME, dbBytes);

  const manifest: BundleManifest = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    app: { version: __APP_VERSION__, build: __BUILD_NUMBER__ },
    story: { label: storyLabel },
    database: {
      filename: METADATA_FILENAME,
      schemaVersion,
      revision,
      sizeBytes: dbBytes.byteLength,
    },
    counts: { materials: total, included, missing: total - included },
    bom,
  };

  await addFile(MANIFEST_NAME, new TextEncoder().encode(JSON.stringify(manifest, null, 2)));

  zip.end();
  await flush();
  await sink.close();

  return { manifest, filename };
}

/* ── import ── */

export interface ImportResult {
  manifest: BundleManifest;
  /** Materials written into the folder. */
  written: number;
  /** Entries the archive listed but did not contain. */
  skipped: number;
  databaseRestored: boolean;
}

/**
 * Unpacks an archive into the connected folder.
 *
 * Existing files are not overwritten: an import is for continuing work elsewhere, and
 * silently replacing a material someone has since edited would destroy the newer copy.
 * The catalog is the exception — it's restored only when the folder has none, so an
 * import can't discard notes made on this machine.
 */
export async function importStory(
  archive: File,
  onProgress?: (message: string) => void
): Promise<ImportResult> {
  const directory = getConnectedDirectory();
  if (!directory) throw new Error("Connect a folder to import into first.");

  const { unzipSync } = await loadChunk(() => import("fflate"), "The archive reader");

  onProgress?.("Reading the archive…");
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const entries = unzipSync(bytes);

  const manifestBytes = entries[MANIFEST_NAME];
  if (!manifestBytes) throw new Error("This doesn't look like a Story Studio export — no manifest inside.");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BundleManifest;
  if (manifest.format !== BUNDLE_FORMAT) throw new Error("This archive was made by a different tool.");
  if (manifest.formatVersion > BUNDLE_FORMAT_VERSION) {
    throw new Error("This export was made by a newer version of the Studio. Update before importing it.");
  }

  let written = 0;
  let skipped = 0;

  for (const [path, content] of Object.entries(entries)) {
    if (!path.startsWith(MATERIALS_PREFIX) || path.endsWith("/")) continue;
    const relative = path.slice(MATERIALS_PREFIX.length);
    onProgress?.(`Restoring ${relative}…`);

    if (await fileExists(directory, relative)) {
      skipped++;
      continue;
    }
    await writeInto(directory, relative, content);
    written++;
  }

  let databaseRestored = false;
  const dbBytes = entries[METADATA_FILENAME];
  if (dbBytes && !(await fileExists(directory, METADATA_FILENAME))) {
    onProgress?.("Restoring the catalog…");
    await writeInto(directory, METADATA_FILENAME, dbBytes);
    databaseRestored = true;
  }

  return { manifest, written, skipped, databaseRestored };
}

/* ── helpers ── */

function keyOf(file: ProviderFile): string {
  return `${file.ref.providerId}_${encodeURIComponent(file.ref.id)}`;
}

/** Keeps the folder shape, minus anything that could escape the target directory. */
function archivePathFor(name: string): string {
  return name
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function safeName(label: string): string {
  return label.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "story";
}

async function readFileBytes(file: ProviderFile): Promise<Uint8Array> {
  const url = await getObjectUrlFor(file);
  const response = await fetch(url);
  return new Uint8Array(await response.arrayBuffer());
}

async function readDatabase(directory: FileSystemDirectoryHandle): Promise<Uint8Array> {
  try {
    const handle = await directory.getFileHandle(METADATA_FILENAME);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  } catch {
    throw new Error("This folder has no catalog file yet — open the materials list once to create it.");
  }
}

/** A save dialog where available; otherwise a download, which can't stream but still works. */
async function openWritable(filename: string): Promise<{ write: (chunk: Uint8Array) => Promise<void>; close: () => Promise<void> }> {
  if ("showSaveFilePicker" in window) {
    // @ts-expect-error — showSaveFilePicker isn't in the default TS lib yet
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "Story Studio export", accept: { "application/zip": [".zip"] } }],
    });
    const writable = await handle.createWritable();
    return {
      write: (chunk) => writable.write(new Blob([chunk as BlobPart])),
      close: () => writable.close(),
    };
  }

  const parts: BlobPart[] = [];
  return {
    write: async (chunk) => {
      parts.push(chunk.slice() as BlobPart);
    },
    close: async () => {
      const url = URL.createObjectURL(new Blob(parts, { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    },
  };
}

async function fileExists(directory: FileSystemDirectoryHandle, relative: string): Promise<boolean> {
  try {
    const { parent, name } = await walk(directory, relative, false);
    await parent.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function writeInto(directory: FileSystemDirectoryHandle, relative: string, bytes: Uint8Array): Promise<void> {
  const { parent, name } = await walk(directory, relative, true);
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(new Blob([bytes as BlobPart]));
  } finally {
    await writable.close();
  }
}

/** Resolves "letters/1943/scan.jpg" to its parent directory handle and final name. */
async function walk(
  directory: FileSystemDirectoryHandle,
  relative: string,
  create: boolean
): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
  const segments = archivePathFor(relative).split("/");
  const name = segments.pop()!;
  let parent = directory;
  for (const segment of segments) {
    parent = await parent.getDirectoryHandle(segment, { create });
  }
  return { parent, name };
}
