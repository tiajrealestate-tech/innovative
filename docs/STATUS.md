# Where this project stands

Voice-to-report tool for home inspectors, built around Trever Edelin's
Innovative Home Inspections (Spectora). Two pieces:

- **Web app** (Next.js on Vercel, `innovative-eight-rosy.vercel.app`) — transcript →
  findings → grouped write-ups in his voice + a Spectora checkbox build list.
- **Chrome extension** `extension/` ("Spectora Autofill") — drives the live Spectora
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
