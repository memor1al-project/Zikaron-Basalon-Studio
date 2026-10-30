import type { ExampleStoryFile } from "../testimony/types";

/**
 * A worked example as Markdown.
 *
 * Unanswered questions are carried through as unanswered rather than dropped, for the
 * same reason the on-screen panel shows them: a recording genuinely can't supply a birth
 * name or a date, and those gaps are what tell a family which parts only they can fill in.
 * An article that silently omitted them would read as a complete story and teach the
 * opposite lesson.
 */
export function exampleArticle(story: ExampleStoryFile, sourceUrl: string): string {
  const out: string[] = [`# ${story.title}`, ""];
  out.push(
    "*A worked example from Zikaron BaSalon's testimony archive — the Collection Wizard's own questions, answered from a real recording.*",
    "",
    `Source: ${sourceUrl}`,
    ""
  );

  for (const section of story.sections) {
    out.push(`## ${section.title}`, "");
    for (const answer of section.answers) {
      out.push(`**${answer.label}**`, "");
      out.push(answer.answer.trim() || "_Not addressed in this recording._", "");
    }
  }

  if (story.events.length > 0) {
    out.push("## Moments", "");
    for (const event of story.events) {
      out.push(`### ${event.title}${event.when ? ` — ${event.when}` : ""}`, "");
      if (event.description) out.push(event.description, "");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
