# Face Detection, Descriptors & Recognition (Matching to Known People)

Source: `website/services/faceRecognitionService.ts` (matching logic, pure functions, no I/O side effects except the two loader functions) and `website/services/videoExtractionService.ts` / `detectFacesInFrames` (detection, browser-side, face-api.js).

**Depends on:** `face-api.js` (`ssdMobilenetv1`, `faceLandmark68Net`, `faceRecognitionNet` models) for producing the 128-dimensional descriptor in the first place — this file's matching functions are pure math and don't call face-api.js themselves, they just consume descriptors it already produced (from a photo, or from `memorial-video-ai/references/frame-voice-extraction.md`'s frame scanning). No Gemini/LLM call is involved in matching — it's Euclidean distance, not AI.

## Copy-paste example: match a new face against a known-faces registry

```ts
export interface KnownFace { name: string; personId?: string; descriptor: number[]; extractedImagePath?: string; }
export interface FaceMatch { name: string; personId?: string; distance: number; confidence: number; extractedImagePath?: string; }

const DEFAULT_THRESHOLD = 0.6; // lower = stricter; 0.6 is the face-api.js rule-of-thumb for "same person"

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

/** Best match using the MINIMUM distance across all samples per person (people rarely have just one photo). */
export function findBestMatchMultiSample(
  descriptor: number[],
  facesByPerson: Map<string, KnownFace[]>,
  threshold = DEFAULT_THRESHOLD,
): FaceMatch | null {
  let bestMatch: FaceMatch | null = null;
  let bestDistance = Infinity;
  for (const [, samples] of facesByPerson) {
    let minDistance = Infinity;
    let bestSample: KnownFace | null = null;
    for (const sample of samples) {
      if (sample.descriptor.length !== 128) continue;
      const distance = euclideanDistance(descriptor, sample.descriptor);
      if (distance < minDistance) { minDistance = distance; bestSample = sample; }
    }
    if (bestSample && minDistance < threshold && minDistance < bestDistance) {
      bestDistance = minDistance;
      bestMatch = { name: bestSample.name, personId: bestSample.personId, distance: minDistance,
                    confidence: Math.min(1, 1 - minDistance / threshold), extractedImagePath: bestSample.extractedImagePath };
    }
  }
  return bestMatch;
}

// Usage:
// const known = await loadKnownFaces(familyPath);           // scan *.faces.json files, or replace with a DB query
// const byPerson = groupFacesByPerson(known);                // Map<lowercased-name, KnownFace[]>
// const match = findBestMatchMultiSample(newDescriptor, byPerson);
// if (match) console.log(`${match.name} (${(match.confidence*100).toFixed(0)}% confidence)`);
```

## Why "multi-sample" matters (a real bug this avoids)

Matching against a single reference photo per person is fragile — lighting, angle, and age all shift the descriptor. The working code stores every tagged face as a separate sample and takes the *minimum* distance across all of a person's samples, not an average. Averaging descriptors (or only keeping one) measurably hurts recall; keep the multi-sample-minimum approach when porting.

## Registry format (swap the storage, keep the shape)

The source persists known faces as flat `.faces.json` sidecar files next to each tagged photo (`{ faces: [{ name, personId, descriptor, extractedImagePath }] }`), scanned recursively with `loadKnownFaces(familyPath)`. In a database-backed project, replace the file scan with a query returning the same `KnownFace[]` shape — `findBestMatchMultiSample` needs nothing else to keep working.

## Portability checklist

1. `descriptor.length !== 128` is checked before every distance calculation — face-api.js's `faceRecognitionNet` is what fixes the descriptor at 128 dims; if you swap detection libraries, update the length check to match.
2. `findUnprocessedImages()` (scan for images with no `.faces.json` yet) only makes sense with the file-registry approach — with a DB, this becomes "images not yet in the `face_tags` table," a normal query.
3. Detection (face-api.js in the browser) and matching (this file, works anywhere) are separate concerns — matching can run server-side even though detection needs a browser or a Node canvas polyfill.
