# Face Age Estimation (Gemini Vision)

Source: `website/services/faceAgeEstimationService.ts`.

**Depends on:** `@google/genai` only. Commonly chained after `face-detection-recognition.md` (crop a face first, then estimate its age) and feeds `memorial-events-map-ai/references/migration-map.md`-style timelines when you need "how old was this person in this photo" for placing an undated photo on a timeline.

## Copy-paste example

```ts
import { GoogleGenAI } from '@google/genai';

export interface AgeEstimationResult {
  estimatedAge: number;
  ageRange: { min: number; max: number };
  confidence: number;
  lifeStage: 'infant' | 'child' | 'teenager' | 'young_adult' | 'adult' | 'middle_aged' | 'senior';
  description?: string;
}

export async function estimateFaceAge(imageBuffer: Buffer, mimeType: string, apiKey: string): Promise<AgeEstimationResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ parts: [
      { inlineData: { mimeType, data: imageBuffer.toString('base64') } },
      { text: `Analyze this face image and estimate the person's age.
Respond in JSON only:
{"estimatedAge": <number>, "ageRange": {"min": <number>, "max": <number>}, "confidence": <0-1>,
 "lifeStage": "<infant|child|teenager|young_adult|adult|middle_aged|senior>", "description": "<brief>"}
Life stages: infant 0-2, child 3-12, teenager 13-19, young_adult 20-35, adult 36-50, middle_aged 51-65, senior 66+.` },
    ] }],
  });

  const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response');
  const result = JSON.parse(jsonMatch[0]);
  return {
    estimatedAge: Math.round(result.estimatedAge) || 30,
    ageRange: { min: Math.round(result.ageRange?.min) || result.estimatedAge - 5, max: Math.round(result.ageRange?.max) || result.estimatedAge + 5 },
    confidence: Math.min(1, Math.max(0, result.confidence || 0.5)),
    lifeStage: result.lifeStage, // validate against the 7-value enum before trusting it — see validateLifeStage() in source
  };
}

/** Back-calculate a birth year from an age estimate + the photo's known date. */
export function calculateBirthYear(estimatedAge: number, photoDate?: string): number | null {
  if (!photoDate) return null;
  const yearMatch = photoDate.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? parseInt(yearMatch[0], 10) - estimatedAge : null;
}
```

## Note on reliability (a deliberate simplification, flag before reusing)

This service parses freeform text with a `/\{[\s\S]*\}/` regex rather than using `@google/genai`'s `responseSchema` structured-output mode. `image-description.md` and `summarize-entities.md` in the sibling skills use the schema approach instead — that's the more robust pattern (the model can't wrap the JSON in prose the regex fails to find). If you're writing this fresh, use `responseSchema`; this file exists to document what's actually running today, not to recommend copying the regex-parse approach into new code.

## Portability checklist

1. `validateLifeStage()` — not reproduced above — clamps any unrecognized string to `'adult'` as a safe default; keep an explicit fallback rather than letting an unvalidated enum value leak into UI logic.
2. `estimateAgeAtYear(ageAtPhoto, photoYear, targetYear)` (source, not shown here) rejects results outside `0–120` — a sanity bound worth keeping for any age-math you build on top of this.
