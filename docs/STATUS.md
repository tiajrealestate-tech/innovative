# Where this project stands

## MANUAL ITEMS TRACKER (things needing hands — keep current)

Per Tia 08/03: track everything a human still has to do by hand, per report and
product-wide. Update this list whenever a run leaves manual work behind.

**Melissa 6002 42nd Ave report (current):**
0. RESULT: build 21/23 verified (2 ignorable), write-ups 20/20 placed AND
   verified (1 self-healed retry; overview + Basement Walkout + Plumbing
   General optional items auto-added).
1. Fireplace fuel: untick the wrong one of Wood/Gas in Spectora — he never
   dictated the fireplace's fuel; only Trever knows. (Guessing is now blocked
   for future reports.)
1b. "Basement Slab and Framing" write-up: Structural General wouldn't open in
   this report, so it self-placed into Basements & Crawlspaces — move it to
   Structural General in Spectora if Trever prefers it there.
2. The two "STILL UNCHECKED" chimney Information lines from the Build log:
   IGNORE — those boxes don't exist on the live Info tab (stale catalog entry,
   now removed); the chimney is fully covered by its write-up.
3. Punch-list portal link: add the "Cosmetic Punch List Report Link" item to
   Inspection Details BY HAND for THIS report (the auto-placement shipped
   after it was placed). Automatic on every investor report from now on —
   standing Airtable portal URL, his exact published wording. Entering the
   cosmetic items into Airtable stays on Tia/Trever's side (their setup).
   Debris routing question still ON HOLD per Tia.
4. RESOLVED — dual-listing is his real method, proven by his approved 6002
   41st Ave punch list: the punch list deliberately overlaps the report with
   crew-executable items (escutcheons, downspouts, hardware, cleanup, bulging
   drywall). Generator recalibrated to his approved list: room-level
   consolidation (~40-55 rows), verb-chain descriptions closing repaint/
   refinish, all findings in scope with specialist-first work excluded.

**Product-wide manual steps that remain by design:**
- Trever reviews/approves every report before publish (always).
- Photos: attached via Spectora mobile app (off the table per Tia).
- Routine "was inspected" boxes: dictation-only by decision — unticked ones
  he did but didn't narrate get ticked by hand.
- Extension: APPROVED on the Chrome Web Store 08/07/2026 (v1.1.0, unlisted —
  reachable only via the direct store link from the developer dashboard).
  One-time step: Trever removes the old load-unpacked copy, then installs
  from the store link; after that every update auto-delivers. Publishing a
  new version still means uploading a fresh zip in the dev console (short
  re-review each time), but users get it automatically once it clears.
  (First submission was rejected 08/05 — privacy URL redirected to login;
  fixed by making /privacy public, resubmitted, approved.)

Voice-to-report tool for home inspectors, built around Trever Edelin's
Innovative Home Inspections (Spectora). Two pieces:

- **Web app** (Next.js on Vercel, `innovative-eight-rosy.vercel.app`) — transcript →
  findings → grouped write-ups in his voice + a Spectora checkbox build list.
- **Chrome extension** `extension/` ("HyperReports AI", formerly "Spectora Autofill") — drives the live Spectora
  editor: ticks checkboxes, adds write-ups as comments, sets rating chips, and adds
  missing optional items.

The repo has NO main branch — `claude/intelligent-mayer-c8kl5y` IS the default and
production auto-deploys from it.

## Working end to end (verified on real reports)

A full run needs no manual Spectora editing: paste the checkbox list into the green
**Build report** box, paste the write-up payload into the purple **Place write-ups**
box. Last clean run placed 20/20 with zero issues.

- Grouped write-ups match his hand-built 303 Charter Oak report nearly title-for-title.
- Extension adds optional items itself (`+ ITEM → ADD AN OPTIONAL ITEM`) — that's how
  his template ships "… General", Range/Oven/Cooktop, Basement Walkout, etc.
- Rating chips are set via the Category **icon row** (wrench = Maintenance,
  minus = Recommendation, triangle = Safety Hazard); there is no text or dropdown,
  so the extension clicks by position and verifies the highlight moved.
- Spectora generates the report summary page itself from the placed write-ups —
  nothing for us to build there.

## His method, as encoded

- **2+ like-kind deficiencies** → ONE grouped write-up, filed in the section's
  "… General" item (Exterior groups by area: concrete → Walkways, stairs → Decks,
  drainage → Vegetation).
- **A lone deficiency** → singled out under its specific defect item, and when his
  template already has a library checkbox for it, the box is TICKED rather than
  retyped (his stored wording carries it). Implemented via `box_label` on a composed
  group; validated server-side in `src/app/api/compose/route.ts`.
- Severity learned from **770 rated write-ups across his 48 most recent reports** —
  see `docs/severity-rating-guide.md`. The red chip means Safety Hazard **or Major
  Defect**: it covers both danger (gas, CO/venting, structural, falls) and big-ticket
  failing systems (missing sump pump, dead HVAC/water heater, end-of-life roof).

## Open items

1. **Verify the rating calibration.** Last measured run: 2 maintenance / 8
   recommendation / 10 safety. His build of the SAME transcript: 1 / 14 / 4. The
   prompt now carries his answer key for that house; needs one regenerate + fresh
   report to confirm it lands near 4 red.
2. **Test the combined grouped+checkbox flow** (built, never run). Open
   Report entry → Trever 2026 FIRST so the composer runs, then the Spectora tab —
   stand-alone boxes only appear in the build list after composing.
3. **`SPECTORA_API_KEY` in Vercel** to switch on the job picker (Settings →
   Environment Variables → redeploy).

## Spectora API — what it can and cannot do

Verified against a live account. Base `https://connect.spectora.com`, bearer token.
It exposes **business data only**: inspections (address, client, both agents, date,
inspector, services), agents, clients, attachments, webhooks, and an MCP server.

**There is no read or write access to report content** — no comments, checkboxes,
ratings or templates. Attachments hold only side documents (radon, HPAP, termite),
never the residential report. So the extension remains the only way to build a
report, and his published reports must still come from Google Drive for learning.

## Next up (agreed direction)

1. Publish the extension to the Chrome Web Store — every fix currently needs
   remove → download → load unpacked, which does not scale to customers and has a
   multi-day review lead time.
2. Remove the copy/paste seam: let the extension pull the payload from the app
   directly so it reads as one product.
3. Standard (non-Trever) mode, then multi-user accounts + billing for resale.

Open question for Trever: should photos attach to the write-up comments themselves,
or is his current workflow (photos on the item from the mobile app, write-up
alongside) fine? Nothing we build touches photos today.

## Beta confirmation round — CLOSED (passed), 07/31/2026

Five houses scored against the inspector's own reports:

- Gullivers Trail (held-out): pass — full coverage after safety-group fix.
- 5234 6th St (held-out, hostile transcript): pass — corrections, retractions,
  layman filtering, "building envelope" naming all honored.
- 1104 Indo Pl (held-out): pass — personal-conversation removal, location
  generalization, no-code-language shower handling, crawlspace consolidation.
- 1927 St Paul (multi-unit, non-blind): machinery validated — unit tracking,
  UNIT N RECOMMENDATIONS, Life Safety group.
- 292 MacKintosh Dr (TRUE FORWARD-BLIND head-to-head): the system covered
  19/20 dictated findings; the inspector's own independent draft covered ~15/20.
  He adjudicated: the five absences in his draft WERE misses. The system's one
  miss (habitual chimney-sweep recommendation) is fixed at both layers.
  Ratings divergence (ours 3 red / his 0) adjudicated as situational — our
  calibration stands unchanged by his instruction.

Consistent residual tendency: our reports run ~1.25–1.4x his write-up count
(we split stand-alones he rolls up). Accepted for now; a consolidation knob is
available if he wants it tightened.

Next phase: ROADMAP.md Phase 2 (package) — Chrome Web Store, seam removal,
profiles-not-code, design pass, onboarding wizard. Trever to use the tool on
live inspections and track edit time.

## Copy-paste seam removed — v0.9.0, 08/02/2026

The two gray copy/paste boxes are no longer needed. How it works now:

- The review page hands both payloads (build list + write-ups) to the
  extension automatically the moment they exist, via a window message the
  extension's new `bridge.js` (running on the app's site) stores in
  `chrome.storage.local`.
- The Spectora panel pre-fills its "Build report" and "Place write-ups" boxes
  from that store, shows a green "Loaded from the app — {address}" line, and
  live-updates if the app re-sends while the tab is open.
- The app shows "Sent to extension ✓" once the bridge acks. Copy/paste still
  works everywhere as the no-extension fallback.
- Nothing is sent to any server; the handoff happens entirely inside the
  user's own browser, so it needs no login and is multi-user-safe by design.

One-time step: Trever must remove and re-load the extension once more to get
v0.9.0 (manifest adds the `storage` permission and the bridge script). After
the Chrome Web Store listing exists, updates become automatic.

Deliberately deferred (per Tia): product name and custom domain come LAST.
The bridge is pinned to `innovative-eight-rosy.vercel.app`; adding the real
domain later is a one-line manifest addition done during the rename.

## Safety features from the pre-launch audit — v0.9.1/v0.9.2 + app, 08/02/2026

- **Wrong-house guard (v0.9.1).** The handoff carries the property address;
  before Build/Place runs the extension looks for street number + street name
  on the Spectora page. Match → "house ✓" in the status line. No match → red
  "⚠ CHECK HOUSE" and a hard confirm naming the house before anything runs.
- **Second read (app).** After extraction, a fresh pass re-reads the raw
  transcript against the finished findings list and returns ONLY dictated
  conditions no finding covers (the chimney-sweep class of miss — never
  extracted, so invisible to every downstream coverage check). Additions are
  flagged "second_read", shown with a blue "Caught on second read — verify"
  badge and a banner on Review & edit. Skipped if the time budget is nearly
  spent; failures never break extraction.
- **End-of-run verification sweeps (v0.9.2).** After a build, every line is
  re-walked and the checkbox state is read off the page (unticked boxes get
  one more click); after write-ups, every heading is confirmed present in its
  item. The log ends with "Verified N/N" — "done" now means the page says so.

Audit decisions: photos = OFF THE TABLE (per Tia; Spectora mobile attaches to
items; our write-ups land alongside; photo-AI is redundant when the transcript
already names the issue). Box-wording mismatches (e.g. stored text says "two or
more windows", reality was one): chosen fix is level 1 — capture stored wording
during template scan and route mismatches to write-ups instead of ticking;
his stored words are never edited. BUILT 08/12/2026 (extension v1.2.0 scanner
captures Defect-box stored wording; matcher refuses boxes whose stored wording
contradicts the dictation). Wording data arrives with the first v1.2.0 scan.

Extension v1.2.0 (08/12/2026, zip ready for store upload): section-level
Information scanning + building ("(Section)" pseudo-item — Inspection Method,
Roof Type/Style, water source etc. live on the section's own page, which the
scanner never visited before); stored-wording capture on Defects; stale-read
detection (the corruption that hit GFCI/Smoke items in the 08/12 scan is now
flagged as SUSPECT instead of silently recorded); nav hardening + "visible
here:" diagnostics on every not-found. AWAITING: Tia uploads zip to dev
console; after review clears, Trever re-runs Scan template and sends the file
for merge (brings section-level boxes + wordings into the catalog).

## DECISION (Tia, 08/03/2026): routine "was inspected" boxes stay dictation-only

His template has ~21 evidence boxes ("Ran Water at Kitchen Sink", "GFCI
Tested", "Doors Inspected"...). They tick ONLY when the walkthrough actually
says it. Do NOT auto-tick them: a checked box is Trever's review signal that
the system put data there from his words — pre-checking would erase the line
between what the system did and what he did. Revisit only if he asks.

## Property Condition Overview auto-places — v0.9.3, 08/02/2026

Researched from his own published reports (no Trever interruption needed):
in ALL seven reports carrying it (six of texts50 + the Indo Pl beta report),
the overview lives at **Inspection Details › PROPERTY CONDITION OVERVIEW** as
a rated comment (Recommendation) — that's what puts it at the top of
Spectora's auto summary. It is NOT in the trailing "General Overview" section,
which sits empty in every published report, and it is not a Spectora AI
feature (their AI = Report Assist comment-matching; their summary page is
auto-built from rated comments).

Build: the app now prepends the overview as the first @@ payload block
(heading "Overview" — his comment titles vary Overview/OVERVIEW/Condition
Overview; most common wins). REPORT_MAP gained Inspection Details. The last
hand-carried piece of the report is gone. Watch item for the first live run:
confirm the Inspection Details item accepts the comment flow (its tabs may
differ from defect items); the log will say precisely if not.
