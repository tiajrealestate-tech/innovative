import { describe, expect, it } from "vitest";
import { validateScreen } from "../qualifier/schema";
import { getTransportationOptions } from "../data/standards";
import { baseState } from "./fixtures";

describe("validation", () => {
  it("treats blank as missing but accepts zero", () => {
    const blank = baseState({ assets: { cashAndBank: undefined } });
    expect(validateScreen("assetsBank", blank)["assets.cashAndBank"]).toMatch(/Use 0 if none/);
    expect(validateScreen("assetsBank", baseState())).toEqual({});
  });

  it("requires household counts to add up", () => {
    const state = baseState({ household: { members: 3, under65: 1, age65Plus: 1 } });
    expect(validateScreen("basicHousehold", state)["household.age65Plus"]).toMatch(/add up to 3/);
    expect(validateScreen("basicHousehold", baseState({ household: { members: 2, under65: 1, age65Plus: 1 } }))).toEqual({});
  });

  it("requires a 5-digit ZIP and a county from the chosen state", () => {
    const errors = validateScreen("basicLocation", baseState({ household: { zip: "123", county: "Cook County" } }));
    expect(errors["household.zip"]).toBeDefined();
    expect(errors["household.county"]).toBeDefined();
  });

  it("requires a positive debt and a sensible tax year", () => {
    const errors = validateScreen(
      "basicDebt",
      baseState({ household: { totalIrsDebt: 0, latestDebtTaxYear: 3000 } }),
    );
    expect(errors["household.totalIrsDebt"]).toBeDefined();
    expect(errors["household.latestDebtTaxYear"]).toBeDefined();
  });

  it("skips vehicle expense amounts when there are no vehicles", () => {
    const state = baseState({ expenses: { vehicleCount: 0, vehicleLoansLeases: undefined, vehicleOperating: undefined } });
    expect(validateScreen("expensesTransport", state)).toEqual({});
  });
});

describe("transportation areas", () => {
  it("offers named metros that touch the state plus the regional fallback", () => {
    const values = getTransportationOptions("Texas").map((o) => o.value);
    expect(values).toEqual(["Dallas-Ft. Worth", "Houston", "South Region"]);
  });

  it("offers only the region when no metro touches the state", () => {
    expect(getTransportationOptions("Alabama").map((o) => o.value)).toEqual(["South Region"]);
  });

  it("includes cross-region metros such as Philadelphia for Delaware", () => {
    expect(getTransportationOptions("Delaware").map((o) => o.value)).toEqual(["Philadelphia", "South Region"]);
  });

  it("offers every IRS area where no region is verified (Puerto Rico)", () => {
    expect(getTransportationOptions("Puerto Rico")).toHaveLength(27);
  });
});
