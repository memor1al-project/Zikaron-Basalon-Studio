import { Link } from "react-router-dom";
import { PresentationPageShell } from "./PresentationPageShell";
import { chaptersForVideo } from "../testimony/exampleChapters";
import testimonies from "./exampleTestimonies.json";
import { useT } from "../../i18n";

interface Testimony {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  channel: string | null;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ExampleStoriesPage() {
  const videos = testimonies as Testimony[];
  const t = useT();

  return (
    <PresentationPageShell>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, lineHeight: 1.25, marginBottom: 6 }}>{t("Example stories")}</h1>
        <p style={{ fontSize: 14, color: "var(--ink-soft)" }}>
          {t("Real testimony from past Zikaron BaSalon gatherings, for inspiration as you build your own presentation.")}{" "}
          {t("Videos marked")} <ChapterBadge inline />{" "}
          {t("open in the testimony navigator, which breaks the recording into named chapters your guests can move through themselves.")}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {videos.map((v) => (
          <Link
            key={v.id}
            to={`/presentation/examples/${v.id}`}
            className="option-card"
            style={{ flexDirection: "column", alignItems: "stretch", gap: 10, padding: 10, textAlign: "left", color: "var(--ink)" }}
          >
            <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "var(--bg-cream-2)" }}>
              <img
                src={v.thumbnailUrl}
                alt=""
                style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "oklch(20% 0.02 50 / 0.15)",
                }}
              >
                <PlayGlyph />
              </span>
              {v.durationSeconds != null && (
                <span
                  style={{
                    position: "absolute",
                    right: 6,
                    bottom: 6,
                    fontSize: 10.5,
                    background: "oklch(20% 0.02 50 / 0.75)",
                    color: "white",
                    padding: "2px 6px",
                    borderRadius: 5,
                  }}
                >
                  {formatDuration(v.durationSeconds)}
                </span>
              )}
              {chaptersForVideo(v.id) && (
                <span style={{ position: "absolute", left: 6, top: 6 }}>
                  <ChapterBadge count={chaptersForVideo(v.id)!.segments.length} />
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{v.title}</div>
          </Link>
        ))}
      </div>

    </PresentationPageShell>
  );
}

/** Marks a video whose chapters are ready, both in the gallery and in the intro text. */
function ChapterBadge({ count, inline }: { count?: number; inline?: boolean }) {
  const t = useT();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: inline ? 11 : 10.5,
        fontWeight: 600,
        background: inline ? "var(--accent-soft)" : "oklch(20% 0.02 50 / 0.75)",
        color: inline ? "var(--accent-deep)" : "white",
        padding: "2px 8px",
        borderRadius: 10,
        verticalAlign: "middle",
      }}
    >
      ☰ {count != null ? `${count} ${t("chapters")}` : t("chapters")}
    </span>
  );
}

function PlayGlyph() {
  return (
    <span
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "oklch(98% 0.01 50 / 0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="var(--ink)">
        <path d="M8 5.5v13l11-6.5-11-6.5z" />
      </svg>
    </span>
  );
}
