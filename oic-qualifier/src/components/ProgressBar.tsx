import { STAGES } from "../qualifier/decisionEngine";

export function ProgressBar({ current }: { current: number }) {
  return (
    <nav className="progress" aria-label="Qualifier progress">
      <p className="progress-label">
        Step {current + 1} of {STAGES.length} <span aria-hidden="true">·</span>{" "}
        <strong>{STAGES[current]}</strong>
      </p>
      <ol className="progress-track">
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            className={i < current ? "done" : i === current ? "current" : undefined}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="progress-stage">{stage}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
