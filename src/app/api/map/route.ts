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
  try {
    const body = await req.json();
    report = body?.report ?? null;
    if (body?.mode === "standard" || body?.mode === "trever") mode = body.mode;
  } catch {
    // fall through
  }
  if (!report || !Array.isArray(report.findings) || !report.findings.length) {
    return NextResponse.json(
      { error: "No findings to map." },
      { status: 400 }
    );
  }

  const items = withCandidates(report.findings, mode);
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
    const findingPass = anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: buildMapSystemPrompt(mode),
      messages: [{ role: "user", content: buildMapUserPrompt(items) }],
      output_config: {
        format: { type: "json_schema", schema: MAP_OUTPUT_SCHEMA },
        effort: "medium",
      },
    } as any);

    // Pass 2 — Information boxes come from the TRANSCRIPT, not from defect
    // findings (materials, brands, amperage, locations are never deficiencies),
    // which is why they were previously skipped entirely.
    const infoPass =
      transcript && infoCandidates.length
        ? anthropic.messages.create({
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
          } as any)
        : Promise.resolve(null);

    const [findingMsg, infoMsg] = await Promise.all([findingPass, infoPass]);

    const raw = JSON.parse(textOf(findingMsg)) as { matches: MapRawMatch[] };
    const mapped = resolveMatches(items, raw.matches || [], mode);

    let infoBoxes: ReturnType<typeof resolveInfoSelections> = [];
    if (infoMsg) {
      try {
        const infoRaw = JSON.parse(textOf(infoMsg)) as { selections: InfoSelection[] };
        infoBoxes = resolveInfoSelections(infoCandidates, infoRaw.selections || []);
      } catch {
        // An Information-pass failure must not lose the defect mapping.
      }
    }

    const lines = [toExtensionLines(mapped), infoBoxesToLines(infoBoxes)]
      .filter(Boolean)
      .join("\n");

    return NextResponse.json({
      mapped,
      lines,
      mode,
      info: infoBoxes,
      infoCount: infoBoxes.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Mapping failed." },
      { status: 500 }
    );
  }
}
