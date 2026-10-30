# Talking-Photo Animation (Image → Video)

Source: `website/services/videoAnimationProvider.ts`. API layer: `functions/src/api/heygen.ts`.

**Depends on:** `@google/genai` (Gemini/Veo path), the HeyGen REST API (no SDK — plain `fetch`), and — if the produced video has letterboxing — a local `ffmpeg` binary for the auto-crop step in the Gemini path. No other project services are required; this one is self-contained aside from API keys.

## The pattern: a provider factory, not a single function

Both backends implement the same interface, selected by an env var. Copy this shape whenever you have two-or-more interchangeable AI vendors for one capability (this repo repeats it for video animation, video-animation providers, and TTS voice selection).

```ts
export interface AnimationRequest { imageBase64: string; text: string; voiceId?: string; }
export interface AnimationResult { videoId: string; status: 'pending' | 'completed' | 'failed'; videoUrl?: string; provider: 'heygen' | 'gemini'; }

export interface VideoAnimationProvider {
  id: 'heygen' | 'gemini';
  animate(req: AnimationRequest, apiKey: string): Promise<AnimationResult>;   // submit job → videoId
  checkStatus(videoId: string, apiKey: string): Promise<AnimationResult>;    // poll until completed/failed
}

const providers: Record<string, VideoAnimationProvider> = { heygen: new HeyGenAnimationProvider(), gemini: new GeminiAnimationProvider() };

export function getVideoAnimationProvider(id?: 'heygen' | 'gemini'): VideoAnimationProvider {
  const providerId = id || (process.env.VIDEO_ANIMATION_PROVIDER as any) || 'heygen';
  return providers[providerId];
}
```

## HeyGen path (two REST calls, no SDK)

```ts
// 1. Upload the still photo as a "talking photo"
const uploadRes = await fetch('https://upload.heygen.com/v1/talking_photo', {
  method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'image/png' }, body: imageBuffer,
});
const { data: { talking_photo_id } } = await uploadRes.json();

// 2. Generate the video from that photo + text (HeyGen does its own TTS + lip-sync)
const genRes = await fetch('https://api.heygen.com/v2/video/generate', {
  method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    video_inputs: [{ character: { type: 'talking_photo', talking_photo_id, talking_style: 'expressive' },
                      voice: { type: 'text', voice_id: voiceId, input_text: text } }],
    dimension: { width: 512, height: 512 },
  }),
});
const { data: { video_id } } = await genRes.json();

// 3. Poll: GET https://api.heygen.com/v1/video_status.get?video_id=... until data.status === 'completed'
```

## Gemini (Veo) path — poll a long-running operation, not a REST status endpoint

```ts
const { GoogleGenAI } = await import('@google/genai');
const ai = new GoogleGenAI({ apiKey });
const operation = await ai.models.generateVideos({
  model: 'veo-3.1-generate-preview',
  prompt: text,
  image: { imageBytes: imageBase64, mimeType: 'image/png' },
  config: { aspectRatio: '9:16', durationSeconds: 6 },
});
// operation.name must be persisted (e.g. to a JSON file) — it's needed to resume polling across server restarts
```

Poll via `GET https://generativelanguage.googleapis.com/v1beta/${operation.name}?key=${apiKey}` until `opData.done`; the finished video is at `opData.response.generateVideoResponse.generatedSamples[0].video.uri` and must be downloaded (`?key=...&alt=media`), not embedded inline.

**Reusable trick:** the source persists in-flight Veo operation names to a small JSON file (`.gemini-video-ops.json`) precisely because dev-server hot-reload/restarts would otherwise orphan a long-running (multi-minute) generation job. If your generation step can outlive a single process, persist the operation handle the same way — don't keep it only in memory.

**Auto-crop gotcha:** Veo sometimes returns letterboxed/pillarboxed video. The source runs `ffmpeg -vf cropdetect` on the raw output, parses the detected `crop=W:H:X:Y`, and re-encodes with that crop before saving — worth keeping if you hit the same artifact.

## Portability checklist

1. `getAnimationApiKey()` reads `VITE_HEYGEN_API_KEY`/`HEYGEN_API_KEY` or `VITE_GEMINI_API_KEY`/`GEMINI_API_KEY` — keep a similar dual-name fallback if both a Vite client build and a Node server need the same key.
2. HeyGen's default `voice_id` in the source (`'55f8c0f546884f9cbdefa113f5e7b682'`) is a HeyGen-hosted stock voice — replace with a real voice ID (HeyGen voice, or map to an ElevenLabs voice) rather than copying that literal ID into a new project.
