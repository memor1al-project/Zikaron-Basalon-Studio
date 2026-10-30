import { auth } from "../../lib/firebase";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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
  date: string;
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
  /** Sentence-level timestamps — only present when transcription was asked for them. */
  cues?: TestimonyCue[];
}

export interface TestimonyCue {
  start: number;
  end: number;
  text: string;
}

export interface TestimonySegment {
  id: string;
  title: string;
  summary: string;
  keySubjects: string[];
  startTime: number;
  endTime: number;
}

export interface TestimonyChapters {
  segments: TestimonySegment[];
  language: string;
  dir: "rtl" | "ltr";
}

async function callMaterialsApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!auth?.currentUser) throw new Error("Sign in required");
  const idToken = await auth.currentUser.getIdToken();

  const res = await fetch(`${BASE_URL}/api/materials/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => null);
    throw new Error(responseBody?.error ?? `Request failed (${res.status})`);
  }

  return res.json();
}

export function summarizeMaterialText(text: string): Promise<MaterialSummary> {
  return callMaterialsApi<MaterialSummary>("summarize", { text });
}

export function buildMaterialTimeline(text: string): Promise<MaterialTimeline> {
  return callMaterialsApi<MaterialTimeline>("timeline", { text });
}

export function composeMaterialStory(text: string): Promise<MaterialStory> {
  return callMaterialsApi<MaterialStory>("story", { text });
}

export function transcribeAudioClip(audioBase64: string, withTimestamps = false): Promise<MaterialTranscript> {
  return callMaterialsApi<MaterialTranscript>("transcribe", { audioBase64, withTimestamps });
}

/**
 * Splits a transcribed testimony into navigable chapters for the Testimony Navigator.
 * Pass `cues` whenever transcription produced them — without real timestamps the model
 * can only guess where each chapter falls, which shows badly on a long recording.
 */
export function segmentTestimony(input: {
  transcript: string;
  cues?: TestimonyCue[];
  durationSeconds: number;
  language?: string;
}): Promise<TestimonyChapters> {
  return callMaterialsApi<TestimonyChapters>("segment", input);
}

export interface StoryDraftSection {
  key: string;
  answers: { key: string; answer: string; quote: string }[];
  /** Moments the material describes that belong to this section. Often empty, legitimately. */
  events: DraftedEvent[];
}

/** One moment a material describes — mirrors DraftedEvent in the functions service. */
export interface DraftedEvent {
  title: string;
  when: string;
  where: string;
  people: string[];
  description: string;
  /** The passage this was drawn from, verbatim. */
  quote: string;
}

/** Answers the wizard's guided-interview questions from a material's text, with its moments. */
export function draftStoryFromText(input: {
  text: string;
  template: { key: string; slug: string; title: string; fields: { key: string; label: string }[] }[];
}): Promise<{ sections: StoryDraftSection[]; language: string }> {
  return callMaterialsApi("draft-story", input);
}
