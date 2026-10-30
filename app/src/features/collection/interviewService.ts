import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

/**
 * Field groupings follow Zikaron BaSalon's own Speakers Kit guided-interview
 * outline (resources/wizards/pdfs/speakers-kit-english.pdf), reworded here
 * rather than copied — see docs/plan for the underlying source material.
 */
export type StorySectionKey = "scene" | "lifeBeforeWar" | "warYears" | "afterWar" | "messageToday";

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface StoryEvent {
  id: string;
  title: string;
  when?: string;
  description?: string;
  location?: string;
  locationCoords?: GeoPoint;
  resourceKeys: string[];
  /** The material this moment was drafted from, shown as a coloured chip like an answer's. */
  source?: string;
  /** Where in that material it came from, verbatim. */
  quote?: string;
  /** Which page of that material, so the chip can open it there. */
  page?: number;
  /**
   * Who was there, by the name put to their face while tagging photographs.
   *
   * Names rather than references into a photo's face list: people outlive the material
   * they were recognised in, and deleting a photograph shouldn't quietly remove someone
   * from the event they were present at.
   */
  people?: string[];
}

export interface StorySectionData {
  answers: Record<string, string>;
  /**
   * Which material an answer was drafted from, by field key.
   *
   * Kept beside the answer rather than appended to it: the text lives in a textarea, where
   * a label can't be styled and can be edited away by accident. Held separately it can be
   * shown as a coloured chip, matched to a legend, and left out of the answer's own words.
   */
  answerSources?: Record<string, string>;
  /**
   * The passage in the source each answer was drawn from, by field key — verbatim, so it
   * can be found and highlighted in the material itself.
   */
  answerQuotes?: Record<string, string>;
  /** metaKeyFor() of that material, so the chip can open it at the right page. */
  answerSourceKeys?: Record<string, string>;
  /** Which page of that material the passage sits on. Absent for a recording. */
  answerPages?: Record<string, number>;
  resourceKeys: string[];
  events: StoryEvent[];
}

export const EMPTY_SECTION: StorySectionData = {
  answers: {},
  answerSources: {},
  answerQuotes: {},
  answerSourceKeys: {},
  answerPages: {},
  resourceKeys: [],
  events: [],
};

/**
 * Attribution used to be appended to the answer text itself. Anything saved that way is
 * converted on read, so an older story shows chips like a new one instead of both.
 */
const LEGACY_ATTRIBUTION = /\n*— drafted from (.+)$/;

function migrateLegacyAttribution(data: {
  answers: Record<string, string>;
  answerSources: Record<string, string>;
}): void {
  for (const [key, value] of Object.entries(data.answers)) {
    const match = value.match(LEGACY_ATTRIBUTION);
    if (!match) continue;
    data.answers[key] = value.replace(LEGACY_ATTRIBUTION, "").trimEnd();
    data.answerSources[key] ??= match[1].trim();
  }
}

function requireDb() {
  if (!db) throw new Error("Firebase is not configured");
  return db;
}

export async function getSection(uid: string, section: StorySectionKey): Promise<StorySectionData> {
  const snap = await getDoc(doc(requireDb(), "stories", uid, "details", section));
  if (!snap.exists()) return EMPTY_SECTION;
  const data = snap.data();
  const parsed = {
    answers: { ...(data.answers ?? {}) },
    answerSources: { ...(data.answerSources ?? {}) },
    answerQuotes: { ...(data.answerQuotes ?? {}) },
    answerSourceKeys: { ...(data.answerSourceKeys ?? {}) },
    answerPages: { ...(data.answerPages ?? {}) },
    resourceKeys: data.resourceKeys ?? [],
    // Events saved before people were attachable have no `people` field at all.
    events: (data.events ?? []).map((e: StoryEvent) => ({ ...e, people: e.people ?? [] })),
  };
  migrateLegacyAttribution(parsed);
  return parsed;
}

/**
 * Drops keys whose value is `undefined`, all the way down.
 *
 * Firestore rejects an `undefined` anywhere in a write, and this document is full of
 * optional fields — an event with no date, a cleared source label, a location someone
 * emptied. Every caller producing one would otherwise have to remember to omit the key
 * rather than set it to undefined, and the failure only appears at the moment of saving,
 * after the work is done.
 *
 * Omitted rather than turned into null: absent and "explicitly nothing" read the same here,
 * and a section is always written whole (see below), so an omitted key really is gone.
 */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = withoutUndefined(item);
    }
    return out as T;
  }
  return value;
}

/**
 * Written whole, deliberately not merged.
 *
 * Every caller builds the complete section from getSection() before saving, so there is
 * nothing a merge would protect. Merging actively broke removal: clearing a source label
 * or emptying a location omits that key, and a merge leaves the old value in place — so
 * the label a person had just cleared came back on the next read.
 */
export async function saveSection(uid: string, section: StorySectionKey, data: StorySectionData): Promise<void> {
  await setDoc(doc(requireDb(), "stories", uid, "details", section), {
    ...withoutUndefined(data),
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Reset, and taking it back
// ---------------------------------------------------------------------------

/** Every section key, in the order the wizard asks them. */
export const STORY_SECTION_KEYS: StorySectionKey[] = [
  "scene",
  "lifeBeforeWar",
  "warYears",
  "afterWar",
  "messageToday",
];

/** Where the pre-reset state is parked so the undo survives a reload or a navigation. */
const BACKUP_DOC = "resetBackup";

export interface ResetBackup {
  sections: Record<StorySectionKey, StorySectionData>;
  /** Milliseconds since epoch, for saying how long ago it happened. */
  at: number;
}

function emptySection(): StorySectionData {
  // A fresh object each time — EMPTY_SECTION is shared, and handing the same one to four
  // sections would let an edit to any of them appear in all four.
  return {
    answers: {},
    answerSources: {},
    answerQuotes: {},
    answerSourceKeys: {},
    answerPages: {},
    resourceKeys: [],
    events: [],
  };
}

/**
 * Clears every part of the guided interview, keeping a copy.
 *
 * The copy lives in Firestore rather than in the page, so "undo" still works after a
 * reload, a navigation, or on the other device someone opens next — the cases where losing
 * an afternoon's writing to a mis-click would actually hurt.
 */
export async function resetStory(uid: string): Promise<ResetBackup> {
  const database = requireDb();
  const sections = {} as Record<StorySectionKey, StorySectionData>;
  for (const key of STORY_SECTION_KEYS) sections[key] = await getSection(uid, key);

  const backup: ResetBackup = { sections, at: Date.now() };
  // Written before anything is cleared: if this fails, nothing has been lost yet.
  await setDoc(doc(database, "stories", uid, "details", BACKUP_DOC), backup);

  for (const key of STORY_SECTION_KEYS) {
    await setDoc(doc(database, "stories", uid, "details", key), {
      ...emptySection(),
      updatedAt: serverTimestamp(),
    });
  }
  return backup;
}

/** The copy taken by the last reset, if one is still available to undo. */
export async function getResetBackup(uid: string): Promise<ResetBackup | null> {
  const snap = await getDoc(doc(requireDb(), "stories", uid, "details", BACKUP_DOC));
  if (!snap.exists()) return null;
  const data = snap.data() as Partial<ResetBackup>;
  return data.sections ? { sections: data.sections as ResetBackup["sections"], at: data.at ?? 0 } : null;
}

/** Puts back everything the last reset cleared. */
export async function undoReset(uid: string): Promise<void> {
  const database = requireDb();
  const backup = await getResetBackup(uid);
  if (!backup) return;

  for (const key of STORY_SECTION_KEYS) {
    const section = backup.sections[key] ?? emptySection();
    await setDoc(doc(database, "stories", uid, "details", key), { ...section, updatedAt: serverTimestamp() });
  }
  await discardResetBackup(uid);
}

/**
 * Forgets the undo.
 *
 * Offered explicitly rather than expiring on a timer: the backup holds the family's own
 * words, and it shouldn't sit in storage indefinitely once they've decided the reset was
 * what they wanted.
 */
export async function discardResetBackup(uid: string): Promise<void> {
  await deleteDoc(doc(requireDb(), "stories", uid, "details", BACKUP_DOC));
}
