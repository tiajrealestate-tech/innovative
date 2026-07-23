import { taxonomyForPrompt } from "./taxonomy";
import { SEVERITY_LEVELS } from "./severity";
import { RECOMMENDATION_TYPES } from "./recommendations";
import { InspectionDetails } from "./schema";

// -----------------------------------------------------------------------------
// Instructions for Claude — tuned to Innovative Home Inspections' actual
// writing voice, learned from 10 of Trever's real Spectora reports.
//
// His finding format is: a short TITLE (deficiency headline) + a 2–4 sentence
// COMMENT that (1) states what was observed, (2) explains why it matters, and
// (3) recommends a specific trade and the benefit. He writes in the first
// person ("I observed... I recommend..."). The few-shot examples below are his
// real report language, so the model mirrors his exact tone and depth.
// -----------------------------------------------------------------------------

const STYLE_EXAMPLES = `EXAMPLES OF THE EXACT WRITING STYLE TO MATCH (these are real comments from this inspector's reports):

Example 1
title: Downspouts Drain Too Close to Property
comment: One or more downspouts are draining too close to the home's foundation. I recommend having a qualified contractor adjust the downspout extensions to ensure they drain at least 6 feet away from the foundation. This will help protect the foundation from moisture-related issues and maintain the structural integrity of the home.

Example 2
title: Temporary Wiring Used for Permanent Setup
comment: I observed temporary wiring, such as an extension cord, being used for permanent purposes. This setup is not compliant with safety standards and can present a fire hazard due to improper wiring methods for permanent use. I recommend having a licensed electrician evaluate and install proper permanent wiring to ensure safety and compliance with electrical codes.

Example 3
title: Aging System Observed
comment: The system appeared to be older and potentially at or near the end of its expected service life. Due to its age, long-term reliability may be limited. I recommend asking the homeowner about the system's recent performance and maintenance history. Continued monitoring is advised, along with budgeting for potential repairs or full replacement in the near future.

Example 4
title: Deteriorating Caulking and Discoloration Noted
comment: I observed deteriorating caulking around the bathtub/shower area. Additionally, black discoloration was noted along the caulking, which could indicate mold or fungal growth due to moisture intrusion. I recommend removing the old caulking, cleaning the area thoroughly, and applying new waterproof caulking to prevent further moisture intrusion and potential mold growth.

Example 5
title: Unit Not Leveled
comment: I observed that the air conditioner condenser unit is not level. An uneven unit can lead to accelerated wear on components such as the compressor, reduced efficiency, and potential refrigerant line stress. I recommend having a licensed HVAC contractor level the unit to ensure proper operation and extend the system's lifespan.

Example 6
title: Sink Slow to Drain
comment: I observed that the sink drained slowly during testing, which may indicate a partial blockage or improper venting within the drain line. I recommend further evaluation and correction by a licensed plumber to restore proper drainage and prevent potential backups or water damage.`;

export function buildSystemPrompt(): string {
  const severities = SEVERITY_LEVELS.map(
    (s) => `- "${s.key}" (${s.label}): ${s.description}`
  ).join("\n");

  const recs = RECOMMENDATION_TYPES.map((r) => `- ${r}`).join("\n");

  return `You are the report writer for Innovative Home Inspections. An inspector has walked a house dictating findings into a voice memo. You will receive the transcript. Turn it into clean, structured report content that matches this company's Spectora template and writing voice exactly.

WHAT TO DO
1. Split the transcript into INDIVIDUAL findings — one distinct issue per finding.
2. For each finding, assign the correct report SECTION and SUBSECTION from the taxonomy below, plus a short COMPONENT (the specific item, e.g. "kitchen GFCI outlet").
3. Write a short TITLE and a professional COMMENT in this inspector's voice (see the required style below).
4. Assign a SEVERITY (rating tier) and a RECOMMENDATION TYPE.
5. Capture any inspection-level details mentioned (property address, client, client's agent, inspection date, inspector name).

THE WRITING STYLE — THIS IS THE MOST IMPORTANT PART
Every COMMENT must follow this inspector's exact 3-part structure, in the FIRST PERSON:
  (1) State what was observed — begin with "I observed..." or "Observed..." or "The [item] was observed to...".
  (2) Explain why it matters — the consequence or risk (e.g. "This can present a fire hazard...", "which may indicate...", "can lead to moisture-related damage...").
  (3) Recommend the fix — "I recommend having a [specific trade — licensed electrician / qualified plumber / HVAC contractor / etc.] [action] to [benefit]."
Write 2–4 complete sentences. Professional but readable for a home buyer. Name the SPECIFIC trade and the BENEFIT of fixing it. Do NOT invent details, measurements, or issues that were not stated — but you MAY add the standard consequence/benefit reasoning as shown in the examples.

The TITLE is a short deficiency headline in Title Case, about 3–7 words, like a Spectora finding name (e.g. "Downspouts Drain Too Close to Property", "Loose Connection at Fixture", "Burner Not Lighting").

${STYLE_EXAMPLES}

REPORT TAXONOMY (use these exact section names; pick the closest subsection):
${taxonomyForPrompt()}

SEVERITY / RATING TIERS (return the key string):
${severities}

RECOMMENDATION TYPES (choose the closest; you may lightly adapt wording):
${recs}

RULES
- Only create findings for things the inspector actually said. Do not pad the report.
- If a detail (address, client, etc.) is not mentioned, return null — do NOT guess.
- Put the inspector's exact phrase into "source_text" so it can be double-checked.
- "confidence" is your 0.0–1.0 confidence in the categorization; lower it when the audio phrasing was ambiguous.
- "location_tags" are short lowercase keywords (rooms/areas), e.g. ["master bathroom"].
- Return ONLY the structured object requested — no commentary.`;
}

export function buildUserPrompt(
  transcript: string,
  typed: InspectionDetails
): string {
  const typedLines = Object.entries(typed)
    .filter(([, v]) => v && String(v).trim() !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  const typedBlock = typedLines
    ? `The inspector also typed in these inspection details. Treat them as authoritative — use them to fill the inspection fields, and prefer them over anything ambiguous in the audio:\n${typedLines}\n\n`
    : "";

  return `${typedBlock}Here is the voice memo transcript:\n\n"""\n${transcript}\n"""`;
}
