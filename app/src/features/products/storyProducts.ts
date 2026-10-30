/**
 * Products — turning a gathered story into something a family can keep or send.
 *
 * Two so far, both deterministic and dependency-free:
 *
 *  - **Booklet** goes through the browser's own print dialog, where "Save as PDF" is a
 *    destination. The page being printed is already the layout, and the family tree is an
 *    SVG that survives as vector, so a PDF library would only be a second renderer to
 *    keep in step with the first.
 *  - **Article** assembles the same material as Markdown, for pasting into an email, a
 *    community newsletter, or anywhere that wants words rather than a page.
 *
 * Both work identically for a family's own story and for one of the worked examples, so
 * this lives apart from either wizard and takes the text it should write as a callback.
 */

import type { ReactNode } from "react";

export interface StoryProduct {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  /** May be async — a deck has to fetch and encode photographs before it can be written. */
  run: () => void | Promise<void>;
}

/**
 * Prints the current page, naming the saved file after the story.
 *
 * Chrome and Safari take the PDF's filename from the document title, so it's swapped for
 * the duration and put back afterwards — otherwise every booklet a family saves is called
 * "Zikaron BaSalon Story Studio".
 */
export function printAsBooklet(title: string) {
  const previous = document.title;
  document.title = title;
  const restore = () => {
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe stem from a person's name, for the downloaded file. */
export function fileStem(title: string): string {
  return (
    title
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "story"
  );
}
