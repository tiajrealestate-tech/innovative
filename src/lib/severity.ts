// -----------------------------------------------------------------------------
// Severity levels.
// These are intentionally defined in ONE place so a future version can remap
// them to whatever labels a given inspection software uses. The `key` never
// changes (it is the stable machine value in the data model); the `label` is
// what a human sees and can be re-skinned per software later.
// -----------------------------------------------------------------------------

export type SeverityKey =
  | "safety_hazard"
  | "major_defect"
  | "minor_defect"
  | "maintenance";

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
    key: "safety_hazard",
    label: "Safety Hazard",
    description:
      "An immediate risk to health or safety (electrical shock, fire, fall, gas, etc.). Should be addressed right away.",
    badge: "bg-red-100 text-red-800 border border-red-200",
    color: "#dc2626",
    weight: 0,
  },
  {
    key: "major_defect",
    label: "Major Defect",
    description:
      "A significant deficiency that is costly to correct or materially affects the property. Recommend correction.",
    badge: "bg-orange-100 text-orange-800 border border-orange-200",
    color: "#ea580c",
    weight: 1,
  },
  {
    key: "minor_defect",
    label: "Minor Defect",
    description:
      "A smaller deficiency that should be corrected but is not urgent or costly.",
    badge: "bg-yellow-100 text-yellow-800 border border-yellow-200",
    color: "#ca8a04",
    weight: 2,
  },
  {
    key: "maintenance",
    label: "Maintenance Item",
    description:
      "Routine upkeep, monitoring, or a minor recommendation. Informational.",
    badge: "bg-gray-100 text-gray-700 border border-gray-200",
    color: "#6b7280",
    weight: 3,
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
