import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CollectionPageShell } from "./CollectionPageShell";
import { useCollectionSession } from "./CollectionSessionContext";
import { GoogleDriveConnect } from "./GoogleDriveConnect";
import { importStory } from "./exportBundle";
import { UnpackDialog } from "./UnpackDialog";
import {
  forgetAllLocalStorage,
  localFsProvider,
  registerLocalFiles,
  restoreExternalFiles,
  tryResumeLocalDirectory,
} from "../../lib/storage/localFsProvider";
import { listDriveFolder, requestDriveAccessToken } from "../../lib/storage/driveApi";
import type { ProviderFile, StorageProvider } from "../../lib/storage/types";
import { useT } from "../../i18n";

const providers: { provider: StorageProvider; hint: string; icon: React.ReactNode }[] = [
  { provider: localFsProvider, hint: "Choose a folder from this device", icon: <DeviceIcon /> },
];

export function ConnectStep() {
  const navigate = useNavigate();
  const t = useT();
  const { connection, connectAndPersist, persistedStory, setConnection, setFiles } = useCollectionSession();
  const [forgetting, setForgetting] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [showUnpack, setShowUnpack] = useState(false);

  /**
   * Restoring a backup is how someone continues a story begun on another computer, so it
   * belongs here at the point they're choosing where the story lives — not only on a
   * catalog page they'd reach after already connecting something.
   */
  async function handleImportArchive(event: React.ChangeEvent<HTMLInputElement>) {
    const archive = event.target.files?.[0];
    event.target.value = "";
    if (!archive) return;

    setImporting(t("Reading…"));
    setImportResult(null);
    try {
      const outcome = await importStory(archive, (message) => setImporting(message));
      // Assembled from whole sentences with a {n} slot rather than concatenated words:
      // Hebrew puts the number and the noun in a different order from English.
      const count = (text: string, n: number) => t(text).replace("{n}", String(n));
      setImportResult(
        count(
          outcome.written === 1 ? "Restored {n} material into this folder" : "Restored {n} materials into this folder",
          outcome.written
        ) +
          (outcome.skipped > 0 ? count(", leaving {n} that were already here", outcome.skipped) : "") +
          (outcome.databaseRestored
            ? t(", along with the catalog.")
            : t(". This folder already had a catalog, so it was kept."))
      );
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t("Import failed"));
    } finally {
      setImporting(null);
    }
  }

  /**
   * Clears what the browser remembers so the next connect is genuinely fresh. Needed
   * because the stored handles, not the metadata file, are what bring old materials back.
   */
  async function handleForgetAll() {
    setForgetting(true);
    try {
      await forgetAllLocalStorage();
      setFiles([]);
      setConnection(null);
    } finally {
      setForgetting(false);
    }
  }
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDrive, setShowDrive] = useState(false);

  const resumable = !connection && persistedStory && persistedStory !== "loading" ? persistedStory : null;

  if (showDrive) {
    return (
      <CollectionPageShell step="storage">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span className="flicker" style={{ display: "inline-flex" }}>
            <FlameIcon />
          </span>
          <span
            style={{
              fontSize: 12.5,
              letterSpacing: ".09em",
              textTransform: "uppercase",
              color: "var(--accent-deep)",
              fontWeight: 700,
            }}
          >
            Google Drive
          </span>
        </div>
        <div style={{ maxWidth: 520 }}>
          <GoogleDriveConnect
            onSelected={(conn, files, folderId) => {
              connectAndPersist(conn, files, folderId);
              navigate("/collection/materials");
            }}
            onCancel={() => setShowDrive(false)}
          />
        </div>
      </CollectionPageShell>
    );
  }

  async function handleConnect(provider: StorageProvider) {
    setConnecting(provider.id);
    setError(null);
    try {
      const conn = await provider.connect();
      // Materials picked from other locations are part of this story too — bring them back
      // before listing, so the folder scan isn't the whole picture.
      if (provider.id === "local") await restoreExternalFiles();
      const list = await provider.listFiles(conn);
      connectAndPersist(conn, list);
      navigate("/collection/materials");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't connect. Try again."));
    } finally {
      setConnecting(null);
    }
  }

  function handleFallbackInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    registerLocalFiles(e.target.files);
    const conn = { providerId: "local" as const, label: t("{n} selected files").replace("{n}", String(e.target.files.length)) };
    localFsProvider.listFiles(conn).then((list) => {
      connectAndPersist(conn, list);
      navigate("/collection/materials");
    });
  }

  async function handleResumeLocal() {
    setConnecting("local");
    setError(null);
    try {
      const result = await tryResumeLocalDirectory();
      if (result === "resumed") await restoreExternalFiles();
      if (result === "resumed") {
        const conn = { providerId: "local" as const, label: resumable?.storageLabel ?? t("This device") };
        const list = await localFsProvider.listFiles(conn);
        connectAndPersist(conn, list);
        navigate("/collection/materials");
        return;
      }
      // Browser wouldn't grant silent access (or nothing was remembered) — fall back to the full picker.
      await handleConnect(localFsProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't reconnect. Try again."));
      setConnecting(null);
    }
  }

  async function handleResumeDrive(driveFolderId: string, label: string) {
    setConnecting("google-drive");
    setError(null);
    try {
      const token = await requestDriveAccessToken();
      const { items } = await listDriveFolder(token, driveFolderId);
      const files: ProviderFile[] = items
        .filter((item) => !item.isFolder)
        .map((item) => ({
          ref: { providerId: "google-drive", id: item.id },
          name: item.name,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
        }));
      connectAndPersist({ providerId: "google-drive", label }, files, driveFolderId);
      navigate("/collection/materials");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't reconnect to Google Drive."));
    } finally {
      setConnecting(null);
    }
  }

  return (
    <CollectionPageShell step="storage">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span className="flicker" style={{ display: "inline-flex" }}>
          <FlameIcon />
        </span>
        <span
          style={{
            fontSize: 12.5,
            letterSpacing: ".09em",
            textTransform: "uppercase",
            color: "var(--accent-deep)",
            fontWeight: 700,
          }}
        >
          {t("Collection Wizard")}
        </span>
      </div>

      <h1 style={{ fontSize: 30, lineHeight: 1.25, marginBottom: 10 }}>
        {t("Where do this story's materials live?")}
      </h1>
      <p style={{ fontSize: 15, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 32, maxWidth: 520 }}>
        {t("Connect a location once, and everything in it becomes available to tag, review, and carry into the presentation later.")}
      </p>

      {resumable && (
        <div
          className="option-card"
          data-selected="true"
          style={{ padding: "16px 18px", maxWidth: 460, marginBottom: 20 }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "var(--sage-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {connecting ? <span className="spinner" style={{ color: "var(--sage)" }} /> : <ResumeIcon />}
          </span>
          <span style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {t("Continue with")} {resumable.storageLabel}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              {resumable.storageProvider === "google-drive" ? "Google Drive" : t("This device")} · {t("where you left off")}
            </div>
          </span>
          {resumable.storageProvider === "google-drive" ? (
            <button
              type="button"
              className="btn-primary"
              disabled={connecting !== null}
              onClick={() => handleResumeDrive(resumable.driveFolderId!, resumable.storageLabel)}
            >
              {t("Resume")}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={connecting !== null}
              onClick={handleResumeLocal}
            >
              {t("Resume")}
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
        {providers.map(({ provider, hint, icon }) => (
          <button
            key={provider.id}
            type="button"
            className="option-card"
            data-selected={connection?.providerId === provider.id}
            disabled={connecting !== null}
            onClick={() => handleConnect(provider)}
            style={{ padding: "16px 18px" }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {connecting === provider.id ? <span className="spinner" style={{ color: "var(--accent-deep)" }} /> : icon}
            </span>
            <span>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t(provider.displayName)}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t(hint)}</div>
            </span>
          </button>
        ))}

        <button
          type="button"
          className="option-card"
          data-selected={connection?.providerId === "google-drive"}
          disabled={connecting !== null}
          onClick={() => setShowDrive(true)}
          style={{ padding: "16px 18px" }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "var(--sage-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <DriveIcon />
          </span>
          <span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Google Drive</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t("Pick a folder from a Google account")}</div>
          </span>
        </button>

        <label
          className="option-card"
          style={{ padding: "16px 18px", cursor: "pointer" }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              background: "var(--sage-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UploadIcon />
          </span>
          <span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{t("Choose files directly")}</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              {t("If your browser doesn't support folder picking")}
            </div>
          </span>
          {/* @ts-expect-error — webkitdirectory isn't in the standard JSX input types */}
          <input type="file" multiple webkitdirectory="" onChange={handleFallbackInput} style={{ display: "none" }} />
        </label>
      </div>

      {error && (
        <p style={{ fontSize: 13, color: "var(--accent-deep)", marginTop: 16 }}>{error}</p>
      )}

      {/* A story that already exists somewhere else arrives as an archive, not a folder. */}
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <h2 style={{ fontSize: 15, marginBottom: 4 }}>{t("Continuing a story from elsewhere")}</h2>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.55, maxWidth: 560 }}>
          {t("If you exported a story on another computer, connect the folder you want it to live in above, then restore the archive into it.")}
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label
            className="btn-secondary"
            style={{ display: "inline-flex", cursor: connection && !importing ? "pointer" : "default", opacity: connection ? 1 : 0.55 }}
          >
            {importing && <span className="spinner" />}
            {importing ?? t("Restore from an export")}
            <input
              type="file"
              accept=".zip"
              disabled={!connection || Boolean(importing)}
              onChange={(e) => void handleImportArchive(e)}
              style={{ display: "none" }}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowUnpack(true)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 12.5, fontWeight: 600, color: "var(--accent-deep)" }}
          >
            {t("The archive is very large")}
          </button>
        </div>

        {!connection && (
          <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8 }}>
            {t("Connect a folder first — that's where the story will be restored to.")}
          </p>
        )}
        {importResult && (
          <p style={{ fontSize: 12.5, color: "var(--sage)", marginTop: 10, lineHeight: 1.55 }}>{importResult}</p>
        )}
      </div>

      {showUnpack && <UnpackDialog onClose={() => setShowUnpack(false)} />}

      {/* Deleting the metadata file isn't enough to start over — the browser's stored
          handles are what reopen old materials. This is the only way to clear them
          without going into devtools. */}
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <button
          type="button"
          onClick={() => void handleForgetAll()}
          disabled={forgetting}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--accent-deep)",
          }}
        >
          {forgetting && <span className="spinner" />} {t("Forget remembered folders")}
        </button>
        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5, maxWidth: 520 }}>
          {t("Clears the folders and files this browser is holding on to, so the next connection starts clean. Nothing on your device is deleted — only what the Studio remembers.")}
        </p>
      </div>
    </CollectionPageShell>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3c1.2 2 3.5 4.4 3.5 7.8a3.5 3.5 0 1 1-7 0c0-1 .3-1.8.8-2.6.3.9 1 1.4 1.4 1.1-.4-1.8.2-3.6 1.3-6.3z"
        fill="var(--accent)"
      />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--sage)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M8.5 3h7l6 10.5-3.5 6h-12l-3.5-6z" fill="var(--sage)" opacity="0.25" />
      <path d="M8.5 3h7l6 10.5h-7z" fill="var(--sage)" />
      <path d="M5 13.5L8.5 3l6 10.5h-6z" fill="var(--sage)" opacity="0.6" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--sage)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M4 15v3.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}
