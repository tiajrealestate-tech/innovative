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
- CONSOLIDATE TO ONE ROW PER ROOM OR SURFACE-SYSTEM — THIS IS A HARD RULE. A bedroom is ONE row carrying its walls, ceiling, baseboards, corners, outlets/switches, door and trim, closet, and window finish work together. A bathroom is ONE row (or two when the shower enclosure work is heavy: room + shower). NEVER split one room across three or four rows — outlets, a light switch, a strike plate, and a door trim in the same room belong inside that room's row, not in rows of their own. Whole-floor surface systems roll up the same way ("Second Floor Baseboards" = one row for the whole floor). His lists run ~40-55 rows TOTAL (roughly: EXTERIOR 12-18, BASEMENT 8-12, MAINLVL 8-11, UPPERLVL 10-15) — room-level rollups, not one row per blemish. If your draft exceeds ~55 rows, merge rows within the same room until it doesn't.
- "item": a 2-4 word label naming the room or surface-system ("Basement Bedroom One", "Living Room Walls and Bulkhead", "Property Grounds Cleanup", "Upper Bathroom Shower").
- "description": his verb-chain style — a compound imperative naming the covered pieces and closing with prep/refinish: "Repair drywall patches, corners, wall-to-ceiling transitions, and threshold finishes; sand/prep and repaint/refinish." Recurring chain verbs: repair, remove, recaulk, seal, secure, prep, sand, clean, and the closer "repaint/refinish". Real examples of his: "Repair finish defects, remove loose paint, recaulk joints, prep surfaces, and repaint/refinish." / "Remove excess grout and caulk, repair enclosure trim, properly recaulk/seal tile, wall, floor, and ceiling transitions, and clean/refinish surfaces." / "Remove trash, construction debris, abandoned materials, paint chips, and miscellaneous materials throughout the lot."
- SCOPE — the punch list DELIBERATELY OVERLAPS the report. The report tells the investor what is wrong; the punch list tells the crew what to do, and a handy crew does far more than paint. Alongside the cosmetic/finish items, the following crew-executable corrections are MANDATORY rows whenever they were dictated, even though the report also carries them — omitting one of these is an error:
  * gutter cleaning and downspout securing/reconnection/extension
  * exterior vent covers (dryer, exhaust) — replace/secure/seal
  * handrails — secure loose ones AND install missing ones (interior or exterior)
  * missing escutcheons and simple trim/cover plates
  * appliance securing — dishwasher mounting brackets, range anti-tip, base cover plates, leveling
  * misplaced/improvised filters (e.g. a filter stuffed behind a fixed return grille — remove it)
  * caulking and sealant renewal (exterior windows/doors/trim, tubs, tile transitions) and sealing simple wall penetrations (refrigerant-line opening, cable holes)
  * hardware, screens, access-opening enlargement, debris/cleanup of every kind
- EXCLUDE work that needs a licensed specialist or hazard professional FIRST (structural repairs, electrical circuit work, plumbing line work, roofing, HVAC systems, asbestos-suspect materials, moisture-source correction) — but for every such area with visible finish damage, ADD the follow-up finish row using his sequencing phrase: "…after structural repairs are completed" / "…after concrete repairs are completed" / "…after HVAC verification is completed". A scorched lintel, a deteriorated stoop, damaged fascia, or rear siding still gets its prep/refinish row — sequenced behind the specialist. This after-repairs pattern is his signature; do not drop it.
- Every dictated cosmetic item must appear somewhere in a row. Do not invent items that were not dictated. Plain text only.
- FINAL AUDIT before answering: (1) walk the MANDATORY overlap checklist above against the findings — every dictated one has a row; (2) confirm no single room is split across multiple rows; (3) confirm total row count is in the 40-55 range. Fix what fails, then answer.`;

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
