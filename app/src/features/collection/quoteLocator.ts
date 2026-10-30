/**
 * Finding the passage an answer came from, inside the material it came from.
 *
 * The model is asked to copy quotes word for word, and mostly does — but "mostly" is the
 * problem. A quote that is one curly apostrophe or one collapsed run of whitespace away
 * from the source would fail an exact search and silently show nothing, which reads as
 * "this answer has no source" rather than "the search was too strict".
 *
 * So matching is done on a normalised copy of the text while keeping a map back to the
 * original offsets, and falls back to the longest run of words it can find. A highlight
 * that covers most of the passage is far more useful than no highlight at all.
 */

export interface QuoteMatch {
  /** Offsets into the original text. */
  start: number;
  end: number;
  /** Which readable page it landed on, when the material has pages. */
  pageIndex: number;
}

/** Curly quotes, odd dashes and runs of whitespace all differ between a PDF and a model. */
function normalize(text: string): { value: string; map: number[] } {
  const value: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // leading whitespace is dropped rather than kept as a space

  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      char = " ";
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      char = char
        .replace(/[‘’‛ʼ]/g, "'")
        .replace(/[“”‟]/g, '"')
        .replace(/[‐-―−]/g, "-")
        .toLowerCase();
    }
    value.push(char);
    map.push(i);
  }
  return { value: value.join(""), map };
}

/**
 * Locates `quote` in `text`, tolerating the small differences a model introduces.
 *
 * Returns null rather than guessing when nothing close enough is there — a highlight in the
 * wrong place would be worse than none, because it would attribute an answer to a passage
 * that doesn't support it.
 */
export function locateQuote(text: string, quote: string, pageOffsets?: number[]): QuoteMatch | null {
  if (!text || !quote?.trim()) return null;

  const haystack = normalize(text);
  const needle = normalize(quote);
  if (!needle.value) return null;

  let index = haystack.value.indexOf(needle.value);
  let length = needle.value.length;

  if (index === -1) {
    // Fall back to the longest leading run of whole words that does appear. A model often
    // paraphrases the tail of a long quote while copying its opening exactly.
    const words = needle.value.split(" ");
    for (let count = words.length - 1; count >= 4; count--) {
      const attempt = words.slice(0, count).join(" ");
      const found = haystack.value.indexOf(attempt);
      if (found !== -1) {
        index = found;
        length = attempt.length;
        break;
      }
    }
  }

  if (index === -1) return null;

  const start = haystack.map[index];
  const end = (haystack.map[index + length - 1] ?? start) + 1;
  return { start, end, pageIndex: pageForOffset(start, pageOffsets) };
}

/** The last page that begins at or before this offset. */
export function pageForOffset(offset: number, pageOffsets?: number[]): number {
  if (!pageOffsets?.length) return 0;
  let page = 0;
  for (let i = 0; i < pageOffsets.length; i++) {
    if (pageOffsets[i] <= offset) page = i;
    else break;
  }
  return page;
}

/** The text of one readable page, sliced out of the joined text. */
export function pageText(text: string, pageOffsets: number[] | undefined, pageIndex: number): string {
  if (!pageOffsets?.length) return text;
  const start = pageOffsets[pageIndex] ?? 0;
  const end = pageOffsets[pageIndex + 1] ?? text.length;
  return text.slice(start, end).trim();
}

export interface Marker {
  start: number;
  end: number;
  pageIndex: number;
  /** Which interview section it fed, for the colour. */
  sectionKey: string;
  /** Section and question, for the label. */
  sectionTitle: string;
  fieldLabel: string;
  /** Where clicking it should go. */
  slug: string;
}

/** Markers on one page, in reading order, with offsets relative to that page's own text. */
export function markersForPage(
  markers: Marker[],
  pageOffsets: number[] | undefined,
  pageIndex: number
): { start: number; end: number; marker: Marker }[] {
  const base = pageOffsets?.[pageIndex] ?? 0;
  return markers
    .filter((marker) => marker.pageIndex === pageIndex)
    .map((marker) => ({ start: marker.start - base, end: marker.end - base, marker }))
    .sort((a, b) => a.start - b.start)
    // Overlaps would nest <mark> inside <mark> and double-count the text between them.
    .filter((current, i, all) => i === 0 || current.start >= all[i - 1].end);
}
