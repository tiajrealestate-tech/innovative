"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Finding,
  InspectionDetails,
  InspectionReport,
  blankFinding,
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

type Tab = "review" | "entry" | "punch" | "spectora";

export default function ReviewPage() {
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [loaded, setLoaded] = useState(false);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    setReport(loadReport());
    setLoaded(true);
  }, []);

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

          {/* Tabs */}
          <div className="mt-4 flex gap-1 border-b border-gray-200 -mb-px">
            <TabButton active={tab === "review"} onClick={() => setTab("review")}>
              Review &amp; edit
            </TabButton>
            <TabButton active={tab === "entry"} onClick={() => setTab("entry")}>
              Report entry
            </TabButton>
            <TabButton active={tab === "punch"} onClick={() => setTab("punch")}>
              Client punch list
            </TabButton>
            <TabButton active={tab === "spectora"} onClick={() => setTab("spectora")}>
              Spectora autofill
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
          />
        )}
        {tab === "entry" && <EntryTab report={report} />}
        {tab === "punch" && <PunchTab report={report} counts={counts} />}
        {tab === "spectora" && <SpectoraTab report={report} />}
      </div>
    </main>
  );
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

function SpectoraTab({ report }: { report: InspectionReport }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MappedRow[] | null>(null);
  const [lines, setLines] = useState("");
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"trever" | "standard">("trever");
  const [infoCount, setInfoCount] = useState(0);
  const [includeDefectBoxes, setIncludeDefectBoxes] = useState(false);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of report.findings) m.set(f.id, f.title || f.comment.slice(0, 60));
    return m;
  }, [report.findings]);

  async function run() {
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
      setLines(data.lines as string);
      setInfoCount(typeof data.infoCount === "number" ? data.infoCount : 0);
    } catch (e) {
      setError((e as Error).message);
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
        <h2 className="font-semibold">Build the Spectora report</h2>
        <p className="text-sm text-gray-600 mt-1">
          This matches findings to the pre-written checkboxes in your Spectora template.
          Copy the list, open your report in Spectora, and paste it into the{" "}
          <span className="font-medium">Spectora Autofill</span> extension&rsquo;s &ldquo;Build
          report&rdquo; box.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Method:</span>
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden text-xs">
            <button
              onClick={() => { setMode("trever"); setRows(null); }}
              className={`px-3 py-1.5 ${mode === "trever" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              Trever method
            </button>
            <button
              onClick={() => { setMode("standard"); setRows(null); }}
              className={`px-3 py-1.5 border-l border-gray-300 ${mode === "standard" ? "bg-brand-500 text-white" : "bg-white hover:bg-gray-50"}`}
            >
              Standard
            </button>
          </div>
        </div>
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
            ticks a box per defect, which is how most inspectors work but produces a much
            longer report.
          </span>
        </label>

        <p className="text-xs text-gray-500 mt-2">
          {mode === "trever" ? (
            <>
              <span className="font-medium">Trever method:</span> checks{" "}
              <span className="font-medium">Information, Limitations and Defects</span> boxes.
              Information boxes (materials, brands, amperage, locations) are read straight from
              the transcript. Defects with no good box are fine &mdash; the consolidated
              write-ups (Report entry → Trever 2026) carry them.
            </>
          ) : (
            <>
              <span className="font-medium">Standard:</span> every defect checks its own
              pre-written <span className="font-medium">Defects</span> box, which auto-fills
              that box&rsquo;s library wording. This is how most inspectors work.
            </>
          )}
        </p>
        <button
          onClick={run}
          disabled={loading}
          className="mt-4 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5"
        >
          {loading ? "Matching…" : rows ? "Re-run matching" : "Match findings to checkboxes"}
        </button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {rows && (
        <>
          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                Build list — {matched.length} of {rows.length} findings matched
                {infoCount > 0 ? ` · ${infoCount} Information box${infoCount === 1 ? "" : "es"}` : ""}
              </h3>
              <button
                onClick={copyLines}
                disabled={!lines}
                className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5"
              >
                {copied ? "Copied ✓" : "Copy list"}
              </button>
            </div>
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
}: {
  report: InspectionReport;
  onUpdateFinding: (id: string, patch: Partial<Finding>) => void;
  onDeleteFinding: (id: string) => void;
  onAddFinding: () => void;
}) {
  const groups = useMemo(() => groupBySection(report.findings), [report.findings]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Edit any field, change severity, delete, or add findings. Changes save
          automatically.
        </p>
        <button
          onClick={onAddFinding}
          className="text-sm rounded-lg bg-white border border-gray-300 hover:bg-gray-50 px-3 py-2 font-medium"
        >
          + Add finding
        </button>
      </div>

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
}
interface ComposedReportData {
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
  return composed.groups
    .map(
      (g) =>
        `@@SECTION: ${g.section}\n@@ITEM: ${g.item || fallbackItem(g.section)}\n@@HEADING: ${g.heading}\n@@BODY\n${g.body}\n@@END`
    )
    .join("\n\n");
}

function EntryTab({ report }: { report: InspectionReport }) {
  const groups = useMemo(() => groupBySection(report.findings), [report.findings]);
  const [copied, setCopied] = useState<string | null>(null);
  const [style, setStyle] = useState<"standard" | "trever-2026">("standard");
  const [composed, setComposed] = useState<ComposedReportData | null>(null);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    });
  }

  async function selectStyle(next: "standard" | "trever-2026") {
    setStyle(next);
    if (next === "trever-2026" && !composed && !composing) {
      setComposing(true);
      setComposeError(null);
      try {
        const res = await fetch("/api/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Could not write up the report.");
        setComposed(data.composed as ComposedReportData);
      } catch (e) {
        setComposeError((e as Error).message);
      } finally {
        setComposing(false);
      }
    }
  }

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
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Trever&apos;s 2026 voice — grouped write-ups you can paste as a block.
          </p>
          {StyleToggle}
        </div>
        {composing && <p className="text-sm text-gray-500">Writing up the report…</p>}
        {composeError && <p className="text-sm text-red-600">{composeError}</p>}
        {composed && (
          <>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 flex items-center justify-between">
              <div className="text-sm text-purple-900">
                <span className="font-semibold">Send these write-ups to the extension</span> — copy,
                then paste into the extension&apos;s “Place write-ups” box in Spectora.
              </div>
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
                  <div className="text-sm font-semibold">{g.heading}</div>
                  <button
                    onClick={() => copy(`${g.heading}\n\n${g.body}`, "g" + i)}
                    className="text-xs rounded-md border border-gray-300 hover:bg-gray-50 px-2.5 py-1"
                  >
                    {copied === "g" + i ? "Copied ✓" : "Copy write-up"}
                  </button>
                </div>
                <div className="text-xs text-gray-400 mb-1">{g.section}</div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                  {g.body}
                </p>
              </div>
            ))}
          </>
        )}
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

  return (
    <div>
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
