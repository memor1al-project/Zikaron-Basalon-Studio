import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { StorageProviderId } from "../../lib/storage/types";

/**
 * Phase 0/1 simplification: one active story per user, keyed by uid.
 * The full stories/{storyId} model (docs/plan/01-architecture.md) waits
 * until multi-story support is actually needed.
 */
export interface PersistedStory {
  storageProvider: StorageProviderId;
  storageLabel: string;
  driveFolderId?: string; // only set when storageProvider === "google-drive"
  fileCount?: number;
}

function requireDb() {
  if (!db) throw new Error("Firebase is not configured");
  return db;
}

export async function getCurrentStory(uid: string): Promise<PersistedStory | null> {
  const snap = await getDoc(doc(requireDb(), "stories", uid));
  return snap.exists() ? (snap.data() as PersistedStory) : null;
}

export async function saveStorageConnection(uid: string, story: PersistedStory): Promise<void> {
  await setDoc(
    doc(requireDb(), "stories", uid),
    { ownerUid: uid, ...story, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
