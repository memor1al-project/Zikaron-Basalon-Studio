import { useMemo, useState } from "react";
import {
  displayName,
  lifespan,
  relationshipOptions,
  whyNotLinkable,
  type FamilyTree,
  type RelationshipType,
  type TreePerson,
} from "./familyTree";
import { useT } from "../../i18n";

/**
 * Connects two people who are already in the tree.
 *
 * A family builds a tree a person at a time, often from photographs, so people who belong
 * together routinely get entered separately — a great-uncle added from a group shot weeks
 * before the nephew who explains who he was. Until now the only way to join them was to
 * delete one and add it again through the "add a relative" flow, throwing away whatever
 * had been recorded about them.
 *
 * Impossible links are shown as impossible, with the reason, rather than being hidden or
 * silently ignored — most of the limits come from what a GEDCOM family record can hold.
 */
export function ConnectDialog({
  tree,
  person,
  onConnect,
  onClose,
}: {
  tree: FamilyTree;
  /** The person the connection is being made *from* — the one whose menu was used. */
  person: TreePerson;
  onConnect: (relation: RelationshipType, relatedId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [relation, setRelation] = useState<RelationshipType>("child");
  const [query, setQuery] = useState("");

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tree.people
      .filter((p) => p.id !== person.id)
      .filter((p) => !q || displayName(p).toLowerCase().includes(q))
      .map((p) => ({ person: p, blocked: whyNotLinkable(tree, person.id, relation, p.id, t) }))
      // Connectable people first; the rest stay visible with their reason.
      .sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)));
  }, [tree, person.id, relation, query, t]);

  const relationLabel =
    relationshipOptions.find((o) => o.value === relation)?.label ?? "related to";
  const relationText = t(relationLabel).toLowerCase();

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(20% 0.02 50 / 0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 24,
        overflowY: "auto",
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        style={{
          width: "min(560px, 100%)",
          background: "var(--bg-cream)",
          borderRadius: 16,
          marginBlock: "auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "18px 24px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ fontSize: 17 }}>
            {t("Connect")} {displayName(person)}
          </h2>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }}>
            {t("Close")}
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label htmlFor="connect-relation" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
              {displayName(person)} {t("is the…")}
            </label>
            <select
              id="connect-relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value as RelationshipType)}
              style={{ width: "100%" }}
            >
              {relationshipOptions
                .filter((o) => o.value !== "none")
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="connect-search" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>
              {t("…of whom?")}
            </label>
            <input
              id="connect-search"
              type="text"
              placeholder={t("Search people already in the tree")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>

          {candidates.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              {tree.people.length <= 1
                ? t("There's nobody else in the tree yet.")
                : t('Nobody matches "{q}".').replace("{q}", query)}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
              {candidates.map(({ person: candidate, blocked }) => (
                <button
                  key={candidate.id}
                  type="button"
                  disabled={Boolean(blocked)}
                  title={blocked ?? `${displayName(person)} — ${relationText} ${displayName(candidate)}`}
                  onClick={() => {
                    onConnect(relation, candidate.id);
                    onClose();
                  }}
                  className="option-card"
                  style={{ gap: 12, opacity: blocked ? 0.55 : 1 }}
                >
                  {candidate.photo ? (
                    <img
                      src={candidate.photo}
                      alt=""
                      style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: "var(--bg-cream-2)",
                        color: "var(--ink-soft)",
                        fontSize: 12,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {(candidate.firstName[0] ?? "") + (candidate.lastName[0] ?? "") || "?"}
                    </span>
                  )}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{displayName(candidate)}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--ink-soft)" }}>
                      {blocked ?? lifespan(candidate) ?? ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
