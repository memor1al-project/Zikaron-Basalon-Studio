import { draftStoryFromText } from "./materialsAiService";
import type { MaterialAiSummary } from "./materialsMetaService";
import { getSection, saveSection } from "./interviewService";
import { storySections } from "./storySections";
import { locateQuote } from "./quoteLocator";
import type { LocationValue } from "./LocationField";

/**
 * Filling things in from what the AI found in one material.
 *
 * Two jobs, shared by every material type that can produce text — a document's extracted
 * pages, a recording's transcript:
 *
 *  - **Details**, meaning this material's own tags, notes and place.
 *  - **The story**, meaning the guided interview's blank answers.
 *
 * Both are suggestions on top of a person's work, never replacements for it: an existing
 * note is never rewritten, an existing answer is never overwritten, and everything written
 * into the interview says which material it came from so the writer can weigh it.
 */

/** How many keywords are worth turning into tags before the list stops being useful. */
const MAX_SUGGESTED_TAGS = 6;

export interface DetailSuggestions {
  tags: string[];
  notes: string;
  location: LocationValue;
  /** What actually changed, for telling the person plainly. */
  changed: string[];
}

/**
 * Derives this material's own details from its AI summary.
 *
 * Additive by design: tags are merged with what's already there, and the note and place are
 * only filled when blank. Someone who has already written "Grandmother's kitchen, Stryj" in
 * the notes does not want it replaced by a machine paraphrase.
 */
export function detailsFromSummary(
  summary: MaterialAiSummary,
  current: { tags: string[]; notes: string; location: LocationValue }
): DetailSuggestions {
  const changed: string[] = [];

  const existing = new Set(current.tags.map((t) => t.toLowerCase()));
  const newTags = summary.keywords
    .map((k: string) => k.trim())
    .filter((k: string) => k && !existing.has(k.toLowerCase()))
    .slice(0, MAX_SUGGESTED_TAGS);
  if (newTags.length) changed.push(`${newTags.length} ${newTags.length === 1 ? "tag" : "tags"}`);

  const notes = current.notes.trim() ? current.notes : summary.summary.trim();
  if (!current.notes.trim() && notes) changed.push("a note");

  // Only the first location: the summary lists everywhere the material mentions, but this
  // field means "where this material is from", which is a single answer.
  const suggestedPlace = summary.entities.locations[0]?.trim();
  const location: LocationValue =
    current.location.name.trim() || !suggestedPlace
      ? current.location
      : // Coordinates are left unset on purpose — LocationField geocodes on demand, and a
        // place guessed from text shouldn't silently acquire a precise point on the map.
        { name: suggestedPlace, coords: undefined };
  if (location.name !== current.location.name) changed.push("a place");

  return { tags: [...current.tags, ...newTags], notes, location, changed };
}

export interface StoryFillResult {
  filled: number;
  /** Questions this material answered that a person had already answered themselves. */
  skipped: number;
  /** Moments added to the sections they belong to. */
  events: number;
}

/**
 * Two moments are the same when they say the same thing happened at the same time.
 *
 * Filling twice from the same material — or from a letter and the recording that discusses
 * it — would otherwise stack near-identical entries on the timeline.
 */
function sameMoment(a: { title: string; when?: string }, b: { title: string; when?: string }): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a.title) === norm(b.title) && norm(a.when ?? "") === norm(b.when ?? "");
}

/**
 * Fills blank interview answers from one material's text, attributing each to it.
 *
 * Merging, never overwriting: a family's own words always win, and a blank draft never
 * erases an answer. Anything written carries the attribution line, so a later reader can
 * tell a drafted answer from one somebody wrote.
 */
export async function fillStoryFromText(input: {
  uid: string;
  text: string;
  sourceName: string;
  /** metaKeyFor() of the material, so it can be attached to the sections it contributed to. */
  sourceKey: string;
  /** Page boundaries, when the material has pages — a recording has none. */
  pageOffsets?: number[];
}): Promise<StoryFillResult> {
  const template = storySections.map((section) => ({
    key: section.key,
    slug: section.slug,
    title: section.title,
    fields: section.fields.map((f) => ({ key: f.key, label: f.label })),
  }));

  const draft = await draftStoryFromText({ text: input.text, template });

  let filled = 0;
  let skipped = 0;
  let addedEvents = 0;

  for (const section of draft.sections) {
    const key = section.key as (typeof storySections)[number]["key"];
    const existing = await getSection(input.uid, key);
    const answers = { ...existing.answers };
    const answerSources = { ...(existing.answerSources ?? {}) };
    const answerQuotes = { ...(existing.answerQuotes ?? {}) };
    const answerSourceKeys = { ...(existing.answerSourceKeys ?? {}) };
    const answerPages = { ...(existing.answerPages ?? {}) };
    let answersHere = 0;

    for (const answer of section.answers) {
      const text = answer.answer.trim();
      if (!text) continue;
      if (answers[answer.key]?.trim()) {
        skipped++;
        continue; // never overwrite what a person wrote
      }
      // The answer keeps only its own words; where it came from is recorded alongside,
      // so the story page can show it as a coloured chip the text can't lose.
      answers[answer.key] = text;
      answerSources[answer.key] = input.sourceName;
      answerQuotes[answer.key] = answer.quote ?? "";
      answerSourceKeys[answer.key] = input.sourceKey;
      // Resolved here, where the material's text is in hand — the story page has the quote
      // but never the document, so it could not work out the page for itself later.
      const at = locateQuote(input.text, answer.quote ?? "", input.pageOffsets);
      if (at) answerPages[answer.key] = at.pageIndex;
      answersHere++;
    }

    // Moments the material describes, in the section the model placed them in. Each carries
    // the material in resourceKeys, so the event leads back to what it was drawn from.
    const events = [...existing.events];
    let eventsHere = 0;
    for (const drafted of section.events ?? []) {
      // The service filters these out too. Repeated here because a moment with no title is
      // an empty row a family then has to delete, and trusting the other end not to send
      // one means an older deployed API quietly fills the timeline with blanks.
      const title = drafted.title?.trim();
      if (!title) continue;
      if (events.some((event) => sameMoment(event, { ...drafted, title }))) continue;
      events.push({
        id: crypto.randomUUID(),
        title,
        when: drafted.when?.trim() || undefined,
        description: drafted.description?.trim() || undefined,
        location: drafted.where?.trim() || undefined,
        people: (drafted.people ?? []).map((p) => p.trim()).filter(Boolean),
        resourceKeys: [input.sourceKey],
        source: input.sourceName,
        quote: drafted.quote?.trim() || undefined,
        page: locateQuote(input.text, drafted.quote ?? "", input.pageOffsets)?.pageIndex,
      });
      eventsHere++;
    }

    // Nothing contributed here means nothing to attach: a section this material had no
    // bearing on shouldn't list it under "Resources for this part of the story".
    if (answersHere === 0 && eventsHere === 0) continue;

    const resourceKeys = existing.resourceKeys.includes(input.sourceKey)
      ? existing.resourceKeys
      : [...existing.resourceKeys, input.sourceKey];

    // Per-section, not cumulative: a running total would rewrite every later section once
    // any earlier one had changed, touching sections nothing was added to.
    await saveSection(input.uid, key, {
      ...existing,
      answers,
      answerSources,
      answerQuotes,
      answerSourceKeys,
      answerPages,
      events,
      resourceKeys,
    });
    filled += answersHere;
    addedEvents += eventsHere;
  }

  return { filled, skipped, events: addedEvents };
}

/**
 * Wording for what a fill did — built from whichever of the three things happened, so the
 * message never claims more than it did and never omits something a person should check.
 */
export function describeStoryFill(result: StoryFillResult, sourceName: string): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];

  if (result.filled > 0) parts.push(`filled ${plural(result.filled, "blank answer", "blank answers")}`);
  if (result.events > 0) parts.push(`added ${plural(result.events, "moment", "moments")}`);

  if (parts.length === 0) {
    return result.skipped > 0
      ? "Nothing added — every question this answers was already answered. Existing answers were left alone."
      : "Nothing to add — this doesn't answer any of the interview's questions, and describes no moments.";
  }

  const did = parts.join(" and ");
  const kept = result.skipped > 0 ? ` ${result.skipped} already answered, left alone.` : "";
  return `From ${sourceName}: ${did}, each labelled with where it came from. Added to that part's resources too.${kept}`;
}
