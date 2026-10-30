import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CollectionPageShell } from "./CollectionPageShell";
import { useCollectionSession } from "./CollectionSessionContext";
import { catalogStats, listRecordedMaterials } from "./metaStore";
import { exportStory, importStory } from "./exportBundle";
import { UnpackDialog } from "./UnpackDialog";
import type { LocalMaterialRecord } from "../../lib/storage/localMetaStore";
import type { CatalogFieldCoverage, CatalogStats } from "../../lib/storage/localMetaStore";

const FIELD_LABELS: Record<keyof CatalogFieldCoverage, string> = {
  tags: "Tags",
  notes: "Notes",
  location: "Location",
  connections: "Connections",
  aiSummary: "AI summary",
  aiTimeline: "AI timeline",
  aiStory: "AI story",
  faces: "Faces",
  aiTranscript: "AI transcript",
  aiChapters: "AI chapters",
  extractedText: "Extracted text",
  thumbnail: "Thumbnail",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 KB";
  const units = ["bytes", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function CatalogPage() {
  const { connection, files, persistedStory } = useCollectionSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showUnpack, setShowUnpack] = useState(false);
  const [stats, setStats] = useState<CatalogStats | null | "loading">("loading");
  const [records, setRecords] = useState<LocalMaterialRecord[]>([]);
  // The folder's File System Access permission isn't restored across page loads, so on a
  // fresh session `connection` is null even for a story that does have a local sidecar —
  // that's the resumable case ConnectStep already handles, not "no local database ever".
  const needsReconnect =
    !connection && persistedStory && persistedStory !== "loading" && persistedStory.storageProvider === "local";

  useEffect(() => {
    let cancelled = false;
    setStats("loading");
    catalogStats(connection)
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null));
    // Read from the catalog alone, never from the files: the whole point is that this
    // page works when the materials themselves aren't reachable.
    listRecordedMaterials(connection)
      .then((r) => !cancelled && setRecords(r))
      .catch(() => !cancelled && setRecords([]));
    return () => {
      cancelled = true;
    };
  }, [connection]);

  async function handleExport() {
    if (stats === "loading" || !stats) return;
    setBusy("Preparing…");
    setResult(null);
    setProblem(null);
    try {
      const { manifest, filename } = await exportStory({
        files,
        records,
        storyLabel: connection?.label ?? (persistedStory && persistedStory !== "loading" ? persistedStory.storageLabel : "story"),
        schemaVersion: stats.schemaVersion,
        revision: stats.latestUpdatedAt,
        onProgress: (message) => setBusy(message),
      });
      setResult(
        `Exported ${manifest.counts.included} of ${manifest.counts.materials} materials to ${filename}` +
          (manifest.counts.missing > 0
            ? `. ${manifest.counts.missing} could not be reached and are listed in the archive's manifest as missing.`
            : ", together with the catalog.")
      );
    } catch (err) {
      // A dismissed save dialog is a choice, not a failure.
      if ((err as Error)?.name === "AbortError") return;
      setProblem(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const archive = event.target.files?.[0];
    event.target.value = "";
    if (!archive) return;

    setBusy("Reading…");
    setResult(null);
    setProblem(null);
    try {
      const outcome = await importStory(archive, (message) => setBusy(message));
      setResult(
        `Restored ${outcome.written} ${outcome.written === 1 ? "material" : "materials"} from an export made on ` +
          `${outcome.manifest.exportedAt.slice(0, 10)}` +
          (outcome.skipped > 0 ? `. ${outcome.skipped} already existed and were left alone` : "") +
          (outcome.databaseRestored ? ". The catalog was restored too." : ". This folder already had a catalog, so it was kept.")
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <CollectionPageShell step="catalog">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 12.5,
            letterSpacing: ".09em",
            textTransform: "uppercase",
            color: "var(--accent-deep)",
            fontWeight: 700,
          }}
        >
          Catalog
        </span>
      </div>
      <h1 style={{ fontSize: 30, lineHeight: 1.25, marginBottom: 8 }}>Local database</h1>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 32, maxWidth: 560 }}>
        What's stored in this folder's own metadata file — sizes, coverage, and when it was last written.
        Administrative detail, not part of the story itself.
      </p>

      {stats === "loading" && (
        <Card title="Loading…">
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Reading the catalog file.</p>
        </Card>
      )}

      {stats !== "loading" && (!stats || !stats.available) && needsReconnect && (
        <Card title="Folder not connected this session">
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 14 }}>
            This story's catalog lives in <strong>{persistedStory.storageLabel}</strong>,
            but browsers don't keep folder permission across visits — reconnect it to read the file again.
          </p>
          <Link to="/collection/connect" className="btn-secondary" style={{ display: "inline-flex", fontSize: 12.5, padding: "8px 14px" }}>
            Reconnect folder
          </Link>
        </Card>
      )}

      {stats !== "loading" && (!stats || !stats.available) && !needsReconnect && (
        <Card title="No local database">
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            This story isn't backed by a folder on this device, so there's no sidecar file to report on.
            Connect a local folder from the Storage step to get one.
          </p>
        </Card>
      )}

      {stats !== "loading" && stats && stats.available && (
        <>
          <Card title="File" subtitle={stats.filename}>
            <StatRow label="Size on disk" value={formatBytes(stats.fileSizeBytes)} />
            <StatRow label="Schema version" value={stats.schemaVersion ?? "—"} />
            <StatRow label="Last updated" value={formatDate(stats.latestUpdatedAt)} />
            <StatRow label="First recorded" value={formatDate(stats.oldestUpdatedAt)} last />
          </Card>

          <Card title="Materials" subtitle="Rows recorded in the materials table.">
            <StatRow label="Total rows" value={String(stats.totalMaterials)} />
            <StatRow label="Active" value={String(stats.activeMaterials)} />
            <StatRow label="Removed (tombstoned)" value={String(stats.removedMaterials)} />
            <StatRow label="From the folder" value={String(stats.bySource.folder)} />
            <StatRow label="Added from elsewhere" value={String(stats.bySource.external)} last />
          </Card>

          <Card
            title="Backup and move"
            subtitle="One archive holding the materials and the catalog, for continuing on another computer."
          >
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="btn-primary" disabled={Boolean(busy)} onClick={() => void handleExport()}>
                {busy && <span className="spinner" />}
                {busy ?? "Export story"}
              </button>
              <label className="btn-secondary" style={{ display: "inline-flex", cursor: busy ? "default" : "pointer" }}>
                Import an export
                <input
                  type="file"
                  accept=".zip"
                  disabled={Boolean(busy)}
                  onChange={(e) => void handleImport(e)}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            {result && <p style={{ fontSize: 12.5, color: "var(--sage)", marginTop: 12, lineHeight: 1.55 }}>{result}</p>}
            {problem && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginTop: 12 }}>{problem}</p>}

            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 12, lineHeight: 1.55 }}>
              Each archive carries the date it was made, a list of every material in it, and which revision of the
              catalog it captured. Importing never overwrites a file that's already here.
            </p>
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.55 }}>
              Importing here reads the whole archive into memory, which a very large one won't fit into.{" "}
              <button
                type="button"
                onClick={() => setShowUnpack(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  font: "inherit",
                  fontWeight: 600,
                  color: "var(--accent-deep)",
                }}
              >
                Unpack it on your computer instead
              </button>
              .
            </p>
          </Card>

          <Card
            title="Resources"
            subtitle="Everything the catalog remembers, drawn from the catalog itself — no files are opened."
          >
            {records.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>Nothing recorded yet.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(132px, 1fr))",
                  gap: 14,
                }}
              >
                {records.map((record) => (
                  <ResourceTile key={record.key} record={record} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Content coverage" subtitle="How many active rows carry each kind of data.">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(Object.keys(FIELD_LABELS) as (keyof CatalogFieldCoverage)[]).map((key) => (
                <CoverageBar
                  key={key}
                  label={FIELD_LABELS[key]}
                  count={stats.fieldCoverage[key]}
                  total={stats.totalMaterials}
                />
              ))}
            </div>
          </Card>
        </>
      )}
      {showUnpack && <UnpackDialog onClose={() => setShowUnpack(false)} />}
    </CollectionPageShell>
  );
}

/**
 * One resource as the catalog knows it.
 *
 * Deliberately rendered from the stored thumbnail rather than the file, so a catalog opened
 * on a machine that has no access to the originals — or after they've moved — still shows
 * what each resource is rather than a page of identical grey squares.
 */
function ResourceTile({ record }: { record: LocalMaterialRecord }) {
  const has = [
    record.meta.aiSummary && "summary",
    record.meta.aiTranscript && "transcript",
    record.meta.aiChapters && "chapters",
    record.meta.extractedText && "text",
    record.meta.faces?.length && "faces",
    record.meta.tags?.length && "tags",
  ].filter(Boolean) as string[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--bg-cream-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {record.thumbnail ? (
          <img src={record.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 11, color: "var(--ink-soft)", textAlign: "center", padding: 8 }}>
            No preview
          </span>
        )}
      </div>

      <span
        title={record.name}
        style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {record.name.split("/").pop()}
      </span>

      {has.length > 0 && (
        <span style={{ fontSize: 10.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>{has.join(" · ")}</span>
      )}
    </div>
  );
}

function StatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "9px 0",
        borderBottom: last ? "none" : "1px solid var(--line)",
      }}
    >
      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CoverageBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: "var(--ink-soft)" }}>{label}</span>
        <span style={{ color: "var(--ink-soft)" }}>
          {count} / {total}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg-cream-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent-deep)", borderRadius: 3 }} />
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 22, background: "var(--card)", marginBottom: 20 }}
    >
      <h2 style={{ fontSize: 16, marginBottom: subtitle ? 4 : 14 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>{subtitle}</p>}
      {children}
    </div>
  );
}
