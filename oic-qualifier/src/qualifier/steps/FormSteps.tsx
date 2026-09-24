import { StepShell } from "../../components/StepShell";
import { ChoiceGroup } from "../../components/ChoiceCard";
import { CurrencyField } from "../../components/CurrencyField";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import { getCounties, getStates, getTransportationOptions } from "../../data/standards";
import type { FormScreen } from "../decisionEngine";
import { CURRENCY_SCREENS, TRANSPORT_FIELDS, getPath, type Errors } from "../schema";
import type { QualifierState } from "../types";

type Props = {
  screen: FormScreen;
  stage: number;
  title?: string;
  answers: QualifierState;
  errors: Errors;
  set: (path: string, value: unknown) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function FormStep({ screen, stage, title, answers, errors, set, onBack, onContinue }: Props) {
  const shell = (heading: string, children: React.ReactNode, helper?: string) => (
    <StepShell
      stage={stage}
      title={heading}
      helper={helper}
      onBack={onBack}
      primary={{ label: "Continue", onClick: onContinue }}
    >
      {children}
    </StepShell>
  );

  const money = (path: string, label: string, helper?: string) => (
    <CurrencyField
      key={path}
      name={path}
      label={label}
      helper={helper}
      value={getPath(answers, path) as number | undefined}
      onChange={(value) => set(path, value)}
      error={errors[path]}
    />
  );

  const whole = (path: string, label: string, format: "count" | "year" = "count") => (
    <CurrencyField
      key={path}
      name={path}
      label={label}
      format={format}
      value={getPath(answers, path) as number | undefined}
      onChange={(value) => set(path, value)}
      error={errors[path]}
    />
  );

  const currency = CURRENCY_SCREENS[screen];
  if (currency) {
    return shell(
      title ?? currency.title,
      <div className="field-stack">{currency.fields.map((f) => money(f.path, f.label, f.helper))}</div>,
      currency.helper,
    );
  }

  const h = answers.household;
  const e = answers.expenses;

  switch (screen) {
    case "basicLocation":
      return shell(
        "Where do you live?",
        <div className="field-stack">
          <TextField
            label="ZIP code"
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            value={h.zip}
            onChange={(value) => set("household.zip", value.replace(/\D/g, "").slice(0, 5))}
            error={errors["household.zip"]}
          />
          <SelectField
            label="State"
            placeholder="Choose your state"
            value={h.state}
            options={getStates().map((s) => ({ value: s, label: s }))}
            onChange={(value) => {
              set("household.state", value || undefined);
              set("household.county", undefined);
              set("household.transportationArea", undefined);
            }}
            error={errors["household.state"]}
          />
          <SelectField
            label="County or equivalent area"
            placeholder={h.state ? "Choose your county" : "Choose a state first"}
            disabled={!h.state}
            value={h.county}
            options={h.state ? getCounties(h.state).map((c) => ({ value: c, label: c })) : []}
            onChange={(value) => set("household.county", value || undefined)}
            error={errors["household.county"]}
          />
        </div>,
        "Your location sets the IRS housing and transportation standards used in the estimate.",
      );

    case "basicTransport":
      return shell(
        "Which IRS transportation area best matches where you live?",
        <ChoiceGroup
          legend="Which IRS transportation area best matches where you live?"
          hideLegend
          options={getTransportationOptions(h.state)}
          value={h.transportationArea}
          onChange={(value) => set("household.transportationArea", value)}
          error={errors["household.transportationArea"]}
        />,
        "The IRS sets vehicle costs by metro area and region. Choose a named metro only if you live in or near it.",
      );

    case "basicHousehold":
      return shell(
        "Your household",
        <div className="field-stack">
          <ChoiceGroup
            legend="Are you estimating this for yourself only or jointly with a spouse?"
            options={[
              { value: "no", label: "Myself only" },
              { value: "yes", label: "Jointly with my spouse" },
            ]}
            value={h.jointEstimate === undefined ? undefined : h.jointEstimate ? "yes" : "no"}
            onChange={(value) => set("household.jointEstimate", value === "yes")}
            error={errors["household.jointEstimate"]}
          />
          {whole("household.members", "Total household members")}
          {whole("household.under65", "Household members under age 65")}
          {whole("household.age65Plus", "Household members age 65 or older")}
        </div>,
      );

    case "basicDebt":
      return shell(
        "Your IRS debt",
        <div className="field-stack">
          {money("household.totalIrsDebt", "Total federal IRS debt, including estimated penalties and interest")}
          {whole("household.latestDebtTaxYear", "Most recent tax year included in that debt", "year")}
        </div>,
      );

    case "expensesTransport":
      return shell(
        "Transportation",
        <div className="field-stack">
          <ChoiceGroup
            legend="Number of vehicles owned or leased"
            options={[
              { value: "0", label: "0" },
              { value: "1", label: "1" },
              { value: "2", label: "2 or more" },
            ]}
            value={e.vehicleCount === undefined ? undefined : String(e.vehicleCount)}
            onChange={(value) => set("expenses.vehicleCount", Number(value) as 0 | 1 | 2)}
            error={errors["expenses.vehicleCount"]}
          />
          {(e.vehicleCount ?? 0) > 0 && (
            <>
              {money("expenses.vehicleLoansLeases", TRANSPORT_FIELDS.vehicleLoansLeases)}
              {money("expenses.vehicleOperating", TRANSPORT_FIELDS.vehicleOperating)}
            </>
          )}
          {money("expenses.publicTransportation", TRANSPORT_FIELDS.publicTransportation)}
        </div>,
        "Enter current monthly amounts. Use 0 for anything that does not apply.",
      );

    default:
      return null;
  }
}
