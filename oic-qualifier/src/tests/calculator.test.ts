import { describe, expect, it } from "vitest";
import {
  calculateAssets,
  calculateExpenses,
  calculateOffer,
  healthcareStandard,
  housingStandard,
  nationalStandard,
  transportationAllowances,
  vehicleEquities,
} from "../qualifier/calculator";
import { findHousingRow, standards } from "../data/standards";
import { baseState } from "./fixtures";

// Autauga County, AL: family1 1593 ... family5Plus 2234 (2026 file).
const autauga = findHousingRow("Alabama", "Autauga County")!;

describe("IRS standards file", () => {
  it("is the June 29, 2026 edition with 3,223 housing rows", () => {
    expect(standards.effectiveDate).toBe("2026-06-29");
    expect(standards.housing).toHaveLength(3223);
  });
});

describe("national food, clothing, and miscellaneous standard", () => {
  it.each([
    [1, 867],
    [2, 1558],
    [3, 1857],
    [4, 2176],
  ])("household of %i uses $%i", (members, expected) => {
    expect(nationalStandard(members)).toBe(expected);
  });

  it("adds $397 per person above four", () => {
    expect(nationalStandard(5)).toBe(2176 + 397);
    expect(nationalStandard(7)).toBe(2176 + 3 * 397);
  });
});

describe("housing and utilities", () => {
  it("uses family5Plus for five or more without an invented increase", () => {
    expect(housingStandard(autauga, 5)).toBe(2234);
    expect(housingStandard(autauga, 9)).toBe(2234);
  });

  it("allows the actual amount when it is below the county standard", () => {
    const state = baseState({ expenses: { housingUtilities: 1200 } });
    expect(calculateExpenses(state).housingAllowed).toBe(1200);
  });

  it("caps at the county standard when actual is above it", () => {
    const state = baseState({ expenses: { housingUtilities: 3000 } });
    expect(calculateExpenses(state).housingAllowed).toBe(1593);
  });
});

describe("out-of-pocket health care", () => {
  it("uses $90 under 65 and $163 age 65 or older", () => {
    expect(healthcareStandard(1, 0)).toBe(90);
    expect(healthcareStandard(0, 1)).toBe(163);
    expect(healthcareStandard(2, 1)).toBe(2 * 90 + 163);
  });
});

describe("transportation", () => {
  const base = { loansLeases: 5000, operating: 5000, publicTransportation: 0, area: "South Region" };

  it("allows no ownership or operating costs with zero vehicles", () => {
    const t = transportationAllowances({ ...base, vehicleCount: 0 });
    expect(t.vehicleOwnershipAllowed).toBe(0);
    expect(t.vehicleOperatingAllowed).toBe(0);
  });

  it("uses one-car standards for one vehicle", () => {
    const t = transportationAllowances({ ...base, vehicleCount: 1 });
    expect(t.vehicleOwnershipAllowed).toBe(703);
    expect(t.vehicleOperatingAllowed).toBe(291);
  });

  it("uses two-car standards for two or more vehicles", () => {
    const t = transportationAllowances({ ...base, vehicleCount: 2, area: "Houston" });
    expect(t.vehicleOwnershipAllowed).toBe(1406);
    expect(t.vehicleOperatingAllowed).toBe(722);
  });

  it("allows actual costs below the standards", () => {
    const t = transportationAllowances({ ...base, vehicleCount: 1, loansLeases: 300, operating: 150 });
    expect(t.vehicleOwnershipAllowed).toBe(300);
    expect(t.vehicleOperatingAllowed).toBe(150);
  });

  it("allows public transportation alongside a vehicle, capped at $220", () => {
    const t = transportationAllowances({ ...base, vehicleCount: 1, publicTransportation: 500 });
    expect(t.publicTransportationAllowed).toBe(220);
    expect(t.vehicleOwnershipAllowed).toBe(703);
  });
});

describe("assets", () => {
  it("excludes the first $1,000 of cash", () => {
    expect(calculateAssets(baseState({ assets: { cashAndBank: 4000 } })).cash).toBe(3000);
    expect(calculateAssets(baseState({ assets: { cashAndBank: 600 } })).cash).toBe(0);
  });

  it("counts investments and life insurance at their full net value", () => {
    const a = calculateAssets(baseState({ assets: { investmentsNet: 7500, lifeInsuranceNet: 7000 } }));
    expect(a.investments).toBe(7500);
    expect(a.lifeInsurance).toBe(7000);
  });

  it("applies 80% to retirement, real estate, vehicles, and other assets", () => {
    const a = calculateAssets(
      baseState({
        assets: {
          retirementMarket: 10000,
          retirementLoans: 1000,
          homeMarket: 200000,
          homeLoan: 100000,
          otherRealEstateMarket: 50000,
          otherRealEstateLoan: 0,
          vehicle1Market: 20000,
          vehicle1Loan: 5000,
          otherAssetsMarket: 30000,
          otherAssetsLoan: 0,
        },
      }),
    );
    expect(a.retirement).toBe(7000);
    expect(a.realProperty).toBe(60000 + 40000);
    expect(a.vehicles).toEqual([16000 - 5000 - 3450, 0]);
    expect(a.otherProperty).toBe(24000 - 11980);
  });

  it("gives the $3,450 exclusion to only the first vehicle on an individual estimate", () => {
    const vehicles = [
      { market: 20000, loan: 0 },
      { market: 20000, loan: 0 },
    ];
    expect(vehicleEquities(vehicles, false)).toEqual([16000 - 3450, 16000]);
  });

  it("gives the second $3,450 exclusion only on a joint estimate", () => {
    const vehicles = [
      { market: 20000, loan: 0 },
      { market: 20000, loan: 0 },
    ];
    expect(vehicleEquities(vehicles, true)).toEqual([16000 - 3450, 16000 - 3450]);
  });

  it("treats a $0 vehicle (leased or none) as no equity and passes the exclusion on", () => {
    const vehicles = [
      { market: 0, loan: 0 },
      { market: 20000, loan: 0 },
    ];
    expect(vehicleEquities(vehicles, false)).toEqual([0, 16000 - 3450]);
  });

  it("excludes $11,980 of other assets", () => {
    const a = calculateAssets(baseState({ assets: { otherAssetsMarket: 20000, otherAssetsLoan: 0 } }));
    expect(a.otherProperty).toBe(16000 - 11980);
  });

  it("floors negative equity at zero in every category", () => {
    const a = calculateAssets(
      baseState({
        assets: {
          retirementMarket: 1000,
          retirementLoans: 5000,
          homeMarket: 100000,
          homeLoan: 150000,
          otherRealEstateMarket: 100000,
          otherRealEstateLoan: 0,
          vehicle1Market: 5000,
          vehicle1Loan: 9000,
          otherAssetsMarket: 5000,
        },
      }),
    );
    expect(a.retirement).toBe(0);
    // An underwater home does not reduce equity in other real estate.
    expect(a.realProperty).toBe(80000);
    expect(a.vehicles).toEqual([0, 0]);
    expect(a.otherProperty).toBe(0);
    expect(a.availableAssetEquity).toBe(80000);
  });

  it("adds miscellaneous equity", () => {
    const a = calculateAssets(baseState({ assets: { investmentsNet: 1500, miscellaneous: 2500 } }));
    expect(a.availableAssetEquity).toBe(4000);
  });
});

describe("offer", () => {
  it("floors remaining monthly income at zero", () => {
    const calc = calculateOffer(baseState({ income: { wagesBenefits: 500 } }));
    expect(calc.remainingMonthlyIncome).toBe(0);
  });

  it("uses 12 months for the lump sum and 24 for the periodic offer", () => {
    // Single person, Autauga: allowable = 867 food + 90 health + 1200 housing = 2157.
    const state = baseState({
      income: { wagesBenefits: 2657 },
      expenses: { housingUtilities: 1200 },
      assets: { cashAndBank: 3000 },
    });
    const calc = calculateOffer(state);
    expect(calc.expenses.totalAllowableMonthlyExpenses).toBe(2157);
    expect(calc.remainingMonthlyIncome).toBe(500);
    expect(calc.availableAssetEquity).toBe(2000);
    expect(calc.estimatedLumpSumOffer).toBe(2000 + 500 * 12);
    expect(calc.estimatedPeriodicOffer).toBe(2000 + 500 * 24);
  });

  it("adds every other allowable expense at its actual amount", () => {
    const state = baseState({
      expenses: {
        healthInsurance: 100,
        courtOrdered: 200,
        dependentCare: 300,
        lifeInsurance: 40,
        currentTaxes: 500,
        delinquentStateLocalTaxes: 60,
        securedDebtOther: 70,
      },
    });
    expect(calculateExpenses(state).otherAllowableActualExpenses).toBe(1270);
  });
});
