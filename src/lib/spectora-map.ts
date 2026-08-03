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
- Prefer a candidate whose tab is "Defects" for a defect; use a "Limitations" candidate only when the finding is about not being able to inspect/access something.
- If NO candidate genuinely matches the finding's meaning, return box_label = null and needs_review = true. Do NOT force a weak match — a wrong box is worse than none, because it pulls in the wrong recommendation.
- confidence is 0.0–1.0 for how sure you are of the match. Set needs_review = true whenever confidence < 0.6 OR box_label is null.
- reason: one short phrase explaining the choice (or why nothing matched).

Return ONLY the structured object requested.`;
}

export function buildMapUserPrompt(items: FindingWithCandidates[]): string {
  const blocks = items.map((x, i) => {
    const cand = x.candidates
      .map((c) => `      - [${c.tab}] ${c.label}`)
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
- WHO WAS PRESENT (the "In Attendance" item): the inspector states this conversationally, usually near the start — "I'm here with the client and their agent" (select Client + Client's Agent), "the listing agent let me in" (Listing Agent), "meeting the buyer and her mom here" (Client + Family Of the Client), "contractor's on site with me" (Contractors). If the ENTIRE transcript never mentions anyone being present at the inspection, select "Just the Inspector" — no mention means he was alone. This default is the ONE exception to the never-guess rule, and it applies only to In Attendance.
- OCCUPANCY: casual remarks carry it — "house is vacant", "place is furnished", "sellers are still living here" (Occupied), "lots of storage everywhere" (Storage in property), "it's staged". Select all that were stated; no default.
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
