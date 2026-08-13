"use client";

// How sure is Hyper about WHAT the thing is — band + percentage, sized to be
// seen at a glance (green high / amber medium / red low).
export function ConfidenceBadge({
  band,
  percent,
}: {
  band?: string;
  percent?: number;
}) {
  if (!band) return null;
  const styles: Record<string, string> = {
    high: "bg-green-100 border-green-300 text-green-800",
    medium: "bg-amber-100 border-amber-300 text-amber-800",
    low: "bg-red-100 border-red-300 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-lg border px-3 py-1.5 shrink-0 ${
        styles[band] || styles.medium
      }`}
      title="How confident Hyper is that it identified WHAT this is"
    >
      <span className="text-xs font-semibold uppercase tracking-wide">
        ID confidence: {band}
      </span>
      {typeof percent === "number" && (
        <span className="text-lg font-bold leading-none">{percent}%</span>
      )}
    </span>
  );
}
