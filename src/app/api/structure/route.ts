import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompt";
import { CRITICAL_HAZARD_TERMS, droppedHazardTerms } from "@/lib/hazardTerms";
import {
  CLAUDE_OUTPUT_SCHEMA,
  ClaudeRawOutput,
  InspectionDetails,
  InspectionReport,
  emptyDetails,
  newId,
} from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro)

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
// Single pass is strongly preferred: the model can only de-duplicate and
// consolidate findings it sees together. With Opus on the Pro 300s budget,
// virtually every real walkthrough fits in one call; chunking is a safety net
// for extreme transcripts only.
// 14k chars: a 21k multi-unit walkthrough (80+ findings) timed out twice as a
// single pass — the model cannot write that many findings inside the 300s
// budget. Two parallel ~11k chunks finish in roughly half the wall-clock time.
// Chunks split at paragraph boundaries, and stitched Plaud transcripts label
// each recording with its unit, so per-chunk unit context survives the split.
function chunkTranscript(t: string, targetChars = 14000, maxChunks = 3): string[] {
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
  // Addendum mode: the inspector recorded MORE audio for a report that already
  // exists. `append.findings` is the current findings list; the new transcript
  // is extracted against it (later statement wins).
  let append: { findings: Array<{ title: string; source_text?: string | null; comment?: string }> } | null =
    null;
  try {
    const body = await req.json();
    transcript = String(body?.transcript ?? "").trim();
    if (body?.details) typed = { ...emptyDetails(), ...body.details };
    if (body?.append?.findings && Array.isArray(body.append.findings)) {
      append = { findings: body.append.findings };
    }
  } catch {
    // fall through to validation
  }

  if (!transcript) {
    return NextResponse.json({ error: "Missing transcript." }, { status: 400 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    // ---- ADDENDUM MODE ------------------------------------------------------
    if (append) {
      const APPEND_OUTPUT_SCHEMA: any = {
        ...(CLAUDE_OUTPUT_SCHEMA as any),
        properties: {
          ...(CLAUDE_OUTPUT_SCHEMA as any).properties,
          removed_indexes: { type: "array", items: { type: "integer" } },
        },
        required: [...(CLAUDE_OUTPUT_SCHEMA as any).required, "removed_indexes"],
      };
      const listed = append.findings
        .map(
          (f, i) =>
            `[${i}] ${f.title} — ${(f.source_text || f.comment || "").slice(0, 160)}`
        )
        .join("\n");
      const msg = await anthropic.messages.stream({
        model: "claude-opus-5",
        max_tokens: 16000,
        system:
          buildSystemPrompt() +
          `

ADDENDUM MODE
This inspection already has the numbered EXISTING FINDINGS provided in the message. The inspector then recorded MORE audio for the SAME property. Work from the NEW transcript only:
1. Return ONLY findings the new transcript adds — a condition an existing finding already covers (even worded differently or consolidated) must NOT be returned again.
2. LATER STATEMENT WINS, absolutely. If the new transcript retracts or supersedes an existing finding ("disregard the roof thing", "take that out"), put that finding's number in "removed_indexes". If it CORRECTS one ("actually it was two windows, not one"), put the old finding's number in "removed_indexes" AND return the corrected finding as a new one.
3. Every DO-NOT-WRITE-UP rule still applies to the new transcript.
4. Fill inspection details ONLY if the new transcript states them; otherwise null.
5. If nothing is added or removed, return empty findings and empty removed_indexes.`,
        messages: [
          {
            role: "user",
            content: `EXISTING FINDINGS (${append.findings.length}):\n${listed}\n\nNEW (ADDENDUM) TRANSCRIPT:\n"""\n${transcript}\n"""`,
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: APPEND_OUTPUT_SCHEMA },
          effort: "medium",
        },
      } as any).finalMessage();
      const block = (msg.content as any[]).find((b) => b.type === "text");
      if (!block?.text) throw new Error("The AI returned an empty response.");
      const parsed = JSON.parse(block.text) as ClaudeRawOutput & {
        removed_indexes?: number[];
      };
      const newFindings = (parsed.findings || []).map((f, i) => {
        const conf = typeof f.confidence === "number" ? f.confidence : null;
        const flags = ["addendum"];
        if (conf !== null && conf < 0.5) flags.push("low_confidence");
        return {
          ...f,
          id: newId(),
          order_index: append!.findings.length + i,
          confidence: conf,
          location_tags: Array.isArray(f.location_tags) ? f.location_tags : [],
          flags,
        };
      });
      const removed = (parsed.removed_indexes || []).filter(
        (i) => Number.isInteger(i) && i >= 0 && i < append!.findings.length
      );
      return NextResponse.json({
        append: {
          findings: newFindings,
          removed_indexes: removed,
          inspection: parsed.inspection || emptyDetails(),
        },
      });
    }

    // Structure ONE chunk of transcript into raw findings + details. Opus with
    // medium effort — the house-style rules (CYA wording, forbidden terms,
    // consolidation) reward careful reading, and the Pro 300s budget affords it.
    const startedAt = Date.now();
    async function structureChunk(text: string): Promise<ClaudeRawOutput> {
      // Streamed: the SDK requires streaming once max_tokens is large enough that
      // a request could run long. finalMessage() still yields the whole result.
      const message = await anthropic.messages.stream({
        model: "claude-opus-5",
        // A full walkthrough can yield 50+ findings; too small a budget cuts the
        // JSON mid-string and surfaces as "Unterminated string in JSON".
        max_tokens: 32000,
        system: buildSystemPrompt(),
        messages: [{ role: "user", content: buildUserPrompt(text, typed) }],
        output_config: {
          format: { type: "json_schema", schema: CLAUDE_OUTPUT_SCHEMA },
          effort: "medium",
        },
      } as any).finalMessage();
      const textBlock = (message.content as any[]).find((b) => b.type === "text");
      if (!textBlock?.text) throw new Error("The AI returned an empty response.");
      if ((message as any).stop_reason === "max_tokens") {
        throw new Error(
          "This walkthrough produced more findings than fit in one response. Try splitting the transcript into two shorter passes."
        );
      }
      const parsed = JSON.parse(textBlock.text) as ClaudeRawOutput;

      // A named hazardous material must survive extraction by name. Losing
      // "polybutylene" here is invisible to every later check, because nothing
      // downstream knows the word was ever said.
      const findingsText = (parsed.findings || [])
        .map((f: any) => `${f.title} ${f.comment} ${f.source_text || ""}`)
        .join(" ");
      // Critical terms only against a raw transcript (materials dictated as
      // information would force a retry that can never succeed), and no retry
      // when there isn't time left for a second full pass.
      const lost = droppedHazardTerms(text, findingsText, CRITICAL_HAZARD_TERMS);
      if (!lost.length) return parsed;
      if (Date.now() - startedAt > 130_000) return parsed;

      const retry = await anthropic.messages.stream({
        model: "claude-opus-5",
        max_tokens: 32000,
        system: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            content:
              buildUserPrompt(text, typed) +
              `\n\nA previous extraction of this same transcript LOST these terms: ${lost.join(
                ", "
              )}. The inspector named them, and naming the material IS the finding. Extract again, keeping a finding for each that states the term explicitly and preserves any uncertainty he expressed about it.`,
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: CLAUDE_OUTPUT_SCHEMA },
          effort: "medium",
        },
      } as any).finalMessage();
      const retryBlock = (retry.content as any[]).find((b) => b.type === "text");
      if (!retryBlock?.text) return parsed;
      try {
        return JSON.parse(retryBlock.text) as ClaudeRawOutput;
      } catch {
        return parsed;
      }
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

    // -------------------------------------------------------------------------
    // SECOND READ — the check the hazard-term list can't do. The term list only
    // catches losses of words we thought to put on a list; the chimney-sweep
    // recommendation was missed because it was never extracted at all, so every
    // downstream coverage check had nothing to compare against. Here a fresh
    // pass reads the raw transcript against the finished findings list and
    // returns ONLY dictated conditions no finding covers. Anything it finds is
    // appended, flagged "second_read" so the review screen can show its origin.
    // Verification must never break extraction: failures are swallowed, and it
    // is skipped when there isn't time budget left for another pass.
    let secondRead: { checked: boolean; added: number } = { checked: false, added: 0 };
    if (Date.now() - startedAt < 200_000) {
      try {
        const listed = findings
          .map(
            (f, i) =>
              `[${i}] ${f.title} — ${(f.source_text || f.comment || "").slice(0, 200)}`
          )
          .join("\n");
        const verify = await anthropic.messages.stream({
          model: "claude-opus-5",
          max_tokens: 16000,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content:
                `VERIFICATION PASS. A first extraction of the transcript below produced the ${findings.length} findings listed here:\n\n${listed}\n\n` +
                `Read the full transcript again and return ONLY dictated conditions that are MISSING from that list — observations or recommendations (including habitual "we always recommend X" statements) that no listed finding covers. ` +
                `A listed finding covers a condition even when it words it differently, consolidates it with others, or generalizes its location — do NOT return those. ` +
                `Honor every DO-NOT-WRITE-UP rule: retractions, corrections, layman's editorializing, teaching, small talk, instructions to the report writer, separate deliverables, and information are still not findings. ` +
                `If nothing is missing, return an empty findings list. Leave every inspection detail null.\n\n` +
                `Transcript:\n"""\n${transcript}\n"""`,
            },
          ],
          output_config: {
            format: { type: "json_schema", schema: CLAUDE_OUTPUT_SCHEMA },
            effort: "medium",
          },
        } as any).finalMessage();
        const block = (verify.content as any[]).find((b) => b.type === "text");
        if (block?.text && (verify as any).stop_reason !== "max_tokens") {
          const parsed = JSON.parse(block.text) as ClaudeRawOutput;
          const missed = (parsed.findings || []).map((f, i) => {
            const conf = typeof f.confidence === "number" ? f.confidence : null;
            return {
              ...f,
              id: newId(),
              order_index: findings.length + i,
              confidence: conf,
              location_tags: Array.isArray(f.location_tags) ? f.location_tags : [],
              flags: ["second_read"],
            };
          });
          findings.push(...missed);
          secondRead = { checked: true, added: missed.length };
        }
      } catch {
        /* second read is best-effort — the first-pass findings stand */
      }
    }

    const report: InspectionReport = {
      schema_version: "1.0",
      inspection: mergeDetails(mergedDetails, typed),
      findings,
      meta: {
        generated_at: new Date().toISOString(),
        source: "voice-to-report",
        transcript,
        second_read: secondRead,
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
