# Long-term product roadmap (strategy discussion, captured to flesh out later)

Captured from a planning discussion 07/31/2026. Talk-only session — nothing here
is built yet unless noted. Companion docs: STATUS.md (current state),
severity-rating-guide.md (learned ratings evidence).

## Product thesis

Two tiers, one codebase:

- **Standard (base tier):** transcript → findings → their template's checkboxes
  ticked → clean per-defect write-ups. Table stakes — Spectora's own "AI Report
  Assist" (early access, ~20–25% time savings, matches voice observations to the
  inspector's pre-approved template comments) is commoditizing this tier inside
  the platform.
- **Your Voice (premium tier, the moat):** full consolidated write-ups in the
  inspector's own style, learned from their historical reports — voice,
  grouping philosophy, severity calibration, terminology. Spectora's AI does
  not do this. "AI writes reports" is copyable; "AI writes reports the way YOU
  write them" requires the learning pipeline we already built for Trever.

Trever = proof of concept, first customer, quality bar, and distribution into
the inspector community. His 2 weeks were ~85% one-time machinery (extension
automation, verification systems, speech filtering, multi-unit) and ~15%
voice-specific learning; the voice part is now scripted (770 write-ups from 48
reports extracted in an afternoon).

## Architecture rule: everything customer-specific is DATA, never code

- **Template** = scanned data. The extension's whole-report scan catalogs their
  sections/items/checkboxes (how Trever's 500-box catalog was built). Per-
  customer catalog lives in their profile; re-scan handles drift; run-time
  resilience (fuzzy items, optional-item adding, General fallbacks) already
  absorbs template variance. Ticked boxes always speak the INSPECTOR'S stored
  template wording — wording customization is theirs, in Spectora, for free.
- **Voice** = learned data. Upload 10–50 past reports → extraction pipeline
  builds their profile (voice examples, rating calibration, grouping rules,
  forbidden words). Trever's profile is currently hard-coded (n=1 shortcut);
  Phase-2 engineering = move it to a per-profile record the app loads.
- **Preferences** = settings. A slider, not code: pure checkbox / checkbox+AI
  detail / full voice. All three behaviors already exist for Trever.

## The platform (what "walls and doors" means)

- **Marketing site** (any site builder): sells the product, pretty brochure.
- **Portal** (current Next.js app on Vercel, restyled + real domain): login →
  inspection list (Spectora API job picker — built) → upload recording →
  review screen → send to extension. Settings page = the inspector's profile.
  Current UI is deliberately function-first; making it sell is a design pass
  (days), not a rebuild. Tailwind already in place.
- **Extension** (Chrome Web Store, auto-updating): the hands in Spectora.
- **Learning pipeline** (invisible): the report-ingestion scripts behind an
  upload screen.

Blue-collar constraint: onboarding is a big-buttons checklist wizard
(① install extension ② connect Spectora ③ scan template ④ upload past reports
⑤ book setup call), and the daily loop must work from a truck.

## Business model sketch

- One-time **setup fee** ($300–500): white-glove onboarding — template scan,
  report ingestion, first 3–5 reports shepherded through calibration (the
  productized version of the "10–12 rounds"; calibration converges — St Paul
  was near-right on the first shot after Gullivers' lessons).
- **Monthly subscription** ($99–199): includes support + keeping the extension
  alive through Spectora UI changes. AI cost of goods ~$2–3/report.
- First ~10 customers: onboarding is Tia + Trever's eye. Automate what repeats.
- Hire a part-time developer when strangers pay (continuity + Spectora-broke-
  the-extension response).

## Risks

1. **Spectora** builds adjacent AI (Report Assist is live) and owns the
   platform + private APIs. Edge: depth (learned voice vs canned comments).
   Hedge: keep the core platform-independent; acquisition is a real scenario.
2. **Automation fragility**: editor redesigns break placement until patched —
   auto-update + support retainer is the mitigation.
3. **Liability**: market as a drafting assistant the inspector reviews and
   approves, never autopilot. Coverage-verification machinery is a selling
   point (provably doesn't drop findings silently).
4. Inspector #2's writing may be less consistent than Trever's — voice
   learning quality varies with input quality. Friendly beta answers this.

## Phases

1. **Prove (now):** blind confirmation round on fresh transcript/report pairs;
   Trever uses it on real inspections 2 weeks; measure his edit time.
2. **Package (2–6 wks):** Chrome Web Store, remove copy-paste seam (extension
   pulls payload from app), Standard mode polish, profiles-not-code
   conversion, onboarding wizard, design pass, domain.
3. **Friendly beta (6–10 wks):** 3–5 inspectors from Trever's network, free,
   testing voice-learning on non-Trever writers.
4. **Charge:** accounts, billing, developer hire, support commitment.

## Open decisions (settle before spending money)

- Tia/Trever ownership split, IP, and his role (face/distribution vs passive).
- Product name + domain.
- Trever's review role in beta onboarding (the quality bar for Phase 3).
- Tier pricing (validate "sounds like me" willingness-to-pay in beta).
