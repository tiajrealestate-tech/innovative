// Writes the IRS comparison worksheet (docs/IRS-COMPARISON.md) from this app's
// calculator. Run: npm run control-cases
import { writeFileSync } from "node:fs";
import { calculateOffer } from "../src/qualifier/calculator";
import { getFinancialResult } from "../src/qualifier/decisionEngine";
import { standards } from "../src/data/standards";
import { baseState } from "../src/tests/fixtures";

type Case = { id: number; summary: string; state: ReturnType<typeof baseState> };

const loc = (state: string, county: string, area: string) => ({ state, county, transportationArea: area });

const cases: Case[] = [
  { id: 1, summary: "Single, AL, no assets, low income", state: baseState({ income: { wagesBenefits: 2000 }, expenses: { housingUtilities: 1100 } }) },
  { id: 2, summary: "Single, AL, $500/mo left over", state: baseState({ income: { wagesBenefits: 2657 }, expenses: { housingUtilities: 1200 }, assets: { cashAndBank: 3000 } }) },
  { id: 3, summary: "Single, AL, housing above county standard", state: baseState({ income: { wagesBenefits: 4000 }, expenses: { housingUtilities: 2500 } }) },
  { id: 4, summary: "Couple 65+, FL Miami-Dade, retirement account", state: baseState({ household: { ...loc("Florida", "Miami-Dade County", "Miami"), jointEstimate: true, members: 2, under65: 0, age65Plus: 2, totalIrsDebt: 60000 }, income: { wagesBenefits: 5200 }, expenses: { housingUtilities: 2600, healthInsurance: 400 }, assets: { retirementMarket: 40000 } }) },
  { id: 5, summary: "Family of 4, TX Harris, 2 cars", state: baseState({ household: { ...loc("Texas", "Harris County", "Houston"), jointEstimate: true, members: 4, under65: 4, age65Plus: 0, totalIrsDebt: 45000 }, income: { wagesBenefits: 8500 }, expenses: { housingUtilities: 2400, vehicleCount: 2, vehicleLoansLeases: 1200, vehicleOperating: 800, currentTaxes: 1300 }, assets: { vehicleCount: 2, vehicles: [{ leased: false, market: 22000, loan: 15000 }, { leased: false, market: 12000, loan: 0 }] } }) },
  { id: 6, summary: "Family of 6, GA Fulton (5+ housing)", state: baseState({ household: { ...loc("Georgia", "Fulton County", "Atlanta"), members: 6, under65: 6, age65Plus: 0, totalIrsDebt: 30000 }, income: { wagesBenefits: 7000 }, expenses: { housingUtilities: 2800, dependentCare: 600 } }) },
  { id: 7, summary: "Single, home with equity", state: baseState({ household: { totalIrsDebt: 80000 }, income: { wagesBenefits: 3000 }, expenses: { housingUtilities: 1300 }, assets: { ownsRealProperty: true, properties: [{ market: 250000, loan: 150000 }] } }) },
  { id: 8, summary: "Single, underwater home + rental", state: baseState({ household: { totalIrsDebt: 70000 }, income: { wagesBenefits: 3000, netRental: 400 }, expenses: { housingUtilities: 1300 }, assets: { ownsRealProperty: true, properties: [{ market: 150000, loan: 190000 }, { market: 90000, loan: 40000 }] } }) },
  { id: 9, summary: "Single, one owned car (exclusion)", state: baseState({ income: { wagesBenefits: 3200 }, expenses: { housingUtilities: 1200, vehicleCount: 1, vehicleLoansLeases: 450, vehicleOperating: 250 }, assets: { vehicleCount: 1, vehicles: [{ leased: false, market: 15000, loan: 4000 }] } }) },
  { id: 10, summary: "Single, two owned cars", state: baseState({ income: { wagesBenefits: 3200 }, expenses: { housingUtilities: 1200, vehicleCount: 2, vehicleLoansLeases: 450, vehicleOperating: 400 }, assets: { vehicleCount: 2, vehicles: [{ leased: false, market: 15000, loan: 0 }, { leased: false, market: 10000, loan: 0 }] } }) },
  { id: 11, summary: "Joint, two owned cars", state: baseState({ household: { jointEstimate: true, members: 2, under65: 2 }, income: { wagesBenefits: 5000 }, expenses: { housingUtilities: 1400, vehicleCount: 2, vehicleLoansLeases: 450, vehicleOperating: 400 }, assets: { vehicleCount: 2, vehicles: [{ leased: false, market: 15000, loan: 0 }, { leased: false, market: 10000, loan: 0 }] } }) },
  { id: 12, summary: "Single, leased car + transit", state: baseState({ income: { wagesBenefits: 3500 }, expenses: { housingUtilities: 1200, vehicleCount: 1, vehicleLoansLeases: 400, vehicleOperating: 200, publicTransportation: 150 }, assets: { vehicleCount: 1, vehicles: [{ leased: true }] } }) },
  { id: 13, summary: "Single, other valuable property", state: baseState({ income: { wagesBenefits: 2500 }, expenses: { housingUtilities: 1200 }, assets: { otherPropertyMarket: 30000, otherPropertyLoans: 2000 } }) },
  { id: 14, summary: "Single, investments + crypto", state: baseState({ income: { wagesBenefits: 2500, interestDividendsRoyalties: 100 }, expenses: { housingUtilities: 1200 }, assets: { investmentMarket: 12000, investmentLoans: 0, digitalAssets: 3000 } }) },
  { id: 15, summary: "Single, life insurance cash value", state: baseState({ income: { wagesBenefits: 2500 }, expenses: { housingUtilities: 1200 }, assets: { lifeInsuranceCash: 8000, lifeInsuranceLoans: 1000 } }) },
  { id: 16, summary: "Self-employed, CA Los Angeles", state: baseState({ household: { ...loc("California", "Los Angeles County", "Los Angeles"), totalIrsDebt: 95000 }, income: { netBusiness: 6500 }, expenses: { housingUtilities: 2900, healthInsurance: 550, currentTaxes: 900 } }) },
  { id: 17, summary: "Offer above debt (small debt)", state: baseState({ household: { totalIrsDebt: 6000 }, income: { wagesBenefits: 2657 }, expenses: { housingUtilities: 1200 }, assets: { cashAndBank: 3000 } }) },
  { id: 18, summary: "Couple, NY Kings, child support + court order", state: baseState({ household: { ...loc("New York", "Kings County", "New York"), jointEstimate: true, members: 3, under65: 3, totalIrsDebt: 55000 }, income: { wagesBenefits: 9000, childSupport: 500 }, expenses: { housingUtilities: 3200, courtOrdered: 700, publicTransportation: 260 } }) },
  { id: 19, summary: "Retiree, AZ Maricopa, pension", state: baseState({ household: { ...loc("Arizona", "Maricopa County", "Phoenix"), members: 1, under65: 0, age65Plus: 1, totalIrsDebt: 25000 }, income: { wagesBenefits: 3100 }, expenses: { housingUtilities: 1500, healthInsurance: 180 } }) },
  { id: 20, summary: "Single, additional equity only", state: baseState({ income: { wagesBenefits: 2000 }, expenses: { housingUtilities: 1100 }, assets: { additionalEquity: 7000 } }) },
];

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const lines = [
  "# IRS pre-qualifier comparison worksheet",
  "",
  `Generated from this app's calculator using the ${standards.effectiveDate} standards (\`npm run control-cases\`).`,
  "Every case is an eligible individual; unlisted answers are $0. See `scripts/control-cases.ts` for each case's exact inputs.",
  "",
  "Enter the same answers at https://www.irs.gov/oictool, fill in the IRS columns, and investigate any material difference before launch.",
  "",
  "| # | Case | Debt | Our lump sum | Our periodic | Our result | IRS lump sum | IRS periodic | Match? |",
  "| - | ---- | ---- | ------------ | ------------ | ---------- | ------------ | ------------ | ------ |",
];
for (const c of cases) {
  const calc = calculateOffer(c.state);
  const debt = c.state.household.totalIrsDebt ?? 0;
  const result = getFinancialResult(calc, debt) === "mayQualify" ? "May qualify" : "May not be best";
  lines.push(
    `| ${c.id} | ${c.summary} | ${money(debt)} | ${money(calc.estimatedLumpSumOffer)} | ${money(calc.estimatedPeriodicOffer)} | ${result} |  |  |  |`,
  );
}
writeFileSync("docs/IRS-COMPARISON.md", `${lines.join("\n")}\n`);
console.log(`Wrote ${cases.length} cases to docs/IRS-COMPARISON.md`);
