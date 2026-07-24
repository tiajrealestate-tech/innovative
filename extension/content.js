/* ==========================================================================
 * Spectora Autofill — v0.3
 * --------------------------------------------------------------------------
 * Panel on the Spectora report editor with three tools:
 *
 *  1) BUILD REPORT (the real feature): paste lines shaped
 *        Section > Item > Defect title
 *     and it navigates to each Section → Item → Defects tab and checks the
 *     matching pre-written defect — collapsing each card between checks
 *     (Spectora only allows one open at a time).
 *
 *  2) CHECK THIS ITEM: check a list of defect titles in the item you're on.
 *
 *  3) SCAN (debug): report the page structure.
 *
 * The version shown in the header is read from the manifest, so it always
 * matches the loaded build.
 * ========================================================================== */

(function () {
  if (window.__spectoraScannerLoaded) return;
  window.__spectoraScannerLoaded = true;

  const VERSION =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest
      ? chrome.runtime.getManifest().version
      : "?";

  const TAB_NAMES = ["Information", "Limitations", "Defects"];

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

  function isEditorFrame() {
    if (document.querySelector('input[type="checkbox"]')) return true;
    return [...document.querySelectorAll("span")].some(
      (el) => el.children.length === 0 && TAB_NAMES.includes(trimText(el))
    );
  }

  // ---- defect cards -------------------------------------------------------

  function defectRecords() {
    const recs = [];
    for (const rec of document.querySelectorAll(".comment.record")) {
      const cb = rec.querySelector('input[type="checkbox"]');
      if (!cb) continue;
      const header = rec.querySelector(".card-header") || rec;
      const title = trimText(header)
        .replace(/\s*Edit\s+Photos.*$/i, "")
        .replace(/\s*Edit this comment.*$/i, "")
        .trim();
      recs.push({ rec, cb, title });
    }
    return recs;
  }

  function matchRecord(records, wanted) {
    const w = norm(wanted);
    let best = records.find((r) => norm(r.title) === w);
    if (best) return best;
    best = records.find((r) => norm(r.title).startsWith(w) && w.length > 3);
    if (best) return best;
    return records.find((r) => norm(r.title).includes(w) && w.length > 4) || null;
  }
  function findFresh(line) {
    return matchRecord(defectRecords(), line);
  }

  // A card is "expanded" when it contains an editable comment area. Only one
  // can be open at a time; while open the other cards are hidden.
  function expandedRecord() {
    for (const rec of document.querySelectorAll(".comment.record")) {
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
    el.style.outline = "3px solid " + color;
    el.style.outlineOffset = "2px";
    highlighted.push(el);
  }

  function parseLines(text) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  // ---- checking the current item ------------------------------------------

  async function checkTitles(titles, log, prefix) {
    let checked = 0;
    let already = 0;
    const misses = [];
    if (collapseOpen()) await waitFor(() => defectRecords().length > 1, 2000);
    for (let i = 0; i < titles.length; i++) {
      const line = titles[i];
      if (log) log(`${prefix || ""}${i + 1}/${titles.length}: ${line}`);
      if (collapseOpen()) await waitFor(() => defectRecords().length > 1, 2000);

      let m = findFresh(line);
      if (!m) await waitFor(() => !!(m = findFresh(line)), 2500);
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
        const f = findFresh(line);
        return !!(f && f.cb.checked);
      }, 3500);
      if (ok) checked++;
      else misses.push(line + " (didn't stick)");
      if (collapseOpen()) await waitFor(() => defectRecords().length > 1, 2500);
      await sleep(150);
    }
    return { checked, already, misses };
  }

  function preview(text, log) {
    clearHighlights();
    const wanted = parseLines(text);
    if (!defectRecords().length) {
      log("No defect cards found. Open an item's Defects tab first.");
      return;
    }
    let hit = 0;
    const misses = [];
    let first = null;
    for (const line of wanted) {
      const m = findFresh(line);
      if (m) {
        highlight(m.rec, m.cb.checked ? "#16a34a" : "#2a56d4");
        if (!first) first = m.rec;
        hit++;
      } else misses.push(line);
    }
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    log(
      `Found ${hit} of ${wanted.length}. Blue = will check, green = already checked.` +
        (misses.length ? `\nNot found here: ${misses.join(", ")}` : "")
    );
  }

  async function applyChecks(text, log) {
    clearHighlights();
    const titles = parseLines(text);
    const r = await checkTitles(titles, log, "");
    log(
      `Checked ${r.checked}${r.already ? `, ${r.already} already` : ""} of ${titles.length}.` +
        (r.misses.length ? `\nProblem: ${r.misses.join(", ")}` : "") +
        `\n\nEyeball them — if a box is wrong, click it to undo.`
    );
  }

  // ---- navigation (sections / items / tabs) -------------------------------

  function existsByText(name) {
    const t = norm(name);
    return [...document.querySelectorAll("span,li,a,button,div")].some(
      (el) => el.children.length === 0 && norm(el.textContent) === t
    );
  }
  function clickByText(name) {
    const t = norm(name);
    const leaves = [...document.querySelectorAll("span,li,a,button,div")].filter(
      (el) => el.children.length === 0 && norm(el.textContent) === t
    );
    if (!leaves.length) return false;
    leaves.sort((a, b) => (a.closest("li") ? 0 : 1) - (b.closest("li") ? 0 : 1));
    const leaf = leaves[0];
    const clk =
      leaf.closest('li,a,button,[role="tab"],[role="button"]') ||
      leaf.parentElement ||
      leaf;
    clk.click();
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
    await sleep(600);
    return true;
  }
  async function selectItem(name) {
    const appeared = await waitFor(() => existsByText(name), 3000);
    if (!appeared) return false;
    clickByText(name);
    await sleep(600);
    return true;
  }
  async function openDefectsTab() {
    clickByText("Defects");
    await waitFor(() => tabActive("Defects"), 2500);
    await sleep(400);
  }

  // ---- full report build --------------------------------------------------

  function parseReport(text) {
    const map = new Map();
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const parts = line.split(/\s*[>|]\s*/);
      if (parts.length < 3) continue;
      const section = parts[0].trim();
      const item = parts[1].trim();
      const defect = parts.slice(2).join(" > ").trim();
      const key = section + "||" + item;
      if (!map.has(key)) map.set(key, { section, item, defects: [] });
      map.get(key).defects.push(defect);
    }
    return [...map.values()];
  }

  async function buildReport(text, log) {
    clearHighlights();
    const groups = parseReport(text);
    if (!groups.length) {
      log("No valid lines. Use:  Section > Item > Defect  (one per line).");
      return;
    }
    let itemsDone = 0;
    let totalChecked = 0;
    const problems = [];
    for (let g = 0; g < groups.length; g++) {
      const grp = groups[g];
      log(`(${g + 1}/${groups.length}) ${grp.section} › ${grp.item}…`);
      if (!(await selectSection(grp.section))) {
        problems.push("Section not found: " + grp.section);
        continue;
      }
      if (!(await selectItem(grp.item))) {
        problems.push(`Item not found: ${grp.item} (in ${grp.section})`);
        continue;
      }
      await openDefectsTab();
      const r = await checkTitles(grp.defects, log, `${grp.item}: `);
      totalChecked += r.checked;
      r.misses.forEach((m) => problems.push(`${grp.section} › ${grp.item}: ${m}`));
      itemsDone++;
    }
    log(
      `Done — checked ${totalChecked} defect(s) across ${itemsDone}/${groups.length} items.` +
        (problems.length ? `\n\nIssues:\n- ${problems.join("\n- ")}` : "")
    );
  }

  // ---- scan (debug) -------------------------------------------------------

  function scan() {
    return {
      url: location.href,
      version: VERSION,
      totalCheckboxes: document.querySelectorAll('input[type="checkbox"]').length,
      defects: defectRecords().map((r) => ({ title: r.title, checked: r.cb.checked })),
      defectsTabActive: tabActive("Defects"),
    };
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
      border: "1px solid #d0d5dd", borderRadius: "8px", padding: "8px",
      boxSizing: "border-box",
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
      width: "380px", maxHeight: "84vh", background: "#fff",
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
      '<span id="sa-close" style="cursor:pointer;font-size:16px;">×</span>';

    const bodyWrap = document.createElement("div");
    Object.assign(bodyWrap.style, { padding: "12px", overflow: "auto" });

    // shared log
    const logEl = document.createElement("pre");
    Object.assign(logEl.style, {
      whiteSpace: "pre-wrap", background: "#f6f7f9", border: "1px solid #eee",
      borderRadius: "8px", padding: "8px", marginTop: "10px", fontSize: "12px", minHeight: "40px",
    });
    const log = (m) => (logEl.textContent = m);

    // --- Build report (auto-navigation) ---
    bodyWrap.appendChild(mkLabel("Build report — Section > Item > Defect (one per line):"));
    const taReport = mkTextarea(
      "Roof > Coverings > Shingles Missing\n" +
        "Roof > Coverings > Ponding\n" +
        "Bathrooms > Sinks, Tubs & Showers > Active Water Leak",
      "120px"
    );
    bodyWrap.appendChild(taReport);
    const buildBtn = mkBtn("Build report", "#16a34a", "#fff");
    buildBtn.style.marginTop = "8px";
    bodyWrap.appendChild(buildBtn);

    // --- Check just this item ---
    bodyWrap.appendChild(mkLabel("…or check just THIS item (defect titles, one per line):"));
    const taItem = mkTextarea("Shingles Missing\nPonding", "80px");
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

    bodyWrap.appendChild(logEl);

    // --- debug scan ---
    const scanBtn = mkBtn("Scan (debug)", "#fff", "#6b7280");
    Object.assign(scanBtn.style, { border: "1px solid #e5e7eb", fontSize: "12px", marginTop: "10px" });
    bodyWrap.appendChild(scanBtn);

    panel.appendChild(header);
    panel.appendChild(bodyWrap);
    document.body.appendChild(panel);

    header.querySelector("#sa-close").onclick = () => panel.remove();
    buildBtn.onclick = () => buildReport(taReport.value, log);
    previewBtn.onclick = () => preview(taItem.value, log);
    checkBtn.onclick = () => applyChecks(taItem.value, log);
    scanBtn.onclick = () => log(JSON.stringify(scan(), null, 2));
  }

  // ---- boot ---------------------------------------------------------------
  setInterval(() => {
    if (isEditorFrame() && !document.getElementById("spectora-scanner-panel")) {
      buildPanel();
    }
  }, 1000);
})();
