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
import { candidateBoxes, sectionItems } from "./catalog";

export type ReportStyle = "standard" | "trever-2026";

export interface ComposedGroup {
  section: string;
  heading: string; // ALL CAPS, e.g. "ROOF DEFICIENCIES"
  body: string; // framing + numbered list + consolidated recommendation
  /** Spectora item this write-up should be placed in (filled in server-side). */
  item?: string;
  /** Spectora rating chip: safety | recommendation | maintenance. */
  severity?: "safety" | "recommendation" | "maintenance";
  /**
   * Set only for a STAND-ALONE deficiency that an existing library checkbox
   * already covers. When present the tool ticks that box (which pulls in the
   * inspector's own stored wording) instead of typing a custom comment.
   */
  box_label?: string | null;
  /** Indexes of the [F#] findings this write-up covers — lets the server verify none were lost. */
  finding_indexes?: number[];
}
export interface ComposedReport {
  style: ReportStyle;
  property_overview: string;
  groups: ComposedGroup[];
  /**
   * Investor mode only: indexes of [F#] findings that are purely cosmetic and
   * belong in the separate cosmetic punch list document, not in report
   * write-ups. Counted as covered by the coverage check.
   */
  punch_list_indexes?: number[];
}

/** Who the report is written for. "investor" = his Melissa style, learned
 *  from 7 of the 50 studied reports (repeat investor client). */
export type ReportAudience = "standard" | "investor";

// ---- prompt -----------------------------------------------------------------

export function buildComposeSystemPrompt(
  audience: ReportAudience = "standard"
): string {
  const investorBlock =
    audience === "investor"
      ? `

INVESTOR REPORT MODE — his "Melissa" style, learned from 7 of his published reports for a repeat investor client. Severity ratings, grouping rules and every check below stay EXACTLY the same; only these things change:
- THE READER IS THE FUTURE SELLER, not a home buyer. She will repair the property and list it. Never address "the buyer" as the client; future buyers appear only as a concern to pre-empt.
- Say "prior to listing" (or "prior to resale") wherever the standard style says "prior to closing".
- Close grouped recommendations with his recurring investor payoff, varied lightly: completing the work "will help reduce potential buyer concerns during the inspection process and enhance overall market readiness." His other recurring closers: "reduce future inspection findings, repair requests, negotiations, and transaction delays"; "prevent continued deterioration"; "improve overall market readiness".
- PURELY COSMETIC items go to the SEPARATE cosmetic punch list document, not into report write-ups: put their [F#] numbers in "punch_list_indexes" and leave them out of every group. Purely cosmetic = appearance only, zero functional/safety/moisture implication (paint scuffs, worn finishes, cosmetic trim dings, minor cosmetic drywall blemishes). When in doubt it is NOT cosmetic — anything touching function, water, safety or a system stays in the report.
- The Property Conditions Overview opens from the investor perspective ("From an investor perspective, the property would benefit from targeted corrective work prior to listing…") and may note that cosmetic deficiencies are documented separately within the cosmetic punch list.`
      : "";
  return `${HOUSE_STYLE}${investorBlock}

TASK — GROUPED REPORT RECOMMENDATIONS
You are given the inspection's findings as field notes. Produce the completed report recommendations in the DEFAULT grouped format, plus a Property Conditions Overview. Write in the first person.
${audience === "standard" ? 'Return "punch_list_indexes" as an empty array — it is used only in investor mode.' : ""}

HOW AGGRESSIVELY TO GROUP — THIS IS THE MOST IMPORTANT INSTRUCTION
A finished report for an entire house contains roughly SIX TO TEN recommendations in total — not one per observation. Consolidate hard: all of a system's deficiencies become ONE recommendation whose numbered list carries the individual conditions. For example, a single "EXTERIOR MAINTENANCE DEFICIENCIES" recommendation properly contains cracked driveways, mortar deterioration, damaged hose bibbs, deteriorated trim and siding, fencing deterioration, overhanging limbs, and a missing sewer cleanout cap — nine separate observations in one write-up, not nine write-ups.
- Default to ONE recommendation per major system (Roof, Exterior, Basement/Foundation/Crawlspace, Heating/HVAC, Cooling, Plumbing, Electrical, Doors/Windows/Interior, Attic, Bathrooms, Laundry, Kitchen, Garage).
- You MAY group by THEME across sections when the conditions share a cause and a fix — e.g. a single "WATER MANAGEMENT & SUSPECTED CRAWL SPACE MOISTURE INTRUSION" write-up covering negative grading, downspouts terminating at the foundation, efflorescence, elevated moisture readings, and blocked crawl space vents.
- ROOM BEATS TRADE. A cross-section theme group is for a shared CAUSE (water management, life safety), never for collecting same-trade items. Fixture conditions observed in a room — bathroom sinks/tubs/showers/toilets, the kitchen sink, laundry hookups — stay in that ROOM's section (Bathrooms, Kitchen, Laundry) and group with that room's other deficiencies. The Plumbing section carries SYSTEM-LEVEL conditions only: supply piping and materials, drain/waste/vent lines, sewer, sump pump, water heater. Two bathroom leaks + a sewer line problem is NEVER one plumbing group — it is a Bathrooms group and a Plumbing group. This is how every one of his published reports files them.
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
- CROSS-CUTTING SAFETY GROUP. Safety devices and fall protection are scattered around a house and belong to no single system, so they are the findings most often lost when consolidating. Collect them into ONE write-up titled "Safety Deficiencies" and place it in "Interior (General)" — loose or missing handrails and guardrails, outdated/missing/inoperable smoke and CO detectors, a garage occupant door that is not self-closing, obstructed or painted fire-sprinkler heads, missing fire separation. Rate it "safety". This is his real pattern; on one house his Safety Deficiencies group held exactly those four things. Never drop one of these because it doesn't fit a system section.
- COVERAGE IS ABSOLUTE AND IS CHECKED. Every finding is numbered [F0], [F1], … Each write-up must list in "finding_indexes" the numbers of the findings it covers, and EVERY number must appear in exactly one write-up. The tool verifies this and rejects the answer if any number is missing, so a dropped finding costs a full retry. Consolidating means FEWER WRITE-UPS, NEVER FEWER CONDITIONS. If a finding fits nowhere else, put it in the section's General item rather than losing it. NAMING A HAZARDOUS MATERIAL IS THE FINDING. If a finding names polybutylene, asbestos, lead, radon, wood-destroying insects, aluminium wiring, knob-and-tube, a mold-like substance, carbon monoxide or a gas odor, the write-up MUST use that term explicitly — "a mixture of piping materials" in place of "possible polybutylene" destroys the finding even though the condition is technically mentioned. These are checked by name and rate as he rates them.
ROUTINE SERVICE RECOMMENDATIONS COUNT. "Recommend a chimney sweep before use", "have the system serviced", "recommend cleaning the gutters" are real findings he reports — usually as a stand-alone matched to a library checkbox. Never discard one for being minor.
- MULTI-UNIT BUILDINGS (2–4 units — still residential). His real 4-unit report is the model; its shape:
  * BUILDING-WIDE systems group exactly like a single-family report, one write-up per system in its normal section — the building has one roof, one exterior, one foundation. His: Roof and Roof Drainage; Chimney; Exterior Wall System; Exterior Door and Entrance; Rear Egress System; Vegetation, Driveway and Grounds; Basement General; Basement Moisture and Mold-Like Substance; Structural Movement.
  * EACH UNIT gets ONE consolidated write-up titled "UNIT 1 RECOMMENDATIONS", "UNIT 2 RECOMMENDATIONS", … filed in "Doors, Windows & Interior" › "Interior (General)". Everything specific to that unit — its kitchen, bathrooms, laundry, interior doors, fixtures, appliances — goes in that unit's numbered list (his ran 11 to 19 items per unit). Use the findings' unit tags; never mix two units in one list and never scatter a unit's findings across system sections.
  * COMMON AREAS get their own write-up ("Common Area Deficiencies").
  * The cross-cutting safety group is titled "LIFE SAFETY DEFICIENCIES" (missing/outdated detectors anywhere in the building, common-hallway detectors, fire extinguisher provisions, egress hazards) — rate it safety.
  * A dictated statement like "all equipment is essentially the same — five Goodman heat pumps, five Rheem water heaters" is INFORMATION to note once, not a deficiency.
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

PROPERTY CONDITIONS OVERVIEW: match his published overviews EXACTLY in shape — 2 to 3 short paragraphs, 120–200 words TOTAL. Never exceed 200 words; his overviews are tight and yours have run long.
  * Paragraph 1 — the verdict: what the overall pattern of conditions shows ("Overall, the property appears to be in good condition with…" / "The property exhibits multiple significant deficiencies associated with aging systems, deferred maintenance…"). Tone set by the house: reassuring for a clean one, direct for a rough one. On a rough house, note that the volume/severity of deficiencies means buyers should anticipate concealed conditions.
  * Paragraph 2 — the priorities: one sentence recommending qualified contractor evaluations where warranted, then "Particular attention should be directed toward…" naming ONLY the top systems (roof, structure, moisture, electrical, HVAC, plumbing — whichever apply), as a list inside one sentence.
  * Optional closing sentence: what addressing the noted items achieves ("…will help improve overall performance, functionality, and long-term property condition.").
  Do NOT repeat individual recommendations, introduce new findings, name specific contractors, declare the property safe or structurally sound, give negotiation advice, or over-praise.

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
  BE SPARING: a typical report carries 1–4 of these (a truly distressed property can carry more, but that is rare). Rate the write-up by its DOMINANT character — one scary-sounding line inside an otherwise routine group does NOT make the group "safety".
  CALIBRATION — two of his real builds, to be matched:
  * A heavily-defective house (1 maintenance / 14 recommendation / 4 safety): SAFETY only for structural movement concerns, water heater exhaust-venting deficiencies, system-wide plumbing deficiencies, and a gas odor at the range. RECOMMENDATION for everything else — including the exterior stairway/guardrail group (despite trip-and-fall language), basement moisture, wood-destroying insect damage, drainage, window/door/trim, roof and chimney, sump pump, abandoned service wiring, and the electrical system group. MAINTENANCE for the cooling write-up.
  * A mid-condition house (0 maintenance / 11 recommendation / 3 safety): SAFETY only for suspected polybutylene supply piping, the electrical system group, and the cross-cutting "Safety Deficiencies" group. RECOMMENDATION for the deck framing and ledger group, basement moisture, upper-level moisture and cracking, roof and chimney, skylights, exterior trim, walkways, windows, and the interior/appliance groups.
  * A distressed house with pervasive substandard work (0 maintenance / 4 recommendation / 5 safety): SAFETY for the building-envelope group (widespread gaps and improper installation across the ENTIRE exterior), structural movement and foundation, termite damage, system-wide plumbing, and basement moisture WITH a mold-like substance throughout, humidity above 76%, and prior flood cuts. RECOMMENDATION for grading/site, doors, attic ventilation, and the permit-verification note.
  Note what these three share: EXTENT drives his rating. Localized moisture evidence, deck framing wear, or upper-level cracking are RECOMMENDATIONS even though they sound alarming; the same categories become SAFETY when the condition is systemic — an envelope failing across the whole exterior, moisture with fungal growth saturating a whole level, movement visible throughout the structure. Do not promote a write-up to safety merely because it mentions water, movement, or a trip hazard — and do not hold one at recommendation when the condition pervades the property.

- "maintenance" (Maintenance Item) — routine, low-cost upkeep a homeowner or handyman handles; no contractor diagnosis needed: dirty filters, bulbs, missing/damaged window screens, deteriorating caulk, slow drains, missing stoppers/aerators, minor drips or a loose fixture connection, door hardware (strike plates, stoppers, noticeable gaps, unattached closet doors), loose receptacles or protective covers, debris in gutters, minor concrete/driveway cracks, vegetation touching the structure, cosmetic wall-covering damage, condensate line flushing, an unleveled condenser. A grouped write-up whose EVERY numbered condition is this kind of upkeep is "maintenance".

- "recommendation" — the default (~70%): genuine defects needing a qualified contractor to evaluate or repair, without immediate danger and short of major-system failure — aging (but working) systems, roof wear with life left, corrosion, moisture EVIDENCE or history without active damage, wood-destroying insect damage, isolated wiring corrections, panel rust, a few fogged window seals, trim rot, drainage and grading corrections.

STAND-ALONE DEFICIENCIES THAT ALREADY HAVE A CHECKBOX ("box_label") — this is how he really works:
- His template holds a library of pre-written defect checkboxes. When a STAND-ALONE deficiency (one condition, no numbered list) matches one of the AVAILABLE DEFECT CHECKBOXES listed for its section, he simply ticks that box and lets his own stored wording carry it — he does NOT retype it. Examples of library boxes he ticks this way: "Downspouts Drain Too Close to Property", "Filter Dirty", "Missing Door Stopper", "Bulb Missing", "Loose Connection at Fixture", "Cracked Tiles".
- So for each STAND-ALONE group, if one of that section's AVAILABLE DEFECT CHECKBOXES genuinely matches the condition, set "box_label" to that label copied EXACTLY, and set "item" to the item that box belongs to. Still write the heading and body (they are shown for review), but the tool will tick the box rather than type the comment.
- Set box_label to null when: the write-up is GROUPED (a numbered list of 2+ conditions — those are always custom write-ups, never boxes), or no listed checkbox genuinely matches. Never invent a label, and never force a weak match — a wrong box pulls in the wrong recommendation.

PLACEMENT ("item"): every group also carries an "item" — the Spectora item the write-up is filed under, chosen EXACTLY from that section's AVAILABLE ITEMS list given in the input (copy the name verbatim). HIS RULE, in his own words: two or more deficiencies of like kind stay GROUPED together and are filed in the general category; a stand-alone deficiency is the one that gets singled out under its specific defect item.
- GROUPED write-up (a numbered list of 2+ like-kind conditions): file it in the section's "... General" item when the list has one ("Roofing General", "Plumbing General", "Electrical General", "Structural General", "HVAC General", "Exterior General"). When a section covers distinct areas (Exterior especially), group by area and file each group in that area's item — his real placements: exterior concrete -> "Walkways, Patios & Driveways"; exterior stairs/guardrails -> "Decks, Balconies, Porches & Steps"; drainage/fences/grading -> "Vegetation, Grading, Drainage & Retaining Walls"; windows/doors/trim -> "Windows & Doors".
- STAND-ALONE write-up (one deficiency on its own): file it under the specific item where that defect lives — gas range -> "Range/Oven/Cooktop"; water heater -> "Hot Water Systems, Controls, Flues & Vents"; sump pump -> "Sump Pump"; chimney -> the Skylights/Chimneys item; basement walkout -> "Basement Walkout".

OUTPUT: plain text only — no markdown, bold, italics, or decorative bullets. Return ONLY the structured object requested: property_overview (string) and groups (array of {section, item, heading, body, severity, box_label}). In each group, "section" must be EXACTLY one of the section names given in the input (e.g. "Roof", "Exterior") — never an item name, and never a combined "Section › Item" string. Use ONLY the findings provided; do not invent conditions.`;
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

/**
 * The findings in the exact order they are numbered for the model, so the
 * server can verify afterwards that every one survived into a write-up.
 */
export function flattenForCompose(groups: ComposeGroupInput[]): Finding[] {
  return groups.flatMap((g) => g.findings);
}

export function buildComposeUserPrompt(
  groups: ComposeGroupInput[],
  instructions?: string
): string {
  let n = 0;
  const blocks = groups.map((g, i) => {
    const lines = g.findings.map((f) => `[F${n++}] ${findingLine(f)}`).join("\n");
    const items = sectionItems(g.section);
    const itemsLine = items.length
      ? `\nAVAILABLE ITEMS: ${items.join(" | ")}`
      : "";
    // The section's library defect checkboxes, so a stand-alone deficiency can
    // be ticked rather than retyped.
    const boxes = candidateBoxes(g.section, null, {
      tabs: ["Defects"],
      sectionFallback: true,
    });
    const byItem = new Map<string, string[]>();
    for (const b of boxes) {
      if (!byItem.has(b.item)) byItem.set(b.item, []);
      byItem.get(b.item)!.push(b.label);
    }
    const boxLines = byItem.size
      ? "\nAVAILABLE DEFECT CHECKBOXES:\n" +
        [...byItem.entries()]
          .map(([item, labels]) => `  [${item}] ${labels.join(" | ")}`)
          .join("\n")
      : "";
    return `SECTION ${i} — ${g.section} (${g.findings.length} finding${
      g.findings.length === 1 ? "" : "s"
    })${itemsLine}${boxLines}\n${lines}`;
  });
  const instrBlock = instructions && instructions.trim()
    ? `INSPECTOR INSTRUCTIONS — his raw walkthrough. Read it for DIRECTIONS ONLY; the findings above are the conditions to write up, and nothing here is a new defect.
- OBEY explicit directions about the report: what to name a recommendation ("name this one building envelope deficiencies"), what to combine ("make that all one recommendation", "add that to the window recommendation"), and what to keep separate. These override the default grouping.
- HONOUR RETRACTIONS. A later statement beats an earlier one. Anything he took back ("take that out of the report") must not appear, and a corrected fact replaces the original.
- His blunt, informal narration ("hot mess", "lipstick on a pig", profanity) is CONTEXT for how serious and how broad a write-up should be and whether concealed damage warrants explicit CYA language. Never quote or echo that wording — write in his professional report voice.
- Conversation with the client, teaching, and asides are not content.
- Items he dictates for a SEPARATE deliverable (VA appraisal list, FHA advisory, a note for the agent) belong to that document. Do not create a write-up for the list itself.
"""\n${instructions.trim()}\n"""\n\n`
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
          box_label: { type: ["string", "null"] },
          finding_indexes: { type: "array", items: { type: "integer" } },
        },
        required: [
          "section",
          "item",
          "heading",
          "body",
          "severity",
          "box_label",
          "finding_indexes",
        ],
      },
    },
    punch_list_indexes: { type: "array", items: { type: "integer" } },
  },
  required: ["property_overview", "groups", "punch_list_indexes"],
} as const;
