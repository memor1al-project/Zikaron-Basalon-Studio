---
name: memorial-text-ai
description: Reference for AI text processing in oral-history/memorial and genealogy projects — summarizing a document with extracted entities, building a chronological timeline for a person from multiple sources, generating a narrated storyline or podcast from timeline events, and aggregating everything known about a person into one summary object. Use when building or adapting a feature that summarizes text, extracts a timeline, writes a life-story narration, or needs "everything we know about this person" as input to something else. Every pattern here is copied from working code in the sibling `website` Firebase project (Zikaron BaSalon) — check the referenced files there before assuming an API has changed.
---

# Text AI Services

Five capabilities that build on each other: aggregation feeds timeline and storyline; timeline feeds storyline and podcast.

## Capabilities

| Capability | Reference | Core technique |
|---|---|---|
| Summarize + extract entities | [references/summarize-entities.md](references/summarize-entities.md) | Gemini `responseSchema`: summary + {people, organizations, locations, dates, events} + keywords + confidence |
| Build timeline | [references/timeline-extraction.md](references/timeline-extraction.md) | Two entry points — per-document (`extractTimeline`) and per-person-across-many-documents (`generatePersonTimeline`) — both return the same `TimelineEntry[]` shape |
| Create a story (narrated storyline) | [references/storyline-generation.md](references/storyline-generation.md) | Selected events → Gemini narration per event → TTS (cloned voice, ElevenLabs-first) → media matched to each event by place+year |
| Create a story (long-form podcast) | [references/podcast-generation.md](references/podcast-generation.md) | All known person data → single documentary-style Gemini script → chunked Gemini TTS → WAV |
| Aggregate person knowledge | [references/person-knowledge-aggregation.md](references/person-knowledge-aggregation.md) | One function pulls together info file + GEDCOM relationships + photo appearances + attachment mentions + timeline + historical context, cached to disk |

## The structured-output pattern (reuse this)

Every extraction/summarization call uses `@google/genai`'s `responseSchema` (`Type.OBJECT`/`Type.ARRAY`/`Type.STRING` with `required` fields) rather than a "reply in JSON" instruction alone — see `summarize-entities.md` or `timeline-extraction.md` for the exact schema shape. Reuse this pattern for any new Gemini text-extraction feature; it's far more reliable than regex-extracting JSON from freeform text.

## Composition order

```
raw document/transcript text
        │
        ▼
summarize-entities.md  ──────────────►  quick summary + entity list
        │
        ▼
timeline-extraction.md  ─────────────►  chronological TimelineEntry[]
        │                                        │
        ▼                                        ▼
person-knowledge-aggregation.md          storyline-generation.md / podcast-generation.md
(everything about a person, cached)      (narrated output, needs a voice — see memorial-audio-ai)
```

## Portability checklist

1. All of these assume a family/person data model on disk (`.info` files, `_timeline.json`, GEDCOM). Point `loadTimeline`/`getPersonSummary`-equivalents at your own person/story data model — the Gemini prompts and schemas need no change.
2. `matchesName()` (from `nameMatchingService`) is used everywhere two names or places are compared (variant spelling, transliteration, phonetic matching) — don't replace it with plain `===` string comparison when porting; fuzzy name matching is load-bearing for family-history data specifically, not incidental.
3. Model choice matters: extraction/timeline use `gemini-3-pro-preview` for accuracy on long documents; narration uses `gemini-2.0-flash` for speed/cost. Keep that split rather than using one model for everything.
