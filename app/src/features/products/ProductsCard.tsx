import { useState } from "react";
import type { StoryProduct } from "./storyProducts";

/**
 * The shared "what can I make from this?" card.
 *
 * Only products that actually work are listed. A greyed-out row for something unbuilt
 * reads as a broken feature rather than as a plan, and the plan belongs in the roadmap.
 *
 * Named ProductsCard rather than StoryProducts because the helpers next door live in
 * storyProducts.ts, and on a case-insensitive filesystem those two would be one file.
 */
export function ProductsCard({
  title,
  subtitle,
  products,
}: {
  title: string;
  subtitle: string;
  products: StoryProduct[];
}) {
  /** Which product is mid-run, if any — a deck takes a moment to gather its photographs. */
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  if (products.length === 0) return null;

  async function run(product: StoryProduct) {
    if (busy) return;
    setBusy(product.id);
    setFailed(null);
    try {
      await product.run();
    } catch {
      setFailed(`Couldn't make the ${product.label.toLowerCase()}. Try again?`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="no-print"
      style={{
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 22,
        background: "var(--card)",
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h2>
      <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 16 }}>{subtitle}</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => void run(product)}
            disabled={Boolean(busy)}
            className="option-card"
            style={{ flex: "1 1 240px", alignItems: "flex-start", opacity: busy && busy !== product.id ? 0.55 : 1 }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent-soft)",
                color: "var(--accent-deep)",
              }}
            >
              {busy === product.id ? <span className="spinner" /> : product.icon}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              {/* The label stays put while it works — the spinner in the icon slot already
                  says which one is running, and a name that rewrites itself mid-click reads
                  as a different button. */}
              <span style={{ fontSize: 14, fontWeight: 600 }}>{product.label}</span>
              <span style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.45 }}>{product.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {failed && (
        <p style={{ fontSize: 12.5, color: "var(--accent-deep)", marginTop: 12 }}>{failed}</p>
      )}
    </div>
  );
}

export function BookletIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </svg>
  );
}

export function DeckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4M9 20h6" />
    </svg>
  );
}

export function ArticleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}
