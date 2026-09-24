import {
  findHousingRow,
  standards as defaultStandards,
  type HousingRow,
  type IrsStandards,
} from "../data/standards";
import type { QualifierState, Vehicle } from "./types";

// Every formula here comes from sections 12-15 of the build brief. Dollar
// figures come from the standards file, never from literals in this module.

const n = (value: number | undefined) => value ?? 0;
const floor0 = (value: number) => Math.max(value, 0);
const whole = (value: number) => Math.round(value);

export function nationalStandard(members: number, s: IrsStandards = defaultStandards) {
  const t = s.nationalFoodClothingMisc;
  if (members <= 1) return t.family1;
  if (members === 2) return t.family2;
  if (members === 3) return t.family3;
  if (members === 4) return t.family4;
  return t.family4 + (members - 4) * t.eachAdditionalOver4;
}

export function healthcareStandard(
  under65: number,
  age65Plus: number,
  s: IrsStandards = defaultStandards,
) {
  const t = s.outOfPocketHealthcarePerPerson;
  return under65 * t.under65 + age65Plus * t.age65Plus;
}

export function housingStandard(row: HousingRow, members: number) {
  if (members <= 1) return row.family1;
  if (members === 2) return row.family2;
  if (members === 3) return row.family3;
  if (members === 4) return row.family4;
  return row.family5Plus;
}

export function transportationAllowances(
  input: {
    vehicleCount: 0 | 1 | 2;
    loansLeases: number;
    operating: number;
    publicTransportation: number;
    area: string | undefined;
  },
  s: IrsStandards = defaultStandards,
) {
  const t = s.transportation;
  const publicTransportationAllowed = Math.min(input.publicTransportation, t.publicTransportation);
  if (input.vehicleCount === 0) {
    return { vehicleOwnershipAllowed: 0, vehicleOperatingAllowed: 0, publicTransportationAllowed };
  }
  const key = input.vehicleCount === 1 ? "oneCar" : "twoCars";
  const areaStandard = input.area ? t.operating[input.area] : undefined;
  if (!areaStandard) throw new Error(`Unknown IRS transportation area: ${input.area}`);
  return {
    vehicleOwnershipAllowed: Math.min(input.loansLeases, t.ownership[key]),
    vehicleOperatingAllowed: Math.min(input.operating, areaStandard[key]),
    publicTransportationAllowed,
  };
}

/**
 * Equity per vehicle. A vehicle entered at $0 (leased or none) has no equity.
 * The exclusion goes to the first vehicle with value, and to a second only on
 * a joint estimate.
 */
export function vehicleEquities(
  vehicles: Vehicle[],
  jointEstimate: boolean,
  s: IrsStandards = defaultStandards,
) {
  const a = s.assetAdjustments;
  const allowedExclusions = jointEstimate ? 2 : 1;
  let exclusionsUsed = 0;
  return vehicles.map((vehicle) => {
    if (n(vehicle.market) <= 0) return 0;
    const exclusion = exclusionsUsed < allowedExclusions ? a.vehicleExclusionPerEligibleVehicle : 0;
    exclusionsUsed += 1;
    return whole(floor0(n(vehicle.market) * a.quickSaleMultiplier - n(vehicle.loan) - exclusion));
  });
}

export function calculateAssets(state: QualifierState, s: IrsStandards = defaultStandards) {
  const a = state.assets;
  const adj = s.assetAdjustments;
  const q = adj.quickSaleMultiplier;
  const quickSaleEquity = (market?: number, loan?: number) => whole(floor0(n(market) * q - n(loan)));

  const cash = whole(floor0(n(a.cashAndBank) - adj.cashExclusion));
  const investments = whole(floor0(n(a.investmentsNet)));
  const retirement = quickSaleEquity(a.retirementMarket, a.retirementLoans);
  const lifeInsurance = whole(floor0(n(a.lifeInsuranceNet)));
  const realProperty =
    quickSaleEquity(a.homeMarket, a.homeLoan) +
    quickSaleEquity(a.otherRealEstateMarket, a.otherRealEstateLoan);
  const vehicleEquity = vehicleEquities(
    [
      { market: a.vehicle1Market, loan: a.vehicle1Loan },
      { market: a.vehicle2Market, loan: a.vehicle2Loan },
    ],
    Boolean(state.household.jointEstimate),
    s,
  );
  const otherProperty = whole(
    floor0(n(a.otherAssetsMarket) * q - n(a.otherAssetsLoan) - adj.personalEffectsExclusion),
  );
  const additional = whole(floor0(n(a.miscellaneous)));

  const availableAssetEquity =
    cash +
    investments +
    retirement +
    lifeInsurance +
    realProperty +
    vehicleEquity.reduce((sum, v) => sum + v, 0) +
    otherProperty +
    additional;

  return {
    cash,
    investments,
    retirement,
    lifeInsurance,
    realProperty,
    vehicles: vehicleEquity,
    otherProperty,
    additional,
    availableAssetEquity,
  };
}

export function calculateIncome(state: QualifierState) {
  const i = state.income;
  return (
    n(i.wagesBenefits) +
    n(i.interestDividendsRoyalties) +
    n(i.businessDistributions) +
    n(i.netRental) +
    n(i.netBusiness) +
    n(i.childSupport) +
    n(i.alimony) +
    n(i.other)
  );
}

export function calculateExpenses(state: QualifierState, s: IrsStandards = defaultStandards) {
  const h = state.household;
  const e = state.expenses;
  const members = n(h.members);
  const row = findHousingRow(h.state, h.county, s);
  if (!row) throw new Error(`No IRS housing standard for ${h.county}, ${h.state}`);

  const foodClothingMisc = nationalStandard(members, s);
  const outOfPocketHealthcare = healthcareStandard(n(h.under65), n(h.age65Plus), s);
  const housingAllowed = Math.min(n(e.housingUtilities), housingStandard(row, members));
  const transport = transportationAllowances(
    {
      vehicleCount: e.vehicleCount ?? 0,
      loansLeases: n(e.vehicleLoansLeases),
      operating: n(e.vehicleOperating),
      publicTransportation: n(e.publicTransportation),
      area: h.transportationArea,
    },
    s,
  );
  const otherAllowableActualExpenses =
    n(e.healthInsurance) +
    n(e.courtOrdered) +
    n(e.dependentCare) +
    n(e.lifeInsurance) +
    n(e.currentTaxes) +
    n(e.delinquentStateLocalTaxes) +
    n(e.securedDebtOther);

  const totalAllowableMonthlyExpenses =
    foodClothingMisc +
    outOfPocketHealthcare +
    housingAllowed +
    transport.vehicleOwnershipAllowed +
    transport.vehicleOperatingAllowed +
    transport.publicTransportationAllowed +
    otherAllowableActualExpenses;

  return {
    foodClothingMisc,
    outOfPocketHealthcare,
    housingAllowed,
    ...transport,
    otherAllowableActualExpenses,
    totalAllowableMonthlyExpenses,
  };
}

export type OfferCalculation = ReturnType<typeof calculateOffer>;

export function calculateOffer(state: QualifierState, s: IrsStandards = defaultStandards) {
  const assets = calculateAssets(state, s);
  const totalMonthlyHouseholdIncome = calculateIncome(state);
  const expenses = calculateExpenses(state, s);
  const remainingMonthlyIncome = floor0(
    totalMonthlyHouseholdIncome - expenses.totalAllowableMonthlyExpenses,
  );
  const m = s.offerMultipliers;
  return {
    assets,
    availableAssetEquity: assets.availableAssetEquity,
    totalMonthlyHouseholdIncome,
    expenses,
    remainingMonthlyIncome,
    estimatedLumpSumOffer: whole(
      assets.availableAssetEquity + remainingMonthlyIncome * m.lumpSumFiveMonthsOrLess,
    ),
    estimatedPeriodicOffer: whole(
      assets.availableAssetEquity + remainingMonthlyIncome * m.periodicSixToTwentyFourMonths,
    ),
  };
}
