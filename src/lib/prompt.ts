import { taxonomyForPrompt } from "./taxonomy";
import { SEVERITY_LEVELS } from "./severity";
import { RECOMMENDATION_TYPES } from "./recommendations";
import { InspectionDetails } from "./schema";
import { HOUSE_STYLE } from "./houseStyle";

// -----------------------------------------------------------------------------
// Findings-extraction prompt. The HOUSE_STYLE block (Trever's own condensed
// report-writing system prompt) governs all language/CYA/never-fabricate rules;
// this wrapper adds the task-specific job: pull ATOMIC findings (one per
// condition) so each can map to a Spectora checkbox. Grouping into the final
// report happens later in the compose step, so we explicitly do NOT group here.
// -----------------------------------------------------------------------------

export function buildSystemPrompt(): string {
  const severities = SEVERITY_LEVELS.map(
    (s) => `- "${s.key}" (${s.label}): ${s.description}`
  ).join("\n");

  const recs = RECOMMENDATION_TYPES.map((r) => `- ${r}`).join("\n");

  return `${HOUSE_STYLE}

TASK — EXTRACT STRUCTURED FINDINGS
An inspector dictated a walkthrough. Turn the transcript into structured findings for this company's report software. Produce ONE finding per distinct condition — do NOT group them (grouping into the final report is a later step). Remove true duplicates and consolidate the same condition mentioned more than once, but keep genuinely distinct conditions separate.

For each finding:
1. Assign the report SECTION and SUBSECTION from the taxonomy below, plus a short COMPONENT (the specific item/location, e.g. "kitchen GFCI outlet").
2. Write a short, specific TITLE (four or five words or fewer per the TITLES rule; no "Noted") and a concise COMMENT (2–4 sentences) that follows every language, CYA, never-fabricate, mold, structural, and preferred/forbidden-terminology rule above. Factual observation → why it matters (when useful) → an "I recommend …" that names the correct professional and the scope. Vary the openings; do not start every finding the same way.
3. Assign a SEVERITY tier and a RECOMMENDATION TYPE.
4. Capture inspection-level details if mentioned (property address, client, client's agent, inspection date, inspector name); return null for anything not mentioned.

REPORT TAXONOMY (use these exact section names; pick the closest subsection):
${taxonomyForPrompt()}

SEVERITY / RATING TIERS (return the key string):
${severities}

RECOMMENDATION TYPES (choose the closest; you may lightly adapt wording):
${recs}

RULES
- Only create findings for things the inspector actually said. Do not pad the report.
- Put the inspector's exact phrase into "source_text" so it can be double-checked.
- "confidence" is your 0.0–1.0 confidence in the categorization; lower it when the phrasing was ambiguous.
- "location_tags" are short lowercase keywords (rooms/areas), e.g. ["master bathroom"].
- Plain text in all fields (no markdown). Return ONLY the structured object requested — no commentary.`;
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
