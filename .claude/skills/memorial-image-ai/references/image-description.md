# Image Description (Gemini Vision, structured output)

Source: `website/services/imageDescriptionService.ts`.

**Depends on:** `@google/genai` only — a true leaf capability, no other project services. This is the reference implementation of the "structured-output" pattern used across the text and image skills (see also `summarize-entities.md`, `timeline-extraction.md`, `document-image-extraction.md`'s `analyzePageImages`).

## Copy-paste example

```ts
import { GoogleGenAI, Type } from '@google/genai';

export interface ImageDescription {
  description: string; subjects: string[]; setting: string;
  era?: string; mood?: string; textInImage?: string; confidence: number;
}

export async function describeImage(imageBuffer: Buffer, mimeType: string, contextText?: string, apiKey?: string): Promise<ImageDescription> {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.VITE_GEMINI_API_KEY! });
  let prompt = `Analyze this image and provide a detailed description.
Focus on: 1) subjects/people shown, 2) setting/location, 3) any visible text, 4) estimated era if historical, 5) overall mood.`;
  if (contextText) prompt += `\n\nContext from the original document: "${contextText.slice(0, 500)}"`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }, { text: prompt }] }],
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: 'A comprehensive 2-3 sentence description' },
          subjects: { type: Type.ARRAY, items: { type: Type.STRING } },
          setting: { type: Type.STRING },
          era: { type: Type.STRING },
          mood: { type: Type.STRING },
          textInImage: { type: Type.STRING, description: 'Visible text, or empty string if none' },
          confidence: { type: Type.NUMBER },
        },
        required: ['description', 'subjects', 'setting', 'confidence'],
      },
    },
  });

  return JSON.parse(response.text) as ImageDescription;
}

/** Batch with a concurrency cap so you don't fan out hundreds of parallel Gemini calls at once. */
export async function describeImages(images: Array<{ buffer: Buffer; mimeType: string; contextText?: string }>, apiKey?: string) {
  const CONCURRENCY_LIMIT = 3;
  const results = [];
  for (let i = 0; i < images.length; i += CONCURRENCY_LIMIT) {
    const batch = images.slice(i, i + CONCURRENCY_LIMIT);
    results.push(...await Promise.all(batch.map(img => describeImage(img.buffer, img.mimeType, img.contextText, apiKey))));
  }
  return results;
}
```

## Why this is the pattern to imitate

`responseSchema` with `type: Type.OBJECT` + `required` fields makes Gemini return exactly this shape — no markdown-fenced JSON to strip, no missing-field guessing. Compare to `face-age-estimation.md`, which uses freeform text + regex extraction as a fallback pattern that's less reliable; prefer this schema style for any new Gemini text/vision extraction call.

## Portability checklist

1. `contextText` is truncated to 500 chars before being embedded in the prompt — deliberate, to avoid an oversized request when the "context" is a whole document; keep a similar cap.
2. The batching helper (`describeImages`) exists because unbounded `Promise.all` across dozens of images will hit Gemini rate limits — always batch with a concurrency cap (3 here) rather than firing every request at once.
