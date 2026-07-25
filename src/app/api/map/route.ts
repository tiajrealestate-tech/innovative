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
} from "@/lib/spectora-map";

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
  try {
    const body = await req.json();
    report = body?.report ?? null;
  } catch {
    // fall through
  }
  if (!report || !Array.isArray(report.findings) || !report.findings.length) {
    return NextResponse.json(
      { error: "No findings to map." },
      { status: 400 }
    );
  }

  const items = withCandidates(report.findings);

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8000,
      system: buildMapSystemPrompt(),
      messages: [{ role: "user", content: buildMapUserPrompt(items) }],
      output_config: {
        format: { type: "json_schema", schema: MAP_OUTPUT_SCHEMA },
        effort: "low",
      },
    } as any);

    const textBlock = (message.content as any[]).find((b) => b.type === "text");
    if (!textBlock?.text) throw new Error("The AI returned an empty response.");

    const raw = JSON.parse(textBlock.text) as { matches: MapRawMatch[] };
    const mapped = resolveMatches(items, raw.matches || []);
    const lines = toExtensionLines(mapped);

    return NextResponse.json({ mapped, lines });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Mapping failed." },
      { status: 500 }
    );
  }
}
