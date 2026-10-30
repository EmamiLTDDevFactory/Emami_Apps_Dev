import { CATEGORIES } from './constants.js';

// Groups the flat /master-data rows by category, sorted by sortOrder then value —
// matches the original ORDER BY category, "sortOrder", value.
export function groupMasterData(rows) {
  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat.key] = [];
  for (const row of rows || []) {
    if (!byCategory[row.category]) byCategory[row.category] = [];
    byCategory[row.category].push(row);
  }
  for (const key of Object.keys(byCategory)) {
    byCategory[key].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.value.localeCompare(b.value));
  }
  return byCategory;
}

// Only active rows populate dropdowns/color maps everywhere outside the admin screen —
// matches `rows.filter(r => r.active)` in the original app.js/home.js/resource-utilization.js.
export function activeValues(rows, category) {
  return (rows || []).filter((r) => r.category === category && r.active).map((r) => r.value);
}

// Generic version of areaColorMap below — any master-data category can carry a per-value
// color/softColor once its CATEGORIES entry has hasColor: true (admin's color picker writes
// them via apiMasterDataUpdate). A row with no color set yet (color: null) is simply absent
// from the map, so callers fall back to their own default for that value.
export function categoryColorMap(rows, category) {
  const map = {};
  for (const r of rows || []) {
    if (r.category === category && r.active && r.color) {
      map[r.value] = { color: r.color, softColor: r.softColor };
    }
  }
  return map;
}

export function areaColorMap(rows) {
  return categoryColorMap(rows, 'area');
}

// Areas (Modules) are grouped SAP / Non-SAP in Master Data › Area ("areaGroup"). The landscape of an issue or a
// change request is always derived from its area this way — it is never stored separately.
export const LANDSCAPES = ['SAP', 'Non-SAP'];
export const UNCLASSIFIED = 'Not classified';
export function areaGroupMap(rows) {
  const map = {};
  for (const r of rows || []) if (r.category === 'area' && r.areaGroup) map[r.value] = r.areaGroup;
  return map;
}
export const landscapeOf = (area, groupOf) => (area ? groupOf?.[area] || UNCLASSIFIED : '');
/** Active area values split by landscape, in Master Data order: [['SAP', [...]], ['Non-SAP', [...]], ['Not classified', [...]]]. */
export function areasByLandscape(values, groupOf) {
  const out = [...LANDSCAPES, UNCLASSIFIED].map((g) => [g, []]);
  for (const v of values || []) out.find(([g]) => g === (groupOf?.[v] || UNCLASSIFIED))[1].push(v);
  return out.filter(([, list]) => list.length);
}
