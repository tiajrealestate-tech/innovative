/* ==========================================================================
 * Bridge — runs on the report app's site (not on Spectora).
 * --------------------------------------------------------------------------
 * The review page posts its two payloads (build list + write-ups) as window
 * messages. This script stores them in chrome.storage.local, where the
 * Spectora side of the extension reads them and pre-fills its panel — no
 * copy-paste. The page gets an ack back so it can show "Sent to extension ✓".
 * ========================================================================== */

(() => {
  const KEY = "sa_handoff";

  function store(d) {
    try {
      chrome.storage.local.get(KEY, (cur) => {
        const prev = (cur && cur[KEY]) || {};
        const next = {
          ...prev,
          address: d.address || prev.address || "",
          updatedAt: Date.now(),
        };
        if (typeof d.buildLines === "string") next.buildLines = d.buildLines;
        if (typeof d.writeups === "string") next.writeups = d.writeups;
        chrome.storage.local.set({ [KEY]: next }, () => {
          window.postMessage({ source: "innovative-ext", type: "SA_ACK" }, "*");
        });
      });
    } catch (e) {
      /* extension context invalidated (e.g. after an update) — page falls back to copy-paste */
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.source !== "innovative-app" || d.type !== "SA_PAYLOAD") return;
    store(d);
  });

  // Tell the page the extension is here, so it can show "connected" and
  // re-send whatever payload it currently holds.
  window.postMessage({ source: "innovative-ext", type: "SA_HELLO" }, "*");
})();
