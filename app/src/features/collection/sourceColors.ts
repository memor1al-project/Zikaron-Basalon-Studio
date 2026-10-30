import { CHAPTER_COLORS } from "../testimony/chapterColors";

/**
 * One colour per source material, so a writer can see at a glance which parts of the
 * guided interview a machine drafted, and from which document or recording.
 *
 * Assigned by hashing the filename rather than by order of appearance: the same material
 * keeps the same colour in every section, across reloads, and no matter which order the
 * sections were filled. Order-based assignment would shuffle the legend the moment
 * somebody filled a new section first.
 *
 * Reuses the testimony navigator's palette — the same fourteen hues, already chosen to
 * stay distinguishable from one another against this app's cream.
 */

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0; // keep it a 32-bit int
  }
  return Math.abs(h);
}

/** The line colour for a source — used for its chip's border and text. */
export function sourceColor(sourceName: string): string {
  return CHAPTER_COLORS[hash(sourceName) % CHAPTER_COLORS.length];
}

/**
 * The same hue as a wash behind the text.
 *
 * `color-mix` against the page cream rather than an alpha, so the chip sits on an opaque
 * background — the answer boxes it labels are themselves tinted, and a translucent chip
 * would shift colour depending on what was underneath it.
 */
export function sourceTint(sourceName: string): string {
  return `color-mix(in oklch, ${sourceColor(sourceName)} 14%, var(--bg-cream))`;
}

/** Filenames are long and mostly noise; the eye only needs enough to tell them apart. */
export function shortSourceName(sourceName: string, max = 28): string {
  const withoutExtension = sourceName.replace(/\.[^.]+$/, "");
  const cleaned = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  // Truncate the middle: the start says what it is, the end often carries the distinguishing
  // part ("...War Diary" vs "...Letters"), and the middle is where the noise lives.
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${cleaned.slice(0, head).trimEnd()}…${cleaned.slice(-tail).trimStart()}`;
}
