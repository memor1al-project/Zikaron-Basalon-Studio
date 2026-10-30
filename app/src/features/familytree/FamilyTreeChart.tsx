import { useMemo } from "react";
import { displayName, initialsOf, lifespan, type FamilyTree, type TreePerson } from "./familyTree";
import { layoutTree, NODE_RADIUS } from "./treeLayout";

/**
 * The chart.
 *
 * Structure follows the sibling `website` project's SimpleFamilyTreeRenderer — generations
 * as rows, a circle per person, the name beneath — but drawn as plain SVG in the app's
 * cream palette instead of D3 against a dark one. The website fills each circle with the
 * person's face crop; nothing here has face crops yet, so a circle carries initials, and
 * the subject of the story is marked with the accent ring.
 */
export function FamilyTreeChart({
  tree,
  selectedId,
  onSelect,
  onContextMenu,
}: {
  tree: FamilyTree;
  selectedId?: string;
  /** Omitted on the Summary page, where the chart is a picture rather than an editor. */
  onSelect?: (person: TreePerson) => void;
  /** Right-click (or the keyboard menu key) on a person, in viewport coordinates. */
  onContextMenu?: (person: TreePerson, x: number, y: number) => void;
}) {
  const interactive = Boolean(onSelect);
  const geometry = useMemo(() => layoutTree(tree), [tree]);

  if (tree.people.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", padding: "4px 0" }}>
      {/* Drawn at natural size and scrolled rather than scaled to fit: a large tree is
          thousands of pixels wide, and shrinking it to the panel would flatten a
          216-person family into an unreadable strip. */}
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        width={geometry.width}
        height={geometry.height}
        style={{ display: "block", margin: "0 auto" }}
        role="img"
        aria-label={`Family tree with ${tree.people.length} people`}
      >
        {/* :focus-visible rather than :focus — clicking or right-clicking a node focuses it,
            and the browser's default blue box around a cream chart reads as an error state.
            Keyboard focus still gets a ring, in the app's own accent. */}
        <style>{`
          .ft-node:focus { outline: none; }
          .ft-node:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 3px;
            border-radius: 50%;
          }
        `}</style>
        <g>
          {geometry.links.map((link, i) => {
            const from = geometry.positionById[link.sourceId];
            const to = geometry.positionById[link.targetId];
            if (!from || !to) return null;
            const isSpouse = link.relationship === "Spouse";
            return (
              <path
                key={`${link.sourceId}-${link.targetId}-${i}`}
                d={
                  isSpouse
                    ? `M ${from.x} ${from.y} L ${to.x} ${to.y}`
                    : // Parent edges drop vertically then turn, so descent reads down the page
                      // rather than as a web of diagonals.
                      `M ${from.x} ${from.y + NODE_RADIUS} V ${(from.y + to.y) / 2} H ${to.x} V ${to.y - NODE_RADIUS}`
                }
                fill="none"
                stroke={isSpouse ? "var(--accent)" : "var(--line)"}
                strokeWidth={isSpouse ? 2 : 1.5}
                strokeDasharray={isSpouse ? "4 3" : undefined}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* One clip per portrait: an <image> is square, and these have to read as the same
            circles as the initials they replace. */}
        <defs>
          {geometry.nodes
            .filter(({ person }) => person.photo)
            .map(({ person }) => (
              <clipPath key={person.id} id={`ft-portrait-${person.id}`}>
                <circle r={NODE_RADIUS - 1.5} />
              </clipPath>
            ))}
        </defs>

        <g>
          {geometry.nodes.map(({ person, x, y }) => {
            const selected = person.id === selectedId;
            const years = lifespan(person);
            return (
              <g
                key={person.id}
                className="ft-node"
                transform={`translate(${x},${y})`}
                style={{ cursor: interactive ? "pointer" : "default" }}
                onClick={onSelect && (() => onSelect(person))}
                onContextMenu={(e) => {
                  if (!onContextMenu) return;
                  e.preventDefault();
                  onSelect?.(person);
                  // The keyboard menu key fires this too, but with no pointer position —
                  // fall back to the node's own place on screen.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const fromPointer = e.clientX !== 0 || e.clientY !== 0;
                  onContextMenu(
                    person,
                    fromPointer ? e.clientX : rect.left + rect.width / 2,
                    fromPointer ? e.clientY : rect.bottom
                  );
                }}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelect(person);
                  }
                }}
              >
                <title>{displayName(person)}</title>
                <circle
                  r={NODE_RADIUS}
                  fill={person.isSubject ? "var(--accent-soft)" : "var(--card)"}
                  stroke={selected || person.isSubject ? "var(--accent-deep)" : "var(--line)"}
                  strokeWidth={selected || person.isSubject ? 2.5 : 1.5}
                />
                {person.photo ? (
                  <image
                    href={person.photo}
                    x={-(NODE_RADIUS - 1.5)}
                    y={-(NODE_RADIUS - 1.5)}
                    width={(NODE_RADIUS - 1.5) * 2}
                    height={(NODE_RADIUS - 1.5) * 2}
                    clipPath={`url(#ft-portrait-${person.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <text
                    textAnchor="middle"
                    y={5}
                    style={{
                      fontFamily: "Domine, serif",
                      fontSize: 15,
                      fontWeight: 600,
                      fill: "var(--accent-deep)",
                    }}
                  >
                    {initialsOf(person)}
                  </text>
                )}
                <text
                  textAnchor="middle"
                  y={NODE_RADIUS + 18}
                  style={{ fontSize: 12, fontWeight: 600, fill: "var(--ink)" }}
                >
                  {truncate(displayName(person), 16)}
                </text>
                {years && (
                  <text
                    textAnchor="middle"
                    y={NODE_RADIUS + 33}
                    style={{ fontSize: 10.5, fill: "var(--ink-soft)" }}
                  >
                    {years}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
