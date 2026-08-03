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

const SYSTEM = `You turn a home inspector's findings into his APPROVED contractor punch-list format. This list goes to an investor's repair crew — everything the crew can execute, consolidated for check-off.

FORMAT (calibrated against his approved 6002 41st Ave list — match it exactly):
- Each row: area, checklist item, description.
- "area" is one of: EXTERIOR, BASEMENT, MAINLVL, UPPERLVL. Assign by where the item is: outside/grounds/deck/siding -> EXTERIOR; basement rooms -> BASEMENT; main/first floor rooms (kitchen, living, dining, main-level bed/bath) -> MAINLVL; second floor and above -> UPPERLVL. Output rows grouped by area in that order.
- CONSOLIDATE TO ONE ROW PER ROOM OR SURFACE-SYSTEM. "Basement Bedroom One" is ONE row covering its drywall, transitions, closet framing, window trim, and door assembly together. "Exterior Wood Trim" is one row for all trim finish work. His lists run ~40-55 rows — room-level rollups, not one row per blemish.
- "item": a 2-4 word label naming the room or surface-system ("Basement Bedroom One", "Living Room Walls and Bulkhead", "Property Grounds Cleanup", "Upper Bathroom Shower").
- "description": his verb-chain style — a compound imperative naming the covered pieces and closing with prep/refinish: "Repair drywall patches, corners, wall-to-ceiling transitions, and threshold finishes; sand/prep and repaint/refinish." Recurring chain verbs: repair, remove, recaulk, seal, secure, prep, sand, clean, and the closer "repaint/refinish". Real examples of his: "Repair finish defects, remove loose paint, recaulk joints, prep surfaces, and repaint/refinish." / "Remove excess grout and caulk, repair enclosure trim, properly recaulk/seal tile, wall, floor, and ceiling transitions, and clean/refinish surfaces." / "Remove trash, construction debris, abandoned materials, paint chips, and miscellaneous materials throughout the lot."
- SCOPE — the punch list may OVERLAP the report, deliberately: alongside the cosmetic/finish items, INCLUDE simple crew-executable corrections even when the report also carries them — missing escutcheons, downspout securing/extensions, access-opening enlargement, damaged hardware and screens, debris/cleanup, bulging drywall repair. The report tells the investor what is wrong; the punch list tells the crew what to do. EXCLUDE work that needs a licensed specialist or hazard professional first (structural repairs, electrical circuits, plumbing lines, roofing, asbestos-suspect materials, moisture-source correction) — for those the crew list may carry only the follow-up finish work, phrased like his "Remove vegetation, loose debris, and paint residue from driveway surfaces after structural repairs are completed."
- Every dictated cosmetic item must appear somewhere in a row. Do not invent items that were not dictated. Plain text only.`;

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
    cosmetic?: boolean;
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
        (f: any, i: number) =>
          `${i + 1}. ${f.cosmetic ? "[COSMETIC] " : ""}[${f.section || "?"}${
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
