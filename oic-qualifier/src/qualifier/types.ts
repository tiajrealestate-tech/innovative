export type YesNoNa = "yes" | "no" | "na";

export type Vehicle = { leased?: boolean; market?: number; loan?: number };
export type Property = { market?: number; loan?: number };

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
  assets: {
    cashAndBank?: number;
    investmentMarket?: number;
    investmentLoans?: number;
    digitalAssets?: number;
    retirementMarket?: number;
    retirementLoans?: number;
    lifeInsuranceCash?: number;
    lifeInsuranceLoans?: number;
    ownsRealProperty?: boolean;
    properties?: Property[];
    vehicleCount?: 0 | 1 | 2;
    vehicles?: Vehicle[];
    otherPropertyMarket?: number;
    otherPropertyLoans?: number;
    additionalEquity?: number;
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
