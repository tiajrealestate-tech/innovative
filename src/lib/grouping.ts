import { Finding, InspectionReport } from "./schema";
import { sectionOrderIndex } from "./taxonomy";
import { severityWeight } from "./severity";

// -----------------------------------------------------------------------------
// Shared helpers for the output views: grouping findings and counting them.
// -----------------------------------------------------------------------------

export interface Group {
  key: string;
  findings: Finding[];
}

/** Group findings by section, in report (Spectora) order. */
export function groupBySection(findings: Finding[]): Group[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.section || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => sectionOrderIndex(a[0]) - sectionOrderIndex(b[0]))
    .map(([key, list]) => ({
      key,
      findings: list.sort(
        (a, b) =>
          severityWeight(a.severity) - severityWeight(b.severity) ||
          a.order_index - b.order_index
      ),
    }));
}

/** Group findings by room/subsection for the client punch list. */
export function groupByRoom(findings: Finding[]): Group[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.subsection?.trim()
      ? `${f.section} › ${f.subsection}`
      : f.section || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(f);
  }
  return [...map.entries()]
    .sort((a, b) => sectionOrderIndex(a[1][0].section) - sectionOrderIndex(b[1][0].section))
    .map(([key, list]) => ({
      key,
      findings: list.sort(
        (a, b) => severityWeight(a.severity) - severityWeight(b.severity)
      ),
    }));
}

export function severityCounts(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  return counts;
}

export function reindex(report: InspectionReport): InspectionReport {
  return {
    ...report,
    findings: report.findings.map((f, i) => ({ ...f, order_index: i })),
  };
}
