export type YesNoNa = "yes" | "no" | "na";

export type Vehicle = { market?: number; loan?: number };

export type QualifierState = {
  scope: {
    debtJurisdiction?: "federal" | "state" | "unsure";
    liabilityType?: "personal" | "entity" | "unsure";
    disputesLiability?: boolean;
  };
  status: {
    openBankruptcy?: boolean;
    returnsFiled?: boolean;
    estimatedPayments?: YesNoNa;
    federalTaxDeposits?: YesNoNa;
  };
  household: {
    zip?: string;
    state?: string;
    county?: string;
    jointEstimate?: boolean;
    members?: number;
    under65?: number;
    age65Plus?: number;
    totalIrsDebt?: number;
    latestDebtTaxYear?: number;
    transportationArea?: string;
  };
  // Laid out like the IRS pre-qualifier. Items the IRS values at 80% of
  // market value ask for value and loan separately; the rest ask for one net amount.
  assets: {
    cashAndBank?: number;
    investmentsNet?: number;
    retirementMarket?: number;
    retirementLoans?: number;
    homeMarket?: number;
    homeLoan?: number;
    otherRealEstateMarket?: number;
    otherRealEstateLoan?: number;
    vehicle1Market?: number;
    vehicle1Loan?: number;
    vehicle2Market?: number;
    vehicle2Loan?: number;
    otherAssetsMarket?: number;
    otherAssetsLoan?: number;
    lifeInsuranceNet?: number;
    miscellaneous?: number;
  };
  income: {
    wagesBenefits?: number;
    interestDividendsRoyalties?: number;
    businessDistributions?: number;
    netRental?: number;
    netBusiness?: number;
    childSupport?: number;
    alimony?: number;
    other?: number;
  };
  expenses: {
    housingUtilities?: number;
    vehicleCount?: 0 | 1 | 2;
    vehicleLoansLeases?: number;
    vehicleOperating?: number;
    publicTransportation?: number;
    healthInsurance?: number;
    courtOrdered?: number;
    dependentCare?: number;
    lifeInsurance?: number;
    currentTaxes?: number;
    delinquentStateLocalTaxes?: number;
    securedDebtOther?: number;
  };
  // Answers given on the result screens. Kept apart from the financial answers.
  followUp: {
    wantsFilingHelp?: boolean;
    canAffordPayment?: boolean;
    fiveYearCompliance?: boolean;
    specialCircumstances?: boolean;
    exploreOptions?: boolean;
    canAffordProfessional?: boolean;
    readyNow?: boolean;
    /** Which result led to the professional-help questions; decides the DIY fallback. */
    readinessFrom?: ReadinessOrigin;
  };
};

export type ReadinessOrigin =
  | "scope"
  | "notEligible"
  | "mayQualify"
  | "otherOptions"
  | "specialCircumstances";

export const emptyState = (): QualifierState => ({
  scope: {},
  status: {},
  household: {},
  assets: {},
  income: {},
  expenses: {},
  followUp: {},
});
