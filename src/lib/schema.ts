// =============================================================================
// UNIVERSAL INSPECTION FINDINGS SCHEMA (v1)
// -----------------------------------------------------------------------------
// This is the core of the product. Every voice memo becomes ONE object shaped
// like `InspectionReport` below. All three outputs (report entry view, client
// punch list, CSV) are just different renderings of this object, and every
// future integration (a Spectora browser extension, an ISN adapter, a
// computer-use agent, etc.) is just another CONSUMER of this same object.
//
// Because of that, the field names and shape here are a stable contract. Add
// new optional fields freely; think hard before renaming or removing one.
// `schema_version` lets future adapters know what shape they're reading.
// =============================================================================

import { SeverityKey } from "./severity";

export const SCHEMA_VERSION = "1.0" as const;

export interface InspectionDetails {
  property_address: string | null;
  inspection_date: string | null; // free text or ISO date, as spoken/typed
  client_name: string | null;
  client_agent: string | null;
  inspector_name: string | null;
}

export interface Finding {
  /** Stable unique id (assigned client-side). */
  id: string;
  /** Display order within the whole report. */
  order_index: number;

  // --- where it belongs (maps to how the report is organized) ---
  section: string; // e.g. "Interior"
  subsection: string | null; // e.g. "Kitchen"
  component: string | null; // e.g. "Electrical"

  // --- what it is ---
  severity: SeverityKey | string;
  recommendation_type: string;
  /** Polished, buyer-friendly report language. */
  comment: string;

  // --- provenance / future-proofing ---
  location_tags: string[]; // e.g. ["kitchen", "counter"]
  source_text: string | null; // the raw phrase from the transcript
  confidence: number | null; // 0..1 AI confidence
  flags: string[]; // e.g. ["needs_review", "low_confidence"]
}

export interface InspectionReport {
  schema_version: typeof SCHEMA_VERSION;
  inspection: InspectionDetails;
  findings: Finding[];
  meta: {
    generated_at: string; // ISO timestamp
    source: "voice-to-report";
    transcript?: string;
  };
}

// -----------------------------------------------------------------------------
// JSON Schema handed to Claude via structured outputs. This is what the model
// is REQUIRED to return, so parsing never fails. It intentionally leaves out
// `id`, `order_index`, `flags`, and `meta` — those are filled in by our code
// after the model responds.
// -----------------------------------------------------------------------------

export const CLAUDE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    inspection: {
      type: "object",
      additionalProperties: false,
      properties: {
        property_address: { type: ["string", "null"] },
        inspection_date: { type: ["string", "null"] },
        client_name: { type: ["string", "null"] },
        client_agent: { type: ["string", "null"] },
        inspector_name: { type: ["string", "null"] },
      },
      required: [
        "property_address",
        "inspection_date",
        "client_name",
        "client_agent",
        "inspector_name",
      ],
    },
    findings: {
      type: "array",
      items: {
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
          comment: { type: "string" },
          location_tags: { type: "array", items: { type: "string" } },
          source_text: { type: ["string", "null"] },
          confidence: { type: ["number", "null"] },
        },
        required: [
          "section",
          "subsection",
          "component",
          "severity",
          "recommendation_type",
          "comment",
          "location_tags",
          "source_text",
          "confidence",
        ],
      },
    },
  },
  required: ["inspection", "findings"],
} as const;

/** Shape Claude returns (before we enrich it with ids/order/flags). */
export interface ClaudeRawOutput {
  inspection: InspectionDetails;
  findings: Array<Omit<Finding, "id" | "order_index" | "flags">>;
}

// -----------------------------------------------------------------------------
// Helpers to build / mutate the report on the client.
// -----------------------------------------------------------------------------

export function newId(): string {
  // Prefer crypto.randomUUID where available; fall back for older runtimes.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyDetails(): InspectionDetails {
  return {
    property_address: null,
    inspection_date: null,
    client_name: null,
    client_agent: null,
    inspector_name: null,
  };
}

export function blankFinding(order_index: number): Finding {
  return {
    id: newId(),
    order_index,
    section: "Doors, Windows & Interior",
    subsection: null,
    component: null,
    severity: "recommendation",
    recommendation_type: "Recommend a qualified contractor evaluate and repair",
    comment: "",
    location_tags: [],
    source_text: null,
    confidence: null,
    flags: ["manual"],
  };
}
