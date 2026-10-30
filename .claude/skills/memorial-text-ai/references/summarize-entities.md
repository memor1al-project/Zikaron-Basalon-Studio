# Document Summarization & Entity Extraction

Source: `website/services/attachmentAnalysisService.ts` (`analyzeAttachment`, `generateEntitySummary`).

**Depends on:** `@google/genai` only — a leaf capability. Feeds `timeline-extraction.md` (entities extracted here — people/locations/dates — are what the timeline builder cross-references) and `person-knowledge-aggregation.md` (`searchAttachments`/`mentionsInAttachments` reuses this analysis).

## Copy-paste example

```ts
import { GoogleGenAI, Type } from '@google/genai';

export interface AnalysisResult {
  summary: string;
  entities: { people: string[]; organizations: string[]; locations: string[]; dates: string[]; events: string[] };
  keywords: string[];
  confidence: number;
}

export async function analyzeAttachment(fileContent: string, apiKey: string): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // long-document accuracy > speed here
    contents: `Analyze this family history document and extract structured information.

Document text:
${fileContent}

Extract: 1) People (full names), 2) Organizations, 3) Locations, 4) Dates (YYYY or YYYY-MM-DD), 5) Events (life or historical).
Also provide a 2-3 sentence Summary, 5-10 Keywords, and a Confidence score 0.0-1.0.
Focus on family history, genealogical information, and personal narratives.`,
    config: {
      temperature: 0.3, // lower temperature — factual extraction, not creative writing
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          entities: { type: Type.OBJECT, properties: {
            people: { type: Type.ARRAY, items: { type: Type.STRING } },
            organizations: { type: Type.ARRAY, items: { type: Type.STRING } },
            locations: { type: Type.ARRAY, items: { type: Type.STRING } },
            dates: { type: Type.ARRAY, items: { type: Type.STRING } },
            events: { type: Type.ARRAY, items: { type: Type.STRING } },
          }, required: ['people', 'organizations', 'locations', 'dates', 'events'] },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER },
        },
        required: ['summary', 'entities', 'keywords', 'confidence'],
      },
    },
  });
  return JSON.parse(response.text) as AnalysisResult;
}
```

## Error-handling detail worth keeping

The source specifically catches `"Requested entity was not found"` in the Gemini error message and rethrows as `new Error("API_KEY_ERROR")` — that's Gemini's actual (misleading) error text for an invalid/expired API key. Without this translation, the failure looks like a content problem instead of an auth problem. Keep a similar translation layer for any Gemini integration; the raw SDK errors aren't self-explanatory.

## Portability checklist

1. `gemini-3-pro-preview` is chosen deliberately over the faster `gemini-2.0-flash` used elsewhere in this codebase — this call handles long, information-dense documents where accuracy matters more than latency. Match model choice to the task, don't default to one model everywhere (see the model-choice note in `memorial-text-ai/SKILL.md`).
2. This function analyzes one document's full text in one call — for very long documents (beyond a model's context window), chunk first and either analyze per-chunk then merge, or summarize chunks and analyze the summary.
