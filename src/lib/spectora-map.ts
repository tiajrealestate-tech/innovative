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

// Gather, for each finding, the boxes it could plausibly map to. We give the
// matcher the finding's own item first (Defects + Limitations), falling back to
// the whole section so a match is still reachable when the item name differs.
export function withCandidates(findings: Finding[]): FindingWithCandidates[] {
  return findings.map((f) => {
    const resolved = getItem(f.section, f.subsection || "");
    const item = resolved?.item || f.subsection || "";
    const candidates = candidateBoxes(f.section, f.subsection, {
      tabs: ["Defects", "Limitations"],
      sectionFallback: true,
    });
    return { finding: f, item, candidates };
  });
}

// ---- AI matcher prompt ------------------------------------------------------

export function buildMapSystemPrompt(): string {
  return `You are the mapping engine for a home-inspection tool. Each FINDING was dictated by an inspector and written in their narrative voice. Your job is to match each finding to the SINGLE best pre-written Spectora checkbox from the CANDIDATES provided for that finding — the checkbox whose meaning matches the finding.

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
  raw: MapRawMatch[]
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
        reason: m?.reason || "No matching checkbox found.",
        needs_review: true,
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

/** The pasteable build list for the extension. Skips unmatched findings. */
export function toExtensionLines(mapped: MappedFinding[]): string {
  return mapped
    .filter((m) => m.box_label)
    .map((m) => `${m.section} > ${m.item} > ${m.tab} > ${m.box_label}`)
    .join("\n");
}
