import {
  deleteMaterialMeta,
  listMaterialMetas,
  saveMaterialMeta,
  type MaterialMeta,
} from "./materialsMetaService";
import {
  getCatalogStats,
  listLocalMaterialMetas,
  listLocalMaterials,
  localMetaStoreAvailable,
  localMetaStoreFilename,
  listRemovedKeys,
  listRemovedMaterials,
  listThumbnailedKeys,
  rekeyLocalMaterial,
  removeLocalMaterial,
  restoreLocalMaterial,
  saveLocalMaterialMeta,
  saveLocalThumbnail,
  type CatalogStats,
  type LocalMaterialRecord,
} from "../../lib/storage/localMetaStore";
import type { StorageConnection } from "../../lib/storage/types";

/**
 * Where a story's material metadata lives.
 *
 * A folder on this device keeps its metadata in a SQLite file inside that folder, so the
 * notes and tags travel with the materials and survive signing out, a cleared browser, or
 * Firestore being unreachable. Google Drive connections have no such place to write, so
 * they stay in Firestore.
 *
 * The fallback path (<input webkitdirectory>, used where the File System Access API is
 * missing) hands over files with no writable folder behind them, so it also uses Firestore.
 */

export type MetaStoreKind = "local-file" | "cloud";

export function metaStoreKindFor(connection: StorageConnection | null): MetaStoreKind {
  return connection?.providerId === "local" && localMetaStoreAvailable() ? "local-file" : "cloud";
}

/** A sentence describing where edits are being written, for the UI to show. */
export function metaStoreDescription(
  kind: MetaStoreKind,
  t: (text: string) => string = (text) => text
): string {
  return kind === "local-file"
    ? t("Saved to {file} in this folder, alongside your materials.").replace("{file}", localMetaStoreFilename())
    : t("Saved to your account.");
}

/** metaKeyFor() encodes the ref as "<providerId>_<encoded id>"; for local files the id is the filename. */
function nameFromKey(key: string): string {
  const separator = key.indexOf("_");
  return separator === -1 ? key : decodeURIComponent(key.slice(separator + 1));
}

export async function listMetas(
  connection: StorageConnection | null,
  uid: string
): Promise<Record<string, MaterialMeta>> {
  if (metaStoreKindFor(connection) !== "local-file") return listMaterialMetas(uid);

  const local = await listLocalMaterialMetas();
  if (Object.keys(local).length > 0) return local;

  // Empty sidecar: this folder has never been edited since metadata moved into it. Anything
  // already saved to the account gets copied in once, so switching to local storage can't
  // strand work that's sitting in the cloud.
  try {
    const cloud = await listMaterialMetas(uid);
    const entries = Object.entries(cloud);
    if (entries.length === 0) return local;
    for (const [key, meta] of entries) {
      await saveLocalMaterialMeta(key, nameFromKey(key), meta);
    }
    return cloud;
  } catch {
    // Signed out, offline, or Firestore unreachable — the empty sidecar is still correct.
    return local;
  }
}

/**
 * One material's saved metadata, straight from wherever it lives.
 *
 * The detail panel reads through this rather than trusting a map handed down from the
 * page: the page loads that map asynchronously, and a panel opened from a link elsewhere
 * in the app can mount before it arrives — leaving the material looking untouched when its
 * text, tags and AI results are sitting in the store.
 *
 * Built on listMetas so both paths share the local-folder fallback rather than growing a
 * second, subtly different read.
 */
export async function getMeta(
  connection: StorageConnection | null,
  uid: string,
  key: string
): Promise<MaterialMeta | null> {
  const all = await listMetas(connection, uid);
  return all[key] ?? null;
}

export async function saveMeta(
  connection: StorageConnection | null,
  uid: string,
  key: string,
  name: string,
  meta: MaterialMeta,
  provenance?: { source: "folder" | "external"; origin: string }
): Promise<void> {
  if (metaStoreKindFor(connection) === "local-file") {
    await saveLocalMaterialMeta(key, name, meta, provenance);
    return;
  }
  await saveMaterialMeta(uid, key, meta);
}

/**
 * Every material the folder's database remembers, including ones whose file isn't
 * currently reachable. Empty for cloud-backed connections, which have no such record.
 */
export async function listRecordedMaterials(
  connection: StorageConnection | null
): Promise<LocalMaterialRecord[]> {
  return metaStoreKindFor(connection) === "local-file" ? listLocalMaterials() : [];
}

/** Keys that already have a stored preview, so a backfill only does the work once. */
export async function thumbnailedKeys(connection: StorageConnection | null): Promise<Set<string>> {
  return metaStoreKindFor(connection) === "local-file" ? listThumbnailedKeys() : new Set();
}

export async function storeThumbnail(
  connection: StorageConnection | null,
  key: string,
  name: string,
  thumbnail: string
): Promise<void> {
  if (metaStoreKindFor(connection) !== "local-file") return;
  await saveLocalThumbnail(key, name, thumbnail);
}

/**
 * Takes a material out of the story. The underlying file is never deleted — for a local
 * folder this records a tombstone so the next scan doesn't put it back.
 */
export async function removeMaterial(
  connection: StorageConnection | null,
  uid: string,
  key: string,
  name: string
): Promise<void> {
  if (metaStoreKindFor(connection) === "local-file") {
    await removeLocalMaterial(key, name);
    return;
  }
  await deleteMaterialMeta(uid, key);
}

/** Materials the story has removed, so they stay out of the list after a rescan. */
export async function removedKeys(connection: StorageConnection | null): Promise<Set<string>> {
  return metaStoreKindFor(connection) === "local-file" ? listRemovedKeys() : new Set();
}

export async function restoreMaterial(connection: StorageConnection | null, key: string): Promise<void> {
  if (metaStoreKindFor(connection) !== "local-file") return;
  await restoreLocalMaterial(key);
}

/** What the story is currently holding back, for an explicit "removed" list. */
export async function listRemoved(
  connection: StorageConnection | null
): Promise<{ key: string; name: string }[]> {
  return metaStoreKindFor(connection) === "local-file" ? listRemovedMaterials() : [];
}

/** Puts every removed material back — the way out of a removal that hid more than intended. */
export async function restoreAllMaterials(connection: StorageConnection | null): Promise<number> {
  if (metaStoreKindFor(connection) !== "local-file") return 0;
  const rows = await listRemovedMaterials();
  for (const row of rows) await restoreLocalMaterial(row.key);
  return rows.length;
}

/** A snapshot of the sidecar database file itself, for the admin catalog dashboard. Null when this connection has no local file (cloud-backed, or no folder connected). */
export async function catalogStats(connection: StorageConnection | null): Promise<CatalogStats | null> {
  return metaStoreKindFor(connection) === "local-file" ? getCatalogStats() : null;
}

export async function rekeyMaterial(
  connection: StorageConnection | null,
  oldKey: string,
  newKey: string,
  newName: string
): Promise<void> {
  if (metaStoreKindFor(connection) !== "local-file") return;
  await rekeyLocalMaterial(oldKey, newKey, newName);
}
