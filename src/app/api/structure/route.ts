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

// Split a long transcript into chunks at sentence/paragraph boundaries so each
// can be structured by its own (parallel) model call within the time limit.
// Short transcripts return a single chunk (no overhead).
function chunkTranscript(t: string, targetChars = 1600, maxChunks = 6): string[] {
  const trimmed = t.trim();
  if (trimmed.length <= targetChars) return [trimmed];
  // Grow the target so we never produce more than ~maxChunks chunks (this also
  // guarantees termination — no recursion).
  const target = Math.max(targetChars, Math.ceil(trimmed.length / maxChunks));
  // Split into sentence-ish parts, then hard-split any part longer than target
  // (long run-on dictation) so greedy packing always makes progress.
  const parts: string[] = [];
  for (const raw of trimmed.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)) {
    if (raw.length <= target) {
      parts.push(raw);
    } else {
      for (let i = 0; i < raw.length; i += target) parts.push(raw.slice(i, i + target));
    }
  }
  const chunks: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length + 1 > target) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? " " : "") + p;
  }
  if (cur) chunks.push(cur);
  return chunks;
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

    // Structure ONE chunk of transcript into raw findings + details. Sonnet is
    // fast enough to keep each call well under the free-tier 60s limit; the
    // polished 2026 voice is applied later in the compose step.
    async function structureChunk(text: string): Promise<ClaudeRawOutput> {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserPrompt(text, typed) }],
        output_config: {
          format: { type: "json_schema", schema: CLAUDE_OUTPUT_SCHEMA },
          effort: "low",
        },
      } as any);
      const textBlock = (message.content as any[]).find((b) => b.type === "text");
      if (!textBlock?.text) throw new Error("The AI returned an empty response.");
      return JSON.parse(textBlock.text) as ClaudeRawOutput;
    }

    // Long transcripts blow the 60s limit as a single call. Split into chunks
    // and run them IN PARALLEL — wall-clock time stays ~one chunk, not the sum —
    // then merge the findings back into one report.
    const chunks = chunkTranscript(transcript);
    const settled = await Promise.allSettled(chunks.map(structureChunk));
    const oks = settled
      .filter((s): s is PromiseFulfilledResult<ClaudeRawOutput> => s.status === "fulfilled")
      .map((s) => s.value);
    if (!oks.length) {
      const firstErr = settled.find((s) => s.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      throw new Error(
        (firstErr?.reason as Error)?.message || "The AI could not structure this transcript."
      );
    }

    // Merge: concatenate findings across chunks (re-indexed), and take the first
    // non-null value for each inspection detail.
    const mergedDetails: InspectionDetails = { ...emptyDetails() };
    for (const r of oks) {
      const d = r.inspection || ({} as any);
      for (const k of Object.keys(mergedDetails) as (keyof InspectionDetails)[]) {
        if (!mergedDetails[k] && d[k]) mergedDetails[k] = d[k];
      }
    }

    const findings = oks
      .flatMap((r) => r.findings || [])
      .map((f, i) => {
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
      inspection: mergeDetails(mergedDetails, typed),
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
