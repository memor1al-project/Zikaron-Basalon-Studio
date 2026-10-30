import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { EMPTY_TREE, type FamilyTree, type TreePerson, type TreeUnion } from "./familyTree";

/**
 * The tree lives beside the interview sections, at stories/{uid}/details/familyTree —
 * the same one-doc-per-part shape interviewService.ts uses, and already covered by the
 * stories/{storyId}/{subcollection=**} rule, so no rules change was needed.
 *
 * One document holds the whole tree rather than a doc per person: a family tree is read
 * and drawn all at once, and a few hundred people sit far inside Firestore's 1MB limit.
 */

function requireDb() {
  if (!db) throw new Error("Firebase is not configured");
  return db;
}

export async function getFamilyTree(uid: string): Promise<FamilyTree> {
  const snap = await getDoc(doc(requireDb(), "stories", uid, "details", "familyTree"));
  if (!snap.exists()) return EMPTY_TREE;
  const data = snap.data();
  return {
    people: (data.people ?? []) as TreePerson[],
    unions: (data.unions ?? []) as TreeUnion[],
  };
}

/**
 * Firestore's hard per-document limit is 1MB. Portraits are the only part of a tree that
 * can approach it, so the check happens here with a message naming the cause — a rejected
 * write deep inside the SDK would otherwise surface as an opaque failure after someone has
 * spent an afternoon on their tree.
 */
const MAX_DOC_BYTES = 900_000;

export async function saveFamilyTree(uid: string, tree: FamilyTree): Promise<void> {
  // Firestore rejects undefined, and optional fields here are frequently unset.
  const payload = { people: tree.people.map(stripUndefined), unions: tree.unions };

  const size = new Blob([JSON.stringify(payload)]).size;
  if (size > MAX_DOC_BYTES) {
    throw new Error(
      `This tree is too large to save (${Math.round(size / 1000)}KB of a 1MB limit). Removing some portraits will bring it back under.`
    );
  }

  await setDoc(
    doc(requireDb(), "stories", uid, "details", "familyTree"),
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

function stripUndefined(person: TreePerson): TreePerson {
  return Object.fromEntries(Object.entries(person).filter(([, v]) => v !== undefined)) as TreePerson;
}
