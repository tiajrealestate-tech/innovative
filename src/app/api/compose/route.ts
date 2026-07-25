import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { InspectionReport } from "@/lib/schema";
import {
  buildComposeSystemPrompt,
  buildComposeUserPrompt,
  COMPOSE_OUTPUT_SCHEMA,
  ComposedReport,
  groupForCompose,
} from "@/lib/compose";
import { getItem, getSection, placementItemFor } from "@/lib/catalog";

export const runtime = "nodejs";
export const maxDuration = 300; // seconds (Vercel Pro)

// POST { report } -> ComposedReport  (Trever's 2026 report voice)
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
    return NextResponse.json({ error: "No findings to write up." }, { status: 400 });
  }

  const groups = groupForCompose(report);
  const instructions = report.meta?.transcript || "";

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.stream({
      model: "claude-opus-5",
      max_tokens: 24000,
      system: buildComposeSystemPrompt(),
      messages: [
        { role: "user", content: buildComposeUserPrompt(groups, instructions) },
      ],
      output_config: {
        format: { type: "json_schema", schema: COMPOSE_OUTPUT_SCHEMA },
        effort: "medium",
      },
    } as any).finalMessage();

    const textBlock = (message.content as any[]).find((b) => b.type === "text");
    if (!textBlock?.text) throw new Error("The AI returned an empty response.");

    const parsed = JSON.parse(textBlock.text) as Omit<ComposedReport, "style">;
    // Consolidated write-ups belong in the section's "… General" item, which is
    // where Trever's real reports put them (and why those items carry no
    // library checkboxes). The model sometimes returns a combined
    // "Section › Item" string in `section` (it mirrors the placement examples
    // in the prompt), which would break both placement and extension
    // navigation — split it apart and resolve each half against the catalog.
    const placedGroups = (parsed.groups || []).map((g) => {
      const parts = String(g.section || "").split(/\s*[›>|]\s*/);
      const secName = (parts[0] || "").trim();
      const section = getSection(secName)?.section || secName;
      const itemHint = parts.slice(1).join(" ").trim();
      const item =
        (itemHint && getItem(section, itemHint)?.item) ||
        placementItemFor(section);
      const severity =
        g.severity === "safety" || g.severity === "maintenance"
          ? g.severity
          : ("recommendation" as const);
      return { ...g, section, item, severity };
    });
    const composed: ComposedReport = {
      style: "trever-2026",
      ...parsed,
      groups: placedGroups,
    };
    return NextResponse.json({ composed });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Could not write up the report." },
      { status: 500 }
    );
  }
}
