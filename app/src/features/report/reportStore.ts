/**
 * Issue reports staged in the browser.
 *
 * Deliberately reports only. The sibling tool this is modelled on could also stage real
 * edits — rewrite text, swap an image, replace markup — and re-apply them on load. That
 * suits a static marketing site being redrafted. It does not suit this one: what is on
 * screen here is somebody's family testimony, and a tool that quietly rewrites the page
 * underneath it would make a reviewer's note indistinguishable from the record itself.
 * So a report describes; it never changes anything.
 *
 * Nothing is uploaded. Reports live in this browser until someone exports them, which
 * keeps the same promise the rest of the Studio makes about a family's material.
 */

const STORAGE_KEY = "zikaron-issue-reports";
const ENABLED_KEY = "zikaron-issue-reporter";

/**
 * Whether this browser shows the reporter at all.
 *
 * Off by default. A family gathering a relative's story has no use for a reviewing tool
 * sitting over their testimony, and a stray click into picking mode would be alarming
 * rather than helpful. The organisation's reviewers turn it on by opening any page with
 * ?report=1 — one link, shareable, and it sticks until ?report=0 or the panel turns it
 * off again.
 */
export function reporterEnabled(): boolean {
  let flag: string | null = null;
  try {
    flag = new URLSearchParams(window.location.search).get("report");
  } catch {
    flag = null;
  }

  try {
    if (flag === "1") {
      localStorage.setItem(ENABLED_KEY, "1");
      return true;
    }
    if (flag === "0") {
      localStorage.removeItem(ENABLED_KEY);
      return false;
    }
    return localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    // Storage denied: honour the URL for this page view and ask again next time.
    return flag === "1";
  }
}

/**
 * Fired when the setting changes, so the reporter appears or vanishes immediately
 * instead of waiting for a reload. The two live in different corners of the tree and
 * share nothing else; one event is lighter than a context for a single boolean.
 */
export const REPORTER_EVENT = "zikaron-reporter-changed";

export function setReporterEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, "1");
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Storage denied. The event still fires, so the current page view honours the
    // choice even though it will not survive a reload.
  }
  window.dispatchEvent(new CustomEvent(REPORTER_EVENT, { detail: on }));
}

export function disableReporter(): void {
  setReporterEnabled(false);
}

/**
 * Takes ?report= out of the address bar once it has been acted on, so the flag does not
 * travel into every link a reviewer copies from here.
 */
export function stripReportFlag(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("report")) return;
    url.searchParams.delete("report");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    // An exotic URL; leaving the parameter visible is harmless.
  }
}

/** What kind of problem this is. Open-ended enough to cover anything a reviewer sees. */
export type IssueKind = "visual" | "wording" | "broken" | "confusing" | "missing" | "other";

export interface IssueReport {
  id: string;
  createdAt: string;
  kind: IssueKind;
  note: string;
  /** Where on the page, for whoever has to find it again. */
  selector: string;
  elementLabel: string;
  excerpt: string;
  /** Where in the app, and which build — a report against last week's build is a different report. */
  page: string;
  locale: string;
  version: string;
  build: string;
  viewport: string;
}

export function loadReports(): IssueReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A private window, cleared site data, or storage switched off. An empty list is
    // the right answer in all of those: nothing was staged here.
    return [];
  }
}

export function saveReports(reports: IssueReport[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // Out of quota or storage denied. Losing a staged note is bad but not worth
    // breaking the page the reviewer is looking at.
  }
}

export function addReport(report: IssueReport): IssueReport[] {
  const next = [...loadReports(), report];
  saveReports(next);
  return next;
}

export function removeReport(id: string): IssueReport[] {
  const next = loadReports().filter((r) => r.id !== id);
  saveReports(next);
  return next;
}

export function clearReports(): void {
  saveReports([]);
}

/**
 * A CSS selector that still finds this element on a later build.
 *
 * Anchors to an id where there is one, otherwise walks up recording the tag, a couple of
 * class hints and the position among same-tag siblings. This app styles inline rather
 * than with classes, so in practice most of the path is tag plus position — good enough
 * to locate something, never good enough to be worth running against a live page.
 */
export function selectorFor(el: Element): string {
  if (el === document.body) return "body";
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && parts.length < 8) {
    let seg = cur.tagName.toLowerCase();
    const classes = Array.from(cur.classList).filter((c) => !c.startsWith("issue-"));
    if (classes.length) seg += "." + classes.slice(0, 2).map((c) => CSS.escape(c)).join(".");

    const parent: Element | null = cur.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((s) => s.tagName === cur!.tagName);
      if (sameTag.length > 1) seg += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
    }
    parts.unshift(seg);

    if (cur.id) {
      parts.unshift(`#${CSS.escape(cur.id)}`);
      return parts.join(" > ");
    }
    cur = cur.parentElement;
  }
  return parts.join(" > ");
}

/** A human name for the thing clicked, so a report reads as more than a selector. */
export function labelFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role");
  const aria = el.getAttribute("aria-label");
  if (aria) return `${tag} “${aria}”`;
  if (role) return `${tag} (${role})`;
  if (tag === "img") return `image: ${(el as HTMLImageElement).alt || (el as HTMLImageElement).src.split("/").pop()}`;
  if (tag === "a") return `link: ${(el as HTMLAnchorElement).getAttribute("href") ?? ""}`;
  if (tag === "input" || tag === "textarea") {
    return `${tag}: ${(el as HTMLInputElement).placeholder || (el as HTMLInputElement).name || ""}`;
  }
  return tag;
}

/** The words actually on screen in that element — usually what identifies it fastest. */
export function excerptFor(el: Element): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}
