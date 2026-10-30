import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { markersForPage, pageText, type Marker } from "./quoteLocator";
import { sourceColor, sourceTint } from "./sourceColors";

/**
 * A material's own text, a page at a time, with the passages the story was drawn from
 * marked in place.
 *
 * The point is to make attribution checkable in both directions. A writer reading the
 * interview can see which document an answer came from; here they can see the sentence it
 * came from, on the page it sits on, and step straight to the question it fed. Without
 * that, "drafted from the war diary" is a claim they'd have to take on trust.
 *
 * A recording has no pages, so it renders as one — the same markers, the same colours, just
 * nothing to page through.
 */
export function SourceTextViewer({
  text,
  pageOffsets,
  markers,
  emptyNote,
  initialPage,
}: {
  text: string;
  /** Absent for a transcript, which is a single run of text. */
  pageOffsets?: number[];
  markers: Marker[];
  emptyNote?: string;
  /** Arrived here from a story chip — open on the page that chip points at. */
  initialPage?: number;
}) {
  const pageCount = Math.max(1, pageOffsets?.length ?? 1);
  const [page, setPage] = useState(() => clampPage(initialPage ?? 0, pageCount));

  // Pages holding marked passages, so "next marked page" can skip the ones with none.
  const markedPages = useMemo(
    () => [...new Set(markers.map((m) => m.pageIndex))].sort((a, b) => a - b),
    [markers]
  );

  // Open on the first page that actually shows something, rather than making someone
  // page through a forty-page diary to find the one paragraph the story used.
  useEffect(() => {
    // A page asked for by name wins: someone who clicked a specific chip wants that
    // passage, not whichever marked page happens to come first.
    if (initialPage !== undefined) setPage(clampPage(initialPage, pageCount));
    else if (markedPages.length > 0) setPage(markedPages[0]);
  }, [markedPages, initialPage, pageCount]);

  const body = pageText(text, pageOffsets, page);
  const onPage = markersForPage(markers, pageOffsets, page);

  return (
    <div>
      {pageCount > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            style={PagerButton}
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ← Back
          </button>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-secondary"
            style={PagerButton}
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next →
          </button>

          {markedPages.length > 0 && (
            <span style={{ fontSize: 11.5, color: "var(--ink-soft)", marginInlineStart: "auto" }}>
              {markedPages.length === 1
                ? `Marked on page ${markedPages[0] + 1}`
                : `Marked on pages ${markedPages.map((p) => p + 1).join(", ")}`}
            </span>
          )}
        </div>
      )}

      <div
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
          fontSize: 13,
          maxHeight: 280,
          overflowY: "auto",
          border: "1px solid var(--line)",
          borderRadius: 8,
          padding: "12px 14px",
          background: "var(--card)",
        }}
      >
        {onPage.length === 0 ? body : <MarkedText body={body} pieces={onPage} />}
      </div>

      {markers.length === 0 && emptyNote && (
        <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 8 }}>{emptyNote}</p>
      )}
    </div>
  );
}

/** The page's text with each drawn-from passage wrapped in a labelled, clickable mark. */
function MarkedText({
  body,
  pieces,
}: {
  body: string;
  pieces: { start: number; end: number; marker: Marker }[];
}) {
  const out: React.ReactNode[] = [];
  let cursor = 0;

  pieces.forEach((piece, i) => {
    // Clamp: a page's text is trimmed, so an offset can sit just outside it.
    const start = Math.max(0, Math.min(piece.start, body.length));
    const end = Math.max(start, Math.min(piece.end, body.length));
    if (start > cursor) out.push(body.slice(cursor, start));

    const color = sourceColor(piece.marker.sectionKey);
    out.push(
      <Link
        key={`${piece.marker.sectionKey}-${i}`}
        to={`/collection/story/${piece.marker.slug}`}
        title={`Drawn from here: ${piece.marker.sectionTitle} — ${piece.marker.fieldLabel}. Open that question.`}
        style={{
          background: sourceTint(piece.marker.sectionKey),
          borderBottom: `2px solid ${color}`,
          borderRadius: 3,
          color: "inherit",
          padding: "1px 0",
        }}
      >
        {body.slice(start, end)}
        <sup
          style={{
            fontSize: 9,
            fontWeight: 700,
            color,
            marginInlineStart: 3,
            whiteSpace: "nowrap",
          }}
        >
          {piece.marker.sectionTitle}
        </sup>
      </Link>
    );
    cursor = end;
  });

  if (cursor < body.length) out.push(body.slice(cursor));
  return <>{out}</>;
}

const PagerButton: React.CSSProperties = { padding: "5px 11px", fontSize: 12 };

/** A stored page can outlive a re-extraction that produced fewer pages. */
function clampPage(page: number, pageCount: number): number {
  return Math.max(0, Math.min(page, pageCount - 1));
}
