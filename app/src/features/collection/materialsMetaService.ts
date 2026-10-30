import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { ProviderFileRef } from "../../lib/storage/types";

export interface MaterialConnection {
  targetKey: string; // metaKeyFor() of the other material
  targetName: string; // denormalized filename, so the UI doesn't need a lookup
  label: string; // e.g. "father", "friend", "picture of playing sport together"
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface MaterialAiSummary {
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

export interface MaterialAiTimelineEntry {
  date: string;
  title: string;
  story: string;
  people: string[];
  places: string[];
  events: string[];
}

export interface MaterialAiStory {
  story: string;
}

export interface MaterialFace {
  dataUrl: string;
  label?: string;
  /** Normalized 0-1 box, for drawing the face on top of the photo. */
  box?: { x: number; y: number; width: number; height: number };
  /** 128-number embedding, for finding the same person in other materials. */
  descriptor?: number[];
}

export interface MaterialAiTranscript {
  transcript: string;
  language: string;
}

/**
 * Chapters for a testimony video, as shown by the Testimony Navigator.
 *
 * Only the chapters are stored, never the sentence-level cues that helped place them —
 * an hour of cues would push this document toward Firestore's 1MB per-document ceiling.
 */
export interface MaterialAiChapters {
  segments: {
    id: string;
    title: string;
    summary: string;
    keySubjects: string[];
    startTime: number;
    endTime: number;
  }[];
  language: string;
  dir: "rtl" | "ltr";
}

/** Text pulled out of a document, so later AI steps don't re-read the file. */
export interface MaterialExtractedText {
  text: string;
  /** Pages that yielded text. Fewer than totalPages means part of the document is images. */
  pageCount: number;
  totalPages?: number;
  /** Character offset where each readable page starts, for locating a quote's page. */
  pageOffsets?: number[];
}

export interface MaterialMeta {
  tags: string[];
  notes: string;
  location?: string;
  locationCoords?: GeoPoint;
  connections?: MaterialConnection[];
  aiSummary?: MaterialAiSummary;
  aiTimeline?: MaterialAiTimelineEntry[];
  aiStory?: MaterialAiStory;
  faces?: MaterialFace[];
  aiTranscript?: MaterialAiTranscript;
  aiChapters?: MaterialAiChapters;
  extractedText?: MaterialExtractedText;
}

/** Firestore doc IDs can't contain "/", so encode the ref into one safe segment. */
export function metaKeyFor(ref: ProviderFileRef): string {
  return `${ref.providerId}_${encodeURIComponent(ref.id)}`;
}

function requireDb() {
  if (!db) throw new Error("Firebase is not configured");
  return db;
}

/** Loads every saved tag/note for this user's current story in one read. */
export async function listMaterialMetas(uid: string): Promise<Record<string, MaterialMeta>> {
  const snap = await getDocs(collection(requireDb(), "stories", uid, "materials"));
  const result: Record<string, MaterialMeta> = {};
  snap.forEach((d) => {
    const data = d.data();
    result[d.id] = {
      tags: data.tags ?? [],
      notes: data.notes ?? "",
      location: data.location || undefined,
      locationCoords: data.locationCoords ?? undefined,
      connections: data.connections ?? [],
      aiSummary: data.aiSummary ?? undefined,
      aiTimeline: data.aiTimeline ?? undefined,
      aiStory: data.aiStory ?? undefined,
      faces: data.faces ?? undefined,
      aiTranscript: data.aiTranscript ?? undefined,
      aiChapters: data.aiChapters ?? undefined,
      extractedText: data.extractedText ?? undefined,
    };
  });
  return result;
}

/**
 * Firestore's hard per-document limit is 1MB, and everything a material knows is one
 * document. Checking here means an oversized save names its own cause instead of failing
 * as an opaque rejection from inside the SDK — after someone has spent a while tagging.
 */
const MAX_DOC_BYTES = 900_000;

/** Which part of a material has grown, so the message can say what to remove. */
function largestField(meta: MaterialMeta): string {
  const sizes: [string, unknown][] = [
    ["face crops", meta.faces],
    ["the transcript", meta.aiTranscript],
    ["the extracted text", meta.extractedText],
    ["the chapters", meta.aiChapters],
    ["the timeline", meta.aiTimeline],
  ];
  let biggest = "this material's AI results";
  let most = 0;
  for (const [name, value] of sizes) {
    const size = value ? JSON.stringify(value).length : 0;
    if (size > most) {
      most = size;
      biggest = name;
    }
  }
  return biggest;
}

export async function saveMaterialMeta(uid: string, key: string, meta: MaterialMeta): Promise<void> {
  const size = new Blob([JSON.stringify(meta)]).size;
  if (size > MAX_DOC_BYTES) {
    throw new Error(
      `This material is too large to save (${Math.round(size / 1000)}KB of a 1MB limit) — ` +
        `${largestField(meta)} takes up the most room. Removing some of it will bring it back under.`
    );
  }

  await setDoc(
    doc(requireDb(), "stories", uid, "materials", key),
    {
      tags: meta.tags,
      notes: meta.notes,
      location: meta.location ?? "",
      locationCoords: meta.locationCoords ?? null,
      connections: meta.connections ?? [],
      aiSummary: meta.aiSummary ?? null,
      aiTimeline: meta.aiTimeline ?? null,
      aiStory: meta.aiStory ?? null,
      faces: meta.faces ?? null,
      aiTranscript: meta.aiTranscript ?? null,
      aiChapters: meta.aiChapters ?? null,
      extractedText: meta.extractedText ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteMaterialMeta(uid: string, key: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "stories", uid, "materials", key));
}
