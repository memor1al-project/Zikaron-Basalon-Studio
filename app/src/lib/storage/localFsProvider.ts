import type {
  ProviderFile,
  ProviderFileRef,
  StorageConnection,
  StorageProvider,
} from "./types";

// Files picked via the browser File System Access API (or drag-and-drop
// fallback) live only in memory for this session — nothing is uploaded
// unless a later step explicitly imports a file.
const fileHandles = new Map<string, File>();

/**
 * The Studio's own metadata sidecar (see localMetaStore.ts). It lives in the connected
 * folder but is bookkeeping, not a material, so it never appears in the materials list.
 *
 * Declared here rather than in localMetaStore.ts because every entry point into this
 * provider has to filter it out, and importing it the other way round would be a cycle.
 */
export const METADATA_FILENAME = "zikaron-metadata.sqlite";

/**
 * Materials from outside the connected folder are keyed "external:<name>".
 *
 * Folder materials are keyed by their path within the folder, and a top-level file's path
 * is just its filename — so without this prefix an outside "I1.png" and the folder's own
 * "I1.png" were the SAME material. Removing one hid the other, and metadata written for
 * one overwrote the other's.
 */
export const EXTERNAL_ID_PREFIX = "external:";

export function isExternalId(id: string): boolean {
  return id.startsWith(EXTERNAL_ID_PREFIX);
}

/** The displayable filename behind a material id, external or not. */
export function displayNameForId(id: string): string {
  return isExternalId(id) ? id.slice(EXTERNAL_ID_PREFIX.length) : id;
}

/** Hidden/system entries and the Studio's own sidecar are not materials. */
function isMaterialFile(name: string): boolean {
  return !name.startsWith(".") && name !== METADATA_FILENAME;
}

/**
 * The connected folder itself, kept so metadata can be written back into it as a SQLite
 * sidecar (see localMetaStore.ts). Null on the <input webkitdirectory> fallback path,
 * which hands over files with no writable directory behind them.
 */
let directoryHandle: FileSystemDirectoryHandle | null = null;

export function getConnectedDirectory(): FileSystemDirectoryHandle | null {
  return directoryHandle;
}

/**
 * Names of materials added from somewhere other than the connected folder.
 *
 * These exist only for this session: a reload re-scans the folder and knows nothing about
 * a file picked from elsewhere on the drive, so they'd silently disappear along with any
 * metadata keyed to them. Tracked so the UI can offer to copy them in and make them real.
 */
const externalFiles = new Set<string>();

export function getExternalFileNames(): string[] {
  return Array.from(externalFiles);
}

function supportsFileSystemAccess(): boolean {
  return "showDirectoryPicker" in window;
}

/** People organise photos into subfolders; a scan that ignores them loses most of the story. */
const MAX_SCAN_DEPTH = 8;

async function scanDirectory(dirHandle: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;

  for await (const entry of dirHandle.values()) {
    // Skips hidden/system entries — macOS AppleDouble sidecars ("._name"), .DS_Store —
    // and the Studio's own metadata database.
    if (!isMaterialFile(entry.name)) continue;

    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      const file = await entry.getFile();
      // Keyed by path within the folder, not by bare filename: two subfolders each holding
      // a "scan001.jpg" are two different materials, and name-keying silently kept one.
      fileHandles.set(path, file);
    } else if (entry.kind === "directory") {
      await scanDirectory(entry as FileSystemDirectoryHandle, path, depth + 1);
    }
  }
}

async function loadDirectoryIntoMemory(dirHandle: FileSystemDirectoryHandle) {
  // Only the folder's own entries are cleared; materials from other locations are
  // reattached afterwards by restoreExternalFiles().
  fileHandles.clear();
  externalFiles.clear();
  await scanDirectory(dirHandle, "", 0);
}

export const localFsProvider: StorageProvider = {
  id: "local",
  displayName: "This device",

  async connect(): Promise<StorageConnection> {
    if (supportsFileSystemAccess()) {
      // readwrite, because the metadata sidecar is written back into this same folder.
      // @ts-expect-error — showDirectoryPicker isn't in the default TS lib yet
      const dirHandle: FileSystemDirectoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      directoryHandle = dirHandle;
      await loadDirectoryIntoMemory(dirHandle);
      await saveDirectoryHandle(dirHandle);
      return { providerId: "local", label: dirHandle.name };
    }

    // Fallback: caller renders a plain <input type="file" multiple webkitdirectory>
    // and calls registerFiles() below before listFiles() is used.
    return { providerId: "local", label: "Selected files" };
  },

  async listFiles(_conn: StorageConnection): Promise<ProviderFile[]> {
    // The map key is the path within the folder; file.name is only the basename, so a
    // nested material must be identified by the key to stay unique.
    const all = Array.from(fileHandles.entries()).map(([path, file]) => ({
      ref: { providerId: "local" as const, id: path },
      // Strip the "external:" namespace for display — it's an id detail, and letting it
      // through meant materials were shown, and recorded, as "external:I1.png".
      name: displayNameForId(path),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    }));
    return dedupeAgainstFolder(all);
  },

  async getFileBlob(_conn: StorageConnection, ref: ProviderFileRef): Promise<Blob> {
    const file = fileHandles.get(ref.id);
    if (!file) throw new Error(`Local file not found: ${ref.id}`);
    return file;
  },
};

/** Used by the drag-and-drop / <input> fallback path. */
export function registerLocalFiles(files: FileList | File[]) {
  directoryHandle = null;
  fileHandles.clear();
  for (const file of Array.from(files)) {
    if (!isMaterialFile(file.name)) continue;
    fileHandles.set(file.name, file);
  }
}

/** Adds more files without clearing what's already connected — the "+ Add" flow. */
export function addLocalFiles(files: FileList | File[]): ProviderFile[] {
  const added: ProviderFile[] = [];
  for (const file of Array.from(files)) {
    if (!isMaterialFile(file.name)) continue;
    // Picked through the file input, so it came from outside the connected folder until
    // it's copied in. Harmless if it happens to already live there — the copy is identical.
    const id = directoryHandle ? EXTERNAL_ID_PREFIX + file.name : file.name;
    fileHandles.set(id, file);
    if (directoryHandle) externalFiles.add(id);
    added.push({
      ref: { providerId: "local", id },
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  }
  return added;
}

/** Object URLs are cached and revoked together on connection change (see clearLocalFiles). */
const objectUrls = new Map<string, string>();

export function getLocalObjectUrl(filename: string): string | null {
  const file = fileHandles.get(filename);
  if (!file) return null;
  let url = objectUrls.get(filename);
  if (!url) {
    url = URL.createObjectURL(file);
    objectUrls.set(filename, url);
  }
  return url;
}

// --- Remembering the folder handle across reloads ---
// FileSystemDirectoryHandle is structured-cloneable, so IndexedDB can hold
// it directly. On return, the browser only needs a lightweight permission
// re-grant (queryPermission/requestPermission) — not the full picker.

const DB_NAME = "zikaron-story-studio";
const STORE_NAME = "handles";
const DIRECTORY_KEY = "lastDirectory";
/** Handles for materials picked from outside the connected folder, keyed "external:<name>". */
const EXTERNAL_PREFIX = "external:";
/** Directory handles for whole folders added alongside the main one, keyed "externaldir:<name>". */
const EXTERNAL_DIR_PREFIX = "externaldir:";

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putHandle(key: string, handle: FileSystemHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function allStoredHandles(prefix: string): Promise<{ key: string; handle: FileSystemHandle }[]> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const keysReq = store.getAllKeys();
      const valuesReq = store.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result as string[];
        const values = valuesReq.result as FileSystemFileHandle[];
        resolve(
          keys
            .map((key, i) => ({ key, handle: values[i] }))
            .filter((entry) => typeof entry.key === "string" && entry.key.startsWith(prefix))
        );
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return [];
  }
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, DIRECTORY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Best-effort — resume just won't be available next time.
  }
}

async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(DIRECTORY_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export type ResumeLocalResult = "resumed" | "needs-picker" | "unavailable";

/**
 * Tries to reopen the last-used folder without the full picker dialog.
 * Returns "resumed" (files loaded, ready to go), "needs-picker" (a handle
 * exists but the browser requires a full re-pick — some browsers don't
 * allow requestPermission() outside a picker at all), or "unavailable"
 * (nothing was remembered, e.g. first visit or a different browser).
 */
export async function tryResumeLocalDirectory(): Promise<ResumeLocalResult> {
  if (!supportsFileSystemAccess()) return "unavailable";
  const handle = await loadDirectoryHandle();
  if (!handle) return "unavailable";

  try {
    // @ts-expect-error — queryPermission/requestPermission aren't in the default TS lib yet
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      // @ts-expect-error — see above
      permission = await handle.requestPermission({ mode: "readwrite" });
    }
    if (permission !== "granted") return "needs-picker";

    directoryHandle = handle;
    await loadDirectoryIntoMemory(handle);
    return "resumed";
  } catch {
    return "needs-picker";
  }
}

export async function getResumedDirectoryLabel(): Promise<string | null> {
  const handle = await loadDirectoryHandle();
  return handle?.name ?? null;
}

/**
 * Copies session-only materials into the connected folder so they survive a reload.
 *
 * Explicitly user-triggered: writing someone's files into a folder on their machine isn't
 * something to do quietly behind a drag-and-drop.
 */
export async function copyExternalFilesIntoFolder(): Promise<number> {
  const dir = directoryHandle;
  if (!dir) throw new Error("No writable folder is connected");

  let copied = 0;
  for (const id of Array.from(externalFiles)) {
    const file = fileHandles.get(id);
    if (!file) {
      externalFiles.delete(id);
      continue;
    }
    const handle = await dir.getFileHandle(displayNameForId(id), { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(file);
    } finally {
      await writable.close();
    }
    externalFiles.delete(id);
    copied++;
  }
  return copied;
}

/**
 * Adds materials from somewhere other than the connected folder, keeping a handle to each.
 *
 * The handle is the whole point: a File from an <input> is a dead object once the tab
 * closes, whereas a FileSystemFileHandle survives in IndexedDB and reopens the real file
 * next session. That's what lets a story span several folders on the drive instead of
 * silently losing everything that wasn't inside the one that was picked.
 *
 * Returns null when the browser has no file-handle picker, so the caller can fall back
 * to a plain <input>.
 */
export async function pickExternalFiles(): Promise<ProviderFile[] | null> {
  if (!("showOpenFilePicker" in window)) return null;

  let handles: FileSystemFileHandle[];
  try {
    // @ts-expect-error — showOpenFilePicker isn't in the default TS lib yet
    handles = await window.showOpenFilePicker({ multiple: true });
  } catch {
    return []; // the picker was dismissed
  }

  const added: ProviderFile[] = [];
  for (const handle of handles) {
    const file = await handle.getFile();
    if (!isMaterialFile(file.name)) continue;
    const id = EXTERNAL_ID_PREFIX + file.name;
    fileHandles.set(id, file);
    externalFiles.add(id);
    await putHandle(EXTERNAL_PREFIX + file.name, handle).catch(() => {
      // Best-effort: it still works this session, just won't come back on its own.
    });
    added.push({
      ref: { providerId: "local", id },
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  }
  return added;
}

/**
 * Reopens materials previously picked from other locations.
 *
 * Called after the connected folder is scanned, so a story comes back whole. Files whose
 * permission was revoked or which have been moved are simply skipped — the sidecar still
 * lists them, and the UI shows them as missing rather than pretending they're gone.
 */
export async function restoreExternalFiles(): Promise<string[]> {
  const restored: string[] = [];
  for (const { handle } of await allStoredHandles(EXTERNAL_PREFIX)) {
    const fileHandle = handle as FileSystemFileHandle;
    try {
      // @ts-expect-error — queryPermission/requestPermission aren't in the default TS lib yet
      let permission = await handle.queryPermission({ mode: "read" });
      if (permission !== "granted") {
        // @ts-expect-error — see above
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") continue;

      const file = await fileHandle.getFile();
      const id = EXTERNAL_ID_PREFIX + file.name;
      fileHandles.set(id, file);
      externalFiles.add(id);
      restored.push(id);
    } catch {
      // Moved, renamed, or deleted since it was added.
    }
  }
  return restored;
}

/**
 * Drops a material from this session and forgets any handle kept for it.
 *
 * The file on disk is untouched — this only stops the Studio holding on to it. For a
 * material picked from another folder, deleting the handle is what actually makes the
 * removal stick across reloads.
 */
export async function forgetLocalFile(id: string): Promise<void> {
  fileHandles.delete(id);
  externalFiles.delete(id);

  const url = objectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(id);
  }

  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(EXTERNAL_PREFIX + displayNameForId(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing stored for it — removing from this session is enough.
  }
}

/**
 * Adds a whole second folder to the story.
 *
 * Picking individual files leaves a material with nothing but its filename, because a
 * FileSystemFileHandle exposes no path. Picking the folder gives the folder's name and
 * each file's path inside it, so a material can be described well enough to find on disk —
 * "photos-1948/albums/wedding.jpg" rather than "wedding.jpg". The directory handle is
 * stored, so the whole folder reattaches next session instead of file by file.
 */
export async function pickExternalFolder(): Promise<ProviderFile[] | null> {
  if (!supportsFileSystemAccess()) return null;

  let dirHandle: FileSystemDirectoryHandle;
  try {
    // @ts-expect-error — showDirectoryPicker isn't in the default TS lib yet
    dirHandle = await window.showDirectoryPicker({ mode: "read" });
  } catch {
    return []; // dismissed
  }

  await putHandle(EXTERNAL_DIR_PREFIX + dirHandle.name, dirHandle).catch(() => {});
  return absorbExternalDirectory(dirHandle);
}

/** Scans one added folder into the session, keyed by "<folder>/<path inside it>". */
async function absorbExternalDirectory(dirHandle: FileSystemDirectoryHandle): Promise<ProviderFile[]> {
  const before = new Set(fileHandles.keys());
  const staging = new Map<string, File>();
  const collected: ProviderFile[] = [];
  await scanInto(dirHandle, dirHandle.name, 0, staging);

  for (const [path, file] of staging) {
    const id = EXTERNAL_ID_PREFIX + path;
    if (before.has(id)) continue;
    fileHandles.set(id, file);
    externalFiles.add(id);
    collected.push({
      ref: { providerId: "local", id },
      name: path,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
  }
  return collected;
}

async function scanInto(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  out: Map<string, File>
): Promise<void> {
  if (depth > MAX_SCAN_DEPTH) return;
  for await (const entry of dirHandle.values()) {
    if (!isMaterialFile(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file") {
      out.set(path, await entry.getFile());
    } else if (entry.kind === "directory") {
      await scanInto(entry as FileSystemDirectoryHandle, path, depth + 1, out);
    }
  }
}

/** Reopens whole folders added in earlier sessions. */
export async function restoreExternalFolders(): Promise<number> {
  let restored = 0;
  for (const { key, handle } of await allStoredHandles(EXTERNAL_DIR_PREFIX)) {
    try {
      // @ts-expect-error — queryPermission/requestPermission aren't in the default TS lib yet
      let permission = await handle.queryPermission({ mode: "read" });
      if (permission !== "granted") {
        // @ts-expect-error — see above
        permission = await handle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") continue;
      await absorbExternalDirectory(handle as unknown as FileSystemDirectoryHandle);
      restored++;
    } catch {
      // Folder moved, renamed, or permission withdrawn.
      void key;
    }
  }
  return restored;
}

/**
 * Forgets every folder and file this browser remembers for local storage.
 *
 * Deleting the metadata database is not enough to start over: the materials themselves are
 * reached through handles kept in IndexedDB, so the next load reopens them, lists them, and
 * writes the database straight back. This clears the handles, the in-memory maps and the
 * object URLs, which is what actually returns the Studio to a blank slate.
 *
 * Nothing on disk is touched — only what the browser is holding on to.
 */
export async function forgetAllLocalStorage(): Promise<void> {
  fileHandles.clear();
  externalFiles.clear();
  directoryHandle = null;

  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();

  try {
    const db = await openHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Nothing stored, or storage unavailable — the in-memory reset above still applies.
  }
}

/** Same filename and same byte count — as close to "the same file" as the browser can tell. */
function identityOf(file: ProviderFile): string {
  const basename = file.name.split("/").pop() ?? file.name;
  return `${basename.toLowerCase()}:${file.sizeBytes ?? -1}`;
}

/**
 * Drops materials added from elsewhere that are already present in the connected folder.
 *
 * Copying a photo into the folder — or connecting the folder it was always in — leaves the
 * same picture listed twice: once as a folder material, once as the outside one it was
 * originally added as. They're separate ids by design, so nothing merged them, and the
 * family sees the same photograph twice with its notes on only one of them.
 *
 * The folder copy always wins: it has a stable path, it travels with the story, and it
 * doesn't depend on a browser-held handle surviving.
 */
export function dedupeAgainstFolder(files: ProviderFile[]): ProviderFile[] {
  const fromFolder = new Set(
    files.filter((f) => !isExternalId(f.ref.id)).map(identityOf)
  );
  return files.filter((f) => !(isExternalId(f.ref.id) && fromFolder.has(identityOf(f))));
}

/**
 * Outside materials that duplicate a folder material, as { externalId, folderId } pairs.
 *
 * The caller uses these to move any notes and tags onto the copy that's being kept, and to
 * stop tracking the outside one — otherwise its handle reattaches it on the next visit.
 */
export function duplicateExternalPairs(): { externalId: string; folderId: string }[] {
  const all = Array.from(fileHandles.entries()).map(([path, file]) => ({
    ref: { providerId: "local" as const, id: path },
    name: displayNameForId(path),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  }));

  const folderById = new Map<string, string>();
  for (const file of all) {
    if (!isExternalId(file.ref.id)) folderById.set(identityOf(file), file.ref.id);
  }

  const pairs: { externalId: string; folderId: string }[] = [];
  for (const file of all) {
    if (!isExternalId(file.ref.id)) continue;
    const folderId = folderById.get(identityOf(file));
    if (folderId) pairs.push({ externalId: file.ref.id, folderId });
  }
  return pairs;
}
