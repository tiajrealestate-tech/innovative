/* ==========================================================================
 * Spectora Autofill — v0.2
 * --------------------------------------------------------------------------
 * Two tools, in one panel that appears on the Spectora report editor:
 *
 *  1) CHECK DEFECTS (the real feature, first version):
 *     Paste a list of defect titles (one per line). "Preview" highlights the
 *     matching defects in the CURRENT item without changing anything.
 *     "Check matched" then ticks their boxes for you.
 *
 *  2) SCAN (debug): reports the page structure as JSON (read-only).
 *
 * This version acts only on the item you're currently viewing. Full
 * section→item navigation comes next once checking is confirmed reliable.
 * ========================================================================== */

(function () {
  if (window.__spectoraScannerLoaded) return;
  window.__spectoraScannerLoaded = true;

  const VERSION = "0.2.2";

  const KNOWN_SECTIONS = [
    "Inspection Details", "Roof", "Exterior",
    "Basement, Foundation, Crawlspace & Structure", "Heating", "Cooling",
    "Plumbing", "Electrical", "Fireplace", "Doors, Windows & Interior",
    "Attic, Insulation & Ventilation", "Bathrooms", "Laundry", "Garage",
    "General Overview", "Kitchen",
  ];
  const TAB_NAMES = ["Information", "Limitations", "Defects"];

  // ---- helpers ------------------------------------------------------------

  function isEditorFrame() {
    if (document.querySelector('input[type="checkbox"]')) return true;
    return leafByText(TAB_NAMES).length > 0;
  }

  function trimText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function norm(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function leafByText(names) {
    const set = names.map((n) => n.toLowerCase());
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length !== 0) continue;
      const t = trimText(el).toLowerCase();
      if (t && set.includes(t)) out.push(el);
      if (out.length > 60) break;
    }
    return out;
  }

  // ---- reading the defect cards in the current item -----------------------

  // Each defect is a `.comment.record` card containing a checkbox. The visible
  // title is the header text before the "Edit Photos / Edit this comment" UI.
  function defectRecords() {
    const recs = [];
    for (const rec of document.querySelectorAll(".comment.record")) {
      const cb = rec.querySelector('input[type="checkbox"]');
      if (!cb) continue;
      const header = rec.querySelector(".card-header") || rec;
      let title = trimText(header)
        .replace(/\s*Edit\s+Photos.*$/i, "")
        .replace(/\s*Edit this comment.*$/i, "")
        .trim();
      recs.push({ rec, cb, title });
    }
    return recs;
  }

  // Match a pasted title to a defect record (exact-normalized, then prefix).
  function matchRecord(records, wanted) {
    const w = norm(wanted);
    let best = records.find((r) => norm(r.title) === w);
    if (best) return best;
    best = records.find((r) => norm(r.title).startsWith(w) && w.length > 3);
    if (best) return best;
    return records.find((r) => norm(r.title).includes(w) && w.length > 4) || null;
  }

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
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Poll a condition until true or timeout — robust against slow re-renders.
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

  // Always re-query the DOM fresh — after a check, Spectora re-renders the list
  // and any node references we held become stale.
  function findFresh(line) {
    return matchRecord(defectRecords(), line);
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
    let firstMatch = null;
    for (const line of wanted) {
      const m = findFresh(line);
      if (m) {
        highlight(m.rec, m.cb.checked ? "#16a34a" : "#2a56d4");
        if (!firstMatch) firstMatch = m.rec;
        hit++;
      } else {
        misses.push(line);
      }
    }
    if (firstMatch) firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
    log(
      `Found ${hit} of ${wanted.length}. Blue = will be checked, green = already checked.` +
        (misses.length ? `\nNot found here: ${misses.join(", ")}` : "")
    );
  }

  // Check each defect one at a time, re-scanning fresh and pausing after each
  // click so Spectora's re-render finishes before we look for the next one.
  async function applyChecks(text, log) {
    clearHighlights();
    const wanted = parseLines(text);
    let checked = 0;
    let already = 0;
    const misses = [];
    for (let i = 0; i < wanted.length; i++) {
      const line = wanted[i];
      log(`Working… ${i + 1}/${wanted.length}: ${line}`);

      // Find it, waiting patiently in case the list is still re-rendering.
      let m = findFresh(line);
      if (!m) {
        await waitFor(() => !!(m = findFresh(line)), 2500);
      }
      if (!m) {
        misses.push(line + " (not found)");
        continue;
      }
      if (m.cb.checked) {
        already++;
        highlight(m.rec, "#16a34a");
        continue;
      }

      m.cb.click(); // toggles + fires the events Vue listens for
      // Wait until Spectora actually reflects the checked state on a fresh node.
      const ok = await waitFor(() => {
        const f = findFresh(line);
        return !!(f && f.cb.checked);
      }, 3500);
      if (ok) {
        checked++;
        const f = findFresh(line);
        if (f) highlight(f.rec, "#16a34a");
      } else {
        misses.push(line + " (click didn't stick)");
      }
      await sleep(250);
    }
    log(
      `Checked ${checked}${already ? `, ${already} already` : ""} of ${wanted.length}.` +
        (misses.length ? `\nProblem: ${misses.join(", ")}` : "") +
        `\n\nEyeball them — if a box is wrong, click it to undo.`
    );
  }

  // ---- scan (debug) -------------------------------------------------------

  function scan() {
    const out = { url: location.href, when: new Date().toISOString() };
    const cbs = document.querySelectorAll('input[type="checkbox"]');
    out.totalCheckboxes = cbs.length;
    out.defects = defectRecords().map((r) => ({
      title: r.title,
      checked: r.cb.checked,
    }));
    out.sections = KNOWN_SECTIONS.filter((n) =>
      [...document.querySelectorAll("li, span")].some(
        (el) => el.children.length === 0 && trimText(el) === n
      )
    );
    return out;
  }

  // ---- panel UI -----------------------------------------------------------

  function buildPanel() {
    if (document.getElementById("spectora-scanner-panel")) return;

    const panel = document.createElement("div");
    panel.id = "spectora-scanner-panel";
    Object.assign(panel.style, {
      position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483647",
      width: "370px", maxHeight: "80vh", background: "#fff",
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

    const body = document.createElement("div");
    Object.assign(body.style, { padding: "12px", overflow: "auto" });

    body.appendChild(
      mkLabel("Defect titles to check in THIS item (one per line):")
    );
    const ta = document.createElement("textarea");
    Object.assign(ta.style, {
      width: "100%", height: "120px", fontFamily: "monospace", fontSize: "12px",
      border: "1px solid #d0d5dd", borderRadius: "8px", padding: "8px",
      boxSizing: "border-box", marginBottom: "8px",
    });
    ta.value = "Shingles Missing\nPonding";
    body.appendChild(ta);

    const row = document.createElement("div");
    const previewBtn = mkBtn("Preview", "#fff", "#111827");
    previewBtn.style.border = "1px solid #d0d5dd";
    const checkBtn = mkBtn("Check matched", "#2a56d4", "#fff");
    checkBtn.style.marginLeft = "8px";
    row.appendChild(previewBtn);
    row.appendChild(checkBtn);
    body.appendChild(row);

    const logEl = document.createElement("pre");
    Object.assign(logEl.style, {
      whiteSpace: "pre-wrap", background: "#f6f7f9", border: "1px solid #eee",
      borderRadius: "8px", padding: "8px", marginTop: "8px", fontSize: "12px",
      minHeight: "40px",
    });
    body.appendChild(logEl);
    const log = (m) => (logEl.textContent = m);

    // debug scan (collapsed link)
    const scanWrap = document.createElement("div");
    scanWrap.style.marginTop = "10px";
    const scanBtn = mkBtn("Scan structure (debug)", "#fff", "#6b7280");
    scanBtn.style.border = "1px solid #e5e7eb";
    scanBtn.style.fontSize = "12px";
    const scanOut = document.createElement("textarea");
    Object.assign(scanOut.style, {
      width: "100%", height: "0px", fontFamily: "monospace", fontSize: "11px",
      border: "1px solid #d0d5dd", borderRadius: "8px", padding: "0", marginTop: "6px",
      boxSizing: "border-box", overflow: "hidden",
    });
    scanOut.readOnly = true;
    scanWrap.appendChild(scanBtn);
    scanWrap.appendChild(scanOut);
    body.appendChild(scanWrap);

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    header.querySelector("#sa-close").onclick = () => panel.remove();
    previewBtn.onclick = () => preview(ta.value, log);
    checkBtn.onclick = () => applyChecks(ta.value, log);
    scanBtn.onclick = () => {
      scanOut.value = JSON.stringify(scan(), null, 2);
      scanOut.style.height = "160px";
      scanOut.style.padding = "8px";
      scanOut.select();
    };
  }

  function mkLabel(t) {
    const d = document.createElement("div");
    d.textContent = t;
    d.style.fontWeight = "600";
    d.style.marginBottom = "6px";
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

  // ---- boot ---------------------------------------------------------------
  setInterval(() => {
    if (isEditorFrame() && !document.getElementById("spectora-scanner-panel")) {
      buildPanel();
    }
  }, 1000);
})();
