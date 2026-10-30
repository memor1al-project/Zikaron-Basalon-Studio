/**
 * Turning tagged faces into tree people.
 *
 * The Collection step already extracts faces from photographs and lets someone put a name
 * to each one. A named face is exactly a person, so the family tree shouldn't make anyone
 * type those names a second time — this gathers the ones that have been named and hands
 * them to the tree with their portrait attached.
 *
 * It's the same idea as the sibling `website` project's AddPersonDialog, which loads the
 * family's extracted faces and lets you pick one for the person being added. There the
 * faces are files on disk behind `/api/faces/list`; here they're crops already sitting in
 * each material's metadata, so no request is needed.
 */

import type { MaterialMeta } from "../collection/materialsMetaService";

export interface NamedFace {
  /** The name someone typed against this face in the Collection step. */
  label: string;
  /** Circular crop, as produced by faceExtractionService. */
  dataUrl: string;
  /** How many named crops across all materials carry this name. */
  appearances: number;
}

/**
 * Every distinct name that has been put to a face, with one representative crop.
 *
 * Deduplicated by name because the same person is usually tagged in several photographs,
 * and the tree wants one entry per person rather than one per appearance. Faces with no
 * name are skipped: without one there is nothing to call the person, and a tree of
 * anonymous portraits would be worse than no tree.
 */
export function namedFacesFrom(metas: Record<string, MaterialMeta>): NamedFace[] {
  const byName = new Map<string, NamedFace>();

  for (const meta of Object.values(metas)) {
    for (const face of meta.faces ?? []) {
      const label = face.label?.trim();
      if (!label || !face.dataUrl) continue;

      const key = label.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.appearances += 1;
        continue;
      }
      byName.set(key, { label, dataUrl: face.dataUrl, appearances: 1 });
    }
  }

  return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * "Miriam Helfgott" → first "Miriam", last "Helfgott".
 *
 * The last whitespace-separated word is the surname, so double-barrelled given names stay
 * together ("Anna Maria Popper" → "Anna Maria" / "Popper"). A single word is a given name;
 * assuming otherwise would file people under a surname nobody recorded.
 */
export function splitName(label: string): { firstName: string; lastName: string } {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Rendered at r=26 in the chart and 48px in the lists, so 96px covers a 2x display. */
const PHOTO_SIZE = 96;

/**
 * Shrinks a face crop to a portrait small enough to store.
 *
 * The whole tree is one Firestore document with a 1MB ceiling, and the crops coming out of
 * face extraction are full-size PNGs — a handful would blow the limit on their own. These
 * are re-encoded as small JPEGs, a few KB each, so a tree of a hundred portraits still fits.
 *
 * JPEG has no transparency, so the crop's round corners are filled with the page cream
 * first. Every place a portrait is drawn clips it back to a circle, so the fill never shows;
 * it only stops the corners going black if one ever isn't clipped.
 */
export function toPortrait(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("");
      ctx.fillStyle = "#f7f3ec";
      ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
      ctx.drawImage(img, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    // No portrait beats storing the full-size crop and pushing the document over its limit.
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}
