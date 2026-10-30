import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CollectionPageShell } from "./CollectionPageShell";
import { useCollectionSession } from "./CollectionSessionContext";
import { useAuthedUser } from "../../app/guards";
import { ResourcePicker } from "./ResourcePicker";
import { LocationField, type LocationValue } from "./LocationField";
import { sectionBySlug, storySections } from "./storySections";
import { listMetas } from "./metaStore";
import { SourceChip, SourceLegend } from "./SourceChip";
import { ResetStory } from "./ResetStory";
import { sourceColor, sourceTint } from "./sourceColors";
import { EventPeoplePicker } from "./EventPeoplePicker";
import { namedFacesFrom, type NamedFace } from "../familytree/facePeople";
import { getSection, saveSection, type StoryEvent, type StorySectionData } from "./interviewService";
import { useT } from "../../i18n";

export function StorySectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useT();
  const config = sectionBySlug(slug);
  const user = useAuthedUser();
  const { connection, files } = useCollectionSession();
  const [data, setData] = useState<StorySectionData | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [knownLocations, setKnownLocations] = useState<string[]>([]);
  const [faces, setFaces] = useState<NamedFace[]>([]);

  /** Bumped by a reset or an undo, to re-read the section it just rewrote. */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!config) return;
    setData(null);
    getSection(user.uid, config.key).then(setData);
  }, [user.uid, config?.key, reloadToken]);

  useEffect(() => {
    // listMetas, not listMaterialMetas: a folder on this device keeps its metadata in a
    // sidecar beside the files, and reading Firestore directly meant neither the places
    // nor the tagged faces from a local folder ever reached this page.
    listMetas(connection, user.uid)
      .then((metas) => {
        const locs = Object.values(metas).map((m) => m.location).filter((l): l is string => Boolean(l));
        setKnownLocations(Array.from(new Set(locs)));
        setFaces(namedFacesFrom(metas));
      })
      .catch(() => {});
  }, [connection, user.uid]);

  if (!config) return <Navigate to="/collection/story/scene" replace />;
  if (!data) return null;

  // Both answers and moments can be drafted, and the legend is the key to either.
  const sectionSources = [
    ...new Set(
      [
        ...config.fields.map((f) => data.answerSources?.[f.key]),
        ...data.events.map((event) => event.source),
      ].filter((value): value is string => Boolean(value))
    ),
  ];

  const sectionIndex = storySections.findIndex((s) => s.key === config.key);
  const prevSection = storySections[sectionIndex - 1];
  const nextSection = storySections[sectionIndex + 1];

  function setAnswer(fieldKey: string, value: string) {
    setData((d) => (d ? { ...d, answers: { ...d.answers, [fieldKey]: value } } : d));
  }

  /** "These are my words now" — drops the label without touching what's written. */
  function clearAnswerSource(fieldKey: string) {
    setData((d) => {
      if (!d) return d;
      const answerSources = { ...(d.answerSources ?? {}) };
      delete answerSources[fieldKey];
      return { ...d, answerSources };
    });
  }

  function setEvents(events: StoryEvent[]) {
    setData((d) => (d ? { ...d, events } : d));
  }

  function addEvent() {
    const event: StoryEvent = { id: crypto.randomUUID(), title: "", when: "", description: "", resourceKeys: [] };
    setEvents([...(data?.events ?? []), event]);
  }

  function updateEvent(id: string, patch: Partial<StoryEvent>) {
    setEvents((data?.events ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEvent(id: string) {
    setEvents((data?.events ?? []).filter((e) => e.id !== id));
  }

  async function handleSave() {
    if (!data || !config) return;
    setSaving(true);
    try {
      await saveSection(user.uid, config.key, data);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  return (
    <CollectionPageShell step="interview">
      <SectionTabs current={config.key} />

      <h1 style={{ fontSize: 28, lineHeight: 1.25, marginBottom: 8, marginTop: 20 }}>{t(config.title)}</h1>
      <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 28, maxWidth: 560 }}>
        {t(config.intro)}
      </p>

      <Card title={t("Questions")}>
        <SourceLegend sources={sectionSources} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {config.fields.map((field) => {
            const source = data.answerSources?.[field.key];
            return (
              <div key={field.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <label style={{ fontSize: 13, fontWeight: 600 }}>{t(field.label)}</label>
                  {source && (
                    <SourceChip
                      sourceName={source}
                      sourceKey={data.answerSourceKeys?.[field.key]}
                      page={data.answerPages?.[field.key]}
                      onClear={() => clearAnswerSource(field.key)}
                    />
                  )}
                </div>
                <textarea
                  rows={2}
                  placeholder={field.placeholder ? t(field.placeholder) : undefined}
                  value={data.answers[field.key] ?? ""}
                  onChange={(e) => setAnswer(field.key, e.target.value)}
                  style={
                    source
                      ? // Tinted to the source's own colour, so a glance down the page shows
                        // which answers are drafted without reading a single chip.
                        { ...TextAreaStyle, background: sourceTint(source) }
                      : TextAreaStyle
                  }
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={t("Resources for this part of the story")}
        subtitle={t("Photos, letters, or recordings that belong to this section as a whole.")}
      >
        <ResourcePicker
          selectedKeys={data.resourceKeys}
          allFiles={files}
          onChange={(keys) => setData((d) => (d ? { ...d, resourceKeys: keys } : d))}
        />
      </Card>

      <Card
        title={t("Events in this part of the story")}
        subtitle={t("Break it into specific moments, and attach whatever material belongs to each one.")}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              allFiles={files}
              knownLocations={knownLocations}
              faces={faces}
              onChange={(patch) => updateEvent(event.id, patch)}
              onRemove={() => removeEvent(event.id)}
            />
          ))}
          <button type="button" className="btn-secondary" onClick={addEvent} style={{ alignSelf: "flex-start" }}>
            + {t("Add an event")}
          </button>
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button type="button" className="btn-primary" disabled={saving} onClick={handleSave}>
            {saving && <span className="spinner" />}
            {saving ? t("Saving...") : t("Save")}
          </button>
          {savedAt && <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Saved.</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {prevSection && (
            <Link to={`/collection/story/${prevSection.slug}`} className="btn-secondary" style={{ display: "inline-flex" }}>
              ← {t(prevSection.title)}
            </Link>
          )}
          {nextSection && (
            <Link to={`/collection/story/${nextSection.slug}`} className="btn-secondary" style={{ display: "inline-flex" }}>
              {t(nextSection.title)} →
            </Link>
          )}
        </div>
      </div>
      <ResetStory uid={user.uid} onChanged={() => setReloadToken((n) => n + 1)} />
    </CollectionPageShell>
  );
}

function SectionTabs({ current }: { current: string }) {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: 4 }}>
      {storySections.map((s) => {
        const active = s.key === current;
        return (
          <Link
            key={s.key}
            to={`/collection/story/${s.slug}`}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              color: active ? "var(--accent-deep)" : "var(--ink-soft)",
              borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -5,
            }}
          >
            {t(s.title)}
          </Link>
        );
      })}
    </div>
  );
}

function EventCard({
  event,
  allFiles,
  knownLocations,
  faces,
  onChange,
  onRemove,
}: {
  event: StoryEvent;
  allFiles: Parameters<typeof ResourcePicker>[0]["allFiles"];
  knownLocations: string[];
  faces: NamedFace[];
  onChange: (patch: Partial<StoryEvent>) => void;
  onRemove: () => void;
}) {
  const location: LocationValue = { name: event.location ?? "", coords: event.locationCoords };

  const t = useT();

  return (
    <div
      style={{
        border: `1px solid ${event.source ? sourceColor(event.source) : "var(--line)"}`,
        borderRadius: 12,
        padding: 16,
        background: event.source ? sourceTint(event.source) : "var(--bg-cream)",
      }}
    >
      {event.source && (
        <div style={{ marginBottom: 10 }}>
          <SourceChip
            sourceName={event.source}
            sourceKey={event.resourceKeys[0]}
            page={event.page}
            onClear={() => onChange({ source: undefined })}
          />
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <input
          type="text"
          placeholder={t("Event title, e.g. 'The night they left the ghetto'")}
          value={event.title}
          onChange={(e) => onChange({ title: e.target.value })}
          style={{ flex: 2 }}
        />
        <input
          type="text"
          placeholder={t("When (optional)")}
          value={event.when ?? ""}
          onChange={(e) => onChange({ when: e.target.value })}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("Remove event")}
          style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}
        >
          ×
        </button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <LocationField
          value={location}
          onChange={(v) => onChange({ location: v.name || undefined, locationCoords: v.coords })}
          knownLocations={knownLocations}
          placeholder={t("Where did this happen? (optional)")}
        />
      </div>
      <textarea
        rows={2}
        placeholder={t("What happened, as much as is known")}
        value={event.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value })}
        style={{ ...TextAreaStyle, marginBottom: 10 }}
      />
      {/* Labelled from here down: unlabelled, the two pickers read as stray controls on
          the bottom of the card rather than as "what belongs to this moment". */}
      <FieldLabel>{t("Who was here")}</FieldLabel>
      <div style={{ marginBottom: 12 }}>
        <EventPeoplePicker
          faces={faces}
          selected={event.people ?? []}
          onChange={(people) => onChange({ people })}
        />
      </div>

      <FieldLabel>{t("Material from this moment")}</FieldLabel>
      <ResourcePicker
        selectedKeys={event.resourceKeys}
        allFiles={allFiles}
        onChange={(keys) => onChange({ resourceKeys: keys })}
        compact
      />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        color: "var(--ink-soft)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 22, background: "var(--card)", marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, marginBottom: subtitle ? 4 : 14 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

const TextAreaStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "inherit",
  fontSize: 13.5,
  padding: "9px 11px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--bg-cream)",
  color: "var(--ink)",
  resize: "vertical",
};
