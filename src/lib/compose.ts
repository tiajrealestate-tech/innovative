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
import { HOUSE_STYLE } from "./houseStyle";
import { sectionItems } from "./catalog";

export type ReportStyle = "standard" | "trever-2026";

export interface ComposedGroup {
  section: string;
  heading: string; // ALL CAPS, e.g. "ROOF DEFICIENCIES"
  body: string; // framing + numbered list + consolidated recommendation
  /** Spectora item this write-up should be placed in (filled in server-side). */
  item?: string;
  /** Spectora rating chip: safety | recommendation | maintenance. */
  severity?: "safety" | "recommendation" | "maintenance";
}
export interface ComposedReport {
  style: ReportStyle;
  property_overview: string;
  groups: ComposedGroup[];
}

// ---- prompt -----------------------------------------------------------------

export function buildComposeSystemPrompt(): string {
  return `${HOUSE_STYLE}

TASK — GROUPED REPORT RECOMMENDATIONS
You are given the inspection's findings as field notes. Produce the completed report recommendations in the DEFAULT grouped format, plus a Property Conditions Overview. Write in the first person.

HOW AGGRESSIVELY TO GROUP — THIS IS THE MOST IMPORTANT INSTRUCTION
A finished report for an entire house contains roughly SIX TO TEN recommendations in total — not one per observation. Consolidate hard: all of a system's deficiencies become ONE recommendation whose numbered list carries the individual conditions. For example, a single "EXTERIOR MAINTENANCE DEFICIENCIES" recommendation properly contains cracked driveways, mortar deterioration, damaged hose bibbs, deteriorated trim and siding, fencing deterioration, overhanging limbs, and a missing sewer cleanout cap — nine separate observations in one write-up, not nine write-ups.
- Default to ONE recommendation per major system (Roof, Exterior, Basement/Foundation/Crawlspace, Heating/HVAC, Cooling, Plumbing, Electrical, Doors/Windows/Interior, Attic, Bathrooms, Laundry, Kitchen, Garage).
- You MAY group by THEME across sections when the conditions share a cause and a fix — e.g. a single "WATER MANAGEMENT & SUSPECTED CRAWL SPACE MOISTURE INTRUSION" write-up covering negative grading, downspouts terminating at the foundation, efflorescence, elevated moisture readings, and blocked crawl space vents.
- Every observation must survive INSIDE a numbered list. Consolidating means fewer write-ups, never fewer findings.
- Split a condition out on its own ONLY when the stand-alone criteria below apply. Two write-ups for the same system is the exception, not the norm.
- Never emit two write-ups with the same or near-identical heading.
- SHAPE TO AIM FOR. A real report he built by hand for a heavily-defective house came to 19 recommendations, placed like this — use it as the model for both grouping and titles:
  Roof › Roofing General: "Roof and Chimney Deficiencies"
  Exterior › Walkways, Patios & Driveways: "Exterior Concrete Deficiencies"
  Exterior › Decks, Balconies, Porches & Steps: "Exterior Stairway and Guardrail Deficiencies"
  Exterior › Vegetation, Grading, Drainage & Retaining Walls: "Fence and Gate Deficiencies" AND "Exterior Drainage Deficiencies"
  Exterior › Windows & Doors: "Window, Door and Exterior Trim Deficiencies"
  Exterior › Basement Walkout: "Basement Walkout Retaining Wall Movement"
  Basement… › Basements & Crawlspaces: "Basement Moisture Deficiencies" AND "Wood-Destroying Insect Damage"
  Basement… › Structural General: "Structural Movement Concerns"
  Cooling › Cooling Equipment: "Cooling System Deficiencies"
  Plumbing › Hot Water Systems, Controls, Flues & Vents: "Water Heater Deficiencies"
  Plumbing › Sump Pump: "Sump Pump Deficiencies"
  Plumbing › Plumbing General: "Plumbing System Deficiencies"
  Electrical › Service Entrance Conductors: "Abandoned Electrical Service Wiring"
  Electrical › Main & Subpanels…: "Electrical System Deficiencies"
  Attic… › Structural Components & Observations in Attic: "Attic Insulation and Moisture Deficiencies"
  Kitchen › Range/Oven/Cooktop: "Gas Range Safety Hazard"
  Note how related conditions merge into one titled write-up per area, and how a section may carry two write-ups when the conditions are genuinely distinct.
- THE INSPECTOR'S OWN INSTRUCTIONS OVERRIDE THIS DEFAULT. He dictates what he wants as he walks ("make this its own recommendation", "keep these together", "put this under exterior"). Honor those exactly, even when they produce more or fewer write-ups than the guidance above.

DEFAULT RECOMMENDATION FORMAT ("aggressive but defensible" grouping):
- HEADING: a short, specific title (four or five words or fewer, e.g. "Roof Covering Deficiencies", "Foundation Wall Moisture"). No vague titles, no the word "Noted".
- BODY:
  * A brief observation paragraph (factual and qualified per the rules above). You may note a relevant positive before the deficiencies (e.g. "The cooling system produced conditioned air at the time of testing; however, several deficiencies were observed.").
  * Then a line exactly: "Observed deficiencies include:"
  * Then a numbered list, each on its own line: "1 - <condition and location>", "2 - ...".
  * Then a final recommendation paragraph beginning "I recommend " that names the correct professional and states the scope (evaluate, repair, replace, verify, and assess related or concealed damage when applicable). Keep contractor instructions in this final paragraph, not in each numbered item.

STAND-ALONE (single) write-ups: give a condition its own write-up (short title + one factual paragraph + one "I recommend ..." recommendation, NO numbered list) when it is significant on its own, needs a different specialist, carries a different safety or urgency, would be buried in a group, or involves structure, active water intrusion, major roof failure, sewage, combustion safety, extensive fungal growth, major electrical hazards, or fire separation. Keep those major concerns separate — do not bury them inside a broad group.

GROUPING CONTROL: you decide the grouping — a section may become one write-up or several, and you may output more than one write-up for the same section (each is its own entry in "groups"). Follow any grouping directions the inspector gave in INSPECTOR INSTRUCTIONS (e.g. "keep the shingle wear separate").

PROPERTY CONDITIONS OVERVIEW: a short, balanced summary of the ESTABLISHED findings — identify the most important systems requiring attention. Do NOT repeat every recommendation, introduce new findings, name contractors, declare the property safe or structurally sound, give negotiation advice, or over-praise.

SEVERITY RATING: every write-up carries a "severity" — the Spectora chip it is filed under. These rules were learned from 770 rated write-ups across this inspector's 48 most recent published reports; follow his calibration, not generic instinct. His distribution: ~70% recommendation, ~19% maintenance, ~11% safety.

- "safety" (Safety Hazard/Major Defects) — this chip covers TWO distinct things, and both earn it:
  (1) DANGER to occupants:
  * gas odor or suspected gas leak at an appliance ("Gas Range Safety Hazard")
  * combustion / carbon-monoxide venting problems — damaged, dated, or improper water-heater or furnace flue
  * significant structural movement or damage — bulging walls, uneven floors, subfloor integrity, improper structural modifications
  * active moisture intrusion or water damage — "Moisture Intrusion Throughout Basement", high moisture at the foundation wall
  * fall/injury hazards — damaged stair tread, loose guardrail, broken glass pane
  * smoke/CO detectors outdated (>10 years), missing, or inoperable
  * fire separation and garage safety — occupant door not self-closing, opener auto-reverse not working
  * electrical shock/fire conditions — faulty or improperly wired GFCI, flickering lights/low voltage, system-wide electrical deficiencies
  (2) MAJOR DEFECTS — a big-ticket system that is missing, failing, or at end of life, even with nobody in danger:
  * sump pump missing where the basement needs one (he rates this safety EVERY time)
  * heating or cooling equipment inoperable, failed to produce heat/cold, or beyond service life
  * water heater failure
  * aged/worn-out roof system at end of life
  * system-wide plumbing deficiencies or improper plumbing installation
  * whole-house window failure — original low-quality units, failing/fogged units throughout
  * evidence of substandard renovation work throughout
  A typical report carries 1–4 of these; a distressed property can carry many more (his record is 17). If the numbered list contains even one qualifying condition, the whole write-up is "safety".

- "maintenance" (Maintenance Item) — routine, low-cost upkeep a homeowner or handyman handles; no contractor diagnosis needed: dirty filters, bulbs, missing/damaged window screens, deteriorating caulk, slow drains, missing stoppers/aerators, minor drips or a loose fixture connection, door hardware (strike plates, stoppers, noticeable gaps, unattached closet doors), loose receptacles or protective covers, debris in gutters, minor concrete/driveway cracks, vegetation touching the structure, cosmetic wall-covering damage, condensate line flushing, an unleveled condenser. A grouped write-up whose EVERY numbered condition is this kind of upkeep is "maintenance".

- "recommendation" — the default (~70%): genuine defects needing a qualified contractor to evaluate or repair, without immediate danger and short of major-system failure — aging (but working) systems, roof wear with life left, corrosion, moisture EVIDENCE or history without active damage, wood-destroying insect damage, isolated wiring corrections, panel rust, a few fogged window seals, trim rot, drainage and grading corrections.

PLACEMENT ("item"): every group also carries an "item" — the Spectora item the write-up is filed under, chosen EXACTLY from that section's AVAILABLE ITEMS list given in the input (copy the name verbatim). Follow his real placements:
- A write-up about one area goes in that area's item: exterior concrete -> "Walkways, Patios & Driveways"; exterior stairs/guardrails -> "Decks, Balconies, Porches & Steps"; drainage/fences/grading -> "Vegetation, Grading, Drainage & Retaining Walls"; windows/doors/trim -> "Windows & Doors"; chimney -> the Skylights/Chimneys item; water heater -> "Hot Water Systems, Controls, Flues & Vents"; sump pump -> "Sump Pump".
- A consolidated whole-SYSTEM write-up goes in the section's "... General" item when the list has one (e.g. "Roofing General", "Plumbing General", "Electrical General", "Structural General").

OUTPUT: plain text only — no markdown, bold, italics, or decorative bullets. Return ONLY the structured object requested: property_overview (string) and groups (array of {section, heading, body, severity, item}). In each group, "section" must be EXACTLY one of the section names given in the input (e.g. "Roof", "Exterior") — never an item name, and never a combined "Section › Item" string. Use ONLY the findings provided; do not invent conditions.`;
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
    const items = sectionItems(g.section);
    const itemsLine = items.length
      ? `\nAVAILABLE ITEMS: ${items.join(" | ")}`
      : "";
    return `SECTION ${i} — ${g.section} (${g.findings.length} finding${
      g.findings.length === 1 ? "" : "s"
    })${itemsLine}\n${lines}`;
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
          item: { type: "string" },
          heading: { type: "string" },
          body: { type: "string" },
          severity: {
            type: "string",
            enum: ["safety", "recommendation", "maintenance"],
          },
        },
        required: ["section", "item", "heading", "body", "severity"],
      },
    },
  },
  required: ["property_overview", "groups"],
} as const;
