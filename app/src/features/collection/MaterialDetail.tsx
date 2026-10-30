import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import { LocationField, type LocationValue } from "./LocationField";
import {
  metaKeyFor,
  type MaterialAiStory,
  type MaterialAiSummary,
  type MaterialAiTimelineEntry,
  type MaterialAiChapters,
  type MaterialAiTranscript,
  type MaterialExtractedText,
  type MaterialConnection,
  type MaterialFace,
  type MaterialMeta,
} from "./materialsMetaService";
import {
  buildMaterialTimeline,
  composeMaterialStory,
  segmentTestimony,
  summarizeMaterialText,
  type TestimonyCue,
} from "./materialsAiService";
import { FileTestimony } from "../testimony/TestimonyPlayers";
import { formatTime } from "../testimony/players";
import { extractFacesFromImage, faceDistance, SAME_PERSON_THRESHOLD } from "./faceExtractionService";
import { canExtractText, extractDocumentText, pageOffsetsFromText } from "./documentTextService";
import { ActionButton } from "./ActionButton";
import { SourceTextViewer } from "./SourceTextViewer";
import { useSourceMarkers } from "./useSourceMarkers";
import { describeStoryFill, detailsFromSummary, fillStoryFromText } from "./materialAutofill";
import {
  formatDuration,
  MAX_TRANSCRIBE_SECONDS,
  readMediaDuration as readMediaDurationFromUrl,
  transcribeMaterial,
} from "./transcriptionService";
import { useAiAvailability, type AiAvailability } from "../../lib/aiAvailability";
import { useAiComingSoon } from "./AiComingSoon";
import { displayNameForId, isExternalId } from "../../lib/storage/localFsProvider";
import type { ProviderFile, StorageConnection } from "../../lib/storage/types";
import { getMeta } from "./metaStore";
import { useT } from "../../i18n";

const TEXT_PREVIEW_LIMIT = 4000;
const TEXT_AI_LIMIT = 50_000;

interface MaterialDetailProps {
  file: ProviderFile;
  meta: MaterialMeta;
  /** Every other material in this story, for the "link to another resource" search. */
  linkableFiles: ProviderFile[];
  /** Distinct location values already used elsewhere in this story, for autocomplete. */
  knownLocations: string[];
  /** Name of the connected folder, for showing where the file sits. Null for Drive. */
  folderLabel?: string | null;
  /** Every material's metadata, so a selected face can be looked for across the story. */
  allMetas?: Record<string, MaterialMeta>;
  /** Opens another material — used when jumping to a photo the same person appears in. */
  onOpenMaterial?: (file: ProviderFile) => void;
  /** Signed-in user, for writing drafted answers into the guided interview. */
  uid: string;
  /** Which store this story's metadata lives in — the panel reads its own from there. */
  connection: StorageConnection | null;
  /** Page to open the text viewer on, when arriving from a story attribution chip. */
  initialPage?: number;
  onSave: (meta: MaterialMeta) => Promise<void>;
  /** Takes the material out of the story. The file on disk is left alone. */
  onRemove: () => Promise<void>;
  onClose: () => void;
}

export function MaterialDetail({
  file,
  meta,
  linkableFiles,
  knownLocations,
  folderLabel,
  uid,
  connection,
  initialPage,
  allMetas,
  onOpenMaterial,
  onSave,
  onRemove,
  onClose,
}: MaterialDetailProps) {
  const [tags, setTags] = useState(meta.tags);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState(meta.notes);
  const [location, setLocation] = useState<LocationValue>({ name: meta.location ?? "", coords: meta.locationCoords });
  const [connections, setConnections] = useState<MaterialConnection[]>(meta.connections ?? []);
  const [aiSummary, setAiSummary] = useState<MaterialAiSummary | undefined>(meta.aiSummary);
  const [aiTimeline, setAiTimeline] = useState<MaterialAiTimelineEntry[] | undefined>(meta.aiTimeline);
  const [aiStory, setAiStory] = useState<MaterialAiStory | undefined>(meta.aiStory);
  const [faces, setFaces] = useState<MaterialFace[]>(meta.faces ?? []);
  const [aiTranscript, setAiTranscript] = useState<MaterialAiTranscript | undefined>(meta.aiTranscript);
  const [aiChapters, setAiChapters] = useState<MaterialAiChapters | undefined>(meta.aiChapters);
  /** Timestamps from the last transcription run. Deliberately not persisted — see MaterialAiChapters. */
  const [cues, setCues] = useState<TestimonyCue[] | undefined>(undefined);
  const [extractedText, setExtractedText] = useState<MaterialExtractedText | undefined>(meta.extractedText);
  const [navigatorUrl, setNavigatorUrl] = useState<string | null>(null);
  const [fullText, setFullText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** A refused save must say why — the panel stays open so nothing typed is lost. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  /**
   * The store is the source of truth for this material.
   *
   * The `meta` prop is only a head start from whatever the opener had to hand; a panel
   * opened from a story attribution link mounts before the page's own metadata has
   * loaded, and every field here is copied into state at mount, so without this the
   * material would show as empty with no way to recover.
   *
   * Once only, keyed by the material — the panel remounts when the material changes.
   */
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    let cancelled = false;
    getMeta(connection, uid, metaKeyFor(file.ref))
      .then((stored) => {
        if (cancelled || !stored) return;
        hydrated.current = true;
        setTags(stored.tags);
        setNotes(stored.notes);
        setLocation({ name: stored.location ?? "", coords: stored.locationCoords });
        setConnections(stored.connections ?? []);
        setAiSummary(stored.aiSummary);
        setAiTimeline(stored.aiTimeline);
        setAiStory(stored.aiStory);
        setFaces(stored.faces ?? []);
        setAiTranscript(stored.aiTranscript);
        setAiChapters(stored.aiChapters);
        setExtractedText(stored.extractedText);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connection, uid, file]);

  // Face extraction runs on-device, so it is deliberately NOT gated on this.
  const aiAvailability = useAiAvailability();
  const t = useT();

  /**
   * Writes suggested details into the open panel rather than straight to storage — they
   * land in the same fields a person edits by hand, so they can be corrected or undone
   * before Save, like anything else typed here.
   */
  function applyDetails(next: { tags: string[]; notes: string; location: LocationValue }) {
    setTags(next.tags);
    setNotes(next.notes);
    setLocation(next.location);
  }

  const isText = file.mimeType.startsWith("text/");
  // PDFs had no AI actions at all before: they aren't text/*, so nothing offered to read them.
  const isDocument = canExtractText(file);
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isMedia = isVideo || file.mimeType.startsWith("audio/");

  useEffect(() => {
    if (!isText) return;
    let cancelled = false;
    getObjectUrlFor(file)
      .then((url) => fetch(url))
      .then((res) => res.text())
      .then((text) => !cancelled && setFullText(text.slice(0, TEXT_AI_LIMIT)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file, isText]);

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagInput("");
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({
        tags,
        notes,
        location: location.name || undefined,
        locationCoords: location.coords,
        connections,
        aiSummary,
        aiTimeline,
        aiStory,
        faces,
        aiTranscript,
        aiChapters,
        extractedText,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save this material.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await onRemove();
      onClose();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "oklch(20% 0.02 50 / 0.45)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-enter"
        style={{
          // Wide enough for the whole metadata form — preview, AI results, tags, location,
          // connections and notes — rather than a 480px column that wraps every field.
          width: "min(760px, 100%)",
          height: "100%",
          background: "var(--bg-cream)",
          borderLeft: "1px solid var(--line)",
          // Deliberately NOT a flex container. This element is the scroller, and its
          // children are ordinary blocks, so nothing can be shrunk to fit the viewport —
          // the panel is always exactly as tall as its contents and simply scrolls.
          // (As a flex column it compressed its children instead, cutting off the form.)
          overflowY: "auto",
          overscrollBehavior: "contain",
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
            // Rides along the top of the scroller so Close stays reachable at any depth.
            position: "sticky",
            top: 0,
            background: "var(--bg-cream)",
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.name}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            style={{ padding: "6px 12px", fontSize: 12.5, flexShrink: 0 }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          <PreviewArea file={file} fullText={fullText} />

          <FileLocation file={file} folderLabel={folderLabel ?? null} />

          {isDocument && (
            <DocumentAiActions
              availability={aiAvailability}
              file={file}
              uid={uid}
              extractedText={extractedText}
              initialPage={initialPage}
              aiSummary={aiSummary}
              onExtracted={setExtractedText}
              onSummaryResult={setAiSummary}
              details={{ tags, notes, location }}
              onDetails={applyDetails}
            />
          )}

          {isText && (
            <TextAiActions
              availability={aiAvailability}
              uid={uid}
              sourceName={file.name}
        sourceKey={metaKeyFor(file.ref)}
              text={fullText}
              aiSummary={aiSummary}
              aiTimeline={aiTimeline}
              aiStory={aiStory}
              onSummaryResult={setAiSummary}
              onTimelineResult={setAiTimeline}
              onStoryResult={setAiStory}
              details={{ tags, notes, location }}
              onDetails={applyDetails}
            />
          )}

          {isImage && (
            <ImageAiActions
              file={file}
              faces={faces}
              onFacesResult={setFaces}
              linkableFiles={linkableFiles}
              allMetas={allMetas}
              onOpenMaterial={onOpenMaterial}
            />
          )}

          {isMedia && (
            <MediaAiActions
              availability={aiAvailability}
              file={file}
              uid={uid}
              isVideo={isVideo}
              aiTranscript={aiTranscript}
              aiSummary={aiSummary}
              aiChapters={aiChapters}
              cues={cues}
              details={{ tags, notes, location }}
              onDetails={applyDetails}
              onTranscriptResult={(result) => {
                setAiTranscript({ transcript: result.transcript, language: result.language });
                setCues(result.cues);
              }}
              onSummaryResult={setAiSummary}
              onChaptersResult={setAiChapters}
              onOpenNavigator={() => getObjectUrlFor(file).then(setNavigatorUrl)}
            />
          )}

          <div>
            <FieldLabel>Tags</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 }}>
              {tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    background: "var(--accent-soft)",
                    color: "var(--accent-deep)",
                    padding: "4px 10px",
                    borderRadius: 12,
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    style={{ background: "none", border: "none", padding: 0, color: "inherit", fontSize: 13, lineHeight: 1 }}
                    aria-label={`Remove tag ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Add a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <FieldLabel htmlFor="material-location">Location</FieldLabel>
            <div style={{ marginTop: 8 }}>
              <LocationField id="material-location" value={location} onChange={setLocation} knownLocations={knownLocations} />
            </div>
          </div>

          <ConnectionsEditor connections={connections} onChange={setConnections} linkableFiles={linkableFiles} />

          <div>
            <FieldLabel htmlFor="material-notes">Notes &amp; context</FieldLabel>
            {/* From the organisation's own kits: an object is usually the easiest way into
                a story, and these are the questions they suggest asking of one. */}
            <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 4, lineHeight: 1.5 }}>
              {t(
                "When was it written? Where was it taken? Who is in it? An object is often the easiest way into a story."
              )}
            </p>
            <textarea
              id="material-notes"
              rows={6}
              placeholder="Who or what is this? Anything worth remembering about it."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: "100%",
                marginTop: 8,
                fontFamily: "inherit",
                fontSize: 14,
                padding: "10px 12px",
                border: "1px solid var(--line)",
                borderRadius: 8,
                background: "var(--card)",
                color: "var(--ink)",
                resize: "vertical",
              }}
            />
          </div>

          <button type="button" className="btn-primary" disabled={saving || removing} onClick={handleSave}>
            {saving && <span className="spinner" />}
            {saving ? "Saving..." : "Save"}
          </button>

          {saveError && (
            <p
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--ink)",
                background: "var(--accent-soft)",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              {saveError}
            </p>
          )}

          {/* Separated from Save, and two-step, because it discards tags and notes. */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            {confirmingRemove ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 13, color: "var(--ink)" }}>
                  Remove <strong>{file.name}</strong> from this story? Its tags and notes are discarded. The file
                  itself stays where it is — nothing is deleted from your device.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={removing}
                    onClick={handleRemove}
                    style={{ borderColor: "var(--accent-deep)", color: "var(--accent-deep)" }}
                  >
                    {removing && <span className="spinner" />} Yes, remove it
                  </button>
                  <button type="button" className="btn-secondary" disabled={removing} onClick={() => setConfirmingRemove(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                disabled={saving}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--accent-deep)",
                }}
              >
                Remove from story
              </button>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Sits above the detail drawer: the navigator is the whole screen's job, not a panel's. */}
    {navigatorUrl && aiChapters && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--bg-cream)",
          zIndex: 60,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <FileTestimony
            src={navigatorUrl}
            title={file.name}
            chapters={aiChapters}
            onClose={() => setNavigatorUrl(null)}
          />
        </div>
      </div>
    )}
    </>
  );
}

function ConnectionsEditor({
  connections,
  onChange,
  linkableFiles,
}: {
  connections: MaterialConnection[];
  onChange: (c: MaterialConnection[]) => void;
  linkableFiles: ProviderFile[];
}) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<ProviderFile | null>(null);
  const [label, setLabel] = useState("");

  const matches = useMemo(() => {
    if (!search.trim() || target) return [];
    const q = search.trim().toLowerCase();
    return linkableFiles.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6);
  }, [search, target, linkableFiles]);

  function addConnection() {
    if (!target || !label.trim()) return;
    onChange([...connections, { targetKey: metaKeyFor(target.ref), targetName: target.name, label: label.trim() }]);
    setTarget(null);
    setSearch("");
    setLabel("");
  }

  return (
    <div>
      <FieldLabel>Connections to other resources</FieldLabel>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, marginBottom: 10 }}>
        Link this to another photo, letter, or recording — and say how it's related (father, friend, same day, etc).
      </p>

      {connections.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {connections.map((c, i) => (
            <div
              key={`${c.targetKey}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                background: "var(--sage-soft)",
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--sage)" }}>{c.label}</span>
              <span style={{ color: "var(--ink-soft)" }}>→ {c.targetName}</span>
              <button
                type="button"
                onClick={() => onChange(connections.filter((_, idx) => idx !== i))}
                style={{ marginLeft: "auto", background: "none", border: "none", padding: 0, color: "var(--ink-soft)", fontSize: 14, lineHeight: 1 }}
                aria-label="Remove connection"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {target ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12.5,
              background: "var(--accent-soft)",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <ResultThumb file={target} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Linking to: <strong>{target.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => setTarget(null)}
              style={{ background: "none", border: "none", padding: 0, color: "var(--accent-deep)", fontSize: 14, lineHeight: 1 }}
              aria-label="Change target"
            >
              ×
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="How is it related? e.g. father, friend, same trip"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addConnection())}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary" onClick={addConnection} disabled={!label.trim()}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <input
            type="text"
            placeholder="Search materials by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
          {matches.length > 0 && (
            <div style={DropdownStyle}>
              {matches.map((f) => (
                <button
                  key={`${f.ref.providerId}-${f.ref.id}`}
                  type="button"
                  onClick={() => {
                    setTarget(f);
                    setSearch("");
                  }}
                  style={{ ...DropdownRowStyle, display: "flex", alignItems: "center", gap: 10 }}
                >
                  <ResultThumb file={f} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small 28px thumbnail for an autocomplete row — real image preview, or a type icon otherwise. */
function ResultThumb({ file }: { file: ProviderFile }) {
  const isImage = file.mimeType.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    getObjectUrlFor(file)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isImage, file]);

  return (
    <span
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
        background: isImage ? "var(--sage-soft)" : "var(--bg-cream-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <TypeIcon mimeType={file.mimeType} />
      )}
    </span>
  );
}

function TypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/"))
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--sage)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="14" rx="1.5" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M4 16l5-4.5 3.5 3 3-2.5L21 16" />
      </svg>
    );
  if (mimeType.startsWith("audio/"))
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ink-soft)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 12v0M7 9v6M10 6v12M13 9v6M16 6v12M19 12v0" />
      </svg>
    );
  if (mimeType.startsWith("video/"))
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="14" rx="2" />
        <path d="M17 9.5l4-2.5v10l-4-2.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ink-soft)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M14 3.5V7h4" />
    </svg>
  );
}

const DropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "var(--card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  boxShadow: "0 8px 20px -8px oklch(30% 0.03 50 / 0.4)",
  zIndex: 1,
  maxHeight: 240,
  overflowY: "auto",
};

const DropdownRowStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 13,
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--line)",
};

function PreviewArea({ file, fullText }: { file: ProviderFile; fullText: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isText = file.mimeType.startsWith("text/");
  const textContent = fullText?.slice(0, TEXT_PREVIEW_LIMIT) ?? null;

  useEffect(() => {
    let cancelled = false;
    getObjectUrlFor(file)
      .then((objectUrl) => !cancelled && setUrl(objectUrl))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Couldn't load preview"));
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (error) {
    return <p style={{ fontSize: 13, color: "var(--accent-deep)" }}>{error}</p>;
  }

  if (!url) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <span className="spinner" style={{ color: "var(--accent-deep)" }} />
      </div>
    );
  }

  if (file.mimeType.startsWith("image/")) {
    return (
      <img
        src={url}
        alt=""
        style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 10, background: "var(--card)" }}
      />
    );
  }

  if (file.mimeType.startsWith("audio/")) {
    return <audio controls src={url} style={{ width: "100%" }} />;
  }

  if (file.mimeType.startsWith("video/")) {
    return <video controls src={url} style={{ width: "100%", borderRadius: 10, maxHeight: 320 }} />;
  }

  if (isText) {
    return (
      <pre
        style={{
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: 12.5,
          lineHeight: 1.6,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 16,
          maxHeight: 320,
          overflow: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {textContent ?? "Loading..."}
        {textContent && textContent.length === TEXT_PREVIEW_LIMIT ? "\n\n(truncated)" : ""}
      </pre>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ display: "inline-flex" }}>
      Open {file.name}
    </a>
  );
}

type TextAiKind = "summarize" | "timeline" | "story";

function TextAiActions({
  availability,
  uid,
  sourceName,
  sourceKey,
  text,
  aiSummary,
  aiTimeline,
  aiStory,
  onSummaryResult,
  onTimelineResult,
  onStoryResult,
  details,
  onDetails,
}: {
  availability: AiAvailability;
  uid: string;
  sourceName: string;
  sourceKey: string;
  text: string | null;
  aiSummary?: MaterialAiSummary;
  aiTimeline?: MaterialAiTimelineEntry[];
  aiStory?: MaterialAiStory;
  onSummaryResult: (result: MaterialAiSummary) => void;
  onTimelineResult: (result: MaterialAiTimelineEntry[]) => void;
  onStoryResult: (result: MaterialAiStory) => void;
  details: DetailState;
  onDetails: (next: DetailState) => void;
}) {
  const markers = useSourceMarkers({ uid, sourceKey, text: text ?? undefined });
  const [loading, setLoading] = useState<TextAiKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiOff = availability !== "available";
  // Clickable even when the service is absent — the dialog explains rather than the button
  // being mute. "checking" still blocks, since that resolves in a moment.
  const comingSoon = useAiComingSoon(availability === "available");

  async function run(kind: TextAiKind) {
    if (!text) return;
    setLoading(kind);
    setError(null);
    try {
      if (kind === "summarize") onSummaryResult(await summarizeMaterialText(text));
      if (kind === "timeline") onTimelineResult((await buildMaterialTimeline(text)).timeline);
      if (kind === "story") onStoryResult(await composeMaterialStory(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div>
      <FieldLabel>AI actions</FieldLabel>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, marginBottom: 10 }}>
        Uses AI to help review this material. Only run this on test/sample materials for now.
      </p>
      {availability === "unavailable" && <AiUnavailableNotice />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <ActionButton busy={loading === "summarize"} disabled={!text || loading !== null || availability === "checking"} onClick={comingSoon.guard(() => run("summarize"))}>
          Summarize
        </ActionButton>
        <ActionButton busy={loading === "timeline"} disabled={!text || loading !== null || availability === "checking"} onClick={comingSoon.guard(() => run("timeline"))}>
          Build timeline
        </ActionButton>
        <ActionButton busy={loading === "story"} disabled={!text || loading !== null || availability === "checking"} onClick={comingSoon.guard(() => run("story"))}>
          Create a story
        </ActionButton>
      </div>

      <AutofillActions
        disabled={aiOff || loading !== null}
        setError={setError}
        uid={uid}
        sourceName={sourceName}
        sourceKey={sourceKey}
        summary={aiSummary}
        storyText={text ?? undefined}
        details={details}
        onDetails={onDetails}
      />

      {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginBottom: 12 }}>{error}</p>}

      {/* Only once the story has drawn from this file: before that it would just repeat
          the preview higher up the panel. */}
      {text && markers.length > 0 && (
        <ResultPanel title="Where the story drew from this">
          <SourceTextViewer text={text} markers={markers} />
        </ResultPanel>
      )}

      {comingSoon.dialog}

      {aiSummary && <SummaryResult summary={aiSummary} />}

      {aiTimeline && (
        <ResultPanel title="Timeline">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aiTimeline.map((entry, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                  {entry.date} — {entry.title}
                </div>
                <div style={{ color: "var(--ink-soft)" }}>{entry.story}</div>
              </div>
            ))}
          </div>
        </ResultPanel>
      )}

      {aiStory && (
        <ResultPanel title="Story">
          <p style={{ whiteSpace: "pre-wrap" }}>{aiStory.story}</p>
        </ResultPanel>
      )}
    </div>
  );
}

function ImageAiActions({
  file,
  faces,
  onFacesResult,
  linkableFiles,
  allMetas,
  onOpenMaterial,
}: {
  file: ProviderFile;
  faces: MaterialFace[];
  onFacesResult: (faces: MaterialFace[]) => void;
  linkableFiles: ProviderFile[];
  allMetas?: Record<string, MaterialMeta>;
  onOpenMaterial?: (file: ProviderFile) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFace, setSelectedFace] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getObjectUrlFor(file)
      .then((url) => !cancelled && setImageUrl(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file]);

  /** Other materials whose stored faces are close enough to the selected one. */
  const matches = useMemo(() => {
    const descriptor = selectedFace === null ? null : faces[selectedFace]?.descriptor;
    if (!descriptor || !allMetas) return [];

    const found: { file: ProviderFile; face: MaterialFace; distance: number }[] = [];
    for (const other of linkableFiles) {
      const otherMeta = allMetas[metaKeyFor(other.ref)];
      let best: { face: MaterialFace; distance: number } | null = null;
      for (const otherFace of otherMeta?.faces ?? []) {
        if (!otherFace.descriptor) continue;
        const distance = faceDistance(descriptor, otherFace.descriptor);
        if (distance < SAME_PERSON_THRESHOLD && (!best || distance < best.distance)) {
          best = { face: otherFace, distance };
        }
      }
      if (best) found.push({ file: other, face: best.face, distance: best.distance });
    }
    return found.sort((a, b) => a.distance - b.distance);
  }, [selectedFace, faces, allMetas, linkableFiles]);

  async function handleExtract() {
    setLoading(true);
    setError(null);
    try {
      const url = await getObjectUrlFor(file);
      const img = await loadImageElement(url);
      const detected = await extractFacesFromImage(img);
      if (detected.length === 0) {
        setError("No faces found in this image.");
        return;
      }
      // Keep the box and the descriptor, not just the picture: the box is what draws the
      // outline over the photograph, and the descriptor is what makes "the same person
      // elsewhere" answerable. Dropping them here meant extraction silently disabled both.
      onFacesResult(detected.map((f) => ({ dataUrl: f.dataUrl, box: f.box, descriptor: f.descriptor })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Face extraction failed");
    } finally {
      setLoading(false);
    }
  }

  function updateLabel(index: number, label: string) {
    onFacesResult(faces.map((f, i) => (i === index ? { ...f, label } : f)));
  }

  return (
    <div>
      <FieldLabel>AI actions</FieldLabel>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, marginBottom: 10 }}>
        Detects faces in this photo, entirely on your device. Only run this on test/sample materials for now.
      </p>
      <ActionButton busy={loading} onClick={handleExtract} style={{ marginBottom: 12 }}>
        Extract faces
      </ActionButton>

      {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginBottom: 12 }}>{error}</p>}

      {/* The photo with every detected face drawn on it — a face is easier to recognise in
          its own picture than as a disembodied circle in a list. */}
      {faces.length > 0 && imageUrl && faces.some((f) => f.box) && (
        <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", marginBottom: 12 }}>
          <img src={imageUrl} alt="" style={{ display: "block", width: "100%", borderRadius: 10 }} />
          {faces.map((face, i) =>
            face.box ? (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedFace(selectedFace === i ? null : i)}
                title={face.label || `Face ${i + 1}`}
                aria-pressed={selectedFace === i}
                style={{
                  position: "absolute",
                  left: `${face.box.x * 100}%`,
                  top: `${face.box.y * 100}%`,
                  width: `${face.box.width * 100}%`,
                  height: `${face.box.height * 100}%`,
                  border: `2.5px solid ${selectedFace === i ? "var(--accent-deep)" : "oklch(98% 0.01 50 / 0.85)"}`,
                  borderRadius: 6,
                  background: selectedFace === i ? "oklch(60% 0.13 45 / 0.18)" : "transparent",
                  padding: 0,
                  cursor: "pointer",
                  boxShadow: "0 0 0 1px oklch(20% 0.02 50 / 0.35)",
                }}
              >
                {face.label && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: "-1.45em",
                      fontSize: 10.5,
                      fontWeight: 600,
                      background: "oklch(20% 0.02 50 / 0.78)",
                      color: "white",
                      padding: "1px 6px",
                      borderRadius: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {face.label}
                  </span>
                )}
              </button>
            ) : null
          )}
        </div>
      )}

      {faces.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 12 }}>
          {faces.map((face, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setSelectedFace(selectedFace === i ? null : i)}
                title="Show where else this person appears"
                style={{
                  padding: 0,
                  border: `2.5px solid ${selectedFace === i ? "var(--accent-deep)" : "transparent"}`,
                  borderRadius: "50%",
                  background: "none",
                  lineHeight: 0,
                }}
              >
                <img src={face.dataUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
              </button>
              <input
                type="text"
                placeholder="Name"
                value={face.label ?? ""}
                onChange={(e) => updateLabel(i, e.target.value)}
                style={{ width: "100%", fontSize: 11.5, padding: "4px 6px" }}
              />
            </div>
          ))}
        </div>
      )}

      {selectedFace !== null && (
        <div style={{ marginTop: 14 }}>
          <FieldLabel>
            {faces[selectedFace]?.label
              ? `Where else ${faces[selectedFace].label} appears`
              : "Where else this person appears"}
          </FieldLabel>

          {!faces[selectedFace]?.descriptor ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
              This face was found by an older version that didn't record a face signature. Run "Extract faces"
              again to enable matching.
            </p>
          ) : matches.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
              No other material has a matching face yet. Faces are only compared where they've been extracted,
              so run "Extract faces" on other photos first.
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))", gap: 12, marginTop: 8 }}>
              {matches.map(({ file: matchFile, face, distance }) => (
                <button
                  key={metaKeyFor(matchFile.ref)}
                  type="button"
                  onClick={() => onOpenMaterial?.(matchFile)}
                  className="option-card"
                  style={{ flexDirection: "column", alignItems: "center", gap: 6, padding: 10, textAlign: "center" }}
                >
                  <img src={face.dataUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {matchFile.name}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                    {/* Lower distance = more alike. Shown as a likeness, never as an identification. */}
                    {Math.round((1 - distance / SAME_PERSON_THRESHOLD) * 100)}% alike
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MediaAiActions({
  availability,
  file,
  uid,
  isVideo,
  aiTranscript,
  aiSummary,
  aiChapters,
  cues,
  onTranscriptResult,
  onSummaryResult,
  onChaptersResult,
  onOpenNavigator,
  details,
  onDetails,
}: {
  availability: AiAvailability;
  file: ProviderFile;
  uid: string;
  isVideo: boolean;
  aiTranscript?: MaterialAiTranscript;
  aiSummary?: MaterialAiSummary;
  aiChapters?: MaterialAiChapters;
  cues?: TestimonyCue[];
  onTranscriptResult: (result: MaterialAiTranscript & { cues?: TestimonyCue[] }) => void;
  onSummaryResult: (result: MaterialAiSummary) => void;
  onChaptersResult: (result: MaterialAiChapters) => void;
  onOpenNavigator: () => void;
  details: DetailState;
  onDetails: (next: DetailState) => void;
}) {
  const markers = useSourceMarkers({
    uid,
    sourceKey: metaKeyFor(file.ref),
    text: aiTranscript?.transcript,
  });
  const [transcribing, setTranscribing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [chaptering, setChaptering] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** null while unread, or when the file's metadata won't give one up. */
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);

  // Read up front so the cap is visible before anyone waits on audio extraction, rather
  // than surfacing as an error minutes later. The transcription pipeline enforces it
  // again regardless — this is the courtesy, not the guard.
  useEffect(() => {
    let cancelled = false;
    readMediaDuration(file, isVideo)
      .then((seconds) => !cancelled && setDurationSeconds(seconds))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file, isVideo]);

  const tooLong = durationSeconds !== null && durationSeconds > MAX_TRANSCRIBE_SECONDS;

  // "checking" counts as busy: the probe resolves in a moment, and a button that works
  // only sometimes is worse than one that's briefly unavailable.
  const busy = transcribing || summarizing || chaptering || availability === "checking";
  const comingSoon = useAiComingSoon(availability === "available");

  async function handleTranscribe() {
    setTranscribing(true);
    setError(null);
    try {
      // Timestamps cost extra output tokens but are what makes chapter boundaries land
      // on the right moment rather than an estimate.
      onTranscriptResult(await transcribeMaterial(file, setProgress, { withTimestamps: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
      setProgress(null);
    }
  }

  async function handleSummarize() {
    if (!aiTranscript) return;
    setSummarizing(true);
    setError(null);
    try {
      onSummaryResult(await summarizeMaterialText(aiTranscript.transcript));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed");
    } finally {
      setSummarizing(false);
    }
  }

  async function handleFindChapters() {
    if (!aiTranscript) return;
    setChaptering(true);
    setError(null);
    setProgress("Reading the recording's length...");
    try {
      const durationSeconds = await readMediaDuration(file, isVideo);
      setProgress("Finding chapters...");
      onChaptersResult(
        await segmentTestimony({
          transcript: aiTranscript.transcript,
          cues,
          durationSeconds,
          language: aiTranscript.language,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finding chapters failed");
    } finally {
      setChaptering(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <FieldLabel>AI actions</FieldLabel>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, marginBottom: 10 }}>
        Uses AI to help review this material. Only run this on test/sample materials for now.
      </p>
      {availability === "unavailable" && <AiUnavailableNotice />}
      {tooLong && (
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--ink)",
            background: "var(--accent-soft)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          This recording runs {formatDuration(durationSeconds!)}. Transcription is capped at{" "}
          {MAX_TRANSCRIBE_SECONDS / 60} minutes to keep costs predictable — trim it or split it into
          parts. Everything else on this material still works.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <ActionButton
          busy={transcribing}
          disabled={busy || tooLong}
          onClick={handleTranscribe}
          title={tooLong ? `Longer than ${MAX_TRANSCRIBE_SECONDS / 60} minutes` : undefined}
        >
          Voice to text
        </ActionButton>
        <ActionButton
          busy={summarizing}
          disabled={!aiTranscript || busy}
          onClick={comingSoon.guard(handleSummarize)}
          title={aiTranscript ? undefined : 'Run "Voice to text" first'}
        >
          Summarize
        </ActionButton>
        {isVideo && (
          <ActionButton
            busy={chaptering}
            disabled={!aiTranscript || busy}
            onClick={comingSoon.guard(handleFindChapters)}
            title={aiTranscript ? undefined : 'Run "Voice to text" first'}
          >
            Find chapters
          </ActionButton>
        )}
      </div>

      {/* Both read from the transcript, so they stay disabled until "Voice to text" has run
          — the same gate as Summarize, expressed in their own tooltips. */}
      <AutofillActions
        disabled={busy}
        setError={setError}
        uid={uid}
        sourceName={file.name}
        sourceKey={metaKeyFor(file.ref)}
        summary={aiSummary}
        storyText={aiTranscript?.transcript}
        details={details}
        onDetails={onDetails}
      />

      {progress && <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 12 }}>{progress}</p>}
      {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginBottom: 12 }}>{error}</p>}

      {comingSoon.dialog}

      {isVideo && aiChapters && (
        <ResultPanel title={`Chapters (${aiChapters.segments.length})`}>
          <ol style={{ margin: "0 0 10px", paddingInlineStart: 18 }}>
            {aiChapters.segments.map((segment) => (
              <li key={segment.id} style={{ marginBottom: 3 }}>
                {formatTime(segment.startTime)} — {segment.title}
              </li>
            ))}
          </ol>
          <button type="button" className="btn-primary" style={{ fontSize: 13, padding: "9px 16px" }} onClick={onOpenNavigator}>
            Open testimony navigator
          </button>
        </ResultPanel>
      )}

      {aiSummary && <SummaryResult summary={aiSummary} />}

      {aiTranscript && (
        <ResultPanel title={`Transcript (${aiTranscript.language})`}>
          <SourceTextViewer
            text={aiTranscript.transcript}
            markers={markers}
            emptyNote={'Run "Fill the story from this" to mark the passages the story is drawn from.'}
          />
        </ResultPanel>
      )}
    </div>
  );
}

/**
 * Chapter times are meaningless without the recording's real length, and only the file
 * knows it. The reader itself lives in transcriptionService, which enforces the length
 * cap with it — two copies would eventually disagree about what counts as too long.
 */
function readMediaDuration(file: ProviderFile, isVideo: boolean): Promise<number> {
  return getObjectUrlFor(file).then((url) => readMediaDurationFromUrl(url, isVideo));
}

/**
 * Shown in place of the AI buttons when the backend isn't deployed. It says which features
 * are gone and which still work, so the panel reads as a deployment fact rather than a bug.
 */
function AiUnavailableNotice() {
  return (
    <p
      style={{
        fontSize: 12,
        color: "var(--ink-soft)",
        background: "var(--bg-cream-2)",
        borderRadius: 8,
        padding: "9px 11px",
        marginBottom: 12,
        lineHeight: 1.5,
      }}
    >
      The AI service isn't running on this deployment, so anything that needs it — summarizing, building a
      timeline, writing a story, transcribing, finding chapters, filling the guided interview — is unavailable.
      Everything that runs on your device still works: reading a PDF's text, extracting faces, tags, notes,
      locations and links.
    </p>
  );
}

/**
 * Reading a document, and turning it into a story draft.
 *
 * Extraction runs in the browser, so it works with or without the AI backend. Summarising
 * and drafting need the API, and are disabled with an explanation when it isn't there.
 */
interface DetailState {
  tags: string[];
  notes: string;
  location: LocationValue;
}

/**
 * The two "use what the AI found" actions, shared by documents and recordings.
 *
 * Identical in both because the question is the same either way — this material produced
 * some text, what should be done with it — and a family shouldn't have to learn two
 * different panels depending on whether their grandmother was written down or recorded.
 */
function AutofillActions({
  disabled,
  setError,
  uid,
  sourceName,
  sourceKey,
  /** Null until the material has been summarized. */
  summary,
  /** Null until there's text to draft from — a transcript, or a document's pages. */
  storyText,
  details,
  onDetails,
}: {
  /** External gate — the AI backend being down, or the panel busy with something else. */
  disabled: boolean;
  setError: (message: string | null) => void;
  uid: string;
  sourceName: string;
  /** metaKeyFor() of this material — what gets attached to a section's resources. */
  sourceKey: string;
  summary?: MaterialAiSummary;
  storyText?: string;
  details: DetailState;
  onDetails: (next: DetailState) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  /** Only a story fill is worth offering a trip to the interview. */
  const [noteLinksToStory, setNoteLinksToStory] = useState(false);
  // Owned here rather than borrowed from the parent: the two panels track their own work
  // differently (one a message, one a set of booleans), and this needs neither.
  const [filling, setFilling] = useState(false);

  function handleAutofillDetails() {
    setNoteLinksToStory(false);
    if (!summary) return;
    const next = detailsFromSummary(summary, details);
    setNote(
      next.changed.length === 0
        ? "Nothing to add — tags, note and place are already filled in."
        : `Added ${next.changed.join(", ")}. Nothing you'd written was changed. Save to keep them.`
    );
    onDetails({ tags: next.tags, notes: next.notes, location: next.location });
  }

  async function handleFillStory() {
    if (!storyText) return;
    setFilling(true);
    setError(null);
    setNote(null);
    try {
      const result = await fillStoryFromText({ uid, text: storyText, sourceName, sourceKey });
      setNote(describeStoryFill(result, sourceName));
      setNoteLinksToStory(result.filled > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Filling the story failed");
    } finally {
      setFilling(false);
    }
  }

  const blocked = disabled || filling;

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <ActionButton
          disabled={blocked || !summary}
          onClick={handleAutofillDetails}
          title={summary ? undefined : "Summarize this first"}
        >
          Auto-fill details
        </ActionButton>
        <ActionButton
          busy={filling}
          disabled={blocked || !storyText}
          onClick={() => void handleFillStory()}
          title={storyText ? undefined : "Needs text from this material first"}
        >
          Fill the story from this
        </ActionButton>
      </div>
      {note && (
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--ink)",
            background: "var(--sage-soft)",
            borderRadius: 8,
            padding: "9px 11px",
            marginBottom: 10,
          }}
        >
          {note}
          {noteLinksToStory && (
            <>
              {" "}
              <Link to="/collection/story" style={{ fontWeight: 600 }}>
                Open the guided interview →
              </Link>
            </>
          )}
        </p>
      )}
    </>
  );
}

function DocumentAiActions({
  availability,
  file,
  uid,
  extractedText,
  initialPage,
  aiSummary,
  onExtracted,
  onSummaryResult,
  details,
  onDetails,
}: {
  availability: AiAvailability;
  file: ProviderFile;
  uid: string;
  extractedText?: MaterialExtractedText;
  initialPage?: number;
  aiSummary?: MaterialAiSummary;
  onExtracted: (result: MaterialExtractedText) => void;
  onSummaryResult: (result: MaterialAiSummary) => void;
  details: DetailState;
  onDetails: (next: DetailState) => void;
}) {
    const comingSoon = useAiComingSoon(availability === "available");
  // Extractions from before offsets were recorded still have recoverable page boundaries.
  const pageOffsets = useMemo(
    () => extractedText?.pageOffsets ?? (extractedText ? pageOffsetsFromText(extractedText.text) : undefined),
    [extractedText]
  );
  const markers = useSourceMarkers({
    uid,
    sourceKey: metaKeyFor(file.ref),
    text: extractedText?.text,
    pageOffsets,
  });
  const [busy, setBusy] = useState<string | null>(null);
  /** Which button is working — `busy` alone made the spinner appear on whichever button
      happened to be first, so summarizing spun the "Read again" button instead. */
  const [busyAction, setBusyAction] = useState<"extract" | "summarize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aiOff = availability !== "available";

  async function handleExtract() {
    setBusyAction("extract");
    setBusy("Reading...");
    setError(null);
    try {
      const result = await extractDocumentText(file, (message) => setBusy(message));
      if (!result.text) {
        setError(
          "No text found. This looks like a scanned image of a document rather than a text PDF — " +
            "it would need OCR, which isn't available yet."
        );
        return;
      }
      onExtracted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read this document");
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  async function handleSummarize() {
    if (!extractedText?.text) return;
    setBusyAction("summarize");
    setBusy("Summarizing...");
    setError(null);
    try {
      onSummaryResult(await summarizeMaterialText(extractedText.text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarize failed");
    } finally {
      setBusy(null);
      setBusyAction(null);
    }
  }

  return (
    <div>
      <FieldLabel>Document actions</FieldLabel>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4, marginBottom: 10 }}>
        Reads the text out of this document, then uses it. Reading happens on your device; summarizing and
        drafting use the AI service.
      </p>

      {availability === "unavailable" && <AiUnavailableNotice />}

      {/* The quiet failure worth catching: a part-typed, part-handwritten document extracts
          cleanly and looks like a success, while most of it never reaches the AI at all.
          Everything downstream — the summary, the story fill — only ever saw these pages. */}
      {extractedText?.totalPages !== undefined && extractedText.pageCount < extractedText.totalPages && (
        <p
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--ink)",
            background: "var(--accent-soft)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 10,
          }}
        >
          Only <strong>{extractedText.pageCount} of {extractedText.totalPages} pages</strong> had readable text. The
          rest are images — scans or handwriting — so nothing on them reached the summary or the story. They would
          need OCR, which isn't available yet.
        </p>
      )}

      {comingSoon.dialog}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <ActionButton busy={busyAction === "extract"} disabled={Boolean(busy)} onClick={handleExtract}>
          {extractedText ? "Read again" : "Extract text"}
        </ActionButton>
        <ActionButton
          busy={busyAction === "summarize"}
          disabled={!extractedText || Boolean(busy) || availability === "checking"}
          onClick={comingSoon.guard(handleSummarize)}
          title={disabledReason(aiOff, Boolean(extractedText)) ?? undefined}
        >
          Summarize
        </ActionButton>
      </div>

      <AutofillActions
        disabled={aiOff || Boolean(busy)}
        setError={setError}
        uid={uid}
        sourceName={file.name}
        sourceKey={metaKeyFor(file.ref)}
        summary={aiSummary}
        storyText={extractedText?.text}
        details={details}
        onDetails={onDetails}
      />

      {busy && <p style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>{busy}</p>}
      {error && <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginBottom: 10 }}>{error}</p>}

      {aiSummary && <SummaryResult summary={aiSummary} />}

      {extractedText && (
        <ResultPanel title={`Text (${extractedText.pageCount} ${extractedText.pageCount === 1 ? "page" : "pages"})`}>
          <SourceTextViewer
            text={extractedText.text}
            pageOffsets={pageOffsets}
            markers={markers}
            initialPage={initialPage}
            emptyNote={'Run "Fill the story from this" to mark the passages the story is drawn from.'}
          />
        </ResultPanel>
      )}
    </div>
  );
}

/** Why a button can't be pressed — the AI service, or a missing first step. */
function disabledReason(aiOff: boolean, hasText: boolean): string | null {
  if (aiOff) return "The AI service isn't running on this deployment";
  if (!hasText) return "Extract the text first";
  return null;
}

function SummaryResult({ summary }: { summary: MaterialAiSummary }) {
  return (
    <ResultPanel title="Summary">
      <p style={{ marginBottom: 8 }}>{summary.summary}</p>
      {summary.keywords.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {summary.keywords.map((kw) => (
            <span
              key={kw}
              style={{ fontSize: 10.5, background: "var(--accent-soft)", color: "var(--accent-deep)", padding: "3px 8px", borderRadius: 10 }}
            >
              {kw}
            </span>
          ))}
        </div>
      )}
    </ResultPanel>
  );
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load image"));
    img.src = src;
  });
}

function ResultPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        background: "var(--sage-soft)",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--sage)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

/**
 * Where this material sits on disk.
 *
 * Browsers never hand a web page an absolute path, so the best that can honestly be shown
 * is the folder you connected plus the file's path inside it — which is enough to find it
 * in Finder. Materials picked from elsewhere have no path at all: the browser gives a
 * handle, not a location.
 */
function FileLocation({ file, folderLabel }: { file: ProviderFile; folderLabel: string | null }) {
  const [copied, setCopied] = useState(false);
  if (file.ref.providerId !== "local") return null;

  const external = isExternalId(file.ref.id);
  const path = external
    ? displayNameForId(file.ref.id)
    : folderLabel
      ? `${folderLabel}/${file.ref.id}`
      : file.ref.id;

  async function copy() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — the path is on screen to read either way.
    }
  }

  return (
    <div>
      <FieldLabel>Where this file is</FieldLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            background: "var(--bg-cream-2)",
            borderRadius: 8,
            padding: "8px 10px",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {path}
        </code>
        <button type="button" className="btn-secondary" onClick={() => void copy()} style={{ padding: "7px 13px", fontSize: 12.5 }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6, lineHeight: 1.5 }}>
        {external
          ? "Added from another folder on this device. Browsers don't reveal the full path — use \"Copy into folder\" to keep it with the story."
          : "Relative to the folder you connected. Browsers never give a web page the full path."}
      </p>
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", display: "block" }}>
      {children}
    </label>
  );
}
