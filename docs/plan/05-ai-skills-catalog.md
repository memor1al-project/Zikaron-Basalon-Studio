# AI Skills Catalog — Visual & Textual Services

**Status:** this catalogs what already exists and works in the sibling `website` codebase (`/Volumes/X9 Pro/projects/website`), so AI-phase work here is ported/adapted, not built from scratch. As of 2026-09-06, **text summarize/timeline/story, image face-extraction, and video/audio voice-to-text + summarize are built** in `Zikaron-BeSalon/app` + `functions/` (see [04-roadmap.md](04-roadmap.md)). The remaining rows below (face recognition/matching, age estimation, image description/enhancement, voice cloning+TTS, storyline/podcast narration, events map/proximity) are still just reference — none of it has been built for this project yet.

Every skill below is grounded in a real, already-working service in `website` — full file path and exported functions included — so this list can be checked against the code, not just against this doc. Text summarize/timeline/story, image face-extraction, and video/audio voice-to-text + summarize have been ported into `Zikaron-BeSalon/app` + `functions/` (see the status line above); everything else in this table is still reference only.

**For actual copy-pasteable code**, not just this summary table, see the Claude Code skills at [`.claude/skills/`](../../.claude/skills/) — one per row group below (`memorial-video-ai`, `memorial-image-ai`, `memorial-audio-ai`, `memorial-text-ai`, `memorial-events-map-ai`). Each has a `SKILL.md` overview plus `references/*.md` files with real extracted functions, gotchas, and a "depends on" list of every other service involved — written to be dropped into *any* project, not just this one. This table is the index; those folders are the working reference.

## Video

Runnable skill: [`.claude/skills/memorial-video-ai/`](../../.claude/skills/memorial-video-ai/SKILL.md)

| Skill | What it does | Source |
|---|---|---|
| **Voice-to-text (transcribe)** | Extracts audio from a video client-side (FFmpeg.wasm), chunks it, sends to Gemini for speech-to-text, returns a transcript — optionally with sentence-level timestamps (`withTimestamps`), which is what chapter boundaries and captions are built from. **Built** — `app/src/features/collection/transcriptionService.ts` (client) + `functions/src/routes/materials.ts` `POST /transcribe` (server). | `/Volumes/X9 Pro/projects/website/services/transcriptionService.ts` — `transcribeVideo`, `extractAudioFromVideo`, `splitAudioIntoChunks`, `transcribeAudio` |
| **Segment (frame/voice extraction)** | Pulls frames at intervals and isolates a clean voice sample from a testimony video, for downstream face/voice work. Client-side (FFmpeg.wasm + face-api.js) and server-side (system ffmpeg) variants exist. | `/Volumes/X9 Pro/projects/website/services/videoExtractionService.ts` — `extractFramesFromVideo`, `extractVoiceSample`; server variant: `/Volumes/X9 Pro/projects/website/services/educationVideoExtractionService.ts` — `extractFramesServerSide`, `extractVoiceSampleServerSide` |
| **Summarize** | Composed, not a dedicated video summarizer: transcribe (above) → text summarize (below). **Built** in `Zikaron-BeSalon` — `MediaAiActions` in `app/src/features/collection/MaterialDetail.tsx` calls `summarizeMaterialText` on the transcript. | — (composed) |
| **Chapter a testimony (Testimony Navigator)** | Splits a testimony video into named, navigable chapters (title + plain-language summary + topic tags + start/end) so an elderly viewer can jump to a part instead of scrubbing. **Built** — `functions/src/services/geminiMaterials.ts` `segmentTestimony` + `POST /api/materials/segment`; UI in `app/src/features/testimony/`; batch prep for the example stories in `scripts/segment-testimony-videos.mjs`. | New in this project — no `website` equivalent |
| **Back-engineer a testimony into a wizard story** | Answers the Collection Wizard's own guided-interview questions from a finished testimony, tagging every answer with the chapters it came from and leaving genuinely unanswered questions blank — a worked example families can read before facing the blank form. **Built** — `functions/src/services/geminiMaterials.ts` `backEngineerStory`; batch prep in `scripts/build-example-stories.mjs`; UI in `app/src/features/testimony/ExampleStoryPanel.tsx`. Questions come from `app/src/features/collection/storySections.json`, shared with the wizard so the two can't drift. | New in this project — no `website` equivalent |
| **Image-to-video / talking-photo animation** | Turns a still photo + narration text into a lip-synced talking video, via HeyGen or Gemini Veo (pluggable provider). | `/Volumes/X9 Pro/projects/website/services/videoAnimationProvider.ts`; API: `/Volumes/X9 Pro/projects/website/functions/src/api/heygen.ts` |

## Image

Runnable skill: [`.claude/skills/memorial-image-ai/`](../../.claude/skills/memorial-image-ai/SKILL.md)

| Skill | What it does | Source |
|---|---|---|
| **Extract faces** | Detects faces in a frame/image (SSD MobileNet + 68-point landmarks + 128-d descriptor via face-api.js), crops the best face. | `/Volumes/X9 Pro/projects/website/services/videoExtractionService.ts` — `detectFacesInFrames`, `extractBestFaceImage`; API: `/Volumes/X9 Pro/projects/website/functions/src/api/faces.ts` |
| **Recognize / match known faces** | Compares a face descriptor against a known-faces registry (Euclidean distance, threshold ~0.6) to identify who's in a photo. | `/Volumes/X9 Pro/projects/website/services/faceRecognitionService.ts` |
| **Estimate age** | Estimates a person's age and life stage (infant → senior) from a face image via Gemini Vision. | `/Volumes/X9 Pro/projects/website/services/faceAgeEstimationService.ts` |
| **Describe** | Generates a structured description of a photo (subjects, setting, era, mood, on-image text) via Gemini Vision. | `/Volumes/X9 Pro/projects/website/services/imageDescriptionService.ts` — `describeImage` |
| **Extract images from documents** | Pulls embedded photos out of PDFs / Word docs (sharp, mammoth, pdf-parse) — used for memoir/scanned-document pages. | `/Volumes/X9 Pro/projects/website/services/documentImageExtractionService.ts` |
| **Locate + annotate sub-images on a scanned page** | Finds individual photos/certificates within a scanned book page, with bounding boxes and per-image metadata (people, place, date). | `/Volumes/X9 Pro/projects/website/services/survivorStoryImageService.ts` |
| **Enhance** | Upscale, colorize, denoise, sharpen historical photos — fast local mode (sharp/Lanczos3) or Google Imagen (Vertex AI) for higher quality. | `/Volumes/X9 Pro/projects/website/services/imageEnhancementService.ts`; API: `/Volumes/X9 Pro/projects/website/functions/src/api/*` per `/Volumes/X9 Pro/projects/website/docs/IMAGE_ENHANCEMENT.md` |
| **Find/attribute images for a place** | Finds images for a location (local family archive match, or Wikimedia Commons search + cache) — feeds the map skill below. | `/Volumes/X9 Pro/projects/website/services/migrationImageService.ts` |

## Audio

Runnable skill: [`.claude/skills/memorial-audio-ai/`](../../.claude/skills/memorial-audio-ai/SKILL.md)

| Skill | What it does | Source |
|---|---|---|
| **Voice-to-text (transcribe)** | Same Gemini-based pipeline as video, for standalone audio testimony uploads. **Built** (same `transcriptionService.ts` handles both — it skips the video-extraction step for audio-only files). | `/Volumes/X9 Pro/projects/website/services/transcriptionService.ts` — `transcribeAudioFile`, `transcribeAudio`; upload flow in `/Volumes/X9 Pro/projects/website/docs/MEDIA_UPLOAD_TRANSCRIPTION.md` |
| **Segment / compress** | Splits long audio into chunks and compresses for processing limits. | `/Volumes/X9 Pro/projects/website/services/transcriptionService.ts` — `splitAudioIntoChunks`, `compressAudioFile` |
| **Voice cloning + TTS** | Clones a person's voice (ElevenLabs) from a sample, or falls back to Gemini TTS; used to narrate generated scripts in the person's own voice. | `/Volumes/X9 Pro/projects/website/services/elevenLabsService.ts` — `cloneVoice`, `textToSpeechWithClonedVoice`, `ensureVoiceCloned` |
| **Summarize** | No standalone audio summarizer — same as video, composes with the text-summarize skill after transcription. **Built** (same `MediaAiActions` component handles both video and audio). | — (composed) |

## Text

Runnable skill: [`.claude/skills/memorial-text-ai/`](../../.claude/skills/memorial-text-ai/SKILL.md)

| Skill | What it does | Source |
|---|---|---|
| **Summarize** | Analyzes an uploaded document/attachment and produces a summary plus extracted entities (people, orgs, locations, dates, events) and keywords. | `/Volumes/X9 Pro/projects/website/services/attachmentAnalysisService.ts` — `analyzeAttachment`, `generateEntitySummary` |
| **Build timeline** | Extracts a structured timeline (date, title, 2–3 sentence story, people/places/event-type) from a document or from all of a person's known sources. | `/Volumes/X9 Pro/projects/website/services/attachmentAnalysisService.ts` — `extractTimeline`, `generatePersonTimeline` |
| **Create a story (narrated storyline)** | Turns selected timeline events into a narrated storyline: Gemini writes narration per event → TTS (cloned voice, ElevenLabs, with Gemini TTS fallback) → matches existing photos/videos to each event by place + year. | `/Volumes/X9 Pro/projects/website/services/storylineService.ts` — `generateStoryline`, `generateEventNarration`, `matchMediaToEvent` |
| **Create a story (long-form / podcast)** | Aggregates a person's full knowledge (bio, relationships, timeline, document mentions) into a documentary-style narrated podcast script + WAV audio. | `/Volumes/X9 Pro/projects/website/services/podcastService.ts`; `/Volumes/X9 Pro/projects/website/docs/PODCAST_GENERATION.md` |
| **Aggregate person knowledge** | Collects everything known about a person (basic info, relationships, appearances across sources) into one summary object — the input most other text skills build on. | `/Volumes/X9 Pro/projects/website/services/personSummaryService.ts` — `getPersonSummary` |

## Events Map & Timeline

Runnable skill: [`.claude/skills/memorial-events-map-ai/`](../../.claude/skills/memorial-events-map-ai/SKILL.md)

| Skill | What it does | Source |
|---|---|---|
| **Contextual map from locations + timeline** | Computes a person's migration path by combining birth/death data with every timeline event that has a location, in chronological order, with per-waypoint imagery. | `/Volumes/X9 Pro/projects/website/services/migrationMapService.ts` — `computeMigrationMapData`; waypoint images via `/Volumes/X9 Pro/projects/website/services/migrationImageService.ts` |
| **Timeline lookup index** | Maintains a person → timeline-files index so timeline data doesn't require re-scanning every file; underlies both the map and timeline-building skills. | `/Volumes/X9 Pro/projects/website/services/timelineIndexService.ts` |
| **Proximity graph (people × time × place)** | Computes multi-dimensional closeness between people: family relation, time overlap, geographic proximity, co-occurrence, cross-references — useful for "who else was here/then" context. | `/Volumes/X9 Pro/projects/website/services/proximityService.ts` — `computeProximityGraph`, `computeGeographicMetric`, `computeTimeMetric` |

## Gaps worth noting

- **No direct video/audio summarizer** — both routes go through transcription first, then the text summarizer. Fine to keep composed rather than building a shortcut, unless a wizard step needs a single call.
- All of the above are Node/browser TypeScript services tied to `website`'s filesystem-based resource layout (`resources/families/{FamilyName}/...`) and its own Firebase functions. Porting into `Zikaron-BeSalon/app` means re-pointing them at this project's storage abstraction ([02-storage-abstraction.md](02-storage-abstraction.md)) rather than assuming a local filesystem.
