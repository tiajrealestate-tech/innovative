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

const ASSET_HELPER = "Enter whole dollars. Use 0 for anything you do not have.";

const INCOME_HELPER =
  "Include income for you, your spouse, and anyone else who regularly contributes to the household.";

export const CURRENCY_SCREENS: Partial<Record<FormScreen, CurrencyScreen>> = {
  assetsBank: {
    title: "Bank accounts and investments",
    helper: ASSET_HELPER,
    fields: [
      {
        path: "assets.cashAndBank",
        label: "Total bank balances",
        helper: "Checking, savings, money market accounts, and cash on hand, all added together.",
      },
      {
        path: "assets.investmentsNet",
        label: "Stocks, bonds, crypto, and other investments",
        helper: "Brokerage accounts, stocks, bonds, mutual funds, and cryptocurrency. What they are worth today, minus any loan against them. Do not include retirement accounts.",
      },
      {
        path: "assets.retirementMarket",
        label: "Retirement accounts: current value",
        helper: "401(k), 403(b), TSP, traditional or Roth IRA, and similar accounts. Use the full balance before taxes or early-withdrawal penalties.",
      },
      {
        path: "assets.retirementLoans",
        label: "Retirement accounts: loan balance",
        helper: "Any loan you have taken out against these accounts, like a 401(k) loan. Enter 0 if none.",
      },
    ],
  },
  assetsRealEstate: {
    title: "Your home and other real estate",
    helper: ASSET_HELPER,
    fields: [
      {
        path: "assets.homeMarket",
        label: "Home: market value",
        helper: "What your home would sell for today. Enter 0 if you rent.",
      },
      {
        path: "assets.homeLoan",
        label: "Home: loan balance",
        helper: "What you still owe on your mortgage and any home equity loan.",
      },
      {
        path: "assets.otherRealEstateMarket",
        label: "Other real estate: market value",
        helper: "Rental property, land, or a second home. If you own more than one, add them together.",
      },
      {
        path: "assets.otherRealEstateLoan",
        label: "Other real estate: loan balance",
        helper: "What you still owe on that property.",
      },
    ],
  },
  assetsVehicles: {
    title: "Vehicles",
    helper: ASSET_HELPER,
    fields: [
      {
        path: "assets.vehicle1Market",
        label: "Vehicle 1: market value",
        helper: "What you could sell it for today. Enter 0 if it is leased or you do not have one.",
      },
      {
        path: "assets.vehicle1Loan",
        label: "Vehicle 1: loan balance",
        helper: "What you still owe on the car loan. Enter 0 if it is paid off.",
      },
      {
        path: "assets.vehicle2Market",
        label: "Vehicle 2: market value",
        helper: "What you could sell it for today. Enter 0 if it is leased or you do not have one.",
      },
      {
        path: "assets.vehicle2Loan",
        label: "Vehicle 2: loan balance",
        helper: "What you still owe on the car loan. Enter 0 if it is paid off.",
      },
    ],
  },
  assetsOther: {
    title: "Other things you own",
    helper: ASSET_HELPER,
    fields: [
      {
        path: "assets.otherAssetsMarket",
        label: "Other assets: market value",
        helper: "Boats, motorcycles, RVs, campers, airplanes, jewelry, art, or collectibles, all added together.",
      },
      {
        path: "assets.otherAssetsLoan",
        label: "Other assets: loan balance",
        helper: "What you still owe on those items.",
      },
      {
        path: "assets.lifeInsuranceNet",
        label: "Life insurance cash value",
        helper:
          "Typically only whole life and universal life policies have a cash value. Term life, including most policies through work, has none, so enter 0. If yours has cash value, enter what you would get if you cashed it in, minus any loan against it.",
      },
      {
        path: "assets.miscellaneous",
        label: "Miscellaneous",
        helper:
          "Equity in a business you own, money someone owes you, or anything else of value that is yours and not listed above. Do not count anything twice.",
      },
    ],
  },
  incomeMain: {
    title: "Monthly household income",
    helper: `Enter current average monthly amounts. ${INCOME_HELPER}`,
    fields: [
      {
        path: "income.wagesBenefits",
        label: "Gross wages, Social Security, pensions, and unemployment",
        helper:
          "Pay before taxes and deductions come out. Paid every two weeks? Multiply one paycheck by 26, then divide by 12.",
      },
      {
        path: "income.interestDividendsRoyalties",
        label: "Interest, dividends, and royalties",
        helper: "Money your savings or investments pay you, plus royalties from things like books, music, or oil and gas rights.",
      },
      {
        path: "income.businessDistributions",
        label: "Partnership or S corporation distributions",
        helper: "Money you take out of a partnership or S corporation you own part of. Most people enter 0.",
      },
      {
        path: "income.netRental",
        label: "Net rental income",
        helper: "Rent you collect minus what the property costs you each month, like its mortgage, repairs, taxes, and insurance.",
      },
    ],
  },
  incomeOther: {
    title: "More monthly household income",
    helper: INCOME_HELPER,
    fields: [
      {
        path: "income.netBusiness",
        label: "Net business income",
        helper: "For self-employed people: what your business brings in each month minus its business expenses.",
      },
      { path: "income.childSupport", label: "Child support received", helper: "Payments you receive, not payments you make." },
      { path: "income.alimony", label: "Alimony received", helper: "Payments you receive, not payments you make." },
      {
        path: "income.other",
        label: "Other recurring household income or contributions",
        helper: "Money someone else in your home regularly puts toward bills, plus side jobs or other steady income not listed above.",
      },
    ],
  },
  expensesHousing: {
    title: "Housing and utilities",
    helper:
      "Enter current monthly amounts. Food, clothing, and out-of-pocket health care are added for you using IRS standards.",
    fields: [
      {
        path: "expenses.housingUtilities",
        label: "Monthly housing and utilities",
        helper:
          "Rent or mortgage, property taxes, homeowners or renters insurance, HOA dues, electric, gas, water, trash, phone, internet, and cable, all added together.",
      },
    ],
  },
  expensesInsurance: {
    title: "Insurance, court orders, and care",
    helper: "Enter current monthly amounts. Use 0 for anything that does not apply.",
    fields: [
      {
        path: "expenses.healthInsurance",
        label: "Health insurance premiums",
        helper: "What you pay each month for health insurance, including anything taken out of your paycheck.",
      },
      {
        path: "expenses.courtOrdered",
        label: "Court-ordered payments",
        helper: "Child support or alimony you pay, and any other payment a court ordered.",
      },
      {
        path: "expenses.dependentCare",
        label: "Child/dependent care",
        helper: "Daycare, babysitting, or care for an elderly or disabled family member so you can work.",
      },
      {
        path: "expenses.lifeInsurance",
        label: "Life insurance premiums",
        helper: "Premiums for term life insurance on your own life. Whole life premiums usually are not counted.",
      },
    ],
  },
  expensesTaxes: {
    title: "Taxes and other necessary expenses",
    helper: "Enter current monthly amounts. Use 0 for anything that does not apply.",
    fields: [
      {
        path: "expenses.currentTaxes",
        label: "Current federal, state, and local taxes",
        helper:
          "Income taxes plus Social Security and Medicare taken out of your pay each month. Self-employed: your monthly estimated tax payments.",
      },
      {
        path: "expenses.delinquentStateLocalTaxes",
        label: "Delinquent state/local tax payments",
        helper: "Your monthly payment on a payment plan for past-due state or local taxes.",
      },
      {
        path: "expenses.securedDebtOther",
        label: "Secured debts and other necessary expenses",
        helper:
          "Payments on other loans backed by property you own, federal student loans, and other required costs like union dues.",
      },
    ],
  },
};

export const TRANSPORT_FIELDS: Record<"vehicleLoansLeases" | "vehicleOperating" | "publicTransportation", FieldDef> = {
  vehicleLoansLeases: {
    path: "expenses.vehicleLoansLeases",
    label: "Total vehicle loan/lease payments",
    helper: "Your monthly car loan or lease payments for all vehicles combined.",
  },
  vehicleOperating: {
    path: "expenses.vehicleOperating",
    label: "Vehicle operating costs",
    helper: "Gas, car insurance, maintenance, repairs, registration, parking, and tolls.",
  },
  publicTransportation: {
    path: "expenses.publicTransportation",
    label: "Public transportation",
    helper: "Bus, train, subway, ferry, or taxi fares.",
  },
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
