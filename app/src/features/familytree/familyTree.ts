/**
 * The family tree data model.
 *
 * Shaped after the sibling `website` project's genealogy model (components/PersonTypes.ts
 * and the fields its AddPersonDialog collects), trimmed to what a family actually types
 * while gathering a story. The website keeps the rest — face crops, timelines, historical
 * context — alongside a person; here those already live on materials and story sections,
 * so the tree stays a tree.
 *
 * Relationships are stored as `unions` (GEDCOM FAM records), not as a flat list of
 * parent/spouse links. The website only ever renders an imported tree, so flattening is
 * safe there; here a family also edits and re-exports one, and a flat link list can't
 * round-trip a FAM record — a couple with no children vanishes, and a child of a second
 * marriage loses which marriage it belonged to. `treeLinks()` derives the flat links the
 * layout wants, so the ported layout code is unaffected.
 */

export type Sex = "M" | "F" | "";

export interface TreePerson {
  /** Doubles as the GEDCOM xref id (I1, I2, ...) so import/export round-trips. */
  id: string;
  firstName: string;
  lastName: string;
  maidenName?: string;
  sex: Sex;
  /** Free text, as typed or as the source file had it — GEDCOM dates are rarely clean. */
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  /** True when the source said the person had died but gave no date. */
  deceased?: boolean;
  occupation?: string;
  note?: string;
  /** The person this story is about, highlighted in the chart. At most one. */
  isSubject?: boolean;
  /**
   * Small JPEG portrait, normally carried over from a face tagged in the Collection step.
   * Kept tiny on purpose — see toPortrait() in facePeople.ts for why.
   */
  photo?: string;
}

/** A GEDCOM FAM: a couple (0–2 partners) and their children. */
export interface TreeUnion {
  /** Doubles as the GEDCOM xref id (F1, F2, ...). */
  id: string;
  partnerIds: string[];
  childIds: string[];
}

export interface FamilyTree {
  people: TreePerson[];
  unions: TreeUnion[];
}

export const EMPTY_TREE: FamilyTree = { people: [], unions: [] };

export function isEmptyTree(tree: FamilyTree): boolean {
  return tree.people.length === 0;
}

export function displayName(p: TreePerson): string {
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return name || "Unnamed";
}

/**
 * "1902–1943", "b. 1902", "d. 1943", or "" — whatever is actually known.
 *
 * GEDCOM files routinely carry a DEAT block whose date is the word "Unknown". That tells
 * the reader nothing a bare "d." would make clearer, so with no year at either end this
 * stays empty and the full text is left to the person's own row and dialog.
 */
export function lifespan(p: TreePerson): string {
  const birth = yearOf(p.birthDate);
  const death = yearOf(p.deathDate);
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return "";
}

/** GEDCOM dates come in many shapes ("ABT 1902", "12 MAR 1902") — take the 4-digit year. */
export function yearOf(date: string | undefined): string {
  return date?.match(/\d{4}/)?.[0] ?? "";
}

export function initialsOf(p: TreePerson): string {
  const a = p.firstName.trim()[0] ?? "";
  const b = p.lastName.trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

/** Next free `I3` / `F2`-style id, so generated ids stay valid GEDCOM xrefs. */
export function nextId(prefix: "I" | "F", existing: { id: string }[]): string {
  let max = 0;
  for (const item of existing) {
    const n = parseInt(item.id.replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

// ---------------------------------------------------------------------------
// Relationship edits
//
// Nobody builds FAM records by hand. Following the website's AddPersonDialog, a new
// person is placed by saying how they relate to someone already in the tree, and the
// union bookkeeping happens here.
// ---------------------------------------------------------------------------

export type RelationshipType = "none" | "parent" | "child" | "sibling" | "spouse";

export const relationshipOptions: { value: RelationshipType; label: string }[] = [
  { value: "none", label: "Not linked yet" },
  { value: "parent", label: "Parent of" },
  { value: "child", label: "Child of" },
  { value: "sibling", label: "Sibling of" },
  { value: "spouse", label: "Partner of" },
];

/**
 * Applies one relationship between two people already present in `unions`.
 *
 * Mutates the array it is given — callers pass a fresh copy. Shared by adding a new
 * person and by connecting two existing ones, so both routes produce identical FAM
 * records; a tree built either way exports the same GEDCOM.
 */
function linkInUnions(
  unions: TreeUnion[],
  personId: string,
  relation: RelationshipType,
  relatedId: string
): void {
  const newUnion = (patch: Partial<TreeUnion>): TreeUnion => ({
    id: nextId("F", unions),
    partnerIds: [],
    childIds: [],
    ...patch,
  });
  const push = (list: string[], id: string) => {
    if (!list.includes(id)) list.push(id);
  };

  if (relation === "parent") {
    const existing = unions.find((u) => u.childIds.includes(relatedId));
    if (existing) push(existing.partnerIds, personId);
    else unions.push(newUnion({ partnerIds: [personId], childIds: [relatedId] }));
  } else if (relation === "child") {
    // If this person already has a family, the relative joins it as the second parent —
    // naming a father after a mother is the ordinary case, and starting a second family
    // for the same child would be wrong.
    const ownFamily = unions.find((u) => u.childIds.includes(personId));
    if (ownFamily && ownFamily.partnerIds.length < 2) {
      push(ownFamily.partnerIds, relatedId);
    } else {
      const existing = unions.find((u) => u.partnerIds.includes(relatedId));
      if (existing) push(existing.childIds, personId);
      else unions.push(newUnion({ partnerIds: [relatedId], childIds: [personId] }));
    }
  } else if (relation === "sibling") {
    // Siblings aren't stored directly in GEDCOM — they're children of the same union.
    // Whichever of the two already has a family, the other joins it.
    const theirs = unions.find((u) => u.childIds.includes(relatedId));
    const mine = unions.find((u) => u.childIds.includes(personId));
    if (theirs) push(theirs.childIds, personId);
    else if (mine) push(mine.childIds, relatedId);
    else unions.push(newUnion({ childIds: [relatedId, personId] }));
  } else if (relation === "spouse") {
    // Only join a union that still has room for a second partner, so a new marriage
    // doesn't silently land someone in an existing couple.
    const existing = unions.find((u) => u.partnerIds.includes(relatedId) && u.partnerIds.length < 2);
    if (existing) push(existing.partnerIds, personId);
    else unions.push(newUnion({ partnerIds: [relatedId, personId] }));
  }
}

/** Drops unions that ended up carrying no information. */
function pruneUnions(unions: TreeUnion[]): TreeUnion[] {
  return unions.filter((u) => u.partnerIds.length + u.childIds.length > 0);
}

function cloneUnions(tree: FamilyTree): TreeUnion[] {
  return tree.unions.map((u) => ({ ...u, partnerIds: [...u.partnerIds], childIds: [...u.childIds] }));
}

/**
 * Adds `person` to the tree, linked to `relatedId` by `relation`.
 * Returns a new tree; never mutates the one passed in.
 */
export function addPerson(
  tree: FamilyTree,
  person: TreePerson,
  relation: RelationshipType,
  relatedId: string | undefined
): FamilyTree {
  const people = [...tree.people, person];
  const unions = cloneUnions(tree);

  if (relation === "none" || !relatedId) return { people, unions };

  linkInUnions(unions, person.id, relation, relatedId);
  return { people, unions: pruneUnions(unions) };
}

/**
 * Why two people in the tree can't be connected this way, or null when they can.
 *
 * Most of these are limits of what a FAM record can express rather than arbitrary rules,
 * and saying so is the point: silently ignoring an impossible link would leave a family
 * believing they had recorded something they hadn't.
 */
export function whyNotLinkable(
  tree: FamilyTree,
  personId: string,
  relation: RelationshipType,
  relatedId: string,
  /** Translator, so the prose these build reads in the interface language. */
  t: (text: string) => string = (text) => text
): string | null {
  if (relation === "none") return t("Choose how they are related.");
  if (personId === relatedId) return t("A person can't be linked to themselves.");

  const name = (id: string) => {
    const p = tree.people.find((x) => x.id === id);
    return p ? displayName(p) : t("that person");
  };
  /** Sentences carry a name, so they are translated whole with a {name} slot. */
  const about = (text: string, who: string) => t(text).replace("{name}", who);
  const parentsOf = (id: string) => tree.unions.find((u) => u.childIds.includes(id));

  if (relation === "parent") {
    const union = parentsOf(relatedId);
    if (union?.partnerIds.includes(personId))
      return about("Already recorded as a parent of {name}.", name(relatedId));
    if (union && union.partnerIds.length >= 2)
      return about("{name} already has two parents recorded.", name(relatedId));
  }

  if (relation === "child") {
    const ownFamily = parentsOf(personId);
    if (ownFamily) {
      if (ownFamily.partnerIds.includes(relatedId))
        return about("Already recorded as a child of {name}.", name(relatedId));
      // Room for a second parent is the common case — a father named after a mother.
      if (ownFamily.partnerIds.length >= 2) {
        return about("{name} already has two parents recorded. Remove one of those links first.", name(personId));
      }
    }
  }

  if (relation === "sibling") {
    // A person hangs off one set of parents (one FAMC), so two siblings who each already
    // have different families can't be joined without deciding which family is right.
    const mine = parentsOf(personId);
    const theirs = parentsOf(relatedId);
    if (mine && theirs && mine.id === theirs.id)
      return about("Already recorded as a sibling of {name}.", name(relatedId));
    if (mine && theirs) {
      return t("{a} and {b} are recorded in different families. Remove one of those links first.")
        .replace("{a}", name(personId))
        .replace("{b}", name(relatedId));
    }
  }

  if (relation === "spouse") {
    const shared = tree.unions.find((u) => u.partnerIds.includes(personId) && u.partnerIds.includes(relatedId));
    if (shared) return t("Already recorded as partners.");
  }

  return null;
}

/**
 * Connects two people who are BOTH already in the tree.
 *
 * The tree is built a person at a time, so a family typically ends up with people who
 * belong together but were entered separately — a grandmother added from a photograph
 * long before the grandchild who names her. Without this the only way to join them is to
 * delete one and re-add it, losing whatever was recorded about them.
 *
 * Returns the tree unchanged when the link isn't possible; check whyNotLinkable() first
 * to tell someone why.
 */
export function linkPeople(
  tree: FamilyTree,
  personId: string,
  relation: RelationshipType,
  relatedId: string
): FamilyTree {
  if (whyNotLinkable(tree, personId, relation, relatedId)) return tree;

  const unions = cloneUnions(tree);
  linkInUnions(unions, personId, relation, relatedId);
  return { people: tree.people, unions: pruneUnions(unions) };
}

/** One family a person belongs to, and in which role. */
export interface Membership {
  unionId: string;
  role: "partner" | "child";
  /** "Partner of Rivka · parent of Aaron, Leah" — the link in words. */
  description: string;
}

/**
 * The families a person belongs to, as editable links rather than a single sentence.
 *
 * describeRelations() flattens everything into prose for the people list; this keeps each
 * family record separate, because removing a link means leaving one specific family — a
 * person can be a child of one and a partner in another, and prose can't say which to undo.
 */
export function personMemberships(
  tree: FamilyTree,
  id: string,
  /** Translator, so the prose these build reads in the interface language. */
  t: (text: string) => string = (text) => text
): Membership[] {
  const nameOf = (pid: string) => {
    const p = tree.people.find((x) => x.id === pid);
    return p ? displayName(p) : t("someone");
  };

  const memberships: Membership[] = [];
  for (const union of tree.unions) {
    if (union.partnerIds.includes(id)) {
      const partners = union.partnerIds.filter((p) => p !== id).map(nameOf);
      const parts = [
        partners.length ? `${t("Partner of")} ${partners.join(", ")}` : t("In a family of their own"),
        union.childIds.length ? `${t("parent of")} ${union.childIds.map(nameOf).join(", ")}` : "",
      ].filter(Boolean);
      memberships.push({ unionId: union.id, role: "partner", description: parts.join(" · ") });
    }
    if (union.childIds.includes(id)) {
      const parents = union.partnerIds.map(nameOf);
      const siblings = union.childIds.filter((c) => c !== id).map(nameOf);
      const parts = [
        parents.length ? `${t("Child of")} ${parents.join(t(" and "))}` : t("Child in a family"),
        siblings.length ? `${t("sibling of")} ${siblings.join(", ")}` : "",
      ].filter(Boolean);
      memberships.push({ unionId: union.id, role: "child", description: parts.join(" · ") });
    }
  }
  return memberships;
}

/**
 * Removes a person from one family, leaving the family and everyone else in it intact.
 *
 * Deliberately narrower than removePerson(): correcting a mistaken link shouldn't delete
 * the person, and leaving one family shouldn't disturb another they belong to.
 */
export function detachFromUnion(
  tree: FamilyTree,
  personId: string,
  unionId: string,
  role: "partner" | "child"
): FamilyTree {
  const unions = cloneUnions(tree).map((u) => {
    if (u.id !== unionId) return u;
    return role === "partner"
      ? { ...u, partnerIds: u.partnerIds.filter((p) => p !== personId) }
      : { ...u, childIds: u.childIds.filter((c) => c !== personId) };
  });

  // A family holding one person and nothing else records nothing; drop it. A couple with
  // no children is kept — that is a real marriage, and GEDCOM stores it.
  return {
    people: tree.people,
    unions: unions.filter((u) => u.partnerIds.length + u.childIds.length > 1),
  };
}

export function updatePerson(tree: FamilyTree, id: string, patch: Partial<TreePerson>): FamilyTree {
  return {
    ...tree,
    people: tree.people.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p)),
  };
}

/** Removes a person and every reference to them, dropping unions left empty. */
export function removePerson(tree: FamilyTree, id: string): FamilyTree {
  const unions = tree.unions
    .map((u) => ({
      ...u,
      partnerIds: u.partnerIds.filter((p) => p !== id),
      childIds: u.childIds.filter((c) => c !== id),
    }))
    .filter((u) => u.partnerIds.length + u.childIds.length > 0);
  return { people: tree.people.filter((p) => p.id !== id), unions };
}

/** Exactly one person can be the story's subject. */
export function setSubject(tree: FamilyTree, id: string): FamilyTree {
  return {
    ...tree,
    people: tree.people.map((p) => ({ ...p, isSubject: p.id === id ? !p.isSubject : false })),
  };
}

/** How a person is connected, in words — shown in the people list. */
export function describeRelations(
  tree: FamilyTree,
  id: string,
  /** Translator. Defaults to English so callers outside a React tree still work. */
  t: (text: string) => string = (text) => text
): string {
  const nameOf = (pid: string) => {
    const p = tree.people.find((x) => x.id === pid);
    return p ? displayName(p) : t("someone");
  };

  const parts: string[] = [];
  for (const u of tree.unions) {
    if (u.partnerIds.includes(id)) {
      const other = u.partnerIds.filter((p) => p !== id).map(nameOf);
      if (other.length) parts.push(`${t("partner of")} ${other.join(", ")}`);
      if (u.childIds.length) parts.push(`${t("parent of")} ${u.childIds.map(nameOf).join(", ")}`);
    }
    if (u.childIds.includes(id)) {
      const parents = u.partnerIds.map(nameOf);
      if (parents.length) parts.push(`${t("child of")} ${parents.join(t(" and "))}`);
      const siblings = u.childIds.filter((c) => c !== id).map(nameOf);
      if (siblings.length) parts.push(`${t("sibling of")} ${siblings.join(", ")}`);
    }
  }
  return parts.join(" · ");
}
