import { Link } from "react-router-dom";
import { shortSourceName, sourceColor, sourceTint } from "./sourceColors";
import { useT } from "../../i18n";

/**
 * Shows where a drafted answer came from.
 *
 * The answer itself sits in a textarea, which can hold no styling and where any label
 * written into the text could be edited away without noticing. So the attribution lives
 * beside the box instead: a coloured chip, matched by colour to the legend above the
 * questions, tinting the answer it belongs to.
 */
export function SourceChip({
  sourceName,
  sourceKey,
  page,
  onClear,
}: {
  sourceName: string;
  /** metaKeyFor() of the material, when it's known — makes the name a way back to it. */
  sourceKey?: string;
  /** Page the passage sits on, so the material opens where the words are. */
  page?: number;
  /** Clearing says "these are my words now" — it never touches the text. */
  onClear?: () => void;
}) {
  const t = useT();
  const color = sourceColor(sourceName);
  const href = sourceKey
    ? `/collection/materials?open=${encodeURIComponent(sourceKey)}${page !== undefined ? `&page=${page + 1}` : ""}`
    : null;

  return (
    <span
      title={href ? `Drafted from ${sourceName} — open it to check the passage` : `Drafted from ${sourceName}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: sourceTint(sourceName),
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: "2px 4px 2px 8px",
        lineHeight: 1.5,
        maxWidth: "100%",
      }}
    >
      {href ? (
        <Link
          to={href}
          style={{
            color: "inherit",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shortSourceName(sourceName)}
        </Link>
      ) : (
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {shortSourceName(sourceName)}
        </span>
      )}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove the label linking this answer to ${sourceName}`}
          title={t("I've rewritten this — remove the label")}
          style={{
            background: "none",
            border: "none",
            padding: "0 3px",
            margin: 0,
            color: "inherit",
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * The key to the colours, above the questions.
 *
 * Without it a chip is just a coloured word; with it, a writer can see at a glance how much
 * of a section came from which material — and that anything unlabelled is their own.
 */
export function SourceLegend({ sources }: { sources: string[] }) {
  const t = useT();
  if (sources.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 14,
        background: "var(--bg-cream)",
      }}
    >
      <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>
        {sources.length === 1
          ? t("Drafted from this material — check anything labelled:")
          : t("Drafted from these materials — check anything labelled:")}
      </span>
      {sources.map((source) => (
        <span
          key={source}
          title={source}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            fontWeight: 600,
            color: sourceColor(source),
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: sourceColor(source),
              flexShrink: 0,
            }}
          />
          {shortSourceName(source, 34)}
        </span>
      ))}
    </div>
  );
}
