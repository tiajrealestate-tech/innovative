/* ==========================================================================
 * Spectora Autofill — v0.4
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
  function clickByText(name) {
    const t = norm(name);
    const leaves = [...document.querySelectorAll("span,li,a,button,div")].filter(
      (el) => el.children.length === 0 && norm(el.textContent) === t
    );
    if (!leaves.length) return false;
    leaves.sort((a, b) => (a.closest("li") ? 0 : 1) - (b.closest("li") ? 0 : 1));
    const leaf = leaves[0];
    const clk =
      leaf.closest('li,a,button,[role="tab"],[role="button"]') || leaf.parentElement || leaf;
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
    await sleep(1000); // let the section's item list render
    return true;
  }
  async function selectItem(name) {
    // After switching sections the item list can take a moment to appear.
    if (!(await waitFor(() => existsByText(name), 7000))) return false;
    clickByText(name);
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
        problems.push(`Item not found: ${grp.item} (in ${grp.section})`);
        continue;
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
      '<span id="sa-close" style="cursor:pointer;font-size:16px;">×</span>';

    const bodyWrap = document.createElement("div");
    Object.assign(bodyWrap.style, { padding: "12px", overflow: "auto" });

    const logEl = document.createElement("pre");
    Object.assign(logEl.style, {
      whiteSpace: "pre-wrap", background: "#f6f7f9", border: "1px solid #eee",
      borderRadius: "8px", padding: "8px", marginTop: "10px", fontSize: "12px", minHeight: "40px",
    });
    const log = (m) => (logEl.textContent = m);

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

    bodyWrap.appendChild(logEl);

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

  setInterval(() => {
    if (isEditorFrame() && !document.getElementById("spectora-scanner-panel")) {
      buildPanel();
    }
  }, 1000);
})();
