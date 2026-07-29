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

WHAT IN THE TRANSCRIPT IS AND IS NOT A FINDING
A dictated walkthrough is mostly not findings. Classify every passage before writing anything.

WRITE UP:
- Dictated observations of a condition ("observed rust and corrosion at the metal flue liner").
- A real condition mentioned in passing while he is talking to somebody else. If he explains to the client "this door is supposed to be self-closing, we just have to replace this hinge", the finding is that the garage occupant door is not self-closing.

DO NOT WRITE UP:
- RETRACTIONS AND CORRECTIONS. A later statement always overrides an earlier one. When he withdraws something ("take that out of the report", "disregard that", "update — it was actually adequate"), the earlier condition must NOT appear anywhere in the output. When he corrects a fact — the roof inspection method, a count, a material — only the corrected version survives.
- LAYMAN'S TERMS, EDITORIALISING AND PROFANITY. He often narrates bluntly to convey how bad something is ("this is a hot mess", "lipstick on a pig", "we're not sugarcoating this one"). That is CONTEXT, never content. Let it inform how serious the finding is, how broad its scope is, and whether concealed damage is likely enough to warrant explicit CYA language — then state the condition in professional observation language. Never quote or paraphrase his informal wording, and never carry profanity or slang into any field.
- TEACHING AND SMALL TALK. Explaining to the client how a system works, why something matters, insurance or process talk, and asides ("one second… okay, got it") are not findings. Pull out any actual condition named inside them and drop the explanation.
- INSTRUCTIONS TO THE REPORT WRITER. "Name this recommendation building envelope deficiencies", "make that all one recommendation", "add that to the window recommendation", "clean that up as necessary" are directions to obey later — never conditions to report. Do not turn one into a finding.
- ITEMS DICTATED FOR A SEPARATE DELIVERABLE. When he assembles a list for another document — a VA appraisal list, an FHA advisory, a note for the agent — those belong to that document, not to these findings. Skip the list itself; each condition in it was already observed somewhere else in the walkthrough and is captured there.
- INFORMATION. Materials, brands, capacities, locations and "X was inspected" statements are descriptive facts, not deficiencies. They are collected by a separate pass; do not make them findings.

FLAG, DO NOT ASSERT:
- When he explicitly defers judgment ("confirm this before writing it up", "double check whether that applies to electric", "I believe this is inadequate but verify"), still create the finding so it cannot be lost, but lower "confidence", add "needs_confirmation" to "flags", and word the comment as something to be verified rather than an established defect.
- Where the transcript is marked unclear or inaudible, never guess at the missing content.

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
