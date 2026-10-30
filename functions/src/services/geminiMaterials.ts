import { GoogleGenAI, Type } from '@google/genai';

// Both previous ids (gemini-3-pro-preview, gemini-2.0-flash) were retired by Google and now
// 404; these are the replacements its own retirement notices point at.
const MODEL = 'gemini-3.1-pro-preview';
const TRANSCRIBE_MODEL = 'gemini-3.6-flash';

export interface MaterialSummary {
  summary: string;
  entities: {
    people: string[];
    organizations: string[];
    locations: string[];
    dates: string[];
    events: string[];
  };
  keywords: string[];
  confidence: number;
}

export interface MaterialTimelineEntry {
  date: string; // YYYY, YYYY-MM, or YYYY-MM-DD
  title: string;
  story: string;
  people: string[];
  places: string[];
  events: string[];
}

export interface MaterialTimeline {
  timeline: MaterialTimelineEntry[];
  confidence: number;
}

export interface MaterialStory {
  story: string;
}

export interface MaterialTranscript {
  transcript: string;
  language: string;
  /** Sentence-level timestamps, only present when transcription was asked for them. */
  cues?: TranscriptCue[];
}

/** One spoken utterance with its position in the recording, in seconds. */
export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}

/** One navigable chapter of a testimony — what the navigator jumps between. */
export interface TestimonySegment {
  id: string;
  title: string;
  /** 1-2 plain, simple sentences — written to be read by an older viewer, not an archivist. */
  summary: string;
  keySubjects: string[];
  startTime: number;
  endTime: number;
}

export interface TestimonyChapters {
  segments: TestimonySegment[];
  language: string;
  /** Text direction for the language above — the navigator lays itself out from this. */
  dir: 'rtl' | 'ltr';
}

/* ── worked examples: a real testimony, read back through the wizard's own questions ── */

/** The wizard's guided-interview outline, passed in from app/src/features/collection/storySections.json. */
export interface StoryTemplateSection {
  key: string;
  slug: string;
  title: string;
  fields: { key: string; label: string }[];
}

export interface ExampleStoryAnswer {
  key: string;
  label: string;
  /** The answer this testimony supports, or "" when the testimony never says. */
  answer: string;
  /** Chapter ids the answer was drawn from — what makes the example navigable. */
  sourceSegmentIds: string[];
}

export interface ExampleStorySection {
  key: string;
  slug: string;
  title: string;
  answers: ExampleStoryAnswer[];
}

export interface ExampleStory {
  sections: ExampleStorySection[];
  /** Chapters recast as wizard timeline events — title/when/description per moment. */
  events: { id: string; title: string; when: string; description: string; segmentId: string }[];
  language: string;
  dir: 'rtl' | 'ltr';
}

/**
 * Reads a finished testimony back through the Collection Wizard's questions, so a family
 * can see what a real story looks like as wizard input before writing their own.
 *
 * Honesty is the whole point of the exercise: a recorded testimony genuinely does not
 * answer every question in the outline, and the model is told to leave those blank rather
 * than invent. A worked example that silently fabricates the missing half would teach
 * families to do the same with their own relatives.
 */
export async function backEngineerStory(input: {
  transcript: string;
  segments: TestimonySegment[];
  template: StoryTemplateSection[];
  language: string;
}): Promise<ExampleStory> {
  const ai = client();
  const { transcript, segments, template, language } = input;

  const chapterList = segments
    .map((s) => `- id "${s.id}" (${Math.round(s.startTime)}s-${Math.round(s.endTime)}s) ${s.title}: ${s.summary}`)
    .join('\n');

  const questionList = template
    .map((section) => `${section.title} [key: ${section.key}, slug: ${section.slug}]\n` +
      section.fields.map((f) => `  - ${f.key}: ${f.label}`).join('\n'))
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Below is a recorded Holocaust survivor testimony. A family preparing their own Zikaron BaSalon
story answers a guided set of questions in a wizard. Your job is to work backwards: show what THIS
testimony would look like if it had been entered through those same questions, as a worked example.

Chapters of the recording:
${chapterList}

Full transcript:
${transcript}

The questions, grouped by section:
${questionList}

For every question, give:
- answer: what this testimony actually supports, in 1-3 sentences. If the testimony never
  addresses the question, return an EMPTY STRING — do not guess, and do not pad with generalities
  about the Holocaust. Leaving a question blank is a correct and useful answer here: it shows a
  family which parts of a story a recording alone cannot supply.
- sourceSegmentIds: the ids of the chapters above that the answer comes from (empty if blank).

Also produce "events": one timeline entry per chapter, each with a short title, a "when"
(a year or period if the testimony gives one, otherwise ""), a 1-2 sentence description, and
the chapter's segmentId.

Rules:
- Write every answer in the SAME LANGUAGE the person is speaking (${language}).
- Use only what is in the transcript. Never invent names, places, dates or events.
- Some questions are addressed to the family member telling the story, not the survivor
  (for example their relationship to the person, or why they want to share it now). If the
  recording does not reveal that, leave it blank.
- Treat the hardest material plainly and with respect: no euphemism, no sensationalism.`,
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                answers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      sourceSegmentIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ['key', 'answer', 'sourceSegmentIds'],
                  },
                },
              },
              required: ['key', 'answers'],
            },
          },
          events: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                when: { type: Type.STRING },
                description: { type: Type.STRING },
                segmentId: { type: Type.STRING },
              },
              required: ['title', 'when', 'description', 'segmentId'],
            },
          },
        },
        required: ['sections', 'events'],
      },
    },
  });

  const parsed = parseJsonResponse<{
    sections: { key: string; answers: { key: string; answer: string; sourceSegmentIds: string[] }[] }[];
    events: { title: string; when: string; description: string; segmentId: string }[];
  }>(response.text);

  const validSegmentIds = new Set(segments.map((s) => s.id));
  const answersByKey = new Map(
    (parsed.sections ?? []).map((s) => [s.key, new Map((s.answers ?? []).map((a) => [a.key, a]))])
  );

  // Rebuild from the template rather than trusting the model's shape: every question appears
  // exactly once, in the wizard's own order, with labels the model can't have reworded.
  const sections: ExampleStorySection[] = template.map((section) => ({
    key: section.key,
    slug: section.slug,
    title: section.title,
    answers: section.fields.map((field) => {
      const found = answersByKey.get(section.key)?.get(field.key);
      return {
        key: field.key,
        label: field.label,
        answer: (found?.answer ?? '').trim(),
        sourceSegmentIds: (found?.sourceSegmentIds ?? []).filter((id) => validSegmentIds.has(id)),
      };
    }),
  }));

  const events = (parsed.events ?? [])
    .filter((e) => e.title?.trim() && validSegmentIds.has(e.segmentId))
    .map((e, i) => ({
      id: `event-${i + 1}`,
      title: e.title.trim(),
      when: (e.when ?? '').trim(),
      description: (e.description ?? '').trim(),
      segmentId: e.segmentId,
    }));

  return { sections, events, language, dir: directionFor(language) };
}

/**
 * Answers the wizard's guided-interview questions from a document.
 *
 * Same honesty rule as backEngineerStory: a letter or a memoir page will not address most
 * of an interview outline, and a blank answer is the correct one. A draft that quietly
 * invents the missing half would teach a family to put invented detail into their
 * relative's story, which is the one thing this tool must not do.
 */
/** One moment a document describes, placed in the interview section it belongs to. */
export interface DraftedEvent {
  title: string;
  /** As the document words it — "Summer 1931". Empty when it doesn't say. */
  when: string;
  where: string;
  people: string[];
  description: string;
  /** The passage this was drawn from, verbatim, so it can be found in the source. */
  quote: string;
}

export async function draftStoryFromText(input: {
  text: string;
  template: StoryTemplateSection[];
}): Promise<{
  sections: {
    key: string;
    answers: { key: string; answer: string; quote: string }[];
    events: DraftedEvent[];
  }[];
  language: string;
}> {
  const ai = client();
  const { text, template } = input;

  const questionList = template
    .map(
      (section) =>
        `${section.title} [key: ${section.key}]\n` +
        section.fields.map((f) => `  - ${f.key}: ${f.label}`).join('\n')
    )
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `A family is preparing a Zikaron BaSalon story and has supplied the document below.
Answer the guided-interview questions from it, as a starting draft they will edit.

Document:
${text}

Questions, grouped by section:
${questionList}

For every question give an answer of 1-3 sentences drawn ONLY from the document. If the
document does not address a question, return an EMPTY STRING — never guess, never pad with
general historical background, and never infer a name, date or place that isn't there.
Leaving a question blank is the correct answer and tells the family what only they can supply.

With each answer return "quote": the passage you drew it from, copied from the document
WORD FOR WORD, character for character, with no correction of spelling or punctuation and
nothing added. It must appear verbatim in the document so it can be found and highlighted
there. Keep it under 300 characters, and use an empty string when the answer is empty.

Then, for each section, list the specific MOMENTS the document describes that belong to
that section — a journey, a separation, a wedding, a night someone had to decide something.
For each: a short title, when it happened as the document words it ("Summer 1931", "October
1942", "" if it doesn't say), where, who was present by name, 1-2 sentences of what
happened, and the same kind of word-for-word "quote" from the document. Take the names and places from the document only. If the document describes no
datable moment for a section, return an EMPTY LIST for it — a document of reflections
legitimately has none, and inventing moments would be far worse than having none to show.

Write the answers in the same language the document is written in. Treat the hardest
material plainly and with respect: no euphemism, no sensationalism.

Also report that language, in English (e.g. "Hebrew", "English").`,
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                answers: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      key: { type: Type.STRING },
                      answer: { type: Type.STRING },
                      quote: { type: Type.STRING },
                    },
                    required: ['key', 'answer', 'quote'],
                  },
                },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      when: { type: Type.STRING },
                      where: { type: Type.STRING },
                      people: { type: Type.ARRAY, items: { type: Type.STRING } },
                      description: { type: Type.STRING },
                      quote: { type: Type.STRING },
                    },
                    required: ['title', 'when', 'where', 'people', 'description', 'quote'],
                  },
                },
              },
              required: ['key', 'answers', 'events'],
            },
          },
          language: { type: Type.STRING },
        },
        required: ['sections', 'language'],
      },
    },
  });

  const parsed = parseJsonResponse<{
    sections: {
      key: string;
      answers: { key: string; answer: string; quote?: string }[];
      events?: DraftedEvent[];
    }[];
    language: string;
  }>(response.text);

  // Rebuilt from the template so every question appears once, in the wizard's own order.
  const answersByKey = new Map(
    (parsed.sections ?? []).map((sec) => [
      sec.key,
      new Map((sec.answers ?? []).map((a) => [a.key, { answer: a.answer, quote: a.quote ?? '' }])),
    ])
  );
  const eventsByKey = new Map((parsed.sections ?? []).map((sec) => [sec.key, sec.events ?? []]));
  return {
    sections: template.map((section) => ({
      key: section.key,
      answers: section.fields.map((field) => {
        const found = answersByKey.get(section.key)?.get(field.key);
        return {
          key: field.key,
          answer: (found?.answer ?? '').trim(),
          // A quote without an answer highlights a passage nothing was drawn from.
          quote: (found?.answer ?? '').trim() ? (found?.quote ?? '').trim() : '',
        };
      }),
      // A moment with no title is nothing a family can use, and is the shape the model
      // returns when it had nothing to report but filled the slot anyway.
      events: (eventsByKey.get(section.key) ?? [])
        .filter((event) => event?.title?.trim())
        .map((event) => ({
          title: event.title.trim(),
          when: (event.when ?? '').trim(),
          where: (event.where ?? '').trim(),
          people: (event.people ?? []).map((p) => p.trim()).filter(Boolean),
          description: (event.description ?? '').trim(),
          quote: (event.quote ?? '').trim(),
        })),
    })),
    language: canonicalLanguage(parsed.language),
  };
}

function client(): GoogleGenAI {
  // Created fresh per call so it always picks up the current secret binding.
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function parseJsonResponse<T>(responseText: string | undefined): T {
  if (!responseText) throw new Error('Empty response from Gemini');
  return JSON.parse(responseText) as T;
}

export async function summarizeMaterial(text: string): Promise<MaterialSummary> {
  const ai = client();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Analyze this family history document and extract structured information.
This is a document that may contain personal stories, genealogical data, historical context, or family memories.

Document text:
${text}

Extract the following entities:
1. People: Full names of individuals mentioned
2. Organizations: Institutions, companies, schools, synagogues, religious organizations
3. Locations: Cities, countries, regions, addresses, neighborhoods
4. Dates: Any dates or time periods mentioned (format as YYYY or YYYY-MM-DD when possible)
5. Events: Significant life events (births, marriages, deaths, migrations) or historical events described

Also provide:
- Summary: A 2-3 sentence summary of the main content and purpose of this document
- Keywords: 5-10 important keywords that describe the document's main topics
- Confidence: Your confidence level in this analysis as a number between 0.0 and 1.0

Focus on family history, genealogical information, and personal narratives. Be thorough but accurate.`,
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          entities: {
            type: Type.OBJECT,
            properties: {
              people: { type: Type.ARRAY, items: { type: Type.STRING } },
              organizations: { type: Type.ARRAY, items: { type: Type.STRING } },
              locations: { type: Type.ARRAY, items: { type: Type.STRING } },
              dates: { type: Type.ARRAY, items: { type: Type.STRING } },
              events: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['people', 'organizations', 'locations', 'dates', 'events'],
          },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER },
        },
        required: ['summary', 'entities', 'keywords', 'confidence'],
      },
    },
  });

  return parseJsonResponse<MaterialSummary>(response.text);
}

export async function buildMaterialTimeline(text: string): Promise<MaterialTimeline> {
  const ai = client();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Extract a chronological timeline from this family history document.
This document may contain personal stories, genealogical data, historical events, or family memories.

Document text:
${text}

Create a chronological timeline of events mentioned in the document. For each event:
1. Date: Extract or infer the date (use YYYY, YYYY-MM, or YYYY-MM-DD format)
2. Title: A brief, descriptive title (5-10 words)
3. Story: A compelling 2-3 sentence narrative that brings this moment to life
4. People: Names of people involved in this event
5. Places: Locations associated with this event
6. Events: Types of events (e.g., "birth", "marriage", "migration", "education", "career", "death", "historical event")

Guidelines:
- Order events chronologically from earliest to latest
- If exact dates are not mentioned, infer approximate dates from context
- Make the stories vivid and personal, focusing on human experiences
- Include both personal life events and historical context when relevant
- For family history, prioritize: births, marriages, migrations, deaths, career milestones, education

Provide your confidence level (0.0 to 1.0) in the timeline extraction.`,
    config: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                title: { type: Type.STRING },
                story: { type: Type.STRING },
                people: { type: Type.ARRAY, items: { type: Type.STRING } },
                places: { type: Type.ARRAY, items: { type: Type.STRING } },
                events: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['date', 'title', 'story', 'people', 'places', 'events'],
            },
          },
          confidence: { type: Type.NUMBER },
        },
        required: ['timeline', 'confidence'],
      },
    },
  });

  return parseJsonResponse<MaterialTimeline>(response.text);
}

export async function composeMaterialStory(text: string): Promise<MaterialStory> {
  const ai = client();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Read this family history document and write a short narrative passage suitable for inclusion in a memorial story.

Document text:
${text}

Guidelines:
- Write 200-400 words, in a warm, personal, narrative style.
- Ground the passage only in what is actually in the document — do not invent facts, names, dates, or events that are not present or reasonably implied.
- If the document is fragmentary, write a passage that honestly reflects that rather than filling gaps with invention.
- This will be read aloud or displayed at a memorial gathering, so favor a respectful, human tone over a clinical summary.`,
    config: {
      temperature: 0.5,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          story: { type: Type.STRING },
        },
        required: ['story'],
      },
    },
  });

  return parseJsonResponse<MaterialStory>(response.text);
}

/**
 * Transcribes a single MP3 audio clip (already compressed/chunked client-side to fit
 * Gemini's ~20MB inline-audio ceiling — see app/src/features/collection/transcriptionService.ts).
 *
 * With `withTimestamps`, it also returns sentence-level cues timed from the START OF THIS CLIP.
 * A caller that chunked a longer recording must add each chunk's offset itself.
 */
export async function transcribeAudioClip(
  base64Audio: string,
  withTimestamps = false,
  clipDurationSeconds?: number
): Promise<MaterialTranscript> {
  const ai = client();

  const verbatimRules = `Transcribe this recording verbatim. Mark speaker changes as "Speaker 1:", "Speaker 2:", etc. Use [pause] and [inaudible] where needed. Do not summarize, clean up, or paraphrase — this is oral history testimony where filler words and hesitation carry meaning.`;

  // Told the real length, the model drifts far less on the back half of a clip; without
  // it, timestamps tend to keep climbing past the end of the audio.
  const lengthRule = clipDurationSeconds
    ? `\n\nThis clip is exactly ${clipDurationSeconds.toFixed(1)} seconds long. Every timestamp must fall between 0 and ${clipDurationSeconds.toFixed(1)}, and the final cue must end at roughly ${clipDurationSeconds.toFixed(1)}.`
    : '';

  const response = await ai.models.generateContent({
    model: TRANSCRIBE_MODEL,
    contents: [
      {
        parts: [
          { inlineData: { mimeType: 'audio/mp3', data: base64Audio } },
          {
            text: withTimestamps
              ? `${verbatimRules}

Also return "cues": the same transcript broken into individual spoken sentences, each with the
time it starts and ends. Times are in SECONDS from the beginning of this audio clip (a decimal
number, e.g. 73.5 — never a "mm:ss" string). Cues must be in order and must not overlap. Keep each
cue to one sentence or one short utterance, so it can be shown on screen as the speaker says it.${lengthRule}`
              : verbatimRules,
          },
        ],
      },
    ],
    config: {
      // Low temperature — transcription wants low creativity, unlike narration prompts.
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          language: { type: Type.STRING, description: 'Detected spoken language, e.g. "English", "Hebrew"' },
          ...(withTimestamps
            ? {
                cues: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      start: { type: Type.NUMBER, description: 'Seconds from the start of this clip' },
                      end: { type: Type.NUMBER, description: 'Seconds from the start of this clip' },
                      text: { type: Type.STRING },
                    },
                    required: ['start', 'end', 'text'],
                  },
                },
              }
            : {}),
        },
        required: withTimestamps ? ['transcript', 'language', 'cues'] : ['transcript', 'language'],
      },
    },
  });

  const result = parseJsonResponse<MaterialTranscript>(response.text);
  return {
    ...result,
    language: canonicalLanguage(result.language),
    ...(result.cues ? { cues: normalizeCues(result.cues, clipDurationSeconds) } : {}),
  };
}

/**
 * Puts a cue list back on a clock that matches the audio.
 *
 * Speech models keep time well for a while and then lose it — on a 99-second clip we saw
 * accurate cues to ~53s, then a jump, then a tail running 30s past the end of the file.
 * Dropping the out-of-range tail would silently throw away real testimony, so instead the
 * overflow is squeezed back into the time that actually remains: the lines survive, in
 * order, with approximate timing in the stretch where the model had already lost the thread.
 */
export function normalizeCues(cues: TranscriptCue[] | undefined, durationSeconds?: number): TranscriptCue[] {
  const cleaned = (cues ?? [])
    .map((c) => ({ start: Number(c.start), end: Number(c.end), text: String(c.text ?? '').trim() }))
    .filter((c) => c.text && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
    .sort((a, b) => a.start - b.start);

  if (!cleaned.length || !durationSeconds || durationSeconds <= 0) return cleaned;

  const last = cleaned[cleaned.length - 1];
  if (last.end > durationSeconds) {
    // Anchor on the last cue still inside the clip, then rescale everything after it.
    let anchorIndex = -1;
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i].end <= durationSeconds) {
        anchorIndex = i;
        break;
      }
    }
    const anchorTime = anchorIndex >= 0 ? cleaned[anchorIndex].end : 0;
    const overflowStart = cleaned[anchorIndex + 1].start;
    const overflowSpan = last.end - overflowStart;
    const availableSpan = durationSeconds - anchorTime;

    if (overflowSpan > 0 && availableSpan > 0) {
      for (let i = anchorIndex + 1; i < cleaned.length; i++) {
        const scale = (time: number) => anchorTime + ((time - overflowStart) / overflowSpan) * availableSpan;
        cleaned[i] = { ...cleaned[i], start: scale(cleaned[i].start), end: scale(cleaned[i].end) };
      }
    }
  }

  // Final pass: clamp into range and keep starts moving forward.
  const out: TranscriptCue[] = [];
  let previousStart = 0;
  for (const cue of cleaned) {
    const start = Math.min(Math.max(cue.start, previousStart), durationSeconds);
    const end = Math.min(Math.max(cue.end, start + 0.2), durationSeconds);
    if (end <= start) continue;
    out.push({ start, end, text: cue.text });
    previousStart = start;
  }
  return out;
}

/**
 * Gemini reports a spoken language inconsistently — "Hebrew" from one call, "he" or
 * "he-IL" from the next. Everything downstream (text direction, speech-synthesis voice,
 * the navigator's own labels) keys off this string, so it gets canonicalized once here.
 */
const LANGUAGE_ALIASES: Record<string, string> = {
  he: 'Hebrew', heb: 'Hebrew', iw: 'Hebrew', hebrew: 'Hebrew', עברית: 'Hebrew',
  en: 'English', eng: 'English', english: 'English',
  ar: 'Arabic', ara: 'Arabic', arabic: 'Arabic',
  ru: 'Russian', rus: 'Russian', russian: 'Russian',
  pl: 'Polish', pol: 'Polish', polish: 'Polish',
  de: 'German', deu: 'German', ger: 'German', german: 'German',
  yi: 'Yiddish', yid: 'Yiddish', yiddish: 'Yiddish',
  fa: 'Persian', per: 'Persian', farsi: 'Persian', persian: 'Persian',
  ur: 'Urdu', urd: 'Urdu', urdu: 'Urdu',
};

const RTL_LANGUAGES = new Set(['Hebrew', 'Arabic', 'Yiddish', 'Persian', 'Urdu']);

export function canonicalLanguage(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'Unknown';
  // Strip a region suffix ("he-IL" -> "he") before looking the alias up.
  const key = trimmed.toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_ALIASES[key] ?? trimmed;
}

function directionFor(language: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.has(canonicalLanguage(language)) ? 'rtl' : 'ltr';
}

/**
 * How many chapters a testimony of this length should have. Roughly one per four
 * minutes, so a short clip doesn't get chopped into meaningless slivers and a
 * 45-minute testimony doesn't turn into a list nobody can scan.
 */
function targetChapterCount(durationSeconds: number): number {
  return Math.min(14, Math.max(3, Math.round(durationSeconds / 240)));
}

/**
 * Repairs whatever the model returned into a gapless, in-order, in-bounds chapter list.
 * The navigator seeks straight to these numbers, so an overlap or a stray 0-length
 * chapter is a viewer landing in the wrong place — cheaper to fix here than to trust.
 */
function normalizeSegments(segments: TestimonySegment[], durationSeconds: number): TestimonySegment[] {
  const sorted = segments
    .map((s, i) => ({
      ...s,
      id: s.id || `seg-${i + 1}`,
      startTime: Math.min(Math.max(Number(s.startTime) || 0, 0), durationSeconds),
      endTime: Math.min(Math.max(Number(s.endTime) || 0, 0), durationSeconds),
      keySubjects: Array.isArray(s.keySubjects) ? s.keySubjects : [],
    }))
    .sort((a, b) => a.startTime - b.startTime);

  // Each chapter runs until the next one begins — that closes model gaps and overlaps in one pass.
  const stitched = sorted.map((s, i) => ({
    ...s,
    startTime: i === 0 ? 0 : s.startTime,
    endTime: i === sorted.length - 1 ? durationSeconds : sorted[i + 1].startTime,
  }));

  const kept = stitched.filter((s) => s.endTime - s.startTime >= 1);
  if (kept.length === 0) {
    return [
      {
        id: 'seg-1',
        title: 'Full testimony',
        summary: 'The complete recording.',
        keySubjects: [],
        startTime: 0,
        endTime: durationSeconds,
      },
    ];
  }
  kept[kept.length - 1].endTime = durationSeconds;
  return kept;
}

/**
 * Splits a transcript into navigable chapters for the testimony navigator.
 *
 * `cues` (timestamped sentences) give real boundaries; without them the model can only
 * estimate positions from `durationSeconds`, which is noticeably worse on long recordings.
 */
export async function segmentTestimony(
  input: { transcript: string; cues?: TranscriptCue[]; durationSeconds: number; language?: string }
): Promise<TestimonyChapters> {
  const ai = client();
  const { transcript, cues, durationSeconds } = input;
  const chapters = targetChapterCount(durationSeconds);

  const body = cues?.length
    ? `Timestamped transcript (each line is "<start>s - <end>s: text"):\n${cues
        .map((c) => `${c.start.toFixed(1)}s - ${c.end.toFixed(1)}s: ${c.text}`)
        .join('\n')}`
    : `Transcript (no timestamps available — estimate each chapter's position by how far through the transcript it falls):\n${transcript}`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are preparing a recorded Holocaust survivor testimony so that an elderly viewer can
navigate it on their own. They will see a list of chapters and tap one to jump straight to that part
of the video. Many of them are the survivor's own generation or their children.

The recording is ${Math.round(durationSeconds)} seconds long. Divide it into about ${chapters} chapters
(never fewer than 3, never more than 14).

${body}

For each chapter give:
1. startTime / endTime: seconds from the start of the recording, as decimal numbers. The first
   chapter starts at 0 and the last ends at ${Math.round(durationSeconds)}. Chapters must be in order,
   must not overlap, and must leave no gap between them.
2. title: 2-5 words naming what this part is about, so it can be read at a glance.
3. summary: 1-2 short sentences in plain, everyday words saying what the viewer will hear. Short
   sentences. No jargon, no archival or academic phrasing, no dates the speaker didn't give.
4. keySubjects: 3-5 short topic tags (people, places, events named in this part).

Rules:
- Write title, summary and keySubjects in the SAME LANGUAGE the person is speaking. If the testimony
  is in Hebrew, write Hebrew.
- Cut chapters where the story actually turns — a new place, a new period of life, a new event —
  not at even time intervals.
- Say only what is in the transcript. Never invent names, places, dates or events.
- Handle the hardest parts of the testimony plainly and with respect. Do not soften them into
  euphemism, and do not sensationalize them.
- Also report the language the person is speaking, in English (e.g. "Hebrew", "English").`,
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: 'Short slug, e.g. "seg-3-ghetto"' },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                keySubjects: { type: Type.ARRAY, items: { type: Type.STRING } },
                startTime: { type: Type.NUMBER },
                endTime: { type: Type.NUMBER },
              },
              required: ['id', 'title', 'summary', 'keySubjects', 'startTime', 'endTime'],
            },
          },
          language: { type: Type.STRING },
        },
        required: ['segments', 'language'],
      },
    },
  });

  const parsed = parseJsonResponse<{ segments: TestimonySegment[]; language: string }>(response.text);
  const language = canonicalLanguage(parsed.language || input.language);
  return {
    segments: normalizeSegments(parsed.segments ?? [], durationSeconds),
    language,
    dir: directionFor(language),
  };
}
