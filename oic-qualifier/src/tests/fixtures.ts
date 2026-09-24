import { emptyState, type QualifierState } from "../qualifier/types";

type Patch = {
  [K in keyof QualifierState]?: Partial<QualifierState[K]>;
};

/** A complete, eligible single-person household in Autauga County, Alabama, with zero assets. */
export function baseState(patch: Patch = {}): QualifierState {
  const base = emptyState();
  const state: QualifierState = {
    ...base,
    scope: { debtJurisdiction: "federal", liabilityType: "personal", disputesLiability: false },
    status: { openBankruptcy: false, returnsFiled: true, estimatedPayments: "yes", federalTaxDeposits: "na" },
    household: {
      zip: "36067",
      state: "Alabama",
      county: "Autauga County",
      transportationArea: "South Region",
      jointEstimate: false,
      members: 1,
      under65: 1,
      age65Plus: 0,
      totalIrsDebt: 50000,
      latestDebtTaxYear: 2024,
    },
    assets: {
      cashAndBank: 0,
      investmentsNet: 0,
      retirementMarket: 0,
      retirementLoans: 0,
      homeMarket: 0,
      homeLoan: 0,
      otherRealEstateMarket: 0,
      otherRealEstateLoan: 0,
      vehicle1Market: 0,
      vehicle1Loan: 0,
      vehicle2Market: 0,
      vehicle2Loan: 0,
      otherAssetsMarket: 0,
      otherAssetsLoan: 0,
      lifeInsuranceNet: 0,
      miscellaneous: 0,
    },
    income: {
      wagesBenefits: 0,
      interestDividendsRoyalties: 0,
      businessDistributions: 0,
      netRental: 0,
      netBusiness: 0,
      childSupport: 0,
      alimony: 0,
      other: 0,
    },
    expenses: {
      housingUtilities: 0,
      vehicleCount: 0,
      vehicleLoansLeases: 0,
      vehicleOperating: 0,
      publicTransportation: 0,
      healthInsurance: 0,
      courtOrdered: 0,
      dependentCare: 0,
      lifeInsurance: 0,
      currentTaxes: 0,
      delinquentStateLocalTaxes: 0,
      securedDebtOther: 0,
    },
  };
  for (const key of Object.keys(patch) as (keyof QualifierState)[]) {
    (state[key] as object) = { ...state[key], ...patch[key] };
  }
  return state;
}
