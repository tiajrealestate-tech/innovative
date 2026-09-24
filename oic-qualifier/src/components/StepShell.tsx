import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

type Props = {
  stage: number;
  title: string;
  helper?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
  primary?: { label: string; onClick: () => void };
  footer?: ReactNode;
};

export function StepShell({ stage, title, helper, children, onBack, primary, footer }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the new question so screen readers announce each step.
  useEffect(() => {
    heading.current?.focus();
    window.scrollTo?.({ top: 0 });
  }, [title]);

  return (
    <section className="step">
      <ProgressBar current={stage} />
      <h1 ref={heading} tabIndex={-1} className="step-title">
        {title}
      </h1>
      {helper && <div className="step-helper">{helper}</div>}
      <div className="step-body">{children}</div>
      <div className="step-actions">
        {onBack && (
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={18} /> Back
          </button>
        )}
        {primary && (
          <button type="button" className="btn btn-primary" onClick={primary.onClick}>
            {primary.label}
          </button>
        )}
      </div>
      {footer}
    </section>
  );
}
