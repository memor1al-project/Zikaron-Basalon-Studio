import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

export type UserRole = "family" | "host" | "staff";

export interface UserProfile {
  displayName: string;
  email: string;
  role: UserRole;
  languagePreference: "en" | "he";
  relationshipNote?: string;
}

function requireDb() {
  if (!db) throw new Error("Firebase is not configured — see app/.env.example");
  return db;
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(requireDb(), "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function saveProfile(uid: string, profile: UserProfile, isFirstSave: boolean): Promise<void> {
  await setDoc(
    doc(requireDb(), "users", uid),
    {
      ...profile,
      lastActiveAt: serverTimestamp(),
      ...(isFirstSave ? { createdAt: serverTimestamp() } : {}),
    },
    { merge: true }
  );
}
