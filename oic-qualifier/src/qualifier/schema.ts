import { z } from "zod";
import { findHousingRow, getTransportationOptions } from "../data/standards";
import type { FormScreen } from "./decisionEngine";
import type { QualifierState } from "./types";

// Field copy and Zod validation for every data-entry screen. Blank is never
// treated as zero: each amount must be entered, and 0 is a valid answer.

export type FieldDef = { path: string; label: string; helper?: string };

export type CurrencyScreen = {
  title: string;
  helper?: string;
  fields: FieldDef[];
};

const INCOME_HELPER =
  "Include income for you, your spouse, and anyone else who regularly contributes to the household.";

export const CURRENCY_SCREENS: Partial<Record<FormScreen, CurrencyScreen>> = {
  assetsCash: {
    title: "Cash, investments, and digital assets",
    helper: "Enter current values. Use 0 for anything you do not have.",
    fields: [
      { path: "assets.cashAndBank", label: "Total cash and bank balances" },
      { path: "assets.investmentMarket", label: "Investments: current market value" },
      { path: "assets.investmentLoans", label: "Investments: loan balance" },
      { path: "assets.digitalAssets", label: "Digital assets: current U.S. dollar value" },
    ],
  },
  assetsRetirement: {
    title: "Retirement and life insurance",
    helper: "Enter current values. Use 0 for anything you do not have.",
    fields: [
      { path: "assets.retirementMarket", label: "Retirement accounts: current market value" },
      { path: "assets.retirementLoans", label: "Retirement accounts: loan balance" },
      { path: "assets.lifeInsuranceCash", label: "Life insurance: cash value" },
      { path: "assets.lifeInsuranceLoans", label: "Life insurance: loan balance" },
    ],
  },
  assetsOther: {
    title: "Other valuable property",
    fields: [
      { path: "assets.otherPropertyMarket", label: "Other valuable property: market value" },
      { path: "assets.otherPropertyLoans", label: "Other valuable property: loan balance" },
      {
        path: "assets.additionalEquity",
        label: "Any additional asset equity not already included",
        helper:
          "Include business or other asset equity that belongs to you personally and was not entered above. Do not count the same asset twice.",
      },
    ],
  },
  incomeMain: {
    title: "Monthly household income",
    helper: `Enter current average monthly amounts. ${INCOME_HELPER}`,
    fields: [
      { path: "income.wagesBenefits", label: "Gross wages, Social Security, pensions, and unemployment" },
      { path: "income.interestDividendsRoyalties", label: "Interest, dividends, and royalties" },
      { path: "income.businessDistributions", label: "Partnership or S corporation distributions" },
      { path: "income.netRental", label: "Net rental income" },
    ],
  },
  incomeOther: {
    title: "More monthly household income",
    helper: INCOME_HELPER,
    fields: [
      { path: "income.netBusiness", label: "Net business income" },
      { path: "income.childSupport", label: "Child support received" },
      { path: "income.alimony", label: "Alimony received" },
      { path: "income.other", label: "Other recurring household income or contributions" },
    ],
  },
  expensesHousing: {
    title: "Housing and utilities",
    helper:
      "Enter current monthly amounts. Food, clothing, and out-of-pocket health care are added for you using IRS standards.",
    fields: [{ path: "expenses.housingUtilities", label: "Monthly housing and utilities" }],
  },
  expensesInsurance: {
    title: "Insurance, court orders, and care",
    helper: "Enter current monthly amounts. Use 0 for anything that does not apply.",
    fields: [
      { path: "expenses.healthInsurance", label: "Health insurance premiums" },
      { path: "expenses.courtOrdered", label: "Court-ordered payments" },
      { path: "expenses.dependentCare", label: "Child/dependent care" },
      { path: "expenses.lifeInsurance", label: "Life insurance premiums" },
    ],
  },
  expensesTaxes: {
    title: "Taxes and other necessary expenses",
    helper: "Enter current monthly amounts. Use 0 for anything that does not apply.",
    fields: [
      { path: "expenses.currentTaxes", label: "Current federal, state, and local taxes" },
      { path: "expenses.delinquentStateLocalTaxes", label: "Delinquent state/local tax payments" },
      { path: "expenses.securedDebtOther", label: "Secured debts and other necessary expenses" },
    ],
  },
};

export const TRANSPORT_FIELDS = {
  vehicleLoansLeases: "Total vehicle loan/lease payments",
  vehicleOperating: "Vehicle operating costs",
  publicTransportation: "Public transportation",
};

// ---- Path helpers --------------------------------------------------------

export function getPath(state: QualifierState, path: string): unknown {
  return path.split(".").reduce<unknown>((node, key) => {
    if (node === undefined || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, state);
}

export function setPath(state: QualifierState, path: string, value: unknown): QualifierState {
  const keys = path.split(".");
  const clone = (node: unknown, index: number): unknown => {
    const key = keys[index];
    const isIndex = /^\d+$/.test(key);
    const copy: Record<string, unknown> | unknown[] = Array.isArray(node)
      ? [...node]
      : isIndex
        ? []
        : { ...((node as Record<string, unknown>) ?? {}) };
    const container = copy as Record<string, unknown>;
    container[key] =
      index === keys.length - 1 ? value : clone(container[key], index + 1);
    return copy;
  };
  return clone(state, 0) as QualifierState;
}

// ---- Validation ----------------------------------------------------------

export const amount = z
  .number({
    required_error: "Enter an amount. Use 0 if none.",
    invalid_type_error: "Enter an amount. Use 0 if none.",
  })
  .int("Use whole dollars.")
  .min(0, "Amounts cannot be negative.");

const count = (message: string) =>
  z
    .number({ required_error: message, invalid_type_error: message })
    .int("Use a whole number.")
    .min(0, "Cannot be negative.")
    .max(30, "Enter a number of 30 or less.");

const choose = (message: string) =>
  z.custom<unknown>((value) => value !== undefined && value !== "", { message });

export type Errors = Record<string, string>;

function collect(result: z.SafeParseReturnType<unknown, unknown>, prefix = ""): Errors {
  if (result.success) return {};
  const errors: Errors = {};
  for (const issue of result.error.issues) {
    const path = [prefix, ...issue.path].filter((p) => p !== "").join(".");
    if (!errors[path]) errors[path] = issue.message;
  }
  return errors;
}

function validateCurrencyFields(state: QualifierState, paths: string[]): Errors {
  const errors: Errors = {};
  for (const path of paths) {
    const result = amount.safeParse(getPath(state, path));
    if (!result.success) errors[path] = result.error.issues[0].message;
  }
  return errors;
}

const currentYear = () => new Date().getFullYear();

export function validateScreen(screen: FormScreen, state: QualifierState): Errors {
  const currency = CURRENCY_SCREENS[screen];
  if (currency) return validateCurrencyFields(state, currency.fields.map((f) => f.path));

  const h = state.household;
  const a = state.assets;
  const e = state.expenses;

  switch (screen) {
    case "basicLocation": {
      const schema = z.object({
        zip: z
          .string({ required_error: "Enter your 5-digit ZIP code." })
          .regex(/^\d{5}$/, "Enter your 5-digit ZIP code."),
        state: z.string({ required_error: "Choose your state." }).min(1, "Choose your state."),
        county: z
          .string({ required_error: "Choose your county or equivalent area." })
          .min(1, "Choose your county or equivalent area."),
      });
      const errors = collect(schema.safeParse(h), "household");
      if (!errors["household.county"] && h.county && !findHousingRow(h.state, h.county)) {
        errors["household.county"] = "Choose your county or equivalent area.";
      }
      return errors;
    }
    case "basicTransport": {
      const valid = getTransportationOptions(h.state).some((o) => o.value === h.transportationArea);
      return valid ? {} : { "household.transportationArea": "Choose the area that best matches where you live." };
    }
    case "basicHousehold": {
      const schema = z
        .object({
          jointEstimate: choose("Choose who this estimate is for."),
          members: count("Enter the total number of household members.").min(
            1,
            "Include yourself in the household count.",
          ),
          under65: count("Enter how many household members are under 65."),
          age65Plus: count("Enter how many household members are 65 or older."),
        })
        .superRefine((v, ctx) => {
          if (v.under65 + v.age65Plus !== v.members) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["age65Plus"],
              message: `Under 65 plus 65 or older must add up to ${v.members} household members.`,
            });
          }
        });
      return collect(schema.safeParse(h), "household");
    }
    case "basicDebt": {
      const year = currentYear();
      const schema = z.object({
        totalIrsDebt: amount.min(1, "Enter the total federal IRS debt."),
        latestDebtTaxYear: z
          .number({
            required_error: "Enter a 4-digit tax year.",
            invalid_type_error: "Enter a 4-digit tax year.",
          })
          .int()
          .min(1980, "Enter a 4-digit tax year.")
          .max(year, `Enter a tax year of ${year} or earlier.`),
      });
      return collect(schema.safeParse(h), "household");
    }
    case "assetsProperty": {
      if (a.ownsRealProperty === undefined) {
        return { "assets.ownsRealProperty": "Choose an answer to continue." };
      }
      if (!a.ownsRealProperty) return {};
      const properties = a.properties ?? [];
      if (properties.length === 0) return { "assets.properties": "Add at least one property." };
      return validateCurrencyFields(
        state,
        properties.flatMap((_, i) => [`assets.properties.${i}.market`, `assets.properties.${i}.loan`]),
      );
    }
    case "assetsVehicles": {
      if (a.vehicleCount === undefined) {
        return { "assets.vehicleCount": "Choose how many vehicles you own or lease." };
      }
      const errors: Errors = {};
      for (let i = 0; i < a.vehicleCount; i++) {
        const vehicle = a.vehicles?.[i];
        if (vehicle?.leased === undefined) {
          errors[`assets.vehicles.${i}.leased`] = "Choose owned or leased.";
        } else if (!vehicle.leased) {
          Object.assign(
            errors,
            validateCurrencyFields(state, [`assets.vehicles.${i}.market`, `assets.vehicles.${i}.loan`]),
          );
        }
      }
      return errors;
    }
    case "expensesTransport": {
      if (e.vehicleCount === undefined) {
        return { "expenses.vehicleCount": "Choose how many vehicles you own or lease." };
      }
      const paths = ["expenses.publicTransportation"];
      if (e.vehicleCount > 0) paths.unshift("expenses.vehicleLoansLeases", "expenses.vehicleOperating");
      return validateCurrencyFields(state, paths);
    }
    default:
      return {};
  }
}
