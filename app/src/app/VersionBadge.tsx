import { useState } from "react";
import { createPortal } from "react-dom";
import { featureSections, releases } from "../releases";
import { useT } from "../i18n";
import { reporterEnabled, setReporterEnabled } from "../features/report/reportStore";

/**
 * The running version, and what's in it.
 *
 * Doubles as the answer to "am I actually on the new build?" — a question that costs real
 * time to answer otherwise, because a cached page looks identical to a current one.
 */
export function VersionBadge() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Build ${__BUILD_NUMBER__}, ${__BUILD_ID__} — see what's new`}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 10.5,
          color: "var(--ink-soft)",
          textAlign: "left",
          opacity: 0.8,
        }}
      >
        v{__APP_VERSION__} · build {__BUILD_NUMBER__}
      </button>

      {open && <ReleaseNotes onClose={() => setOpen(false)} />}
    </>
  );
}

function ReleaseNotes({ onClose }: { onClose: () => void }) {
  const t = useT();
  // Read on open rather than held in a parent: this panel is the only place the setting
  // is shown, and it is rebuilt each time it opens.
  const [reporting, setReporting] = useState(reporterEnabled);
  // Portalled to <body>: the badge lives in the sidebar, which sits inside a z-index:1
  // stacking context, and <main> shares that z-index but comes later in the DOM — so an
  // overlay rendered in place was painted underneath the page instead of over it.
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
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        style={{
          width: "min(640px, 100%)",
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
          <div>
            <h2 style={{ fontSize: 18 }}>{t("What's new")}</h2>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 2 }}>
              {t("Version")} {__APP_VERSION__} · {t("build")} {__BUILD_NUMBER__} · {__BUILD_ID__}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }}>
            Close
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 22 }}>
          {featureSections.length > 0 && (
            <div>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>{t("Everything in this version")}</h3>
              <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 12 }}>
                {t("What the Studio does today. The releases below are how it got here.")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {featureSections.map((section) => (
                  <div key={section.title}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 5 }}>{section.title}</div>
                    <ul style={{ margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {section.items.map((item) => (
                        <li key={item} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-soft)" }}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ height: 1, background: "var(--line)" }} />

          {/* The reviewing tool lives behind this panel rather than on the page: a family
              gathering a relative's story has no use for it, and nobody reaches here by
              accident. ?report=1 still works for sending a reviewer straight in. */}
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{t("Reporting issues")}</h3>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 10 }}>
              {t(
                "Turn this on to point at anything on the page and describe what is wrong with it. Reports stay in this browser until you export them."
              )}
            </p>
            <button
              type="button"
              className={reporting ? "btn-secondary" : "btn-primary"}
              style={{ display: "inline-flex", fontSize: 12.5, padding: "8px 14px" }}
              onClick={() => {
                const next = !reporting;
                setReporterEnabled(next);
                setReporting(next);
              }}
            >
              {reporting ? t("Turn off issue reporting") : t("Turn on issue reporting")}
            </button>
          </div>

          <div style={{ height: 1, background: "var(--line)" }} />

          <h3 style={{ fontSize: 15, marginBottom: -8 }}>{t("Release history")}</h3>

          {releases.map((release, i) => (
            <div key={release.version}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{release.title}</span>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    background: i === 0 ? "var(--accent-soft)" : "var(--bg-cream-2)",
                    color: i === 0 ? "var(--accent-deep)" : "var(--ink-soft)",
                    padding: "2px 8px",
                    borderRadius: 10,
                  }}
                >
                  v{release.version}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{release.date}</span>
              </div>
              <ul style={{ margin: 0, paddingInlineStart: 18, display: "flex", flexDirection: "column", gap: 5 }}>
                {release.changes.map((change) => (
                  <li key={change} style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)" }}>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
