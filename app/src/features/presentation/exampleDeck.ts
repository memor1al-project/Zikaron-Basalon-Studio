import type { DeckSlide, DeckSpec } from "../products/storyDeck";
import type { ExampleStoryFile } from "../testimony/types";

/**
 * A worked example as a deck.
 *
 * Unlike the article, unanswered questions are left off the slides entirely: a room
 * doesn't need to be shown a blank, and a slide reading "not addressed in this recording"
 * would waste the one thing a projector is good for. The count of what the recording
 * couldn't answer goes on a closing slide instead, because that gap is the point of the
 * worked example — it's what a family has to bring themselves.
 */
export function exampleDeck(story: ExampleStoryFile, sourceUrl: string): DeckSpec {
  const slides: DeckSlide[] = [];
  let unanswered = 0;

  for (const section of story.sections) {
    const answered = section.answers.filter((a) => a.answer.trim());
    unanswered += section.answers.length - answered.length;
    if (answered.length === 0) continue;

    slides.push({
      title: section.title,
      bullets: answered.map((a) => ({ label: a.label, text: truncate(a.answer.trim(), 180) })),
      notes: answered.map((a) => `${a.label}\n${a.answer.trim()}`).join("\n\n"),
    });
  }

  for (const event of story.events) {
    slides.push({
      title: event.title,
      subtitle: event.when || undefined,
      bullets: event.description ? [{ text: truncate(event.description, 240) }] : undefined,
      notes: event.description || undefined,
    });
  }

  if (unanswered > 0) {
    slides.push({
      title: "What a recording can't say",
      bullets: [
        {
          text: `${unanswered} of ${countQuestions(story)} questions go unanswered here — names, dates, and why this story matters to the family telling it. Those are the parts only they can fill in.`,
        },
      ],
      notes: `Source: ${sourceUrl}`,
    });
  }

  return {
    title: story.title,
    subtitle: "A worked example from Zikaron BaSalon's testimony archive",
    footer: sourceUrl,
    slides,
    rtl: story.dir === "rtl",
  };
}

function countQuestions(story: ExampleStoryFile): number {
  return story.sections.reduce((total, section) => total + section.answers.length, 0);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
