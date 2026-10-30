import { createPortal } from "react-dom";
import { useT } from "../../i18n";

/**
 * Why an AI action didn't run.
 *
 * Its own file so AiComingSoon.tsx exports only a hook — a module mixing a component
 * with plain functions breaks fast refresh for everything importing it.
 */
export function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  const t = useT();

  return createPortal(
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
          width: "min(520px, 100%)",
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
          <h2 style={{ fontSize: 17 }}>{t("Coming soon")}</h2>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }}>
            {t("Close")}
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {t(
              "The AI features aren't switched on yet. Zikaron BaSalon is setting up the account they'll run on, and they'll appear here once that's in place."
            )}
          </p>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {t(
              "When they are, this will summarize what a material says, build a timeline, draft the story's answers from a document, and divide a recorded testimony into chapters."
            )}
          </p>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            {t(
              "Nothing is waiting on them in the meantime: reading a PDF's text, finding faces, tags, notes, places, the family tree and the catalog all work now, on your own device."
            )}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
