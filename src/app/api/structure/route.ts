import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import {
  CLAUDE_OUTPUT_SCHEMA,
  ClaudeRawOutput,
  InspectionDetails,
  InspectionReport,
  emptyDetails,
  newId,
} from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds

// Merge the AI-extracted details with anything the inspector typed in.
// Typed values win when present; otherwise fall back to what the AI heard.
function mergeDetails(
  ai: InspectionDetails,
  typed: InspectionDetails
): InspectionDetails {
  const pick = (t: string | null, a: string | null) =>
    t && t.trim() ? t.trim() : a && String(a).trim() ? String(a).trim() : null;
  return {
    property_address: pick(typed.property_address, ai.property_address),
    inspection_date: pick(typed.inspection_date, ai.inspection_date),
    client_name: pick(typed.client_name, ai.client_name),
    client_agent: pick(typed.client_agent, ai.client_agent),
    inspector_name: pick(typed.inspector_name, ai.inspector_name),
  };
}

// POST { transcript, details? } -> InspectionReport
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  let transcript = "";
  let typed: InspectionDetails = emptyDetails();
  try {
    const body = await req.json();
    transcript = String(body?.transcript ?? "").trim();
    if (body?.details) typed = { ...emptyDetails(), ...body.details };
  } catch {
    // fall through to validation
  }

  if (!transcript) {
    return NextResponse.json({ error: "Missing transcript." }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    // Structured outputs guarantee the response matches CLAUDE_OUTPUT_SCHEMA,
    // so JSON.parse never fails on a well-formed response.
    const message = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(transcript, typed) }],
      output_config: {
        format: {
          type: "json_schema",
          schema: CLAUDE_OUTPUT_SCHEMA,
        },
        // "low" keeps long real-world transcripts inside the free-tier 60s
        // function limit. Extraction is largely mechanical, so quality holds;
        // the 2026 voice is applied later in the compose step anyway.
        effort: "low",
      },
    } as any);

    const textBlock = (message.content as any[]).find(
      (b) => b.type === "text"
    );
    if (!textBlock?.text) {
      throw new Error("The AI returned an empty response.");
    }

    const raw = JSON.parse(textBlock.text) as ClaudeRawOutput;

    const findings = (raw.findings || []).map((f, i) => {
      const conf = typeof f.confidence === "number" ? f.confidence : null;
      const flags: string[] = [];
      if (conf !== null && conf < 0.5) flags.push("low_confidence");
      return {
        ...f,
        id: newId(),
        order_index: i,
        confidence: conf,
        location_tags: Array.isArray(f.location_tags) ? f.location_tags : [],
        flags,
      };
    });

    const report: InspectionReport = {
      schema_version: "1.0",
      inspection: mergeDetails(raw.inspection || emptyDetails(), typed),
      findings,
      meta: {
        generated_at: new Date().toISOString(),
        source: "voice-to-report",
        transcript,
      },
    };

    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "The AI could not structure this transcript.",
      },
      { status: 500 }
    );
  }
}
