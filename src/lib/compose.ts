// =============================================================================
// REPORT COMPOSER — the "voice" layer on top of the universal findings.
// -----------------------------------------------------------------------------
// The findings (one per defect) are the standardized engine. This module is a
// swappable SKIN that rewrites those same findings into a particular
// inspector's report voice. It does NOT change the findings, the checkboxes,
// the punch list, or the CSV — it only produces the written report text.
//
// Preset here: "trever-2026" — his current style (consolidated, system-level
// write-ups with a numbered deficiency list + one recommendation, plus a
// property overview). The default "standard" style needs no composer; the
// report-entry view already renders one finding per defect.
// =============================================================================

import { Finding, InspectionReport } from "./schema";
import { severityLabel } from "./severity";
import { sectionOrderIndex } from "./taxonomy";

export type ReportStyle = "standard" | "trever-2026";

export interface ComposedGroup {
  section: string;
  heading: string; // ALL CAPS, e.g. "ROOF DEFICIENCIES"
  body: string; // framing + numbered list + consolidated recommendation
}
export interface ComposedReport {
  style: ReportStyle;
  property_overview: string;
  groups: ComposedGroup[];
}

// ---- prompt -----------------------------------------------------------------

export function buildComposeSystemPrompt(): string {
  return `You are the report writer for Innovative Home Inspections, writing in inspector Trever Edelin's CURRENT (2026) report voice. You receive the inspection's findings already grouped by system/section. Rewrite each group into his consolidated style. Write in the FIRST PERSON.

HIS 2026 STYLE — FOLLOW EXACTLY

1) PROPERTY OVERVIEW (one per report):
   2–4 sentences synthesizing the whole inspection and steering the buyer. Match the tone to the findings: reassuring when the house is generally sound ("Overall, the property is in generally good condition, with the majority of items representing builder-style punch-out and finish corrections rather than significant defects."), direct when it is rough ("The overall condition reflects widespread defects consistent with unlicensed and unpermitted work throughout."). End by advising what the buyer should do before closing, calling out the most notable items.

2) EACH GROUP:
   - If the group has MULTIPLE defects, write a consolidated write-up:
     * HEADING: ALL CAPS, system-scoped, e.g. "ROOF DEFICIENCIES", "EXTERIOR DEFICIENCIES", "COOLING SYSTEM DEFICIENCIES", "PLUMBING DEFICIENCIES", "BASEMENT MOISTURE DEFICIENCIES".
     * BODY: 1–2 framing sentences on overall condition and likely cause, in a measured tone ("Some conditions appear consistent with age and normal wear, while others may indicate deferred maintenance."). Then a new line: "Observed deficiencies include:" followed by a numbered list, each on its own line as "1 – ...", "2 – ...". Then a consolidated recommendation: "I recommend further evaluation and all necessary repairs by a qualified licensed [specific trade] to correct the deficiencies identified above and verify [system] is functioning as intended."
   - If the group has a SINGLE defect, keep it short: HEADING is the defect name in caps; BODY is one observation sentence + why it matters + one recommendation ("I recommend having a qualified [trade] ..."). No numbered list.

3) TRADES: name the specific trade — licensed roofing contractor, licensed HVAC contractor, licensed plumber, licensed structural engineer, qualified arborist, licensed pest control provider, etc.

4) SERVICE-DEPENDENT ITEMS: if a finding says water/gas/power was shut off or the item could not be operated, do NOT call it a defect — frame it as "could not be confirmed" and say to verify it operates once service is turned on.

5) MEASURED TONE where appropriate: "noted for awareness", "provided as an observation for the buyer's awareness rather than a determination of a structural defect", "the cause could not be determined during the visual inspection."

RULES
- Use ONLY the findings provided. Do not invent defects, measurements, or systems that were not given.
- Preserve every distinct defect in the group's numbered list — do not drop any.
- Return ONLY the structured object requested.`;
}

function findingLine(f: Finding): string {
  const sev = severityLabel(f.severity);
  const loc = f.subsection ? ` [${f.subsection}${f.component ? " / " + f.component : ""}]` : "";
  return `- (${sev})${loc} ${f.title}: ${f.comment}`;
}

export interface ComposeGroupInput {
  section: string;
  findings: Finding[];
}

export function groupForCompose(report: InspectionReport): ComposeGroupInput[] {
  const bySection = new Map<string, Finding[]>();
  for (const f of report.findings) {
    const key = f.section || "General";
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push(f);
  }
  return [...bySection.entries()]
    .map(([section, findings]) => ({ section, findings }))
    .sort((a, b) => sectionOrderIndex(a.section) - sectionOrderIndex(b.section));
}

export function buildComposeUserPrompt(groups: ComposeGroupInput[]): string {
  const blocks = groups.map((g, i) => {
    const lines = g.findings.map(findingLine).join("\n");
    return `GROUP ${i} — section: ${g.section} (${g.findings.length} finding${
      g.findings.length === 1 ? "" : "s"
    })\n${lines}`;
  });
  return `Write the Property Overview, then one write-up per group below, in Trever's 2026 style.\n\n${blocks.join(
    "\n\n"
  )}`;
}

export const COMPOSE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    property_overview: { type: "string" },
    groups: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string" },
          heading: { type: "string" },
          body: { type: "string" },
        },
        required: ["section", "heading", "body"],
      },
    },
  },
  required: ["property_overview", "groups"],
} as const;
