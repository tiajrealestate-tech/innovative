import type { ReactNode } from "react";
import { CircleCheck, CircleAlert, Info, CircleSlash } from "lucide-react";

export type ResultTone = "positive" | "caution" | "neutral" | "scope";

const icons = {
  positive: CircleCheck,
  caution: CircleAlert,
  neutral: Info,
  scope: CircleSlash,
};

/** Result summary. The icon and the title carry the meaning, so color is never the only signal. */
export function ResultCard({
  tone,
  label,
  children,
}: {
  tone: ResultTone;
  label: string;
  children: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <div className={`result-card tone-${tone}`}>
      <p className="result-label">
        <Icon aria-hidden="true" size={18} /> {label}
      </p>
      {children}
    </div>
  );
}
