# Architecture

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite, SPA | Fast iteration, no server needed for Phase 0/1, deploys as static files to Firebase Hosting (already set up) |
| Auth | Firebase Authentication (Google + email link) | Matches the account requirement; Google sign-in doubles as the first step toward Google Drive access |
| Database | Firestore | Profile docs, story/material metadata, review state. No relational needs yet |
| File storage (app-managed) | Firebase Storage | For files the app itself stores (as opposed to files left in a user's own Drive) |
| External storage | Google Drive API (OAuth, incremental scopes) | Per [[02-storage-abstraction]] |
| Hosting | Firebase Hosting, existing project `zikaronbasalon-story-studio` | Already created; will add a second Hosting site/target for the real app, separate from the `design/canvas/site` mockup |

No backend framework yet. If server-side logic is needed later (e.g. exchanging a Drive OAuth code, or eventually running AI calls), it goes in Firebase Cloud Functions — deferred until a use case actually needs it, per "don't build for hypothetical requirements."

## Why not the existing mockup site's structure

`design/canvas/site/*.html` is static, hand-authored HTML for showing the concept, not a codebase to build features into. The real app is a new source tree (`app/`) with its own build. The mockup site stays as-is for reference/demo purposes.

## Project layout

```
app/
  src/
    lib/
      firebase.ts          — Firebase app init (auth, firestore, storage)
      storage/
        types.ts            — StorageProvider interface (see 02)
        localFsProvider.ts
        googleDriveProvider.ts
    features/
      auth/                 — sign-in, session state
      profile/              — profile form + Firestore read/write
      storage-connect/       — "connect a location" UI, provider picker
      collection/            — Collection Wizard (materials list, guided interview)
    app.tsx, main.tsx
  firebase config: reuses the existing `zikaronbasalon-story-studio` project
```

## Data model (Firestore, Phase 0/1 only)

```
users/{uid}                        — profile (see 03-auth-profiles.md)
stories/{storyId}                  — one testimony-in-progress
  .ownerUid, .title, .subjectName, .createdAt
  .storageProvider: "local" | "google-drive"
  .storageRef: opaque pointer the provider understands
stories/{storyId}/materials/{id}   — one uploaded/linked material
  .filename, .kind (photo|document|audio|other), .tags[]
  .providerFileRef                 — provider-specific file pointer
  .reviewState: "needs-review" | "reviewed"
stories/{storyId}/interview/{category} — guided-interview answers
  .category: "life-before" | "war-period" | "message-today"
  .answer, .updatedAt, .updatedByUid
```
