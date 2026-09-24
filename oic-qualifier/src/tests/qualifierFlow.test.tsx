import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

type User = ReturnType<typeof userEvent.setup>;

const heading = () => screen.getByRole("heading", { level: 1 });
const cont = (user: User, label = "Continue") => user.click(screen.getByRole("button", { name: label }));

async function choose(user: User, name: string, group?: string) {
  const scope = group ? within(screen.getByRole("group", { name: group })) : screen;
  await user.click(scope.getByRole("radio", { name }));
}

async function answer(user: User, name: string) {
  await choose(user, name);
  await cont(user);
}

/** Fill every text box on the current screen with the same value. */
async function fillAll(user: User, value: string) {
  for (const box of screen.getAllByRole("textbox")) {
    await user.clear(box);
    await user.type(box, value);
  }
}

async function fill(user: User, label: string, value: string) {
  const box = screen.getByLabelText(label);
  await user.clear(box);
  await user.type(box, value);
}

async function throughStatus(user: User) {
  await cont(user, "Check my options");
  await cont(user, "Got it - continue");
  await answer(user, "Yes"); // federal
  await answer(user, "Yes"); // personal
  await answer(user, "No"); // not disputed
  await answer(user, "No"); // no bankruptcy
  await answer(user, "Yes"); // returns filed
  await answer(user, "Yes"); // estimated payments
  await answer(user, "Not applicable"); // deposits
}

/** Answers every financial screen for a single Alabama filer earning `wages` a month. */
async function throughFinancials(user: User, { wages, debt }: { wages: string; debt: string }) {
  expect(heading()).toHaveTextContent("Where do you live?");
  await fill(user, "ZIP code", "36067");
  await user.selectOptions(screen.getByLabelText("State"), "Alabama");
  await user.selectOptions(screen.getByLabelText("County or equivalent area"), "Autauga County");
  await cont(user);

  await answer(user, "Alabama (South Region)");

  await choose(user, "Myself only");
  await fill(user, "Total household members", "1");
  await fill(user, "Household members under age 65", "1");
  await fill(user, "Household members age 65 or older", "0");
  await cont(user);

  await fill(user, "Total federal IRS debt, including estimated penalties and interest", debt);
  await fill(user, "Most recent tax year included in that debt", "2024");
  await cont(user);

  expect(heading()).toHaveTextContent("Bank accounts and investments");
  for (let slide = 0; slide < 4; slide++) {
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    await fillAll(user, "0");
    await cont(user);
  }

  await fillAll(user, "0");
  await fill(user, "Gross wages, Social Security, pensions, and unemployment", wages);
  await cont(user);
  await fillAll(user, "0");
  await cont(user);

  await fill(user, "Monthly housing and utilities", "1200");
  await cont(user);
  await choose(user, "0"); // no vehicles
  await fillAll(user, "0"); // public transportation
  await cont(user);
  await fillAll(user, "0");
  await cont(user);
  await fillAll(user, "0");
  await cont(user);
}

describe("qualifier flow", () => {
  const fetchSpy = vi.fn();
  let storageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    storageSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    // Nothing the user typed may leave the browser or be persisted.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    vi.unstubAllGlobals();
    storageSpy.mockRestore();
  });

  it("shows the approved start screen copy", () => {
    render(<App />);
    expect(heading()).toHaveTextContent("Could an Offer in Compromise work for you?");
    expect(
      screen.getByText("Your financial answers stay in this browser and are not submitted or saved."),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "HERtaxpro" })).toBeInTheDocument();
  });

  it("walks a may-qualify case to the booking link", async () => {
    const user = userEvent.setup();
    render(<App />);
    await throughStatus(user);
    // Allowable = 867 + 90 + 1200 = 2157, so $2,657 wages leaves $500 a month.
    await throughFinancials(user, { wages: "2657", debt: "50000" });

    expect(heading()).toHaveTextContent("You may qualify for an Offer in Compromise.");
    expect(screen.getByText("$6,000")).toBeInTheDocument();
    expect(screen.getByText("$12,000")).toBeInTheDocument();
    expect(screen.getByText("Making these payments does not guarantee acceptance.")).toBeInTheDocument();
    expect(screen.getByText("Using IRS Collection Financial Standards effective June 29, 2026.")).toBeInTheDocument();

    await answer(user, "Yes"); // can afford the payment
    await cont(user, "I understand");
    await answer(user, "Yes"); // five-year compliance

    expect(heading()).toHaveTextContent("How would you like to move forward?");
    expect(screen.getByRole("link", { name: /Use the official IRS forms myself/ })).toHaveAttribute(
      "href",
      "https://www.irs.gov/pub/irs-pdf/f656b.pdf",
    );
    await user.click(screen.getByRole("button", { name: "Get professional help" }));
    await answer(user, "Yes"); // can afford professional help
    await answer(user, "Yes"); // ready now

    expect(heading()).toHaveTextContent("Talk through your next step.");
    expect(screen.getByRole("link", { name: "Schedule my free consultation" })).toBeInTheDocument();

    await cont(user, "Start over");
    expect(heading()).toHaveTextContent("Could an Offer in Compromise work for you?");
  });

  it("routes an offer at or above the debt through special circumstances", async () => {
    const user = userEvent.setup();
    render(<App />);
    await throughStatus(user);
    await throughFinancials(user, { wages: "2657", debt: "5000" });

    expect(heading()).toHaveTextContent("An Offer in Compromise may not be your best option.");
    expect(screen.getByText(/equal to or more than your IRS debt of \$5,000/)).toBeInTheDocument();
    await answer(user, "Yes"); // special circumstances
    expect(heading()).toHaveTextContent("Can you afford professional help?");
    await answer(user, "Yes");
    await answer(user, "Not yet");
    expect(heading()).toHaveTextContent("Come back when you are ready");
  });

  it("offers the Stan course when OIC is not the best route", async () => {
    const user = userEvent.setup();
    render(<App />);
    await throughStatus(user);
    await throughFinancials(user, { wages: "2657", debt: "50000" });

    await answer(user, "No"); // cannot afford the payment
    expect(heading()).toHaveTextContent("An Offer in Compromise may not be your best option.");
    expect(screen.getByText("You told us you cannot afford the required Offer in Compromise payment.")).toBeInTheDocument();
    await answer(user, "Yes"); // explore options
    expect(screen.getByRole("link", { name: /Show me the DIY option/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I want professional help" }));
    await answer(user, "No"); // cannot afford professional help
    expect(heading()).toHaveTextContent("Your DIY option");
    expect(screen.getByRole("link", { name: "Show me the DIY option" })).toBeInTheDocument();
  });

  it("exits cleanly when the user does not want to explore options", async () => {
    const user = userEvent.setup();
    render(<App />);
    await throughStatus(user);
    await throughFinancials(user, { wages: "2657", debt: "50000" });
    await answer(user, "No");
    await answer(user, "No");
    expect(heading()).toHaveTextContent("No problem.");
    expect(
      screen.getByText("This tool is available anytime if your situation changes or you are ready to take the next step."),
    ).toBeInTheDocument();
  });

  it("offers professional help for out-of-scope debt", async () => {
    const user = userEvent.setup();
    render(<App />);
    await cont(user, "Check my options");
    await cont(user, "Got it - continue");
    await answer(user, "No - it is state tax debt");

    expect(heading()).toHaveTextContent("This qualifier does not cover your type of tax issue.");
    expect(screen.getByText("This qualifier does not cover state tax debt.")).toBeInTheDocument();
    await cont(user, "See my next step");
    await answer(user, "No");
    expect(heading()).toHaveTextContent("No problem.");
  });

  it("asks the filing-help question for missing returns", async () => {
    const user = userEvent.setup();
    render(<App />);
    await cont(user, "Check my options");
    await cont(user, "Got it - continue");
    await answer(user, "Yes");
    await answer(user, "Yes");
    await answer(user, "No");
    await answer(user, "No");
    await answer(user, "No"); // returns not filed

    expect(heading()).toHaveTextContent("You may not be eligible at this time.");
    expect(
      screen.getByText(
        "You may not be eligible at this time because all required federal tax returns have not been filed.",
      ),
    ).toBeInTheDocument();
    await choose(user, "No", "Would you like help getting current on your tax filings?");
    await cont(user);
    expect(screen.getByText("You can return to this tool after your required returns are filed.")).toBeInTheDocument();
  });

  it("keeps the user on the screen and names the missing field", async () => {
    const user = userEvent.setup();
    render(<App />);
    await throughStatus(user);
    await cont(user);
    expect(heading()).toHaveTextContent("Where do you live?");
    expect(screen.getByText("Enter your 5-digit ZIP code.")).toBeInTheDocument();
    expect(screen.getByText("Choose your state.")).toBeInTheDocument();
  });

  it("requires an answer before continuing and supports Back", async () => {
    const user = userEvent.setup();
    render(<App />);
    await cont(user, "Check my options");
    await cont(user, "Got it - continue");
    await cont(user);
    expect(screen.getByText("Choose an answer to continue.")).toBeInTheDocument();
    await cont(user, "Back");
    expect(heading()).toHaveTextContent("Before you start");
  });
});
