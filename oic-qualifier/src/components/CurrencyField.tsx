import { useId, useState } from "react";

type Props = {
  label: string;
  helper?: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  error?: string;
  prefix?: string;
  format?: "currency" | "count" | "year";
  name?: string;
};

const withCommas = (value: number) => value.toLocaleString("en-US");

/** Whole-number input that works with mobile numeric keypads. Blank stays undefined. */
export function CurrencyField({
  label,
  helper,
  value,
  onChange,
  error,
  format = "currency",
  name,
}: Props) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const display =
    draft !== null
      ? draft
      : value === undefined
        ? ""
        : format === "currency" && !focused
          ? withCommas(value)
          : String(value);

  const describedBy = [helper ? `${id}-helper` : "", error ? `${id}-error` : ""].join(" ").trim();

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {helper && (
        <p id={`${id}-helper`} className="field-helper">
          {helper}
        </p>
      )}
      <div className={format === "currency" ? "input-currency" : undefined}>
        {format === "currency" && <span aria-hidden="true">$</span>}
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={display}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          data-error-field={error ? name ?? id : undefined}
          maxLength={format === "year" ? 4 : 13}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setDraft(null);
          }}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^\d]/g, "");
            setDraft(digits);
            onChange(digits === "" ? undefined : Number(digits));
          }}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
