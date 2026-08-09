"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { ConfidenceBadge } from "./confidence-badge";
import { emptyDetails, InspectionDetails } from "@/lib/schema";
import type { SpectoraJob } from "./api/inspections/route";
import { saveReport } from "@/lib/storage";

type Stage = "idle" | "uploading" | "transcribing" | "structuring" | "error";

// Read a response as JSON, but degrade gracefully when the body isn't JSON
// (e.g. a platform timeout/500 page). Returns a friendly Error instead of the
// raw "Unexpected token …" parse error.
async function readJsonSafe(res: Response, step: string): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 504 || res.status === 408 || res.status === 502) {
      throw new Error(
        `The ${step} step took too long and timed out — this usually happens with a very long transcript. Try again, or split the walkthrough into two shorter passes.`
      );
    }
    throw new Error(
      `The ${step} step hit a server error (${res.status}). Give it a moment and try again.`
    );
  }
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<InspectionDetails>(emptyDetails());
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [jobs, setJobs] = useState<SpectoraJob[]>([]);
  const [pickedJob, setPickedJob] = useState<string>("");

  // The inspector's real Spectora jobs, so the address/client/agent/date don't
  // have to be retyped. Silently absent when no API key is configured.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/inspections")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.configured && Array.isArray(d.jobs)) setJobs(d.jobs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function applyJob(id: string) {
    setPickedJob(id);
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    setDetails((d) => ({
      ...d,
      property_address: job.address || d.property_address,
      client_name: job.client || d.client_name,
      client_agent: job.agent || d.client_agent,
      inspector_name: job.inspector || d.inspector_name,
      inspection_date: job.date ? job.date.slice(0, 10) : d.inspection_date,
    }));
  }

  function setField(key: keyof InspectionDetails, value: string) {
    setDetails((d) => ({ ...d, [key]: value || null }));
  }

  const busy =
    stage === "uploading" || stage === "transcribing" || stage === "structuring";

  async function process() {
    setError("");
    try {
      let transcript = pastedTranscript.trim();

      if (!pasteMode) {
        if (!file) {
          setError("Please choose a voice memo first.");
          return;
        }
        // 1) Upload the audio straight to Blob storage from the browser.
        setStage("uploading");
        const blob = await upload(file.name, file, {
          access: "public",
          handleUploadUrl: "/api/audio/upload",
          contentType: file.type || "audio/mp4",
        });

        // 2) Transcribe it.
        setStage("transcribing");
        const tRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: blob.url }),
        });
        const tData = await readJsonSafe(tRes, "transcription");
        if (!tRes.ok) throw new Error(tData.error || "Transcription failed.");
        transcript = tData.transcript;
      }

      if (!transcript) {
        setError("There's no transcript to work with.");
        setStage("idle");
        return;
      }

      // 3) Structure the transcript into findings.
      setStage("structuring");
      const sRes = await fetch("/api/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, details }),
      });
      const sData = await readJsonSafe(sRes, "structuring");
      if (!sRes.ok) throw new Error(sData.error || "Could not structure findings.");

      saveReport(sData.report);
      router.push("/review");
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      setStage("error");
    }
  }

  const stageLabel: Record<Stage, string> = {
    idle: "",
    uploading: "Uploading recording…",
    transcribing: "Transcribing audio…",
    structuring: "Structuring findings with AI…",
    error: "",
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">
            V
          </div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">HyperReports AI</h1>
            <p className="text-xs text-gray-500">
              Upload a walkthrough voice memo → get Spectora-ready findings
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <HeyHyperCard />
        {/* Audio / transcript input */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">1. The recording</h2>
            <button
              type="button"
              onClick={() => setPasteMode((m) => !m)}
              className="text-xs text-brand-600 hover:underline"
            >
              {pasteMode ? "Upload audio instead" : "Or paste a transcript"}
            </button>
          </div>

          {!pasteMode ? (
            <label
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-6 py-10 cursor-pointer transition ${
                file
                  ? "border-brand-300 bg-brand-50"
                  : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
              }`}
            >
              <input
                type="file"
                accept="audio/*,.m4a,.mp3,.wav,.aac"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="text-center">
                  <p className="font-medium text-brand-700">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB — click to change
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-gray-700">
                    Tap to choose a voice memo
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    .m4a from iPhone, or .mp3 / .wav / .aac
                  </p>
                </div>
              )}
            </label>
          ) : (
            <textarea
              value={pastedTranscript}
              onChange={(e) => setPastedTranscript(e.target.value)}
              placeholder="Paste or type the walkthrough notes here…"
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          )}
        </section>

        {/* Optional details */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold mb-1">2. Inspection details</h2>
          <p className="text-xs text-gray-500 mb-4">
            Optional — fill these in only if they aren&apos;t mentioned in the
            recording. Anything you type here overrides what the AI hears.
          </p>
          {jobs.length > 0 && (
            <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3">
              <label className="block text-xs font-semibold text-brand-900 mb-1">
                Pull from your Spectora schedule
              </label>
              <select
                value={pickedJob}
                onChange={(e) => applyJob(e.target.value)}
                className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Choose an inspection…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.date_label ? `${j.date_label} — ` : ""}
                    {j.address || "(no address)"}
                    {j.client ? ` — ${j.client}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-brand-800 mt-1">
                Fills in the address, client, agent and date below. You can still edit them.
              </p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <Field
              label="Property address"
              value={details.property_address ?? ""}
              onChange={(v) => setField("property_address", v)}
            />
            <Field
              label="Inspection date"
              type="date"
              value={details.inspection_date ?? ""}
              onChange={(v) => setField("inspection_date", v)}
            />
            <Field
              label="Client name"
              value={details.client_name ?? ""}
              onChange={(v) => setField("client_name", v)}
            />
            <Field
              label="Client's agent"
              value={details.client_agent ?? ""}
              onChange={(v) => setField("client_agent", v)}
            />
            <Field
              label="Inspector name"
              value={details.inspector_name ?? ""}
              onChange={(v) => setField("inspector_name", v)}
            />
          </div>
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={process}
            disabled={busy}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white font-medium px-6 py-3 transition"
          >
            {busy ? "Working…" : "Create report"}
          </button>
          {busy && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Spinner />
              {stageLabel[stage]}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-brand-500"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Hey Hyper on the front page — usable mid-inspection with NO transcript or
// report loaded. Same engine as the Review-screen version; answers only (the
// add-to-report button lives on the report screen, where a report exists).
// -----------------------------------------------------------------------------
function HeyHyperCard() {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ data: string; media_type: string }[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const out: { data: string; media_type: string }[] = [];
    for (const file of Array.from(files).slice(0, 12)) {
      const b64 = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL("image/jpeg", 0.82).split(",")[1]);
        };
        img.onerror = reject;
        img.src = url;
      });
      out.push({ data: b64, media_type: "image/jpeg" });
    }
    setImages((cur) => [...cur, ...out].slice(0, 12));
  }

  async function ask() {
    if (!images.length || busy) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/hyper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images, question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not analyze the photos.");
      setResult(data.result);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-teal-300 shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">📸 Hey Hyper — quick photo check</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Not sure about something on site? Photos in, best read out — no
            transcript needed. Informational only; your inspection, your call.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-sm rounded-lg border border-teal-300 text-teal-800 hover:bg-teal-50 px-3 py-1.5 font-medium shrink-0 ml-3"
        >
          {open ? "Close" : "Open"}
        </button>
      </div>
      {open && (
        <div className="mt-4">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              const input = e.currentTarget;
              void addFiles(input.files).finally(() => {
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
          {images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:${img.media_type};base64,${img.data}`}
                    alt={`photo ${i + 1}`}
                    className="h-16 w-16 object-cover rounded-lg border border-teal-200"
                  />
                  <button
                    onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
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
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Your question (optional) — e.g. “How old are these windows?”"
            className="mt-2 w-full h-16 text-sm border border-gray-300 rounded-lg p-3"
          />
          {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={ask}
              disabled={busy || !images.length}
              className="text-sm rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium px-4 py-2"
            >
              {busy ? "Hyper's looking…" : "Ask Hyper"}
            </button>
            {(images.length > 0 || result || question) && (
              <button
                onClick={() => {
                  setImages([]);
                  setQuestion("");
                  setResult(null);
                  setErr(null);
                }}
                disabled={busy}
                className="text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-4 py-2"
              >
                ↺ Start new check
              </button>
            )}
          </div>
          {result && (
            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-gray-900 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-semibold">{result.component_type}</span>
                <ConfidenceBadge
                  band={result.type_confidence}
                  percent={result.type_confidence_percent}
                />
              </div>
              <p>{result.assessment}</p>
              {result.age_statement && (
                <p>
                  <span className="font-medium">Age:</span> {result.age_statement}
                </p>
              )}
              {Array.isArray(result.evidence) && result.evidence.length > 0 && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Based on:</span>{" "}
                  {result.evidence.join("; ")}
                </p>
              )}
              {result.label && (
                <p className="text-xs bg-white border border-teal-200 rounded-lg p-2">
                  <span className="font-medium">Label read:</span>{" "}
                  {[
                    result.label.brand,
                    result.label.model && `Model ${result.label.model}`,
                    result.label.serial && `Serial ${result.label.serial}`,
                    result.label.capacity,
                    result.label.fuel_or_power,
                    result.label.manufactured && `Mfg ${result.label.manufactured}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {result.label.decode_note ? ` — ${result.label.decode_note}` : ""}
                </p>
              )}
              <div className="bg-white border border-teal-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-teal-800 mb-1">
                  Report-ready write-up (in your voice):
                </div>
                <p className="whitespace-pre-line">{result.finding?.comment}</p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(result.finding?.comment || "")
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                }}
                className="text-sm rounded-lg border border-teal-300 text-teal-800 hover:bg-teal-100 px-4 py-2 font-medium"
              >
                {copied ? "Copied ✓" : "Copy write-up"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
