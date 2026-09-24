import { describe, expect, it } from "vitest";
import {
  diyRouteFor,
  getFinancialResult,
  getNotEligibleReason,
  getScopeIssue,
  nextScreen,
  type FinancialResult,
  type ScreenId,
} from "../qualifier/decisionEngine";
import { calculateOffer } from "../qualifier/calculator";
import { baseState } from "./fixtures";

type State = ReturnType<typeof baseState>;
const next = (screen: ScreenId, state: State, financial?: () => FinancialResult) =>
  nextScreen(screen, state, financial).to;

const notUsed = () => {
  throw new Error("financial result should not be needed");
};

describe("scope branches", () => {
  it("1. state debt ends at the out-of-scope result", () => {
    const state = baseState({ scope: { debtJurisdiction: "state" } });
    expect(next("scopeFederal", state)).toBe("scopeResult");
    expect(getScopeIssue(state.scope)).toBe("state");
  });

  it("2. entity debt ends at the out-of-scope result", () => {
    const state = baseState({ scope: { liabilityType: "entity" } });
    expect(next("scopePersonal", state)).toBe("scopeResult");
    expect(getScopeIssue(state.scope)).toBe("entity");
  });

  it("3. disputed liability ends at the out-of-scope result", () => {
    const state = baseState({ scope: { disputesLiability: true } });
    expect(next("scopeDispute", state)).toBe("scopeResult");
    expect(getScopeIssue(state.scope)).toBe("dispute");
  });

  it("unsure answers end at the out-of-scope result", () => {
    expect(next("scopeFederal", baseState({ scope: { debtJurisdiction: "unsure" } }))).toBe("scopeResult");
    expect(next("scopePersonal", baseState({ scope: { liabilityType: "unsure" } }))).toBe("scopeResult");
    expect(getScopeIssue({ debtJurisdiction: "unsure" })).toBe("unsure");
  });

  it("in-scope answers continue to status", () => {
    const state = baseState();
    expect(next("scopeFederal", state)).toBe("scopePersonal");
    expect(next("scopePersonal", state)).toBe("scopeDispute");
    expect(next("scopeDispute", state)).toBe("statusBankruptcy");
  });
});

describe("status branches", () => {
  it("4. open bankruptcy is not eligible at this time", () => {
    const state = baseState({ status: { openBankruptcy: true } });
    expect(next("statusBankruptcy", state)).toBe("notEligibleResult");
    expect(getNotEligibleReason(state.status)).toBe("bankruptcy");
  });

  it("5. missing returns asks the filing-help question", () => {
    const wantsHelp = baseState({ status: { returnsFiled: false }, followUp: { wantsFilingHelp: true } });
    expect(next("statusReturns", wantsHelp)).toBe("notEligibleResult");
    expect(getNotEligibleReason(wantsHelp.status)).toBe("returns");
    expect(nextScreen("notEligibleResult", wantsHelp)).toEqual({ to: "readinessAfford", readinessFrom: "notEligible" });
    const noHelp = baseState({ status: { returnsFiled: false }, followUp: { wantsFilingHelp: false } });
    expect(next("notEligibleResult", noHelp)).toBe("filingsExit");
  });

  it("6. missing estimated payments is not eligible at this time", () => {
    const state = baseState({ status: { estimatedPayments: "no" } });
    expect(next("statusEstimated", state)).toBe("notEligibleResult");
    expect(getNotEligibleReason(state.status)).toBe("estimatedPayments");
  });

  it("7. missing federal deposits is not eligible at this time", () => {
    const state = baseState({ status: { federalTaxDeposits: "no" } });
    expect(next("statusDeposits", state)).toBe("notEligibleResult");
    expect(getNotEligibleReason(state.status)).toBe("deposits");
  });

  it("not applicable answers continue to the financial questions", () => {
    const state = baseState({ status: { estimatedPayments: "na", federalTaxDeposits: "na" } });
    expect(next("statusEstimated", state)).toBe("statusDeposits");
    expect(next("statusDeposits", state)).toBe("basicLocation");
  });
});

describe("financial result", () => {
  it("8. an estimated offer below the debt may qualify", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 8000, estimatedPeriodicOffer: 14000 }, 50000)).toBe(
      "mayQualify",
    );
    expect(next("expensesTaxes", baseState(), () => "mayQualify")).toBe("mayQualifyResult");
  });

  it("9. an estimated offer at or above the debt may not be the best option", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 50000, estimatedPeriodicOffer: 60000 }, 50000)).toBe(
      "notBest",
    );
    expect(getFinancialResult({ estimatedLumpSumOffer: 90000, estimatedPeriodicOffer: 95000 }, 50000)).toBe(
      "notBest",
    );
    expect(next("expensesTaxes", baseState(), () => "notBest")).toBe("notBestResult");
  });

  it("the periodic offer alone below the debt still may qualify", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 60000, estimatedPeriodicOffer: 40000 }, 50000)).toBe(
      "mayQualify",
    );
  });

  it("a $0 estimate is not an offer amount and routes to other options", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 0, estimatedPeriodicOffer: 0 }, 50000)).toBe("notBest");
  });

  it("works end to end from answers", () => {
    const state = baseState({
      income: { wagesBenefits: 2657 },
      expenses: { housingUtilities: 1200 },
      assets: { cashAndBank: 3000 },
    });
    const calc = calculateOffer(state);
    expect(getFinancialResult(calc, 50000)).toBe("mayQualify");
    expect(getFinancialResult(calc, 8000)).toBe("notBest");
  });
});

describe("may-qualify follow-up", () => {
  it("10. cannot afford the required payment goes to other resolution options", () => {
    const state = baseState({ followUp: { canAffordPayment: false } });
    expect(next("mayQualifyResult", state)).toBe("otherOptions");
  });

  it("11. cannot commit to five-year compliance goes to other resolution options", () => {
    const state = baseState({ followUp: { canAffordPayment: true, fiveYearCompliance: false } });
    expect(next("mayQualifyResult", state)).toBe("fiveYearAck");
    expect(next("fiveYearAck", state)).toBe("fiveYearQuestion");
    expect(next("fiveYearQuestion", state)).toBe("otherOptions");
  });

  it("12. can pay and comply chooses DIY (Form 656-B) or professional help", () => {
    const state = baseState({ followUp: { canAffordPayment: true, fiveYearCompliance: true } });
    expect(next("fiveYearQuestion", state)).toBe("mayQualifyChoice");
    expect(nextScreen("mayQualifyChoice", state)).toEqual({ to: "readinessAfford", readinessFrom: "mayQualify" });
    expect(diyRouteFor("mayQualify")).toBe("form656");
  });
});

describe("not-best follow-up", () => {
  it("special circumstances goes to the professional-help questions", () => {
    const state = baseState({ followUp: { specialCircumstances: true } });
    expect(nextScreen("notBestResult", state)).toEqual({
      to: "readinessAfford",
      readinessFrom: "specialCircumstances",
    });
  });

  it("no special circumstances goes to other resolution options", () => {
    const state = baseState({ followUp: { specialCircumstances: false } });
    expect(next("notBestResult", state)).toBe("otherOptions");
  });

  it("exploring options offers DIY or professional help; declining exits cleanly", () => {
    expect(next("otherOptions", baseState({ followUp: { exploreOptions: true } }))).toBe(
      "otherOptionsChoice",
    );
    expect(next("otherOptions", baseState({ followUp: { exploreOptions: false } }))).toBe("cleanExit");
  });
});

describe("professional-help path", () => {
  const withOrigin = (origin: State["followUp"]["readinessFrom"], answers: Partial<State["followUp"]>) =>
    baseState({ followUp: { readinessFrom: origin, ...answers } });

  it("13. professional + can afford + ready goes to the booking link", () => {
    const state = withOrigin("mayQualify", { canAffordProfessional: true, readyNow: true });
    expect(next("readinessAfford", state)).toBe("readinessReady");
    expect(next("readinessReady", state)).toBe("calendarCta");
  });

  it("can afford but not ready yet is told to come back", () => {
    const state = withOrigin("mayQualify", { canAffordProfessional: true, readyNow: false });
    expect(next("readinessReady", state)).toBe("returnWhenReady");
  });

  it("14. professional + cannot afford falls back to the matching DIY option, or exits", () => {
    const cannot = { canAffordProfessional: false };
    expect(next("readinessAfford", withOrigin("mayQualify", cannot))).toBe("diyOffer");
    expect(next("readinessAfford", withOrigin("otherOptions", cannot))).toBe("diyOffer");
    expect(diyRouteFor("otherOptions")).toBe("stanCourse");
    expect(next("readinessAfford", withOrigin("scope", cannot))).toBe("cleanExit");
    expect(next("readinessAfford", withOrigin("notEligible", cannot))).toBe("cleanExit");
  });

  it("15. special circumstances + can afford + ready goes to the booking link", () => {
    let state = baseState({ followUp: { specialCircumstances: true } });
    const t = nextScreen("notBestResult", state);
    state = withOrigin(t.readinessFrom, { canAffordProfessional: true, readyNow: true });
    expect(next(t.to, state)).toBe("readinessReady");
    expect(next("readinessReady", state)).toBe("calendarCta");
  });

  it("scope results offer professional help", () => {
    expect(nextScreen("scopeResult", baseState())).toEqual({ to: "readinessAfford", readinessFrom: "scope" });
  });
});

describe("form order", () => {
  it("walks basic info, assets, income, and expenses in order", () => {
    const order: ScreenId[] = ["basicLocation"];
    let screen: ScreenId = "basicLocation";
    while (screen !== "expensesTaxes") {
      screen = next(screen, baseState(), notUsed);
      order.push(screen);
    }
    expect(order).toEqual([
      "basicLocation",
      "basicTransport",
      "basicHousehold",
      "basicDebt",
      "assetsBank",
      "assetsRealEstate",
      "assetsVehicles",
      "assetsOther",
      "incomeMain",
      "incomeOther",
      "expensesHousing",
      "expensesTransport",
      "expensesInsurance",
      "expensesTaxes",
    ]);
  });
});
