import * as XLSX from 'xlsx';

// Maps an uploaded sheet's dropdown values onto Master Data before the rows go to the server —
// which rejects any row holding a Status/Module/Priority/… value that isn't an active Master Data
// value. Real trackers pasted into the template use their own wording ("Development", "UAT",
// "Hold", Priority "High"), so without this almost every row failed.
//
//  - Status: mapped onto the allowed list (never added — Status drives the board's columns and
//    which items count as done). The file's original wording is kept in Remarks.
//  - Priority: High/Medium/Low -> P1/P2/P3.
//  - Everything else (Module, Business Impact, Complexity, Dev Factory, Reason): a value that
//    isn't in Master Data yet is added to it, so the row imports as written.
//  - The template's second sheet ("Dropdown Values"): any value it lists that Master Data lacks
//    is added too, so allowed values can be extended from Excel.

export const MAPPED_CATEGORIES = ['status', 'priority'];
export const OPEN_CATEGORIES = ['area', 'impact', 'complexity', 'devFactory', 'reasonCategory'];
const ALL_CATEGORIES = [...MAPPED_CATEGORIES, ...OPEN_CATEGORIES];

const norm = (s) => String(s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase();

// Tracker wording -> the standard workflow status it means. Keys are lower-cased.
const STATUS_SYNONYMS = {
  'yet to start': 'Not Started', 'yet & start': 'Not Started', 'not started': 'Not Started', 'tbd': 'Not Started', 'new': 'Not Started', 'open': 'Not Started',
  'brd': 'Requirement Discussion', 'feasibility study': 'Requirement Discussion', 'feasibility check': 'Requirement Discussion',
  'requirement': 'Requirement Discussion', 'requirement gathering': 'Requirement Discussion', 'vendor finalization': 'Requirement Discussion',
  'pending for approval': 'Requirement Discussion', 'user confirmation awited': 'Requirement Discussion', 'user confirmation awaited': 'Requirement Discussion',
  'engagement letter under process': 'Requirement Discussion', 'project': 'Requirement Discussion',
  'fs submitted': 'FS Preparation', 'fs': 'FS Preparation', 'fs preparation': 'FS Preparation',
  'development': 'In Progress', 'in development': 'In Progress', 'wip': 'In Progress', 'work in progress': 'In Progress',
  'configuration': 'In Progress', 'rework': 'In Progress', 'build': 'In Progress', 'in progress': 'In Progress',
  'iat': 'IT Testing', 'sit': 'IT Testing', 'testing': 'IT Testing', 'it testing': 'IT Testing',
  'uat': 'User Testing', 'user acceptance testing': 'User Testing', 'user testing': 'User Testing',
  'hypercare': 'Hypercare', 'go live': 'Hypercare', 'go-live': 'Hypercare',
  'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'live': 'Completed', 'closed': 'Completed',
  'hold': 'On Hold', 'on hold': 'On Hold', 'on-hold': 'On Hold',
  'dropped': 'Cancelled', 'cancelled': 'Cancelled', 'canceled': 'Cancelled', 'rejected': 'Cancelled',
};
const FALLBACK_STATUS = 'Not Started';

const PRIORITY_SYNONYMS = { high: 'P1', critical: 'P1', urgent: 'P1', medium: 'P2', normal: 'P2', low: 'P3' };

// Placeholders that mean "no value" — cleared instead of being added to Master Data as a value.
const BLANK_WORDS = new Set(['tbd', 'na', 'n/a', '-', '--', 'nil', 'none']);

// Colors for new Module/Status/Priority values (those categories show a colored chip).
const NEW_VALUE_COLORS = ['#3e7cb1', '#0d9488', '#9333ea', '#ea580c', '#db2777', '#16a34a', '#ca8a04', '#2563eb', '#dc2626', '#0891b2'];

/** Reads the "Dropdown Values" sheet (Field | Allowed Values, comma-separated) into
 * { category: [values] } using the same header→field mapping as the item sheet. */
export function readDropdownSheet(workbook, labelToField, normalizeHeader) {
  const name = workbook.SheetNames.find((n) => key(n) === 'dropdown values') || workbook.SheetNames[1];
  const sheet = name && workbook.Sheets[name];
  if (!sheet) return {};
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const out = {};
  for (const [field, allowed] of rows.slice(1)) {
    const cat = labelToField[normalizeHeader(field)];
    if (!ALL_CATEGORIES.includes(cat)) continue;
    const values = String(allowed || '').split(',').map(norm).filter(Boolean);
    if (values.length) out[cat] = values;
  }
  return out;
}

/**
 * Works out, without changing anything, what an import would need:
 *   rows      — the item rows with every dropdown value mapped onto Master Data wording
 *   toAdd     — [{ category, value }] values to create in Master Data
 *   toEnable  — [masterDataRow] existing-but-inactive values to switch back on
 *   mapped    — { category: { 'From -> To': count } } for the summary
 *   cleared   — { category: { value: count } } placeholder/number values that were blanked
 */
export function planImport(rows, masterData, sheetValues) {
  const active = {};
  const inactive = {};
  for (const m of masterData) {
    if (!ALL_CATEGORIES.includes(m.category)) continue;
    const bucket = m.active ? active : inactive;
    (bucket[m.category] ||= new Map()).set(key(m.value), m);
  }
  const toAdd = new Map(); // `${cat}|${key}` -> { category, value }
  const toEnable = new Map();
  const mapped = {};
  const cleared = {};
  const count = (obj, cat, k) => { obj[cat] ||= {}; obj[cat][k] = (obj[cat][k] || 0) + 1; };

  // Resolves a value for one of the open categories: existing active value (case-insensitive) →
  // reactivate an inactive one → otherwise schedule it for creation. Returns the stored wording.
  const ensure = (cat, value) => {
    const k = key(value);
    const hit = active[cat]?.get(k);
    if (hit) return hit.value;
    const off = inactive[cat]?.get(k);
    if (off) { toEnable.set(off.id, off); return off.value; }
    const pending = toAdd.get(`${cat}|${k}`);
    if (pending) return pending.value;
    toAdd.set(`${cat}|${k}`, { category: cat, value: norm(value) });
    return norm(value);
  };

  // The second sheet's values first, so they exist before any row needs them.
  for (const [cat, values] of Object.entries(sheetValues)) {
    if (cat === 'status' || cat === 'priority') continue; // fixed workflow scales — never extended
    for (const v of values) ensure(cat, v);
  }

  const statusIsAllowed = (v) => active.status?.get(key(v))?.value;

  const out = rows.map((row) => {
    const r = { ...row };
    const notes = [];

    const rawStatus = norm(r.status);
    if (rawStatus) {
      const direct = statusIsAllowed(rawStatus);
      if (direct) r.status = direct;
      else {
        const target = statusIsAllowed(STATUS_SYNONYMS[key(rawStatus)] || FALLBACK_STATUS) || FALLBACK_STATUS;
        r.status = target;
        count(mapped, 'status', `${rawStatus} → ${target}`);
        notes.push(`Status in file: ${rawStatus}`);
      }
    }

    const rawPriority = norm(r.priority);
    if (rawPriority) {
      const direct = active.priority?.get(key(rawPriority))?.value;
      const target = direct || PRIORITY_SYNONYMS[key(rawPriority)];
      if (target) {
        if (!direct) count(mapped, 'priority', `${rawPriority} → ${target}`);
        r.priority = target;
      } else {
        count(cleared, 'priority', rawPriority);
        notes.push(`Priority in file: ${rawPriority}`);
        r.priority = '';
      }
    }

    for (const cat of OPEN_CATEGORIES) {
      const raw = norm(r[cat]);
      if (!raw) continue;
      // A bare number here is a value that slipped in from a neighbouring column (e.g. an Excel
      // date serial under Dev Factory) — and "TBD"-style placeholders mean "not decided yet".
      if (BLANK_WORDS.has(key(raw)) || /^\d+(\.\d+)?$/.test(raw)) {
        count(cleared, cat, raw);
        r[cat] = '';
        continue;
      }
      r[cat] = ensure(cat, raw);
    }

    if (notes.length) r.remarks = [norm(r.remarks), ...notes].filter(Boolean).join(' | ');
    return r;
  });

  return { rows: out, toAdd: [...toAdd.values()], toEnable: [...toEnable.values()], mapped, cleared };
}

// Item fields stored as whole numbers server-side — anything else in them makes that row's INSERT
// fail with a bare "server error", so they're checked here instead.
export const INTEGER_FIELDS = ['hypercare', 'devTime', 'rework'];

/** Rows (1-based sheet row numbers, header = row 1) whose whole-number fields hold something
 * that isn't one: { field: [{ row, value }] }. Text there almost always means the pasted columns
 * are shifted relative to the template's headers, so the import stops instead of saving the rest
 * of those rows with every later column in the wrong place. */
export function findNonIntegerCells(rows) {
  const out = {};
  rows.forEach((r, i) => {
    for (const f of INTEGER_FIELDS) {
      const v = norm(r[f]);
      if (v && !/^-?\d+$/.test(v)) (out[f] ||= []).push({ row: i + 2, value: v });
    }
  });
  return out;
}

export function colorForNewValue(index) {
  return NEW_VALUE_COLORS[index % NEW_VALUE_COLORS.length];
}
