import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayName, type RelationshipType, type TreePerson } from "./familyTree";
import { useT } from "../../i18n";

/**
 * Right-click menu on a person in the chart.
 *
 * Building a tree is mostly "and they had a daughter", "and his father was" — said while
 * looking at the person it hangs off. Going up to a toolbar, opening a blank form and
 * then picking that person back out of a dropdown breaks that train of thought, so the
 * relationship is chosen straight off the face it belongs to.
 *
 * Each entry names the new person's relationship *to the person clicked*: "Add a parent"
 * on Miriam adds Miriam's parent.
 */

const ADD_OPTIONS: { relation: RelationshipType; label: string }[] = [
  { relation: "child", label: "Add a child" },
  { relation: "parent", label: "Add a parent" },
  { relation: "sibling", label: "Add a sibling" },
  { relation: "spouse", label: "Add a partner" },
];

/** Enough to keep the menu off the window edges before it has been measured. */
const ESTIMATED = { width: 210, height: 250 };

export function NodeMenu({
  person,
  x,
  y,
  onAdd,
  onConnect,
  onEdit,
  onClose,
}: {
  person: TreePerson;
  x: number;
  y: number;
  onAdd: (relation: RelationshipType) => void;
  onConnect: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    // Flip back inside the window rather than off the edge — a right-click near the
    // bottom of a long tree is the common case, not the exception.
    const { width, height } = ref.current?.getBoundingClientRect() ?? ESTIMATED;
    setPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Scroll closes it too: the menu is anchored to the viewport but the node it belongs
    // to is not, so they would drift apart.
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 70 }}
    >
      <div
        ref={ref}
        role="menu"
        aria-label={`${t("Actions for")} ${displayName(person)}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: position.x,
          top: position.y,
          minWidth: 200,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          boxShadow: "0 18px 40px -20px oklch(30% 0.03 50 / 0.5)",
          padding: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            padding: "8px 10px 6px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName(person)}
        </div>

        {ADD_OPTIONS.map((option) => (
          <MenuItem key={option.relation} onClick={() => onAdd(option.relation)}>
            {t(option.label)}
          </MenuItem>
        ))}

        <div style={{ height: 1, background: "var(--line)", margin: "6px 8px" }} />

        {/* The entries above create someone new; this one joins two people already here. */}
        <MenuItem onClick={onConnect}>{t("Connect to someone in the tree")}</MenuItem>

        <div style={{ height: 1, background: "var(--line)", margin: "6px 8px" }} />

        <MenuItem onClick={onEdit}>{t("Edit details")}</MenuItem>
      </div>
    </div>,
    document.body
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "9px 10px",
        borderRadius: 8,
        border: "none",
        fontSize: 13.5,
        color: "var(--ink)",
        background: hover ? "var(--accent-soft)" : "transparent",
      }}
    >
      {children}
    </button>
  );
}
