---
name: memorial-image-ai
description: Reference for AI image processing in oral-history/memorial and archive projects — extracting and recognizing faces, estimating age from a face, describing a photo, extracting embedded images from scanned documents/PDFs/DOCX, locating numbered sub-images on a scanned memoir page, and enhancing (upscale/colorize/denoise/sharpen) historical photos. Use when building or adapting any feature that analyzes, tags, crops, or improves photographs. Every pattern here is copied from working code in the sibling `website` Firebase project (Zikaron BaSalon) — check the referenced files there before assuming an API has changed.
---

# Image AI Services

Six independent capabilities. Most call Gemini Vision with a `responseSchema` (structured JSON output) rather than free-text parsing — that's the pattern to imitate for any new Gemini-vision feature.

## Capabilities

| Capability | Reference | Core technique |
|---|---|---|
| Extract faces (detect + crop) | [references/face-detection-recognition.md](references/face-detection-recognition.md) | face-api.js (SSD MobileNet + 68-landmark + 128-d descriptor), scored by `area × confidence` |
| Recognize / match known faces | [references/face-detection-recognition.md](references/face-detection-recognition.md) | Euclidean distance between 128-d descriptors, threshold 0.6, multi-sample-per-person matching |
| Estimate age from a face | [references/face-age-estimation.md](references/face-age-estimation.md) | Gemini Vision, freeform JSON parsed with a regex fallback; life-stage enum |
| Describe a photo | [references/image-description.md](references/image-description.md) | Gemini Vision with a strict `responseSchema` (subjects/setting/era/mood/confidence) |
| Extract images from a document | [references/document-image-extraction.md](references/document-image-extraction.md) | Binary JPEG/PNG marker scanning inside a PDF buffer; DOCX media folder via JSZip |
| Locate numbered sub-images on a scanned page | [references/document-image-extraction.md](references/document-image-extraction.md) | Gemini Vision returns pixel bounding boxes + matched captions in one structured call |
| Enhance (upscale/colorize/denoise/sharpen) | [references/image-enhancement.md](references/image-enhancement.md) | Two tiers: `sharp` (Lanczos3 resize + sharpen, free, instant) vs. Google Imagen/Vertex AI (paid, higher quality, needs GCP project) |

## The structured-output pattern (reuse this)

Every Gemini-vision call that needs machine-parseable output uses `@google/genai`'s `responseSchema` with `responseMimeType: "application/json"` and a `Type.OBJECT` schema with `required` fields — not a "please respond in JSON" prompt instruction alone. See any of `image-description.md` or `document-image-extraction.md` for the exact shape. This is more reliable than the freeform-JSON + regex-extraction fallback used in the older `face-age-estimation.md` code — prefer the schema approach for anything new.

## Portability checklist

1. All face-recognition state lives in flat `.faces.json` files scanned off disk (`loadKnownFaces`, `findUnprocessedImages`) — replace with a database/collection query in a project that isn't filesystem-backed, but keep the two-step shape (load known faces once, then `findBestMatchMultiSample` per new image).
2. Image enhancement needs either nothing (the `sharp` tier) or a GCP service-account key + Vertex AI project (the Imagen tier) — don't assume Imagen access is configured.
3. `describeImage`/`analyzePageImages` send full-resolution image bytes as inline base64 — for large images, downscale client-side first to stay under Gemini's request-size limits.
