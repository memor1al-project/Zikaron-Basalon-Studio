/**
 * Backdrop for the main content panel — a grid of restored family photographs
 * behind a cream veil, in the same spirit as the memorial-project.org landing page.
 *
 * That site runs its collage dark and edge-to-edge: near-black overlays,
 * desaturated tiles, white text on top. This app is the inverse — warm cream,
 * dark ink, content in raised cards — so the grid is re-toned rather than copied:
 * the photographs are warmed toward the terracotta/sage palette instead of greyed
 * out, and the single overlay is cream instead of black. It is also scoped to the
 * content panel, so the sidebar and the sign-in chrome keep their flat cream.
 *
 * Imagery is the Helfgott collection carried over from the sibling `website`
 * project (resources/families/Helfgott/memorialized), downscaled into
 * public/memorial/.
 */

/**
 * Restored portraits and Stryj street scenes, ordered so neighbouring tiles don't
 * repeat a subject. Sixteen tiles fills the 4-column grid exactly; the narrower
 * container widths below hide the tail to keep their rows roughly square.
 */
const PHOTOS = [
  "anita",
  "stryj-1931",
  "isaack",
  "parents-with-baby",
  "taube",
  "stryj-1929",
  "saul",
  "graduation",
  "miryam",
  "stryj-1930",
  "woman-with-scarf",
  "grandparents",
  "rachel",
  "stryj-1932",
  "anita",
  "stryj-1929",
];

/**
 * How the backdrop sizes itself inside its panel:
 *
 * - `"pinned"` (default) for a panel that scrolls with the document. The grid is
 *   one viewport tall and sticks to the top, so it stays put under the content
 *   the way the old full-screen version did.
 * - `"fill"` for a panel of a fixed height that doesn't scroll, where the grid
 *   should match the panel box exactly.
 *
 * Either way the panel is the containing block, so the grid never reaches the
 * sidebar or the sign-in header and footer. The panel must be `position: relative`.
 */
export function GalleryBackground({ fit = "pinned" }: { fit?: "pinned" | "fill" }) {
  return (
    <div className={`gb-root gb-${fit}`} aria-hidden>
      <style>{`
        .gb-root {
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          background: var(--bg-cream);
          /* Column count below tracks the panel, not the window — the sidebar
             takes a different bite out of the viewport at each breakpoint. */
          container-type: inline-size;
        }
        .gb-pinned {
          position: sticky;
          top: 0;
          height: 100svh;
          /* Pulls the panel's real content back up over the grid: the backdrop
             occupies no space of its own in the flow. */
          margin-bottom: -100svh;
        }
        .gb-fill {
          position: absolute;
          inset: 0;
        }
        .gb-grid {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(4, 1fr);
          gap: 18px;
          padding: 18px;
        }
        .gb-tile {
          overflow: hidden;
          border-radius: 12px;
          opacity: 0;
          animation: gb-fade-in 1.6s ease-out forwards;
        }
        .gb-tile img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          /* Pulls the restored photographs toward the app's warm palette so they
             read as part of the cream ground rather than as pasted-in pictures. */
          filter: sepia(0.3) saturate(0.72) contrast(0.92) brightness(1.06);
        }
        /* Every third tile sits back a little, so the grid reads as depth rather
           than as one flat sheet of photographs. */
        .gb-tile:nth-child(3n) {
          animation-name: gb-fade-in-soft;
        }
        @keyframes gb-fade-in {
          to { opacity: 0.34; }
        }
        @keyframes gb-fade-in-soft {
          to { opacity: 0.22; }
        }

        /* Single cream veil: light at the top edge, heavier lower down where the
           wizard content and footer sit, so dark ink stays readable throughout. */
        .gb-veil {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            oklch(97% 0.014 75 / 0.5) 0%,
            oklch(96% 0.016 74 / 0.62) 45%,
            oklch(94.5% 0.02 72 / 0.76) 100%
          );
        }

        @container (max-width: 820px) {
          .gb-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
            padding: 14px;
          }
          .gb-tile:nth-child(n + 13) {
            display: none;
          }
        }
        @container (max-width: 520px) {
          .gb-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 12px;
          }
          .gb-tile:nth-child(n + 9) {
            display: none;
          }
        }
      `}</style>

      <div className="gb-grid">
        {PHOTOS.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className="gb-tile"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <img src={`/memorial/${name}.jpg`} alt="" aria-hidden decoding="async" />
          </div>
        ))}
      </div>
      <div className="gb-veil" />
    </div>
  );
}
