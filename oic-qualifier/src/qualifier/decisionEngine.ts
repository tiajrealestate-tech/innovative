import type { OfferCalculation } from "./calculator";
import type { QualifierState } from "./types";

// Pure routing for the whole qualifier (brief sections 9-19). Components ask
// this module where to go next; they never decide a branch themselves.

export const RESULT_TITLES = {
  mayQualify: "You may qualify for an Offer in Compromise.",
  notEligible: "You may not be eligible at this time.",
  notBest: "An Offer in Compromise may not be your best option.",
  outOfScope: "This qualifier does not cover your type of tax issue.",
} as const;

export type ScopeIssue = "state" | "entity" | "dispute" | "unsure";

export const SCOPE_MESSAGES: Record<ScopeIssue, string> = {
  state: "This qualifier does not cover state tax debt.",
  entity: "This qualifier does not cover corporation or partnership tax debt.",
  dispute: "This qualifier does not determine whether a tax debt is legally correct.",
  unsure: "This qualifier may not cover your type of tax issue.",
};

export type NotEligibleReason = "bankruptcy" | "returns" | "estimatedPayments" | "deposits";

export const NOT_ELIGIBLE_MESSAGES: Record<NotEligibleReason, string> = {
  bankruptcy:
    "You may not be eligible at this time because you are in an open bankruptcy proceeding.",
  returns:
    "You may not be eligible at this time because all required federal tax returns have not been filed.",
  estimatedPayments:
    "You may not be eligible at this time because required estimated tax payments are not current.",
  deposits:
    "You may not be eligible at this time because required federal tax deposits are not current.",
};

export type FinancialResult = "mayQualify" | "notBest";

export function getScopeIssue(scope: QualifierState["scope"]): ScopeIssue | null {
  if (scope.debtJurisdiction === "state") return "state";
  if (scope.debtJurisdiction === "unsure") return "unsure";
  if (scope.liabilityType === "entity") return "entity";
  if (scope.liabilityType === "unsure") return "unsure";
  if (scope.disputesLiability === true) return "dispute";
  return null;
}

export function getNotEligibleReason(status: QualifierState["status"]): NotEligibleReason | null {
  if (status.openBankruptcy === true) return "bankruptcy";
  if (status.returnsFiled === false) return "returns";
  if (status.estimatedPayments === "no") return "estimatedPayments";
  if (status.federalTaxDeposits === "no") return "deposits";
  return null;
}

/**
 * May qualify when an estimated offer is above zero and below the debt. The
 * spec does not cover a $0 estimate; it is sent to "may not be your best
 * option" because the other paths listed there include hardship status.
 */
export function getFinancialResult(
  calc: Pick<OfferCalculation, "estimatedLumpSumOffer" | "estimatedPeriodicOffer">,
  totalIrsDebt: number,
): FinancialResult {
  const offers = [calc.estimatedLumpSumOffer, calc.estimatedPeriodicOffer];
  return offers.some((offer) => offer > 0 && offer < totalIrsDebt) ? "mayQualify" : "notBest";
}

// Recommended directions shown on final screens (spec wording).
export const DIRECTIONS = {
  mayQualify: "Professional help or the official IRS OIC forms may be appropriate.",
  exploreOptions:
    "Explore other IRS resolution options through professional help or guided DIY education.",
  specialCircumstances: "A professional case review may be appropriate.",
} as const;

export const OTHER_RESOLUTION_BODY =
  "Other IRS resolution paths may include a payment plan, hardship status, penalty relief, or timing considerations.";

// ---- Screens -------------------------------------------------------------

export const FORM_SCREENS = [
  "basicLocation",
  "basicTransport",
  "basicHousehold",
  "basicDebt",
  "assetsCash",
  "assetsRetirement",
  "assetsProperty",
  "assetsVehicles",
  "assetsOther",
  "incomeMain",
  "incomeOther",
  "expensesHousing",
  "expensesTransport",
  "expensesInsurance",
  "expensesTaxes",
] as const;

export type FormScreen = (typeof FORM_SCREENS)[number];

export type ScreenId =
  | "start"
  | "scopeAck"
  | "scopeFederal"
  | "scopePersonal"
  | "scopeDispute"
  | "statusBankruptcy"
  | "statusReturns"
  | "statusEstimated"
  | "statusDeposits"
  | FormScreen
  // Results. Screens ending in "Final" are the end of a path.
  | "scopeFinal"
  | "notEligibleResult"
  | "notEligibleFinal"
  | "mayQualifyResult"
  | "fiveYearAck"
  | "fiveYearQuestion"
  | "mayQualifyFinal"
  | "notBestResult"
  | "specialCircumstancesFinal"
  | "otherResolution"
  | "exploreOptionsFinal"
  | "cleanExit";

export const STAGES = ["Status", "Basic Info", "Assets", "Income", "Expenses", "Results"] as const;

export function stageOf(screen: ScreenId): number {
  if (screen === "start" || screen === "scopeAck") return 0;
  if (screen.startsWith("scope") && screen !== "scopeFinal") return 0;
  if (screen.startsWith("status")) return 0;
  if (screen.startsWith("basic")) return 1;
  if (screen.startsWith("assets")) return 2;
  if (screen.startsWith("income")) return 3;
  if (screen.startsWith("expenses")) return 4;
  return 5;
}

export function isFinal(screen: ScreenId): boolean {
  return screen.endsWith("Final") || screen === "cleanExit";
}

export function nextScreen(
  screen: ScreenId,
  state: QualifierState,
  financial?: () => FinancialResult,
): ScreenId {
  const f = state.followUp;

  switch (screen) {
    case "start":
      return "scopeAck";
    case "scopeAck":
      return "scopeFederal";
    case "scopeFederal":
      return state.scope.debtJurisdiction === "federal" ? "scopePersonal" : "scopeFinal";
    case "scopePersonal":
      return state.scope.liabilityType === "personal" ? "scopeDispute" : "scopeFinal";
    case "scopeDispute":
      return state.scope.disputesLiability ? "scopeFinal" : "statusBankruptcy";
    case "statusBankruptcy":
      return state.status.openBankruptcy ? "notEligibleFinal" : "statusReturns";
    case "statusReturns":
      // Missing returns asks one follow-up question before the final screen.
      return state.status.returnsFiled ? "statusEstimated" : "notEligibleResult";
    case "statusEstimated":
      return state.status.estimatedPayments === "no" ? "notEligibleFinal" : "statusDeposits";
    case "statusDeposits":
      return state.status.federalTaxDeposits === "no" ? "notEligibleFinal" : "basicLocation";
    case "expensesTaxes":
      if (!financial) throw new Error("A financial result is required after the expenses step.");
      return financial() === "mayQualify" ? "mayQualifyResult" : "notBestResult";
    case "notEligibleResult":
      return "notEligibleFinal";
    case "mayQualifyResult":
      return f.canAffordPayment ? "fiveYearAck" : "otherResolution";
    case "fiveYearAck":
      return "fiveYearQuestion";
    case "fiveYearQuestion":
      return f.fiveYearCompliance ? "mayQualifyFinal" : "otherResolution";
    case "notBestResult":
      return f.specialCircumstances ? "specialCircumstancesFinal" : "otherResolution";
    case "otherResolution":
      return f.exploreOptions ? "exploreOptionsFinal" : "cleanExit";
    default: {
      const index = FORM_SCREENS.indexOf(screen as FormScreen);
      if (index >= 0 && index < FORM_SCREENS.length - 1) return FORM_SCREENS[index + 1];
      throw new Error(`No next screen from ${screen}`);
    }
  }
}
