import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useT } from "../../i18n";
import {
  addReport,
  clearReports,
  disableReporter,
  excerptFor,
  labelFor,
  loadReports,
  removeReport,
  REPORTER_EVENT,
  reporterEnabled,
  selectorFor,
  stripReportFlag,
  type IssueKind,
  type IssueReport,
} from "./reportStore";
import { downloadFile, KIND_LABELS, reportsAsJson, reportsAsMarkdown, timestampedName } from "./issueExport";

/**
 * "Point at the thing that's wrong and say what's wrong with it."
 *
 * Three states: off, picking (hover outlines, click selects), and writing (a form about
 * the selected element). A counter sits bottom-left and opens the list of what has been
 * staged so far, which exports as JSON for whoever fixes it and as a Markdown list for
 * whoever has to read it.
 *
 * It reports and nothing else — see reportStore.ts for why that limit is deliberate here.
 */

const KINDS: IssueKind[] = ["visual", "wording", "broken", "confusing", "missing", "other"];

/** Our own furniture, so pointing at the reporter can't file a report about the reporter. */
const OWN_UI = ".issue-fab, .issue-panel, .issue-bar, .issue-form";

export function IssueReporter() {
  const t = useT();
  const location = useLocation();
  const [mode, setMode] = useState<"off" | "picking">("off");
  const [target, setTarget] = useState<Element | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reports, setReports] = useState<IssueReport[]>(loadReports);
  // Read once, at mount: the flag is sticky, and re-reading per render would fight the
  // history.replaceState below.
  const [enabled, setEnabled] = useState(reporterEnabled);
  const hovered = useRef<Element | null>(null);

  useEffect(() => {
    if (enabled) stripReportFlag();
  }, [enabled]);

  // Switched from the version panel, which lives elsewhere in the tree.
  useEffect(() => {
    function onChanged(e: Event) {
      setEnabled(Boolean((e as CustomEvent<boolean>).detail));
    }
    window.addEventListener(REPORTER_EVENT, onChanged);
    return () => window.removeEventListener(REPORTER_EVENT, onChanged);
  }, []);

  const clearHover = useCallback(() => {
    hovered.current?.classList.remove("issue-hover");
    hovered.current = null;
  }, []);

  const stopPicking = useCallback(() => {
    setMode("off");
    clearHover();
    document.body.classList.remove("issue-picking");
  }, [clearHover]);

  // Listeners live on the document in the capture phase: a click anywhere has to be
  // intercepted before the app's own handler navigates away from the thing being reported.
  useEffect(() => {
    if (mode !== "picking") return;

    function onOver(e: MouseEvent) {
      const el = e.target as Element | null;
      if (!el || el.nodeType !== 1 || el.closest(OWN_UI)) return;
      if (hovered.current === el) return;
      clearHover();
      el.classList.add("issue-hover");
      hovered.current = el;
    }

    function onClick(e: MouseEvent) {
      const el = e.target as Element | null;
      if (!el || el.nodeType !== 1 || el.closest(OWN_UI)) return;
      e.preventDefault();
      e.stopPropagation();
      clearHover();
      setTarget(el);
      stopPicking();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") stopPicking();
    }

    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.body.classList.add("issue-picking");
    return () => {
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("issue-picking");
      clearHover();
    };
  }, [mode, clearHover, stopPicking]);

  if (!enabled) return null;

  function handleSubmit(kind: IssueKind, note: string) {
    if (!target) return;
    const report: IssueReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      kind,
      note,
      selector: selectorFor(target),
      elementLabel: labelFor(target),
      excerpt: excerptFor(target),
      page: location.pathname || "/",
      locale: document.documentElement.lang || "en",
      version: __APP_VERSION__,
      build: String(__BUILD_NUMBER__),
      viewport: `${window.innerWidth}×${window.innerHeight}`,
    };
    setReports(addReport(report));
    setTarget(null);
  }

  return (
    <>
      {createPortal(
        <>
          {mode === "picking" && (
            <div className="issue-bar" role="status">
              <span>{t("Click the part of the page you want to report")}</span>
              <button type="button" onClick={stopPicking}>
                {t("Cancel")}
              </button>
            </div>
          )}

          <div className="issue-fab">
            <button
              type="button"
              className="issue-fab-main"
              onClick={() => (mode === "picking" ? stopPicking() : setMode("picking"))}
              aria-pressed={mode === "picking"}
            >
              <FlagIcon />
              <span>{mode === "picking" ? t("Cancel") : t("Report an issue")}</span>
            </button>
            {reports.length > 0 && (
              <button
                type="button"
                className="issue-fab-count"
                onClick={() => setPanelOpen(true)}
                aria-label={t("Review reported issues")}
              >
                {reports.length}
              </button>
            )}
          </div>

          {target && (
            <ReportForm
              target={target}
              onCancel={() => setTarget(null)}
              onSubmit={handleSubmit}
            />
          )}

          {panelOpen && (
            <ReportPanel
              reports={reports}
              onClose={() => setPanelOpen(false)}
              onRemove={(id) => setReports(removeReport(id))}
              onClearAll={() => {
                clearReports();
                setReports([]);
                setPanelOpen(false);
              }}
              onTurnOff={() => {
                disableReporter();
                setPanelOpen(false);
                setEnabled(false);
              }}
            />
          )}
        </>,
        document.body
      )}
    </>
  );
}

function ReportForm({
  target,
  onCancel,
  onSubmit,
}: {
  target: Element;
  onCancel: () => void;
  onSubmit: (kind: IssueKind, note: string) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<IssueKind>("visual");
  const [note, setNote] = useState("");
  const excerpt = excerptFor(target);

  // The element stays outlined while the form is open, so there is no doubt which one
  // the note is about.
  useEffect(() => {
    target.classList.add("issue-selected");
    return () => target.classList.remove("issue-selected");
  }, [target]);

  return (
    <div className="issue-form" role="dialog" aria-modal="true">
      <div className="issue-form-card">
        <h2>{t("What's wrong here?")}</h2>
        <p className="issue-form-target">
          <code>{labelFor(target)}</code>
          {excerpt && <span>“{excerpt.length > 90 ? `${excerpt.slice(0, 90)}…` : excerpt}”</span>}
        </p>

        <div className="issue-kinds">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={k === kind ? "is-on" : ""}
              onClick={() => setKind(k)}
            >
              {t(KIND_LABELS[k])}
            </button>
          ))}
        </div>

        <textarea
          autoFocus
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("Describe what you see and what you expected instead.")}
        />

        <div className="issue-form-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!note.trim()}
            onClick={() => onSubmit(kind, note.trim())}
          >
            {t("Add to the list")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportPanel({
  reports,
  onClose,
  onRemove,
  onClearAll,
  onTurnOff,
}: {
  reports: IssueReport[];
  onClose: () => void;
  onRemove: (id: string) => void;
  onClearAll: () => void;
  onTurnOff: () => void;
}) {
  const t = useT();
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyList() {
    try {
      await navigator.clipboard.writeText(reportsAsMarkdown(reports, summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context and permission; the download always works.
      downloadFile(timestampedName("md"), reportsAsMarkdown(reports, summary), "text/markdown");
    }
  }

  return (
    <div className="issue-panel" role="dialog" aria-modal="true">
      <div className="issue-panel-card">
        <div className="issue-panel-head">
          <h2>
            {t("Reported issues")} ({reports.length})
          </h2>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("Close")}
          </button>
        </div>

        <p className="issue-panel-note">
          {t("These stay in this browser until you export them. Nothing is sent anywhere.")}
        </p>

        <ol className="issue-list">
          {reports.map((r) => (
            <li key={r.id}>
              <div className="issue-list-head">
                <span className="issue-badge">{t(KIND_LABELS[r.kind] ?? r.kind)}</span>
                <code>{r.page}</code>
                <button type="button" onClick={() => onRemove(r.id)} aria-label={t("Remove")}>
                  ×
                </button>
              </div>
              <p className="issue-list-note">{r.note}</p>
              <p className="issue-list-where">
                <code>{r.elementLabel}</code>
                {r.excerpt && <> — “{r.excerpt.length > 70 ? `${r.excerpt.slice(0, 70)}…` : r.excerpt}”</>}
              </p>
            </li>
          ))}
        </ol>

        <label className="issue-panel-label">
          {t("A line about this round of review (optional)")}
          <input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <div className="issue-panel-actions">
          <button type="button" className="btn-primary" onClick={() => void copyList()}>
            {copied ? t("Copied") : t("Copy the list")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => downloadFile(timestampedName("json"), reportsAsJson(reports, summary), "application/json")}
          >
            {t("Download as a file")}
          </button>
          <button type="button" className="issue-panel-clear" onClick={onClearAll}>
            {t("Clear the list")}
          </button>
        </div>

        <p className="issue-panel-off">
          {t("Reporting is switched on for this browser only.")}{" "}
          <button type="button" onClick={onTurnOff}>
            {t("Switch it off")}
          </button>
        </p>
      </div>
    </div>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4.5" />
      <path d="M5 5.5h11l-2 3.5 2 3.5H5" />
    </svg>
  );
}
