# Storage Abstraction

Materials (photos, letters, audio, documents) can live in different places depending on the family. The app talks to all of them through one interface, so the rest of the app never knows which provider it's using.

## Providers, Phase 0/1

1. **Local file system** — files the user picks from their own device via the browser's File System Access API (Chrome/Edge) with a drag-and-drop fallback everywhere else. Nothing leaves the browser except what's explicitly uploaded to Firebase Storage or referenced by metadata.
2. **Google Drive** — a folder the user picks via the Google Picker API, after OAuth (`drive.readonly` + `drive.file` scopes — never full Drive access). The app stores file *references* (Drive file IDs), not copies, unless the user explicitly imports a copy.

A provider is a pluggable slot — a third one (Dropbox, OneDrive, etc.) can be added later without touching calling code, per the earlier scoping answer that this should stay general rather than hard-coded to Google Drive alone.

## Interface

```ts
interface StorageProvider {
  id: "local" | "google-drive";
  connect(): Promise<StorageConnection>;          // triggers picker / OAuth as needed
  listFiles(conn: StorageConnection): Promise<ProviderFile[]>;
  getFileBlob(conn: StorageConnection, ref: ProviderFileRef): Promise<Blob>;
  // no write/delete in Phase 0/1 — read-only against the source location
}

interface ProviderFile {
  ref: ProviderFileRef;      // opaque, provider-specific
  name: string;
  mimeType: string;
  sizeBytes?: number;
}
```

## What's explicitly deferred

- Write-back to Drive (e.g. saving an edited file to the original folder) — Phase 0/1 is read + reference only.
- Network/organizational drive (SMB, NAS) — out of scope per this round's clarification; local + Google Drive only for now.
- Conflict handling for a file that changes in Drive after import — not needed until write-back exists.

## Security note

Google Drive OAuth tokens are never stored in Firestore in plaintext. Phase 0/1 keeps the access token in memory / browser session only, re-prompting on new sessions; a Cloud Function-backed refresh-token flow is a later-phase decision, made when persistent Drive access is actually needed.
