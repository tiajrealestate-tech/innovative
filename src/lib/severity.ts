// -----------------------------------------------------------------------------
// Rating tiers — matched to Innovative Home Inspections' actual Spectora
// template (pulled from 5 of Trever's real reports). His template uses THREE
// rating tiers, so the AI's output and the review dropdowns line up 1:1 with
// what he checks in Spectora.
//
// The `key` never changes (it is the stable machine value in the data model);
// the `label` is what a human sees and what maps to a Spectora rating badge.
// -----------------------------------------------------------------------------

export type SeverityKey = "safety_major" | "recommendation" | "maintenance";

export interface SeverityLevel {
  key: SeverityKey;
  label: string;
  /** Short description used in the AI prompt and tooltips. */
  description: string;
  /** Tailwind classes for the colored badge on the client punch list. */
  badge: string;
  /** Plain hex used for the CSV / any non-Tailwind rendering. */
  color: string;
  /** Sort weight — lower = more severe (shown first). */
  weight: number;
}

export const SEVERITY_LEVELS: SeverityLevel[] = [
  {
    key: "safety_major",
    label: "Safety Hazard/Major Defect",
    description:
      "An immediate safety risk (electrical shock, fire, fall, gas) OR a significant/costly defect that materially affects the property. This is the highest tier.",
    badge: "bg-red-100 text-red-800 border border-red-200",
    color: "#dc2626",
    weight: 0,
  },
  {
    key: "recommendation",
    label: "Recommendation",
    description:
      "A deficiency that should be repaired, replaced, or corrected, but is not an immediate safety hazard. Most defects fall here.",
    badge: "bg-amber-100 text-amber-800 border border-amber-200",
    color: "#d97706",
    weight: 1,
  },
  {
    key: "maintenance",
    label: "Maintenance Item",
    description:
      "Routine upkeep, servicing, monitoring, or a minor informational note. The lowest tier.",
    badge: "bg-gray-100 text-gray-700 border border-gray-200",
    color: "#6b7280",
    weight: 2,
  },
];

export const SEVERITY_BY_KEY: Record<SeverityKey, SeverityLevel> =
  Object.fromEntries(SEVERITY_LEVELS.map((s) => [s.key, s])) as Record<
    SeverityKey,
    SeverityLevel
  >;

export const SEVERITY_KEYS: SeverityKey[] = SEVERITY_LEVELS.map((s) => s.key);

export function severityLabel(key: string): string {
  return SEVERITY_BY_KEY[key as SeverityKey]?.label ?? key;
}

export function severityWeight(key: string): number {
  return SEVERITY_BY_KEY[key as SeverityKey]?.weight ?? 99;
}
