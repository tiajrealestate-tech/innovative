// -----------------------------------------------------------------------------
// Report taxonomy — the sections and subsections a home inspection report is
// organized into. This mirrors a standard InterNACHI-style structure, which is
// close to Spectora's default template, but it is deliberately a plain data
// file so it can be swapped or extended per software / per inspector later.
//
// STRUCTURE (matches the data model):
//   section     -> the top-level system or area   (e.g. "Interior")
//   subsection  -> the room or sub-area            (e.g. "Kitchen")
//   component   -> the specific item               (e.g. "Electrical")  (free text)
//
// The order of SECTION_ORDER controls the order findings are displayed in the
// outputs (so they line up with how Spectora lists sections top-to-bottom).
// -----------------------------------------------------------------------------

export interface TaxonomySection {
  section: string;
  /** Typical subsections / rooms. The AI may use others; this is guidance. */
  subsections: string[];
}

export const TAXONOMY: TaxonomySection[] = [
  {
    section: "Roof",
    subsections: ["Coverings", "Flashing", "Gutters & Downspouts", "Skylights", "Chimney"],
  },
  {
    section: "Exterior",
    subsections: [
      "Siding & Trim",
      "Doors & Windows",
      "Decks, Porches & Balconies",
      "Walkways & Driveway",
      "Grading & Drainage",
      "Vegetation & Retaining Walls",
    ],
  },
  {
    section: "Structure & Foundation",
    subsections: ["Foundation", "Crawlspace", "Framing", "Basement"],
  },
  {
    section: "Garage",
    subsections: ["Garage Door & Opener", "Firewall / Ceiling", "Floor", "Occupant Door"],
  },
  {
    section: "Electrical",
    subsections: [
      "Service & Meter",
      "Main Panel",
      "Sub Panel",
      "Branch Wiring",
      "Outlets & Switches",
      "GFCI / AFCI",
      "Smoke & CO Detectors",
    ],
  },
  {
    section: "Plumbing",
    subsections: [
      "Water Supply",
      "Drain, Waste & Vent",
      "Water Heater",
      "Fixtures & Faucets",
      "Fuel Systems",
    ],
  },
  {
    section: "Heating",
    subsections: ["Furnace / Heat Source", "Distribution", "Flue & Venting", "Thermostat"],
  },
  {
    section: "Cooling",
    subsections: ["Air Conditioning / Heat Pump", "Distribution", "Condensate"],
  },
  {
    section: "Interior",
    subsections: [
      "Living Room",
      "Bedrooms",
      "Hallways & Stairs",
      "Walls, Ceilings & Floors",
      "Doors & Windows",
      "Fireplace",
    ],
  },
  {
    section: "Kitchen",
    subsections: ["Cabinets & Countertops", "Sink & Plumbing", "Electrical", "Built-in Appliances", "Ventilation"],
  },
  {
    section: "Bathrooms",
    subsections: ["Master Bathroom", "Full Bathroom", "Half Bathroom", "Fixtures & Plumbing", "Ventilation"],
  },
  {
    section: "Laundry",
    subsections: ["Washer / Dryer Hookups", "Ventilation", "Plumbing"],
  },
  {
    section: "Attic, Insulation & Ventilation",
    subsections: ["Attic Access", "Insulation", "Ventilation", "Exhaust Fans"],
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
 * anchored to these section names so its output lines up with the report.
 */
export function taxonomyForPrompt(): string {
  return TAXONOMY.map(
    (t) => `- ${t.section}: ${t.subsections.join(", ")}`
  ).join("\n");
}
