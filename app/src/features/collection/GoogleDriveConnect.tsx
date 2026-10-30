import { useState } from "react";
import { downloadDriveFile, listDriveFolder, requestDriveAccessToken, type DriveItem } from "../../lib/storage/driveApi";
import type { ProviderFile, StorageConnection } from "../../lib/storage/types";

interface Crumb {
  id: string;
  name: string;
}

interface GoogleDriveConnectProps {
  onSelected: (connection: StorageConnection, files: ProviderFile[], folderId: string) => void;
  onCancel: () => void;
}

export function GoogleDriveConnect({ onSelected, onCancel }: GoogleDriveConnectProps) {
  const [token, setToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trail, setTrail] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const [items, setItems] = useState<DriveItem[]>([]);

  const currentFolder = trail[trail.length - 1];

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const accessToken = await requestDriveAccessToken();
      setToken(accessToken);
      await openFolder(accessToken, [{ id: "root", name: "My Drive" }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect to Google Drive.");
    } finally {
      setConnecting(false);
    }
  }

  async function openFolder(accessToken: string, newTrail: Crumb[]) {
    setLoadingFolder(true);
    setError(null);
    try {
      const folderId = newTrail[newTrail.length - 1].id;
      const { items: children } = await listDriveFolder(accessToken, folderId);
      setItems(children);
      setTrail(newTrail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that folder.");
    } finally {
      setLoadingFolder(false);
    }
  }

  function handleUseFolder() {
    const fileItems = items.filter((item) => !item.isFolder);
    const providerFiles: ProviderFile[] = fileItems.map((item) => ({
      ref: { providerId: "google-drive", id: item.id },
      name: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    }));
    onSelected({ providerId: "google-drive", label: currentFolder.name }, providerFiles, currentFolder.id);
  }

  if (!token) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="option-card" data-selected="true" style={{ padding: "16px 18px" }}>
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
            {connecting ? <span className="spinner" style={{ color: "var(--sage)" }} /> : <DriveIcon />}
          </span>
          <span>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Google Drive</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              Read-only access to a folder you choose. Nothing is copied unless you import it later.
            </div>
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn-primary" disabled={connecting} onClick={handleConnect}>
            {connecting && <span className="spinner" />}
            {connecting ? "Connecting..." : "Connect Google Drive"}
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>

        {error && <p style={{ fontSize: 13, color: "var(--accent-deep)" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 14, fontSize: 13 }}>
        {trail.map((crumb, i) => (
          <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              onClick={() => openFolder(token, trail.slice(0, i + 1))}
              disabled={i === trail.length - 1}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 13,
                fontWeight: i === trail.length - 1 ? 700 : 500,
                color: i === trail.length - 1 ? "var(--ink)" : "var(--accent-deep)",
                cursor: i === trail.length - 1 ? "default" : "pointer",
              }}
            >
              {crumb.name}
            </button>
            {i < trail.length - 1 && <span style={{ color: "var(--ink-soft)" }}>/</span>}
          </span>
        ))}
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 12,
          maxHeight: 280,
          overflowY: "auto",
          background: "var(--bg-cream)",
        }}
      >
        {loadingFolder ? (
          <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
            <span className="spinner" style={{ color: "var(--accent-deep)" }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>Empty folder</div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!item.isFolder}
              onClick={() => item.isFolder && openFolder(token, [...trail, { id: item.id, name: item.name }])}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--line)",
                fontSize: 13.5,
                textAlign: "left",
                cursor: item.isFolder ? "pointer" : "default",
                color: "var(--ink)",
              }}
            >
              {item.isFolder ? <FolderIcon /> : <FileIcon />}
              {item.name}
            </button>
          ))
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-primary" onClick={handleUseFolder}>
          Use this folder
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && <p style={{ fontSize: 13, color: "var(--accent-deep)", marginTop: 10 }}>{error}</p>}
    </div>
  );
}

// Re-exported so ConnectStep/MaterialsStep can fetch actual file bytes later
// (e.g. when a user opens or imports a specific material).
export { downloadDriveFile };

function DriveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
      <path d="M8.5 3h7l6 10.5-3.5 6h-12l-3.5-6z" fill="var(--sage)" opacity="0.25" />
      <path d="M8.5 3h7l6 10.5h-7z" fill="var(--sage)" />
      <path d="M5 13.5L8.5 3l6 10.5h-6z" fill="var(--sage)" opacity="0.6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--accent-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H9l2 2h7.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M14 3.5V7h4" />
    </svg>
  );
}
