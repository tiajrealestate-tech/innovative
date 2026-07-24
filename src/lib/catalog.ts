// =============================================================================
// SPECTORA CHECKBOX CATALOG
// -----------------------------------------------------------------------------
// A read-only index over the checkbox "menu" scanned from the live Spectora
// template (src/data/spectora-catalog.json). The mapping layer uses this to
// find the candidate boxes for a given section + item, which the AI matcher
// then picks from. Regenerate the JSON by re-running the extension's
// "Scan whole report" and merging — the shape here is the stable contract.
// =============================================================================

import rawCatalog from "@/data/spectora-catalog.json";

export interface CatalogTab {
  tab: string; // "Information" | "Limitations" | "Defects"
  checkboxes: string[];
}
export interface CatalogItem {
  item: string;
  found?: boolean;
  tabs: CatalogTab[];
}
export interface CatalogSection {
  section: string;
  items: CatalogItem[];
}
interface Catalog {
  sections: CatalogSection[];
  summary?: unknown;
}

const CATALOG = rawCatalog as unknown as Catalog;

export function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getSection(section: string): CatalogSection | null {
  const n = norm(section);
  return CATALOG.sections.find((s) => norm(s.section) === n) || null;
}

/** All item names in a section (in template order). */
export function sectionItems(section: string): string[] {
  return getSection(section)?.items.map((i) => i.item) || [];
}

/** Find an item by name within a section, tolerant of small wording differences. */
export function getItem(section: string, item: string): CatalogItem | null {
  const sec = getSection(section);
  if (!sec) return null;
  const n = norm(item);
  return (
    sec.items.find((i) => norm(i.item) === n) ||
    sec.items.find((i) => norm(i.item).startsWith(n) && n.length > 3) ||
    sec.items.find((i) => norm(i.item).includes(n) && n.length > 4) ||
    null
  );
}

export interface BoxCandidate {
  section: string;
  item: string;
  tab: string;
  label: string;
}

/**
 * Candidate checkboxes for matching a finding. Defaults to the Defects tab of
 * the finding's item; if the item can't be resolved, falls back to every
 * Defects box in the section so a match is still possible. Optionally includes
 * Limitations (for access/limitation-type findings).
 */
export function candidateBoxes(
  section: string,
  item: string | null,
  opts: { tabs?: string[]; sectionFallback?: boolean } = {}
): BoxCandidate[] {
  const tabs = opts.tabs && opts.tabs.length ? opts.tabs : ["Defects"];
  const sec = getSection(section);
  if (!sec) return [];

  const out: BoxCandidate[] = [];
  const pushFrom = (it: CatalogItem) => {
    for (const t of it.tabs) {
      if (!tabs.some((want) => norm(want) === norm(t.tab))) continue;
      for (const label of t.checkboxes) {
        out.push({ section: sec.section, item: it.item, tab: t.tab, label });
      }
    }
  };

  const it = item ? getItem(section, item) : null;
  if (it) {
    pushFrom(it);
    if (out.length) return out;
  }

  // Fallback: every candidate box in the section (so the matcher still has
  // something to choose from when the item name doesn't line up).
  if (opts.sectionFallback !== false) {
    for (const other of sec.items) pushFrom(other);
  }
  return out;
}

/** Total unique boxes — handy for diagnostics. */
export function catalogStats() {
  let items = 0;
  let boxes = 0;
  for (const s of CATALOG.sections) {
    for (const it of s.items) {
      items++;
      for (const t of it.tabs) boxes += t.checkboxes.length;
    }
  }
  return { sections: CATALOG.sections.length, items, boxes };
}
