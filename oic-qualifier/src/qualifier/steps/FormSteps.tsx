import { Plus, Trash2 } from "lucide-react";
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

const MAX_PROPERTIES = 10;

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
  const a = answers.assets;
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

    case "assetsProperty": {
      const properties = a.properties ?? [];
      return shell(
        "Real estate",
        <div className="field-stack">
          <ChoiceGroup
            legend="Do you own any real estate, including your home?"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={a.ownsRealProperty === undefined ? undefined : a.ownsRealProperty ? "yes" : "no"}
            onChange={(value) => {
              const owns = value === "yes";
              set("assets.ownsRealProperty", owns);
              if (owns && properties.length === 0) set("assets.properties", [{}]);
            }}
            error={errors["assets.ownsRealProperty"]}
          />
          {a.ownsRealProperty &&
            properties.map((_, i) => (
              <fieldset key={i} className="group-card">
                <legend className="group-title">Property {i + 1}</legend>
                {money(`assets.properties.${i}.market`, "Market value")}
                {money(`assets.properties.${i}.loan`, "Loan balance")}
                {properties.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-small"
                    onClick={() => set("assets.properties", properties.filter((_, j) => j !== i))}
                  >
                    <Trash2 aria-hidden="true" size={16} /> Remove property {i + 1}
                  </button>
                )}
              </fieldset>
            ))}
          {a.ownsRealProperty && properties.length < MAX_PROPERTIES && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => set("assets.properties", [...properties, {}])}
            >
              <Plus aria-hidden="true" size={18} /> Add another property
            </button>
          )}
          {errors["assets.properties"] && (
            <p className="field-error" role="alert">
              {errors["assets.properties"]}
            </p>
          )}
        </div>,
      );
    }

    case "assetsVehicles": {
      const count = a.vehicleCount;
      return shell(
        "Vehicles",
        <div className="field-stack">
          <ChoiceGroup
            legend="How many vehicles do you own or lease? (up to two)"
            options={[
              { value: "0", label: "None" },
              { value: "1", label: "One" },
              { value: "2", label: "Two" },
            ]}
            value={count === undefined ? undefined : String(count)}
            onChange={(value) => {
              const next = Number(value) as 0 | 1 | 2;
              set("assets.vehicleCount", next);
              // Pre-fill the expense question; the user can still change it there.
              if (e.vehicleCount === undefined) set("expenses.vehicleCount", next);
            }}
            error={errors["assets.vehicleCount"]}
          />
          {Array.from({ length: count ?? 0 }, (_, i) => {
            const vehicle = a.vehicles?.[i];
            return (
              <fieldset key={i} className="group-card">
                <legend className="group-title">Vehicle {i + 1}</legend>
                <ChoiceGroup
                  legend="Is this vehicle owned or leased?"
                  options={[
                    { value: "owned", label: "Owned" },
                    { value: "leased", label: "Leased" },
                  ]}
                  value={vehicle?.leased === undefined ? undefined : vehicle.leased ? "leased" : "owned"}
                  onChange={(value) => set(`assets.vehicles.${i}.leased`, value === "leased")}
                  error={errors[`assets.vehicles.${i}.leased`]}
                />
                {vehicle?.leased === false && (
                  <>
                    {money(`assets.vehicles.${i}.market`, "Market value")}
                    {money(`assets.vehicles.${i}.loan`, "Loan balance")}
                  </>
                )}
              </fieldset>
            );
          })}
        </div>,
      );
    }

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
