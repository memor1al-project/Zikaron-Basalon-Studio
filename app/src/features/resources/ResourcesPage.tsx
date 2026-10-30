import { useMemo, useState } from "react";
import { AppLayout } from "../../app/AppLayout";
import { useAuth } from "../auth/useAuth";
import { useT } from "../../i18n";
import resourcesData from "./resources.json";

/**
 * The organisation's own printed material, offered for download.
 *
 * Zikaron BaSalon publishes these as the practical half of what it does — a host needs
 * the hosting kit far more than they need another feature in this Studio. They are kept
 * in Hebrew, as published: these are the organisation's documents, not the Studio's, and
 * translating a kit that references Hebrew source texts would misrepresent it.
 *
 * Open to anyone, like the example stories. Someone deciding whether to host an evening
 * should not have to make an account to read what hosting involves.
 */

interface Resource {
  id: string;
  title: string;
  titleEn: string;
  category: string;
  summary: string;
  file: string;
  downloadAs: string;
  format: string;
  pages?: number;
  slides?: number;
  sizeBytes: number;
}

/** The organisation's own categories, in the order its library uses. */
const CATEGORIES: { key: string; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "hosts", label: "כלים למארחים" },
  { key: "testimony", label: "כלים למוסרי עדות" },
  { key: "sessions", label: "מערכי סלון מוכנים" },
  { key: "discussion", label: "שאלות לדיון והעמקה" },
  { key: "education", label: "כלים לאנשי חינוך" },
];

function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export function ResourcesPage() {
  const resources = resourcesData as Resource[];
  const { user } = useAuth();
  const t = useT();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (!q) return true;
      return [r.title, r.titleEn, r.summary].some((field) => field.toLowerCase().includes(q));
    });
  }, [resources, query, category]);

  // Only offer the filter rows that would actually change what is on screen.
  const usedCategories = CATEGORIES.filter(
    (c) => c.key === "all" || resources.some((r) => r.category === c.key)
  );

  return (
    <AppLayout step="resources" profileDone={true} signedIn={Boolean(user)}>
      <div className="wizard-page" style={{ padding: "48px 40px", display: "flex", justifyContent: "center" }}>
        {/* The documents are Hebrew whichever language the interface is in, so the column
            that holds them reads right-to-left either way. */}
        <div className="card-enter" dir="rtl" style={{ width: "100%", maxWidth: 960 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 28, lineHeight: 1.25, marginBottom: 8 }}>{t("Guides and materials")}</h1>
            <p style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.6, maxWidth: 680 }}>
              {t(
                "The kits Zikaron BaSalon publishes for hosts, for families giving testimony, and for teachers. Download what you need — these are the organisation's own documents, in Hebrew."
              )}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Free search")}
              style={{ flex: "1 1 240px", maxWidth: 320 }}
            />
          </div>

          <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
            {usedCategories.map((c) => {
              const active = c.key === category;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(c.key)}
                  style={{
                    padding: "7px 14px",
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 20,
                    border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                    background: active ? "var(--accent-soft)" : "var(--card)",
                    color: active ? "var(--accent-deep)" : "var(--ink-soft)",
                    cursor: "pointer",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: "32px 0" }}>
              <p style={{ fontSize: 14.5, marginBottom: 4 }}>לא נמצאו תוצאות מתאימות</p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>כדאי לשנות את הגדרות החיפוש</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {visible.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}

          <p
            style={{
              fontSize: 12,
              color: "var(--ink-soft)",
              lineHeight: 1.6,
              marginTop: 32,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
            }}
          >
            {t("These materials are published by Zikaron BaSalon and belong to them. The organisation's full library, including recorded testimony, is at")}{" "}
            <a href="https://www.zikaronbasalon.com/מרכז-המידע/" target="_blank" rel="noreferrer">
              zikaronbasalon.com
            </a>
            .
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const t = useT();
  const categoryLabel = CATEGORIES.find((c) => c.key === resource.category)?.label;
  const extent =
    resource.pages !== undefined
      ? `${resource.pages} עמודים`
      : resource.slides !== undefined
        ? `${resource.slides} שקופיות`
        : null;

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-start",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 20,
        background: "var(--card)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 46,
          height: 46,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--accent-soft)",
          color: "var(--accent-deep)",
        }}
      >
        {resource.format === "PPTX" ? <DeckIcon /> : <DocIcon />}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {categoryLabel && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".04em",
              color: "var(--accent-deep)",
              marginBottom: 4,
            }}
          >
            {categoryLabel}
          </div>
        )}
        <h2 style={{ fontSize: 17, lineHeight: 1.3, marginBottom: 6 }}>{resource.title}</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6, marginBottom: 12 }}>
          {resource.summary}
        </p>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* download carries the Hebrew filename; the file on disk keeps an ASCII name
              so the URL survives copying, pasting and mail clients intact. */}
          <a
            href={resource.file}
            download={resource.downloadAs}
            className="btn-primary"
            style={{ display: "inline-flex", fontSize: 13.5, padding: "9px 18px" }}
          >
            {t("Download")}
          </a>
          <a
            href={resource.file}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-deep)" }}
          >
            {t("Open in a new tab")}
          </a>
          <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {resource.format}
            {extent ? ` · ${extent}` : ""} · {formatSize(resource.sizeBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z" />
      <path d="M14 3.5V7h4" />
      <path d="M7.5 12h7M7.5 15h7" />
    </svg>
  );
}

function DeckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="11" rx="1.5" />
      <path d="M12 15.5v4M9 19.5h6" />
    </svg>
  );
}
