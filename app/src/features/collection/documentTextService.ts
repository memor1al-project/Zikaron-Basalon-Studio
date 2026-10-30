import { getObjectUrlFor } from "../../lib/storage/blobUrl";
import { loadChunk } from "../../lib/loadChunk";
import type { ProviderFile } from "../../lib/storage/types";

/**
 * Pulls the readable text out of a document, entirely in the browser.
 *
 * Deliberately not a server call: extraction is the step that makes every later AI action
 * possible, and a family whose deployment has no backend — or who is offline — should
 * still be able to get the words out of a letter or a memoir page. Only the summarising
 * and drafting that follow need the API.
 */

/** PDFs are the common case for scanned family documents; plain text needs no parsing. */
export function canExtractText(file: ProviderFile): boolean {
  return file.mimeType === "application/pdf" || file.mimeType.startsWith("text/");
}

export interface ExtractedDocument {
  text: string;
  /** How many pages produced text — the honest signal for "this scan has no text layer". */
  pageCount: number;
  /**
   * How many pages the document actually has.
   *
   * The two differing is the quiet failure worth catching: a diary that is typed for six
   * pages and handwritten for the next thirty extracts cleanly, reads as a success, and
   * silently withholds most of itself from everything downstream.
   */
  totalPages: number;
  /**
   * Character offset in `text` where each readable page begins.
   *
   * Cheaper than storing the pages twice: a quote's position in the joined text maps back
   * to a page by finding the last offset at or before it. Same array, both directions.
   */
  pageOffsets: number[];
}

export async function extractDocumentText(
  file: ProviderFile,
  onProgress?: (message: string) => void
): Promise<ExtractedDocument> {
  const url = await getObjectUrlFor(file);

  if (file.mimeType.startsWith("text/")) {
    onProgress?.("Reading file...");
    const text = await (await fetch(url)).text();
    return { text: text.trim(), pageCount: 1, totalPages: 1, pageOffsets: [0] };
  }

  onProgress?.("Loading PDF reader...");
  // Loaded on demand — pdf.js is large and only matters when a PDF is opened.
  const pdfjs = await loadChunk(() => import("pdfjs-dist"), "The PDF reader");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await loadChunk(() => import("pdfjs-dist/build/pdf.worker.min.mjs?url"), "The PDF reader")
  ).default as string;

  const pdf = await pdfjs.getDocument({ url }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    onProgress?.(`Reading page ${pageNumber} of ${pdf.numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(pageText);
  }

  const offsets: number[] = [];
  let cursor = 0;
  for (const page of pages) {
    offsets.push(cursor);
    cursor += page.length + 2; // the "\n\n" the join inserts
  }

  return {
    text: pages.join("\n\n").trim(),
    pageCount: pages.length,
    totalPages: pdf.numPages,
    pageOffsets: offsets,
  };
}

/**
 * Recovers page boundaries from text extracted before offsets were recorded.
 *
 * Safe because of how a page is built above: every run of whitespace inside a page is
 * collapsed to a single space, so a page can contain no newline of its own, and the blank
 * line between pages is the only one in the text. Splitting on it returns exactly the pages
 * that produced the text.
 *
 * Without this, a document extracted before offsets existed would show no page navigation
 * at all until someone thought to press "Read again" — and nothing would tell them to.
 */
export function pageOffsetsFromText(text: string): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const page of text.split("\n\n")) {
    offsets.push(cursor);
    cursor += page.length + 2;
  }
  return offsets;
}
