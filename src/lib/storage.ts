import { InspectionReport } from "./schema";

// Small localStorage wrapper for passing the report between the upload page and
// the review page, and persisting edits across refreshes. (No database needed
// for v1 — the report lives in the browser until exported.)

const KEY = "vtr_report";

export function saveReport(report: InspectionReport) {
  try {
    localStorage.setItem(KEY, JSON.stringify(report));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function loadReport(): InspectionReport | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as InspectionReport) : null;
  } catch {
    return null;
  }
}

export function clearReport() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
