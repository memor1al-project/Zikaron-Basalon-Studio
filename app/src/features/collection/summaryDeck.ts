import { displayName, lifespan, type FamilyTree } from "../familytree/familyTree";
import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import { toDataUrl, type DeckSlide, type DeckSpec } from "../products/storyDeck";
import { storySections } from "./storySections";
import type { StorySectionData, StorySectionKey } from "./interviewService";
import type { ProviderFile } from "../../lib/storage/types";

/** Enough for an evening without turning the deck into a slideshow of everything. */
const MAX_PHOTO_SLIDES = 8;

/**
 * A family's gathered story as a running order for the evening.
 *
 * Ordered the way a host would tell it: who this is about, the family around them, then
 * each part of the story with its moments, and the message for today last. Events get a
 * slide each because they're what a room responds to; the question-and-answer material
 * goes on one slide per section with the full text in the speaker notes.
 */
export async function summaryDeck({
  subjectName,
  sections,
  tree,
  files,
}: {
  subjectName: string;
  sections: Record<StorySectionKey, StorySectionData>;
  tree: FamilyTree;
  files: ProviderFile[];
}): Promise<DeckSpec> {
  const subject = tree.people.find((p) => p.isSubject);
  const slides: DeckSlide[] = [];

  // The closing section is held back to the end rather than appearing in sequence.
  const closing = storySections.find((s) => s.key === "messageToday");

  for (const section of storySections) {
    if (section.key === closing?.key) continue;

    const answered = section.fields
      .map((field) => ({ label: field.label, text: sections[section.key].answers[field.key]?.trim() }))
      .filter((a): a is { label: string; text: string } => Boolean(a.text));

    if (answered.length > 0) {
      slides.push({
        title: section.title,
        bullets: answered.map((a) => ({ label: a.label, text: truncate(a.text, 180) })),
        // The room sees a readable amount; the host keeps every word.
        notes: answered.map((a) => `${a.label}\n${a.text}`).join("\n\n"),
      });
    }

    for (const event of sections[section.key].events) {
      slides.push({
        title: event.title || "Untitled moment",
        subtitle: [event.when, event.location].filter(Boolean).join(" · ") || undefined,
        bullets: [
          ...(event.description ? [{ text: truncate(event.description, 240) }] : []),
          ...(event.people?.length ? [{ label: "Who was here", text: event.people.join(", ") }] : []),
        ],
        notes: event.description || undefined,
      });
    }
  }

  const photos = files.filter((f) => f.mimeType.startsWith("image/")).slice(0, MAX_PHOTO_SLIDES);
  for (const photo of photos) {
    // A photo that won't load is skipped rather than leaving an empty frame on screen.
    const dataUrl = await getObjectUrlFor(photo).then(toDataUrl).catch(() => null);
    if (!dataUrl) continue;
    slides.push({ title: photo.name.replace(/\.[^.]+$/, ""), imageDataUrl: dataUrl });
  }

  if (closing) {
    const answered = closing.fields
      .map((field) => ({ label: field.label, text: sections[closing.key].answers[field.key]?.trim() }))
      .filter((a): a is { label: string; text: string } => Boolean(a.text));
    if (answered.length > 0) {
      slides.push({
        title: closing.title,
        bullets: answered.map((a) => ({ label: a.label, text: truncate(a.text, 180) })),
        notes: answered.map((a) => `${a.label}\n${a.text}`).join("\n\n"),
      });
    }
  }

  return {
    title: subjectName,
    subtitle: subject && lifespan(subject) ? lifespan(subject) : undefined,
    footer: `${subject ? displayName(subject) : subjectName} · Zikaron BaSalon`,
    tree,
    slides,
  };
}

/** Slides are for a room, not a reader — the full text lives in the speaker notes. */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
