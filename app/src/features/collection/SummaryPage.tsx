import { useEffect, useMemo, useState } from "react";
import { CollectionPageShell } from "./CollectionPageShell";
import { useCollectionSession } from "./CollectionSessionContext";
import { useAuthedUser } from "../../app/guards";
import { ResourceThumb } from "./ResourceThumb";
import { MapView, type MapPoint } from "./MapView";
import { storySections } from "./storySections";
import { summaryArticle } from "./summaryArticle";
import { summaryDeck } from "./summaryDeck";
import { downloadDeck } from "../products/storyDeck";
import { ArticleIcon, BookletIcon, DeckIcon, ProductsCard } from "../products/ProductsCard";
import { downloadText, fileStem, printAsBooklet, type StoryProduct } from "../products/storyProducts";
import { FamilyTreeChart } from "../familytree/FamilyTreeChart";
import { getFamilyTree } from "../familytree/familyTreeService";
import { describeRelations, displayName, lifespan, EMPTY_TREE, type FamilyTree } from "../familytree/familyTree";
import { getSection, type StoryEvent, type StorySectionData, type StorySectionKey } from "./interviewService";
import { metaKeyFor, type MaterialMeta } from "./materialsMetaService";
import { listMetas, removedKeys } from "./metaStore";
import type { ProviderFile } from "../../lib/storage/types";
import { useT } from "../../i18n";

export function SummaryPage() {
  const t = useT();
  const user = useAuthedUser();
  const { connection, files } = useCollectionSession();
  const [sections, setSections] = useState<Record<StorySectionKey, StorySectionData> | null>(null);
  const [metas, setMetas] = useState<Record<string, MaterialMeta>>({});
  /** Optional step — an empty tree simply means the card doesn't appear. */
  const [tree, setTree] = useState<FamilyTree>(EMPTY_TREE);
  /** Materials taken out of the story — the summary must not resurrect them. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all(storySections.map((s) => getSection(user.uid, s.key))).then((results) => {
      const map = {} as Record<StorySectionKey, StorySectionData>;
      storySections.forEach((s, i) => (map[s.key] = results[i]));
      setSections(map);
    });
    // Same store the Collection step writes to — reading Firestore directly here meant a
    // local folder's sidecar edits never reached the summary.
    listMetas(connection, user.uid).then(setMetas).catch(() => {});
    // Best-effort, like the metadata above: a summary is still worth showing without it.
    getFamilyTree(user.uid).then(setTree).catch(() => {});
  }, [connection, user.uid]);

  useEffect(() => {
    let cancelled = false;
    removedKeys(connection)
      .then((keys) => !cancelled && setRemoved(keys))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [connection]);

  const visibleFiles = useMemo(
    () => files.filter((f) => !removed.has(metaKeyFor(f.ref))),
    [files, removed]
  );

  const fileByKey = useMemo(() => {
    const map = new Map<string, ProviderFile>();
    for (const f of visibleFiles) map.set(metaKeyFor(f.ref), f);
    return map;
  }, [visibleFiles]);

  /**
   * The Family tree step says marking someone tells "the rest of the wizard who is at its
   * centre" — this is where that promise is kept. An explicit mark beats parsing a name
   * out of a free-text interview answer, so it wins when one exists.
   */
  const treeSubject = tree.people.find((p) => p.isSubject);

  const subjectName =
    (treeSubject && displayName(treeSubject)) ||
    sections?.lifeBeforeWar.answers.birthNameAndNicknames?.split(",")[0]?.trim() ||
    t("This story");

  const timelineEvents = useMemo(() => {
    if (!sections) return [];
    return storySections.flatMap((s) => sections[s.key].events.map((e) => ({ event: e, sectionTitle: t(s.title) })));
  }, [sections, t]);

  const mapPoints = useMemo(() => {
    const points: MapPoint[] = [];
    const seen = new Set<string>();

    function add(coords: { lat: number; lon: number } | undefined, label: string) {
      if (!coords) return;
      const key = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push({ lat: coords.lat, lon: coords.lon, label });
    }

    for (const meta of Object.values(metas)) add(meta.locationCoords, meta.location ?? "");
    for (const e of timelineEvents) add(e.event.locationCoords, e.event.location || e.event.title);

    return points;
  }, [metas, timelineEvents]);

  const images = visibleFiles.filter((f) => f.mimeType.startsWith("image/"));

  if (!sections) return null;

  const products: StoryProduct[] = [
    {
      id: "booklet",
      label: t("Keepsake booklet"),
      hint: t("Everything below as a printable PDF — the tree stays sharp at any size."),
      icon: <BookletIcon />,
      run: () => printAsBooklet(`${subjectName} — Zikaron BaSalon`),
    },
    {
      id: "deck",
      label: t("Presentation"),
      hint: t("A PowerPoint running order for the evening — edit it in PowerPoint, Keynote or Slides."),
      icon: <DeckIcon />,
      run: async () =>
        downloadDeck(
          await summaryDeck({ subjectName, sections, tree, files: visibleFiles }),
          `${fileStem(subjectName)}.pptx`
        ),
    },
    {
      id: "article",
      label: t("Article"),
      hint: t("The same story as text, for an email or a newsletter."),
      icon: <ArticleIcon />,
      run: () =>
        downloadText(
          `${fileStem(subjectName)}.md`,
          summaryArticle({
            subjectName,
            sections,
            tree,
            places: mapPoints.map((p) => p.label).filter(Boolean),
          })
        ),
    },
  ];

  return (
    <CollectionPageShell step="summary">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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
          {t("Summary")}
        </span>
      </div>
      <h1 style={{ fontSize: 30, lineHeight: 1.25, marginBottom: 8 }}>{subjectName}</h1>
      <p style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 32, maxWidth: 560 }}>
        {t("Everything gathered so far, pulled into one place — nothing here has been reviewed or published yet.")}
      </p>

      <ProductsCard
        title={t("Make something from this story")}
        subtitle={t("Built here on your own device and saved straight to it — nothing is uploaded anywhere.")}
        products={products}
      />

      {/* Before the map and timeline: who the story is about sets up the where and when. */}
      {tree.people.length > 0 && (
        <Card
          keepTogether
          title={t("Family tree")}
          subtitle={
            t(tree.people.length === 1 ? "{n} person." : "{n} people.").replace(
              "{n}",
              String(tree.people.length)
            ) +
            (treeSubject
              ? ` ${t("Centred on {name}.").replace("{name}", displayName(treeSubject))}`
              : "")
          }
        >
          <FamilyTreeChart tree={tree} />
          {treeSubject && describeRelations(tree, treeSubject.id, t) && (
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--ink-soft)",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--line)",
              }}
            >
              <strong style={{ color: "var(--ink)" }}>
                {displayName(treeSubject)}
                {lifespan(treeSubject) ? ` (${lifespan(treeSubject)})` : ""}
              </strong>{" "}
              — {describeRelations(tree, treeSubject.id)}.
            </p>
          )}
        </Card>
      )}

      {mapPoints.length > 0 && (
        <Card keepTogether title={t("Map")} subtitle={t("Places associated with this story.")}>
          <MapView points={mapPoints} />
          {/* The map's own labels live in click-to-open popups, so on paper — and for
              anyone skimming — the names would otherwise be lost with the pins. */}
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 10, lineHeight: 1.6 }}>
            {mapPoints.map((p) => p.label).filter(Boolean).join(" · ")}
          </p>
        </Card>
      )}

      {timelineEvents.length > 0 && (
        <Card title={t("Timeline")} subtitle={t("Events, in the order they appear across the story.")}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {timelineEvents.map(({ event, sectionTitle }, i) => (
              <TimelineRow key={event.id} event={event} sectionTitle={sectionTitle} fileByKey={fileByKey} isLast={i === timelineEvents.length - 1} />
            ))}
          </div>
        </Card>
      )}

      {images.length > 0 && (
        <Card
          title={t("Images")}
          subtitle={t(
            images.length === 1 ? "{n} photo from the collection." : "{n} photos from the collection."
          ).replace("{n}", String(images.length))}
        >
          <div style={{ width: "60%", margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {images.map((f) => (
                <div key={metaKeyFor(f.ref)} style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden" }}>
                  <ResourceThumb file={f} fill />
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card title={t("The story")} subtitle={t("Answers gathered so far, section by section.")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {storySections.map((s) => {
            const answered = s.fields
              .map((f) => ({ label: t(f.label), value: sections[s.key].answers[f.key] }))
              .filter((a) => a.value?.trim());
            if (answered.length === 0) return null;
            return (
              <div key={s.key}>
                <h3 style={{ fontSize: 15, marginBottom: 10 }}>{t(s.title)}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {answered.map((a) => (
                    <div key={a.label}>
                      <div style={{ fontSize: 11.5, color: "var(--ink-soft)", marginBottom: 2 }}>{a.label}</div>
                      <p style={{ fontSize: 14, lineHeight: 1.6 }}>{a.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </CollectionPageShell>
  );
}

function TimelineRow({
  event,
  sectionTitle,
  fileByKey,
  isLast,
}: {
  event: StoryEvent;
  sectionTitle: string;
  fileByKey: Map<string, ProviderFile>;
  isLast: boolean;
}) {
  const t = useT();
  const resourceFiles = event.resourceKeys.map((k) => fileByKey.get(k)).filter((f): f is ProviderFile => Boolean(f));

  return (
    <div className="print-keep" style={{ display: "flex", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent-deep)", marginTop: 6 }} />
        {!isLast && <span style={{ width: 2, flex: 1, background: "var(--line)", marginTop: 4 }} />}
      </div>
      <div style={{ paddingBottom: 20 }}>
        <div style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", letterSpacing: ".04em" }}>
          {sectionTitle}
          {event.when ? ` · ${event.when}` : ""}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 2 }}>{event.title || "Untitled event"}</div>
        {event.location && <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>📍 {event.location}</div>}
        {/* Otherwise "who was here" is collected on the event and never seen again. */}
        {(event.people?.length ?? 0) > 0 && (
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
            {t("With")} {event.people!.join(", ")}
          </div>
        )}
        {event.description && <p style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 6 }}>{event.description}</p>}
        {resourceFiles.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            {resourceFiles.map((f) => (
              <ResourceThumb key={metaKeyFor(f.ref)} file={f} size={40} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  keepTogether,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Small enough to be worth holding on one printed page. */
  keepTogether?: boolean;
}) {
  return (
    <div
      className={`print-card${keepTogether ? " print-keep" : ""}`}
      style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 22, background: "var(--card)", marginBottom: 20 }}
    >
      {/* Title and subtitle as one unit, so a page break can't land between the
          heading and the content it introduces. */}
      <div className="print-head">
        <h2 style={{ fontSize: 16, marginBottom: subtitle ? 4 : 14 }}>{title}</h2>
        {subtitle && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 14 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
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
