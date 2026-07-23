// -----------------------------------------------------------------------------
// Recommendation types — phrased to match how Trever actually writes them in
// his reports ("Recommend a qualified plumber evaluate and install.",
// "Recommend monitoring.", "Recommend sealing and patching.", etc.).
//
// The AI picks the closest match, but the field is free text so it (and the
// inspector) can write anything. Kept in one place for the review dropdown and
// for future mapping into inspection software.
// -----------------------------------------------------------------------------

export const RECOMMENDATION_TYPES: string[] = [
  "Recommend a qualified electrician evaluate and repair",
  "Recommend a qualified plumber evaluate and repair",
  "Recommend a qualified HVAC contractor evaluate and repair",
  "Recommend a qualified roofing contractor evaluate and repair",
  "Recommend a qualified contractor evaluate and repair",
  "Recommend a structural engineer evaluate",
  "Recommend further evaluation by a qualified specialist",
  "Recommend sealing and patching",
  "Recommend servicing / routine maintenance",
  "Recommend installing",
  "Recommend monitoring",
  "Correct as needed",
];
