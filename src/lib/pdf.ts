// -----------------------------------------------------------------------------
// One-click PDF of the composed write-ups (Trever-method view). Client-side via
// jsPDF — no server round trip, downloads straight from the review page like
// the CSV/JSON exports. Branded lightly (name + address header, page numbers);
// the authoritative published report is still Spectora's — this PDF is for
// quick sharing/review before the report is placed.
// -----------------------------------------------------------------------------

import { jsPDF } from "jspdf";
import { InspectionReport } from "./schema";
import { severityLabel } from "./severity";
import { proForWriteup } from "./pro";

// Structural type: the review page carries its own ComposedReportData shape —
// only the fields actually rendered are required here.
interface PdfGroup {
  section: string;
  item?: string | null;
  heading: string;
  body: string;
  severity?: string | null;
  box_label?: string | null;
}
interface PdfComposed {
  property_overview?: string | null;
  groups: PdfGroup[];
  audience?: string | null;
}

const M = 54; // page margin (pt)
const W = 612; // letter width
const BOTTOM = 740;

export function downloadRecommendationsPdf(
  composed: PdfComposed,
  report: InspectionReport
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const addr = report.details?.property_address || "";
  const client = report.details?.client_name || "";
  const date = report.details?.inspection_date || "";
  let y = 0;

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(11, 19, 43);
    doc.text("INNOVATIVE HOME INSPECTIONS", M, 56);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    const sub = [addr, client, date].filter(Boolean).join("  ·  ");
    doc.text(sub || "Report recommendations", M, 72);
    doc.setDrawColor(16, 78, 219);
    doc.setLineWidth(1.2);
    doc.line(M, 80, W - M, 80);
    doc.setTextColor(20);
    y = 100;
  };

  const need = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      header();
    }
  };

  const para = (text: string, size: number, style: "normal" | "bold", gap = 6) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, W - M * 2);
    const lh = size * 1.35;
    for (const line of lines) {
      need(lh);
      doc.text(line, M, y);
      y += lh;
    }
    y += gap;
  };

  header();
  para("Report Recommendations" + (composed.audience === "investor" ? " — Investor / Pre-Listing" : ""), 16, "bold", 12);

  if (composed.property_overview?.trim()) {
    para("PROPERTY CONDITION OVERVIEW", 11, "bold", 2);
    for (const p of composed.property_overview.trim().split(/\n{2,}/))
      para(p.replace(/\s*\n\s*/g, " "), 10, "normal", 4);
    y += 8;
  }

  composed.groups.forEach((g, i) => {
    need(70); // keep a heading with at least a bit of its body
    doc.setDrawColor(225);
    doc.setLineWidth(0.6);
    doc.line(M, y - 4, W - M, y - 4);
    y += 10;
    para(`${i + 1}. ${g.heading}`, 12, "bold", 1);
    const sev = severityLabel(
      g.severity === "safety"
        ? "safety_major"
        : g.severity === "maintenance"
        ? "maintenance"
        : "recommendation"
    );
    const meta = [
      `${g.section}${g.item ? " › " + g.item : ""}`,
      sev,
      `Professional: ${proForWriteup(g.body)}`,
      g.box_label ? `Checkbox: ${g.box_label}` : "",
    ]
      .filter(Boolean)
      .join("   ·   ");
    doc.setTextColor(110);
    para(meta, 8.5, "normal", 4);
    doc.setTextColor(20);
    for (const p of (g.body || "").split(/\n{2,}/))
      para(p.replace(/\s*\n\s*/g, "\n").replace(/\n(?!\d+\s*-)/g, " "), 10, "normal", 4);
    y += 6;
  });

  // Page numbers.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(150);
    doc.text(`Page ${p} of ${pages}`, W - M, 770, { align: "right" });
    if (addr) doc.text(addr, M, 770);
  }

  const slug = (addr || "report").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  doc.save(`${slug}-recommendations.pdf`);
}
