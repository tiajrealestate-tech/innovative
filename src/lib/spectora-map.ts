// =============================================================================
// FINDINGS -> SPECTORA CHECKBOX MAPPING
// -----------------------------------------------------------------------------
// The translation layer. Your voice findings are written in your narrative
// voice ("I observed an active leak under the master bath sink"); Spectora's
// boxes are terse library labels ("Active Water Leak"). This module gathers the
// candidate boxes for each finding (from the catalog, scoped to its section +
// item) and asks Claude to pick the single best-matching box — or say there is
// none, so the finding gets flagged for you instead of guessed wrong.
//
// Output feeds the browser extension as "Section > Item > Tab > Label" lines.
// =============================================================================

import { Finding } from "./schema";
import { BoxCandidate, candidateBoxes, getItem } from "./catalog";

export interface FindingWithCandidates {
  finding: Finding;
  item: string; // resolved catalog item name (or the finding's subsection)
  candidates: BoxCandidate[];
}

export interface MappedFinding {
  finding_id: string;
  section: string;
  item: string;
  tab: string; // usually "Defects"
  box_label: string | null; // null => no confident match (needs custom / your pick)
  confidence: number; // 0..1
  reason: string;
  needs_review: boolean;
}

/**
 * How the report is built. Both modes check Information, Limitations and
 * Defects boxes; they differ in how the narrative is produced (grouped
 * write-ups placed in each section's "… General" item vs. relying on each
 * box's own library wording).
 */
export type MapMode = "trever" | "standard";

/**
 * Which tabs the checkbox pass may use. Information and Limitations always
 * apply. Individual DEFECT boxes are optional: Trever's hand-built reports
 * contain no individual defect checkboxes — every defect lives in a
 * consolidated write-up — so ticking them is what inflates a 19-item report to
 * 40+. Turn them on for the common per-defect workflow.
 */
export function tabsForMode(
  mode: MapMode,
  includeDefectBoxes = mode === "standard"
): string[] {
  const tabs = ["Information", "Limitations"];
  if (includeDefectBoxes) tabs.push("Defects");
  return tabs;
}

// Gather, for each finding, the boxes it could plausibly map to. We give the
// matcher the finding's own item first, falling back to the whole section so a
// match is still reachable when the item name differs.
export function withCandidates(
  findings: Finding[],
  mode: MapMode = "trever",
  includeDefectBoxes?: boolean
): FindingWithCandidates[] {
  const tabs = tabsForMode(mode, includeDefectBoxes);
  return findings.map((f) => {
    const resolved = getItem(f.section, f.subsection || "");
    const item = resolved?.item || f.subsection || "";
    const candidates = candidateBoxes(f.section, f.subsection, {
      tabs,
      sectionFallback: true,
    });
    return { finding: f, item, candidates };
  });
}

// ---- AI matcher prompt ------------------------------------------------------

export function buildMapSystemPrompt(mode: MapMode = "trever"): string {
  const modeNote =
    mode === "trever"
      ? `\n\nMODE: this inspector also writes consolidated narrative write-ups for defects, so a finding with no good Defects box is fine — returning box_label = null is correct rather than forcing a weak match, because the narrative already covers it.`
      : "";
  return `You are the mapping engine for a home-inspection tool.${modeNote} Each FINDING was dictated by an inspector and written in their narrative voice. Your job is to match each finding to the SINGLE best pre-written Spectora checkbox from the CANDIDATES provided for that finding — the checkbox whose meaning matches the finding.

RULES
- Choose from the candidate labels EXACTLY as written (copy the label verbatim). Never invent a label.
- Match on MEANING, not wording. "Active leak under the sink" -> "Active Water Leak". "Downspouts dump right next to the house" -> "Downspouts Drain Too Close to Property".
- STORED WORDING IS PLACED VERBATIM. When a candidate shows [stored wording: ...], that exact pre-written text enters the report if the box is ticked — the inspector's stored words are never edited. Only choose that box if its stored wording is ACCURATE for THIS finding. If the stored wording materially contradicts the dictation — a different count ("two or more windows" when ONE window was dictated), a different component, location, cause, or severity — return box_label = null instead, so the finding is carried by a custom write-up in the inspector's dictated words. A box whose label matches but whose stored wording lies about the house is a wrong box.
- Prefer a candidate whose tab is "Defects" for a defect; use a "Limitations" candidate only when the finding is about not being able to inspect/access something.
- If NO candidate genuinely matches the finding's meaning, return box_label = null and needs_review = true. Do NOT force a weak match — a wrong box is worse than none, because it pulls in the wrong recommendation.
- confidence is 0.0–1.0 for how sure you are of the match. Set needs_review = true whenever confidence < 0.6 OR box_label is null.
- reason: one short phrase explaining the choice (or why nothing matched).

Return ONLY the structured object requested.`;
}

export function buildMapUserPrompt(items: FindingWithCandidates[]): string {
  const blocks = items.map((x, i) => {
    const cand = x.candidates
      .map((c) => {
        const w = c.wording
          ? ` [stored wording: ${c.wording.length > 220 ? c.wording.slice(0, 220) + "…" : c.wording}]`
          : "";
        return `      - [${c.tab}] ${c.label}${w}`;
      })
      .join("\n");
    return `FINDING ${i}
  section: ${x.finding.section}
  item: ${x.item}
  title: ${x.finding.title}
  comment: ${x.finding.comment}
  CANDIDATE CHECKBOXES:
${cand || "      (none available for this section)"}`;
  });
  return `Match each finding below to the best candidate checkbox.\n\n${blocks.join(
    "\n\n"
  )}`;
}

// Structured-output schema: one entry per finding, in order.
export const MAP_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          finding_index: { type: "integer" },
          box_label: { type: ["string", "null"] },
          tab: { type: "string" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["finding_index", "box_label", "tab", "confidence", "reason"],
      },
    },
  },
  required: ["matches"],
} as const;

export interface MapRawMatch {
  finding_index: number;
  box_label: string | null;
  tab: string;
  confidence: number;
  reason: string;
}

// Turn the model's matches back into per-finding results, validating that each
// chosen label really is one of that finding's candidates (guards against the
// model inventing or misremembering a label).
export function resolveMatches(
  items: FindingWithCandidates[],
  raw: MapRawMatch[],
  mode: MapMode = "trever"
): MappedFinding[] {
  const byIndex = new Map<number, MapRawMatch>();
  for (const m of raw) byIndex.set(m.finding_index, m);

  return items.map((x, i) => {
    const m = byIndex.get(i);
    const f = x.finding;
    if (!m || m.box_label == null) {
      return {
        finding_id: f.id,
        section: f.section,
        item: x.item,
        tab: "Defects",
        box_label: null,
        confidence: m?.confidence ?? 0,
        reason:
          m?.reason ||
          (mode === "trever"
            ? "No matching box — covered by the written write-up."
            : "No matching checkbox found."),
        // In the Trever method defects intentionally have no checkbox — the
        // narrative carries them — so an unmatched finding isn't a problem.
        needs_review: mode !== "trever",
      };
    }
    // Confirm the label is a real candidate; recover the true tab/item.
    const chosen =
      x.candidates.find((c) => c.label === m.box_label) ||
      x.candidates.find(
        (c) => c.label.toLowerCase() === String(m.box_label).toLowerCase()
      );
    if (!chosen) {
      return {
        finding_id: f.id,
        section: f.section,
        item: x.item,
        tab: "Defects",
        box_label: null,
        confidence: 0,
        reason: "Model chose a label that isn't a real checkbox; flagged.",
        needs_review: true,
      };
    }
    const conf = typeof m.confidence === "number" ? m.confidence : 0;
    return {
      finding_id: f.id,
      section: chosen.section,
      item: chosen.item,
      tab: chosen.tab,
      box_label: chosen.label,
      confidence: conf,
      reason: m.reason || "",
      needs_review: conf < 0.6,
    };
  });
}

/**
 * The pasteable build list for the extension. Only CONFIDENT matches are
 * included: a weak guess would tick the wrong box and pull in the wrong
 * pre-written recommendation, which is worse than leaving it to the write-up.
 */
export function toExtensionLines(mapped: MappedFinding[]): string {
  return mapped
    .filter((m) => m.box_label && !m.needs_review)
    .map((m) => `${m.section} > ${m.item} > ${m.tab} > ${m.box_label}`)
    .join("\n");
}

// -----------------------------------------------------------------------------
// INFORMATION PASS
// -----------------------------------------------------------------------------
// Defect findings never carry descriptive facts ("asphalt shingle roof",
// "200 amp panel", "Carrier furnace", "brick veneer"), so Information boxes were
// being skipped entirely. This pass reads the TRANSCRIPT directly against every
// Information checkbox in the template and returns the ones the inspector
// actually stated.

export function buildInfoSystemPrompt(): string {
  return `You select Information checkboxes for a home inspection report.

You get the inspector's walkthrough transcript and the list of Information checkboxes available in their template (grouped by section and item). Information boxes record descriptive FACTS about the property — materials (asphalt shingles, brick veneer, copper supply lines), equipment brands (Carrier, Rheem), sizes/capacities (200 AMP, 1 1/2"), fuel types, and locations (basement, garage, utility room).

RULES
- Select a checkbox ONLY when the transcript actually states or clearly implies that fact. Never guess a brand, material, size, or location that was not mentioned.
- DETAILS DICTATION: inspectors often read the template's fields aloud as label-value pairs, usually in one block ("Gutter material, aluminum. Flashing material, aluminum. Heating brand, Carrier. Panel capacity, 200 amps. In attendance: buyer, buyer's agent."). Every pair is an EXPLICIT statement of that fact — treat this as the strongest possible evidence and select the matching box for every pair that has one. The spoken field name tells you which item/group the value belongs to, so "gutter material aluminum" selects Aluminum under Roof Drainage Systems, not under Flashings. Match values by meaning when wording differs ("asphalt" -> "Asphalt"; "Bradford and White" -> "Bradford & White"; "below ground" -> "Below Ground"; "200 amps" -> "200 AMP").
- SPOKEN WORDS vs BOX NAMES: dictation vocabulary differs from template labels — translate by role: "buyer" = Client; "buyer's agent" = Client's Agent; "seller" or "owner" (present at inspection) = Home Owner; "seller's agent" = Listing Agent. Apply the same by-meaning translation to any field ("wood-burning" -> Wood, "public water" -> Public/City where such a box exists).
- INSPECTOR COMMANDS: when he says "disregard", "delete that", "do not add", "skip that", or "those are optional" about a field, section, or value, select NOTHING for it — even if a matching box exists. These commands are instructions to you, not property facts.
- "ALL SECTIONS INSPECTED" statements ("all sections under bathrooms inspected", "doors, windows and interior were all inspected") select the "... Inspected"/"... Were Inspected" style Information boxes for that section when such boxes exist in the candidates; they do NOT license selecting any material/brand/type boxes.
- WHO WAS PRESENT (the "In Attendance" checkboxes, under Inspection Details > General): the inspector states this conversationally, usually near the start — "I'm here with the client and their agent" (select Client + Client's Agent), "the listing agent let me in" (Listing Agent), "meeting the buyer and her mom here" (Client + Family Of the Client), "contractor's on site with me" (Contractors). If the ENTIRE transcript never mentions anyone being present at the inspection, select "Just the Inspector" — no mention means he was alone. This default is the ONE exception to the never-guess rule, and it applies only to In Attendance.
- OCCUPANCY: casual remarks carry it — "house is vacant", "place is furnished", "sellers are still living here" (Occupied), "lots of storage everywhere" (Storage in property), "it's staged". Select all that were stated; no default.
- A STATEMENT ABOUT THE WHOLE HOUSE NEVER FILLS IN A SPECIFIC ITEM. "All the appliances run on gas" says NOTHING about the fireplace's fuel type — select a fireplace fuel (Wood, Gas, Electric) only when the fuel is stated for the fireplace itself ("wood-burning fireplace", "gas fireplace insert"). Never infer fuel from a chimney sweep, damper, or screen mention. The same discipline applies to any item: the fact must be about THAT component.
- A COMPONENT THE TRANSCRIPT NEVER MENTIONS GETS NOTHING. If the word for a component never appears anywhere in the transcript ("fireplace" is never said once), select NOTHING for that component's item — no matter how many nearby words appear elsewhere. "Electric water heater" is a fact about the WATER HEATER; "multiple electrical deficiencies" is about the wiring — neither says the home has an electric fireplace. Many properties simply do not have the component; silence means absent, and absent means no boxes.
- EVIDENCE MUST QUOTE THE TRANSCRIPT. Each selection's "evidence" field must quote the actual transcript phrase that states the fact about that specific component (e.g. evidence "gutter material, aluminum" for Roof Drainage Aluminum). If you cannot quote a phrase that names the component together with the fact, the selection is a guess — do not make it.
- A LATER STATEMENT OVERRIDES AN EARLIER ONE. Inspectors correct themselves as they go ("roof inspection method drone" … later "update: from the ground"; "entry door fiberglass" … later "it's actually solid wood"; "three gable vents" … later "update, only two"). Select only the corrected fact, never the superseded one. When he says to remove or delete something, do not select it at all.
- Ignore blunt or informal narration, conversation with the client, and anything dictated for a separate document; select only descriptive facts about the property.
- Copy each label EXACTLY as written in the candidate list, along with its section and item.
- Multiple boxes may apply to one item (e.g. both a material and a fuel type).
- Selecting nothing for an item is correct when the transcript says nothing about it.
- Do not select Defect or Limitation conditions here — only descriptive information.

Return ONLY the structured object requested.`;
}

export function buildInfoUserPrompt(
  transcript: string,
  candidates: BoxCandidate[]
): string {
  const byKey = new Map<string, string[]>();
  for (const c of candidates) {
    const key = `${c.section} > ${c.item}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c.label);
  }
  const listing = [...byKey.entries()]
    .map(([key, labels]) => `${key}\n  ${labels.join(" | ")}`)
    .join("\n");
  return `TRANSCRIPT:\n"""\n${transcript}\n"""\n\nAVAILABLE INFORMATION CHECKBOXES:\n${listing}`;
}

export const INFO_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    selections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: { type: "string" },
          item: { type: "string" },
          label: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["section", "item", "label", "evidence"],
      },
    },
  },
  required: ["selections"],
} as const;

export interface InfoSelection {
  section: string;
  item: string;
  label: string;
  evidence: string;
}

/** Keep only selections that name a real checkbox, and drop duplicates. */
export function resolveInfoSelections(
  candidates: BoxCandidate[],
  raw: InfoSelection[]
): BoxCandidate[] {
  const index = new Map<string, BoxCandidate>();
  for (const c of candidates) {
    index.set(`${c.section}||${c.item}||${c.label}`.toLowerCase(), c);
    index.set(`${c.label}`.toLowerCase(), c);
  }
  const out: BoxCandidate[] = [];
  const seen = new Set<string>();
  for (const r of raw || []) {
    const hit =
      index.get(`${r.section}||${r.item}||${r.label}`.toLowerCase()) ||
      index.get(`${r.label}`.toLowerCase());
    if (!hit) continue;
    const key = `${hit.section}||${hit.item}||${hit.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

export function infoBoxesToLines(boxes: BoxCandidate[]): string {
  return boxes
    .map((b) => `${b.section} > ${b.item} > ${b.tab} > ${b.label}`)
    .join("\n");
}
