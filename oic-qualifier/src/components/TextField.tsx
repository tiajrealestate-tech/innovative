import { useId } from "react";

type Props = {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  error?: string;
  inputMode?: "numeric" | "text";
  maxLength?: number;
  autoComplete?: string;
};

export function TextField({ label, value, onChange, error, inputMode, maxLength, autoComplete }: Props) {
  const id = useId();
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete ?? "off"}
        value={value ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        data-error-field={error ? id : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
