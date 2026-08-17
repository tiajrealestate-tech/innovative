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

// Labels below are Spectora's REAL dropdown entries, captured from screenshots
// of the live list (08/2026). Order matters: specific before broad.
const PRO_RULES: Array<[RegExp, string]> = [
  [/structural engineer/i, "Structural Engineer"],
  [/chimney sweep/i, "Chimney Sweep"],
  [/chimney/i, "Chimney Repair Contractor"],
  [/electrician|electrical contractor/i, "Electrical Contractor"],
  [/plumber|plumbing contractor/i, "Plumbing Contractor"],
  [/hvac/i, "HVAC Professional"],
  [/heating and cooling|heating contractor|heating professional|boiler|furnace/i, "Heating and Cooling Contractor"],
  [/roofer|roofing/i, "Roofing Professional"],
  [/waterproof/i, "Waterproofing Contractor"],
  [/radon/i, "Radon Mitigation Specialist"],
  [/septic/i, "Septic System Contractor"],
  [/\bwell\b.{0,20}(service|contractor|pump)|well service/i, "Well Service Contractor"],
  [/stucco/i, "Stucco Repair Contractor"],
  [/\bpool\b|spa\b/i, "Swimming Pool / Spa Contractor"],
  [/tile/i, "Tile Contractor"],
  [/solar/i, "Solar Panel Contractor"],
  [/locksmith/i, "Professional Locksmith"],
  [/sheet metal/i, "Sheet Metal Contractor"],
  [/fire suppression|sprinkler/i, "Fire Suppression Contractor"],
  [/cabinet/i, "Cabinet Contractor"],
  [/countertop/i, "Countertop Contractor"],
  [/foundation/i, "Foundation Contractor"],
  [/concrete/i, "Concrete Contractor"],
  [/mason/i, "Masonry Contractor"],
  [/deck contractor|deck\b/i, "Deck Contractor"],
  [/fence/i, "Fence Contractor"],
  [/drywall/i, "Drywall Contractor"],
  [/carpet clean/i, "Carpet Cleaner"],
  [/floor/i, "Flooring Contractor"],
  [/fireplace/i, "Fireplace Contractor"],
  [/garage door/i, "Garage Door Contractor"],
  [/window/i, "Window Repair and Installation Contractor"],
  [/\bdoor\b/i, "Door Repair and Installation Contractor"],
  [/driveway|paving|hardscape/i, "Driveway Contractor"],
  [/gutter/i, "Gutter Contractor"],
  [/tree service|arborist|tree limb|overhanging (limb|branch)|\btree\b/i, "Tree Service"],
  [/grading|regrad/i, "Grading Contractor"],
  [/lawn/i, "Lawncare Professional"],
  [/landscap|vegetation/i, "Landscaping Contractor"],
  [/paint/i, "Painting Contractor"],
  [/appliance/i, "Appliance Repair"],
  [/pest|termite|wood.?destroying/i, "Pest Control Pro"],
  [/mold remediation|remediation contractor|mold/i, "Mold Remediation Contractor"],
  [/asbestos|environmental/i, "Environmental Contractor"],
  [/energy (audit|assessment|contractor)/i, "Home Energy Contractor"],
  [/utility company|service (line|drop|entrance).{0,40}utility/i, "Utility Company"],
  [/association|\bhoa\b|governing documents/i, "Homeowners Association"],
  [/inquire with (the )?seller|ask the seller|confirm with (the )?seller/i, "Inquire With Seller"],
  [/siding/i, "Siding Contractor"],
  [/insulation/i, "Insulation Contractor"],
  [/carpent/i, "Carpentry Contractor"],
  [/handyman/i, "Handyman"],
  [/general contractor/i, "General Contractor"],
  [/builder/i, "Builder"],
  [/cleaning service|professional(ly)? clean/i, "Cleaning Service"],
  // Only when nothing above matched and the finding is a watch-item.
  [/recommend monitor|monitoring/i, "Monitor"],
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

/**
 * The dropdown professional for a WRITE-UP, per Trever's rule (08/2026,
 * "keep it simpler"): a GROUPED write-up (numbered deficiency list) spans
 * trades, so no single dropdown entry is honest — it always gets the generic
 * "Qualified Professional" and the closing paragraph carries the specifics.
 * A stand-alone write-up gets the professional its own closing "Recommend …"
 * paragraph names (the closing governs — mid-body mentions of other systems
 * must not hijack the pick).
 */
export function proForWriteup(body: string, ...extra: Array<string | null | undefined>): string {
  const text = body || "";
  if (/observed deficiencies include:/i.test(text)) return GENERIC;
  const i = text.lastIndexOf("Recommend");
  return proForText(i >= 0 ? text.slice(i) : text, ...extra);
}
