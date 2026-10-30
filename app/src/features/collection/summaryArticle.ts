import { describeRelations, displayName, lifespan, type FamilyTree } from "../familytree/familyTree";
import { storySections } from "./storySections";
import type { StoryEvent, StorySectionData, StorySectionKey } from "./interviewService";

/**
 * A family's gathered story as Markdown.
 *
 * Deliberately not an AI rewrite: this is the family's own words, in the order they gave
 * them, with the questions kept alongside so the article can't quietly become a claim
 * nobody made. Anything unanswered is simply absent rather than filled in.
 */
export function summaryArticle({
  subjectName,
  sections,
  tree,
  places,
}: {
  subjectName: string;
  sections: Record<StorySectionKey, StorySectionData>;
  tree: FamilyTree;
  places: string[];
}): string {
  const out: string[] = [`# ${subjectName}`, ""];
  out.push("*Gathered with Zikaron BaSalon Story Studio. Not yet reviewed or published.*", "");

  if (tree.people.length > 0) {
    const subject = tree.people.find((p) => p.isSubject);
    out.push("## Family", "");
    if (subject) {
      const relations = describeRelations(tree, subject.id);
      out.push(
        `**${displayName(subject)}**${lifespan(subject) ? ` (${lifespan(subject)})` : ""}${relations ? ` — ${relations}` : ""}.`,
        ""
      );
    }
    for (const person of tree.people) {
      if (subject && person.id === subject.id) continue;
      const years = lifespan(person);
      out.push(`- ${displayName(person)}${years ? ` (${years})` : ""}`);
    }
    out.push("");
  }

  if (places.length > 0) {
    out.push("## Places", "", places.join(" · "), "");
  }

  const events = storySections.flatMap((s) =>
    sections[s.key].events.map((event) => ({ event, sectionTitle: s.title }))
  );
  if (events.length > 0) {
    out.push("## Timeline", "");
    for (const { event, sectionTitle } of events) {
      out.push(`### ${event.title || "Untitled event"}${event.when ? ` — ${event.when}` : ""}`, "");
      out.push(`*${[sectionTitle, event.location, peopleLine(event)].filter(Boolean).join(" · ")}*`, "");
      if (event.description) out.push(event.description, "");
    }
  }

  out.push("## The story", "");
  for (const section of storySections) {
    const answered = section.fields
      .map((field) => ({ key: field.key, label: field.label, value: sections[section.key].answers[field.key]?.trim() }))
      .filter((a) => a.value);
    if (answered.length === 0) continue;

    out.push(`### ${section.title}`, "");
    for (const answer of answered) {
      out.push(`**${answer.label}**`, "", answer.value!, "");
      // On screen this is a coloured chip; Markdown has no colour, so the same fact is
      // written out. A reader still needs to know which answers a machine drafted.
      const source = sections[section.key].answerSources?.[answer.key];
      if (source) out.push(`*Drafted from ${source}.*`, "");
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

function peopleLine(event: StoryEvent): string {
  return event.people?.length ? `with ${event.people.join(", ")}` : "";
}
