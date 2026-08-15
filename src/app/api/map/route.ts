import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { InspectionReport } from "@/lib/schema";
import {
  buildMapSystemPrompt,
  buildMapUserPrompt,
  MAP_OUTPUT_SCHEMA,
  MapRawMatch,
  resolveMatches,
  toExtensionLines,
  withCandidates,
  MapMode,
  buildInfoSystemPrompt,
  buildInfoUserPrompt,
  INFO_OUTPUT_SCHEMA,
  InfoSelection,
  resolveInfoSelections,
  infoBoxesToLines,
} from "@/lib/spectora-map";
import { allBoxesOnTab } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro)

// ---------------------------------------------------------------------------
// Deterministic guards on Information selections. The prompt already forbids
// guessing, but "gas water heater" still became Fireplace > Gas twice in the
// field — so the rules get enforced in code, not just asked for:
//  1. The selection's evidence must actually be words from the transcript.
//  2. Component-specific items (fireplace, skylight, pool...) require the
//     component to be mentioned SOMEWHERE in the transcript at all.
// ---------------------------------------------------------------------------
const COMPONENT_GUARDS: Array<{ match: RegExp; requires: RegExp }> = [
  { match: /fireplace/i, requires: /fireplace|hearth|wood.?stove|gas (?:log|insert)/i },
  { match: /skylight/i, requires: /skylight/i },
  { match: /\bpool\b/i, requires: /\bpool\b/i },
  { match: /elevator/i, requires: /elevator/i },
];

function normWords(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3);
}

export function infoSelectionSupported(
  sel: { section: string; item: string; label: string; evidence: string },
  transcript: string
): boolean {
  const tWords = new Set(normWords(transcript));
  // Component guard: an item about a specific component needs that component
  // mentioned in the transcript, full stop.
  const target = `${sel.section} ${sel.item}`;
  for (const g of COMPONENT_GUARDS) {
    if (g.match.test(target) && !g.requires.test(transcript)) return false;
  }
  // Evidence check: most of the evidence quote's words must really occur in
  // the transcript (tolerant of punctuation/casing, hostile to invention).
  const ev = normWords(sel.evidence);
  if (!ev.length) return false;
  const hit = ev.filter((w) => tWords.has(w)).length;
  return hit / ev.length >= 0.6;
}

// POST { report } -> { mapped, lines }
// Maps each finding to the best Spectora checkbox from the scanned catalog.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let report: InspectionReport | null = null;
  let mode: MapMode = "trever";
  let includeDefectBoxes = false;
  try {
    const body = await req.json();
    report = body?.report ?? null;
    if (body?.mode === "standard" || body?.mode === "trever") mode = body.mode;
    if (typeof body?.includeDefectBoxes === "boolean")
      includeDefectBoxes = body.includeDefectBoxes;
  } catch {
    // fall through
  }
  if (!report || !Array.isArray(report.findings) || !report.findings.length) {
    return NextResponse.json(
      { error: "No findings to map." },
      { status: 400 }
    );
  }

  const items = withCandidates(report.findings, mode, includeDefectBoxes);
  const transcript = report.meta?.transcript || "";
  const infoCandidates = allBoxesOnTab("Information");

  try {
    const anthropic = new Anthropic({ apiKey });

    const textOf = (message: any) => {
      const b = (message.content as any[]).find((x) => x.type === "text");
      if (!b?.text) throw new Error("The AI returned an empty response.");
      return b.text as string;
    };

    // Pass 1 — match defect/limitation findings to their boxes.
    const findingPass = anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: buildMapSystemPrompt(mode),
      messages: [{ role: "user", content: buildMapUserPrompt(items) }],
      output_config: {
        format: { type: "json_schema", schema: MAP_OUTPUT_SCHEMA },
        effort: "medium",
      },
    } as any).finalMessage();

    // Pass 2 — Information boxes come from the TRANSCRIPT, not from defect
    // findings (materials, brands, amperage, locations are never deficiencies),
    // which is why they were previously skipped entirely.
    const infoPass =
      transcript && infoCandidates.length
        ? anthropic.messages.stream({
            model: "claude-opus-5",
            max_tokens: 16000,
            system: buildInfoSystemPrompt(),
            messages: [
              { role: "user", content: buildInfoUserPrompt(transcript, infoCandidates) },
            ],
            output_config: {
              format: { type: "json_schema", schema: INFO_OUTPUT_SCHEMA },
              effort: "medium",
            },
          } as any).finalMessage()
        : Promise.resolve(null);

    const [findingMsg, infoMsg] = await Promise.all([findingPass, infoPass]);

    const raw = JSON.parse(textOf(findingMsg)) as { matches: MapRawMatch[] };
    const mapped = resolveMatches(items, raw.matches || [], mode);

    let infoBoxes: ReturnType<typeof resolveInfoSelections> = [];
    let infoError: string | null = null;
    if (infoMsg) {
      try {
        const infoRaw = JSON.parse(textOf(infoMsg)) as { selections: InfoSelection[] };
        infoBoxes = resolveInfoSelections(
          infoCandidates,
          (infoRaw.selections || []).filter((s) => infoSelectionSupported(s, transcript))
        );
      } catch (e) {
        // An Information-pass failure must not lose the defect mapping — but it
        // must be REPORTED, or the build list silently ships with zero
        // Information boxes and nobody knows why.
        infoError = `The Information pass failed (${(e as Error).message}) — the build list has no Information boxes. Re-run "Match findings & send".`;
      }
    } else if (transcript === "") {
      infoError =
        "This report has no transcript stored, so no Information boxes could be read. If the details were a separate recording, add it via “+ Add more audio” on Step 1, then re-run.";
    }

    const lines = [toExtensionLines(mapped), infoBoxesToLines(infoBoxes)]
      .filter(Boolean)
      .join("\n");

    return NextResponse.json({
      mapped,
      lines,
      mode,
      includeDefectBoxes,
      info: infoBoxes,
      infoCount: infoBoxes.length,
      infoError,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Mapping failed." },
      { status: 500 }
    );
  }
}
