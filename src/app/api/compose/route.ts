import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { InspectionReport } from "@/lib/schema";
import {
  buildComposeSystemPrompt,
  buildComposeUserPrompt,
  COMPOSE_OUTPUT_SCHEMA,
  ComposedReport,
  groupForCompose,
  flattenForCompose,
} from "@/lib/compose";
import {
  candidateBoxes,
  getItem,
  getSection,
  placementItemFor,
} from "@/lib/catalog";

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
    const ordered = flattenForCompose(groups);
    const basePrompt = buildComposeUserPrompt(groups, instructions);

    const runCompose = async (userContent: string) => {
      const message = await anthropic.messages.stream({
        model: "claude-opus-5",
        max_tokens: 24000,
        system: buildComposeSystemPrompt(),
        messages: [{ role: "user", content: userContent }],
        output_config: {
          format: { type: "json_schema", schema: COMPOSE_OUTPUT_SCHEMA },
          effort: "medium",
        },
      } as any).finalMessage();
      const textBlock = (message.content as any[]).find((b) => b.type === "text");
      if (!textBlock?.text) throw new Error("The AI returned an empty response.");
      return JSON.parse(textBlock.text) as Omit<ComposedReport, "style">;
    };

    // Which findings never made it into a write-up. Consolidation silently
    // drops findings from run to run — a real polybutylene hazard vanished on
    // one pass and survived on another — so this is verified, not trusted.
    const uncovered = (p: Omit<ComposedReport, "style">) => {
      const seen = new Set<number>();
      for (const g of p.groups || [])
        for (const i of g.finding_indexes || []) seen.add(i);
      return ordered
        .map((_, i) => i)
        .filter((i) => !seen.has(i));
    };

    // Naming a hazardous material IS the finding. Consolidation can mark a
    // finding "covered" while generalising the term out of the prose —
    // suspected polybutylene became "a mixture of piping materials" on one
    // run — so the words themselves are checked, not just the indexes.
    const HAZARD_TERMS = [
      "polybutylene",
      "asbestos",
      "lead",
      "radon",
      "termite",
      "wood-destroying",
      "wdi",
      "carbon monoxide",
      "gas odor",
      "gas leak",
      "mold-like",
      "aluminum wiring",
      "knob and tube",
      "federal pacific",
      "zinsco",
    ];
    const droppedTerms = (p: Omit<ComposedReport, "style">) => {
      const text = (p.groups || [])
        .map((g) => `${g.heading} ${g.body}`)
        .join(" ")
        .toLowerCase();
      const out = new Set<string>();
      for (const f of ordered) {
        const hay = `${f.title} ${f.comment}`.toLowerCase();
        for (const t of HAZARD_TERMS)
          if (hay.includes(t) && !text.includes(t)) out.add(t);
      }
      return [...out];
    };

    let parsed = await runCompose(basePrompt);
    let missing = uncovered(parsed);
    let dropped = droppedTerms(parsed);
    if (missing.length || dropped.length) {
      const parts: string[] = [];
      if (missing.length)
        parts.push(
          `These findings were LEFT OUT entirely — fold each into the write-up where it belongs, or give it its own:\n` +
            missing
              .map((i) => `[F${i}] ${ordered[i].title}: ${ordered[i].comment}`)
              .join("\n")
        );
      if (dropped.length)
        parts.push(
          `These terms appear in the findings but were generalised out of the write-ups: ${dropped.join(
            ", "
          )}. Naming the material IS the finding — state each one explicitly, and rate a suspected material hazard the way he does.`
        );
      parsed = await runCompose(
        `${basePrompt}\n\nA previous attempt had problems. Produce the complete report again, fixing them.\n\n${parts.join(
          "\n\n"
        )}`
      );
      missing = uncovered(parsed);
      dropped = droppedTerms(parsed);
    }
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
        (g.item && getItem(section, g.item)?.item) ||
        (itemHint && getItem(section, itemHint)?.item) ||
        placementItemFor(section);
      const severity =
        g.severity === "safety" || g.severity === "maintenance"
          ? g.severity
          : ("recommendation" as const);

      // A checkbox may only be used for a STAND-ALONE write-up (a grouped one
      // carries a numbered list and is always custom), and the label must be a
      // real box in this section — otherwise the tick would pull in the wrong
      // stored recommendation. Anything unverified falls back to a typed
      // comment, which is always safe.
      const grouped = /(^|\n)\s*1\s*-\s/.test(String(g.body || ""));
      let box_label: string | null = null;
      let boxItem = "";
      if (!grouped && g.box_label) {
        const boxes = candidateBoxes(section, null, {
          tabs: ["Defects"],
          sectionFallback: true,
        });
        const hit =
          boxes.find((b) => b.label === g.box_label) ||
          boxes.find(
            (b) => b.label.toLowerCase() === String(g.box_label).toLowerCase()
          );
        if (hit) {
          box_label = hit.label;
          boxItem = hit.item;
        }
      }

      return {
        ...g,
        section,
        item: box_label && boxItem ? boxItem : item,
        severity,
        box_label,
      };
    });
    const composed: ComposedReport = {
      style: "trever-2026",
      ...parsed,
      groups: placedGroups,
    };
    // Anything still uncovered after the retry is surfaced rather than hidden,
    // so it can be added by hand instead of silently missing from the report.
    return NextResponse.json({
      composed,
      missing: missing.map((i) => ({
        title: ordered[i].title,
        comment: ordered[i].comment,
        section: ordered[i].section,
      })),
      droppedTerms: dropped,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "Could not write up the report." },
      { status: 500 }
    );
  }
}
