/* ==========================================================================
 * Spectora Autofill — v0.1 (READ-ONLY SCANNER)
 * --------------------------------------------------------------------------
 * This version changes NOTHING in the report. It only looks at the live page
 * and produces a structured description of it (sections, items, tabs, and the
 * defect checkboxes it can see). Trever/Tiaj run it once on a real report and
 * send the output back, so the real auto-checker can be built against the
 * exact structure instead of guessing.
 *
 * It injects a small panel only in the frame that actually contains the report
 * editor (the one with checkboxes), so there's just one panel.
 * ========================================================================== */

(function () {
  if (window.__spectoraScannerLoaded) return;
  window.__spectoraScannerLoaded = true;

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
    // fall back: any leaf element whose text is a tab name
    return leafByText(TAB_NAMES).length > 0;
  }

  function trimText(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function leafByText(names) {
    const set = names.map((n) => n.toLowerCase());
    const out = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (el.children.length !== 0) continue; // leaf only
      const t = trimText(el).toLowerCase();
      if (t && set.includes(t)) out.push(el);
      if (out.length > 60) break;
    }
    return out;
  }

  function exactLeaf(name) {
    const target = name.toLowerCase();
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      if (el.children.length !== 0) continue;
      if (trimText(el).toLowerCase() === target) return el;
    }
    return null;
  }

  function dataVAttrs(el) {
    return [...el.attributes]
      .map((a) => a.name)
      .filter((n) => n.startsWith("data-v-"));
  }

  function shortPath(el, depth = 4) {
    const parts = [];
    let node = el;
    for (let i = 0; i < depth && node && node.nodeType === 1; i++) {
      let seg = node.tagName.toLowerCase();
      if (node.id) seg += "#" + node.id;
      const cls = (node.getAttribute("class") || "").trim();
      if (cls) seg += "." + cls.split(/\s+/).slice(0, 3).join(".");
      const dv = dataVAttrs(node);
      if (dv.length) seg += "[" + dv.join(",") + "]";
      const role = node.getAttribute("role");
      if (role) seg += "{role=" + role + "}";
      parts.unshift(seg);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // Nearest human-readable label for a checkbox: climb until the text is a
  // sensible length (a defect title / option label).
  function rowText(cb) {
    // explicit <label for=..> or wrapping label
    if (cb.id) {
      const lbl = document.querySelector('label[for="' + cb.id + '"]');
      if (lbl) return trimText(lbl).slice(0, 160);
    }
    const wrap = cb.closest("label");
    if (wrap) return trimText(wrap).slice(0, 160);
    let node = cb.parentElement;
    for (let i = 0; i < 6 && node; i++) {
      const t = trimText(node);
      if (t.length >= 3 && t.length <= 160) return t;
      node = node.parentElement;
    }
    return trimText(cb.parentElement).slice(0, 160);
  }

  function clickableAncestor(el) {
    return (
      el.closest('a,button,[role="button"],li,[role="tab"],[role="menuitem"]') ||
      el.parentElement ||
      el
    );
  }

  // ---- the scan ------------------------------------------------------------

  function scan() {
    const out = {
      url: location.href,
      isTopFrame: window.top === window,
      when: new Date().toISOString(),
    };

    const allCbs = document.querySelectorAll('input[type="checkbox"]');
    out.totalCheckboxes = allCbs.length;
    out.checkboxes = [...allCbs].slice(0, 120).map((cb) => ({
      checked: cb.checked,
      id: cb.id || null,
      name: cb.name || null,
      text: rowText(cb),
      path: shortPath(cb, 4),
    }));

    out.tabs = leafByText(TAB_NAMES).map((el) => ({
      text: trimText(el),
      classes: el.getAttribute("class") || "",
      parentClasses: el.parentElement
        ? el.parentElement.getAttribute("class") || ""
        : "",
      ariaSelected: el.getAttribute("aria-selected"),
      path: shortPath(el, 4),
    }));

    out.sectionNav = KNOWN_SECTIONS.map((name) => {
      const el = exactLeaf(name);
      if (!el) return null;
      const clk = clickableAncestor(el);
      return {
        name,
        textPath: shortPath(el, 3),
        clickablePath: shortPath(clk, 3),
        clickableTag: clk.tagName.toLowerCase(),
      };
    }).filter(Boolean);

    return out;
  }

  // ---- panel UI ------------------------------------------------------------

  function buildPanel() {
    if (document.getElementById("spectora-scanner-panel")) return;

    const panel = document.createElement("div");
    panel.id = "spectora-scanner-panel";
    Object.assign(panel.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483647",
      width: "360px",
      maxHeight: "70vh",
      background: "#ffffff",
      border: "1px solid #d0d5dd",
      borderRadius: "12px",
      boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
      font: "13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif",
      color: "#111827",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "10px 12px",
      background: "#2a56d4",
      color: "#fff",
      fontWeight: "600",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    });
    header.innerHTML =
      '<span>Spectora Autofill — scanner v0.1</span>' +
      '<span id="spectora-scanner-close" style="cursor:pointer;font-size:16px;">×</span>';

    const body = document.createElement("div");
    Object.assign(body.style, { padding: "12px", overflow: "auto" });

    const note = document.createElement("div");
    note.style.marginBottom = "8px";
    note.style.color = "#6b7280";
    note.textContent =
      "Read-only. This changes nothing in your report. Open a section's Defects tab, click Scan, then Copy and send it back.";

    const scanBtn = mkBtn("Scan this report", "#2a56d4", "#fff");
    const copyBtn = mkBtn("Copy result", "#fff", "#111827");
    copyBtn.style.border = "1px solid #d0d5dd";
    copyBtn.style.marginLeft = "8px";

    const ta = document.createElement("textarea");
    Object.assign(ta.style, {
      width: "100%",
      height: "220px",
      marginTop: "10px",
      fontFamily: "monospace",
      fontSize: "11px",
      border: "1px solid #d0d5dd",
      borderRadius: "8px",
      padding: "8px",
      boxSizing: "border-box",
    });
    ta.readOnly = true;
    ta.placeholder = "Scan results will appear here…";

    const btnRow = document.createElement("div");
    btnRow.appendChild(scanBtn);
    btnRow.appendChild(copyBtn);

    body.appendChild(note);
    body.appendChild(btnRow);
    body.appendChild(ta);
    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    header.querySelector("#spectora-scanner-close").onclick = () =>
      panel.remove();

    scanBtn.onclick = () => {
      try {
        ta.value = JSON.stringify(scan(), null, 2);
      } catch (e) {
        ta.value = "Scan error: " + (e && e.message);
      }
    };
    copyBtn.onclick = () => {
      ta.select();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(ta.value);
        } else {
          document.execCommand("copy");
        }
        copyBtn.textContent = "Copied ✓";
      } catch (e) {
        document.execCommand("copy");
        copyBtn.textContent = "Copied ✓";
      }
      setTimeout(() => (copyBtn.textContent = "Copy result"), 1500);
    };
  }

  function mkBtn(label, bg, fg) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      background: bg,
      color: fg,
      border: "none",
      borderRadius: "8px",
      padding: "8px 12px",
      fontWeight: "600",
      cursor: "pointer",
    });
    return b;
  }

  // ---- boot: keep the panel present whenever the editor is on screen -------
  // Spectora is a single-page app; navigating between items re-renders the DOM
  // and can remove our panel. Poll and re-add it whenever it's missing.

  setInterval(() => {
    if (isEditorFrame() && !document.getElementById("spectora-scanner-panel")) {
      buildPanel();
    }
  }, 1000);
})();
