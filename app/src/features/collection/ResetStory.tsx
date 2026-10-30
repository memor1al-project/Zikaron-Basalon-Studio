import { useEffect, useState } from "react";
import { discardResetBackup, getResetBackup, resetStory, undoReset } from "./interviewService";
import { storySections } from "./storySections";
import { useT } from "../../i18n";

/**
 * Clearing the whole guided interview, and taking it back.
 *
 * Two-step, like removing a material, because it discards every answer, moment and attached
 * resource across all four parts at once. And reversible, because "I meant to clear one
 * section" is exactly the mistake this invites, and the thing destroyed is a family's own
 * account of someone's life.
 *
 * The undo is offered until it's explicitly dismissed rather than for a few seconds: the
 * person who needs it may not notice what happened until they open another part of the
 * story, or come back tomorrow.
 */
export function ResetStory({ uid, onChanged }: { uid: string; onChanged: () => void }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"resetting" | "undoing" | null>(null);
  const [backupAt, setBackupAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // An undo from an earlier visit is still good, so the banner has to survive a reload.
    getResetBackup(uid)
      .then((backup) => setBackupAt(backup?.at ?? null))
      .catch(() => {});
  }, [uid]);

  async function handleReset() {
    setBusy("resetting");
    setError(null);
    try {
      const backup = await resetStory(uid);
      setBackupAt(backup.at);
      setConfirming(false);
      onChanged();
    } catch {
      setError(t("Couldn't reset the story. Nothing was cleared."));
    } finally {
      setBusy(null);
    }
  }

  async function handleUndo() {
    setBusy("undoing");
    setError(null);
    try {
      await undoReset(uid);
      setBackupAt(null);
      onChanged();
    } catch {
      setError(t("Couldn't restore the story. Your copy is still saved — try again."));
    } finally {
      setBusy(null);
    }
  }

  async function handleDiscard() {
    try {
      await discardResetBackup(uid);
      setBackupAt(null);
    } catch {
      setError(t("Couldn't discard the saved copy."));
    }
  }

  if (backupAt !== null) {
    return (
      <div
        style={{
          border: "1px solid var(--accent)",
          background: "var(--accent-soft)",
          borderRadius: 12,
          padding: "14px 16px",
          marginTop: 28,
        }}
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
          <strong>{t("The story was cleared {when}.").replace("{when}", relativeTime(backupAt, t))}</strong>{" "}
          {t("Every answer, moment and attached resource is still saved and can be put back.")}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void handleUndo()}>
            {busy === "undoing" && <span className="spinner" />}
            {busy === "undoing" ? t("Putting it back...") : t("Undo the reset")}
          </button>
          <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void handleDiscard()}>
            {t("Keep it cleared")}
          </button>
        </div>
        {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 28 }}>
      {confirming ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            {t("Clear")}{" "}
            <strong>{t("all {n} parts").replace("{n}", String(storySections.length))}</strong>{" "}
            {t("of the story — every answer, every moment, and every attached resource? Your materials, tags and family tree are untouched, and this can be undone afterwards.")}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void handleReset()}>
              {busy === "resetting" && <span className="spinner" />}
              {busy === "resetting" ? t("Clearing...") : t("Yes, clear the story")}
            </button>
            <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => setConfirming(false)}>
              {t("Cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setConfirming(true)}
          style={{ color: "var(--accent-deep)" }}
        >
          {t("Reset the whole story")}
        </button>
      )}
      {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginTop: 10 }}>{error}</p>}
    </div>
  );
}

/** "just now" / "12 minutes ago" / "yesterday" — enough to place it, no more. */
function relativeTime(at: number, t: (text: string) => string): string {
  const ago = (text: string, n: number) => t(text).replace("{n}", String(n));
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return t("just now");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return ago(minutes === 1 ? "{n} minute ago" : "{n} minutes ago", minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ago(hours === 1 ? "{n} hour ago" : "{n} hours ago", hours);
  const days = Math.round(hours / 24);
  return days === 1 ? t("yesterday") : ago("{n} days ago", days);
}
