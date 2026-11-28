/* Forecast upload (the one input that is not in SAP): parse one sheet into rows for POST /planning/forecast.
   Accepts the Trip Trail layout (Material, Plant, Channel, M0, M1, Additional) and the CCD / HCD console "Fcast" column names.
   Pure functions: file reading (xlsx / csv) is done by the caller, this works on rows of cells. */

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (v) => { if (typeof v === 'number') return isFinite(v) ? v : 0; const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
const code = (v) => { if (v == null) return ''; if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v); return String(v).trim().replace(/\.0$/, ''); };

/* SAP distribution channel -> planning channel (same table as dp_extract.py CHAN_CODE) */
const CHAN_CODE = { 10: 'GT', 20: 'GT', 25: 'GT', 35: 'GT', 40: 'GT', 30: 'MT', 55: 'Ecom', 57: 'Ecom', 96: 'Ecom', 95: 'GT', 58: 'GT', 45: 'GT', 70: 'GT' };
export function channelName(v) {
  const s = code(v), u = s.toUpperCase();
  if (!s) return 'GT';
  if (CHAN_CODE[s]) return CHAN_CODE[s];
  if (u.startsWith('MT')) return 'MT';
  if (u.startsWith('ECOM') || u.startsWith('E_COM') || u.startsWith('E-COM') || u === 'E COM') return 'Ecom';
  return 'GT';
}
const siteCode = (v) => { const s = code(v).toUpperCase(); return s ? s.split(/\s+/)[0] : ''; };

const COLS = {
  material: ['material', 'materialcode', 'item', 'itemcode', 'matnr'],
  plant: ['plant', 'site', 'werks', 'depot', 'plantcode'],
  channel: ['channel', 'chan', 'vtweg', 'distributionchannel'],
  m0: ['m0', 'month0', 'm0forecast', 'forecast', 'fc', 'm0fc', 'currentmonth'],
  m1: ['m1', 'month1', 'm1forecast', 'm1fc', 'nextmonth'],
  additional: ['additional', 'addi', 'addl', 'additionalforecast', 'additionalreqd', 'qtyfirm'],
};
const CONSOLE = {
  ccd: { firmGT: 'firmfcgt', firmMT: 'firmfcmt', tentGT: 'tentfcgt', tentMT: 'tentfcmt' },
  hcd: { m0s: 'm0saleable', m0f: 'm0free', m1s: 'm1saleable', m1f: 'm1free' },
};

/** rows: array of arrays (header row somewhere in the first 12). Returns {rows, format, skipped, warnings, header}. */
export function parseForecast(rows) {
  const out = { rows: [], format: '', skipped: 0, warnings: [], header: [] };
  let hi = -1, idx = null;
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const h = (rows[r] || []).map(norm);
    const find = (names) => h.findIndex((x) => names.includes(x));
    const mat = find(COLS.material), plant = find(COLS.plant);
    if (mat < 0 || plant < 0) continue;
    hi = r; idx = { mat, plant, chan: find(COLS.channel), m0: find(COLS.m0), m1: find(COLS.m1), add: find(COLS.additional) };
    const g = (k) => h.indexOf(k);
    if (g(CONSOLE.ccd.firmGT) >= 0 || g(CONSOLE.ccd.firmMT) >= 0) { idx.ccd = Object.fromEntries(Object.entries(CONSOLE.ccd).map(([k, v]) => [k, g(v)])); out.format = 'CCD console Fcast'; }
    else if (g(CONSOLE.hcd.m0s) >= 0 || g(CONSOLE.hcd.m0f) >= 0) { idx.hcd = Object.fromEntries(Object.entries(CONSOLE.hcd).map(([k, v]) => [k, g(v)])); out.format = 'HCD console Fcast'; }
    else out.format = 'Trip Trail layout';
    out.header = rows[r];
    break;
  }
  if (idx == null) { out.warnings.push('No header row with a Material and a Plant / Site column was found in the first 12 rows.'); return out; }
  if (!idx.ccd && !idx.hcd && idx.m0 < 0) out.warnings.push('No M0 / forecast column found: forecast quantities will be 0.');
  const at = (r, i) => (i == null || i < 0 ? 0 : num(r[i]));
  const by = new Map();
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const material = code(row[idx.mat]), plant = siteCode(row[idx.plant]);
    if (!material || !plant) { if (row.some((c) => c != null && c !== '')) out.skipped++; continue; }
    if (!/^\d+$/.test(material)) { out.skipped++; continue; }
    let m0, m1, add = at(row, idx.add);
    if (idx.ccd) { const c = idx.ccd; m0 = at(row, c.firmGT) + at(row, c.firmMT); m1 = at(row, c.tentGT) + at(row, c.tentMT); }
    else if (idx.hcd) { const c = idx.hcd; m0 = at(row, c.m0s) + at(row, c.m0f); m1 = at(row, c.m1s) + at(row, c.m1f); }
    else { m0 = at(row, idx.m0); m1 = at(row, idx.m1); }
    if (!m0 && !m1 && !add) continue;
    const channel = idx.chan >= 0 ? channelName(row[idx.chan]) : 'GT';
    const k = material + '|' + plant + '|' + channel;
    let a = by.get(k); if (!a) by.set(k, a = { material, plant, channel, m0: 0, m1: 0, additional: 0 });
    a.m0 += m0; a.m1 += m1; a.additional += add;
  }
  out.rows = [...by.values()].map((a) => ({ ...a, m0: Math.round(a.m0 * 100) / 100, m1: Math.round(a.m1 * 100) / 100, additional: Math.round(a.additional * 100) / 100 }));
  return out;
}

/** RFC 4180 CSV text -> rows of strings. */
export function parseCsvText(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/** Merge uploaded forecast rows into a dataset copy: replaces fc / afc (materials and plants that are not in the dataset are counted, not added). */
export function applyForecast(D, fcRows) {
  const mi = {}; D.mats.forEach((m, i) => { mi[m.code] = i; });
  const si = {}; D.sites.forEach((s, i) => { si[s.code] = i; });
  const fold = D.fold || {};
  const fc = [], afc = [], miss = { materials: new Set(), plants: new Set() };
  const acc = new Map(), acc2 = new Map();
  for (const r of fcRows) {
    const m = mi[r.material]; if (m == null) { miss.materials.add(r.material); continue; }
    const p = fold[r.plant] || r.plant, s = si[p]; if (s == null) { miss.plants.add(r.plant); continue; }
    const k = m + '|' + s + '|' + r.channel;
    if (r.m0 || r.m1) { const a = acc.get(k) || [m, s, r.channel, 0, 0]; a[3] += r.m0; a[4] += r.m1; acc.set(k, a); }
    if (r.additional) { const a = acc2.get(k) || [m, s, r.channel, 0]; a[3] += r.additional; acc2.set(k, a); }
  }
  acc.forEach((a) => fc.push(a)); acc2.forEach((a) => afc.push(a));
  return { D: { ...D, fc, afc, meta: { ...D.meta, forecast: { uploadedAt: new Date().toISOString(), rows: fcRows.length, local: true } } }, missing: { materials: [...miss.materials], plants: [...miss.plants] } };
}
