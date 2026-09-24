import raw from "./irs-standards-2026.json";
import { metroStates, stateRegion } from "./transportationAreas";

// The single loader for IRS figures. To roll the year over, swap the JSON
// import above; nothing else in the app hard-codes a standard.

export type CarStandard = { oneCar: number; twoCars: number };

export type HousingRow = {
  state: string;
  county: string;
  family1: number;
  family2: number;
  family3: number;
  family4: number;
  family5Plus: number;
};

export type IrsStandards = {
  version: string;
  effectiveDate: string;
  reviewBy: string;
  sources: Record<string, string>;
  nationalFoodClothingMisc: {
    family1: number;
    family2: number;
    family3: number;
    family4: number;
    eachAdditionalOver4: number;
  };
  outOfPocketHealthcarePerPerson: { under65: number; age65Plus: number };
  transportation: {
    publicTransportation: number;
    ownership: CarStandard;
    operating: Record<string, CarStandard>;
  };
  assetAdjustments: {
    cashExclusion: number;
    quickSaleMultiplier: number;
    vehicleExclusionPerEligibleVehicle: number;
    personalEffectsExclusion: number;
  };
  offerMultipliers: {
    lumpSumFiveMonthsOrLess: number;
    periodicSixToTwentyFourMonths: number;
  };
  housing: HousingRow[];
};

export const standards = raw as IrsStandards;

export function getStates(s: IrsStandards = standards): string[] {
  return Array.from(new Set(s.housing.map((row) => row.state))).sort();
}

export function getCounties(state: string, s: IrsStandards = standards): string[] {
  return s.housing
    .filter((row) => row.state === state)
    .map((row) => row.county)
    .sort((a, b) => a.localeCompare(b));
}

export function findHousingRow(
  state: string | undefined,
  county: string | undefined,
  s: IrsStandards = standards,
): HousingRow | undefined {
  return s.housing.find((row) => row.state === state && row.county === county);
}

export type TransportationOption = { value: string; label: string };

function regionKey(region: string) {
  return `${region} Region`;
}

/** Named metros that touch the state, then the region fallback. */
export function getTransportationOptions(
  state: string | undefined,
  s: IrsStandards = standards,
): TransportationOption[] {
  if (!state) return [];
  const areas = Object.keys(s.transportation.operating);
  const region = stateRegion[state];

  if (!region) {
    // No verified region (e.g. Puerto Rico): offer every IRS area.
    return areas.map((area) => ({ value: area, label: area }));
  }

  const metros = areas
    .filter((area) => metroStates[area]?.includes(state))
    .map((area) => ({ value: area, label: `${area} metro area` }));
  const fallback = regionKey(region);
  return [
    ...metros,
    {
      value: fallback,
      label: metros.length
        ? `Elsewhere in ${state} (${fallback})`
        : `${state} (${fallback})`,
    },
  ];
}

export function standardsFooter(s: IrsStandards = standards): string {
  const date = new Date(`${s.effectiveDate}T00:00:00`);
  const formatted = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `Using IRS Collection Financial Standards effective ${formatted}.`;
}
