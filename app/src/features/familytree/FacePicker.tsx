import { useState } from "react";
import { createPortal } from "react-dom";
import type { NamedFace } from "./facePeople";
import { useT } from "../../i18n";

/**
 * Pick people from the faces tagged in the Collection step.
 *
 * Two jobs, same grid:
 *  - "multi": choose several named faces to add to the tree as new people.
 *  - "single": choose one face as the portrait for a person already in the tree.
 *
 * Only faces that were given a name appear. An unnamed crop has nothing to call the person
 * it shows, and the whole point of this shortcut is that the naming has already been done.
 */
export function FacePicker({
  faces,
  mode,
  alreadyInTree,
  onCancel,
  onConfirm,
}: {
  faces: NamedFace[];
  mode: "multi" | "single";
  /** Lower-cased names already present, so the same person isn't added twice. */
  alreadyInTree: Set<string>;
  onCancel: () => void;
  onConfirm: (chosen: NamedFace[]) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = faces.filter((f) => mode === "single" || !alreadyInTree.has(f.label.toLowerCase()));
  const skipped = faces.length - selectable.length;

  function toggle(face: NamedFace) {
    const key = face.label.toLowerCase();
    setSelected((prev) => {
      if (mode === "single") return new Set(prev.has(key) ? [] : [key]);
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chosen = faces.filter((f) => selected.has(f.label.toLowerCase()));

  // Portalled for the same reason as PersonDialog: .card-enter keeps a transform applied,
  // and a transformed ancestor makes position:fixed resolve against it instead of the
  // viewport. z-index clears PersonDialog, which opens this one on top of itself.
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "oklch(24% 0.025 50 / 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        role="dialog"
        aria-modal="true"
        aria-label={t("Choose from tagged faces")}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "calc(100svh - 48px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 16,
          boxShadow: "0 24px 60px -30px oklch(30% 0.03 50 / 0.45)",
        }}
      >
        <div style={{ padding: "22px 24px 14px" }}>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>
            {mode === "single" ? t("Choose a portrait") : t("Add from tagged faces")}
          </h2>
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            {mode === "single"
              ? t("Faces you've named while tagging photographs in Collection.")
              : t("People you've already named while tagging photographs. Pick anyone to add them to the tree.")}
          </p>
        </div>

        <div style={{ padding: "0 24px", overflowY: "auto", flex: 1 }}>
          {selectable.length === 0 ? (
            <EmptyFaces everyoneAdded={faces.length > 0} />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))",
                gap: 12,
                paddingBottom: 4,
              }}
            >
              {selectable.map((face) => {
                const isSelected = selected.has(face.label.toLowerCase());
                const inTree = alreadyInTree.has(face.label.toLowerCase());
                return (
                  <button
                    key={face.label}
                    type="button"
                    onClick={() => toggle(face)}
                    aria-pressed={isSelected}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      padding: "14px 8px",
                      borderRadius: 12,
                      border: `1px solid ${isSelected ? "var(--accent)" : "var(--line)"}`,
                      borderWidth: isSelected ? 1.5 : 1,
                      background: isSelected ? "var(--accent-soft)" : "var(--bg-cream)",
                    }}
                  >
                    <img
                      src={face.dataUrl}
                      alt=""
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "1px solid var(--line)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        textAlign: "center",
                        lineHeight: 1.3,
                        wordBreak: "break-word",
                      }}
                    >
                      {face.label}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>
                      {inTree
                        ? t("already in tree")
                        : t(face.appearances === 1 ? "{n} photo" : "{n} photos").replace(
                            "{n}",
                            String(face.appearances)
                          )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {mode === "multi" && skipped > 0 && (
            <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 14 }}>
              {t(
                skipped === 1
                  ? "{n} name is already in the tree and not shown."
                  : "{n} names are already in the tree and not shown."
              ).replace("{n}", String(skipped))}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "18px 24px 20px",
            marginTop: 14,
            borderTop: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            {chosen.length > 0 && t("{n} selected").replace("{n}", String(chosen.length))}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn-secondary" onClick={onCancel}>
              {t("Cancel")}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={chosen.length === 0}
              onClick={() => onConfirm(chosen)}
            >
              {mode === "single"
                ? t("Use this portrait")
                : chosen.length === 0
                  ? t("Add people")
                  : t(chosen.length === 1 ? "Add {n} person" : "Add {n} people").replace(
                      "{n}",
                      String(chosen.length)
                    )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EmptyFaces({ everyoneAdded }: { everyoneAdded: boolean }) {
  const t = useT();
  return (
    <div
      style={{
        border: "1px dashed var(--line)",
        borderRadius: 12,
        padding: "24px 20px",
        textAlign: "center",
      }}
    >
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>
        {everyoneAdded ? (
          t("Everyone you've named is already in the tree.")
        ) : (
          <>
            {t("No named faces yet. In")} <strong style={{ color: "var(--ink)" }}>{t("Collection")}</strong>
            {t(", open a photograph, run")} <strong style={{ color: "var(--ink)" }}>{t("Extract faces")}</strong>
            {t(", and type a name against each one — they'll show up here.")}
          </>
        )}
      </p>
    </div>
  );
}
