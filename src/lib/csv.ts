import { InspectionReport } from "./schema";
import { severityLabel } from "./severity";
import { sectionOrderIndex } from "./taxonomy";

// -----------------------------------------------------------------------------
// CSV export for Airtable / Excel. One row per finding, plus the inspection
// details repeated on each row so the file is self-contained.
// -----------------------------------------------------------------------------

const HEADERS = [
  "property_address",
  "inspection_date",
  "client_name",
  "client_agent",
  "inspector_name",
  "section",
  "subsection",
  "component",
  "severity",
  "recommendation_type",
  "title",
  "comment",
  "location_tags",
  "confidence",
  "source_text",
];

function esc(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Quote if the value contains a comma, quote, or newline.
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function reportToCsv(report: InspectionReport): string {
  const d = report.inspection;
  const rows = [...report.findings]
    .sort(
      (a, b) =>
        sectionOrderIndex(a.section) - sectionOrderIndex(b.section) ||
        a.order_index - b.order_index
    )
    .map((f) =>
      [
        d.property_address,
        d.inspection_date,
        d.client_name,
        d.client_agent,
        d.inspector_name,
        f.section,
        f.subsection,
        f.component,
        severityLabel(f.severity),
        f.recommendation_type,
        f.title,
        f.comment,
        (f.location_tags || []).join("; "),
        f.confidence,
        f.source_text,
      ]
        .map(esc)
        .join(",")
    );

  return [HEADERS.join(","), ...rows].join("\r\n");
}

export function downloadCsv(report: InspectionReport, filename = "inspection-findings.csv") {
  const csv = reportToCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

export function downloadJson(report: InspectionReport, filename = "inspection-findings.json") {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
