// -----------------------------------------------------------------------------
// Which Spectora "Recommendation" dropdown entry accompanies a finding.
// Trever's rule (08/2026): the dropdown must name the actual professional the
// comment recommends — scroll and pick the real one; only when the list has no
// match is the generic "Qualified Professional" acceptable. The comment text
// still names the professional in the paragraph either way.
//
// The label returned here is a best-effort TARGET; the extension matches it
// against the dropdown options actually on screen (exact → starts-with →
// contains) and falls back to the generic option itself, so a label that
// doesn't exist in his list degrades safely.
// -----------------------------------------------------------------------------

const PRO_RULES: Array<[RegExp, string]> = [
  [/structural engineer/i, "Structural Engineer"],
  [/chimney sweep/i, "Chimney Sweep"],
  [/chimney/i, "Chimney Repair Contractor"],
  [/electrician|electrical contractor/i, "Electrical Contractor"],
  [/plumber|plumbing contractor/i, "Plumbing Contractor"],
  [/hvac/i, "HVAC Contractor"],
  [/roofer|roofing/i, "Roofing Contractor"],
  [/waterproof/i, "Waterproofing Contractor"],
  [/foundation/i, "Foundation Contractor"],
  [/concrete/i, "Concrete Contractor"],
  [/mason/i, "Masonry Contractor"],
  [/deck contractor|deck\b/i, "Deck Contractor"],
  [/fence/i, "Fence Contractor"],
  [/drywall/i, "Drywall Contractor"],
  [/floor/i, "Flooring Contractor"],
  [/fireplace/i, "Fireplace Contractor"],
  [/garage door/i, "Garage Door Contractor"],
  [/window/i, "Window Contractor"],
  [/\bdoor\b/i, "Door Repair and Installation Contractor"],
  [/driveway/i, "Driveway Contractor"],
  [/gutter/i, "Gutter Contractor"],
  [/landscap|tree service|arborist|vegetation/i, "Landscaping Contractor"],
  [/paint/i, "Painting Contractor"],
  [/appliance/i, "Appliance Repair"],
  [/pest|termite|wood.?destroying/i, "Pest Control"],
  [/mold|asbestos|radon|environmental/i, "Environmental Contractor"],
  [/siding/i, "Siding Contractor"],
  [/insulation/i, "Insulation Contractor"],
  [/carpent/i, "Carpentry Contractor"],
  [/handyman/i, "Handyman"],
];

const GENERIC = "Qualified Professional";

/**
 * Derive the dropdown professional from a finding's own words — the comment's
 * "Recommend … by a qualified X" plus the recommendation_type phrase.
 */
export function proForText(...texts: Array<string | null | undefined>): string {
  const hay = texts.filter(Boolean).join(" ");
  for (const [re, label] of PRO_RULES) {
    if (re.test(hay)) return label;
  }
  return GENERIC;
}
