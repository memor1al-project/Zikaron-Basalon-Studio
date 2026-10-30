# Image Enhancement (Upscale / Colorize / Denoise / Sharpen)

Source: `website/services/imageEnhancementService.ts`. Docs: `website/docs/IMAGE_ENHANCEMENT.md`, `IMAGE_ENHANCEMENT_SETUP.md`.

**Depends on:** `sharp` (free tier, no external service) OR `@google-cloud/aiplatform` + a GCP project with Vertex AI + Imagen enabled and a service-account key (paid tier). These two tiers are independent — you can ship the free tier alone and add Imagen later without touching calling code, since both return the same `ImageEnhancementResult` shape.

## Tier 1 — free, instant, no API key: `sharp` (Lanczos3 upscale + sharpen)

```ts
export async function enhanceImageClientSide(imageData: string, options: { upscale?: boolean; sharpen?: boolean } = {}) {
  const sharp = (await import('sharp')).default;
  const matches = imageData.match(/^data:([^;]+);base64,(.+)$/)!;
  const imageBuffer = Buffer.from(matches[2], 'base64');
  const { width = 800, height = 600 } = await sharp(imageBuffer).metadata();

  let pipeline = sharp(imageBuffer);
  if (options.upscale !== false) {
    pipeline = pipeline.resize(width * 2, height * 2, { kernel: 'lanczos3', fit: 'fill' });
  }
  if (options.sharpen !== false) {
    pipeline = pipeline.sharpen({ sigma: 1.0, m1: 1.0, m2: 0.5 });
  }
  const processed = await pipeline.png({ quality: 95 }).toBuffer();
  return `data:image/png;base64,${processed.toString('base64')}`;
}
```

## Tier 2 — paid, higher quality: Google Imagen via Vertex AI

```ts
import { PredictionServiceClient } from '@google-cloud/aiplatform';

export async function enhanceImage(imageData: string, config: { projectId: string; location: string; credentials?: any }, options: { upscale?: boolean; colorize?: boolean; denoise?: boolean; sharpen?: boolean } = {}) {
  const base64Data = imageData.replace(/^data:[^;]+;base64,/, '');
  const enhancements: string[] = [];
  if (options.upscale !== false) enhancements.push('upscale to 4x resolution with enhanced details');
  if (options.colorize !== false) enhancements.push('add natural realistic colors if black and white or sepia');
  if (options.denoise !== false) enhancements.push('reduce noise and grain while preserving facial features');
  if (options.sharpen !== false) enhancements.push('sharpen details and improve clarity');

  const prompt = `Enhance this historical family photograph. ${enhancements.join(', ')}. Preserve authenticity, composition, realistic skin tones, and historical character. Do not add or remove people or objects.`;

  const client = new PredictionServiceClient({ apiEndpoint: `${config.location}-aiplatform.googleapis.com`, credentials: config.credentials });
  const endpoint = `projects/${config.projectId}/locations/${config.location}/publishers/google/models/imagen-3.0-generate-001`;
  const [response] = await client.predict({
    endpoint,
    instances: [{ prompt, image: { bytesBase64Encoded: base64Data } }] as any,
    parameters: { sampleCount: 1, aspectRatio: '1:1', negativePrompt: 'blurry, distorted, disfigured, extra limbs, extra people', guidance: 60, seed: Math.floor(Math.random() * 2147483647) } as any,
  });
  const enhancedBase64 = (response.predictions?.[0] as any)?.bytesBase64Encoded;
  if (!enhancedBase64) throw new Error('No enhanced image returned from Imagen');
  return `data:image/png;base64,${enhancedBase64}`;
}
```

## Load-bearing details, don't drop these

- **"Do not add or remove people or objects"** is in the Imagen prompt deliberately — generative upscaling models can hallucinate details into historical photos; this instruction (plus a conservative `guidance: 60`) is a memorial-project-specific safety constraint, not boilerplate.
- **Automatic backup before enhancing** (`.original.jpg` saved alongside, per `IMAGE_ENHANCEMENT.md`) and **path validation restricting enhancement to files under `resources/`** are both documented safety features in the source docs — carry both over; enhancement should never be destructive or operate outside the project's own asset directory.
- Sharp tier ships with **zero setup** and should be the default; only reach for Imagen when a project specifically needs colorization or 4x (vs 2x) upscaling and has budget for it.

## Portability checklist

1. Both functions accept/return a full data-URL string (`data:image/png;base64,...`) — convenient for passing straight to an `<img src>` but bulky over the wire for large photos; consider returning a storage URL instead of an inline data URL once you have a real asset store.
2. Imagen needs `location-aiplatform.googleapis.com` as the endpoint and a region that has Imagen enabled — not all Vertex AI regions do; check availability before assuming a region works.
