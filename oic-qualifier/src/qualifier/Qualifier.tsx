import { useCallback, useMemo, useReducer, useState } from "react";
import { links } from "../config/links";
import { standardsFooter } from "../data/standards";
import { StepShell } from "../components/StepShell";
import { ChoiceGroup, type Choice } from "../components/ChoiceCard";
import { ResultCard } from "../components/ResultCard";
import { calculateOffer, type OfferCalculation } from "./calculator";
import {
  FORM_SCREENS,
  NOT_ELIGIBLE_MESSAGES,
  OTHER_RESOLUTION_BODY,
  RESULT_TITLES,
  SCOPE_MESSAGES,
  getFinancialResult,
  getNotEligibleReason,
  getScopeIssue,
  diyRouteFor,
  nextScreen,
  stageOf,
  type FormScreen,
  type NotEligibleReason,
  type ScopeIssue,
  type ScreenId,
  type Transition,
} from "./decisionEngine";
import { CURRENCY_SCREENS, getPath, setPath, validateScreen, type Errors } from "./schema";
import { emptyState, type QualifierState } from "./types";
import { FormStep } from "./steps/FormSteps";

// ---- State ---------------------------------------------------------------
// Answers live only in this reducer. Nothing is stored or sent anywhere.

type Model = { answers: QualifierState; history: ScreenId[] };

type Action =
  | { type: "set"; path: string; value: unknown }
  | { type: "go"; transition: Transition }
  | { type: "back" }
  | { type: "reset" };

const initialModel = (): Model => ({ answers: emptyState(), history: ["start"] });

function reducer(model: Model, action: Action): Model {
  switch (action.type) {
    case "set":
      return { ...model, answers: setPath(model.answers, action.path, action.value) };
    case "go": {
      const { to, readinessFrom } = action.transition;
      const answers = readinessFrom
        ? { ...model.answers, followUp: { ...model.answers.followUp, readinessFrom } }
        : model.answers;
      return { answers, history: [...model.history, to] };
    }
    case "back":
      return model.history.length > 1 ? { ...model, history: model.history.slice(0, -1) } : model;
    case "reset":
      return initialModel();
  }
}

// ---- Copy ----------------------------------------------------------------

const YES_NO: Choice<"yes" | "no">[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const YES_NO_NA: Choice<"yes" | "no" | "na">[] = [...YES_NO, { value: "na", label: "Not applicable" }];

type ChoiceScreen = {
  question: string;
  path: string;
  options: Choice<string>[];
  /** Stored as true/false rather than the option value. */
  boolean?: boolean;
};

const CHOICE_SCREENS: Partial<Record<ScreenId, ChoiceScreen>> = {
  scopeFederal: {
    question: "Is the tax debt federal IRS debt?",
    path: "scope.debtJurisdiction",
    options: [
      { value: "federal", label: "Yes" },
      { value: "state", label: "No - it is state tax debt" },
      { value: "unsure", label: "I am not sure" },
    ],
  },
  scopePersonal: {
    question:
      "Is this debt tied to you personally, including a sole proprietorship or single-member business reported on your personal return?",
    path: "scope.liabilityType",
    options: [
      { value: "personal", label: "Yes" },
      { value: "entity", label: "No - it is corporation or partnership debt" },
      { value: "unsure", label: "I am not sure" },
    ],
  },
  scopeDispute: {
    question: "Are you disputing whether you legally owe this tax debt?",
    path: "scope.disputesLiability",
    options: YES_NO,
    boolean: true,
  },
  statusBankruptcy: {
    question: "Are you currently in an open bankruptcy proceeding?",
    path: "status.openBankruptcy",
    options: YES_NO,
    boolean: true,
  },
  statusReturns: {
    question: "Have you filed all required federal tax returns?",
    path: "status.returnsFiled",
    options: YES_NO,
    boolean: true,
  },
  statusEstimated: {
    question: "Have you made all required estimated tax payments?",
    path: "status.estimatedPayments",
    options: YES_NO_NA,
  },
  statusDeposits: {
    question:
      "If you are self-employed and have employees, have you made all required federal tax deposits?",
    path: "status.federalTaxDeposits",
    options: YES_NO_NA,
  },
  fiveYearQuestion: {
    question: "Will you be able to file and pay your taxes on time for the next five years?",
    path: "followUp.fiveYearCompliance",
    options: YES_NO,
    boolean: true,
  },
  readinessAfford: {
    question: "Can you afford professional help?",
    path: "followUp.canAffordProfessional",
    options: YES_NO,
    boolean: true,
  },
  readinessReady: {
    question: "Are you ready to move forward now?",
    path: "followUp.readyNow",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "Not yet" },
    ],
    boolean: true,
  },
};

const SCOPE_WHY: Record<ScopeIssue, string> = {
  state:
    "You told us the debt is owed to a state. This tool only estimates Offers in Compromise for federal IRS debt, so it cannot calculate a state result.",
  entity:
    "You told us the debt belongs to a corporation or partnership. This tool only calculates offers for debt owed by an individual.",
  dispute:
    "You told us you are disputing whether you owe the tax. This tool assumes the debt is legally owed, so it cannot decide whether the amount is correct.",
  unsure:
    "You were not sure whether the debt is personal federal IRS debt, so this tool cannot calculate a reliable estimate.",
};

const NOT_ELIGIBLE_WHY: Record<NotEligibleReason, string> = {
  bankruptcy: "The IRS does not consider an Offer in Compromise while a bankruptcy case is open.",
  returns: "The IRS only considers an Offer in Compromise after all required tax returns are filed.",
  estimatedPayments:
    "The IRS only considers an Offer in Compromise when required estimated tax payments are current.",
  deposits:
    "The IRS only considers an Offer in Compromise when required federal tax deposits are current.",
};

const toOption = (stored: unknown, boolean?: boolean) =>
  stored === undefined ? undefined : boolean ? (stored ? "yes" : "no") : String(stored);

const fromOption = (value: string, boolean?: boolean) => (boolean ? value === "yes" : value);

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

const CHOOSE_ERROR = "Choose an answer to continue.";

export const DISCLAIMER =
  "This tool provides a preliminary educational estimate based on the information entered. It does not guarantee IRS acceptance and is not legal or tax advice. The IRS makes the final decision.";

// ---- Component -----------------------------------------------------------

export function Qualifier() {
  const [model, dispatch] = useReducer(reducer, undefined, initialModel);
  const [errors, setErrors] = useState<Errors>({});

  const { answers, history } = model;
  const screen = history[history.length - 1];
  const stage = stageOf(screen);

  const set = useCallback((path: string, value: unknown) => {
    dispatch({ type: "set", path, value });
    setErrors((current) => {
      const matching = Object.keys(current).filter((k) => k === path || k.startsWith(`${path}.`));
      if (!matching.length) return current;
      const rest = { ...current };
      for (const key of matching) delete rest[key];
      return rest;
    });
  }, []);

  // Derived numbers are recomputed from the answers, never written back into them.
  const calculation = useMemo<OfferCalculation | null>(() => {
    if (stage < 5 || !history.includes("expensesTaxes")) return null;
    try {
      return calculateOffer(answers);
    } catch {
      return null;
    }
  }, [answers, history, stage]);

  const go = (from: ScreenId) => {
    setErrors({});
    const transition = nextScreen(from, answers, () =>
      getFinancialResult(calculateOffer(answers), answers.household.totalIrsDebt ?? 0),
    );
    dispatch({ type: "go", transition });
  };

  const back = () => {
    setErrors({});
    dispatch({ type: "back" });
  };

  const startOver = () => {
    setErrors({});
    dispatch({ type: "reset" });
  };

  const showErrors = (found: Errors) => {
    setErrors(found);
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>("[data-error-field]");
      const target = first?.matches("fieldset") ? first.querySelector("input") : first;
      target?.focus();
    });
  };

  const continueForm = (formScreen: FormScreen) => {
    const found = validateScreen(formScreen, answers);
    if (Object.keys(found).length) showErrors(found);
    else go(formScreen);
  };

  const requireAnswer = (path: string, from: ScreenId) => {
    if (getPath(answers, path) === undefined) showErrors({ [path]: CHOOSE_ERROR });
    else go(from);
  };

  const onBack = history.length > 1 ? back : undefined;
  const startOverButton = (
    <button type="button" className="btn btn-secondary btn-block" onClick={startOver}>
      Start over
    </button>
  );
  const standardsNote = <p className="standards-note">{standardsFooter()}</p>;

  const content = (() => {
    const choice = CHOICE_SCREENS[screen];
    if (choice) {
      return (
        <StepShell
          stage={stage}
          title={choice.question}
          onBack={onBack}
          primary={{ label: "Continue", onClick: () => requireAnswer(choice.path, screen) }}
        >
          <ChoiceGroup
            legend={choice.question}
            hideLegend
            options={choice.options}
            value={toOption(getPath(answers, choice.path), choice.boolean)}
            onChange={(value) => set(choice.path, fromOption(value, choice.boolean))}
            error={errors[choice.path]}
          />
        </StepShell>
      );
    }

    if ((FORM_SCREENS as readonly string[]).includes(screen)) {
      const formScreen = screen as FormScreen;
      return (
        <FormStep
          screen={formScreen}
          stage={stage}
          title={CURRENCY_SCREENS[formScreen]?.title}
          answers={answers}
          errors={errors}
          set={set}
          onBack={back}
          onContinue={() => continueForm(formScreen)}
        />
      );
    }

    switch (screen) {
      case "start":
        return (
          <section className="start">
            <img
              className="start-mark"
              src={`${import.meta.env.BASE_URL}brand/hertaxpro-wordmark-plum.png`}
              alt="HERtaxpro"
              width={1891}
              height={644}
            />
            <h1 className="start-title">Could an Offer in Compromise work for you?</h1>
            <p className="lead">
              Answer a few questions to get a preliminary estimate based on the information you enter. The IRS
              makes the final decision on every Offer in Compromise.
            </p>
            <p className="privacy-line">
              Your financial answers stay in this browser and are not submitted or saved.
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => go("start")}>
              Check my options
            </button>
          </section>
        );

      case "scopeAck":
        return (
          <StepShell
            stage={stage}
            title="Before you start"
            onBack={onBack}
            primary={{ label: "Got it - continue", onClick: () => go(screen) }}
          >
            <p className="lead">
              This qualifier is for individual federal IRS debt. It does not evaluate state tax debt, corporation
              or partnership debt, an open bankruptcy matter, or a dispute over whether the tax is legally owed.
            </p>
          </StepShell>
        );

      case "scopeResult": {
        const issue = getScopeIssue(answers.scope) ?? "unsure";
        return (
          <StepShell
            stage={stage}
            title={RESULT_TITLES.outOfScope}
            onBack={onBack}
            primary={{ label: "See my next step", onClick: () => go(screen) }}
          >
            <ResultCard tone="scope" label="Outside this tool">
              <p className="result-strong">{SCOPE_MESSAGES[issue]}</p>
              <p>{SCOPE_WHY[issue]}</p>
              <p>Next step: a tax professional can review this issue with you.</p>
            </ResultCard>
          </StepShell>
        );
      }

      case "notEligibleResult": {
        const reason = getNotEligibleReason(answers.status) ?? "returns";
        const isReturns = reason === "returns";
        return (
          <StepShell
            stage={stage}
            title={RESULT_TITLES.notEligible}
            onBack={onBack}
            primary={{
              label: isReturns ? "Continue" : "See my next step",
              onClick: () => (isReturns ? requireAnswer("followUp.wantsFilingHelp", screen) : go(screen)),
            }}
          >
            <ResultCard tone="caution" label="Not eligible right now">
              <p className="result-strong">{NOT_ELIGIBLE_MESSAGES[reason]}</p>
              <p>{NOT_ELIGIBLE_WHY[reason]}</p>
              {!isReturns && <p>Next step: see whether professional help getting current is right for you.</p>}
            </ResultCard>
            {isReturns && (
              <ChoiceGroup
                legend="Would you like help getting current on your tax filings?"
                options={YES_NO}
                value={toOption(answers.followUp.wantsFilingHelp, true)}
                onChange={(v) => set("followUp.wantsFilingHelp", v === "yes")}
                error={errors["followUp.wantsFilingHelp"]}
              />
            )}
          </StepShell>
        );
      }

      case "mayQualifyResult": {
        if (!calculation) return <Missing onBack={back} />;
        return (
          <StepShell
            stage={stage}
            title={RESULT_TITLES.mayQualify}
            onBack={onBack}
            primary={{ label: "Continue", onClick: () => requireAnswer("followUp.canAffordPayment", screen) }}
            footer={standardsNote}
          >
            <ResultCard tone="positive" label="Preliminary estimate">
              <p>
                Based on the information you entered, you may be eligible to submit an Offer in Compromise. This is
                a preliminary estimate, not an IRS decision.
              </p>
              <OfferFigures calculation={calculation} />
            </ResultCard>
            <blockquote className="payment-note">
              <p>
                The IRS generally requires either 20% of your proposed offer upfront or monthly payments while
                reviewing your application. <strong>Making these payments does not guarantee acceptance.</strong>{" "}
                If your offer is denied, the payments are generally applied to your existing tax debt.
              </p>
              <p className="payment-example">
                20% of the 5-month estimate above:{" "}
                <strong>{money(Math.round(calculation.estimatedLumpSumOffer * 0.2))}</strong>
              </p>
            </blockquote>
            <ChoiceGroup
              legend="Can you afford the required payment?"
              options={YES_NO}
              value={toOption(answers.followUp.canAffordPayment, true)}
              onChange={(v) => set("followUp.canAffordPayment", v === "yes")}
              error={errors["followUp.canAffordPayment"]}
            />
          </StepShell>
        );
      }

      case "fiveYearAck":
        return (
          <StepShell
            stage={stage}
            title="Five years of on-time filing and payment"
            onBack={onBack}
            primary={{ label: "I understand", onClick: () => go(screen) }}
          >
            <p className="lead">
              An Offer in Compromise requires you to file and pay your taxes on time for the next five years. If
              you fail to remain compliant, the IRS can default the offer and reinstate the original tax debt.
            </p>
          </StepShell>
        );

      case "mayQualifyChoice":
        return (
          <StepShell stage={stage} title="How would you like to move forward?" onBack={onBack}>
            <div className="route-list">
              <a className="route-card" href={links.form656BookletUrl} target="_blank" rel="noreferrer">
                <span className="route-title">Use the official IRS forms myself</span>
                <span className="route-sub">Opens the official IRS Form 656-B booklet and forms.</span>
              </a>
              <button type="button" className="route-card" onClick={() => go(screen)}>
                <span className="route-title">Get professional help</span>
              </button>
            </div>
          </StepShell>
        );

      case "notBestResult": {
        if (!calculation) return <Missing onBack={back} />;
        return (
          <StepShell
            stage={stage}
            title={RESULT_TITLES.notBest}
            onBack={onBack}
            primary={{ label: "Continue", onClick: () => requireAnswer("followUp.specialCircumstances", screen) }}
            footer={standardsNote}
          >
            <ResultCard tone="neutral" label="Preliminary estimate">
              <p>{notBestReason(calculation, answers.household.totalIrsDebt ?? 0)}</p>
              <p>{OTHER_RESOLUTION_BODY}</p>
            </ResultCard>
            <ChoiceGroup
              legend="Do you believe you have special circumstances this qualifier did not fully account for?"
              helper="Examples may include a disability, serious medical needs, a major hardship, or a significant expected income change."
              options={YES_NO}
              value={toOption(answers.followUp.specialCircumstances, true)}
              onChange={(v) => set("followUp.specialCircumstances", v === "yes")}
              error={errors["followUp.specialCircumstances"]}
            />
          </StepShell>
        );
      }

      case "otherOptions":
        return (
          <StepShell
            stage={stage}
            title={RESULT_TITLES.notBest}
            onBack={onBack}
            primary={{ label: "Continue", onClick: () => requireAnswer("followUp.exploreOptions", screen) }}
            footer={standardsNote}
          >
            <ResultCard tone="neutral" label="Other options">
              <p>{otherOptionsReason(answers, calculation)}</p>
              <p>{OTHER_RESOLUTION_BODY}</p>
            </ResultCard>
            <ChoiceGroup
              legend="Would you like to explore these options?"
              options={YES_NO}
              value={toOption(answers.followUp.exploreOptions, true)}
              onChange={(v) => set("followUp.exploreOptions", v === "yes")}
              error={errors["followUp.exploreOptions"]}
            />
          </StepShell>
        );

      case "otherOptionsChoice":
        return (
          <StepShell stage={stage} title="How would you like to move forward?" onBack={onBack}>
            <div className="route-list">
              <a className="route-card" href={links.stanCourseUrl}>
                <span className="route-title">Show me the DIY option</span>
                <span className="route-sub">Handle your IRS debt with a clear plan.</span>
              </a>
              <button type="button" className="route-card" onClick={() => go(screen)}>
                <span className="route-title">I want professional help</span>
              </button>
            </div>
          </StepShell>
        );

      case "calendarCta":
        return (
          <StepShell stage={stage} title="Talk through your next step." onBack={onBack}>
            <p className="lead">
              Schedule a free tax consultation so we can review your case and discuss the next step.
            </p>
            <div className="end-actions">
              <a className="btn btn-primary btn-block" href={links.bookingUrl}>
                Schedule my free consultation
              </a>
              {startOverButton}
            </div>
          </StepShell>
        );

      case "returnWhenReady":
        return (
          <StepShell stage={stage} title="Come back when you are ready" onBack={onBack}>
            <p className="lead">When you are ready to move forward, come back and schedule your free consultation.</p>
            <div className="end-actions">{startOverButton}</div>
          </StepShell>
        );

      case "diyOffer": {
        const form656 = diyRouteFor(answers.followUp.readinessFrom) === "form656";
        return (
          <StepShell stage={stage} title="Your DIY option" onBack={onBack}>
            <p className="lead">
              {form656
                ? "The official IRS Form 656-B booklet has the forms and instructions to submit an Offer in Compromise yourself."
                : "Handle your IRS debt with a clear plan."}
            </p>
            <div className="end-actions">
              {form656 ? (
                <a
                  className="btn btn-primary btn-block"
                  href={links.form656BookletUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Use the official IRS forms myself
                </a>
              ) : (
                <a className="btn btn-primary btn-block" href={links.stanCourseUrl}>
                  Show me the DIY option
                </a>
              )}
              {startOverButton}
            </div>
          </StepShell>
        );
      }

      case "filingsExit":
        return (
          <StepShell stage={stage} title="Come back after you file" onBack={onBack}>
            <p className="lead">You can return to this tool after your required returns are filed.</p>
            <div className="end-actions">{startOverButton}</div>
          </StepShell>
        );

      case "cleanExit":
        return (
          <StepShell stage={stage} title="No problem." onBack={onBack}>
            <p className="lead">
              This tool is available anytime if your situation changes or you are ready to take the next step.
            </p>
            <div className="end-actions">{startOverButton}</div>
          </StepShell>
        );

      default:
        return <Missing onBack={back} />;
    }
  })();

  return (
    <div className="page">
      {screen !== "start" && (
        <header className="page-header">
          <img
            className="header-mark"
            src={`${import.meta.env.BASE_URL}brand/hertaxpro-wordmark-plum.png`}
            alt="HERtaxpro"
            width={1891}
            height={644}
          />
        </header>
      )}
      <main>{content}</main>
      <footer className="site-footer">
        <p>{DISCLAIMER}</p>
        <details>
          <summary>Privacy</summary>
          <p>
            This qualifier does not ask for your name, Social Security number, account numbers, or tax documents.
            Your financial answers are processed in this browser and are not submitted or saved. Refreshing or
            closing the page clears them.
          </p>
        </details>
      </footer>
    </div>
  );
}

function notBestReason(calculation: OfferCalculation, debt: number): string {
  if (calculation.estimatedLumpSumOffer <= 0) {
    return "Based on the information you entered, the estimate did not leave an amount available to offer.";
  }
  return `Based on the information you entered, the estimated offer of ${money(
    calculation.estimatedLumpSumOffer,
  )} is equal to or more than your IRS debt of ${money(debt)}.`;
}

function otherOptionsReason(answers: QualifierState, calculation: OfferCalculation | null): string {
  const f = answers.followUp;
  if (f.canAffordPayment === false) return "You told us you cannot afford the required Offer in Compromise payment.";
  if (f.fiveYearCompliance === false) {
    return "You told us you may not be able to file and pay your taxes on time for the next five years, which an Offer in Compromise requires.";
  }
  return calculation
    ? notBestReason(calculation, answers.household.totalIrsDebt ?? 0)
    : "Based on the information you entered, an Offer in Compromise may not fit your situation.";
}

function OfferFigures({ calculation }: { calculation: OfferCalculation }) {
  return (
    <dl className="offer-figures">
      <div>
        <dt>Estimated offer if paid in 5 months or less:</dt>
        <dd>{money(calculation.estimatedLumpSumOffer)}</dd>
      </div>
      <div>
        <dt>Estimated offer if paid over 6 to 24 months:</dt>
        <dd>{money(calculation.estimatedPeriodicOffer)}</dd>
      </div>
    </dl>
  );
}

function Missing({ onBack }: { onBack: () => void }) {
  return (
    <StepShell stage={5} title="A required answer is missing" onBack={onBack}>
      <p className="lead">Go back to complete the missing information before we estimate your result.</p>
    </StepShell>
  );
}
