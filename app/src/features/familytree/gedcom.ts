/**
 * GEDCOM 5.5.1 import and export.
 *
 * The parser is ported from the sibling `website` project's components/GedcomTranslator.ts —
 * same record split, same level-by-level scan, same tag handling for the fields kept here.
 * Two deliberate differences, both because this app edits and re-exports a tree where the
 * website only renders one:
 *
 * 1. FAM records become unions rather than being flattened into parent/spouse links
 *    (see the note in familyTree.ts).
 * 2. SEX is read and written. The website ignores it; export needs it to decide HUSB vs WIFE.
 *
 * Dates are passed through as written. Real GEDCOM files are full of "ABT 1902",
 * "BEF 1940" and half-known dates, and rewriting them into a canonical format would
 * throw away what the family actually knows. `yearOf()` pulls a year out when one is needed.
 */

import { nextId, type FamilyTree, type Sex, type TreePerson, type TreeUnion } from "./familyTree";

/** A GEDCOM line: "2 DATE 12 MAR 1902" → level 2, tag DATE, value "12 MAR 1902". */
function splitLine(line: string): { level: number; tag: string; value: string } | null {
  const m = line.match(/^(\d+)\s+(?:@\w+@\s+)?(\S+)(?:\s(.*))?$/);
  if (!m) return null;
  return { level: parseInt(m[1], 10), tag: m[2], value: (m[3] ?? "").trim() };
}

export function parseGedcom(text: string): FamilyTree {
  const people: TreePerson[] = [];
  const unions: TreeUnion[] = [];

  // Records start at a level-0 line carrying an xref pointer.
  const records = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split(/\n(?=0\s+@)/);

  for (const record of records) {
    const lines = record.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const id = lines[0].match(/@([^@]+)@/)?.[1];
    if (!id) continue;

    if (/\bINDI\b/.test(lines[0])) {
      people.push(parseIndividual(id, lines));
    } else if (/\bFAM\b/.test(lines[0])) {
      const partnerIds: string[] = [];
      const childIds: string[] = [];
      for (const line of lines.slice(1)) {
        const parsed = splitLine(line);
        if (!parsed || parsed.level !== 1) continue;
        const ref = parsed.value.match(/@([^@]+)@/)?.[1];
        if (!ref) continue;
        if (parsed.tag === "HUSB" || parsed.tag === "WIFE") partnerIds.push(ref);
        else if (parsed.tag === "CHIL") childIds.push(ref);
      }
      unions.push({ id, partnerIds, childIds });
    }
  }

  // A file can point at individuals it never defines; keeping those references would
  // render as edges into nothing.
  const known = new Set(people.map((p) => p.id));
  const cleaned = unions
    .map((u) => ({
      id: u.id,
      partnerIds: u.partnerIds.filter((p) => known.has(p)),
      childIds: u.childIds.filter((c) => known.has(c)),
    }))
    .filter((u) => u.partnerIds.length + u.childIds.length > 0);

  return { people, unions: cleaned };
}

function parseIndividual(id: string, lines: string[]): TreePerson {
  const person: TreePerson = { id, firstName: "", lastName: "", sex: "" };
  let parentTag = "";

  for (const line of lines.slice(1)) {
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { level, tag, value } = parsed;

    if (level === 1) {
      parentTag = tag;
      switch (tag) {
        case "NAME": {
          // GEDCOM wraps the surname in slashes: "Miriam /Helfgott/".
          const m = value.match(/([^/]*)(?:\/([^/]*)\/)?/);
          person.firstName = cleanNamePart(m?.[1]);
          person.lastName = cleanNamePart(m?.[2]);
          break;
        }
        case "SEX":
          person.sex = normalizeSex(value);
          break;
        case "OCCU":
          person.occupation = value;
          break;
        case "_MARNM":
          person.maidenName = value.split(" ").pop();
          break;
        case "NOTE":
          person.note = appendNote(person.note, value);
          break;
        case "DEAT":
          person.deceased = true;
          break;
      }
    } else if (level === 2) {
      switch (parentTag) {
        case "BIRT":
          if (tag === "DATE") person.birthDate = value;
          else if (tag === "PLAC") person.birthPlace = value;
          break;
        case "DEAT":
          if (tag === "DATE") person.deathDate = value;
          else if (tag === "PLAC") person.deathPlace = value;
          break;
        case "NAME":
          // Some exporters put the maiden name under NAME rather than at level 1.
          if (tag === "_MARNM" || tag === "SURN") {
            if (tag === "_MARNM") person.maidenName = value.split(" ").pop();
            else if (!person.lastName) person.lastName = value;
          }
          break;
        case "NOTE":
          if (tag === "CONC") person.note = (person.note ?? "") + value;
          else if (tag === "CONT") person.note = appendNote(person.note, value);
          break;
      }
    }
  }

  return person;
}

/**
 * Exporters that build GEDCOM by string concatenation leak their own missing values into
 * name fields — the Strupp tree in the sibling project carries four people literally named
 * `null /Shlezinger/`. Treating those as blank shows "Shlezinger" rather than "null Shlezinger".
 */
function cleanNamePart(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  return /^(null|undefined|n\/a|unknown|\?)$/i.test(value) ? "" : value;
}

function appendNote(existing: string | undefined, value: string): string {
  return existing ? `${existing}\n${value}` : value;
}

function normalizeSex(value: string): Sex {
  const v = value.trim().toUpperCase();
  return v === "M" || v === "F" ? v : "";
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Writes the tree as GEDCOM 5.5.1, so a family can take it into Gramps, Ancestry, or
 * MyHeritage — the same round trip the website's import page asks people to make in
 * the other direction.
 */
export function serializeGedcom(tree: FamilyTree): string {
  const lines: string[] = [
    "0 HEAD",
    "1 SOUR ZIKARON_BASALON_STORY_STUDIO",
    "2 NAME Zikaron BaSalon Story Studio",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    `1 DATE ${gedcomDate(new Date())}`,
  ];

  for (const person of tree.people) {
    lines.push(`0 @${person.id}@ INDI`);
    lines.push(`1 NAME ${person.firstName} /${person.lastName}/`);
    if (person.maidenName) lines.push(`2 _MARNM ${person.maidenName}`);
    if (person.sex) lines.push(`1 SEX ${person.sex}`);

    if (person.birthDate || person.birthPlace) {
      lines.push("1 BIRT");
      if (person.birthDate) lines.push(`2 DATE ${person.birthDate}`);
      if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
    }

    if (person.deathDate || person.deathPlace) {
      lines.push("1 DEAT");
      if (person.deathDate) lines.push(`2 DATE ${person.deathDate}`);
      if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
    } else if (person.deceased) {
      // The standard's way of saying "died, date unknown".
      lines.push("1 DEAT Y");
    }

    if (person.occupation) lines.push(`1 OCCU ${person.occupation}`);
    if (person.note) lines.push(...noteLines(person.note));

    // FAMC/FAMS pointers: many readers build their tree from these rather than
    // from the FAM records alone.
    for (const union of tree.unions) {
      if (union.childIds.includes(person.id)) lines.push(`1 FAMC @${union.id}@`);
      if (union.partnerIds.includes(person.id)) lines.push(`1 FAMS @${union.id}@`);
    }
  }

  for (const union of tree.unions) {
    lines.push(`0 @${union.id}@ FAM`);
    const [husb, wife] = partnerRoles(union, tree);
    if (husb) lines.push(`1 HUSB @${husb}@`);
    if (wife) lines.push(`1 WIFE @${wife}@`);
    for (const child of union.childIds) lines.push(`1 CHIL @${child}@`);
  }

  lines.push("0 TRLR");
  return lines.join("\n") + "\n";
}

/**
 * GEDCOM has only HUSB and WIFE slots. Where sex is recorded it decides; where it isn't,
 * partners keep their stored order rather than being assigned a sex we were never told.
 */
function partnerRoles(union: TreeUnion, tree: FamilyTree): [string | undefined, string | undefined] {
  const partners = union.partnerIds.map((id) => tree.people.find((p) => p.id === id)).filter(Boolean) as TreePerson[];
  if (partners.length === 0) return [undefined, undefined];

  const male = partners.find((p) => p.sex === "M");
  const female = partners.find((p) => p.sex === "F");
  if (male && female) return [male.id, female.id];
  if (male) return [male.id, partners.find((p) => p.id !== male.id)?.id];
  if (female) return [partners.find((p) => p.id !== female.id)?.id, female.id];
  return [partners[0]?.id, partners[1]?.id];
}

/** A note becomes "1 NOTE first line" plus a "2 CONT" per further line. */
function noteLines(note: string): string[] {
  const [first, ...rest] = note.split("\n");
  return [`1 NOTE ${first}`, ...rest.map((line) => `2 CONT ${line}`)];
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function gedcomDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Re-keys an imported tree onto fresh sequential ids.
 *
 * Imported files use whatever xrefs their exporter chose (`@I0001@`, `@P42@`, even
 * `@INDI1@`). Left alone they collide with ids this app hands out, so an import into a
 * tree that already has people would silently merge two different individuals.
 */
export function renumber(tree: FamilyTree, startAfter: FamilyTree): FamilyTree {
  const personIds = new Map<string, string>();
  const people: TreePerson[] = [];
  const taken = [...startAfter.people];

  for (const person of tree.people) {
    const id = nextId("I", taken);
    personIds.set(person.id, id);
    const renamed = { ...person, id };
    people.push(renamed);
    taken.push(renamed);
  }

  const takenUnions = [...startAfter.unions];
  const unions = tree.unions.map((union) => {
    const id = nextId("F", takenUnions);
    takenUnions.push({ ...union, id });
    return {
      id,
      partnerIds: union.partnerIds.map((p) => personIds.get(p)).filter(Boolean) as string[],
      childIds: union.childIds.map((c) => personIds.get(c)).filter(Boolean) as string[],
    };
  });

  return { people, unions };
}
