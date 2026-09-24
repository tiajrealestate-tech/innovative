# HERtaxpro Offer in Compromise Qualifier

A standalone, mobile-first qualifier that gives an individual with federal IRS debt a
preliminary Offer in Compromise estimate and a recommended direction. It is a static site:
there is no backend, no database, no forms that submit anywhere, and no outbound links.
Every answer lives only in React memory and is gone when the page is refreshed or closed.

The surrounding funnel (link page, contact capture, calendar, course) lives in GoHighLevel
and is intentionally not part of this project.

## Run it locally

```bash
cd oic-qualifier
npm install
npm run dev        # http://localhost:5173
```

## Test and build

```bash
npm test           # formula, branch, validation, and full click-through tests
npm run typecheck
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

## Deploy on Vercel

This folder sits inside the `innovative` repo next to the inspection app, so it is deployed
as its **own** Vercel project:

1. In Vercel: **Add New → Project** and import `tiajrealestate-tech/innovative`.
2. Set **Root Directory** to `oic-qualifier`.
3. Framework preset: **Vite**. Build command `npm run build`. Output directory `dist`.
4. No environment variables. Deploy.
5. Optional: add a custom domain (for example `oic.hertaxpro.com`) under **Settings → Domains**.

The qualifier is served at `/`, so no rewrites are needed.

## Where things live

| Path | What it is |
| --- | --- |
| `src/data/irs-standards-2026.json` | The only source of IRS standards and constants. |
| `src/data/standards.ts` | Loads the standards file; state, county, and transportation-area lookups. |
| `src/data/transportationAreas.ts` | Which IRS metros and region apply to each state (names only, no dollar values). |
| `src/qualifier/calculator.ts` | Asset, income, expense, and offer formulas. |
| `src/qualifier/decisionEngine.ts` | Every branch, result title, and recommended direction. |
| `src/qualifier/schema.ts` | Field copy and Zod validation for each data-entry screen. |
| `src/qualifier/Qualifier.tsx` | Screens and in-memory state. |
| `src/qualifier/steps/FormSteps.tsx` | Household, asset, income, and expense screens. |
| `src/tests/` | Vitest and React Testing Library tests. |
| `docs/IRS-COMPARISON.md` | Control cases to check against the official IRS pre-qualifier. |

## Branded headline font

Headlines use Dating Historia when the licensed webfont is present. Put it at
`public/fonts/DatingHistoria.woff2` and redeploy. Until then, headings fall back to
Cormorant Garamond. All fonts are bundled with the site, so no font service is contacted.

## Before launch: compare with the official IRS tool

Run `npm run control-cases` to regenerate `docs/IRS-COMPARISON.md`, then enter each case at
https://www.irs.gov/oictool and record the IRS figures. Investigate any material difference
before launch, and rerun after every annual standards update.

## Annual IRS standards update (before June 1, 2027)

1. Download the new IRS housing PDF and extract it:
   `pdftotext -layout all-states-housing-standards.pdf housing.txt`
2. `python3 scripts/build_irs_standards.py housing.txt src/data/irs-standards-2027.json`
3. Update the national, healthcare, transportation, asset, and multiplier values, plus
   `version`, `effectiveDate`, and `reviewBy`.
4. Point the import in `src/data/standards.ts` at the new file.
5. Update the literal expectations in `src/tests/calculator.test.ts`, run `npm test`, and
   rerun the IRS comparison.
