import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 300;

// =============================================================================
// COSMETIC PUNCH LIST — investor deliverable, separate from the report.
// Format learned from the approved 9310 Biemans Terrace punch list (68 rows):
//   S. No. (AREA-NN) | Checklist Item (2-4 words) | Description (imperative)
// Areas, in his order: EXTERIOR, BASEMENT, MAINLVL, UPPERLVL.
// =============================================================================

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          area: { type: "string", enum: ["EXTERIOR", "BASEMENT", "MAINLVL", "UPPERLVL"] },
          item: { type: "string" },
          description: { type: "string" },
        },
        required: ["area", "item", "description"],
      },
    },
  },
  required: ["rows"],
} as const;

const SYSTEM = `You turn a home inspector's dictated cosmetic findings into his APPROVED contractor punch-list format. This list goes to an investor's repair crew — short, imperative, actionable.

FORMAT (from his approved lists — match it exactly):
- Each row: area, checklist item, description.
- "area" is one of: EXTERIOR, BASEMENT, MAINLVL, UPPERLVL. Assign by where the item is: outside/grounds/deck/siding -> EXTERIOR; basement rooms -> BASEMENT; main/first floor rooms (kitchen, living, dining, main-level bed/bath) -> MAINLVL; second floor and above -> UPPERLVL. Output rows grouped by area in that order.
- "item": a 2-4 word label naming the surface/component and place ("Basement Baseboards", "Bedroom Two Window Trim", "Driveway Overspray").
- "description": ONE imperative sentence telling the crew what to do — starts with a verb ("Remove...", "Repair...", "Properly prepare, repaint, and refinish...", "Patch and repaint..."). His recurring verbs: remove, repair, refinish, repaint, properly prepare, patch, clean, secure, replace, adjust. "Full finish cleanup" dictations become "Properly prepare, patch, sand, repaint, and refinish ..." style descriptions.
- One row per distinct surface/component. Consolidate exact duplicates, but keep separate rooms/components as separate rows — his lists run long (40-70 rows) and specific, so the crew can check items off one by one.
- Every dictated cosmetic item must appear. Do not invent items that were not dictated. Plain text only.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }
  let findings: Array<{
    title: string;
    comment: string;
    section?: string;
    location_tags?: string[];
  }> = [];
  try {
    const body = await req.json();
    findings = Array.isArray(body?.findings) ? body.findings : [];
  } catch {
    /* fall through */
  }
  if (!findings.length) {
    return NextResponse.json({ error: "No cosmetic findings provided." }, { status: 400 });
  }
  try {
    const anthropic = new Anthropic({ apiKey });
    const listed = findings
      .map(
        (f, i) =>
          `${i + 1}. [${f.section || "?"}${
            f.location_tags?.length ? " / " + f.location_tags.join(", ") : ""
          }] ${f.title}: ${f.comment}`
      )
      .join("\n");
    const msg = await anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Dictated cosmetic findings:\n\n${listed}\n\nProduce the punch-list rows.`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "medium" },
    } as any).finalMessage();
    const block = (msg.content as any[]).find((b) => b.type === "text");
    if (!block?.text) throw new Error("The AI returned an empty response.");
    const parsed = JSON.parse(block.text) as {
      rows: Array<{ area: string; item: string; description: string }>;
    };
    // Number AREA-NN in his area order, preserving row order within each area.
    const order = ["EXTERIOR", "BASEMENT", "MAINLVL", "UPPERLVL"];
    const counters: Record<string, number> = {};
    const rows = (parsed.rows || [])
      .sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area))
      .map((r) => {
        counters[r.area] = (counters[r.area] || 0) + 1;
        return {
          sno: `${r.area}-${String(counters[r.area]).padStart(2, "0")}`,
          item: r.item,
          description: r.description,
        };
      });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Could not build the punch list." },
      { status: 500 }
    );
  }
}
