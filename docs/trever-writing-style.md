# Trever's report writing style — 2023 vs. 2026

Notes from studying Innovative Home Inspections' real reports in the shared
"Spectora Backups" Drive folder. Client names/addresses omitted on purpose —
these are style notes, not client data. Used to tune the app's generated
comment language so it matches his **current** voice.

## The shift

His 2023 reports (what the app's prompt was originally built on) and his
Jan–Jul 2026 reports read differently. The app should target the **2026** style.

### 2023 style — one finding per defect
Each defect is its own entry: a short Title-Case headline + a 2–4 sentence
first-person comment following observe → why it matters → "I recommend having a
[specific trade] [action] to [benefit]."

Example (genericized):
> **Downspouts Drain Too Close to Property** — One or more downspouts are
> draining too close to the home's foundation. I recommend having a qualified
> contractor adjust the downspout extensions to drain at least 6 feet away…

### 2026 style — consolidated, item-level deficiency write-ups
Multiple related defects under one item are **grouped into a single write-up**
with an ALL-CAPS heading, a framing intro, a numbered deficiency list, and ONE
consolidated recommendation. Structure:

1. **Heading** — ALL CAPS, system/item scoped: `ROOF DEFICIENCIES`,
   `EXTERIOR DEFICIENCIES`, `COOLING SYSTEM DEFICIENCIES`, `PLUMBING DEFICIENCIES`,
   `BASEMENT MOISTURE DEFICIENCIES`, `SAFETY DEFICIENCIES`, `STRUCTURAL CONCERNS`.
2. **Framing sentence(s)** — overall condition + likely cause, measured tone:
   "The roof is generally in serviceable condition, with localized wear and a
   drainage connection needing attention. Some conditions appear consistent with
   age and normal wear, while others may indicate deferred maintenance."
3. **Numbered list** — `Observed deficiencies include:` then `1 – …  2 – …  3 – …`
   Each line is a terse, specific observation.
4. **Consolidated recommendation** — TWO sentences: first names who to bring in
   ("I recommend further evaluation by a licensed HVAC contractor."), second
   begins "Recommend …" and lists the specific corrective actions tied to each
   numbered deficiency ("Recommend repairing the condensate leak, servicing the
   system, clearing vegetation around the condenser, and budgeting for eventual
   replacement of the aging unit.").
5. Tag line naming the trade: `Contact a qualified electrician.` /
   `Contact a qualified handyman.` / `Contact a qualified professional.`

Headings can be descriptive and span related systems ("ROOF, CHIMNEYS, AND
DRAINAGE SYSTEMS", "WINDOW & DOOR DEFICIENCIES"), not only "[SYSTEM]
DEFICIENCIES". The property overview is present in most reports but not all.
Aging-but-working equipment is called out as near end of service life with a
"budget for eventual replacement" recommendation, not as a failure.

Single, isolated defects still appear in the shorter classic form (e.g.
`DOWNSPOUT LOOSE CONNECTION`, `DUCTS NOT SEALED (CONNECTED) PROPERLY`) — one
observation + one recommendation. So a report **mixes** grouped write-ups (for
items with several defects) and single-defect entries.

### Property Conditions Overview
2026 reports open with a `PROPERTY CONDITION OVERVIEW` — a few sentences
synthesizing the whole inspection and steering the buyer ("Overall, the property
is in generally good condition… I recommend the buyer request these items be
addressed prior to closing, with particular attention to…"). Tone is set by the
house: reassuring for a clean build, direct for a rough one ("widespread defects
consistent with unlicensed and unpermitted work throughout").

## Recurring tone traits (2026)
- First person: "I recommend…", "Observed…".
- Measured / hedged where appropriate: "noted for awareness," "provided as an
  observation for the buyer's awareness rather than a determination of a
  structural defect," "the cause could not be determined during the visual
  inspection."
- Names the specific trade: licensed roofing contractor, licensed HVAC
  contractor, licensed plumber, licensed structural engineer, arborist,
  licensed pest control provider.
- **Service-dependent items**: when water/gas was shut off, he flags the item as
  not verified and says to confirm operational once service is turned on —
  rather than calling it a defect.
- Severity is labeled (e.g. "Safety Hazard/Major Defects").

## Product implication (open decision)
The app currently emits **one finding per defect** (2023 model). Matching the
2026 voice means optionally **grouping** a section/item's defects into one
consolidated write-up (framing + numbered list + single recommendation), plus a
property overview. This is a real fork: it changes the app's output shape and
how findings relate to the extension's per-checkbox autofill. Decide before
rewriting the prompt.
