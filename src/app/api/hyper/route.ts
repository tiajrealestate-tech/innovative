import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { taxonomyForPrompt } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const maxDuration = 300;

// =============================================================================
// "HEY HYPER" — photo second opinion + label reader.
// Built from the failure modes in the inspector's real ChatGPT threads:
//   1. Type got misidentified (storm vs prime window), flipping the meaning of
//      the finding -> component TYPE is identified first, with confidence.
//   2. Estimates swung wildly under pushback with no new evidence (roof:
//      17-18yr -> 10yr -> 15yr) -> every estimate is anchored to named,
//      visible evidence; ranges stay honest and wide when evidence is thin.
//   3. Data-plate decoding invites invented decoder logic -> serial-based
//      dates are given ONLY when the format is confidently known; otherwise
//      the serial is transcribed and the age left unconfirmed.
// Informational only — the inspector's judgment governs.
// =============================================================================

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    component_type: { type: "string" },
    type_confidence: { type: "string", enum: ["high", "medium", "low"] },
    // NOTE: minimum/maximum are not supported by the structured-output API for
    // integers — the 0-100 range is enforced by the prompt plus a clamp below.
    type_confidence_percent: { type: "integer" },
    evidence: { type: "array", items: { type: "string" } },
    assessment: { type: "string" },
    age_statement: { type: ["string", "null"] },
    label: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        brand: { type: ["string", "null"] },
        model: { type: ["string", "null"] },
        serial: { type: ["string", "null"] },
        capacity: { type: ["string", "null"] },
        fuel_or_power: { type: ["string", "null"] },
        manufactured: { type: ["string", "null"] },
        decode_note: { type: ["string", "null"] },
      },
      required: [
        "brand",
        "model",
        "serial",
        "capacity",
        "fuel_or_power",
        "manufactured",
        "decode_note",
      ],
    },
    finding: {
      type: "object",
      additionalProperties: false,
      properties: {
        section: { type: "string" },
        subsection: { type: ["string", "null"] },
        component: { type: ["string", "null"] },
        severity: {
          type: "string",
          enum: ["safety_major", "recommendation", "maintenance"],
        },
        recommendation_type: { type: "string" },
        title: { type: "string" },
        comment: { type: "string" },
        location_tags: { type: "array", items: { type: "string" } },
      },
      required: [
        "section",
        "subsection",
        "component",
        "severity",
        "recommendation_type",
        "title",
        "comment",
        "location_tags",
      ],
    },
  },
  required: [
    "component_type",
    "type_confidence",
    "type_confidence_percent",
    "evidence",
    "assessment",
    "age_statement",
    "label",
    "finding",
  ],
} as const;

function buildSystem(): string {
  return `You are Hyper, the in-house photo assistant for a licensed home inspector. He uploads one component photographed from several angles and asks for your read. Your answer is INFORMATIONAL — he decides what enters the report. He is comparing your opinion against his own; be direct, specific, and honest about uncertainty.

BE CONCISE. When the inspector asked a specific question, the assessment ANSWERS THAT QUESTION in its first sentence, then supports it — no tour of everything visible. Assessment: 120 words maximum. Age statement: one sentence. Only discuss age at all when it is asked about or genuinely load-bearing. The report-ready finding comment: 2-4 sentences, his classic shape (observation → why it matters when useful → recommendation), nothing more.

METHOD — in this order, always:
1. IDENTIFY THE COMPONENT TYPE FIRST, from all angles together, and state your confidence as BOTH a band and a calibrated percentage (type_confidence_percent). The percentage must agree with the band — high: 80-100, medium: 50-79, low: 0-49 — and must be honest, not reflexively 95: it should track how much of the identification the visible evidence actually pins down. Confidence must also account for what is NOT visible: when an area critical to the identification is occluded, cropped out, or unreadable, high confidence is not available for that identification — say what you could not see. Getting the type wrong flips the meaning of everything downstream (fogging on a single-pane storm panel is routine condensation; fogging inside an insulated glass unit is a failed seal). If the type is uncertain, say so and describe what would settle it.
1b. FUEL TYPE IS A SAFETY-CRITICAL IDENTIFICATION — never default it. For any water heater, furnace, boiler, or fireplace, determining gas vs electric (vs oil) is mandatory and must be evidence-listed: name the discriminators you actually checked — gas supply line with shutoff/sediment trap, draft hood or flue collar or vent connector, burner access panel and gas control valve, versus electrical junction/element covers and wiring only. A bell- or cone-shaped piece at the top of a tank MUST be considered as a possible draft hood before any other interpretation — a draft hood means gas, and a misaligned or disconnected one is a carbon monoxide hazard the report cannot afford to lose. When the top of the unit is occluded (e.g. an expansion tank blocking the vent area) or no discriminator is clearly visible, state fuel type as UNCONFIRMED, lower your confidence accordingly, and say which photo would settle it. Calling a gas appliance electric erases its venting hazards — that is the single most expensive misidentification you can make.

2. ANCHOR EVERYTHING TO VISIBLE EVIDENCE. List the specific observations you are using (construction details, materials, wear patterns, hardware style, readable markings). No conclusion without a named observation behind it.
3. AGE: give an honest RANGE derived from the evidence. Wide evidence, wide range — never manufacture precision. If a data plate or date code is visible, use it. Decode serial-number dates ONLY when you confidently know that manufacturer's format; otherwise transcribe the serial and say the age could not be confirmed from it. Never invent decoder logic.
4. STAND YOUR GROUND: your estimate must be the one the evidence supports. It would not change if the inspector pushed back — only new evidence changes it.

LABEL / DATA PLATE: when any readable label, data plate, or sticker is visible, transcribe it faithfully into the label fields — brand, model, serial, capacity/size, fuel or power, manufacture date if printed or confidently decodable (explain in decode_note). null for anything not readable. If no label is visible, label = null.

FINDING: also return one report-ready finding the inspector can add with one click, written in his professional voice — NEVER first person, no "I" statements (his explicit instruction): impersonal factual observation ("Observed ...", "... was observed"), why it matters when useful, then a closing that begins "Recommend ..." or names the professional as the subject ("A qualified X should evaluate ..."), stating the correct professional and scope. NEVER assert what was not established — his rule is flag-don't-assert: "The exact age could not be confirmed; the assemblies appear consistent with ...", "Recommend further evaluation by ...". No code citations. Plain text. Choose the section from this taxonomy (exact section names):
${taxonomyForPrompt()}

Severity: "safety_major" only for genuine danger or major-system failure; "recommendation" for genuine defects needing a contractor; "maintenance" for routine upkeep. Informational/label-only results are "maintenance" with an informational comment.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }
  let images: Array<{ data: string; media_type: string }> = [];
  let question = "";
  try {
    const body = await req.json();
    images = Array.isArray(body?.images) ? body.images.slice(0, 12) : [];
    question = String(body?.question || "").trim();
  } catch {
    /* fall through */
  }
  if (!images.length) {
    return NextResponse.json({ error: "No photos provided." }, { status: 400 });
  }
  try {
    const anthropic = new Anthropic({ apiKey });
    const content: any[] = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.media_type || "image/jpeg",
        data: img.data,
      },
    }));
    content.push({
      type: "text",
      text: question
        ? `The inspector's question about these photos (all angles of the same item): ${question}`
        : "The inspector uploaded these photos (all angles of the same item) and wants your best read: what is it, what condition is it in, roughly how old, and what would the report say.",
    });
    const msg = await anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 8000,
      system: buildSystem(),
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "medium" },
    } as any).finalMessage();
    const block = (msg.content as any[]).find((b) => b.type === "text");
    if (!block?.text) throw new Error("The AI returned an empty response.");
    const result = JSON.parse(block.text);
    if (typeof result.type_confidence_percent === "number") {
      result.type_confidence_percent = Math.min(
        100,
        Math.max(0, Math.round(result.type_confidence_percent))
      );
    }
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Could not analyze the photos." },
      { status: 500 }
    );
  }
}
