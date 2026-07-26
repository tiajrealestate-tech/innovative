/* ==========================================================================
 * Spectora Autofill — v0.8.3
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

  // Panel visibility preferences persist across page loads.
  const HIDE_KEY = "spectoraAutofillHidden";
  const MIN_KEY = "spectoraAutofillMinimized";

  // Your template's sections and their items (from Innovative Home Inspections'
  // real reports). The whole-report scanner walks this map so it knows where to
  // go; the checkbox labels it finds at each stop are read live from the page.
  // If an item here is named slightly differently in Spectora it'll show up as
  // "missing" in the scan summary, which tells us exactly what to fix.
  const REPORT_MAP = [
    ["Roof", ["Coverings", "Roof Drainage Systems", "Flashings", "Skylights, Chimneys & Other Roof Penetrations", "Roofing General"]],
    ["Exterior", ["Siding, Flashing & Trim", "Exterior Windows", "Exterior Doors", "Decks, Balconies, Porches & Steps", "Walkways, Patios & Driveways", "Eaves, Soffits & Fascia", "Vegetation, Grading, Drainage & Retaining Walls", "Windows & Doors", "Basement Walkout", "Exterior General"]],
    ["Basement, Foundation, Crawlspace & Structure", ["Basements & Crawlspaces", "Foundation", "Structural Components", "Structural General"]],
    ["Heating", ["Equipment", "Distribution Systems", "Normal Operating Controls", "Flues & Vents", "HVAC General"]],
    ["Cooling", ["Cooling Equipment", "Distribution System"]],
    ["Plumbing", ["Main Water Shut-off Device", "Water Supply, Distribution Systems & Fixtures", "Drain, Waste, & Vent Systems", "Hot Water Systems, Controls, Flues & Vents", "Fuel Storage & Distribution", "Sump Pump", "Plumbing General"]],
    ["Electrical", ["Service Entrance Conductors", "Service & Grounding", "Main & Subpanels, Service & Grounding, Main Overcurrent Device", "Branch Wiring Circuits, Breakers & Fuses", "Lighting Fixtures, Switches & Receptacles", "GFCI & AFCI", "Smoke & CO Detectors", "Electrical General"]],
    ["Fireplace", ["Cleanout Doors & Frames", "Fireplace", "Chimney"]],
    ["Doors, Windows & Interior", ["Doors", "Windows", "Floors, Walls, Ceilings", "Stairs, Steps, Stoops, Stairways & Ramps", "Switches, Fixtures & Receptacles", "Presence of Smoke and CO Detectors"]],
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
    (rec.querySelector(".card-header") || rec).click();
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
    // Fire on the text leaf first (bubbles up to the real inner handler), then
    // on the nearest clickable ancestor as a backup — both are safe because
    // clickByText only drives navigation (sections/items/tabs), never checkboxes.
    fireClick(leaf);
    const clk = leaf.closest('li,a,button,[role="tab"],[role="button"]');
    if (clk && clk !== leaf) fireClick(clk);
    return true;
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
    if (!clickByText(name)) return false;
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
      if (!(await selectItem(grp.item))) {
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
      `Done — checked ${totalChecked} box(es) across ${itemsDone}/${groups.length} item-tabs.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : "")
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

  // Walk the entire report (every section -> item -> tab) and record the exact
  // checkbox wording found at each stop. Produces the "menu" we map findings to.
  async function scanAll(log) {
    const started = Date.now();
    const result = { version: VERSION, url: location.href, generatedAt: new Date().toISOString(), sections: [] };
    let itemsFound = 0;
    let itemsMissing = 0;
    let boxes = 0;
    const missingList = [];

    for (let s = 0; s < REPORT_MAP.length; s++) {
      const [section, items] = REPORT_MAP[s];
      const sectionRec = { section, items: [] };
      result.sections.push(sectionRec);
      log(`Scanning ${s + 1}/${REPORT_MAP.length}: ${section}…`);
      const gotSection = await selectSection(section);
      if (!gotSection) {
        sectionRec.found = false;
        missingList.push(`Section not found: ${section}`);
        continue;
      }
      sectionRec.found = true;

      for (const item of items) {
        const itemRec = { item, tabs: [] };
        sectionRec.items.push(itemRec);
        if (!(await selectItem(item))) {
          itemRec.found = false;
          itemsMissing++;
          missingList.push(`Item not found: ${section} › ${item}`);
          continue;
        }
        itemRec.found = true;
        itemsFound++;

        for (const tab of TAB_NAMES) {
          if (!existsByText(tab)) continue; // some items don't have all tabs
          if (!(await openTab(tab))) continue;
          const labels = await readCurrentTabLabels();
          itemRec.tabs.push({ tab, checkboxes: labels });
          boxes += labels.length;
          log(`   ${section} › ${item} › ${tab}: ${labels.length} boxes`);
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
  function severityCells(modal) {
    const catLabel = [...modal.querySelectorAll("label,div,span,p")].find(
      (el) => el.children.length === 0 && /^category$/i.test(trimText(el))
    );
    // Any container of exactly three icon-bearing cells that sits after the
    // Category label (or anywhere in the modal when the label isn't found).
    const rows = [...modal.querySelectorAll("div")].filter((d) => {
      if (d.children.length !== 3) return false;
      const kids = [...d.children];
      return kids.every(
        (c) =>
          c.querySelector('svg,i,img,[class*="icon"]') ||
          (c.children.length === 0 && !trimText(c))
      );
    });
    let row = rows[0] || null;
    if (catLabel && rows.length > 1) {
      row =
        rows.find(
          (r) => catLabel.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING
        ) || row;
    }
    return row ? [...row.children] : null;
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
    // moved; a click Spectora ignored must not be reported as success.
    const cells = severityCells(modal);
    if (!cells || !cells[idx]) return false;
    const target = cells[idx].querySelector('button,[role="button"],svg,i') || cells[idx];
    clickOnce(target);
    await sleep(350);
    if (cellSelected(cells[idx])) return true;
    fireClick(target); // stronger: full sequence + native click
    await sleep(350);
    return cellSelected(cells[idx]);
  }

  async function addCustomComment(heading, body, severity) {
    await closeAnyDialog();
    if (!clickByTextOnce("Add") && !clickByTextOnce("+ Add")) {
      return { ok: false, reason: "'Add' control not found" };
    }

    let modal = (await waitFor(() => !!findAddCommentModal(), 6000))
      ? findAddCommentModal()
      : null;
    if (!modal) {
      // A stray overlay may have eaten the click — clear it and try once more.
      await closeAnyDialog();
      await sleep(400);
      clickByTextOnce("Add") || clickByTextOnce("+ Add");
      modal = (await waitFor(() => !!findAddCommentModal(), 5000))
        ? findAddCommentModal()
        : null;
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
    return { clickedAdd: clicked, before, after, visibleButtons: buttons, visibleFields: fields };
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
  async function selectItemWithFallback(section, item, log) {
    if (!item) return { ok: true, item: "" };
    if (await selectItem(item)) return { ok: true, item };
    // The item may be an OPTIONAL item of this section (that's how his
    // template ships "… General" items) — add it, then select it.
    if (await addOptionalItem(item)) {
      if (await selectItem(item)) {
        log(`  Added optional item "${item}" to ${section}.`);
        return { ok: true, item };
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
        return { ok: true, item: cand };
      }
    }
    return { ok: false, item: "" };
  }

  async function placeWriteups(text, log) {
    const blocks = parseWriteups(text);
    if (!blocks.length) {
      log('No write-ups found. In the app, open Report entry → Trever 2026 → "Copy for extension", then paste that here.');
      return;
    }
    let done = 0;
    const problems = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      log(`(${i + 1}/${blocks.length}) ${b.section} › ${b.item || "?"}…`);
      if (!(await selectSection(b.section))) {
        problems.push("Section not found: " + b.section);
        continue;
      }
      const sel = await selectItemWithFallback(b.section, b.item, log);
      if (!sel.ok) {
        problems.push(`Item not found: ${b.item} (in ${b.section} — no other item there would open either)`);
        continue;
      }
      const tabOk = await openTab("Defects");
      const r = await addCustomComment(b.heading, b.body, b.severity);
      if (r.ok) {
        done++;
        if (r.verified === false)
          problems.push(
            `${b.section} › ${sel.item || b.item || "?"}: saved, but "${b.heading}" is NOT visible in this item afterwards — it may have landed in the wrong place. Check it in Spectora.`
          );
        if (b.severity && b.severity !== "recommendation" && !r.severitySet)
          problems.push(
            `${b.section} › ${sel.item || b.item || "?"}: couldn't set the ${b.severity} rating — it saved as the default Recommendation. Change the Category by hand.`
          );
      } else
        problems.push(
          `${b.section} › ${sel.item || b.item || "?"}: ${r.reason || "couldn't fill the comment"}` +
            (tabOk ? "" : " (the Defects tab never opened)")
        );
      await sleep(400);
    }
    log(
      `Done — placed ${done}/${blocks.length} write-ups.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : "") +
        `\n\nClick "Copy log" below and paste it into the chat.`
    );
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
  function mkTextarea(value, h) {
    const ta = document.createElement("textarea");
    Object.assign(ta.style, {
      width: "100%", height: h, fontFamily: "monospace", fontSize: "12px",
      border: "1px solid #d0d5dd", borderRadius: "8px", padding: "8px", boxSizing: "border-box",
    });
    ta.value = value;
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
      "<span>Spectora Autofill v" + VERSION + "</span>" +
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

    bodyWrap.appendChild(mkLabel("Build report — Section > Item > Tab > Label (one per line):"));
    const taReport = mkTextarea(
      "Roof > Coverings > Defects > Shingles Missing\n" +
        "Roof > Coverings > Information > Architectural Shingles\n" +
        "Roof > Coverings > Limitations > Unable to See Everything\n" +
        "Bathrooms > Sinks, Tubs & Showers > Defects > Active Water Leak",
      "130px"
    );
    bodyWrap.appendChild(taReport);
    const buildBtn = mkBtn("Build report", "#16a34a", "#fff");
    buildBtn.style.marginTop = "8px";
    bodyWrap.appendChild(buildBtn);

    bodyWrap.appendChild(mkLabel("…or check just the CURRENT tab (labels, one per line):"));
    const taItem = mkTextarea("Shingles Missing\nPonding", "70px");
    bodyWrap.appendChild(taItem);
    const row = document.createElement("div");
    row.style.marginTop = "8px";
    const previewBtn = mkBtn("Preview", "#fff", "#111827");
    previewBtn.style.border = "1px solid #d0d5dd";
    const checkBtn = mkBtn("Check matched", "#2a56d4", "#fff");
    checkBtn.style.marginLeft = "8px";
    row.appendChild(previewBtn);
    row.appendChild(checkBtn);
    bodyWrap.appendChild(row);

    bodyWrap.appendChild(
      mkLabel("Place 2026 write-ups (paste the app's “Copy for extension”):")
    );
    const taWriteups = mkTextarea(
      "@@SECTION: Roof\n@@ITEM: Coverings\n@@HEADING: ROOF DEFICIENCIES\n@@BODY\n(paste from the app)\n@@END",
      "90px"
    );
    bodyWrap.appendChild(taWriteups);
    const placeBtn = mkBtn("Place write-ups", "#7c3aed", "#fff");
    placeBtn.style.marginTop = "8px";
    placeBtn.style.width = "100%";
    bodyWrap.appendChild(placeBtn);

    bodyWrap.appendChild(logEl);

    const copyLogBtn = mkBtn("Copy log", "#fff", "#111827");
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
      setTimeout(() => (copyLogBtn.textContent = "Copy log"), 3000);
    };
    bodyWrap.appendChild(copyLogBtn);

    bodyWrap.appendChild(mkLabel("Catalog the whole report (read-only — checks nothing):"));
    const scanAllBtn = mkBtn("Scan whole report → file", "#111827", "#fff");
    scanAllBtn.style.width = "100%";
    bodyWrap.appendChild(scanAllBtn);

    const scanBtn = mkBtn("Scan (debug)", "#fff", "#6b7280");
    Object.assign(scanBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "10px" });
    bodyWrap.appendChild(scanBtn);

    const scanToolsBtn = mkBtn("Scan comment tools (debug)", "#fff", "#6b7280");
    Object.assign(scanToolsBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "8px" });
    bodyWrap.appendChild(scanToolsBtn);

    const clickAddBtn = mkBtn("Debug: click Add & report", "#fff", "#6b7280");
    Object.assign(clickAddBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "8px" });
    bodyWrap.appendChild(clickAddBtn);

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
    buildBtn.onclick = () => {
      resetLog();
      buildReport(taReport.value, log);
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
      placeBtn.disabled = true;
      placeBtn.textContent = "Placing… (leave this tab open)";
      try {
        await placeWriteups(taWriteups.value, log);
      } catch (e) {
        log("Place error: " + (e && e.message ? e.message : e));
      }
      placeBtn.disabled = false;
      placeBtn.textContent = "Place write-ups";
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
      scanAllBtn.textContent = "Scan whole report → file";
    };
  }

  // Small floating button to bring the panel back after hiding it.
  function showReopenButton() {
    if (document.getElementById("spectora-scanner-reopen")) return;
    const b = document.createElement("div");
    b.id = "spectora-scanner-reopen";
    b.textContent = "SA";
    b.title = "Show Spectora Autofill";
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
