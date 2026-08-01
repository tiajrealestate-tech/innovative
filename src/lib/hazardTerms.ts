// =============================================================================
// HAZARD TERMS — words whose presence IS the finding.
// -----------------------------------------------------------------------------
// "Possible polybutylene supply piping" carries the whole weight of a plumbing
// write-up: the material's failure history is why the inspector rates it a
// safety hazard and titles the write-up after it. Generalising it to "a mixture
// of piping materials" keeps the sentence and destroys the finding — and no
// coverage check based on counting findings can see that happen.
//
// So these specific terms are tracked by NAME from the transcript all the way
// through to the composed write-ups. If the inspector said one and the output
// doesn't, something was lost and the step is retried.
// =============================================================================

export const HAZARD_TERMS = [
  "polybutylene",
  "poly-b",
  "asbestos",
  "lead paint",
  "lead pipe",
  "radon",
  "termite",
  "wood-destroying",
  "wdi",
  "carbon monoxide",
  "gas odor",
  "gas leak",
  "mold-like",
  "aluminum wiring",
  "knob and tube",
  "federal pacific",
  "zinsco",
  "kitec",
  "galvanized",
  "cast iron",
  // Not a hazardous material, but the same guarantee applies: when the
  // inspector says it, the report must carry it. His habitual chimney-sweep
  // recommendation was dropped on two houses when dictated mid-information.
  "chimney sweep",
] as const;

/**
 * The subset safe to check against a RAW TRANSCRIPT. "Galvanized" and
 * "cast iron" are routinely dictated as pipe/drain MATERIALS (information, not
 * findings), so checking them against the transcript forces a retry that can
 * never succeed — which is exactly how a 6th St extraction ran two full passes
 * and timed out. They stay in the full list, which is only compared against
 * finding text, where their presence really does mean a deficiency mentioned
 * them.
 */
export const CRITICAL_HAZARD_TERMS = HAZARD_TERMS.filter(
  (t) => t !== "galvanized" && t !== "cast iron"
);

/**
 * Terms the source text mentions that the produced text does not. Matching is
 * plain substring on lowercased text — these are distinctive words, so that is
 * precise enough and cannot silently fail the way a model self-check can.
 */
// Synonym groups: naming ANY member in the output satisfies the whole group.
// Without this, prose that says "termite (wood-destroying insect)" still
// "misses" the acronym WDI — which appended a duplicate write-up on a real run.
const TERM_GROUPS: string[][] = [
  ["termite", "wood-destroying", "wdi"],
  ["gas odor", "gas leak"],
  ["polybutylene", "poly-b"],
];
function groupFor(term: string): string[] {
  return TERM_GROUPS.find((g) => g.includes(term)) || [term];
}

export function droppedHazardTerms(
  source: string,
  produced: string,
  terms: readonly string[] = HAZARD_TERMS
): string[] {
  const src = (source || "").toLowerCase();
  const out = (produced || "").toLowerCase();
  const missing: string[] = [];
  const reported = new Set<string>();
  for (const term of terms) {
    if (!src.includes(term)) continue;
    const group = groupFor(term);
    if (group.some((g) => out.includes(g))) continue;
    const key = group[0];
    if (reported.has(key)) continue;
    reported.add(key);
    missing.push(term);
  }
  return missing;
}
