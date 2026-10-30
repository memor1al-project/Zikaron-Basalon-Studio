# Moving the AI features to Claude

**Status:** planned, not started. Waiting on Zikaron BaSalon's Anthropic (Claude) organisation
account and API keys. Nothing in `functions/` has been changed for this yet.

The AI features have never run in production. They were built against Google Gemini, and the
organisation is now obtaining Claude API access instead, so the server-side services need to
move before they can be switched on.

## What has to happen first (independent of the provider)

The Firebase project is on the **Spark plan**. Cloud Functions v2 and Secret Manager both
require **Blaze**. This blocks deployment whichever provider the key belongs to — a Claude key
does not remove it.

## Six of the seven services port cleanly

All of these are text in, JSON out, in `functions/src/services/geminiMaterials.ts`:

| Function | Used by |
|---|---|
| `summarizeMaterial` | Summarize, on any material with text |
| `buildMaterialTimeline` | Timeline |
| `composeMaterialStory` | Story |
| `segmentTestimony` | Chapters for a testimony video |
| `backEngineerStory` | The worked examples for the example stories |
| `draftStoryFromText` | "Fill the story from this" on a document |

The port is mechanical: `@anthropic-ai/sdk` in place of `@google/genai`, and
`output_config.format` in place of Gemini's `responseSchema`. The prompts carry over
essentially unchanged — they are already plain instructions with an explicit output schema,
and the care in them (leave a question blank rather than invent, no euphemism, answer in the
speaker's language) is provider-independent.

## One service does not port: transcription

`transcribeAudioClip` is the only function that sends non-text input — it posts
`inlineData: { mimeType: 'audio/mp3' }` to Gemini. **Claude does not accept audio.** It takes
text, images and PDFs; there is no audio input on any model.

This matters more than one function, because transcription is upstream:

```
audio / video  ->  transcribeAudioClip  ->  transcript + timestamped cues
                                              ->  segmentTestimony (chapters)
                                              ->  the navigator, for a family's own video
                                              ->  summarize, for a recording
```

The 13 example testimonies were transcribed and chaptered already, so the public pages are
unaffected. A family's own recording is what stays stuck.

**Three options, to be decided with the organisation:**

1. Keep a Gemini key for transcription only; everything else on Claude.
2. A dedicated speech-to-text service (Whisper or similar) for audio, Claude for all reasoning.
3. Leave recordings untranscribed. Documents already work end to end, since PDF text
   extraction happens in the browser and needs no AI service at all.

Worth raising before the keys arrive: "we have Claude keys" will be heard as "the AI features
work", and transcription is the one that would not.

## Meanwhile

Every AI action in the app detects that the service is absent (`/api/health` returns the SPA's
HTML rather than JSON) and, instead of failing per click, explains that the feature is coming.
Everything that runs on the device — PDF text extraction, face detection, thumbnails, tags,
notes, locations, the family tree, the catalog, export and import — works today and will
continue to work regardless of which provider is chosen.
