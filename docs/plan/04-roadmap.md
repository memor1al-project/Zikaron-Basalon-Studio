# Roadmap — task-level

## Now building (this session)

- [ ] `app/` scaffold: Vite + React + TypeScript, Firebase SDK wired to the existing `zikaronbasalon-story-studio` project
- [ ] Firebase Auth: Google + email-link sign-in
- [ ] Profile: first-sign-in form (role, language, name) writing to `users/{uid}`, read back on subsequent visits
- [ ] Storage provider interface + local file system provider (File System Access API / drag-and-drop)
- [ ] Storage provider: Google Drive (picker + read-only OAuth)
- [ ] Story creation: pick a storage location, create a `stories/{id}` doc
- [ ] Materials list: read files from the connected provider, show as a grid with a manual tag field
- [ ] Guided interview: three-category form, saves to `stories/{id}/interview`
- [ ] Review gate: staff-only "mark reviewed" action on a story

## Now building (AI phase, text + image + video/audio)

- [x] Cloud Functions backend (`functions/`): Gemini-backed `/api/materials/{summarize,timeline,story,transcribe}`, Firebase ID-token auth
- [x] Collection Wizard: text materials get Summarize / Build timeline / Create a story actions
- [x] Collection Wizard: image materials get client-side (face-api.js) face extraction
- [x] Collection Wizard: video/audio materials get Voice-to-text (FFmpeg.wasm extraction/compression/chunking client-side, Gemini transcription server-side) and Summarize (composed from the transcript via the existing text-summarize endpoint) — ported per `docs/plan/05-ai-skills-catalog.md` / `.claude/skills/memorial-video-ai`, `memorial-audio-ai`. "Segment" was deliberately skipped — no real semantic segmentation exists to build on.
- [ ] Deploy: set the `GEMINI_API_KEY` secret and verify against the real Firebase project (see `functions/README` / plan doc)

Standing caveat: only exercise these AI actions against synthetic/sample materials — real survivor testimony is blocked on the still-open consent/privacy decision (see [[project_open_items]] in memory).

## Now building (Presentation Wizard, first step)

- [x] Example stories gallery (`/presentation/examples`) — thumbnail grid of real Zikaron BaSalon testimony videos from the org's official YouTube channel (`@zikaronbasalon`), click-to-play in an embedded YouTube player. Matches Zikaron-Basalon.md's "tutorial showcasing existing stories as use case examples." Data collected by `scripts/collect-testimony-videos.mjs` (metadata/thumbnails only, via `yt-dlp`, no video content downloaded) into `app/src/features/presentation/exampleTestimonies.json`, filtered to 14 videos by a title-keyword heuristic — see the script's own output for a handful of borderline long videos (bare person names, no keyword match) left out for manual review.
- [ ] Rest of the Presentation Wizard: narrative outline builder, memorial webpage output — not started

## Next phase (not started)

- AI-assisted suggested connections and historical context (needs the above data model first)
- Text-to-speech
- Additional languages beyond EN/HE

## Explicitly not now

- Real testimony data of any kind (blocked on the open consent/privacy decision)
- Write-back to Drive, network/org drives
- Multi-user collaboration on one story
