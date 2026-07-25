// -----------------------------------------------------------------------------
// Report taxonomy — matched to Innovative Home Inspections' actual Spectora
// template. Section order and names are taken verbatim from Trever's Table of
// Contents; the subsection ("item") names are the real ones pulled from 80
// findings across 5 of his reports, plus a few common items for coverage.
//
// STRUCTURE (matches the data model):
//   section     -> the top-level Spectora section  (e.g. "Electrical")
//   subsection  -> the Spectora item               (e.g. "Lighting Fixtures, Switches & Receptacles")
//   component   -> the specific thing              (e.g. "kitchen GFCI outlet")  (free text)
//
// SECTION_ORDER controls output ordering so it lines up top-to-bottom with how
// Spectora lists his sections. To adapt this app to a DIFFERENT inspector or a
// different software later, this one file is what you swap.
// -----------------------------------------------------------------------------

export interface TaxonomySection {
  section: string;
  /** Typical subsections / items. The AI may use others; this is guidance. */
  subsections: string[];
}

export const TAXONOMY: TaxonomySection[] = [
  {
    section: "Roof",
    subsections: [
      "Coverings",
      "Roof Drainage Systems",
      "Flashings",
      "Skylights, Chimneys & Other Roof Penetrations",
      "Roofing General",
    ],
  },
  {
    section: "Exterior",
    subsections: [
      "Siding, Flashing & Trim",
      "Exterior Windows",
      "Exterior Doors",
      "Decks, Balconies, Porches & Steps",
      "Walkways, Patios & Driveways",
      "Eaves, Soffits & Fascia",
      "Vegetation, Grading, Drainage & Retaining Walls",
      "Windows & Doors",
      "Basement Walkout",
      "Exterior General",
    ],
  },
  {
    section: "Basement, Foundation, Crawlspace & Structure",
    subsections: [
      "Basements & Crawlspaces",
      "Foundation",
      "Structural Components",
      "Structural General",
    ],
  },
  {
    section: "Heating",
    subsections: [
      "Equipment",
      "Distribution Systems",
      "Normal Operating Controls",
      "Flues & Vents",
      "HVAC General",
    ],
  },
  {
    section: "Cooling",
    subsections: ["Cooling Equipment", "Distribution System"],
  },
  {
    section: "Plumbing",
    subsections: [
      "Main Water Shut-off Device",
      "Water Supply, Distribution Systems & Fixtures",
      "Drain, Waste, & Vent Systems",
      "Hot Water Systems, Controls, Flues & Vents",
      "Fuel Storage & Distribution",
      "Sump Pump",
      "Plumbing General",
    ],
  },
  {
    section: "Electrical",
    subsections: [
      "Service Entrance Conductors",
      "Service & Grounding",
      "Main & Subpanels, Service & Grounding, Main Overcurrent Device",
      "Branch Wiring Circuits, Breakers & Fuses",
      "Lighting Fixtures, Switches & Receptacles",
      "GFCI & AFCI",
      "Smoke & CO Detectors",
      "Electrical General",
    ],
  },
  {
    section: "Fireplace",
    subsections: ["Cleanout Doors & Frames", "Fireplace", "Chimney"],
  },
  {
    section: "Doors, Windows & Interior",
    subsections: [
      "Doors",
      "Windows",
      "Floors, Walls, Ceilings",
      "Stairs, Steps, Stoops, Stairways & Ramps",
      "Switches, Fixtures & Receptacles",
      "Presence of Smoke and CO Detectors",
    ],
  },
  {
    section: "Attic, Insulation & Ventilation",
    subsections: [
      "Structural Components & Observations in Attic",
      "Insulation",
      "Ventilation",
      "Exhaust Systems",
    ],
  },
  {
    section: "Bathrooms",
    subsections: [
      "Sinks, Tubs & Showers",
      "Bathroom Toilets",
      "Cabinetry, Ceiling, Walls & Floor",
      "Bathroom Exhaust Fan / Window",
      "GFCI & Electric in Bathroom",
    ],
  },
  {
    section: "Laundry",
    subsections: [
      "Clothes Washer",
      "Dryer",
      "Ventilation",
      "Plumbing & Hookups",
    ],
  },
  {
    section: "Kitchen",
    subsections: [
      "Kitchen Sink",
      "Cabinets & Countertops",
      "Garbage Disposal",
      "Range/Oven/Cooktop",
      "Dishwasher",
      "Refrigerator",
      "Ventilation",
    ],
  },
  {
    section: "Garage",
    subsections: [
      "Garage Door & Opener",
      "Occupant Door (From garage to inside of home)",
      "Ceiling & Firewall",
      "Floor",
    ],
  },
  {
    section: "General Overview",
    subsections: ["General"],
  },
  {
    section: "Radon Results",
    subsections: ["Results"],
  },
];

export const SECTION_ORDER: string[] = TAXONOMY.map((t) => t.section);

/** Order index for a section name (case-insensitive). Unknown sections sort last. */
export function sectionOrderIndex(section: string): number {
  const idx = SECTION_ORDER.findIndex(
    (s) => s.toLowerCase() === (section || "").toLowerCase()
  );
  return idx === -1 ? 999 : idx;
}

/**
 * A compact text version of the taxonomy for the AI prompt. Keeps the model
 * anchored to these exact section/item names so its output matches the report.
 */
export function taxonomyForPrompt(): string {
  return TAXONOMY.map(
    (t) => `- ${t.section}: ${t.subsections.join(", ")}`
  ).join("\n");
}
