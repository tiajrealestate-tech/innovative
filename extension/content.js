/* ==========================================================================
 * HyperReports AI — v1.0.0 (formerly "Spectora Autofill")
 *
 * v1.0.0: renamed to HyperReports AI. Panel branding updated; the bridge now
 * also listens on hyperreports.ai for when the domain connects.
 * v0.9.4/0.9.5: customer-ready labels (Step 1/Step 2, Advanced tools
 * collapsed), Step 2 renamed "Place custom write-ups", green action buttons.
 *
 * v0.9.3: the Property Condition Overview places itself — the app now sends
 * it as the first write-up block, targeted at Inspection Details ›
 * PROPERTY CONDITION OVERVIEW (where every published 2026 report keeps it).
 *
 * v0.9.2: end-of-run verification sweeps. After a build, every line is
 * re-walked and its checkbox state read off the page (unticked boxes get one
 * more click); after placing write-ups, every heading is confirmed present
 * in its item. "Done" now means the PAGE says it's done.
 *
 * v0.9.0: the copy-paste seam is gone. A bridge script on the report app's
 * site receives the build list and write-ups and stores them; this panel
 * pre-fills both boxes from that store automatically. Paste still works.
 * v0.9.1: wrong-house guard — before Build/Place runs, the payload's address
 * must be found on the Spectora page, or the inspector must explicitly
 * confirm. Status line shows "house ✓" or "⚠ CHECK HOUSE".
 * --------------------------------------------------------------------------
 * Builds a Spectora report by checking boxes across ALL sections and ALL
 * three tabs (Information, Limitations, Defects).
 *
 * BUILD REPORT input — one per line:
 *     Section > Item > Tab > Label
 *   e.g.  Roof > Coverings > Defects > Shingles Missing
 *         Roof > Coverings > Information > Architectural Shingles
 *         Roof > Coverings > Limitations > Unable to See Everything
 *   (If the Tab is omitted it defaults to Defects.)
 *
 * For each line it navigates Section -> Item -> Tab and checks the box whose
 * label matches. Defect/limitation cards expand when checked (only one at a
 * time), so it collapses each before finding the next; simple option
 * checkboxes (Information) don't expand and are handled the same way.
 * ========================================================================== */

(function () {
  if (window.__spectoraScannerLoaded) return;
  window.__spectoraScannerLoaded = true;

  const VERSION =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : "?";

  const TAB_NAMES = ["Information", "Limitations", "Defects"];

  // Pseudo-item marking a SECTION's own Information/Limitations page — the
  // groups that live on the section itself, before any item is opened
  // (Inspection Method, Roof Type/Style, water source…). Published reports
  // render these with no item prefix; the scanner and builder treat this
  // token as "stay on the section page, don't open an item".
  const SECTION_ITEM = "(Section)";

  // Panel visibility preferences persist across page loads.
  const HIDE_KEY = "spectoraAutofillHidden";
  const MIN_KEY = "spectoraAutofillMinimized";

  // Your template's sections and their items (from Innovative Home Inspections'
  // real reports). The whole-report scanner walks this map so it knows where to
  // go; the checkbox labels it finds at each stop are read live from the page.
  // If an item here is named slightly differently in Spectora it'll show up as
  // "missing" in the scan summary, which tells us exactly what to fix.
  const REPORT_MAP = [
    // Section 1 in his reports. The editor has exactly TWO items here:
    // "General" (whose Information tab holds the In Attendance / Occupancy /
    // Type of Building / Weather checkbox groups — they are groups inside
    // General, NOT items, despite how the published PDF renders them) and
    // the PROPERTY CONDITION OVERVIEW comment item.
    ["Inspection Details", ["General", "PROPERTY CONDITION OVERVIEW", "Cosmetic Punch List Report Link"]],
    ["Roof", ["Coverings", "Roof Drainage Systems", "Flashings", "Skylights, Chimneys & Other Roof Penetrations", "Roofing General"]],
    ["Exterior", ["Siding, Flashing & Trim", "Exterior Windows", "Exterior Doors", "Decks, Balconies, Porches & Steps", "Walkways, Patios & Driveways", "Eaves, Soffits & Fascia", "Vegetation, Grading, Drainage & Retaining Walls", "Windows & Doors", "Basement Walkout", "Exterior General"]],
    ["Basement, Foundation, Crawlspace & Structure", ["Basements & Crawlspaces", "Foundation", "Structural Components", "Structural General"]],
    ["Heating", ["Equipment", "Distribution Systems", "Normal Operating Controls", "Flues & Vents", "HVAC General"]],
    ["Cooling", ["Cooling Equipment", "Distribution System"]],
    ["Plumbing", ["Main Water Shut-off Device", "Water Supply, Distribution Systems & Fixtures", "Drain, Waste, & Vent Systems", "Hot Water Systems, Controls, Flues & Vents", "Fuel Storage & Distribution", "Sump Pump", "Plumbing General"]],
    ["Electrical", ["Service Entrance Conductors", "Service & Grounding", "Main & Subpanels, Service & Grounding, Main Overcurrent Device", "Branch Wiring Circuits, Breakers & Fuses", "Lighting Fixtures, Switches & Receptacles", "GFCI & AFCI", "Smoke & CO Detectors", "Electrical General"]],
    ["Fireplace", ["Cleanout Doors & Frames", "Fireplace", "Chimney"]],
    ["Doors, Windows & Interior", ["Doors", "Windows", "Floors, Walls, Ceilings", "Stairs, Steps, Stoops, Stairways & Ramps", "Switches, Fixtures & Receptacles", "Presence of Smoke and CO Detectors", "Interior (General)"]],
    ["Attic, Insulation & Ventilation", ["Structural Components & Observations in Attic", "Insulation", "Ventilation", "Exhaust Systems"]],
    ["Bathrooms", ["Sinks, Tubs & Showers", "Bathroom Toilets", "Cabinetry, Ceiling, Walls & Floor", "Bathroom Exhaust Fan / Window", "GFCI & Electric in Bathroom"]],
    ["Laundry", ["Clothes Washer", "Dryer", "Ventilation", "Plumbing & Hookups"]],
    ["Kitchen", ["Kitchen Sink", "Cabinets & Countertops", "Garbage Disposal", "Range/Oven/Cooktop", "Dishwasher", "Refrigerator", "Ventilation"]],
    ["Garage", ["Garage Door & Opener", "Occupant Door (From garage to inside of home)", "Ceiling & Firewall", "Floor"]],
    ["General Overview", ["General"]],
    ["Radon Results", ["Results"]],
  ];

  // ---- generic helpers ----------------------------------------------------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(pred, timeout = 3000, step = 120) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (pred()) return true;
      } catch (e) {}
      await sleep(step);
    }
    return false;
  }
  function trimText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }
  function norm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function clean(t) {
    return (t || "")
      .replace(/\s*Edit\s+Photos.*$/i, "")
      .replace(/\s*Edit this comment.*$/i, "")
      .trim();
  }
  function isEditorFrame() {
    if (document.querySelector('input[type="checkbox"]')) return true;
    return [...document.querySelectorAll("span")].some(
      (el) => el.children.length === 0 && TAB_NAMES.includes(trimText(el))
    );
  }

  // ---- checkboxes (works on any tab) --------------------------------------

  // The readable label for a checkbox: an associated <label>, the enclosing
  // comment-card title, or the nearest small text container (option labels).
  function labelFor(cb) {
    if (cb.id) {
      try {
        const l = document.querySelector('label[for="' + CSS.escape(cb.id) + '"]');
        if (l) return clean(trimText(l));
      } catch (e) {}
    }
    const wrap = cb.closest("label");
    if (wrap) return clean(trimText(wrap));
    const card = cb.closest(".comment.record");
    if (card) return clean(trimText(card.querySelector(".card-header") || card));
    let node = cb.parentElement;
    for (let i = 0; i < 5 && node; i++) {
      const t = clean(trimText(node));
      if (t.length >= 2 && t.length <= 80) return t;
      node = node.parentElement;
    }
    return clean(trimText(cb.parentElement || cb)).slice(0, 80);
  }
  function allCheckboxes() {
    return [...document.querySelectorAll('input[type="checkbox"]')].map((cb) => ({
      cb,
      label: labelFor(cb),
      rec: cb.closest(".comment.record"),
    }));
  }
  function matchCb(list, wanted) {
    const w = norm(wanted);
    return (
      list.find((x) => norm(x.label) === w) ||
      list.find((x) => norm(x.label).startsWith(w) && w.length > 2) ||
      list.find((x) => norm(x.label).includes(w) && w.length > 3) ||
      null
    );
  }
  function findCb(line) {
    return matchCb(allCheckboxes(), line);
  }

  // Expandable comment cards (Defects / Limitations) hide their siblings when
  // open; collapse the open one so we can see the rest.
  function expandedRecord() {
    for (const rec of document.querySelectorAll('.comment.record, [class*="comment"]')) {
      if (rec.querySelector('textarea, [contenteditable="true"]')) return rec;
    }
    return null;
  }
  function collapseOpen() {
    const rec = expandedRecord();
    if (!rec) return false;
    // Only a distinct header is a safe collapse handle — clicking the card
    // itself TICKS its checkbox in Spectora's editor.
    const header = rec.querySelector(".card-header");
    if (!header || header.querySelector('input[type="checkbox"]')) return false;
    header.click();
    return true;
  }

  // ---- highlight (preview) ------------------------------------------------

  let highlighted = [];
  function clearHighlights() {
    for (const el of highlighted) {
      el.style.outline = "";
      el.style.outlineOffset = "";
    }
    highlighted = [];
  }
  function highlight(el, color) {
    if (!el) return;
    el.style.outline = "3px solid " + color;
    el.style.outlineOffset = "2px";
    highlighted.push(el);
  }
  function parseLines(text) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  // ---- checking a list of labels in the current tab -----------------------

  async function checkLabels(labels, log, prefix) {
    let checked = 0;
    let already = 0;
    const misses = [];
    if (collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 2000);
    for (let i = 0; i < labels.length; i++) {
      const line = labels[i];
      if (log) log(`${prefix || ""}${i + 1}/${labels.length}: ${line}`);
      if (collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 2000);

      let m = findCb(line);
      if (!m) await waitFor(() => !!(m = findCb(line)), 2500);
      if (!m) {
        misses.push(line + " (not found)");
        continue;
      }
      if (m.cb.checked) {
        already++;
        continue;
      }
      // The template can hold the IDENTICAL box twice in one item (or default
      // one copy on) — ticking this copy too published the same limitation
      // twice on 46 Club View. If any same-worded box on this tab is already
      // checked, the content is in the report; skip this copy.
      const twin = allCheckboxes().find(
        (x) => x.cb !== m.cb && x.cb.checked && norm(x.label) === norm(m.label)
      );
      if (twin) {
        already++;
        if (log) log(`  (an identical box is already ticked — skipped this duplicate copy)`);
        continue;
      }
      m.cb.click();
      const ok = await waitFor(() => {
        const f = findCb(line);
        return !!(f && f.cb.checked);
      }, 3500);
      if (ok) checked++;
      else misses.push(line + " (didn't stick)");
      if (m.rec && collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 2500);
      await sleep(150);
    }
    return { checked, already, misses };
  }

  function preview(text, log) {
    clearHighlights();
    const wanted = parseLines(text);
    if (!allCheckboxes().length) {
      log("No checkboxes found on this tab.");
      return;
    }
    let hit = 0;
    const misses = [];
    let first = null;
    for (const line of wanted) {
      const m = findCb(line);
      if (m) {
        highlight(m.rec || m.cb.closest("div") || m.cb, m.cb.checked ? "#16a34a" : "#2a56d4");
        if (!first) first = m.rec || m.cb;
        hit++;
      } else misses.push(line);
    }
    if (first && first.scrollIntoView) first.scrollIntoView({ behavior: "smooth", block: "center" });
    log(
      `Found ${hit} of ${wanted.length}. Blue = will check, green = already checked.` +
        (misses.length ? `\nNot found here: ${misses.join(", ")}` : "")
    );
  }

  async function applyChecks(text, log) {
    clearHighlights();
    const labels = parseLines(text);
    const r = await checkLabels(labels, log, "");
    log(
      `Checked ${r.checked}${r.already ? `, ${r.already} already` : ""} of ${labels.length}.` +
        (r.misses.length ? `\nProblem: ${r.misses.join(", ")}` : "") +
        `\n\nEyeball them — if a box is wrong, click it to undo.`
    );
  }

  // ---- navigation ---------------------------------------------------------

  function existsByText(name) {
    const t = norm(name);
    return [...document.querySelectorAll("span,li,a,button,div")].some(
      (el) => el.children.length === 0 && norm(el.textContent) === t
    );
  }
  // The app's write-ups sometimes carry an item name that's close to — but not
  // exactly — what Spectora shows ("Chimneys & Other Roof Penetrations" vs
  // "Skylights, Chimneys & Other Roof Penetrations"). Resolve the wanted name
  // to the closest on-screen nav label; null when nothing is close enough,
  // so the caller can fall back rather than click something wrong.
  // Section names must never be candidates when we're hunting an ITEM —
  // "Exterior" sits inside "Exterior General" and would hijack it, sending the
  // write-up into whatever item happened to be open (a real bug we hit).
  const SECTION_NORMS = new Set(REPORT_MAP.map(([s]) => norm(s)));
  function resolveNavText(name) {
    const t = norm(name);
    if (!t) return null;
    const leaves = [...document.querySelectorAll("span,li,a,button,div")].filter(
      (el) => el.children.length === 0 && trimText(el) && trimText(el).length < 90
    );
    if (leaves.some((el) => norm(el.textContent) === t)) return name;
    const want = t.split(" ").filter(Boolean);
    let best = null;
    let bestScore = 0;
    const seen = new Set();
    for (const el of leaves) {
      const txt = trimText(el);
      const n = norm(txt);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      if (SECTION_NORMS.has(n) && n !== t) continue;
      const have = new Set(n.split(" ").filter(Boolean));
      let hit = 0;
      for (const w of want) if (have.has(w)) hit++;
      let score = hit / Math.max(want.length, have.size);
      // One name containing the other is a strong signal, but only when the
      // shorter is a big piece of the longer — otherwise a short generic label
      // hijacks a longer target that merely includes it.
      const shorter = Math.min(n.length, t.length);
      const longer = Math.max(n.length, t.length);
      if ((n.includes(t) || t.includes(n)) && shorter / longer > 0.55) {
        score = Math.max(score, 0.75);
      }
      if (score > bestScore) {
        bestScore = score;
        best = txt;
      }
    }
    return bestScore >= 0.6 ? best : null;
  }
  // Fire a full, bubbling mouse-event sequence. Spectora's Vue app doesn't
  // always react to a bare .click(); pointer/mouse events cover its handlers,
  // and firing on the text leaf lets the event bubble UP to whichever inner
  // element actually owns the handler (a plain .click() on the outer <li>
  // overshoots and never reaches it).
  // Exactly one activation. Spectora's Vue handlers need the full pointer/mouse
  // sequence (a bare click event is ignored — see fireClick), but fireClick
  // delivers TWO activations (synthetic click + native .click()), which is what
  // duplicated comments. This fires the full sequence with a single click at
  // the end, on a single element.
  function clickOnce(el) {
    if (!el) return false;
    const o = { bubbles: true, cancelable: true, view: window };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      try { el.dispatchEvent(new MouseEvent(type, o)); } catch (e) {}
    }
    try {
      el.dispatchEvent(new MouseEvent("click", o));
      return true;
    } catch (e) {
      try { el.click(); return true; } catch (e2) { return false; }
    }
  }
  function clickByTextOnce(name) {
    const t = norm(name);
    const leaf = [...document.querySelectorAll("span,li,a,button,div")].find(
      (el) => el.children.length === 0 && norm(el.textContent) === t && el.offsetParent !== null
    );
    if (!leaf) return false;
    return clickOnce(leaf);
  }

  function fireClick(el) {
    if (!el) return;
    const o = { bubbles: true, cancelable: true, view: window };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try {
        el.dispatchEvent(new MouseEvent(type, o));
      } catch (e) {}
    }
    if (typeof el.click === "function") {
      try {
        el.click();
      } catch (e) {}
    }
  }
  function clickByText(name) {
    const t = norm(name);
    const leaves = [...document.querySelectorAll("span,li,a,button,div")].filter(
      (el) => el.children.length === 0 && norm(el.textContent) === t
    );
    if (!leaves.length) return false;
    leaves.sort((a, b) => (a.closest("li") ? 0 : 1) - (b.closest("li") ? 0 : 1));
    const leaf = leaves[0];
    // A nav entry below the fold of a scrollable sidebar may ignore events —
    // bring it into view first.
    try { leaf.scrollIntoView({ block: "center" }); } catch (e) {}
    // Fire on the text leaf first (bubbles up to the real inner handler), then
    // on the nearest clickable ancestor as a backup — both are safe because
    // clickByText only drives navigation (sections/items/tabs), never checkboxes.
    fireClick(leaf);
    const clk = leaf.closest('li,a,button,[role="tab"],[role="button"]');
    if (clk && clk !== leaf) fireClick(clk);
    return true;
  }

  // When a nav name can't be found, the list may be virtualized: entries only
  // exist in the DOM while scrolled near. Nudge every scrollable pane through
  // its range so lazy entries render, giving the caller a second chance.
  async function nudgeScrollPanes() {
    const panes = [...document.querySelectorAll("*")].filter(
      (el) => el.scrollHeight > el.clientHeight + 40 && el.clientHeight > 100
    );
    for (const pane of panes.slice(0, 6)) {
      const orig = pane.scrollTop;
      try {
        pane.scrollTop = pane.scrollHeight;
        await sleep(250);
        pane.scrollTop = 0;
        await sleep(250);
        pane.scrollTop = orig;
      } catch (e) {}
    }
    await sleep(200);
  }

  // What CAN be seen right now — so a "not found" in the scan log tells us the
  // real on-screen names instead of leaving us guessing.
  function visibleNavTexts() {
    const seen = new Set();
    const out = [];
    for (const el of document.querySelectorAll("span,li,a")) {
      if (el.children.length !== 0) continue;
      if (el.offsetParent === null) continue;
      const t = trimText(el);
      if (!t || t.length < 3 || t.length > 60) continue;
      const n = norm(t);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      out.push(t);
      if (out.length >= 30) break;
    }
    return out;
  }
  function tabActive(name) {
    const leaf = [...document.querySelectorAll("span")].find(
      (el) => el.children.length === 0 && norm(el.textContent) === norm(name)
    );
    if (!leaf || !leaf.parentElement) return false;
    const c = leaf.parentElement.className || "";
    return /opacity-100/.test(c) && !/opacity-50/.test(c);
  }

  async function selectSection(name) {
    if (!clickByText(name)) {
      // The section list may be scrolled/virtualized — render everything once
      // and retry before declaring it missing.
      await nudgeScrollPanes();
      if (!clickByText(name)) return false;
    }
    await sleep(1000); // let the section's item list render
    return true;
  }
  async function selectItem(name) {
    // After switching sections the item list can take a moment to appear.
    // Accept the closest on-screen name when the exact one isn't there.
    let resolved = null;
    await waitFor(() => {
      resolved = resolveNavText(name);
      return !!resolved;
    }, 7000);
    if (!resolved) {
      await nudgeScrollPanes();
      resolved = resolveNavText(name);
    }
    if (!resolved) return false;
    clickByText(resolved);
    await sleep(900); // let the item's tabs/content render
    return true;
  }
  async function openTab(name) {
    if (!(await waitFor(() => existsByText(name), 4000))) return false;
    clickByText(name);
    await waitFor(() => tabActive(name), 4000);
    await sleep(500);
    return true;
  }

  // ---- build report -------------------------------------------------------

  function canonicalTab(s) {
    const n = norm(s);
    return TAB_NAMES.find((t) => norm(t) === n) || null;
  }
  function parseReport(text) {
    const map = new Map();
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s*[>|]\s*/).map((p) => p.trim());
      if (parts.length < 3) continue;
      const section = parts[0];
      const item = parts[1];
      let tab = "Defects";
      let labelParts = parts.slice(2);
      const maybeTab = canonicalTab(parts[2]);
      if (maybeTab && parts.length >= 4) {
        tab = maybeTab;
        labelParts = parts.slice(3);
      }
      const label = labelParts.join(" > ").trim();
      if (!label) continue;
      const key = section + "||" + item + "||" + tab;
      if (!map.has(key)) map.set(key, { section, item, tab, labels: [] });
      map.get(key).labels.push(label);
    }
    return [...map.values()];
  }

  async function buildReport(text, log) {
    clearHighlights();
    const groups = parseReport(text);
    if (!groups.length) {
      log("No valid lines. Use:  Section > Item > Tab > Label  (one per line).");
      return;
    }
    let itemsDone = 0;
    let totalChecked = 0;
    const problems = [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      log(`(${g + 1}/${groups.length}) ${grp.section} › ${grp.item} › ${grp.tab}…`);
      if (!(await selectSection(grp.section))) {
        problems.push("Section not found: " + grp.section);
        continue;
      }
      // "(Section)" boxes live on the section's own page — no item to open.
      if (grp.item !== SECTION_ITEM && !(await selectItem(grp.item))) {
        // It may be an optional item this report hasn't added yet.
        if ((await addOptionalItem(grp.item)) && (await selectItem(grp.item))) {
          log(`  Added optional item "${grp.item}" to ${grp.section}.`);
        } else {
          problems.push(`Item not found: ${grp.item} (in ${grp.section})`);
          continue;
        }
      }
      if (!(await openTab(grp.tab))) {
        problems.push(`Tab not found: ${grp.tab} (in ${grp.section} › ${grp.item})`);
        continue;
      }
      const r = await checkLabels(grp.labels, log, `${grp.item}/${grp.tab}: `);
      totalChecked += r.checked;
      r.misses.forEach((m) => problems.push(`${grp.section} › ${grp.item} › ${grp.tab}: ${m}`));
      itemsDone++;
    }
    log(
      `Checked ${totalChecked} box(es) across ${itemsDone}/${groups.length} item-tabs.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : "")
    );

    // The build is only done when the PAGE says so: re-walk every line and
    // confirm its box is really checked, re-checking any that aren't.
    if (itemsDone > 0) {
      log(`\nVerification sweep — confirming every box on the page…`);
      const v = await verifySweep(groups, log);
      log(
        `Verified ${v.confirmed}/${v.total} boxes` +
          (v.fixed ? ` (${v.fixed} re-checked during the sweep)` : "") +
          (v.still.length
            ? `\n\nSTILL UNCHECKED — do these by hand:\n- ${v.still.join("\n- ")}`
            : " — everything the list asked for is on the page.")
      );
    }
  }

  // ---- end-of-run verification sweep (build) ------------------------------
  // Trust nothing from the first pass: revisit every section/item/tab and read
  // the checkbox state off the page. Anything unticked gets one more click.
  async function verifySweep(groups, log) {
    let confirmed = 0;
    let fixed = 0;
    let total = 0;
    const still = [];
    for (const grp of groups) {
      total += grp.labels.length;
      if (
        !(await selectSection(grp.section)) ||
        (grp.item !== SECTION_ITEM && !(await selectItem(grp.item))) ||
        !(await openTab(grp.tab))
      ) {
        grp.labels.forEach((l) =>
          still.push(`${grp.section} › ${grp.item} › ${grp.tab}: ${l} (couldn't reopen)`)
        );
        continue;
      }
      if (collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 2000);
      for (const line of grp.labels) {
        let m = findCb(line);
        if (!m) await waitFor(() => !!(m = findCb(line)), 2000);
        if (m && m.cb.checked) {
          confirmed++;
          continue;
        }
        if (m) {
          m.cb.click();
          const ok = await waitFor(() => {
            const f = findCb(line);
            return !!(f && f.cb.checked);
          }, 3000);
          if (collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 2000);
          if (ok) {
            fixed++;
            confirmed++;
            continue;
          }
        }
        still.push(`${grp.section} › ${grp.item} › ${grp.tab}: ${line}`);
      }
    }
    return { total, confirmed, fixed, still };
  }

  // ---- recovery: clear every Defects-tab tick -----------------------------
  // After the v1.2.0 scan incident ticked defect boxes across a live report:
  // untick EVERY checked box on EVERY Defects tab (Information/Limitations are
  // never touched — the scan never ticked those). Then one press of "Build
  // report" re-checks the legitimate defect lines from Step 1.
  async function confirmAnyDeleteDialog() {
    await sleep(250);
    // ONLY inside an actual dialog/modal overlay. An unscoped search clicked
    // Delete buttons on open comment cards and destroyed placed write-ups.
    const dialog = document.querySelector(
      '[role="dialog"], [role="alertdialog"], .modal, [class*="modal"], [class*="dialog"]'
    );
    if (!dialog || dialog.offsetParent === null) return;
    const btn = [...dialog.querySelectorAll("button,[role='button']")].find(
      (el) =>
        el.offsetParent !== null &&
        /^(delete|remove|yes|confirm|ok)$/i.test(trimText(el))
    );
    if (btn) {
      clickOnce(btn);
      await sleep(400);
    }
  }
  async function clearAllDefects(log) {
    let cleared = 0;
    const problems = [];
    for (let s = 0; s < REPORT_MAP.length; s++) {
      const [section, items] = REPORT_MAP[s];
      log(`(${s + 1}/${REPORT_MAP.length}) ${section}…`);
      if (!(await selectSection(section))) {
        problems.push("Section not found: " + section);
        continue;
      }
      for (const item of items) {
        if (item === SECTION_ITEM) continue;
        if (!(await selectItem(item))) {
          // Could be genuinely absent OR a navigation miss — either way,
          // SAY SO. A silent skip on a recovery tool hides exactly the boxes
          // the user most needs to check by hand (it hid three Exterior
          // items on the first real run).
          problems.push(`Couldn't open ${section} › ${item} — check its Defects tab by hand`);
          continue;
        }
        if (!existsByText("Defects")) continue;
        if (!(await openTab("Defects"))) continue;
        let guard = 0;
        while (guard++ < 80) {
          const checked = allCheckboxes().filter((x) => x.cb.checked);
          if (!checked.length) break;
          const x = checked[0];
          const lbl = x.label;
          x.cb.click();
          await confirmAnyDeleteDialog();
          const ok = await waitFor(() => {
            const f = findCb(lbl);
            return !f || !f.cb.checked;
          }, 3500);
          if (ok) {
            cleared++;
            log(`   ✕ ${item}: ${lbl}`);
          } else {
            problems.push(`${section} › ${item}: ${lbl} (would not untick)`);
            break;
          }
          await sleep(150);
        }
      }
    }
    log(
      `\nCleared ${cleared} defect box(es).` +
        (problems.length ? `\nIssues:\n- ${problems.join("\n- ")}` : "") +
        `\n\nNOW press "Build report" (Step 1) to re-check the legitimate boxes.`
    );
  }

  // ---- scan (debug) -------------------------------------------------------

  function scan() {
    return {
      url: location.href,
      version: VERSION,
      checkboxes: allCheckboxes()
        .slice(0, 60)
        .map((x) => ({ label: x.label, checked: x.cb.checked })),
      activeTab: TAB_NAMES.find((t) => tabActive(t)) || null,
    };
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: (mime || "text/plain") + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Read every checkbox label on the tab we're currently on. Collapse any open
  // defect card first so no siblings are hidden, then read the full list.
  async function readCurrentTabLabels() {
    if (collapseOpen()) await waitFor(() => allCheckboxes().length > 1, 1500);
    const seen = new Set();
    const labels = [];
    for (const x of allCheckboxes()) {
      const l = (x.label || "").trim();
      if (l && !seen.has(l)) {
        seen.add(l);
        labels.push(l);
      }
    }
    return labels;
  }

  // Stored wording for Defect boxes: expanding a comment card (clicking its
  // header, NOT its checkbox) reveals the pre-written body that ticking the box
  // places in the report. Captured so the app can refuse a box whose stored
  // wording contradicts the dictation (the "two or more windows" problem).
  // Fully defensive: any failure just leaves that box without wording.
  async function readDefectWordings(labels) {
    const wordings = {};
    for (const label of labels) {
      try {
        let m = findCb(label);
        if (!m || !m.rec) continue;
        const wasChecked = m.cb.checked;
        // ONLY a distinct header element is a safe expand handle. Clicking the
        // card itself (the old fallback) TICKS THE BOX in Spectora's editor —
        // that fallback checked defects all over a live report. No header, no
        // wording: skipping is always safe; clicking blind never is.
        const header = m.rec.querySelector(".card-header");
        if (!header) continue;
        if (header.contains(m.cb) || header.querySelector('input[type="checkbox"]')) continue;
        clickOnce(header);
        // If the click ticked the box anyway, undo it IMMEDIATELY and move on.
        await sleep(150);
        let now = findCb(label);
        if (now && now.cb.checked !== wasChecked) {
          now.cb.click();
          await waitFor(() => {
            const f = findCb(label);
            return !!(f && f.cb.checked === wasChecked);
          }, 2500);
          continue;
        }
        const opened = await waitFor(() => {
          m = findCb(label);
          return !!(m && m.rec && editableFieldsIn(m.rec).length > 0);
        }, 1800);
        if (opened && m && m.rec) {
          const body = editableFieldsIn(m.rec)
            .map((el) => (el.tagName === "TEXTAREA" ? el.value : el.textContent) || "")
            .join("\n")
            .trim();
          if (body) wordings[label] = body;
        }
        if (expandedRecord()) collapseOpen();
        await waitFor(() => allCheckboxes().length > 1, 1500);
        // Belt and suspenders: confirm the checkbox still holds its original
        // state after collapse; restore it if anything toggled it.
        const after = findCb(label);
        if (after && after.cb.checked !== wasChecked) {
          after.cb.click();
          await waitFor(() => {
            const f = findCb(label);
            return !!(f && f.cb.checked === wasChecked);
          }, 2500);
        }
        await sleep(120);
      } catch (e) {
        try { if (expandedRecord()) collapseOpen(); } catch (e2) {}
      }
    }
    return wordings;
  }

  // Read the tabs at the CURRENT navigation position into tab records.
  // Captures stored wording on the Defects tab when asked.
  async function readTabsHere(withWordings) {
    const tabs = [];
    for (const tab of TAB_NAMES) {
      if (!existsByText(tab)) continue; // not every page has all tabs
      if (!(await openTab(tab))) continue;
      const labels = await readCurrentTabLabels();
      const rec = { tab, checkboxes: labels };
      if (withWordings && tab === "Defects" && labels.length) {
        const w = await readDefectWordings(labels);
        if (Object.keys(w).length) rec.wordings = w;
      }
      tabs.push(rec);
    }
    return tabs;
  }

  // Fingerprint of a tabs read — two DIFFERENT pages returning identical
  // non-empty reads means the page never actually changed under us (the stale
  // read that corrupted a previous scan). Flagged, so bad data never merges.
  function tabsFingerprint(tabs) {
    return tabs.map((t) => t.tab + ":" + t.checkboxes.join("|")).join("§");
  }

  // Walk the entire report (every section -> its own page -> every item -> tab)
  // and record the exact checkbox wording found at each stop.
  async function scanAll(log) {
    const started = Date.now();
    const result = { version: VERSION, url: location.href, generatedAt: new Date().toISOString(), sections: [] };
    let itemsFound = 0;
    let itemsMissing = 0;
    let boxes = 0;
    const missingList = [];
    let prevFp = null;

    for (let s = 0; s < REPORT_MAP.length; s++) {
      const [section, items] = REPORT_MAP[s];
      const sectionRec = { section, items: [] };
      result.sections.push(sectionRec);
      log(`Scanning ${s + 1}/${REPORT_MAP.length}: ${section}…`);
      const gotSection = await selectSection(section);
      if (!gotSection) {
        sectionRec.found = false;
        missingList.push(`Section not found: ${section} — visible: ${visibleNavTexts().join(", ")}`);
        continue;
      }
      sectionRec.found = true;

      // The section's OWN Information/Limitations page — where Inspection
      // Method, Roof Type/Style, water source etc. live. Read before opening
      // any item, recorded under the "(Section)" pseudo-item.
      {
        const tabs = await readTabsHere(true);
        const withBoxes = tabs.filter((t) => t.checkboxes.length);
        if (withBoxes.length) {
          const fp = tabsFingerprint(tabs);
          const rec = { item: SECTION_ITEM, tabs, found: true };
          if (prevFp && fp === prevFp) rec.suspect = "identical to previous read — possible stale page";
          prevFp = fp;
          sectionRec.items.push(rec);
          const n = withBoxes.reduce((a, t) => a + t.checkboxes.length, 0);
          boxes += n;
          log(`   ${section} › ${SECTION_ITEM}: ${n} boxes${rec.suspect ? " (SUSPECT)" : ""}`);
        }
      }

      for (const item of items) {
        const itemRec = { item, tabs: [] };
        sectionRec.items.push(itemRec);
        if (!(await selectItem(item))) {
          itemRec.found = false;
          itemsMissing++;
          missingList.push(`Item not found: ${section} › ${item} — visible: ${visibleNavTexts().join(", ")}`);
          continue;
        }
        itemRec.found = true;
        itemsFound++;

        const tabs = await readTabsHere(true);
        const fp = tabsFingerprint(tabs);
        if (prevFp && fp === prevFp && tabs.some((t) => t.checkboxes.length)) {
          itemRec.suspect = "identical to previous read — possible stale page";
        }
        prevFp = fp;
        for (const rec of tabs) {
          itemRec.tabs.push(rec);
          boxes += rec.checkboxes.length;
          log(
            `   ${section} › ${item} › ${rec.tab}: ${rec.checkboxes.length} boxes` +
              (rec.wordings ? ` (${Object.keys(rec.wordings).length} wordings)` : "") +
              (itemRec.suspect ? " (SUSPECT)" : "")
          );
        }
      }
    }

    result.summary = {
      sections: result.sections.length,
      itemsFound,
      itemsMissing,
      checkboxes: boxes,
      elapsedSeconds: Math.round((Date.now() - started) / 1000),
      missing: missingList,
    };

    downloadText("spectora-checkboxes.json", JSON.stringify(result, null, 2), "application/json");
    log(
      `Done. ${boxes} checkboxes across ${itemsFound} items (${result.sections.length} sections) ` +
        `in ${result.summary.elapsedSeconds}s.\n` +
        `Downloaded: spectora-checkboxes.json — send me that file.` +
        (missingList.length ? `\n\n${itemsMissing} items not found (see file):\n- ${missingList.slice(0, 8).join("\n- ")}${missingList.length > 8 ? "\n- …" : ""}` : "")
    );
    return result;
  }

  // ---- placing 2026 write-ups (text) into the report ---------------------

  // Set a value on a React/Vue-controlled field so the framework notices it.
  function setFieldValue(el, text) {
    if (!el) return false;
    try { el.focus(); } catch (e) {}
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto =
        el.tagName === "TEXTAREA"
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, text);
      else el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } else {
      return false;
    }
    try { el.dispatchEvent(new Event("blur", { bubbles: true })); } catch (e) {}
    return true;
  }

  // A real editable field (not one of Spectora's search boxes).
  function isSearchField(el) {
    const c = ((el.className || "") + " " + (el.getAttribute("placeholder") || "")).toString();
    return /search/i.test(c);
  }
  function editableFieldsIn(scope) {
    return [...scope.querySelectorAll('textarea, [contenteditable="true"]')].filter(
      (el) => !isSearchField(el)
    );
  }
  function titleFieldIn(scope) {
    return (
      [...scope.querySelectorAll('input[type="text"], input:not([type])')].find(
        (el) => !isSearchField(el)
      ) || null
    );
  }

  // Clicking "Add" opens a MODAL — "Add a new Comment" — containing a Name
  // input, a rich-text body editor ("Enter text here") and Cancel/Save. The
  // modal lives outside the comment card, so everything below is scoped to it.
  function findAddCommentModal() {
    const heading = [...document.querySelectorAll("div,span,h1,h2,h3,h4,label")].find(
      (el) => el.children.length === 0 && /add a new comment/i.test(trimText(el))
    );
    if (!heading) return null;
    // Walk up to the container that also holds the editor / Save control.
    let node = heading.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      const hasField = node.querySelector('input, textarea, [contenteditable="true"]');
      const hasSave = [...node.querySelectorAll('button,[role="button"],span,a')].some(
        (b) => b.children.length === 0 && /^(save|cancel)$/i.test(trimText(b))
      );
      if (hasField && hasSave) return node;
      node = node.parentElement;
    }
    return heading.closest('[role="dialog"], .modal, .v-dialog') || null;
  }

  // Type into a rich-text editor. execCommand drives the editor's own model
  // (Quill/TipTap/ProseMirror style), which a bare textContent assignment does not.
  function setRichText(el, text) {
    if (!el) return false;
    try {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      if (document.execCommand("insertText", false, text)) {
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        return true;
      }
    } catch (e) {}
    // Fallback: paragraph-per-line so line breaks survive.
    try {
      el.innerHTML = text
        .split("\n")
        .map((line) => "<p>" + line.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])) + "</p>")
        .join("");
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    } catch (e) {}
    return false;
  }

  // The dialog's "Category" field is the rating: a row of THREE icon-only
  // buttons — wrench = Maintenance Item, minus = Recommendation (orange, the
  // default), warning triangle = Safety Hazard/Major Defects. The names exist
  // only as hover tooltips, so we select by aria/title when present and by
  // POSITION otherwise. If nothing is found the comment still saves at the
  // default — never a reason to fail the whole placement.
  const SEVERITY_INDEX = { maintenance: 0, recommendation: 1, safety: 2 };
  // ALL candidate three-cell Category rows, best first. Expanded cards carry
  // extra 3-child rows (editor toolbar groups), so the caller tries each row
  // with tint verification instead of trusting the first.
  function severityCellRows(modal) {
    const catLabel = [...modal.querySelectorAll("label,div,span,p")].find(
      (el) => el.children.length === 0 && /^category$/i.test(trimText(el))
    );
    const rows = [...modal.querySelectorAll("div")].filter((d) => {
      if (d.children.length !== 3) return false;
      const kids = [...d.children];
      return kids.every(
        (c) =>
          c.querySelector('svg,i,img,[class*="icon"]') ||
          (c.children.length === 0 && !trimText(c))
      );
    });
    if (!catLabel) return rows;
    const following = rows.filter(
      (r) => catLabel.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING
    );
    const rest = rows.filter((r) => !following.includes(r));
    return [...following, ...rest];
  }
  // The selected segment is tinted (orange); unselected cells are white or
  // transparent. That's our only readable signal of which rating is active.
  function cellSelected(cell) {
    const els = [cell, ...cell.querySelectorAll("*")];
    return els.some((el) => {
      const bg = getComputedStyle(el).backgroundColor || "";
      return bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgb(255, 255, 255)" && !/^rgba\(255, 255, 255/.test(bg);
    });
  }
  async function pickSeverity(modal, severity) {
    const idx = SEVERITY_INDEX[severity];
    if (idx == null || severity === "recommendation") return false;

    // 1) A cell that names its rating via aria-label/title.
    const want =
      severity === "safety" ? /safety\s*hazard|major\s*defect/i : /maintenance/i;
    const labeled = [...modal.querySelectorAll("[aria-label],[title]")].find((el) =>
      want.test(el.getAttribute("aria-label") || el.getAttribute("title") || "")
    );
    if (labeled) {
      clickOnce(labeled);
      await sleep(300);
      return true;
    }

    // 2) The three-cell Category row, by position — and VERIFY the highlight
    // moved; a click Spectora ignored must not be reported as success. Every
    // candidate row is tried (expanded cards carry toolbar rows that look
    // similar), escalating through targets and click strengths per row.
    const rows = severityCellRows(modal);
    for (const rowEl of rows.slice(0, 4)) {
      const cells = [...rowEl.children];
      if (!cells[idx]) continue;
      const cell = cells[idx];
      const inner = cell.querySelector('button,[role="button"],svg,i') || cell;
      const attempts = [
        () => clickOnce(inner),
        () => clickOnce(cell),
        () => fireClick(inner),
        () => fireClick(cell),
      ];
      for (const attempt of attempts) {
        try {
          if (cell.scrollIntoView) cell.scrollIntoView({ block: "center" });
        } catch (e) {}
        attempt();
        await sleep(400);
        if (cellSelected(cell)) return true;
      }
    }
    return false;
  }

  // Set the comment's "Recommendation" dropdown to the named professional.
  // Trever's rule: pick the REAL professional from the list; only fall back to
  // the generic "Qualified Professional" entry when the list has no match.
  //
  // The 46 Club View run (08/15) failed this on all 83 comments with the old
  // label->input->overlay-diff approach, so the control is NOT a plain input
  // next to a leaf "Recommendation" label. This version locates the control by
  // the one thing that cannot vary — the options themselves ("Qualified
  // Professional" / "No Recommendation" exist in every build of the list) —
  // and reports WHY it failed, since the field log is the only debugger
  // available once this runs on a live report.
  function proFieldInventory(modal) {
    try {
      const sels = [...modal.querySelectorAll("select")].map((s) =>
        [...s.options].slice(0, 3).map((o) => trimText(o)).join("/").slice(0, 60)
      );
      const labels = [...modal.querySelectorAll("label,div,span")]
        .filter((el) => el.children.length === 0)
        .map((el) => trimText(el))
        .filter((t) => t.length > 1 && t.length < 26)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 14);
      return (
        `selects: ${sels.length ? sels.join(" ; ") : "none"} — labels: ` +
        (labels.join(" | ") || "none")
      );
    } catch (e) {
      return "?";
    }
  }

  async function setProDropdown(modal, pro) {
    if (!pro) return { ok: false, why: "" };
    const fail = (why) => {
      // The full field inventory rides along on the FIRST failure only —
      // one copy is a diagnosis, eighty copies is noise.
      if (!setProDropdown._dumped) {
        setProDropdown._dumped = true;
        why += " — dialog fields: " + proFieldInventory(modal);
      }
      return { ok: false, why };
    };
    const matchIn = (list, getText, name) => {
      const t = norm(name);
      return (
        list.find((el) => norm(getText(el)) === t) ||
        list.find((el) => norm(getText(el)).startsWith(t)) ||
        (t.length > 6 && list.find((el) => norm(getText(el)).includes(t))) ||
        null
      );
    };
    const bestIn = (list, getText) =>
      matchIn(list, getText, pro) ||
      matchIn(list, getText, "Qualified Professional") ||
      matchIn(list, getText, "No Recommendation");
    try {
      // Give a lazily-rendered field a moment to exist before deciding it doesn't.
      await waitFor(
        () =>
          !!modal.querySelector("select") ||
          [...modal.querySelectorAll("li,option,div,span")].some((el) =>
            /^(qualified professional|no recommendation)$/i.test(trimText(el))
          ),
        2000
      );

      // --- Strategy 1: a real <select> fingerprinted by its own options. ----
      const proSelect = [...modal.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) =>
          /^(qualified professional|no recommendation)$/i.test(trimText(o))
        )
      );
      if (proSelect) {
        const opt = bestIn([...proSelect.options], (o) => o.textContent);
        if (!opt) return fail("professionals <select> found but no matching option");
        const desc = Object.getOwnPropertyDescriptor(
          window.HTMLSelectElement.prototype,
          "value"
        );
        if (desc && desc.set) desc.set.call(proSelect, opt.value);
        else proSelect.value = opt.value;
        proSelect.dispatchEvent(new Event("input", { bubbles: true }));
        proSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(250);
        // Materialize-style widgets hide the select behind a display input —
        // drive the visible list too so what's on screen matches what saves.
        if (proSelect.offsetParent === null) {
          const wrap = proSelect.closest(".select-wrapper") || proSelect.parentElement;
          const face =
            wrap &&
            [...wrap.querySelectorAll("input")].find((el) => el.offsetParent !== null);
          if (face) {
            clickOnce(face);
            await sleep(400);
            const li = bestIn(
              [...(wrap.querySelectorAll("ul li") || [])].filter(
                (el) => el.offsetParent !== null
              ),
              (el) => el.textContent
            );
            if (li) clickOnce(li);
            else clickOnce(face); // close again; the select value is already set
            await sleep(250);
          }
        }
        if (proSelect.value !== opt.value)
          return fail("professionals <select> refused the value");
        return { ok: true };
      }

      // --- Strategy 2: a pre-rendered option list (custom dropdown widget). -
      // Find the "Qualified Professional"/"No Recommendation" entry anywhere in
      // the dialog, visible or not, and work outward to its trigger.
      const marker = [...modal.querySelectorAll("li,div,span")].find(
        (el) =>
          el.children.length === 0 &&
          /^(qualified professional|no recommendation)$/i.test(trimText(el))
      );
      if (marker) {
        const listBox =
          marker.closest('ul,[role="listbox"],[class*="dropdown"],[class*="menu"]') ||
          marker.parentElement;
        const wrap = listBox.parentElement || modal;
        const trigger =
          [...wrap.querySelectorAll('input,button,[role="combobox"],[role="button"]')].find(
            (el) => !listBox.contains(el) && el.offsetParent !== null
          ) ||
          (listBox.previousElementSibling &&
          listBox.previousElementSibling.offsetParent !== null
            ? listBox.previousElementSibling
            : null);
        const optionsIn = () =>
          [...listBox.querySelectorAll("li,div,span")].filter(
            (el) => el.children.length === 0 && trimText(el).length > 1
          );
        let opt = null;
        if (trigger) {
          clickOnce(trigger);
          await sleep(400);
          opt = bestIn(
            optionsIn().filter((el) => el.offsetParent !== null),
            (el) => el.textContent
          );
        }
        // No trigger, or options never became visible: click the entry anyway —
        // many widgets register handlers on hidden list items.
        if (!opt) opt = bestIn(optionsIn(), (el) => el.textContent);
        if (!opt) return fail("professionals list found but no matching entry");
        clickOnce(opt);
        await sleep(300);
        return { ok: true };
      }

      // --- Strategy 3: 'Recommendation' label -> nearby control -> overlay. --
      // BOTH the Category chip and the dropdown label can read "Recommendation",
      // so every candidate label is tried, LAST in document order first (the
      // dropdown sits below the Category row in Spectora's dialogs).
      const labels = [...modal.querySelectorAll("label,div,span")].filter(
        (el) => el.children.length <= 1 && /^recommendation$/i.test(trimText(el))
      );
      if (!labels.length)
        return fail("dialog has no professionals list and no 'Recommendation' label");

      const visibleBefore = new Set(
        [...document.querySelectorAll("li,div,span")]
          .filter((el) => el.children.length === 0 && el.offsetParent !== null)
          .map((el) => norm(el.textContent))
      );
      const overlayOpts = () =>
        [...document.querySelectorAll("li,div,span")].filter(
          (el) =>
            el.children.length === 0 &&
            el.offsetParent !== null &&
            trimText(el).length > 2 &&
            trimText(el).length < 60 &&
            !visibleBefore.has(norm(el.textContent))
        );
      const waitForOpts = async (ms) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          const found = bestIn(overlayOpts(), (el) => el.textContent);
          if (found) return found;
          await sleep(250);
        }
        return null;
      };

      let sawControl = false;
      for (const label of labels.reverse()) {
        let input = null;
        let scope = label.parentElement;
        for (let i = 0; i < 5 && scope && !input; i++) {
          input = [...scope.querySelectorAll(
            'input,button,[role="combobox"],[class*="select"],[class*="dropdown"]'
          )].find(
            (el) =>
              !isSearchField(el) &&
              el.offsetParent !== null &&
              !(label.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
          ) || null;
          scope = scope.parentElement;
        }
        if (!input) continue;
        sawControl = true;
        try {
          if (input.scrollIntoView) input.scrollIntoView({ block: "center" });
        } catch (e) {}
        clickOnce(input);
        let opt = await waitForOpts(1400);
        if (!opt && input.tagName === "INPUT") {
          // A combobox may want typing or a keypress to open.
          try { input.focus(); } catch (e) {}
          input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", keyCode: 40, bubbles: true })
          );
          opt = await waitForOpts(800);
          if (!opt) {
            setFieldValue(input, pro);
            opt = await waitForOpts(900);
          }
        }
        if (opt) {
          clickOnce(opt);
          await sleep(350);
          return { ok: true };
        }
      }
      return fail(
        sawControl
          ? "clicked the Recommendation control(s) but no options appeared"
          : "'Recommendation' label found but no control near it"
      );
    } catch (e) {
      return { ok: false, why: "error: " + (e && e.message ? e.message : e) };
    }
  }

  async function addCustomComment(heading, body, severity, pro) {
    await closeAnyDialog();
    if (!clickByTextOnce("Add") && !clickByTextOnce("+ Add")) {
      return { ok: false, reason: "'Add' control not found" };
    }

    let modal = (await waitFor(() => !!findAddCommentModal(), 6000))
      ? findAddCommentModal()
      : null;
    if (!modal) {
      // A stray overlay may have eaten the click — clear it and try once more,
      // scrolled into view, and with the stronger double-activation click as
      // the final resort (a duplicate dialog open is harmless; we only fill
      // and save one).
      await closeAnyDialog();
      await sleep(800);
      const addLeaf = deepestByText((t) => /^\+?\s*add$/i.test(t));
      try {
        if (addLeaf && addLeaf.scrollIntoView) addLeaf.scrollIntoView({ block: "center" });
      } catch (e) {}
      await sleep(200);
      clickByTextOnce("Add") || clickByTextOnce("+ Add");
      modal = (await waitFor(() => !!findAddCommentModal(), 5000))
        ? findAddCommentModal()
        : null;
      if (!modal) {
        clickByText("Add") || clickByText("+ Add");
        modal = (await waitFor(() => !!findAddCommentModal(), 5000))
          ? findAddCommentModal()
          : null;
      }
    }
    if (!modal) return { ok: false, reason: "'Add a new Comment' dialog did not open" };
    // Spectora uses Froala; its contenteditable surface (.fr-element) is created
    // a moment AFTER the dialog appears. Writing before it exists lands in the
    // hidden original textarea, which Froala then overwrites with an empty body.
    await waitFor(
      () => !!modal.querySelector('.fr-element[contenteditable="true"], [contenteditable="true"]'),
      5000
    );
    await sleep(500);

    // Name field: the modal's text input (skip search boxes).
    const nameEl =
      [...modal.querySelectorAll('input[type="text"], input:not([type])')].find(
        (el) => !isSearchField(el) && el.offsetParent !== null
      ) || null;
    // Body: the rich-text editor (contenteditable) or a textarea.
    const bodyEl =
      modal.querySelector('.fr-element[contenteditable="true"]') ||
      [...modal.querySelectorAll('[contenteditable="true"], textarea')].find(
        (el) => !isSearchField(el) && el.offsetParent !== null
      ) ||
      null;

    if (!nameEl && !bodyEl) {
      return { ok: false, reason: "dialog opened but no Name/body field was found" };
    }

    const titleFilled = nameEl ? setFieldValue(nameEl, heading) : false;
    const text = titleFilled || !heading ? body : heading + "\n\n" + body;
    let bodyFilled = false;
    if (bodyEl) {
      bodyFilled = bodyEl.isContentEditable
        ? setRichText(bodyEl, text)
        : setFieldValue(bodyEl, text);
    }

    let severitySet = false;
    if (severity && severity !== "recommendation") {
      severitySet = await pickSeverity(modal, severity);
      await sleep(250);
    }

    let proSet = false;
    let proWhy = "";
    if (pro) {
      const pr = await setProDropdown(modal, pro);
      proSet = !!(pr && pr.ok);
      proWhy = (pr && pr.why) || "";
      await sleep(200);
    }

    // Save (inside the modal only — never hit the page's other buttons).
    await sleep(250);
    const saveBtn = [...modal.querySelectorAll('button,[role="button"],span,a,div')].find(
      (b) => b.children.length === 0 && /^save$/i.test(trimText(b)) && b.offsetParent !== null
    );
    if (!saveBtn) {
      return { ok: false, reason: "filled the dialog but no Save button was found", titleFilled, bodyFilled };
    }
    clickOnce(saveBtn);
    let closed = await waitFor(() => !findAddCommentModal(), 3000);
    // Retry once only if the dialog is verifiably still open — a duplicate
    // submit is impossible then, and a swallowed first click gets a second try.
    if (!closed && findAddCommentModal()) {
      clickOnce(saveBtn);
      closed = await waitFor(() => !findAddCommentModal(), 4000);
    }
    await sleep(400);
    if (collapseOpen()) await sleep(200);

    // Trust but verify: the saved comment's title should now exist somewhere
    // in the current item's comment list. A save that "succeeded" into the
    // wrong place (or into nothing) is exactly the failure that's invisible in
    // the final report until too late.
    let verified = true;
    if (closed && heading) {
      const frag = heading.toLowerCase().slice(0, 40);
      verified = await waitFor(
        () =>
          [...document.querySelectorAll("div,span,p,td,h1,h2,h3")].some(
            (el) => el.children.length === 0 && trimText(el).toLowerCase().includes(frag)
          ),
        3000
      );
    }

    return {
      ok: (titleFilled || bodyFilled) && closed,
      titleFilled,
      bodyFilled,
      saved: closed,
      verified,
      severitySet,
      proSet,
      proWhy,
      reason: closed ? "" : "clicked Save but the dialog stayed open",
    };
  }

  // Find and click a Save/Add/Done/Create control near the editor we just filled
  // (searching the card first, then the page).
  function clickSaveNear(el) {
    const isSave = (t) => /^(save|save comment|add comment|add|done|create|apply|ok)$/i.test(t);
    const scopes = [];
    if (el) {
      const card = el.closest(".comment.record") || el.closest("form") || el.parentElement;
      if (card) scopes.push(card);
    }
    scopes.push(document);
    for (const scope of scopes) {
      const btn = [...scope.querySelectorAll('button,[role="button"],span,a,div')].find(
        (b) => b.children.length === 0 && isSave(trimText(b)) && b.offsetParent !== null
      );
      if (btn) {
        fireClick(btn);
        const clickable = btn.closest('button,[role="button"],a');
        if (clickable && clickable !== btn) fireClick(clickable);
        return trimText(btn);
      }
    }
    return null;
  }

  // ---- optional items ------------------------------------------------------
  // Items like "Structural General", "Plumbing General" or "Range/Oven/Cooktop"
  // often aren't in a report until added: the section's "+ ITEM" opens a New
  // Item dialog whose "ADD AN OPTIONAL ITEM" list carries the template's
  // optional items. The inspector adds these by hand when he needs them — do
  // the same before falling back to a different item.

  // The innermost visible element whose text satisfies `pred` (a container
  // matching the same text as its child is skipped).
  function deepestByText(pred) {
    const all = [...document.querySelectorAll("button,[role='button'],a,span,div,h1,h2,h3,label,li,p")].filter(
      (el) =>
        el.offsetParent !== null &&
        pred(trimText(el)) &&
        ![...el.children].some((c) => pred(trimText(c)))
    );
    return all[0] || null;
  }

  // Any modal we know of still on screen? A half-closed "New Item" dialog
  // blocks every later click (the exact cascade that cost three write-ups in
  // one run), so flows close strays before and after doing their work.
  function dialogOpen() {
    return !!deepestByText((t) => /^(add a new comment|new item)$/i.test(t));
  }
  async function closeAnyDialog() {
    if (!dialogOpen()) return;
    const cancel = deepestByText((t) => /^cancel$/i.test(t));
    if (cancel) clickOnce(cancel);
    for (const target of [document, document.body]) {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
      );
    }
    await sleep(500);
  }

  async function addOptionalItem(itemName) {
    await closeAnyDialog();
    const plus = deepestByText((t) => /^\+?\s*item$/i.test(t));
    if (!plus) return false;
    clickOnce(plus);
    const isDlg = (t) => /^add an optional item$/i.test(t);
    if (!(await waitFor(() => !!deepestByText(isDlg), 5000))) return false;
    const wanted = (t) => norm(t) === norm(itemName);
    // The optional list may start collapsed — clicking its header expands it.
    let entry = deepestByText(wanted);
    if (!entry) {
      clickOnce(deepestByText(isDlg));
      await sleep(500);
      entry = deepestByText(wanted);
    }
    if (!entry) {
      const cancel = deepestByText((t) => /^cancel$/i.test(t));
      if (cancel) clickOnce(cancel);
      await sleep(300);
      return false;
    }
    // Tick the row's checkbox (or the label itself when no input is nearby).
    let box = null;
    let node = entry;
    for (let i = 0; i < 4 && node && !box; i++) {
      box = node.querySelector ? node.querySelector('input[type="checkbox"]') : null;
      node = node.parentElement;
    }
    clickOnce(box || entry);
    await sleep(300);
    const addBtn = deepestByText((t) => /^add optional items?$/i.test(t));
    if (!addBtn) return false;
    clickOnce(addBtn);
    await waitFor(() => !dialogOpen(), 6000);
    await closeAnyDialog(); // a stuck dialog here poisons every later step
    await sleep(800); // let the item list refresh
    return true;
  }

  // Debug: click "Add" and report exactly what appears, so we can target the
  // real comment editor instead of guessing.
  async function debugClickAdd() {
    const snap = () => ({
      cards: document.querySelectorAll(".comment.record").length,
      textareas: document.querySelectorAll("textarea").length,
      editables: document.querySelectorAll('[contenteditable="true"]').length,
      dialogs: document.querySelectorAll('[role="dialog"],.modal,.v-dialog').length,
    });
    const before = snap();
    const clicked = clickByText("Add") || clickByText("+ Add");
    await sleep(1500);
    const after = snap();
    const buttons = [...document.querySelectorAll('button,[role="button"],span,a')]
      .filter((b) => b.children.length === 0 && b.offsetParent !== null)
      .map((b) => trimText(b))
      .filter((t) => t && t.length <= 24)
      .slice(0, 40);
    const fields = [...document.querySelectorAll('textarea,[contenteditable="true"],input[type="text"]')]
      .filter((f) => f.offsetParent !== null)
      .map((f) => ({
        tag: f.tagName,
        placeholder: f.getAttribute("placeholder") || "",
        cls: (f.className || "").toString().slice(0, 60),
        value: (f.value || f.textContent || "").slice(0, 30),
      }));
    // Everything that could be the Recommendation dropdown — this dump is how
    // the professional-picker gets tuned against Spectora's real dialog.
    const selects = [...document.querySelectorAll("select")].map((s) => ({
      options: [...s.options].slice(0, 6).map((o) => trimText(o)),
      total: s.options.length,
      visible: s.offsetParent !== null,
      cls: (s.className || "").toString().slice(0, 40),
    }));
    const proMarkers = [...document.querySelectorAll("li,div,span,option")]
      .filter((el) => /^(qualified professional|no recommendation|recommendation)$/i.test(trimText(el)))
      .slice(0, 10)
      .map((el) => ({
        tag: el.tagName,
        text: trimText(el),
        kids: el.children.length,
        visible: el.offsetParent !== null,
        parent: el.parentElement
          ? el.parentElement.tagName + "." + (el.parentElement.className || "").toString().slice(0, 40)
          : "",
      }));
    return { clickedAdd: clicked, before, after, visibleButtons: buttons, visibleFields: fields, selects, proMarkers };
  }

  // Payload format the app copies (multi-line safe):
  //   @@SECTION: Roof
  //   @@ITEM: Coverings
  //   @@HEADING: ROOF, CHIMNEY, AND DRAINAGE SYSTEMS
  //   @@BODY
  //   ...body lines...
  //   @@END
  function parseWriteups(text) {
    const blocks = [];
    let cur = null;
    let inBody = false;
    for (const raw of text.split("\n")) {
      const t = raw.trim();
      if (t.startsWith("@@SECTION:")) {
        if (cur) blocks.push(cur);
        // Tolerate a combined "Section › Item" (or "Section > Item") value:
        // the part before the separator is the section, the rest is the item.
        const secParts = t.slice(10).trim().split(/\s*[›>|]\s*/);
        cur = {
          section: (secParts[0] || "").trim(),
          item: secParts.slice(1).join(" ").trim(),
          heading: "",
          body: "",
          severity: "",
          pro: "",
          box: "",
        };
        inBody = false;
        continue;
      }
      if (!cur) continue;
      if (t.startsWith("@@ITEM:")) {
        const v = t.slice(7).trim();
        if (v) cur.item = v; // an empty @@ITEM must not erase a split-off item
        continue;
      }
      if (t.startsWith("@@HEADING:")) { cur.heading = t.slice(10).trim(); continue; }
      if (t.startsWith("@@SEVERITY:")) {
        cur.severity = t.slice(11).trim().toLowerCase();
        continue;
      }
      if (t.startsWith("@@PRO:")) { cur.pro = t.slice(6).trim(); continue; }
      if (t.startsWith("@@BOX:")) { cur.box = t.slice(6).trim(); continue; }
      if (t === "@@BODY") { inBody = true; continue; }
      if (t === "@@END") { inBody = false; continue; }
      if (inBody) cur.body += (cur.body ? "\n" : "") + raw;
    }
    if (cur) blocks.push(cur);
    return blocks
      .map((b) => ({ ...b, body: b.body.trim() }))
      .filter((b) => b.section && (b.heading || b.body));
  }

  // A write-up must never be dropped just because its named item can't be
  // opened. Fall back through the section's other items — the "… General"
  // item first (that's where consolidated write-ups live), then the rest in
  // template order — and say in the log where it actually went so it can be
  // moved inside Spectora if needed.
  async function selectItemWithFallback(section, item, log, resCache) {
    if (!item) return { ok: true, item: "" };
    // Resolved this section›item before? Go straight there — re-probing a
    // missing item re-opens the New Item dialog every time, which is what
    // destabilised runs with several write-ups aimed at the same item.
    const cacheKey = norm(section) + "||" + norm(item);
    if (resCache && resCache.has(cacheKey)) {
      const known = resCache.get(cacheKey);
      if (known && (await selectItem(known))) {
        return { ok: true, item: known };
      }
      // A cached answer that stopped working falls through to full resolution.
    }
    const remember = (resolved) => {
      if (resCache) resCache.set(cacheKey, resolved);
      return resolved
        ? { ok: true, item: resolved }
        : { ok: false, item: "" };
    };
    if (await selectItem(item)) return remember(item);
    // The item may be an OPTIONAL item of this section (that's how his
    // template ships "… General" items) — add it, then select it.
    if (await addOptionalItem(item)) {
      if (await selectItem(item)) {
        log(`  Added optional item "${item}" to ${section}.`);
        return remember(item);
      }
    }
    const entry = REPORT_MAP.find(([s]) => norm(s) === norm(section));
    const list = entry ? entry[1] : [];
    const ordered = [
      ...list.filter((it) => /\bgeneral\b/i.test(it)),
      ...list.filter((it) => !/\bgeneral\b/i.test(it)),
    ];
    for (const cand of ordered) {
      if (norm(cand) === norm(item)) continue;
      if (await selectItem(cand)) {
        log(`  Couldn't open "${item}" in ${section} — placed in "${cand}" instead (move it in Spectora if needed).`);
        return remember(cand);
      }
    }
    return remember("");
  }

  // One attempt at one block. Returns { ok, problem, warning }.
  async function placeOneWriteup(b, log, resCache) {
    if (!(await selectSection(b.section))) {
      return { ok: false, problem: "Section not found: " + b.section };
    }
    const sel = await selectItemWithFallback(b.section, b.item, log, resCache);
    if (!sel.ok) {
      return {
        ok: false,
        problem: `Item not found: ${b.item} (in ${b.section} — no other item there would open either)`,
      };
    }
    // The comment MUST land on the Defects tab whenever this item has one.
    // Adding while Information is active is how write-ups ended up on the
    // wrong tab with no rating (Roofing General / Walkways at 1004 Dennis
    // Ave) — better to fail the block and retry than to file it wrong.
    let tabOk = true;
    if (existsByText("Defects")) {
      tabOk = (await openTab("Defects")) || (await openTab("Defects"));
      if (!tabOk) {
        return {
          ok: false,
          problem: `${b.section} › ${sel.item || b.item || "?"}: the Defects tab would not open — refused to add the comment to the wrong tab`,
        };
      }
    }
    // The Add dialog has NO Recommendation dropdown (proven by screenshot,
    // 08/17) — the professional is set afterwards by the dropdown pass, so
    // no pro is attempted here.
    const r = await addCustomComment(b.heading, b.body, b.severity, "");
    if (!r.ok) {
      return {
        ok: false,
        problem: `${b.section} › ${sel.item || b.item || "?"}: ${r.reason || "couldn't fill the comment"}`,
      };
    }
    let warning = null;
    if (r.verified === false)
      warning = `${b.section} › ${sel.item || b.item || "?"}: saved, but "${b.heading}" is NOT visible in this item afterwards — it may have landed in the wrong place. Check it in Spectora.`;
    else if (b.severity && b.severity !== "recommendation" && !r.severitySet)
      warning = `${b.section} › ${sel.item || b.item || "?"}: couldn't set the ${b.severity} rating — it saved as the default Recommendation. Change the Category by hand.`;
    return { ok: true, warning };
  }

  // A box-backed write-up: tick the library box, then REPLACE its stored
  // wording with the fresh body, set the Category chip and the Recommendation
  // dropdown on the expanded card, and save — template language never
  // survives, and nothing is ever saved to the template ("Save to template"
  // style controls are explicitly excluded from every click).
  async function placeBoxComment(b, log, resCache) {
    const where = () => `${b.section} › ${b.item || "?"}`;
    if (!(await selectSection(b.section)))
      return { ok: false, problem: "Section not found: " + b.section };
    const sel = await selectItemWithFallback(b.section, b.item, log, resCache);
    if (!sel.ok)
      return { ok: false, problem: `Item not found: ${b.item} (in ${b.section})` };
    if (existsByText("Defects")) {
      const tabOk = (await openTab("Defects")) || (await openTab("Defects"));
      if (!tabOk)
        return {
          ok: false,
          problem: `${where()}: the Defects tab would not open — refused to work on the wrong tab`,
        };
    }
    await closeAnyDialog();

    let m = findCb(b.box);
    if (!m) await waitFor(() => !!(m = findCb(b.box)), 2500);
    if (!m) {
      log(`  Box "${b.box}" isn't on this item — adding as a custom comment instead.`);
      // Clear the box ON THE BLOCK so the verification sweep and the dropdown
      // pass track the custom comment's heading, not the absent box label.
      b.box = "";
      return placeOneWriteup(b, log, resCache);
    }
    if (!m.cb.checked) {
      m.cb.click();
      const ticked = await waitFor(() => {
        const f = findCb(b.box);
        return !!(f && f.cb.checked);
      }, 3500);
      if (!ticked)
        return { ok: false, problem: `${where()}: couldn't tick the "${b.box}" box` };
    }

    // Expand the card so its body editor, chips, and dropdown appear.
    m = findCb(b.box);
    const card =
      (m && m.rec) || (m && m.cb.closest('.card, [class*="comment"]')) || null;
    if (!card)
      return {
        ok: true,
        warning: `${where()}: ticked "${b.box}" but couldn't find its card — its TEMPLATE WORDING is still in the report; rewrite it by hand`,
      };
    if (!editableFieldsIn(card).length) {
      const header = card.querySelector(".card-header") || card.firstElementChild;
      if (header) {
        clickOnce(header);
        await sleep(600);
        // The header click must never UNTICK the box we just ticked.
        const f2 = findCb(b.box);
        if (f2 && !f2.cb.checked) {
          f2.cb.click();
          await sleep(400);
        }
      }
      await waitFor(() => editableFieldsIn(card).length > 0, 3000);
    }

    // Froala attaches a moment AFTER the card expands. Writing into the bare
    // textarea gets silently overwritten by the editor's stored content — the
    // 9608 Tiberias test run "replaced" every box wording and the PDF still
    // showed template text. Wait for the real editor surface, write, and READ
    // IT BACK before claiming success.
    await waitFor(
      () =>
        !!card.querySelector('.fr-element[contenteditable="true"]') ||
        editableFieldsIn(card).some((el) => el.isContentEditable),
      5000
    );
    await sleep(400);
    const bodyEl =
      card.querySelector('.fr-element[contenteditable="true"]') ||
      editableFieldsIn(card).find((el) => el.isContentEditable) ||
      editableFieldsIn(card)[0] ||
      null;
    let worded = false;
    if (bodyEl) {
      const target = norm(b.body).slice(0, 25);
      for (let attempt = 0; attempt < 2 && !worded; attempt++) {
        if (bodyEl.isContentEditable) setRichText(bodyEl, b.body);
        else setFieldValue(bodyEl, b.body);
        await sleep(600);
        const now = norm(
          (bodyEl.isContentEditable ? bodyEl.textContent : bodyEl.value) || ""
        );
        worded = !!target && now.includes(target);
      }
      // Nudge the card's autosave: blur the editor.
      try {
        bodyEl.dispatchEvent(new Event("blur", { bubbles: true }));
        if (bodyEl.blur) bodyEl.blur();
      } catch (e) {}
      await sleep(400);
    }
    let severitySet = false;
    if (b.severity && b.severity !== "recommendation") {
      severitySet = await pickSeverity(card, b.severity);
    }
    let proSet = false;
    let proWhy = "";
    if (b.pro) {
      const pr = await setProDropdown(card, b.pro);
      proSet = !!(pr && pr.ok);
      proWhy = (pr && pr.why) || "";
    }

    // Save via the card's own save control — never anything mentioning
    // "template", and never delete controls.
    const saveBtn = [...card.querySelectorAll('button,[role="button"],i,svg,a,span,div')].find(
      (el) => {
        if (el.offsetParent === null) return false;
        const words =
          (el.getAttribute("aria-label") || "") +
          " " +
          (el.getAttribute("title") || "") +
          " " +
          trimText(el);
        if (/template|delete|remove|trash/i.test(words)) return false;
        return (
          /\bsave\b/i.test(
            (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "")
          ) ||
          (el.children.length === 0 && /^save$/i.test(trimText(el)))
        );
      }
    );
    if (saveBtn) clickOnce(saveBtn);
    await sleep(500);
    if (expandedRecord()) collapseOpen();
    await sleep(250);

    const warnings = [];
    if (!worded)
      warnings.push(
        `couldn't replace the wording of "${b.box}" — its TEMPLATE TEXT is still in the report; rewrite it by hand`
      );
    if (b.severity && b.severity !== "recommendation" && !severitySet)
      warnings.push(`couldn't set the ${b.severity} rating on "${b.box}" — set the Category by hand`);
    if (b.pro && !proSet)
      warnings.push(
        `couldn't set the Recommendation dropdown on "${b.box}" to "${b.pro}"` +
          (proWhy ? ` [${proWhy}]` : "")
      );
    // No save control on a card is NORMAL — cards autosave (confirmed on the
    // 9608 Tiberias run) — so it is not warned about.
    return {
      ok: true,
      warning: warnings.length ? `${where()}: ${warnings.join("; ")}` : null,
    };
  }

  async function placeWriteups(text, log) {
    const blocks = parseWriteups(text);
    if (!blocks.length) {
      log('No write-ups found. In the app, open Report entry → Trever 2026 → "Copy for extension", then paste that here.');
      return;
    }
    let done = 0;
    const problems = [];
    // Remember how each section›item resolved so later blocks skip dead ends —
    // repeatedly re-probing a missing item re-opens the New Item dialog, which
    // is exactly what destabilised consecutive placements into the same item.
    const resCache = new Map();
    const failed = [];
    const placeOne = (b) =>
      b.box ? placeBoxComment(b, log, resCache) : placeOneWriteup(b, log, resCache);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      log(`(${i + 1}/${blocks.length}) ${b.section} › ${b.item || "?"}${b.box ? ` [box: ${b.box}]` : ""}…`);
      const r = await placeOne(b);
      if (r.ok) {
        done++;
        if (r.warning) problems.push(r.warning);
      } else {
        failed.push({ b, problem: r.problem });
      }
      await sleep(400);
    }
    // A failed block gets a fresh second attempt automatically — nobody should
    // be re-placing write-ups by hand because a dialog was slow once.
    if (failed.length) {
      log(`Retrying ${failed.length} failed write-up(s)…`);
      await closeAnyDialog();
      await sleep(1200);
      for (const f of [...failed]) {
        log(`(retry) ${f.b.section} › ${f.b.item || "?"}…`);
        const r = await placeOne(f.b);
        if (r.ok) {
          done++;
          if (r.warning) problems.push(r.warning);
          failed.splice(failed.indexOf(f), 1);
        } else {
          f.problem = r.problem;
        }
        await sleep(600);
      }
    }
    for (const f of failed) problems.push(f.problem);
    log(
      `Placed ${done}/${blocks.length} write-ups.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : "")
    );

    // Final sweep: revisit every item and confirm each heading is really
    // there. Placement already verified each save, but this reads the finished
    // report one more time, after everything settled.
    if (done > 0) {
      log(`\nVerification sweep — confirming every write-up on the page…`);
      const v = await verifyWriteups(blocks, log, resCache);
      log(
        `Verified ${v.confirmed}/${v.total} write-ups` +
          (v.missing.length
            ? `\n\nNOT FOUND ON THE PAGE — check these in Spectora:\n- ${v.missing.join("\n- ")}`
            : " — every heading is in its item.")
      );
    }
    // Custom comments can't take a professional at Add time (the dialog has no
    // dropdown), so the dropdown pass runs automatically right after placing —
    // one button, whole report.
    const proCustoms = blocks.filter((b) => !b.box && b.pro);
    if (done > 0 && proCustoms.length) {
      log(`\nDropdown pass — setting the professional on ${proCustoms.length} custom write-up(s)…`);
      await runFixLoop(proCustoms, log, resCache);
    }
    log(`\nClick "Copy log" below and paste it into the chat.`);
  }

  // ---- fix-up sweep: set Recommendation dropdowns on ALREADY-PLACED
  // write-ups, in place, without re-adding anything. Built for the 46 Club
  // View run, where all 83 comments saved fine but every dropdown attempt
  // failed — re-placing would duplicate the report, so this edits instead.
  // Safety rules learned the hard way: only Edit/Save/Cancel are ever
  // clicked, every dialog is verified to be the RIGHT comment before any
  // change, and anything uncertain is cancelled untouched.
  function findCommentModalAny() {
    const byHeading = findAddCommentModal();
    if (byHeading) return byHeading;
    const dialogs = [
      ...document.querySelectorAll(
        '[role="dialog"],[role="alertdialog"],.modal,.v-dialog,[class*="modal"],[class*="dialog"]'
      ),
    ].filter((d) => d.offsetParent !== null);
    return (
      dialogs.find(
        (d) =>
          d.querySelector('input,textarea,[contenteditable="true"]') &&
          [...d.querySelectorAll('button,[role="button"],span,a')].some(
            (b) => b.children.length === 0 && /^(save|cancel)$/i.test(trimText(b))
          )
      ) || null
    );
  }

  async function cancelModal(modal) {
    const cancel = [...modal.querySelectorAll('button,[role="button"],span,a,div')].find(
      (el) => el.children.length === 0 && /^cancel$/i.test(trimText(el)) && el.offsetParent !== null
    );
    if (cancel) clickOnce(cancel);
    else
      for (const target of [document, document.body])
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        );
    await sleep(400);
  }

  // The edit control for a placed comment — "Edit this comment", an Edit
  // link, or a pencil labelled via aria/title. NEVER the card body itself
  // (clicking a card ticks checkboxes in this editor).
  function editControlIn(scope) {
    if (!scope) return null;
    return (
      [...scope.querySelectorAll('button,[role="button"],a,span,i,div')].find(
        (el) =>
          el.offsetParent !== null &&
          !/delete|remove|trash/i.test(
            trimText(el) + " " + (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "")
          ) &&
          (/^edit( this comment)?$/i.test(trimText(el)) ||
            /\bedit\b/i.test(el.getAttribute("aria-label") || el.getAttribute("title") || ""))
      ) || null
    );
  }

  // The 46 Club View fix-up run proved a card's pencil/Edit control opens a
  // RENAME dialog (fields: Cancel | RENAME) — the full "Edit Observation"
  // editor with the Recommendation dropdown opens some other way. These
  // helpers let the sweep recognise each dialog for what it is.
  function isRenameDialog(d) {
    if (!d) return false;
    return [...d.querySelectorAll('button,[role="button"],span,a,div')].some(
      (el) => el.children.length === 0 && /^rename$/i.test(trimText(el)) && el.offsetParent !== null
    );
  }

  // Wherever the professionals control lives right now — dialog, inline panel,
  // full-page editor — found by its own unmistakable options.
  function findProContainer() {
    const host = (el) =>
      el.closest(
        '[role="dialog"],[role="alertdialog"],.modal,.v-dialog,.comment.record,.card,form,[class*="modal"],[class*="dialog"]'
      ) || document.body;
    const sel = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => /^(qualified professional|no recommendation)$/i.test(trimText(o)))
    );
    if (sel) return host(sel);
    const marker = [...document.querySelectorAll("li,div,span")].find(
      (el) =>
        el.children.length === 0 &&
        /^(qualified professional|no recommendation)$/i.test(trimText(el))
    );
    if (marker) return host(marker);
    return null;
  }

  function cardControlInventory(card) {
    try {
      const seen = new Set();
      const out = [];
      for (const el of card.querySelectorAll('button,[role="button"],a,span,i,div,svg')) {
        if (el.offsetParent === null) continue;
        const t = trimText(el);
        const aria = (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "");
        const label = t && t.length <= 24 && el.children.length === 0 ? t : aria ? `[${aria.slice(0, 24)}]` : "";
        if (label && !seen.has(label)) {
          seen.add(label);
          out.push(label);
          if (out.length >= 14) break;
        }
      }
      return out.join(" | ") || "no labelled controls";
    } catch (e) {
      return "?";
    }
  }

  async function fixOneProDropdown(b, log, resCache) {
    const where = () => `${b.section} › ${b.item || "?"}`;
    if (!(await selectSection(b.section)))
      return { ok: false, problem: "Section not found: " + b.section };
    const sel = await selectItemWithFallback(b.section, b.item, log, resCache);
    if (!sel.ok) return { ok: false, problem: `Item not found: ${b.item} (in ${b.section})` };
    if (existsByText("Defects")) {
      (await openTab("Defects")) || (await openTab("Defects"));
    }
    await closeAnyDialog();

    // A box-backed comment's on-page title is the BOX label, not our heading.
    const frag = (b.box || b.heading || "").toLowerCase().slice(0, 40);
    if (!frag) return { ok: false, problem: `${where()}: block has no heading` };
    const findLeaf = () =>
      [...document.querySelectorAll("div,span,p,td,h1,h2,h3")].find(
        (el) =>
          el.children.length === 0 &&
          el.offsetParent !== null &&
          trimText(el).toLowerCase().includes(frag)
      ) || null;
    let leaf = findLeaf();
    if (!leaf) {
      // Placement may have fallen back to a DIFFERENT item than this pass
      // resolved (it happened between the Club View place and fix runs) —
      // check the section's other items for the heading before giving up.
      const entry = REPORT_MAP.find(([s]) => norm(s) === norm(b.section));
      for (const cand of entry ? entry[1] : []) {
        if (norm(cand) === norm(sel.item || b.item)) continue;
        if (!(await selectItem(cand))) continue;
        if (existsByText("Defects")) await openTab("Defects");
        await sleep(300);
        leaf = findLeaf();
        if (leaf) break;
      }
    }
    if (!leaf)
      return {
        ok: false,
        problem: `${where()}: "${b.heading}" was not found in this section — nothing to fix here`,
      };

    // The card: prefer Spectora's own record class; otherwise the nearest
    // ancestor that owns a card header.
    let card = leaf.closest(".comment.record") || leaf.closest(".card");
    if (!card) {
      let n = leaf.parentElement;
      for (let i = 0; i < 8 && n; i++) {
        if (n.querySelector && n.querySelector(".card-header")) {
          card = n;
          break;
        }
        n = n.parentElement;
      }
    }
    if (!card) card = leaf.closest('[class*="comment"]') || leaf.parentElement;

    // Open the FULL editor (the one with the Recommendation dropdown). The
    // card's "Edit" control opens a rename dialog instead, so several open
    // paths are tried, each one's outcome recorded for the log. Success = the
    // professionals control (or an editor showing a Recommendation label) is
    // on screen.
    const clickTextIn = (scope, re) => {
      const el = [...scope.querySelectorAll('button,[role="button"],a,span,div,li')].find(
        (n) => n.children.length === 0 && n.offsetParent !== null && re.test(trimText(n))
      );
      if (el) clickOnce(el);
      return !!el;
    };
    const dialogLabelPeek = (d) =>
      [...d.querySelectorAll("label,div,span,button")]
        .filter((el) => el.children.length === 0 && el.offsetParent !== null)
        .map((el) => trimText(el))
        .filter((t) => t.length > 1 && t.length < 22)
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 6)
        .join("|");
    const recLeafIn = (scope) =>
      [...scope.querySelectorAll("label,div,span")].some(
        (el) => el.children.length === 0 && /^recommendation$/i.test(trimText(el))
      );
    const outcomes = [];
    const assess = async (tag) => {
      await sleep(900);
      let c = findProContainer();
      if (c) return c;
      const dlg = findCommentModalAny();
      if (dlg) {
        if (isRenameDialog(dlg)) {
          outcomes.push(`${tag}:rename-cancelled`);
          await cancelModal(dlg);
          return null;
        }
        await sleep(700);
        c = findProContainer();
        if (c) return c;
        if (recLeafIn(dlg)) return dlg;
        outcomes.push(`${tag}:dialog(${dialogLabelPeek(dlg)})-cancelled`);
        await cancelModal(dlg);
        return null;
      }
      // An INLINE editor may have opened in the card itself.
      const rec = expandedRecord();
      if (rec && (recLeafIn(rec) || findProContainer())) return findProContainer() || rec;
      if (editableFieldsIn(card).length && recLeafIn(card)) return card;
      outcomes.push(`${tag}:nothing-opened`);
      return null;
    };

    const attempts = [
      // 1. EXPAND THE CARD — Tia's screenshot (08/17) shows the Category
      //    chips, body editor, and Recommendation dropdown live ON the
      //    expanded card; expanding IS opening the editor. The header click
      //    can tick the card's checkbox, so its state is verified and
      //    restored, same discipline as the wording scanner.
      [
        "expand-card",
        async () => {
          if (editableFieldsIn(card).length) return true; // already expanded
          const header = card.querySelector(".card-header") || card.firstElementChild;
          if (!header) return false;
          const cb = card.querySelector('input[type="checkbox"]');
          const was = cb ? cb.checked : null;
          clickOnce(header);
          await sleep(600);
          const cbNow = card.querySelector('input[type="checkbox"]');
          if (cbNow && cbNow.checked !== was) {
            cbNow.click();
            await waitFor(() => {
              const f = card.querySelector('input[type="checkbox"]');
              return !!f && f.checked === was;
            }, 2500);
            outcomes.push("expand:ticked-box-undone");
            return false;
          }
          return true;
        },
      ],
      // 2. An explicit "Edit this comment" control on the card.
      ["edit-this-comment", () => clickTextIn(card, /^edit this comment$/i)],
      // 3. A kebab/menu on the card, then an Edit entry in the menu.
      [
        "kebab-menu",
        async () => {
          const kebab = [...card.querySelectorAll('button,[role="button"],a,span,i,div')].find(
            (el) =>
              el.offsetParent !== null &&
              (/^(⋮|⋯|•••|\.\.\.)$/.test(trimText(el)) ||
                /more|options|menu/i.test(
                  (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "")
                ))
          );
          if (!kebab) return false;
          clickOnce(kebab);
          await sleep(400);
          return clickTextIn(document, /^edit( this comment| observation| comment)?$/i);
        },
      ],
      // 4. The bare "Edit" control (opens RENAME on these cards — the
      //    detector cancels it harmlessly, but on other layouts it may be
      //    the real editor).
      [
        "edit-control",
        () => {
          const ctl = editControlIn(card);
          if (ctl) clickOnce(ctl);
          return !!ctl;
        },
      ],
      // 5. The comment heading itself — ONLY when the card carries no
      //    checkbox anywhere (clicking a checkbox card ticks it).
      [
        "heading-click",
        () => {
          if (card.querySelector('input[type="checkbox"]')) return false;
          clickOnce(leaf);
          return true;
        },
      ],
    ];

    let container = null;
    for (const [tag, run] of attempts) {
      let clicked = false;
      try {
        clicked = await run();
      } catch (e) {}
      if (!clicked) continue;
      container = await assess(tag);
      if (container) break;
    }
    if (!container) {
      // The editor may be open with simply NO dropdown on it — items without
      // a Defects tab (HVAC General) don't offer one. That's a fact about the
      // item, not a failure to open anything.
      if (editableFieldsIn(card).length)
        return {
          ok: false,
          problem: `${where()}: "${b.heading}" has no Recommendation dropdown — this item doesn't offer one (the write-up already names the professional in its closing)`,
        };
      let problem = `${where()}: couldn't open the full editor for "${b.heading}" — ${outcomes.join("; ") || "no open path found"}`;
      if (!fixOneProDropdown._dumped) {
        fixOneProDropdown._dumped = true;
        problem += ` — card controls: ${cardControlInventory(card)}`;
      }
      return { ok: false, problem };
    }

    // The editor must be THIS comment — its name field or text must carry the
    // heading. A mismatched editor is cancelled untouched.
    const short = frag.slice(0, 25);
    const nameEl = [...container.querySelectorAll('input[type="text"], input:not([type]), textarea')].find(
      (el) => !isSearchField(el) && el.offsetParent !== null
    );
    const isOurs =
      (nameEl && (nameEl.value || "").toLowerCase().includes(short)) ||
      [...container.querySelectorAll("div,span,h1,h2,h3,textarea")].some(
        (el) =>
          el.children.length === 0 &&
          (trimText(el) + (el.value || "")).toLowerCase().includes(short)
      );
    if (!isOurs) {
      await cancelModal(container);
      return {
        ok: false,
        problem: `${where()}: an editor opened but it wasn't "${b.heading}" — cancelled without touching it`,
      };
    }

    const modal = container;
    const pr = await setProDropdown(modal, b.pro);
    if (!pr.ok) {
      await cancelModal(modal);
      return {
        ok: false,
        problem:
          `${where()}: couldn't set "${b.pro}"` +
          (pr.why ? ` [${pr.why}]` : "") +
          " — cancelled without saving",
      };
    }
    // Save. Two shapes: a dialog (text Save button, closes on save) or the
    // expanded card itself (a save ICON on the header, stays open — collapse
    // it afterwards). The card auto-saves selections in many builds, so a
    // missing save control is a note, not a failure.
    const isDialog =
      (modal.matches &&
        modal.matches(
          '[role="dialog"],[role="alertdialog"],.modal,.v-dialog,[class*="modal"],[class*="dialog"]'
        )) ||
      findCommentModalAny() === modal;
    const saveBtn = [...modal.querySelectorAll('button,[role="button"],span,a,div,i,svg')].find(
      (el) =>
        el.offsetParent !== null &&
        !/delete|remove|trash/i.test(
          (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "")
        ) &&
        ((el.children.length === 0 && /^(save|update|done|apply)$/i.test(trimText(el))) ||
          /\bsave\b/i.test(
            (el.getAttribute("aria-label") || "") + (el.getAttribute("title") || "")
          ))
    );
    if (!isDialog) {
      // Inline expanded card — cards autosave (confirmed on 9608 Tiberias),
      // so a missing save control is normal, not noteworthy.
      if (saveBtn) clickOnce(saveBtn);
      await sleep(600);
      if (expandedRecord()) collapseOpen();
      await sleep(300);
      return { ok: true };
    }
    if (!saveBtn) {
      for (const target of [document, document.body])
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        );
      await sleep(400);
      return {
        ok: true,
        note: `${where()}: dropdown picked but the editor had no Save button — it may auto-save; spot-check "${b.heading}" in Spectora`,
      };
    }
    clickOnce(saveBtn);
    let closed = await waitFor(() => !findCommentModalAny(), 4000);
    if (!closed) {
      clickOnce(saveBtn);
      closed = await waitFor(() => !findCommentModalAny(), 4000);
    }
    if (!closed)
      return {
        ok: false,
        problem: `${where()}: picked the dropdown and clicked ${trimText(saveBtn) || "Save"} but the editor stayed open — finish this one by hand`,
      };
    await sleep(300);
    return { ok: true };
  }

  async function runFixLoop(blocks, log, resCache) {
    let done = 0;
    const problems = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      log(`(${i + 1}/${blocks.length}) ${b.section} › ${b.item || "?"} — ${b.pro}…`);
      let r;
      try {
        r = await fixOneProDropdown(b, log, resCache);
      } catch (e) {
        r = { ok: false, problem: `${b.section} › ${b.item || "?"}: error — ${e && e.message ? e.message : e}` };
      }
      if (r.ok) {
        done++;
        if (r.note) problems.push(r.note);
      } else problems.push(r.problem);
      await sleep(300);
    }
    log(
      `\nSet ${done}/${blocks.length} Recommendation dropdowns.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : " All set — spot-check a few in Spectora.")
    );
    return { done, problems };
  }

  async function fixProDropdowns(text, log) {
    const blocks = parseWriteups(text).filter((b) => b.pro);
    if (!blocks.length) {
      log(
        "No write-ups with a professional found. Paste the same payload used to place the report (it carries each comment's professional)."
      );
      return;
    }
    log(
      `Setting the Recommendation dropdown on ${blocks.length} already-placed write-up(s) — nothing is re-added.\n`
    );
    const { problems } = await runFixLoop(blocks, log, new Map());
    const notFound = problems.filter((p) => /was not found in this section/.test(p)).length;
    if (notFound >= 3)
      log(
        `\n⚠ ${notFound} headings aren't on this report at all — the Step 2 box is probably holding a NEWER re-write than the one that was placed. Paste the payload that placed THIS report, then run Fix-up again.`
      );
    log(`\nClick "Copy log" below and paste it into the chat.`);
  }

  // ---- end-of-run verification sweep (write-ups) --------------------------
  async function verifyWriteups(blocks, log, resCache) {
    // Group by section+item so each place is visited once.
    const groups = new Map();
    for (const b of blocks) {
      const key = b.section + "||" + (b.item || "");
      if (!groups.has(key))
        groups.set(key, { section: b.section, item: b.item, headings: [] });
      // A box-backed comment's on-page title is the BOX label, not our heading.
      groups.get(key).headings.push(b.box || b.heading);
    }
    let confirmed = 0;
    let total = 0;
    const missing = [];
    const headingOnPage = (heading) => {
      const frag = (heading || "").toLowerCase().slice(0, 40);
      return [...document.querySelectorAll("div,span,p,td,h1,h2,h3")].some(
        (el) => el.children.length === 0 && trimText(el).toLowerCase().includes(frag)
      );
    };
    for (const g of groups.values()) {
      total += g.headings.length;
      if (!(await selectSection(g.section))) {
        g.headings.forEach((h) => missing.push(`${g.section}: "${h}" (couldn't reopen section)`));
        continue;
      }
      const sel = await selectItemWithFallback(g.section, g.item, log, resCache);
      if (!sel.ok) {
        g.headings.forEach((h) =>
          missing.push(`${g.section} › ${g.item}: "${h}" (couldn't reopen item)`)
        );
        continue;
      }
      await openTab("Defects");
      for (const h of g.headings) {
        const found = headingOnPage(h) || (await waitFor(() => headingOnPage(h), 2000));
        if (found) confirmed++;
        else missing.push(`${g.section} › ${sel.item || g.item}: "${h}"`);
      }
    }
    return { total, confirmed, missing };
  }

  // Debug: dump the clickable "Add"-type controls and the editable fields on the
  // current view, so we can target the right comment title/body reliably.
  function scanCommentTools() {
    const buttons = [...document.querySelectorAll('button,[role="button"],a,span,div')]
      .filter((el) => el.children.length === 0 && /^\+?\s*(add|comment|note|save)$/i.test(trimText(el)))
      .slice(0, 25)
      .map((el) => ({ tag: el.tagName, text: trimText(el).slice(0, 40) }));
    const fields = [...document.querySelectorAll('input,textarea,[contenteditable="true"]')]
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        type: el.getAttribute("type") || "",
        placeholder: el.getAttribute("placeholder") || "",
        editable: !!el.isContentEditable,
        cls: (el.className || "").toString().slice(0, 50),
      }));
    return { url: location.href, addButtons: buttons, fields };
  }

  // ---- panel UI -----------------------------------------------------------

  function mkLabel(t) {
    const d = document.createElement("div");
    d.textContent = t;
    d.style.fontWeight = "600";
    d.style.margin = "10px 0 6px";
    return d;
  }
  function mkBtn(label, bg, fg) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      background: bg, color: fg, border: "none", borderRadius: "8px",
      padding: "8px 12px", fontWeight: "600", cursor: "pointer",
    });
    return b;
  }
  function mkTextarea(value, h, placeholder) {
    const ta = document.createElement("textarea");
    Object.assign(ta.style, {
      width: "100%", height: h, fontFamily: "monospace", fontSize: "12px",
      border: "1px solid #d0d5dd", borderRadius: "8px", padding: "8px", boxSizing: "border-box",
    });
    ta.value = value;
    if (placeholder) ta.placeholder = placeholder;
    return ta;
  }

  function buildPanel() {
    if (document.getElementById("spectora-scanner-panel")) return;

    const panel = document.createElement("div");
    panel.id = "spectora-scanner-panel";
    Object.assign(panel.style, {
      position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483647",
      width: "390px", maxHeight: "86vh", background: "#fff",
      border: "1px solid #d0d5dd", borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      font: "13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif",
      color: "#111827", display: "flex", flexDirection: "column", overflow: "hidden",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "10px 12px", background: "#2a56d4", color: "#fff",
      fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center",
    });
    header.innerHTML =
      "<span>HyperReports v" + VERSION + "</span>" +
      '<span style="display:flex;gap:10px;align-items:center;">' +
      '<span id="sa-min" title="Minimize" style="cursor:pointer;font-size:18px;line-height:1;">–</span>' +
      '<span id="sa-close" title="Hide" style="cursor:pointer;font-size:16px;line-height:1;">×</span>' +
      "</span>";

    const bodyWrap = document.createElement("div");
    Object.assign(bodyWrap.style, { padding: "12px", overflow: "auto" });

    const logEl = document.createElement("pre");
    Object.assign(logEl.style, {
      whiteSpace: "pre-wrap", background: "#f6f7f9", border: "1px solid #eee",
      borderRadius: "8px", padding: "8px", marginTop: "10px", fontSize: "12px",
      minHeight: "40px", maxHeight: "220px", overflow: "auto",
    });
    // The log keeps the WHOLE run's history (not just the last line) so the
    // "Copy log" button can hand the full diagnostic to the chat in one click.
    let logLines = [];
    const log = (m) => {
      logLines.push(m);
      if (logLines.length > 400) logLines = logLines.slice(-400);
      logEl.textContent = logLines.join("\n");
      logEl.scrollTop = logEl.scrollHeight;
    };
    const resetLog = () => {
      logLines = [];
      logEl.textContent = "";
    };

    // Handoff status — shows when payloads have arrived from the app.
    const handoffWrap = document.createElement("div");
    Object.assign(handoffWrap.style, { display: "none", marginBottom: "6px" });
    const handoffNote = document.createElement("div");
    Object.assign(handoffNote.style, {
      background: "#ecfdf5", border: "1px solid #a7f3d0",
      color: "#065f46", borderRadius: "8px", padding: "8px", fontSize: "12px",
    });
    const clearBtn = document.createElement("button");
    clearBtn.textContent = "✕ Clear loaded data";
    Object.assign(clearBtn.style, {
      marginTop: "4px", background: "#fff", border: "1px solid #d0d5dd",
      borderRadius: "6px", padding: "3px 8px", fontSize: "11px",
      cursor: "pointer", color: "#6b7280",
    });
    clearBtn.onclick = () => {
      try {
        chrome.storage.local.remove("sa_handoff");
      } catch (e) {}
      lastHandoff = null;
      taReport.value = "";
      taWriteups.value = "";
      handoffWrap.style.display = "none";
    };
    handoffWrap.appendChild(handoffNote);
    handoffWrap.appendChild(clearBtn);
    bodyWrap.appendChild(handoffWrap);

    bodyWrap.appendChild(mkLabel("Step 1 — Check the boxes"));
    const taReport = mkTextarea(
      "",
      "110px",
      "Fills in automatically from the app when your report is ready.\n(You can also paste a build list here.)"
    );
    bodyWrap.appendChild(taReport);
    // Both steps start blue and turn green as they complete.
    const buildBtn = mkBtn("Build report", "#2a56d4", "#fff");
    buildBtn.style.marginTop = "8px";
    buildBtn.style.width = "100%";
    bodyWrap.appendChild(buildBtn);

    // Current-tab spot-check tools live under Advanced below.
    const taItem = mkTextarea("", "70px", "Labels to check on the current tab, one per line.");
    const row = document.createElement("div");
    row.style.marginTop = "8px";
    const previewBtn = mkBtn("Preview", "#fff", "#111827");
    previewBtn.style.border = "1px solid #d0d5dd";
    const checkBtn = mkBtn("Check matched", "#2a56d4", "#fff");
    checkBtn.style.marginLeft = "8px";
    row.appendChild(previewBtn);
    row.appendChild(checkBtn);

    bodyWrap.appendChild(mkLabel("Step 2 — Place custom write-ups"));
    const taWriteups = mkTextarea(
      "",
      "90px",
      "Fills in automatically from the app when your report is ready.\n(You can also paste write-ups here.)"
    );
    bodyWrap.appendChild(taWriteups);
    const placeBtn = mkBtn("Place custom write-ups", "#2a56d4", "#fff");
    placeBtn.style.marginTop = "8px";
    placeBtn.style.width = "100%";
    bodyWrap.appendChild(placeBtn);

    // Repair path for an already-placed report — lives under Advanced tools
    // (appended there below); the daily view is just Step 1 and Step 2.
    const fixProBtn = mkBtn("Fix-up: set Recommendation dropdowns (no re-place)", "#f59e0b", "#111827");
    fixProBtn.style.marginTop = "8px";
    fixProBtn.style.width = "100%";
    fixProBtn.style.fontSize = "12px";

    // Step buttons turn GREEN when their run completes, so it's visible at a
    // glance which steps are done. A fresh payload from the app resets them.
    const markStepDone = (btn, label) => {
      btn.style.background = "#15803d";
      btn.style.color = "#fff";
      btn.textContent = "✓ " + label + " (click to run again)";
    };
    const resetStepsDone = () => {
      buildBtn.style.background = "#2a56d4";
      buildBtn.textContent = "Build report";
      placeBtn.style.background = "#2a56d4";
      placeBtn.textContent = "Place custom write-ups";
    };

    // ---- payload handoff from the app (seam removal) ----------------------
    // The bridge script (on the app's site) stores {buildLines, writeups,
    // address, updatedAt}; pre-fill both boxes from it and keep them live.
    let lastHandoff = null;

    // ---- wrong-house guard ------------------------------------------------
    // The payload knows which house it was written for. Before anything runs,
    // look for that address on the Spectora page; if it isn't there, make the
    // inspector confirm. At volume, two open inspections is normal — placing
    // 20 write-ups into the wrong report (with no undo) must not be possible
    // by accident.
    const ADDR_SUFFIXES = [
      "st", "street", "dr", "drive", "rd", "road", "ave", "avenue", "ct",
      "court", "ln", "lane", "pl", "place", "way", "blvd", "boulevard",
      "cir", "circle", "ter", "terrace", "trl", "trail", "hwy", "pkwy",
      "apt", "unit", "ne", "nw", "se", "sw", "n", "s", "e", "w",
    ];
    function addrNeedle(addr) {
      // Tokens keep digits+letters TOGETHER: "41st Avenue" must yield "41st",
      // not split into "41" + "st" (which reads as the street suffix and made
      // the guard hunt for "6002 hyattsville" on a page saying "6002 41st Ave").
      const toks = (addr || "").toLowerCase().match(/[0-9a-z]+/g) || [];
      const numIdx = toks.findIndex((t) => /^\d+$/.test(t));
      if (numIdx === -1) return null;
      const word = toks
        .slice(numIdx + 1)
        .find((w) => w.length >= 3 && !ADDR_SUFFIXES.includes(w));
      if (!word) return null;
      return toks[numIdx] + " " + word;
    }
    function pageText() {
      let t = (document.title || "") + " " + (document.body ? document.body.innerText : "");
      try {
        // The editor usually lives in a same-origin frame; the address is
        // often only in the top page's header/title.
        if (window.top !== window) {
          t += " " + (window.top.document.title || "");
          t += " " + (window.top.document.body ? window.top.document.body.innerText : "");
        }
      } catch (e) {
        /* cross-origin top — use what this frame can see */
      }
      return t.toLowerCase().replace(/\s+/g, " ");
    }
    function houseVerified(addr) {
      const needle = addrNeedle(addr || "");
      if (!needle) return null; // can't verify — no usable address
      return pageText().includes(needle);
    }
    function guardHouse(log) {
      const addr = lastHandoff && lastHandoff.address;
      if (!addr) return true; // manual paste / no address on record
      const ok = houseVerified(addr);
      if (ok) {
        log("House check ✓ — this page matches " + addr);
        return true;
      }
      if (ok === null) return true;
      return window.confirm(
        "WRONG-HOUSE CHECK\n\nThe loaded payload was written for:\n\n    " +
          addr +
          "\n\nbut that address was NOT found on this Spectora page. If this is a different house, STOP — there is no undo.\n\nOnly continue if you are sure this report is " +
          addr +
          "."
      );
    }

    const applyHandoff = (h) => {
      // The panel can be rebuilt (hide/show); ignore callbacks aimed at a
      // detached copy of the textareas.
      if (!document.body.contains(taWriteups)) return;
      if (!h || (!h.buildLines && !h.writeups)) return;
      // A FRESH payload means a fresh run — clear the green done-markers.
      if (!lastHandoff || lastHandoff.updatedAt !== h.updatedAt) resetStepsDone();
      lastHandoff = h;
      if (h.buildLines) taReport.value = h.buildLines;
      if (h.writeups) taWriteups.value = h.writeups;
      const when = h.updatedAt ? new Date(h.updatedAt).toLocaleString() : "";
      const houseOk = h.address ? houseVerified(h.address) : null;
      handoffWrap.style.display = "";
      const hoursOld = h.updatedAt ? (Date.now() - h.updatedAt) / 3600000 : 0;
      const staleTag =
        hoursOld > 12
          ? " · ⏰ from a previous session — Clear this if you're starting a different report"
          : "";
      const houseTag =
        (houseOk === true ? " · house ✓" : houseOk === false ? " · ⚠ CHECK HOUSE" : "") +
        staleTag;
      if (houseOk === false) {
        Object.assign(handoffNote.style, {
          background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b",
        });
      } else {
        Object.assign(handoffNote.style, {
          background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
        });
      }
      handoffNote.textContent =
        "Loaded from the app" +
        (h.address ? " — " + h.address : "") +
        (when ? " (" + when + ")" : "") +
        (h.buildLines ? " · build list ✓" : "") +
        (h.writeups ? " · write-ups ✓" : "") +
        houseTag;
    };
    try {
      chrome.storage.local.get("sa_handoff", (res) => {
        applyHandoff(res && res.sa_handoff);
      });
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.sa_handoff) {
          applyHandoff(changes.sa_handoff.newValue);
        }
      });
    } catch (e) {
      /* storage unavailable — manual paste still works */
    }

    bodyWrap.appendChild(logEl);

    const copyLogBtn = mkBtn("Copy log — send if something looks wrong", "#fff", "#111827");
    Object.assign(copyLogBtn.style, {
      border: "1px solid #d0d5dd", marginTop: "6px", width: "100%", fontSize: "12px",
    });
    copyLogBtn.onclick = async () => {
      const text = logLines.join("\n") || logEl.textContent || "(log is empty)";
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {}
      if (!ok) {
        // Clipboard API can be blocked in content scripts; fall back to the
        // classic hidden-textarea copy.
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          ok = document.execCommand("copy");
        } catch (e) {}
        ta.remove();
      }
      copyLogBtn.textContent = ok
        ? "Copied ✓ — now paste it into the chat"
        : "Copy failed — select the gray text by hand";
      setTimeout(
        () => (copyLogBtn.textContent = "Copy log — send if something looks wrong"),
        3000
      );
    };
    bodyWrap.appendChild(copyLogBtn);

    // Everything below is setup/support tooling — hidden behind one quiet
    // toggle so the daily view is just Step 1, Step 2, and the log.
    const advToggle = document.createElement("div");
    advToggle.textContent = "Advanced tools ▸";
    Object.assign(advToggle.style, {
      marginTop: "12px", fontSize: "12px", color: "#6b7280", cursor: "pointer",
      userSelect: "none",
    });
    bodyWrap.appendChild(advToggle);

    const advWrap = document.createElement("div");
    advWrap.style.display = "none";
    bodyWrap.appendChild(advWrap);
    advToggle.onclick = () => {
      const open = advWrap.style.display === "none";
      advWrap.style.display = open ? "" : "none";
      advToggle.textContent = open ? "Advanced tools ▾" : "Advanced tools ▸";
    };

    advWrap.appendChild(mkLabel("Spot-check the current tab:"));
    advWrap.appendChild(taItem);
    advWrap.appendChild(row);

    advWrap.appendChild(mkLabel("Repair — set Recommendation dropdowns on a placed report:"));
    advWrap.appendChild(fixProBtn);

    advWrap.appendChild(mkLabel("Scan your template (one-time setup — checks nothing):"));
    const scanAllBtn = mkBtn("Scan template → file", "#111827", "#fff");
    scanAllBtn.style.width = "100%";
    advWrap.appendChild(scanAllBtn);

    const scanBtn = mkBtn("Scan (debug)", "#fff", "#6b7280");
    Object.assign(scanBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "10px" });
    advWrap.appendChild(scanBtn);

    const scanToolsBtn = mkBtn("Scan comment tools (debug)", "#fff", "#6b7280");
    Object.assign(scanToolsBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "8px" });
    advWrap.appendChild(scanToolsBtn);

    const clickAddBtn = mkBtn("Debug: click Add & report", "#fff", "#6b7280");
    Object.assign(clickAddBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "8px" });
    advWrap.appendChild(clickAddBtn);

    advWrap.appendChild(mkLabel("Recovery — untick every Defects box:"));
    const clearDefectsBtn = mkBtn("🧹 Clear ALL Defect boxes", "#b91c1c", "#fff");
    clearDefectsBtn.style.width = "100%";
    advWrap.appendChild(clearDefectsBtn);

    panel.appendChild(header);
    panel.appendChild(bodyWrap);
    document.body.appendChild(panel);

    // Minimize collapses to just the title bar; the header itself restores it.
    let minimized = localStorage.getItem(MIN_KEY) === "1";
    const applyMinimized = () => {
      bodyWrap.style.display = minimized ? "none" : "";
      panel.style.width = minimized ? "auto" : "390px";
      header.querySelector("#sa-min").textContent = minimized ? "▢" : "–";
      header.querySelector("#sa-min").title = minimized ? "Expand" : "Minimize";
    };
    applyMinimized();
    const toggleMin = (e) => {
      if (e) e.stopPropagation();
      minimized = !minimized;
      localStorage.setItem(MIN_KEY, minimized ? "1" : "0");
      applyMinimized();
    };
    header.querySelector("#sa-min").onclick = toggleMin;
    header.onclick = (e) => {
      // Clicking the bar while collapsed brings it back.
      if (minimized && e.target.id !== "sa-close") toggleMin();
    };

    // Hiding must stick — the keep-alive timer would otherwise rebuild it.
    header.querySelector("#sa-close").onclick = (e) => {
      e.stopPropagation();
      localStorage.setItem(HIDE_KEY, "1");
      panel.remove();
      showReopenButton();
    };
    buildBtn.onclick = async () => {
      resetLog();
      if (!guardHouse(log)) {
        log("Stopped — wrong-house check was not confirmed.");
        return;
      }
      const hadLines = parseLines(taReport.value).length > 0;
      buildBtn.disabled = true;
      buildBtn.textContent = "Building… (leave this tab open)";
      try {
        await buildReport(taReport.value, log);
        if (hadLines) {
          buildBtn.disabled = false;
          markStepDone(buildBtn, "Step 1 done — boxes built");
          return;
        }
      } catch (e) {
        log("Build error: " + (e && e.message ? e.message : e));
      }
      buildBtn.disabled = false;
      buildBtn.textContent = "Build report";
    };
    previewBtn.onclick = () => {
      resetLog();
      preview(taItem.value, log);
    };
    checkBtn.onclick = () => {
      resetLog();
      applyChecks(taItem.value, log);
    };
    scanBtn.onclick = () => {
      resetLog();
      log(JSON.stringify(scan(), null, 2));
    };
    scanToolsBtn.onclick = () => {
      resetLog();
      log(JSON.stringify(scanCommentTools(), null, 2));
    };
    clickAddBtn.onclick = async () => {
      resetLog();
      log("Clicking Add…");
      try {
        log(JSON.stringify(await debugClickAdd(), null, 2));
      } catch (e) {
        log("Debug error: " + (e && e.message ? e.message : e));
      }
    };
    placeBtn.onclick = async () => {
      resetLog();
      if (!guardHouse(log)) {
        log("Stopped — wrong-house check was not confirmed.");
        return;
      }
      const hadBlocks = parseWriteups(taWriteups.value).length > 0;
      placeBtn.disabled = true;
      placeBtn.textContent = "Placing… (leave this tab open)";
      let placedOk = false;
      try {
        await placeWriteups(taWriteups.value, log);
        placedOk = hadBlocks;
      } catch (e) {
        log("Place error: " + (e && e.message ? e.message : e));
      }
      placeBtn.disabled = false;
      if (placedOk) markStepDone(placeBtn, "Step 2 done — write-ups placed");
      else placeBtn.textContent = "Place custom write-ups";
    };
    fixProBtn.onclick = async () => {
      resetLog();
      if (!guardHouse(log)) {
        log("Stopped — wrong-house check was not confirmed.");
        return;
      }
      fixProBtn.disabled = true;
      fixProBtn.textContent = "Fixing dropdowns… (leave this tab open)";
      try {
        await fixProDropdowns(taWriteups.value, log);
      } catch (e) {
        log("Fix error: " + (e && e.message ? e.message : e));
      }
      fixProBtn.disabled = false;
      fixProBtn.textContent = "Fix-up: set Recommendation dropdowns (no re-place)";
    };
    scanAllBtn.onclick = async () => {
      resetLog();
      scanAllBtn.disabled = true;
      scanAllBtn.textContent = "Scanning… (leave this tab open)";
      try {
        await scanAll(log);
      } catch (e) {
        log("Scan error: " + (e && e.message ? e.message : e));
      }
      scanAllBtn.disabled = false;
      scanAllBtn.textContent = "Scan template → file";
    };
    clearDefectsBtn.onclick = async () => {
      if (
        !window.confirm(
          "This UNTICKS every checked box on every Defects tab in THIS report " +
            "(Information and Limitations are not touched).\n\nUse it to undo the " +
            "scan incident, then press \"Build report\" to re-check the legitimate " +
            "defect boxes from Step 1.\n\nClear all Defect boxes now?"
        )
      )
        return;
      resetLog();
      clearDefectsBtn.disabled = true;
      clearDefectsBtn.textContent = "Clearing… (leave this tab open)";
      try {
        await clearAllDefects(log);
      } catch (e) {
        log("Clear error: " + (e && e.message ? e.message : e));
      }
      clearDefectsBtn.disabled = false;
      clearDefectsBtn.textContent = "🧹 Clear ALL Defect boxes";
    };
  }

  // Small floating button to bring the panel back after hiding it.
  function showReopenButton() {
    if (document.getElementById("spectora-scanner-reopen")) return;
    const b = document.createElement("div");
    b.id = "spectora-scanner-reopen";
    b.textContent = "HR";
    b.title = "Show HyperReports";
    Object.assign(b.style, {
      position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483647",
      width: "40px", height: "40px", borderRadius: "20px", background: "#2a56d4",
      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      font: "600 13px -apple-system,Segoe UI,Roboto,sans-serif", cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
    });
    b.onclick = () => {
      localStorage.setItem(HIDE_KEY, "0");
      b.remove();
      buildPanel();
    };
    document.body.appendChild(b);
  }

  setInterval(() => {
    if (!isEditorFrame()) return;
    if (localStorage.getItem(HIDE_KEY) === "1") {
      showReopenButton();
      return;
    }
    if (!document.getElementById("spectora-scanner-panel")) buildPanel();
  }, 1000);
})();
