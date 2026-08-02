# HyperReports AI — browser extension (beta)

**Goal:** automatically build the Spectora report from our app's findings — navigate to each section/item, open the Defects tab, and check the matching pre-written defects — so you stop doing it by hand.

This is being built in stages. **You're on stage 1.**

---

## Stage 1 — the scanner (what's here now)

`v0.1` is a **read-only scanner**. It does **not** change anything in your report. It just looks at the live Spectora page and prints out its structure (sections, items, tabs, and the defect checkboxes it can see). You run it once, copy the result, and send it back — that tells me exactly how Spectora's page is built so I can make stage 2 (the real auto-checker) actually work instead of guessing.

### How to load it in Chrome (one time, ~2 minutes)

1. **Download this extension folder.**
   - Go to the GitHub repo → green **Code** button → **Download ZIP**.
   - Unzip it. Inside, find the **`extension`** folder (the one containing `manifest.json`).
2. **Open Chrome's extensions page.**
   - Go to `chrome://extensions` in the address bar.
   - Turn on **Developer mode** (toggle, top-right).
3. Click **Load unpacked** and select the **`extension`** folder.
   - It should now show "HyperReports AI (beta)".

### How to run the scan

1. Open a real (or practice) inspection report in Spectora, in the editor.
2. Click into a section and open a **Defects** tab (e.g. **Roof → Coverings → Defects**).
3. A small blue panel appears bottom-right: **"HyperReports."**
4. Click **Scan this report**, then **Copy result**.
5. Paste that result back to me.

That's it. Nothing was changed in your report — it only read the page.

> If the panel doesn't appear: give the report a few seconds to fully load, then refresh the page. If it still doesn't show, tell me and we'll adjust.

---

## Stages after this

- **Stage 2:** the extension reads the findings from our app, and for each one navigates to the right section/item and **checks the matching defect** (its wording + rating come with it). A "preview before it checks anything" step so you stay in control.
- **Stage 3:** handles findings with no library match (adds a custom defect), photos, and polish.

Each stage: I build → you load the updated folder → you test → I fix.
