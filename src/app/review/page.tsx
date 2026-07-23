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

type Tab = "review" | "entry" | "punch";

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
      </div>
    </main>
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

function EntryTab({ report }: { report: InspectionReport }) {
  const groups = useMemo(() => groupBySection(report.findings), [report.findings]);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Findings in Spectora&apos;s section order. Copy each comment, then check
        the matching severity and recommendation boxes as you paste.
      </p>
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
