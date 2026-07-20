// -----------------------------------------------------------------------------
// Recommendation types.
// A curated list of the standard "what should the buyer do" phrases inspectors
// use. The AI is told to pick the closest match, but the field is free text so
// it (and the inspector) can write anything. Kept in one place for reuse in the
// review dropdown and for future mapping into inspection software.
// -----------------------------------------------------------------------------

export const RECOMMENDATION_TYPES: string[] = [
  "Recommend licensed electrician evaluate and repair",
  "Recommend licensed plumber evaluate and repair",
  "Recommend qualified HVAC contractor evaluate and repair",
  "Recommend licensed roofing contractor evaluate and repair",
  "Recommend qualified structural engineer evaluate",
  "Recommend qualified contractor evaluate and repair",
  "Recommend further evaluation by a specialist",
  "Repair or replace",
  "Monitor",
  "Routine maintenance / servicing recommended",
  "Correct as needed",
  "Informational — no action required",
];
