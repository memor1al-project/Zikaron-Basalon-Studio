/**
 * Generation layout for the family chart.
 *
 * The algorithm is ported from the sibling `website` project's
 * components/SimpleFamilyTreeRenderer.ts: a breadth-first walk that puts everyone with no
 * recorded parents on the top row, pushes each child one row down, keeps partners on the
 * same row, then lays each row out left to right with partners kept adjacent.
 *
 * What is *not* ported is the drawing. That renderer is D3 against a dark palette; this
 * app has no D3 dependency and a cream one, so the positions computed here are handed to
 * plain SVG in FamilyTreeChart.tsx. Keeping the geometry in its own module also means the
 * layout stays testable without a DOM.
 */

import type { FamilyTree, TreePerson } from "./familyTree";

export interface TreeLink {
  sourceId: string;
  targetId: string;
  relationship: "Parent" | "Spouse";
}

/** Flattens unions into the parent/spouse edges the layout and the chart draw. */
export function treeLinks(tree: FamilyTree): TreeLink[] {
  const links: TreeLink[] = [];
  for (const union of tree.unions) {
    const [a, b] = union.partnerIds;
    if (a && b) links.push({ sourceId: a, targetId: b, relationship: "Spouse" });
    for (const child of union.childIds) {
      for (const partner of union.partnerIds) {
        links.push({ sourceId: partner, targetId: child, relationship: "Parent" });
      }
    }
  }
  return links;
}

/**
 * Row index per person: 0 is the oldest recorded generation.
 *
 * The website's single BFS pass assigns each person a row the first time it reaches them
 * and never revisits it, which breaks on real files: a partner who was already seeded on
 * the top row (because their own parents aren't in the tree) stays there while their
 * spouse sits a row below, and the chart draws a long diagonal across the whole page.
 * The Strupp tree does exactly this.
 *
 * So this relaxes to a fixed point instead, holding two invariants:
 *   - a child sits strictly below every one of its parents
 *   - partners share a row
 *
 * Each pass can only push rows downward, and no row exceeds the number of people, so it
 * settles. The iteration cap is a guard against malformed data where someone ends up
 * their own ancestor — a cycle would otherwise push rows down forever.
 */
export function generations(tree: FamilyTree, links: TreeLink[]): Record<string, number> {
  const gen: Record<string, number> = {};
  for (const person of tree.people) gen[person.id] = 0;

  const parentLinks = links.filter((l) => l.relationship === "Parent");
  const spouseLinks = links.filter((l) => l.relationship === "Spouse");

  const maxPasses = tree.people.length + 2;
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;

    for (const link of parentLinks) {
      const wanted = (gen[link.sourceId] ?? 0) + 1;
      if ((gen[link.targetId] ?? 0) < wanted) {
        gen[link.targetId] = wanted;
        changed = true;
      }
    }

    for (const link of spouseLinks) {
      const row = Math.max(gen[link.sourceId] ?? 0, gen[link.targetId] ?? 0);
      if (gen[link.sourceId] !== row || gen[link.targetId] !== row) {
        gen[link.sourceId] = row;
        gen[link.targetId] = row;
        changed = true;
      }
    }

    if (!changed) break;
  }

  return gen;
}

export interface PositionedPerson {
  person: TreePerson;
  x: number;
  y: number;
}

export interface TreeGeometry {
  nodes: PositionedPerson[];
  links: TreeLink[];
  positionById: Record<string, { x: number; y: number }>;
  width: number;
  height: number;
}

export const NODE_RADIUS = 26;
const COLUMN_WIDTH = 132;
const ROW_HEIGHT = 136;
const MARGIN_X = 40;
const MARGIN_TOP = 44;
/**
 * Must clear everything drawn below a node's centre, or the bottom row is cut off by the
 * viewBox: the name baseline sits at radius + 18 and the years at radius + 33, so the
 * lowest ink is about radius + 37 once the descenders are counted.
 */
const MARGIN_BOTTOM = NODE_RADIUS + 44;

export function layoutTree(tree: FamilyTree): TreeGeometry {
  const links = treeLinks(tree);
  const gen = generations(tree, links);

  const rows = new Map<number, TreePerson[]>();
  for (const person of tree.people) {
    const row = gen[person.id] ?? 0;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(person);
  }

  // Partners should read as a couple, so pull each one in next to the other.
  const partnerOf = new Map<string, string>();
  for (const link of links) {
    if (link.relationship !== "Spouse") continue;
    partnerOf.set(link.sourceId, link.targetId);
    partnerOf.set(link.targetId, link.sourceId);
  }

  for (const [row, members] of rows) {
    const placed = new Set<string>();
    const ordered: TreePerson[] = [];
    for (const person of members) {
      if (placed.has(person.id)) continue;
      ordered.push(person);
      placed.add(person.id);
      const partnerId = partnerOf.get(person.id);
      if (!partnerId || placed.has(partnerId)) continue;
      const partner = members.find((m) => m.id === partnerId);
      if (partner) {
        ordered.push(partner);
        placed.add(partnerId);
      }
    }
    rows.set(row, ordered);
  }

  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const width = MARGIN_X * 2 + (widest - 1) * COLUMN_WIDTH + NODE_RADIUS * 2;
  const rowCount = Math.max(1, ...[...rows.keys()].map((r) => r + 1));
  const height = MARGIN_TOP + (rowCount - 1) * ROW_HEIGHT + MARGIN_BOTTOM;

  const nodes: PositionedPerson[] = [];
  const positionById: Record<string, { x: number; y: number }> = {};

  for (const [row, members] of rows) {
    const rowWidth = (members.length - 1) * COLUMN_WIDTH;
    const startX = (width - rowWidth) / 2;
    members.forEach((person, index) => {
      const x = startX + index * COLUMN_WIDTH;
      const y = MARGIN_TOP + row * ROW_HEIGHT;
      nodes.push({ person, x, y });
      positionById[person.id] = { x, y };
    });
  }

  return { nodes, links, positionById, width, height };
}
