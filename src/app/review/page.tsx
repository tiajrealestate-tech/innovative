"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Finding,
  InspectionDetails,
  InspectionReport,
  blankFinding,
  newId,
} from "@/lib/schema";
import { loadReport, saveReport } from "@/lib/storage";
import {
  SEVERITY_LEVELS,
  SEVERITY_BY_KEY,
  severityLabel,
  SeverityKey,
} from "@/lib/severity";
import { RECOMMENDATION_TYPES } from "@/lib/recommendations";
import { SECTION_ORDER } from "@/lib/taxonomy";
import {
  groupBySection,
  groupByRoom,
  severityCounts,
  reindex,
} from "@/lib/grouping";
import { downloadCsv, downloadJson } from "@/lib/csv";
import { ConfidenceBadge } from "../confidence-badge";
import {
  HyImage,
  fileToHyImage,
  shrinkToBudget,
  readHyperResponse,
} from "@/lib/hyper-images";

type Tab = "review" | "entry" | "punch" | "spectora";

export default function ReviewPage() {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [loaded, setLoaded] = useState(false);
  const [approved, setApproved] = useState(false);
  // Lifted so the Spectora tab can tick the boxes the composer chose for
  // stand-alone deficiencies (his method: group the like-kind ones into a
  // write-up, tick the library box for a lone one).
  const [composed, setComposed] = useState<ComposedReportData | null>(null);

  useEffect(() => {
    setReport(loadReport());
    setLoaded(true);
  }, []);

  // Write-ups belong to the report they were written from. When a different
  // transcript is loaded, drop them rather than showing the previous house's.
  const reportStamp = report?.meta?.generated_at ?? "";
  useEffect(() => {
    setComposed(null);
  }, [reportStamp]);

  function update(next: InspectionReport) {
    const reindexed = reindex(next);
    setReport(reindexed);
    saveReport(reindexed);
  }

  function updateDetails(patch: Partial<InspectionDetails>) {
    if (!report) return;
    update({ ...report, inspection: { ...report.inspection, ...patch } });
  }

  function updateFinding(id: string, patch: Partial<Finding>) {
    if (!report) return;
    update({
      ...report,
      findings: report.findings.map((f) =>
        f.id === id ? { ...f, ...patch } : f
      ),
    });
  }

  function deleteFinding(id: string) {
    if (!report) return;
    update({ ...report, findings: report.findings.filter((f) => f.id !== id) });
  }

  function addFinding() {
    if (!report) return;
    update({
      ...report,
      findings: [...report.findings, blankFinding(report.findings.length)],
    });
    setTab("review");
  }

  // More audio for the SAME inspection (the detached-garage-from-the-truck
  // case). New findings append flagged "addendum"; anything the addendum
  // retracted or corrected is removed (later statement wins) and reported
  // back so nothing vanishes silently. Edits already made are untouched.
  async function appendTranscript(
    text: string
  ): Promise<{ removedTitles: string[]; added: number }> {
    if (!report) throw new Error("No report loaded.");
    const res = await fetch("/api/structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        append: {
          findings: report.findings.map((f) => ({
            title: f.title,
            source_text: f.source_text,
            comment: f.comment,
          })),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Could not process the extra recording.");
    const removedIdx: number[] = data.append?.removed_indexes || [];
    const removedIds = new Set(
      removedIdx.map((i) => report.findings[i]?.id).filter(Boolean)
    );
    const removedTitles = removedIdx
      .map((i) => report.findings[i]?.title)
      .filter(Boolean) as string[];
    const newFindings: Finding[] = data.append?.findings || [];
    const details: Partial<InspectionDetails> = data.append?.inspection || {};
    const filledDetails = Object.fromEntries(
      Object.entries(details).filter(
        ([k, v]) => v && !(report.inspection as any)[k]
      )
    );
    update({
      ...report,
      inspection: { ...report.inspection, ...filledDetails },
      findings: [
        ...report.findings.filter((f) => !removedIds.has(f.id)),
        ...newFindings,
      ],
      meta: {
        ...report.meta,
        // New stamp clears stale write-ups; combined transcript keeps the
        // info pass and hazard checks seeing everything that was said.
        generated_at: new Date().toISOString(),
        transcript:
          (report.meta?.transcript || "") + "\n\n[ADDENDUM]\n" + text,
      },
    });
    return { removedTitles, added: newFindings.length };
  }

  // "Hey Hyper" photo answers: the finding lands flagged for review, and any
  // read label is appended to the transcript record so the Information pass
  // can tick the matching boxes (a read label = dictation-equivalent facts).
  function addHyperResult(
    finding: Omit<Finding, "id" | "order_index" | "flags" | "source_text" | "confidence" | "cosmetic">,
    labelLine: string | null
  ) {
    if (!report) return;
    const f: Finding = {
      ...(finding as any),
      id: newId(),
      order_index: report.findings.length,
      source_text: labelLine || "[photo check]",
      confidence: null,
      cosmetic: false,
      flags: ["hyper_photo"],
    } as Finding;
    update({
      ...report,
      findings: [...report.findings, f],
      meta: labelLine
        ? {
            ...report.meta,
            transcript: (report.meta?.transcript || "") + "\n[PHOTO LABEL] " + labelLine,
          }
        : report.meta,
    });
  }

  if (!loaded) return null;

  if (!report) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No report loaded yet.</p>
          <Link
            href="/"
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium px-5 py-2.5"
          >
            Start a new report
          </Link>
        </div>
      </main>
    );
  }

  const counts = severityCounts(report.findings);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white no-print">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="w-9 h-9 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold"
              >
                V
              </Link>
              <div>
                <h1 className="text-lg font-semibold leading-tight">
                  Review &amp; export
                </h1>
                <p className="text-xs text-gray-500">
                  {report.findings.length} finding
                  {report.findings.length === 1 ? "" : "s"} ·{" "}
                  {approved ? "Approved" : "Draft — nothing is final until you approve"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadCsv(report)}
                className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 px-3 py-2"
              >
                CSV
              </button>
              <button
                onClick={() => downloadJson(report)}
                className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 px-3 py-2"
              >
                JSON
              </button>
              <button
                onClick={() => setApproved((a) => !a)}
                className={`text-sm rounded-lg px-3 py-2 font-medium text-white ${
                  approved ? "bg-green-600 hover:bg-green-700" : "bg-brand-500 hover:bg-brand-600"
                }`}
              >
                {approved ? "Approved ✓" : "Mark approved"}
              </button>
            </div>
          </div>

          {/* Inspection details */}
          <div className="mt-4 grid sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <DetailInput label="Address" value={report.inspection.property_address} onChange={(v) => updateDetails({ property_address: v })} />
            <DetailInput label="Date" value={report.inspection.inspection_date} onChange={(v) => updateDetails({ inspection_date: v })} />
            <DetailInput label="Client" value={report.inspection.client_name} onChange={(v) => updateDetails({ client_name: v })} />
            <DetailInput label="Agent" value={report.inspection.client_agent} onChange={(v) => updateDetails({ client_agent: v })} />
            <DetailInput label="Inspector" value={report.inspection.inspector_name} onChange={(v) => updateDetails({ inspector_name: v })} />
          </div>

          {/* The three numbered steps ARE the workflow, in execution order;
              the punch list is an optional extra deliverable off to the side. */}
          <div className="mt-4 flex gap-1 border-b border-gray-200 -mb-px">
            <TabButton active={tab === "review"} onClick={() => setTab("review")}>
              1 · Review findings
            </TabButton>
            <TabButton active={tab === "entry"} onClick={() => setTab("entry")}>
              2 · Write the report
            </TabButton>
            <TabButton active={tab === "spectora"} onClick={() => setTab("spectora")}>
              3 · Send to Spectora
            </TabButton>
            <div className="flex-1" />
            <TabButton active={tab === "punch"} onClick={() => setTab("punch")}>
              Punch list (optional)
            </TabButton>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {tab === "review" && (
          <ReviewTab
            report={report}
            onUpdateFinding={updateFinding}
            onDeleteFinding={deleteFinding}
            onAddFinding={addFinding}
            onAppend={appendTranscript}
            onAddHyper={addHyperResult}
            onNext={() => setTab("entry")}
          />
        )}
        {tab === "entry" && (
          <EntryTab
            report={report}
            composed={composed}
            setComposed={setComposed}
            onNext={() => setTab("spectora")}
          />
        )}
        {tab === "punch" && <PunchTab report={report} counts={counts} />}
        {tab === "spectora" && (
          <SpectoraTab
            report={report}
            composed={composed}
            onBackToWrite={() => setTab("entry")}
          />
        )}
      </div>
    </main>
  );
}

// A consistent "Next →" rail so the whole flow can be driven with one button.
function NextButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="mt-8 flex justify-end border-t border-gray-200 pt-4">
      <button
        onClick={onClick}
        className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-6 py-2.5"
      >
        {label} →
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Extension handoff (the seam removal): payloads are posted as window messages;
// the extension's bridge script — running on this site — stores them and acks,
// and the Spectora panel pre-fills itself. Copy-paste remains the fallback for
// when the extension isn't installed.
// -----------------------------------------------------------------------------

function sendToExtension(data: {
  buildLines?: string;
  writeups?: string;
  address?: string;
}) {
  if (typeof window === "undefined") return;
  window.postMessage(
    { source: "innovative-app", type: "SA_PAYLOAD", ...data },
    window.location.origin
  );
}

function useExtensionBridge() {
  const [ackedAt, setAckedAt] = useState(0);
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as { source?: string; type?: string } | null;
      if (!d || d.source !== "innovative-ext") return;
      if (d.type === "SA_ACK") setAckedAt(Date.now());
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return ackedAt;
}

// -----------------------------------------------------------------------------
// Spectora autofill tab — maps findings to real checkboxes, then gives you the
// pasteable build list for the browser extension.
// -----------------------------------------------------------------------------

interface MappedRow {
  finding_id: string;
  section: string;
  item: string;
  tab: string;
  box_label: string | null;
  confidence: number;
  reason: string;
  needs_review: boolean;
}

function SpectoraTab({
  report,
  composed,
  onBackToWrite,
}: {
  report: InspectionReport;
  composed: ComposedReportData | null;
  onBackToWrite: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MappedRow[] | null>(null);
  const [lines, setLines] = useState("");
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"trever" | "standard">("trever");
  const [infoCount, setInfoCount] = useState(0);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [includeDefectBoxes, setIncludeDefectBoxes] = useState(false);
  const [standaloneCount, setStandaloneCount] = useState(0);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of report.findings) m.set(f.id, f.title || f.comment.slice(0, 60));
    return m;
  }, [report.findings]);

  // Hand the build list to the extension the moment it exists (or changes),
  // plus an explicit send button with a clear received/not-found answer.
  const ackedAt = useExtensionBridge();
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  useEffect(() => {
    if (ackedAt) setSendState("sent");
  }, [ackedAt]);
  useEffect(() => {
    if (!lines) return;
    sendToExtension({
      buildLines: lines,
      address: report.inspection?.property_address || "",
    });
  }, [lines, report.inspection?.property_address]);
  // One send carries EVERYTHING: the checkbox list and (when composed) the
  // write-ups, so this step alone fills both of the extension's boxes.
  function sendBoth(l?: string) {
    const buildLines = l ?? lines;
    if (!buildLines) return;
    setSendState("sending");
    sendToExtension({
      buildLines,
      writeups: composed
        ? buildExtensionPayload(composed, report.findings)
        : undefined,
      address: report.inspection?.property_address || "",
    });
    setTimeout(
      () => setSendState((s) => (s === "sending" ? "failed" : s)),
      1500
    );
  }
  async function matchAndSend() {
    const l = await run();
    if (l) sendBoth(l);
  }

  async function run(): Promise<string> {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, mode, includeDefectBoxes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Mapping failed.");
      setRows(data.mapped as MappedRow[]);
      // His method combines both: the like-kind deficiencies go in as grouped
      // write-ups, while a lone deficiency that a library box already covers is
      // ticked here so his own stored wording carries it.
      const standalone = (composed?.groups || [])
        .filter((g) => g.box_label && g.item)
        .map((g) => `${g.section} > ${g.item} > Defects > ${g.box_label}`);
      setStandaloneCount(standalone.length);
      // De-dupe: the defect pass and the info pass can both land on the same
      // box (seen live: Cloth-Insulated NM Cable listed twice).
      const finalLines = [
        ...new Set(
          [data.lines as string, standalone.join("\n")]
            .filter(Boolean)
            .join("\n")
            .split("\n")
            .filter(Boolean)
        ),
      ].join("\n");
      setLines(finalLines);
      setInfoCount(typeof data.infoCount === "number" ? data.infoCount : 0);
      setInfoError(typeof data.infoError === "string" ? data.infoError : null);
      return finalLines;
    } catch (e) {
      setError((e as Error).message);
      return "";
    } finally {
      setLoading(false);
    }
  }

  async function copyLines() {
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const matched = rows?.filter((r) => r.box_label) || [];
  const review = rows?.filter((r) => r.needs_review) || [];

  return (
    <div>
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">Send everything to Spectora</h2>
        <p className="text-sm text-gray-600 mt-1">
          One button: your findings are matched to your template&apos;s checkboxes, and the
          checkbox list <span className="font-medium">and</span> write-ups are handed to the
          extension. Then you open your report in Spectora and click its two buttons.
          Copy/paste stays available as a backup.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Method:</span>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => {
                setMode("trever");
                // Trever's hand-built reports use no individual defect boxes;
                // the write-ups carry every defect. Opt back in via the box.
                setIncludeDefectBoxes(false);
                setRows(null);
              }}
              className={`px-3 py-1.5 ${mode === "trever" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              Trever method
            </button>
            <button
              onClick={() => {
                setMode("standard");
                // Standard IS the one-defect-box-per-finding method — without
                // defect boxes it would do almost nothing.
                setIncludeDefectBoxes(true);
                setRows(null);
              }}
              className={`px-3 py-1.5 border-l border-gray-300 ${mode === "standard" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              Standard
            </button>
          </div>
        </div>
        {mode === "trever" && (
          <label className="mt-3 flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDefectBoxes}
              onChange={(e) => { setIncludeDefectBoxes(e.target.checked); setRows(null); }}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Also check individual Defect boxes</span> — leave
              this off to match Trever&rsquo;s hand-built reports (his 19-finding report contains
              no individual defect checkboxes; every defect lives in a write-up). Turning it on
              ticks a box per defect on top of the write-ups, which produces a much longer
              report. (Standard method always ticks defect boxes — that&rsquo;s what it is.)
            </span>
          </label>
        )}

        <p className="text-xs text-gray-500 mt-2">
          {mode === "trever" ? (
            <>
              <span className="font-medium">Trever method:</span> checks{" "}
              <span className="font-medium">Information, Limitations and Defects</span> boxes.
              Information boxes (materials, brands, amperage, locations) are read straight from
              the transcript. Two or more like-kind deficiencies become one grouped write-up;
              a <span className="font-medium">stand-alone</span> deficiency that a library box
              already covers is ticked here instead, so your own stored wording carries it.
              Open <span className="font-medium">Report entry → Trever 2026</span> first so
              those stand-alone boxes are included.
            </>
          ) : (
            <>
              <span className="font-medium">Standard:</span> every defect checks its own
              pre-written <span className="font-medium">Defects</span> box, which auto-fills
              that box&rsquo;s library wording. This is how most inspectors work.
            </>
          )}
        </p>
        {!composed && mode === "trever" && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold">
                The grouped write-ups haven&apos;t been created yet.
              </span>{" "}
              The Trever method places grouped write-ups, so open Step 2 with the{" "}
              <span className="font-medium">Trever 2026</span> style first — that&apos;s
              what builds them (Step 2&apos;s Standard view is copy/paste only).
            </span>
            <button
              onClick={onBackToWrite}
              className="shrink-0 text-sm rounded-lg border border-amber-400 hover:bg-amber-100 px-3 py-1.5 font-medium"
            >
              ← Step 2
            </button>
          </div>
        )}
        {!composed && mode === "standard" && (
          <p className="mt-3 text-xs text-gray-600">
            Standard method needs no written report first — every checked Defect box
            auto-fills with your template&apos;s stored wording. Your Step 2 comments
            stay copy/paste in this method; for automatic write-up placement, use
            Step 2&apos;s <span className="font-medium">Trever 2026</span> style.
          </p>
        )}
        <button
          onClick={matchAndSend}
          disabled={loading}
          className="mt-4 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5"
        >
          {loading
            ? "Matching…"
            : rows
            ? "Re-match & send again"
            : "Match findings & send to Spectora"}
        </button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {infoError && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Information boxes: </span>
            {infoError}
          </div>
        )}
      </div>

      {rows && (
        <>
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Build list — {matched.length} of {rows.length} findings matched
                {infoCount > 0 ? ` · ${infoCount} Information box${infoCount === 1 ? "" : "es"}` : ""}
                {standaloneCount > 0
                  ? ` · ${standaloneCount} stand-alone defect box${standaloneCount === 1 ? "" : "es"}`
                  : ""}
              </h3>
              <div className="flex items-center gap-2">
                {sendState === "sent" && (
                  <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                    Sent ✓ {ackedAt > 0 ? new Date(ackedAt).toLocaleTimeString() : ""}
                  </span>
                )}
                {sendState === "failed" && (
                  <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
                    Extension not found — use Copy
                  </span>
                )}
                <button
                  onClick={() => sendBoth()}
                  disabled={!lines || sendState === "sending"}
                  className="text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-3 py-1.5"
                >
                  {sendState === "sending"
                    ? "Sending…"
                    : sendState === "sent"
                    ? "Send again"
                    : "Send to extension"}
                </button>
                <button
                  onClick={copyLines}
                  disabled={!lines}
                  className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5"
                >
                  {copied ? "Copied ✓" : "Copy list"}
                </button>
              </div>
            </div>
            {sendState === "sent" && (
              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                <div className="font-semibold mb-1">
                  Everything is in the extension — checkbox list
                  {composed ? " + write-ups" : ""} ✓
                </div>
                <ol className="list-decimal pl-5 space-y-0.5">
                  <li>Open your report in Spectora (same browser).</li>
                  <li>
                    In the HyperReports panel, click{" "}
                    <span className="font-medium">Build report</span>.
                  </li>
                  <li>
                    Then click <span className="font-medium">Place custom write-ups</span>.
                  </li>
                  <li>Read the log — it ends with a verified count.</li>
                </ol>
              </div>
            )}
            <textarea
              readOnly
              value={lines}
              className="mt-3 w-full h-40 font-mono text-xs border border-gray-300 rounded-lg p-3"
            />
          </div>

          {review.length > 0 && (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
              <h3 className="font-semibold text-sm text-amber-900">
                {mode === "trever"
                  ? `${review.length} covered by your write-ups — not checked`
                  : `${review.length} need your eyes — no confident checkbox match`}
              </h3>
              <p className="text-xs text-amber-800 mt-1">
                {mode === "trever" ? (
                  <>
                    No pre-written box fits these (or the match was weak), so they are
                    deliberately left unchecked &mdash; a wrong box would pull in the wrong
                    recommendation. They belong in the consolidated write-ups (Report entry
                    → Trever 2026). Check the list to be sure nothing is missing there.
                  </>
                ) : (
                  <>
                    These findings didn&rsquo;t line up with a pre-written box (or the match
                    was weak). Handle them by hand in Spectora, or tell me the right box and
                    I&rsquo;ll teach the mapping.
                  </>
                )}
              </p>
              <ul className="mt-3 space-y-2">
                {review.map((r) => (
                  <li key={r.finding_id} className="text-sm">
                    <span className="font-medium">{titleById.get(r.finding_id)}</span>
                    <span className="text-gray-500">
                      {" "}
                      — {r.section} › {r.item}
                      {r.box_label
                        ? ` → “${r.box_label}” (low confidence)`
                        : " → no match"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="font-semibold text-sm">All matches</h3>
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <li key={r.finding_id} className="text-sm flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-block w-2 h-2 rounded-full ${
                      r.box_label && !r.needs_review
                        ? "bg-green-500"
                        : r.box_label
                        ? "bg-amber-400"
                        : "bg-gray-300"
                    }`}
                  />
                  <span>
                    <span className="font-medium">{titleById.get(r.finding_id)}</span>{" "}
                    <span className="text-gray-500">
                      → {r.box_label ? `${r.item} › ${r.box_label}` : "no match"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Review & edit tab
// -----------------------------------------------------------------------------

function ReviewTab({
  report,
  onUpdateFinding,
  onDeleteFinding,
  onAddFinding,
  onAppend,
  onAddHyper,
  onNext,
}: {
  report: InspectionReport;
  onUpdateFinding: (id: string, patch: Partial<Finding>) => void;
  onDeleteFinding: (id: string) => void;
  onAddFinding: () => void;
  onAppend: (text: string) => Promise<{ removedTitles: string[]; added: number }>;
  onAddHyper: (finding: any, labelLine: string | null) => void;
  onNext: () => void;
}) {
  const groups = useMemo(() => groupBySection(report.findings), [report.findings]);
  const secondRead = report.meta?.second_read;
  // ---- Hey Hyper (photo second opinion + label reader) ----
  const [hyOpen, setHyOpen] = useState(false);
  const [hyImages, setHyImages] = useState<{ data: string; media_type: string }[]>([]);
  const [hyQuestion, setHyQuestion] = useState("");
  const [hyBusy, setHyBusy] = useState(false);
  const [hyErr, setHyErr] = useState<string | null>(null);
  const [hyResult, setHyResult] = useState<any>(null);

  async function hyAddFiles(files: FileList | null) {
    if (!files) return;
    const out: HyImage[] = [];
    for (const file of Array.from(files).slice(0, 12)) {
      out.push(await fileToHyImage(file));
    }
    setHyImages((cur) => [...cur, ...out].slice(0, 12));
  }

  async function hyAsk() {
    if (!hyImages.length || hyBusy) return;
    setHyBusy(true);
    setHyErr(null);
    setHyResult(null);
    try {
      // A big batch can exceed the server's request-size cap — squeeze it
      // down first rather than letting the request bounce.
      const sendable = await shrinkToBudget(hyImages);
      const res = await fetch("/api/hyper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: sendable, question: hyQuestion.trim() }),
      });
      const data = await readHyperResponse(res);
      setHyResult(data.result);
    } catch (e) {
      setHyErr((e as Error).message);
    } finally {
      setHyBusy(false);
    }
  }

  function hyLabelLine(): string | null {
    const l = hyResult?.label;
    if (!l) return null;
    const parts = [
      hyResult.component_type,
      l.brand && `brand ${l.brand}`,
      l.model && `model ${l.model}`,
      l.serial && `serial ${l.serial}`,
      l.capacity && `capacity ${l.capacity}`,
      l.fuel_or_power && `${l.fuel_or_power}`,
      l.manufactured && `manufactured ${l.manufactured}`,
    ].filter(Boolean);
    return parts.length > 1 ? parts.join(", ") : null;
  }

  function hyAdd() {
    if (!hyResult?.finding) return;
    onAddHyper(hyResult.finding, hyLabelLine());
    setHyOpen(false);
    setHyImages([]);
    setHyQuestion("");
    setHyResult(null);
  }
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addResult, setAddResult] = useState<{
    removedTitles: string[];
    added: number;
  } | null>(null);

  async function runAppend() {
    if (!addText.trim() || addBusy) return;
    setAddBusy(true);
    setAddErr(null);
    try {
      const r = await onAppend(addText.trim());
      setAddResult(r);
      setAddText("");
      setAddOpen(false);
    } catch (e) {
      setAddErr((e as Error).message);
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {secondRead?.checked && secondRead.added > 0 && (
        <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
          <span className="font-semibold">
            The second read caught {secondRead.added} finding
            {secondRead.added === 1 ? "" : "s"} the first pass missed
          </span>{" "}
          — marked &ldquo;Caught on second read&rdquo; below. Give {secondRead.added === 1 ? "it" : "them"} a
          look: this is the double-check working, but it can occasionally re-add
          something you meant to leave out.
        </div>
      )}
      {secondRead?.checked && secondRead.added === 0 && (
        <p className="text-xs text-gray-500">
          Second read: the transcript was re-read against these findings — nothing was missed.
        </p>
      )}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Edit any field, change severity, delete, or add findings. Changes save
          automatically.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHyOpen((o) => !o)}
            className="text-sm rounded-lg bg-white border border-teal-300 text-teal-800 hover:bg-teal-50 px-3 py-2 font-medium"
          >
            📸 Hey Hyper
          </button>
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="text-sm rounded-lg bg-white border border-gray-300 hover:bg-gray-50 px-3 py-2 font-medium"
          >
            + Add more audio
          </button>
          <button
            onClick={onAddFinding}
            className="text-sm rounded-lg bg-white border border-gray-300 hover:bg-gray-50 px-3 py-2 font-medium"
          >
            + Add finding
          </button>
          <button
            onClick={onNext}
            className="text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2"
          >
            Next: Write the report →
          </button>
        </div>
      </div>

      {hyOpen && (
        <div className="rounded-2xl border border-teal-300 bg-white p-4">
          <div className="text-sm font-semibold mb-1">
            Hey Hyper — not sure about something? 📸
          </div>
          <p className="text-xs text-gray-600 mb-2">
            Drop photos of one item (multiple angles welcome, up to 12) and ask your
            question — or just ask for Hyper&apos;s best read. You&apos;ll get what it is,
            the visible evidence, an honest age range, and a report-ready write-up to
            compare against your own call.{" "}
            <span className="font-medium">
              Informational only — your inspection, your judgment.
            </span>
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const input = e.currentTarget;
              void hyAddFiles(input.files).finally(() => {
                // Reset so the picker's label never shows a stale filename and
                // the same file can be re-picked after a remove.
                input.value = "";
              });
            }}
            className="text-sm"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            Choosing more files <span className="font-medium">adds</span> them to
            the photos below (up to 12) — every photo shown goes with your question.
          </p>
          {hyImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {hyImages.map((img, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${img.media_type};base64,${img.data}`}
                    alt={`photo ${i + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-teal-200"
                  />
                  <button
                    onClick={() => setHyImages((cur) => cur.filter((_, j) => j !== i))}
                    title="Remove this photo"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gray-800 hover:bg-red-600 text-white text-[10px] leading-5 text-center"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={hyQuestion}
            onChange={(e) => setHyQuestion(e.target.value)}
            placeholder="Your question (optional) — e.g. “How old are these windows?” or “Is this mold or staining?”"
            className="mt-2 w-full h-16 text-sm border border-gray-300 rounded-lg p-3"
          />
          {hyErr && <p className="text-sm text-red-600 mt-2">{hyErr}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={hyAsk}
              disabled={hyBusy || !hyImages.length}
              className="text-sm rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium px-4 py-2"
            >
              {hyBusy ? "Hyper's looking…" : "Ask Hyper"}
            </button>
            {(hyImages.length > 0 || hyResult || hyQuestion) && (
              <button
                onClick={() => {
                  setHyImages([]);
                  setHyQuestion("");
                  setHyResult(null);
                  setHyErr(null);
                }}
                disabled={hyBusy}
                className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-4 py-2"
              >
                ↺ Start new check
              </button>
            )}
            <button
              onClick={() => setHyOpen(false)}
              className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 px-4 py-2"
            >
              Close
            </button>
          </div>
          {hyResult && (
            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-gray-900 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-semibold">{hyResult.component_type}</span>
                <ConfidenceBadge
                  band={hyResult.type_confidence}
                  percent={hyResult.type_confidence_percent}
                />
              </div>
              <p>{hyResult.assessment}</p>
              {hyResult.age_statement && (
                <p>
                  <span className="font-medium">Age:</span> {hyResult.age_statement}
                </p>
              )}
              {Array.isArray(hyResult.evidence) && hyResult.evidence.length > 0 && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Based on:</span>{" "}
                  {hyResult.evidence.join("; ")}
                </p>
              )}
              {hyResult.label && (
                <p className="text-xs bg-white border border-teal-200 rounded-lg p-2">
                  <span className="font-medium">Label read:</span>{" "}
                  {[
                    hyResult.label.brand,
                    hyResult.label.model && `Model ${hyResult.label.model}`,
                    hyResult.label.serial && `Serial ${hyResult.label.serial}`,
                    hyResult.label.capacity,
                    hyResult.label.fuel_or_power,
                    hyResult.label.manufactured &&
                      `Mfg ${hyResult.label.manufactured}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {hyResult.label.decode_note ? ` — ${hyResult.label.decode_note}` : ""}
                </p>
              )}
              <div className="bg-white border border-teal-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-teal-800 mb-1">
                  Report-ready write-up (in your voice):
                </div>
                <p className="whitespace-pre-line">{hyResult.finding?.comment}</p>
              </div>
              <button
                onClick={hyAdd}
                className="text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2"
              >
                Add to report as a finding
              </button>
            </div>
          )}
        </div>
      )}

      {addOpen && (
        <div className="rounded-2xl border border-gray-300 bg-white p-4">
          <div className="text-sm font-semibold mb-1">
            Add more audio to this inspection
          </div>
          <p className="text-xs text-gray-600 mb-2">
            Recorded something after the walkthrough — the garage, a correction from
            the truck? Paste that transcript here. New findings are added and marked;
            if the new recording corrects or withdraws something, the later statement
            wins and you&apos;ll see exactly what was removed. Your edits stay.
          </p>
          <textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder="Paste the extra transcript here…"
            className="w-full h-32 text-sm border border-gray-300 rounded-lg p-3 font-mono"
          />
          {addErr && <p className="text-sm text-red-600 mt-2">{addErr}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={runAppend}
              disabled={addBusy || !addText.trim()}
              className="text-sm rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-medium px-4 py-2"
            >
              {addBusy ? "Processing… (about a minute)" : "Add to this report"}
            </button>
            <button
              onClick={() => setAddOpen(false)}
              className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {addResult && (
        <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 text-sm text-blue-900">
          <span className="font-semibold">
            Addendum processed: {addResult.added} finding
            {addResult.added === 1 ? "" : "s"} added
          </span>
          {addResult.added > 0 ? " — marked “From added audio” below." : "."}
          {addResult.removedTitles.length > 0 && (
            <div className="mt-1 text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Removed because the new recording overrode them (later statement wins):{" "}
              {addResult.removedTitles.join("; ")}
            </div>
          )}
        </div>
      )}

      {report.findings.length === 0 && (
        <div className="text-center text-gray-500 py-12 bg-white rounded-2xl border border-gray-200">
          No findings yet. Add one manually, or start a new report.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {g.key}
          </h3>
          <div className="space-y-3">
            {g.findings.map((f) => (
              <FindingEditor
                key={f.id}
                finding={f}
                onChange={(patch) => onUpdateFinding(f.id, patch)}
                onDelete={() => onDeleteFinding(f.id)}
              />
            ))}
          </div>
        </div>
      ))}
      <NextButton label="Next: Write the report" onClick={onNext} />
    </div>
  );
}

function FindingEditor({
  finding,
  onChange,
  onDelete,
}: {
  finding: Finding;
  onChange: (patch: Partial<Finding>) => void;
  onDelete: () => void;
}) {
  const sev = SEVERITY_BY_KEY[finding.severity as SeverityKey];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <select
          value={finding.severity}
          onChange={(e) => onChange({ severity: e.target.value })}
          className="text-sm rounded-lg border border-gray-300 px-2 py-1.5"
        >
          {SEVERITY_LEVELS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          value={finding.section}
          onChange={(e) => onChange({ section: e.target.value })}
          className="text-sm rounded-lg border border-gray-300 px-2 py-1.5"
        >
          {SECTION_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {!SECTION_ORDER.includes(finding.section) && (
            <option value={finding.section}>{finding.section}</option>
          )}
        </select>

        <input
          value={finding.subsection ?? ""}
          onChange={(e) => onChange({ subsection: e.target.value || null })}
          placeholder="Subsection / room"
          className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 w-40"
        />
        <input
          value={finding.component ?? ""}
          onChange={(e) => onChange({ component: e.target.value || null })}
          placeholder="Component"
          className="text-sm rounded-lg border border-gray-300 px-2 py-1.5 w-40"
        />

        {finding.flags?.includes("low_confidence") && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
            Low confidence — check
          </span>
        )}
        {finding.flags?.includes("second_read") && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
            Caught on second read — verify
          </span>
        )}
        {finding.flags?.includes("addendum") && (
          <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
            From added audio
          </span>
        )}
        {finding.flags?.includes("cosmetic") && (
          <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
            Cosmetic — punch list
          </span>
        )}
        {finding.flags?.includes("hyper_photo") && (
          <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
            From photo check — verify
          </span>
        )}

        <button
          onClick={onDelete}
          className="ml-auto text-sm text-red-600 hover:text-red-700 hover:underline"
        >
          Delete
        </button>
      </div>

      <input
        value={finding.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Finding title (short headline)"
        className="w-full text-sm font-medium rounded-lg border border-gray-300 px-3 py-2 mb-2"
      />

      <input
        list="recommendation-types"
        value={finding.recommendation_type}
        onChange={(e) => onChange({ recommendation_type: e.target.value })}
        placeholder="Recommendation"
        className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2 mb-2"
      />
      <datalist id="recommendation-types">
        {RECOMMENDATION_TYPES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <textarea
        value={finding.comment}
        onChange={(e) => onChange({ comment: e.target.value })}
        rows={2}
        placeholder="Report comment"
        className="w-full text-sm rounded-lg border border-gray-300 px-3 py-2"
      />

      {sev && (
        <div className="mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${sev.badge}`}>
            {sev.label}
          </span>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Report entry tab (copy-optimized for pasting into Spectora)
// -----------------------------------------------------------------------------

interface ComposedGroupRow {
  section: string;
  heading: string;
  body: string;
  /** Target Spectora item, chosen server-side (the section's "… General"). */
  item?: string;
  /** Spectora rating chip: safety | recommendation | maintenance. */
  severity?: string;
  /** Library checkbox that covers this stand-alone deficiency, if any. */
  box_label?: string | null;
}
interface ComposedReportData {
  audience?: "standard" | "investor";
  style: string;
  property_overview: string;
  groups: ComposedGroupRow[];
}

// Build the payload the browser extension parses to PLACE these write-ups into
// Spectora. The target item comes from the server (the section's "… General"
// item, which is where consolidated write-ups live); fall back to the most
// common subsection among that section's findings only if it's missing.
function buildExtensionPayload(
  composed: ComposedReportData,
  findings: Finding[]
): string {
  const bySection = new Map<string, Map<string, number>>();
  for (const f of findings) {
    const sec = f.section || "";
    if (!bySection.has(sec)) bySection.set(sec, new Map());
    const item = f.subsection || "";
    if (item) {
      const m = bySection.get(sec)!;
      m.set(item, (m.get(item) || 0) + 1);
    }
  }
  const fallbackItem = (sec: string) => {
    const m = bySection.get(sec);
    if (!m || !m.size) return "";
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  // Investor reports open with the punch-list portal link at 1.1.1, exactly as
  // his published Melissa reports do. Same standing Airtable URL every time
  // (per Tia — one portal, filtered per property on their side).
  const PUNCH_LIST_URL = "https://airtable.com/appI1DwyiHk6f4AiA/pag2hTyRMFrMvqjxY";
  const punchLinkBlock =
    composed.audience === "investor"
      ? `@@SECTION: Inspection Details\n@@ITEM: Cosmetic Punch List Report Link\n@@SEVERITY: recommendation\n@@HEADING: CLICK ON LINK TO REVIEW PUNCH-LIST PORTAL\n@@BODY\nMAKE SURE TO SAVE THE REPORT\nCLICK HERE TO REVIEW PUNCHLIST PORTAL: ${PUNCH_LIST_URL}\n@@END`
      : "";
  // The Property Condition Overview leads the report. In every published 2026
  // report it lives in Inspection Details › PROPERTY CONDITION OVERVIEW as a
  // rated comment (which is what puts it at the top of Spectora's summary) —
  // NOT in the empty "General Overview" section at the back.
  const overviewBlock = composed.property_overview?.trim()
    ? `@@SECTION: Inspection Details\n@@ITEM: PROPERTY CONDITION OVERVIEW\n@@SEVERITY: recommendation\n@@HEADING: Overview\n@@BODY\n${composed.property_overview.trim()}\n@@END`
    : "";
  const groupBlocks = composed.groups
    // Stand-alone deficiencies matched to a library checkbox are ticked in the
    // Build-report pass instead — typing them here too would duplicate them.
    .filter((g) => !g.box_label)
    .map(
      (g) =>
        `@@SECTION: ${g.section}\n@@ITEM: ${g.item || fallbackItem(g.section)}\n@@SEVERITY: ${g.severity || "recommendation"}\n@@HEADING: ${g.heading}\n@@BODY\n${g.body}\n@@END`
    );
  return [punchLinkBlock, overviewBlock, ...groupBlocks].filter(Boolean).join("\n\n");
}

function EntryTab({
  report,
  composed,
  setComposed,
  onNext,
}: {
  report: InspectionReport;
  composed: ComposedReportData | null;
  setComposed: (c: ComposedReportData | null) => void;
  onNext: () => void;
}) {
  const groups = useMemo(() => groupBySection(report.findings), [report.findings]);
  const [copied, setCopied] = useState<string | null>(null);
  // His voice is the product — it composes itself the moment this step opens.
  const [style, setStyle] = useState<"standard" | "trever-2026">("trever-2026");
  // Investor ("Melissa") style: auto-selected when the walkthrough asks for it,
  // and switchable by hand either way.
  const detectedInvestor = useMemo(
    () => /melissa|investor (?:style|report|client)|write .{0,20}investor/i.test(report.meta?.transcript || ""),
    [report.meta?.transcript]
  );
  const [audience, setAudience] = useState<"standard" | "investor">(
    detectedInvestor ? "investor" : "standard"
  );
  const [punchList, setPunchList] = useState<{ title: string; section: string }[]>([]);
  const [composing, setComposing] = useState(false);
  const [missing, setMissing] = useState<
    { title: string; comment: string; section: string }[]
  >([]);
  const [droppedTerms, setDroppedTerms] = useState<string[]>([]);
  const [checks, setChecks] = useState<{
    findings: number;
    retried: boolean;
    retryReasons: string[];
    appendedTerms: string[];
  } | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Hand the write-ups to the extension the moment they exist (or change),
  // and let the inspector fire the same send by button — with a clear answer
  // about whether the extension actually received it.
  const ackedAt = useExtensionBridge();
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  useEffect(() => {
    if (ackedAt) setSendState("sent");
  }, [ackedAt]);
  useEffect(() => {
    if (!composed) return;
    sendToExtension({
      writeups: buildExtensionPayload(composed, report.findings),
      address: report.inspection?.property_address || "",
    });
  }, [composed, report.findings, report.inspection?.property_address]);
  function sendNow() {
    if (!composed) return;
    setSendState("sending");
    sendToExtension({
      writeups: buildExtensionPayload(composed, report.findings),
      address: report.inspection?.property_address || "",
    });
    setTimeout(
      () => setSendState((s) => (s === "sending" ? "failed" : s)),
      1500
    );
  }

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    });
  }

  async function runCompose(force = false, aud: "standard" | "investor" = audience) {
    if (composing || (composed && !force)) return;
    {
      setComposing(true);
      setComposeError(null);
      try {
        const res = await fetch("/api/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // A forced re-write must not be answered from any cache along the way.
          cache: "no-store",
          body: JSON.stringify({
            report,
            audience: aud,
            nonce: force ? Date.now() : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not write up the report.");
        setComposed(data.composed as ComposedReportData);
        setMissing(Array.isArray(data.missing) ? data.missing : []);
        setDroppedTerms(Array.isArray(data.droppedTerms) ? data.droppedTerms : []);
        setPunchList(Array.isArray(data.punchList) ? data.punchList : []);
        setChecks(data.checks ?? null);
      } catch (e) {
        setComposeError((e as Error).message);
      } finally {
        setComposing(false);
      }
    }
  }

  function selectAudience(next: "standard" | "investor") {
    if (next === audience) return;
    setAudience(next);
    void runCompose(true, next);
  }

  function selectStyle(next: "standard" | "trever-2026") {
    setStyle(next);
    if (next === "trever-2026") void runCompose();
  }

  // Auto-compose on arrival (guarded: no-op when already composed or running).
  useEffect(() => {
    if (style === "trever-2026") void runCompose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const StyleToggle = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Style:</span>
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
        <button
          onClick={() => selectStyle("standard")}
          className={`px-3 py-1.5 ${style === "standard" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
        >
          Standard
        </button>
        <button
          onClick={() => selectStyle("trever-2026")}
          className={`px-3 py-1.5 border-l border-gray-300 ${style === "trever-2026" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
        >
          Trever 2026
        </button>
      </div>
    </div>
  );

  if (style === "trever-2026") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-500">
            Trever&apos;s 2026 voice — grouped write-ups you can paste as a block.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">For:</span>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
                <button
                  onClick={() => selectAudience("standard")}
                  className={`px-3 py-1.5 ${audience === "standard" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
                >
                  Home buyer
                </button>
                <button
                  onClick={() => selectAudience("investor")}
                  className={`px-3 py-1.5 border-l border-gray-300 ${audience === "investor" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
                >
                  Investor (Melissa)
                </button>
              </div>
            </div>
            {StyleToggle}
            <button
              onClick={onNext}
              className="text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2"
            >
              Next: Send to Spectora →
            </button>
          </div>
        </div>
        {detectedInvestor && audience === "investor" && (
          <p className="text-xs text-indigo-700">
            Investor style selected automatically — the walkthrough asks for it. Switch to
            &ldquo;Home buyer&rdquo; above if that&apos;s wrong.
          </p>
        )}
        {punchList.length > 0 && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
            <span className="font-semibold">
              Routed to the cosmetic punch list ({punchList.length}):
            </span>{" "}
            {punchList.map((p) => p.title).join("; ")} — these stay out of the report
            write-ups (investor style) and live in the{" "}
            <span className="font-medium">Punch list</span> tab instead.
          </div>
        )}
        {composing && <p className="text-sm text-gray-500">Writing up the report…</p>}
        {composeError && <p className="text-sm text-red-600">{composeError}</p>}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => void runCompose(true)}
            disabled={composing}
            className="text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5"
          >
            {composing ? "Re-writing…" : "Re-write from scratch"}
          </button>
          <span className="text-[11px] text-gray-400">
            Write-ups are kept until you re-write or reload.
          </span>
        </div>
        {checks && (
          <p className="text-xs text-gray-500">
            Coverage check: {checks.findings} findings ·{" "}
            {checks.retried
              ? `re-run once (${checks.retryReasons.join("; ")})`
              : "passed first time"}
            {checks.appendedTerms.length
              ? ` · added back by the tool: ${checks.appendedTerms.join(", ")}`
              : ""}
          </p>
        )}
        {droppedTerms.length > 0 && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <span className="font-semibold">
              Named in your findings but missing from the write-ups:
            </span>{" "}
            {droppedTerms.join(", ")}. Add the term explicitly — naming the material is
            the finding.
          </div>
        )}
        {missing.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900">
              {missing.length} finding{missing.length === 1 ? "" : "s"} did not make it into
              a write-up — add {missing.length === 1 ? "it" : "them"} by hand
            </div>
            <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc pl-5">
              {missing.map((m, i) => (
                <li key={i}>
                  <span className="font-medium">{m.title}</span>
                  {m.section ? ` — ${m.section}` : ""}: {m.comment}
                </li>
              ))}
            </ul>
          </div>
        )}
        {composed && (
          <>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 flex items-center justify-between gap-3">
              <div className="text-sm text-purple-900">
                {sendState === "sent" ? (
                  <>
                    <span className="font-semibold">
                      Write-ups sent to the extension ✓
                      {ackedAt > 0 ? ` at ${new Date(ackedAt).toLocaleTimeString()}` : ""}
                    </span>{" "}
                    — open your report in Spectora; the panel&apos;s “Place custom write-ups” box
                    is already filled.
                  </>
                ) : sendState === "failed" ? (
                  <>
                    <span className="font-semibold text-red-700">
                      Extension not found on this browser.
                    </span>{" "}
                    Install/enable the HyperReports extension and refresh this page — or use Copy
                    and paste into the extension in Spectora.
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Write-ups ready</span> — send them to the
                    extension, or copy and paste.
                  </>
                )}
              </div>
              <button
                onClick={sendNow}
                disabled={sendState === "sending"}
                className="shrink-0 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium px-3 py-2"
              >
                {sendState === "sending"
                  ? "Sending…"
                  : sendState === "sent"
                  ? "Send again"
                  : "Send to extension"}
              </button>
              <button
                onClick={() => copy(buildExtensionPayload(composed, report.findings), "payload")}
                className="shrink-0 ml-3 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium px-3 py-2"
              >
                {copied === "payload" ? "Copied ✓" : "Copy for extension"}
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold">Property Condition Overview</div>
                <button
                  onClick={() => copy(composed.property_overview, "overview")}
                  className="text-xs rounded-md border border-gray-300 hover:bg-gray-50 px-2.5 py-1"
                >
                  {copied === "overview" ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                {composed.property_overview}
              </p>
            </div>
            {composed.groups.map((g, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {g.heading}
                    {g.severity === "safety" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                        Safety Hazard
                      </span>
                    )}
                    {g.severity === "maintenance" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-sky-100 text-sky-700 px-2 py-0.5">
                        Maintenance
                      </span>
                    )}
                    {g.box_label && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                        Checkbox
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => copy(`${g.heading}\n\n${g.body}`, "g" + i)}
                    className="text-xs rounded-md border border-gray-300 hover:bg-gray-50 px-2.5 py-1"
                  >
                    {copied === "g" + i ? "Copied ✓" : "Copy write-up"}
                  </button>
                </div>
                <div className="text-xs text-gray-400 mb-1">
                  {g.section}
                  {g.item ? ` › ${g.item}` : ""}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                  {g.body}
                </p>
              </div>
            ))}
          </>
        )}
        <NextButton label="Next: Send to Spectora" onClick={onNext} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Findings in Spectora&apos;s section order. Copy each comment, then check
          the matching severity and recommendation boxes as you paste.
        </p>
        {StyleToggle}
      </div>
      {groups.map((g) => (
        <div key={g.key} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-semibold">
            {g.key}
          </div>
          <div className="divide-y divide-gray-100">
            {g.findings.map((f) => {
              const sev = SEVERITY_BY_KEY[f.severity as SeverityKey];
              return (
                <div key={f.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                    {f.subsection && (
                      <span className="text-gray-500">
                        {f.subsection}
                        {f.component ? ` › ${f.component}` : ""}
                      </span>
                    )}
                    {sev && (
                      <span className={`px-2 py-0.5 rounded-full ${sev.badge}`}>
                        {sev.label}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      {f.recommendation_type}
                    </span>
                  </div>
                  {f.title && (
                    <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                  )}
                  <p className="text-sm text-gray-800 leading-relaxed mt-0.5">
                    {f.comment}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => copy(f.title, f.id + ":t")}
                      className="text-xs rounded-md border border-gray-300 hover:bg-gray-50 px-2.5 py-1"
                    >
                      {copied === f.id + ":t" ? "Copied ✓" : "Copy title"}
                    </button>
                    <button
                      onClick={() => copy(f.comment, f.id + ":c")}
                      className="text-xs rounded-md border border-gray-300 hover:bg-gray-50 px-2.5 py-1"
                    >
                      {copied === f.id + ":c" ? "Copied ✓" : "Copy comment"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Client punch list tab (clean, color-coded, printable)
// -----------------------------------------------------------------------------

function PunchTab({
  report,
  counts,
}: {
  report: InspectionReport;
  counts: Record<string, number>;
}) {
  const groups = useMemo(() => groupByRoom(report.findings), [report.findings]);
  const cosmetic = useMemo(
    () => report.findings.filter((f) => f.flags?.includes("cosmetic")),
    [report.findings]
  );
  const [plRows, setPlRows] = useState<
    { sno: string; item: string; description: string }[] | null
  >(null);
  const [plBusy, setPlBusy] = useState(false);
  const [plErr, setPlErr] = useState<string | null>(null);
  const [plCopied, setPlCopied] = useState(false);

  async function generatePunchList() {
    if (plBusy) return;
    setPlBusy(true);
    setPlErr(null);
    try {
      const res = await fetch("/api/punchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ALL findings go in — his approved lists deliberately overlap the
        // report with crew-executable items (escutcheons, downspouts,
        // hardware, cleanup). The prompt decides what the crew can execute.
        body: JSON.stringify({
          findings: report.findings.map((f) => ({
            title: f.title,
            comment: f.comment,
            section: f.section,
            location_tags: f.location_tags,
            cosmetic: !!f.flags?.includes("cosmetic"),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not build the punch list.");
      setPlRows(data.rows || []);
    } catch (e) {
      setPlErr((e as Error).message);
    } finally {
      setPlBusy(false);
    }
  }

  async function copyPunchList() {
    if (!plRows) return;
    const tsv = plRows
      .map((r) => `${r.sno}\t${r.item}\t${r.description}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setPlCopied(true);
      setTimeout(() => setPlCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      {cosmetic.length > 0 && (
        <div className="mb-6 rounded-2xl border border-purple-200 bg-purple-50 p-5 no-print">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-purple-900">
                Cosmetic punch list — {cosmetic.length} item
                {cosmetic.length === 1 ? "" : "s"} (investor)
              </h3>
              <p className="text-xs text-purple-800 mt-0.5">
                His approved format: AREA-## · Checklist Item · what the crew should do.
                Copy pastes straight into the Airtable grid as rows.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={generatePunchList}
                disabled={plBusy}
                className="text-sm rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium px-4 py-2"
              >
                {plBusy
                  ? "Building… (about a minute)"
                  : plRows
                  ? "Re-build punch list"
                  : "Build punch list"}
              </button>
              {plRows && (
                <button
                  onClick={copyPunchList}
                  className="text-sm rounded-lg border border-purple-300 hover:bg-purple-100 px-4 py-2 font-medium text-purple-900"
                >
                  {plCopied ? "Copied ✓" : "Copy for Airtable"}
                </button>
              )}
            </div>
          </div>
          {plErr && <p className="text-sm text-red-600 mt-2">{plErr}</p>}
          {plRows && (
            <div className="mt-4 bg-white rounded-xl border border-purple-200 overflow-hidden">
              <div className="px-4 py-2 border-b border-purple-100 text-sm font-semibold">
                {(report.inspection.property_address || "PROPERTY").toUpperCase()} PUNCHLIST
                <span className="text-purple-700 font-normal"> · {plRows.length} rows</span>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-2">S. No.</th>
                      <th className="px-4 py-2">Checklist Item</th>
                      <th className="px-4 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {plRows.map((r) => (
                      <tr key={r.sno}>
                        <td className="px-4 py-1.5 font-mono text-xs whitespace-nowrap">{r.sno}</td>
                        <td className="px-4 py-1.5 font-medium">{r.item}</td>
                        <td className="px-4 py-1.5 text-gray-700">{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between items-start mb-4 no-print">
        <p className="text-sm text-gray-500">
          A clean summary you can print or save as PDF for the client.
        </p>
        <button
          onClick={() => window.print()}
          className="text-sm rounded-lg bg-white border border-gray-300 hover:bg-gray-50 px-3 py-2 font-medium"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 print-full">
        <div className="mb-6">
          <h2 className="text-xl font-semibold">Inspection Summary</h2>
          {report.inspection.property_address && (
            <p className="text-gray-600">{report.inspection.property_address}</p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {[
              report.inspection.inspection_date,
              report.inspection.client_name &&
                `Prepared for ${report.inspection.client_name}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {SEVERITY_LEVELS.map((s) => (
            <div
              key={s.key}
              className="rounded-xl border p-3 text-center"
              style={{ borderColor: s.color + "40", background: s.color + "10" }}
            >
              <div className="text-2xl font-bold" style={{ color: s.color }}>
                {counts[s.key] || 0}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Findings by room */}
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-200">
                {g.key}
              </h3>
              <div className="space-y-2">
                {g.findings.map((f) => {
                  const sev = SEVERITY_BY_KEY[f.severity as SeverityKey];
                  return (
                    <div
                      key={f.id}
                      className="pl-3 py-1"
                      style={{ borderLeft: `4px solid ${sev?.color ?? "#9ca3af"}` }}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: sev?.color }}
                        >
                          {severityLabel(f.severity)}
                        </span>
                        {f.title && (
                          <span className="text-sm font-semibold text-gray-900">
                            {f.title}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">{f.comment}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {report.findings.length === 0 && (
          <p className="text-gray-500 text-center py-8">No findings recorded.</p>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Small shared bits
// -----------------------------------------------------------------------------

function DetailInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="mt-0.5 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
        active
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
