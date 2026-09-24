import type { OfferCalculation } from "./calculator";
import type { QualifierState, ReadinessOrigin } from "./types";

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
 * May qualify when an estimated offer is above zero and below the debt. A $0
 * estimate goes to "may not be your best option", whose paths include
 * hardship status and professional help applying for it.
 */
export function getFinancialResult(
  calc: Pick<OfferCalculation, "estimatedLumpSumOffer" | "estimatedPeriodicOffer">,
  totalIrsDebt: number,
): FinancialResult {
  const offers = [calc.estimatedLumpSumOffer, calc.estimatedPeriodicOffer];
  return offers.some((offer) => offer > 0 && offer < totalIrsDebt) ? "mayQualify" : "notBest";
}

export const OTHER_RESOLUTION_BODY =
  "Other IRS resolution paths may include a payment plan, hardship status, penalty relief, or timing considerations.";

export type DiyRoute = "form656" | "stanCourse" | null;

/** Which DIY option, if any, fits the result that led to the professional-help questions. */
export function diyRouteFor(origin: ReadinessOrigin | undefined): DiyRoute {
  if (origin === "mayQualify") return "form656";
  if (origin === "otherOptions" || origin === "specialCircumstances") return "stanCourse";
  return null;
}

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
  // Results and the questions that follow them
  | "scopeResult"
  | "notEligibleResult"
  | "mayQualifyResult"
  | "fiveYearAck"
  | "fiveYearQuestion"
  | "mayQualifyChoice"
  | "notBestResult"
  | "otherOptions"
  | "otherOptionsChoice"
  | "readinessAfford"
  | "readinessReady"
  // Endings
  | "calendarCta"
  | "returnWhenReady"
  | "diyOffer"
  | "filingsExit"
  | "cleanExit";

export const STAGES = ["Status", "Basic Info", "Assets", "Income", "Expenses", "Results"] as const;

export function stageOf(screen: ScreenId): number {
  if (screen === "start" || screen === "scopeAck") return 0;
  if (screen.startsWith("scope") && screen !== "scopeResult") return 0;
  if (screen.startsWith("status")) return 0;
  if (screen.startsWith("basic")) return 1;
  if (screen.startsWith("assets")) return 2;
  if (screen.startsWith("income")) return 3;
  if (screen.startsWith("expenses")) return 4;
  return 5;
}

export function isEnding(screen: ScreenId): boolean {
  return ["calendarCta", "returnWhenReady", "diyOffer", "filingsExit", "cleanExit"].includes(screen);
}

/** Where an answer sends the user, plus which result led to the professional-help questions. */
export type Transition = { to: ScreenId; readinessFrom?: ReadinessOrigin };

export function nextScreen(
  screen: ScreenId,
  state: QualifierState,
  financial?: () => FinancialResult,
): Transition {
  const f = state.followUp;
  const to = (next: ScreenId): Transition => ({ to: next });
  const readiness = (from: ReadinessOrigin): Transition => ({ to: "readinessAfford", readinessFrom: from });

  switch (screen) {
    case "start":
      return to("scopeAck");
    case "scopeAck":
      return to("scopeFederal");
    case "scopeFederal":
      return to(state.scope.debtJurisdiction === "federal" ? "scopePersonal" : "scopeResult");
    case "scopePersonal":
      return to(state.scope.liabilityType === "personal" ? "scopeDispute" : "scopeResult");
    case "scopeDispute":
      return to(state.scope.disputesLiability ? "scopeResult" : "statusBankruptcy");
    case "statusBankruptcy":
      return to(state.status.openBankruptcy ? "notEligibleResult" : "statusReturns");
    case "statusReturns":
      return to(state.status.returnsFiled ? "statusEstimated" : "notEligibleResult");
    case "statusEstimated":
      return to(state.status.estimatedPayments === "no" ? "notEligibleResult" : "statusDeposits");
    case "statusDeposits":
      return to(state.status.federalTaxDeposits === "no" ? "notEligibleResult" : "basicLocation");
    case "expensesTaxes":
      if (!financial) throw new Error("A financial result is required after the expenses step.");
      return to(financial() === "mayQualify" ? "mayQualifyResult" : "notBestResult");
    case "scopeResult":
      return readiness("scope");
    case "notEligibleResult":
      if (getNotEligibleReason(state.status) === "returns") {
        return f.wantsFilingHelp ? readiness("notEligible") : to("filingsExit");
      }
      return readiness("notEligible");
    case "mayQualifyResult":
      return to(f.canAffordPayment ? "fiveYearAck" : "otherOptions");
    case "fiveYearAck":
      return to("fiveYearQuestion");
    case "fiveYearQuestion":
      return to(f.fiveYearCompliance ? "mayQualifyChoice" : "otherOptions");
    case "mayQualifyChoice":
      // The DIY choice on that screen is a direct Form 656-B link.
      return readiness("mayQualify");
    case "notBestResult":
      return f.specialCircumstances ? readiness("specialCircumstances") : to("otherOptions");
    case "otherOptions":
      return to(f.exploreOptions ? "otherOptionsChoice" : "cleanExit");
    case "otherOptionsChoice":
      // The DIY choice on that screen is a direct Stan course link.
      return readiness("otherOptions");
    case "readinessAfford":
      if (f.canAffordProfessional) return to("readinessReady");
      return to(diyRouteFor(f.readinessFrom) ? "diyOffer" : "cleanExit");
    case "readinessReady":
      return to(f.readyNow ? "calendarCta" : "returnWhenReady");
    default: {
      const index = FORM_SCREENS.indexOf(screen as FormScreen);
      if (index >= 0 && index < FORM_SCREENS.length - 1) return to(FORM_SCREENS[index + 1]);
      throw new Error(`No next screen from ${screen}`);
    }
  }
}
