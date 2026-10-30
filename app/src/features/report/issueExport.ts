import type { IssueReport } from "./reportStore";

/**
 * Turning staged reports into something a person or a developer can act on.
 *
 * Two shapes on purpose. The JSON carries everything, including the selectors, for
 * whoever is going to fix things. The Markdown list is what a reviewer actually wants to
 * send: readable in an email, a message, or an issue tracker, without anyone having to
 * open a file to find out what was wrong.
 */

export const KIND_LABELS: Record<string, string> = {
  visual: "Looks wrong",
  wording: "Wording",
  broken: "Doesn't work",
  confusing: "Confusing",
  missing: "Something is missing",
  other: "Other",
};

export function reportsAsJson(reports: IssueReport[], summary: string): string {
  return (
    JSON.stringify(
      {
        version: 1,
        kind: "issue-reports",
        created: new Date().toISOString(),
        site: location.origin,
        summary,
        count: reports.length,
        reports,
      },
      null,
      2
    ) + "\n"
  );
}

export function reportsAsMarkdown(reports: IssueReport[], summary: string): string {
  const lines: string[] = [];
  lines.push(`# ${summary || "Issue reports"}`);
  lines.push("");
  lines.push(`${reports.length} ${reports.length === 1 ? "report" : "reports"} · ${new Date().toLocaleString()}`);
  lines.push("");

  // Grouped by page: a reviewer goes screen by screen, and so does whoever fixes it.
  const byPage = new Map<string, IssueReport[]>();
  for (const report of reports) {
    if (!byPage.has(report.page)) byPage.set(report.page, []);
    byPage.get(report.page)!.push(report);
  }

  for (const [page, pageReports] of byPage) {
    lines.push(`## ${page}`);
    lines.push("");
    for (const r of pageReports) {
      lines.push(`- **${KIND_LABELS[r.kind] ?? r.kind}** — ${r.note}`);
      lines.push(`  - element: \`${r.elementLabel}\``);
      if (r.excerpt) lines.push(`  - text on screen: “${r.excerpt}”`);
      lines.push(`  - selector: \`${r.selector}\``);
      lines.push(`  - ${r.locale} · v${r.version} build ${r.build} · ${r.viewport}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on a delay: Safari has been known to cancel the download if the object URL
  // disappears in the same tick as the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampedName(extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `zikaron-issues-${stamp}.${extension}`;
}
