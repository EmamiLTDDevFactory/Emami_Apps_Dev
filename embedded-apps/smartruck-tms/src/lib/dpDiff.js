/* Parallel-run diff: Trip Trail's dataset / plan against Sanjoy's (his dp_data.json planned by the SAME engine).
   Input diff = what each tool was FED; output diff = what the engine PLANNED from it. Pure functions over datasets / sessions. */

const r2 = (x) => Math.round(x * 100) / 100;

/* table -> [key columns -> string, value columns -> numbers, value labels] (indices into mats / sites resolved to codes) */
const TABLES = {
  stk: { label: 'Stock (unrestricted / GIT / QI)', vals: ['Unrestricted', 'GIT', 'QI'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code, v: (r) => [r[2], r[3], r[4]] },
  lots: { label: 'Batch lots (qty)', vals: ['Qty'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code, v: (r) => [r[2]] },
  git: { label: 'Goods in transit', vals: ['Qty'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code, v: (r) => [r[2]] },
  ship: { label: 'Vehicles on the road', vals: ['Qty'], key: (r, M, S) => M[r[0]].code + '|' + (r[1] == null ? '' : S[r[1]].code) + '>' + S[r[2]].code + '|' + (r[6] || ''), v: (r) => [r[3]] },
  sto: { label: 'Pending STO', vals: ['Open qty'], key: (r, M, S) => M[r[0]].code + '|' + (r[1] == null ? '' : S[r[1]].code) + '>' + S[r[2]].code, v: (r) => [r[3]] },
  oo: { label: 'Open orders', vals: ['Open pcs'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code + '|' + r[2], v: (r) => [r[3]] },
  sale: { label: 'Sale month to date', vals: ['Pcs'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code + '|' + r[2], v: (r) => [r[3]] },
  trend: { label: 'Sale trend (14 days)', vals: ['Pcs'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code + '|' + r[2], v: (r) => [r[3]] },
  fc: { label: 'Forecast (M0 / M1)', vals: ['M0', 'M1'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code + '|' + r[2], v: (r) => [r[3], r[4]] },
  afc: { label: 'Additional forecast', vals: ['Qty'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code + '|' + r[2], v: (r) => [r[3]] },
  rpp: { label: 'Production plan (weeks)', vals: ['Wk1', 'Wk2', 'Wk3', 'Wk4', 'Addi'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code, v: (r) => [r[2], r[3], r[4], r[5], r[6]] },
  prod: { label: 'Production to date', vals: ['Qty'], key: (r, M, S) => M[r[0]].code + '|' + S[r[1]].code, v: (r) => [r[2]] },
};
export const TABLE_NAMES = Object.keys(TABLES);

function fold(D, name) {
  const t = TABLES[name], out = new Map();
  (D[name] || []).forEach((r) => {
    if (r[0] == null || (name !== 'ship' && name !== 'sto' && r[1] == null) || (D.mats[r[0]] == null)) return;
    let k; try { k = t.key(r, D.mats, D.sites); } catch { return; }
    const v = t.v(r).map((x) => +x || 0), a = out.get(k);
    if (a) v.forEach((x, i) => { a[i] += x; }); else out.set(k, v);
  });
  return out;
}

/** Per table: row counts, rows only in A / only in B, rows that differ, column totals, and the top-N keys by absolute difference. */
export function diffDatasets(A, B, topN = 50) {
  const tables = TABLE_NAMES.map((name) => {
    const t = TABLES[name], a = fold(A, name), b = fold(B, name), n = t.vals.length;
    const totA = new Array(n).fill(0), totB = new Array(n).fill(0);
    a.forEach((v) => v.forEach((x, i) => { totA[i] += x; })); b.forEach((v) => v.forEach((x, i) => { totB[i] += x; }));
    let onlyA = 0, onlyB = 0, differ = 0; const rows = [];
    new Set([...a.keys(), ...b.keys()]).forEach((k) => {
      const va = a.get(k), vb = b.get(k);
      if (!va) onlyB++; else if (!vb) onlyA++;
      const xa = va || new Array(n).fill(0), xb = vb || new Array(n).fill(0);
      const d = xa.map((x, i) => xb[i] - x), mag = d.reduce((s, x) => s + Math.abs(x), 0);
      if (mag > 0.5) { if (va && vb) differ++; rows.push({ key: k, a: xa.map(r2), b: xb.map(r2), delta: d.map(r2), mag, side: !va ? 'B only' : !vb ? 'A only' : 'differs' }); }
    });
    rows.sort((x, y) => y.mag - x.mag);
    return { name, label: t.label, vals: t.vals, rowsA: a.size, rowsB: b.size, onlyA, onlyB, differ, totA: totA.map(r2), totB: totB.map(r2), top: rows.slice(0, topN), diffRows: rows.length };
  });
  return { tables, sameToday: A.meta.today === B.meta.today, todayA: A.meta.today, todayB: B.meta.today };
}

/** Plan-level diff of two sessions (createSession objects that have run runPlan). Lines keyed leg|material|from|to on pieces. */
export function diffPlans(SA, SB, topN = 100) {
  const key = (S, l) => l.leg + '|' + S.M[l.mi].code + '|' + S.S[l.from].code + '|' + S.S[l.to].code;
  const fold = (S) => {
    const m = new Map();
    S.ST.P.lines.forEach((l) => { if (l.off || l.held || l.pcs <= 0) return;
      const k = key(S, l), a = m.get(k) || { pcs: 0, kg: 0, desc: S.M[l.mi].desc, leg: l.leg, from: S.S[l.from].code, to: S.S[l.to].code, mat: S.M[l.mi].code, crit: 0 };
      a.pcs += l.pcs; a.kg += l.kg; a.crit = a.crit || l.crit; m.set(k, a); });
    return m;
  };
  const a = fold(SA), b = fold(SB);
  const legAgg = (S, m) => [1, 2, 3].map((g) => { const ls = [...m.values()].filter((x) => x.leg === g); return { leg: g, lines: ls.length, t: r2(ls.reduce((s, x) => s + x.kg, 0) / 1000), crit: ls.filter((x) => x.crit).length }; });
  const trk = (S) => { const T = S.ST.P.trucks.filter((t) => t.status !== 'held'); const by = {}; T.forEach((t) => { by[t.status] = (by[t.status] || 0) + 1; }); return { total: T.length, tonnes: r2(T.reduce((s, t) => s + t.tonnes, 0)), by }; };
  const la = legAgg(SA, a), lb = legAgg(SB, b);
  const legs = [1, 2, 3].map((g, i) => ({ leg: g, a: la[i], b: lb[i] }));
  const depT = (m) => { const o = new Map(); m.forEach((x) => o.set(x.to, (o.get(x.to) || 0) + x.kg / 1000)); return o; };
  const da = depT(a), db = depT(b);
  const depots = [...new Set([...da.keys(), ...db.keys()])].map((code) => ({ code, a: r2(da.get(code) || 0), b: r2(db.get(code) || 0), delta: r2((db.get(code) || 0) - (da.get(code) || 0)) }))
    .filter((x) => Math.abs(x.delta) > 0.005).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const lines = []; let same = 0, onlyA = 0, onlyB = 0, differ = 0;
  new Set([...a.keys(), ...b.keys()]).forEach((k) => {
    const x = a.get(k), y = b.get(k), ref = x || y;
    const dp = (y ? y.pcs : 0) - (x ? x.pcs : 0), dk = (y ? y.kg : 0) - (x ? x.kg : 0);
    if (Math.abs(dp) < 1) { same++; return; }
    if (!x) onlyB++; else if (!y) onlyA++; else differ++;
    lines.push({ key: k, leg: ref.leg, mat: ref.mat, desc: ref.desc, from: ref.from, to: ref.to, aPcs: x ? Math.round(x.pcs) : 0, bPcs: y ? Math.round(y.pcs) : 0, delta: Math.round(dp), kg: Math.round(dk), side: !x ? 'B only' : !y ? 'A only' : 'differs' });
  });
  lines.sort((p, q) => Math.abs(q.kg) - Math.abs(p.kg));
  return { legs, trucks: { a: trk(SA), b: trk(SB) }, depots, lines: lines.slice(0, topN), counts: { same, onlyA, onlyB, differ, linesA: a.size, linesB: b.size, diffLines: lines.length } };
}

/** Workbook (dpXlsx.writeXlsx sheets) of both diffs. */
export function diffSheets(inp, out, labels = { a: 'Trip Trail (SAP)', b: 'Sanjoy (console)' }) {
  const sheets = [];
  sheets.push({ name: 'Input summary', head: ['Table', 'Rows ' + labels.a, 'Rows ' + labels.b, 'Only ' + labels.a, 'Only ' + labels.b, 'Differ', 'Total ' + labels.a, 'Total ' + labels.b],
    rows: inp.tables.map((t) => [t.label, t.rowsA, t.rowsB, t.onlyA, t.onlyB, t.differ, t.totA.join(' / '), t.totB.join(' / ')]), widths: [34, 10, 10, 10, 10, 8, 26, 26] });
  const top = [];
  inp.tables.forEach((t) => t.top.forEach((r) => top.push([t.label, r.key, r.side, t.vals.join(' / '), r.a.join(' / '), r.b.join(' / '), r.delta.join(' / ')])));
  sheets.push({ name: 'Input differences', head: ['Table', 'Key', 'Side', 'Values', labels.a, labels.b, 'B - A'], rows: top, widths: [30, 36, 9, 22, 20, 20, 20] });
  sheets.push({ name: 'Plan by leg', head: ['Leg', 'Lines ' + labels.a, 'Lines ' + labels.b, 'Tonnes ' + labels.a, 'Tonnes ' + labels.b, 'Critical ' + labels.a, 'Critical ' + labels.b],
    rows: out.legs.map((l) => [l.leg, l.a.lines, l.b.lines, l.a.t, l.b.t, l.a.crit, l.b.crit]).concat([['Trucks', out.trucks.a.total, out.trucks.b.total, out.trucks.a.tonnes, out.trucks.b.tonnes, '', '']]), widths: [10, 12, 12, 12, 12, 12, 12] });
  sheets.push({ name: 'Plan by depot', head: ['Depot', 'Tonnes ' + labels.a, 'Tonnes ' + labels.b, 'B - A'], rows: out.depots.map((d) => [d.code, d.a, d.b, d.delta]), widths: [10, 14, 14, 12] });
  sheets.push({ name: 'Plan line differences', head: ['Leg', 'Material', 'Description', 'From', 'To', 'Pcs ' + labels.a, 'Pcs ' + labels.b, 'B - A pcs', 'B - A kg', 'Side'],
    rows: out.lines.map((l) => [l.leg, l.mat, l.desc, l.from, l.to, l.aPcs, l.bPcs, l.delta, l.kg, l.side]), widths: [5, 12, 40, 8, 8, 10, 10, 10, 10, 9] });
  return sheets;
}
