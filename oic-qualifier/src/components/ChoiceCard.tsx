import { useId } from "react";

export type Choice<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  legend: string;
  hideLegend?: boolean;
  helper?: string;
  options: Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string;
  name?: string;
};

export function ChoiceGroup<T extends string>({
  legend,
  hideLegend,
  helper,
  options,
  value,
  onChange,
  error,
  name,
}: Props<T>) {
  const id = useId();
  const groupName = name ?? id;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  return (
    <fieldset
      className="choices"
      aria-describedby={[helper ? helperId : "", error ? errorId : ""].join(" ").trim() || undefined}
      aria-invalid={error ? true : undefined}
      data-error-field={error ? groupName : undefined}
    >
      <legend className={hideLegend ? "visually-hidden" : "field-label"}>{legend}</legend>
      {helper && (
        <p id={helperId} className="field-helper">
          {helper}
        </p>
      )}
      {options.map((option) => (
        <label key={option.value} className="choice-card">
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
