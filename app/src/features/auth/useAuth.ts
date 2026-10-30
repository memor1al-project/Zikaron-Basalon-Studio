import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, firebaseConfigured } from "../../lib/firebase";

const EMAIL_LINK_STORAGE_KEY = "zikaron-email-for-signin";

export interface AuthState {
  user: User | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured — see app/.env.example");
  return auth;
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  await signInWithPopup(requireAuth(), provider);
}

export async function sendEmailSignInLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(requireAuth(), email, {
    url: window.location.href,
    handleCodeInApp: true,
  });
  window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
}

/** Call on app load — completes sign-in if the current URL is an email sign-in link. */
export async function completeEmailSignInIfPresent(): Promise<void> {
  if (!auth || !isSignInWithEmailLink(auth, window.location.href)) return;

  let email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
  if (!email) {
    email = window.prompt("Confirm your email to finish signing in") ?? "";
  }
  if (!email) return;

  await signInWithEmailLink(auth, email, window.location.href);
  window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
}

export async function signOutUser(): Promise<void> {
  await signOut(requireAuth());
}
