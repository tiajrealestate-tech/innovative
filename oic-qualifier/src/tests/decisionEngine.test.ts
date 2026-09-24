import { describe, expect, it } from "vitest";
import {
  getFinancialResult,
  getNotEligibleReason,
  getScopeIssue,
  nextScreen,
  type ScreenId,
} from "../qualifier/decisionEngine";
import { calculateOffer } from "../qualifier/calculator";
import { baseState } from "./fixtures";

const notUsed = () => {
  throw new Error("financial result should not be needed");
};

describe("scope branches", () => {
  it("1. state debt ends at the out-of-scope result", () => {
    const state = baseState({ scope: { debtJurisdiction: "state" } });
    expect(nextScreen("scopeFederal", state)).toBe("scopeFinal");
    expect(getScopeIssue(state.scope)).toBe("state");
  });

  it("2. entity debt ends at the out-of-scope result", () => {
    const state = baseState({ scope: { liabilityType: "entity" } });
    expect(nextScreen("scopePersonal", state)).toBe("scopeFinal");
    expect(getScopeIssue(state.scope)).toBe("entity");
  });

  it("3. disputed liability ends at the out-of-scope result", () => {
    const state = baseState({ scope: { disputesLiability: true } });
    expect(nextScreen("scopeDispute", state)).toBe("scopeFinal");
    expect(getScopeIssue(state.scope)).toBe("dispute");
  });

  it("unsure answers end at the out-of-scope result", () => {
    expect(nextScreen("scopeFederal", baseState({ scope: { debtJurisdiction: "unsure" } }))).toBe("scopeFinal");
    expect(nextScreen("scopePersonal", baseState({ scope: { liabilityType: "unsure" } }))).toBe("scopeFinal");
    expect(getScopeIssue({ debtJurisdiction: "unsure" })).toBe("unsure");
  });

  it("in-scope answers continue to status", () => {
    const state = baseState();
    expect(nextScreen("scopeFederal", state)).toBe("scopePersonal");
    expect(nextScreen("scopePersonal", state)).toBe("scopeDispute");
    expect(nextScreen("scopeDispute", state)).toBe("statusBankruptcy");
  });
});

describe("status branches", () => {
  it("4. open bankruptcy is not eligible at this time", () => {
    const state = baseState({ status: { openBankruptcy: true } });
    expect(nextScreen("statusBankruptcy", state)).toBe("notEligibleFinal");
    expect(getNotEligibleReason(state.status)).toBe("bankruptcy");
  });

  it("5. missing returns asks the filing-help question, then ends", () => {
    const state = baseState({ status: { returnsFiled: false }, followUp: { wantsFilingHelp: true } });
    expect(nextScreen("statusReturns", state)).toBe("notEligibleResult");
    expect(nextScreen("notEligibleResult", state)).toBe("notEligibleFinal");
    expect(getNotEligibleReason(state.status)).toBe("returns");
  });

  it("6. missing estimated payments is not eligible at this time", () => {
    const state = baseState({ status: { estimatedPayments: "no" } });
    expect(nextScreen("statusEstimated", state)).toBe("notEligibleFinal");
    expect(getNotEligibleReason(state.status)).toBe("estimatedPayments");
  });

  it("7. missing federal deposits is not eligible at this time", () => {
    const state = baseState({ status: { federalTaxDeposits: "no" } });
    expect(nextScreen("statusDeposits", state)).toBe("notEligibleFinal");
    expect(getNotEligibleReason(state.status)).toBe("deposits");
  });

  it("not applicable answers continue to the financial questions", () => {
    const state = baseState({ status: { estimatedPayments: "na", federalTaxDeposits: "na" } });
    expect(nextScreen("statusEstimated", state)).toBe("statusDeposits");
    expect(nextScreen("statusDeposits", state)).toBe("basicLocation");
  });
});

describe("financial result", () => {
  it("8. an estimated offer below the debt may qualify", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 8000, estimatedPeriodicOffer: 14000 }, 50000)).toBe(
      "mayQualify",
    );
    expect(nextScreen("expensesTaxes", baseState(), () => "mayQualify")).toBe("mayQualifyResult");
  });

  it("9. an estimated offer at or above the debt may not be the best option", () => {
    expect(getFinancialResult({ estimatedLumpSumOffer: 50000, estimatedPeriodicOffer: 60000 }, 50000)).toBe(
      "notBest",
    );
    expect(getFinancialResult({ estimatedLumpSumOffer: 90000, estimatedPeriodicOffer: 95000 }, 50000)).toBe(
      "notBest",
    );
    expect(nextScreen("expensesTaxes", baseState(), () => "notBest")).toBe("notBestResult");
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
    expect(nextScreen("mayQualifyResult", state)).toBe("otherResolution");
  });

  it("11. cannot commit to five-year compliance goes to other resolution options", () => {
    const state = baseState({ followUp: { canAffordPayment: true, fiveYearCompliance: false } });
    expect(nextScreen("mayQualifyResult", state)).toBe("fiveYearAck");
    expect(nextScreen("fiveYearAck", state)).toBe("fiveYearQuestion");
    expect(nextScreen("fiveYearQuestion", state)).toBe("otherResolution");
  });

  it("can pay and comply ends with the may-qualify recommendation", () => {
    const state = baseState({ followUp: { canAffordPayment: true, fiveYearCompliance: true } });
    expect(nextScreen("fiveYearQuestion", state)).toBe("mayQualifyFinal");
  });
});

describe("not-best follow-up", () => {
  it("12. special circumstances ends with a professional case review recommendation", () => {
    const state = baseState({ followUp: { specialCircumstances: true } });
    expect(nextScreen("notBestResult", state)).toBe("specialCircumstancesFinal");
  });

  it("no special circumstances goes to other resolution options", () => {
    const state = baseState({ followUp: { specialCircumstances: false } });
    expect(nextScreen("notBestResult", state)).toBe("otherResolution");
  });

  it("exploring options ends with a recommendation; declining exits cleanly", () => {
    expect(nextScreen("otherResolution", baseState({ followUp: { exploreOptions: true } }))).toBe(
      "exploreOptionsFinal",
    );
    expect(nextScreen("otherResolution", baseState({ followUp: { exploreOptions: false } }))).toBe("cleanExit");
  });
});

describe("form order", () => {
  it("walks basic info, assets, income, and expenses in order", () => {
    const order: ScreenId[] = ["basicLocation"];
    let screen: ScreenId = "basicLocation";
    while (screen !== "expensesTaxes") {
      screen = nextScreen(screen, baseState(), notUsed);
      order.push(screen);
    }
    expect(order).toEqual([
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
    ]);
  });
});
