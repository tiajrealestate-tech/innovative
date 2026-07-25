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
  return `You are the report writer for Innovative Home Inspections, writing in inspector Trever Edelin's CURRENT (2026) report voice. You receive the inspection's findings, grouped by system/section as a starting point. Rewrite them into his consolidated style. Write in the FIRST PERSON.

You decide how to group the write-ups. A section is a STARTING point, not a rule: a section with several unrelated defects may become MULTIPLE write-ups, and you may output more than one write-up for the same section (each is its own entry in "groups"). Follow any grouping instructions the inspector gave (see INSPECTOR INSTRUCTIONS) — e.g. "keep the shingle wear separate" means give that defect its own single-defect write-up while the remaining items in that section stay grouped together.

HIS 2026 STYLE — FOLLOW EXACTLY

1) PROPERTY OVERVIEW (one per report):
   2–4 sentences synthesizing the whole inspection and steering the buyer. Match the tone to the findings: reassuring when the house is generally sound ("Overall, the property is in generally good condition, with the majority of items representing builder-style punch-out and finish corrections rather than significant defects."), direct when it is rough ("The overall condition reflects widespread defects consistent with unlicensed and unpermitted work throughout."). Name the 2–3 most notable items by exception, then close with a "before closing" recommendation using his phrasing: "I recommend that the buyer request these items be addressed prior to closing, with particular attention to [the most notable items]."

2) EACH GROUP:
   - If the group has MULTIPLE defects, write a consolidated write-up:
     * HEADING: ALL CAPS. Usually "[SYSTEM] DEFICIENCIES" (e.g. "EXTERIOR DEFICIENCIES", "HVAC DEFICIENCIES", "PLUMBING DEFICIENCIES", "ELECTRICAL DEFICIENCIES"), but may be a short descriptive title when the group spans related systems, e.g. "ROOF, CHIMNEYS, AND DRAINAGE SYSTEMS" or "WINDOW & DOOR DEFICIENCIES".
     * BODY: 1–2 framing sentences on overall condition and likely cause, in a measured tone ("Some conditions appear consistent with age and normal wear, while others may indicate deferred maintenance."). You MAY note a relevant positive before the deficiencies ("The cooling system was operational and cooling the home at the time of inspection; however, several deficiencies were observed…"; "encouragingly, no evidence of active moisture was observed"). Then a new line: "Observed deficiencies include:" followed by a numbered list, each on its own line as "1 – ...", "2 – ...". Then a TWO-SENTENCE consolidated recommendation: the first names who to bring in — "I recommend further evaluation [and repair] by a [licensed/qualified specific trade]." — and the second begins "Recommend …" and lists the specific corrective actions matching the numbered deficiencies (e.g. "Recommend cleaning the gutters, extending the downspouts away from the foundation, and trimming back the overhanging trees.").
   - If the group has a SINGLE defect, keep it short: HEADING is the defect name in caps; BODY is one observation sentence + why it matters + one recommendation ("I recommend having a qualified [trade] ..."). No numbered list.
   - CLOSING LINE: end every write-up's body with his brief referral line, naming the specific trade when it is clear — "Contact a qualified roofing professional." / "Contact a qualified electrician." / "Contact a qualified handyman." / otherwise "Contact a qualified professional." — on its own final line.

3) TRADES: name the specific trade — licensed roofing contractor, licensed HVAC contractor, licensed plumber, licensed structural engineer, qualified arborist, licensed pest control provider, etc.

4) SERVICE-DEPENDENT ITEMS: if a finding says water/gas/power was shut off or the item could not be operated, do NOT call it a defect — frame it as "could not be confirmed" and say to verify it operates once service is turned on.

5) MEASURED TONE where appropriate: "noted for awareness", "provided as an observation for the buyer's awareness rather than a determination of a structural defect", "the cause could not be determined during the visual inspection."

6) AGING / END-OF-LIFE EQUIPMENT: when a system is near the end of its service life but still functioning, say so plainly ("cooling adequately but near the end of typical service life") and recommend budgeting for eventual replacement rather than calling it failed.

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

export function buildComposeUserPrompt(
  groups: ComposeGroupInput[],
  instructions?: string
): string {
  const blocks = groups.map((g, i) => {
    const lines = g.findings.map(findingLine).join("\n");
    return `SECTION ${i} — ${g.section} (${g.findings.length} finding${
      g.findings.length === 1 ? "" : "s"
    })\n${lines}`;
  });
  const instrBlock = instructions && instructions.trim()
    ? `INSPECTOR INSTRUCTIONS (honor any grouping/wording directions in here; do NOT treat these as new defects):\n"""\n${instructions.trim()}\n"""\n\n`
    : "";
  return `${instrBlock}Write the Property Overview, then the write-ups in Trever's 2026 style. Group the findings sensibly — a section may become one write-up or several, and you may split out any item the inspector asked to keep separate.\n\n${blocks.join(
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
