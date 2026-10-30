// Read-only scope only — never request broader Drive access than this needs.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let cachedToken: string | null = null;

/**
 * Uses a plain Google Identity Services token client, deliberately
 * SEPARATE from Firebase Auth's signInWithPopup. Reusing Firebase's `auth`
 * object for this (via GoogleAuthProvider.addScope + signInWithPopup) was
 * tried first, but the popup handshake caused Firebase's onAuthStateChanged
 * to transiently emit a null/changed user, which bounced the app's route
 * guards back through /sign-in. A standalone GIS token request never
 * touches the app's auth session, so it can't cause that.
 */
export async function requestDriveAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("Google Drive isn't configured (missing VITE_GOOGLE_OAUTH_CLIENT_ID)");

  await waitForGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    // @ts-expect-error — google.accounts.oauth2 comes from the GIS script, not typed here
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? "Google didn't grant Drive access"));
          return;
        }
        cachedToken = resp.access_token;
        resolve(cachedToken);
      },
      error_callback: (err: { type?: string }) => {
        reject(new Error(err.type ?? "Google Drive authorization was cancelled"));
      },
    });
    client.requestAccessToken();
  });
}

function waitForGoogleIdentityServices(): Promise<void> {
  // @ts-expect-error — see above
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      // @ts-expect-error — see above
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 8000) {
        clearInterval(timer);
        reject(new Error("Google's sign-in library didn't load in time"));
      }
    }, 100);
  });
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  sizeBytes?: number;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
// Google-native docs (Sheets/Docs/Slides/...) need a separate export
// endpoint, not alt=media — out of scope for Phase 0/1, so they're hidden
// from the file list rather than shown as unusable.
const OTHER_GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

export async function listDriveFolder(token: string, folderId: string): Promise<{ folderName: string; items: DriveItem[] }> {
  const [meta, children] = await Promise.all([
    folderId === "root"
      ? Promise.resolve({ name: "My Drive" })
      : driveFetch(token, `/files/${folderId}?fields=name`).then((r) => r.json()),
    driveFetch(
      token,
      `/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed = false`)}&fields=files(id,name,mimeType,size)&pageSize=200&orderBy=folder,name`
    ).then((r) => r.json()),
  ]);

  const items: DriveItem[] = (children.files ?? [])
    .filter((f: { mimeType: string }) => f.mimeType === FOLDER_MIME || !f.mimeType.startsWith(OTHER_GOOGLE_NATIVE_PREFIX))
    .map((f: { id: string; name: string; mimeType: string; size?: string }) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === FOLDER_MIME,
      sizeBytes: f.size ? Number(f.size) : undefined,
    }));

  return { folderName: meta.name, items };
}

export async function downloadDriveFile(token: string, fileId: string): Promise<Blob> {
  const res = await driveFetch(token, `/files/${fileId}?alt=media`);
  return res.blob();
}

const objectUrlCache = new Map<string, Promise<string>>();

/** Downloads once and caches the object URL, so a re-rendered card doesn't refetch. */
export function getDriveObjectUrl(fileId: string): Promise<string> {
  let pending = objectUrlCache.get(fileId);
  if (!pending) {
    pending = requestDriveAccessToken()
      .then((token) => downloadDriveFile(token, fileId))
      .then((blob) => URL.createObjectURL(blob));
    objectUrlCache.set(fileId, pending);
  }
  return pending;
}

async function driveFetch(token: string, path: string): Promise<Response> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Google Drive request failed (${res.status})`);
  return res;
}
