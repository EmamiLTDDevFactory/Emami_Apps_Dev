/* Distribution Planning - session model (no DOM, no React).
   A DOM-free port of the planner page logic in Sanjoy Paul's dp_template.html: plan state, summary figures, plan-line / truck / arrival
   views, line edits, and the DP.xlsx-layout sheets (Raam Baan leg 1 / leg 2, stock transfer, Pinaka). The engine itself is dpEngine.js,
   used unchanged; it is handed in so this file runs in the browser (Next) and under `node --test` alike.

   const S = createSession(D, DPE);   S.runPlan();   S.P (the plan)   S.ST (view state: unit, div, opt, arrived)   */

export const LEG = { 1: 'Raam Baan · Leg 1 (unit → depot / MWH)', 2: 'Raam Baan · Leg 2 (MWH → depot)', 3: 'Pinaka (inter-depot)' };
export const LEGS = { 1: 'Raam Baan L1', 2: 'Raam Baan L2', 3: 'Pinaka' };
export const TIER = { 0: 'Manual', 1: 'P1 Open order', 2: 'P2 Sales trend', 3: 'P3 Block target' };
export const SETTINGS_FIELDS = [
  ['b1Day', 'Block 1 date (day of month)'], ['p1', 'Block 1 target, share of M0 + additional'],
  ['b2Day', 'Block 2 date (day of month)'], ['p2', 'Block 2 target, share of M0 + additional'],
  ['p3', 'After block 2: share of M1 if the trend is good'], ['m1Open', 'Next month: M1 share landed by the 10th'],
  ['trendOk', 'Trend is good if projected month-end ≥ this × forecast'], ['cycleDays', 'Days a truck must carry the depot (sales trend tier)'],
  ['freshMin', 'Fresh = shelf life left above (MT / Ecom)'], ['idtMaxAgeDays', 'No inter-depot move of stock older than (days)'],
  ['defaultLT', 'Lead time when a lane has none (days)'], ['minFill', 'Full truck = filled to at least'],
  ['ptlMax', 'Critical remainder below (t) goes part-load'], ['defCaseKg', 'Case weight when the master has none (kg)'],
];
export const LEG1_COLS = ['DP59', 'DP44', 'DP12', 'DP14', 'DP26', 'DP29', 'DP03', 'DP30', 'DP09', 'DP39', 'DP27', 'DP19', 'DP36', 'DP22', 'DP05', 'DP21', 'DP17', 'DP16', 'DP20', 'DP01', 'DP38', 'DP28'];
export const ST_HEAD = ['Material', 'Description', 'From', 'To', 'Quantity (Cases)', 'Quantity (Pcs)', 'Plan unit', 'Leg', 'Truck No', 'Vehicle', 'Truck status', 'Priority', 'Critical', 'Reason', 'Weight (kg)', 'Lands in (days)', 'Final depot'];
const ST_W = [12, 42, 8, 8, 10, 10, 8, 5, 9, 9, 12, 16, 10, 34, 11, 9, 14];

const clone = (x) => JSON.parse(JSON.stringify(x));
const codeVal = (c) => (/^\d+$/.test(c) ? +c : c);
export const ddmmyyyy = (iso) => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
export const addDays = (iso, d) => { const t = new Date(iso + 'T00:00:00'); t.setDate(t.getDate() + d); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
export const dShort = (iso) => (iso ? iso.slice(8, 10) + '-' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+iso.slice(5, 7) - 1] : '');
export const colIdx = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export function createSession(D, DPE) {
  const S = D.sites, M = D.mats;
  const six = {}; S.forEach((s, i) => { six[s.code] = i; });
  const mByCode = {}; M.forEach((m, i) => { mByCode[m.code] = i; });
  const ST = { unit: 'cases', div: '', opt: clone(DPE.DEF), arrived: new Set(), P: null, dirty: false };

  const sName = (i) => (i == null ? '' : S[i].code + ' ' + S[i].name);
  const isUnit = (i) => S[i].type === 'Unit' || S[i].type === '3P';
  const isMwh = (i) => S[i].type === 'MWH';
  const srcKind = (si) => (isUnit(si) ? 1 : isMwh(si) ? 2 : 3);
  const dOk = (mi) => !ST.div || M[mi].div === ST.div;
  const divTag = () => (ST.div ? ST.div + ' ' : '');
  const qf = (mi) => (ST.unit === 'pcs' ? (M[mi].cp || 1) : 1);
  const qv = (x) => (ST.unit === 'pcs' ? Math.round(x) : Math.round(x * 100) / 100);
  const qty = (l) => qv(l.cases * qf(l.mi));
  const uLbl = () => (ST.unit === 'pcs' ? 'Pcs' : 'Cases');
  const isPcsMat = (mi) => (ST.opt.pcsDivs || []).includes(M[mi].div) || (ST.opt.pcsMats || []).includes(M[mi].code);
  const lineVal = (l) => l.pcs * (M[l.mi].rate || 0);
  const truckLabel = (l) => (l.off ? 'removed' : l.held ? 'held' : l.truck == null ? '' : 'T' + String(l.truck + 1).padStart(3, '0'));
  const truckOf = (no) => ST.P.trucks.find((t) => t.no === no);
  const liveLines = () => ST.P.lines.filter((l) => !l.off && l.cases > 0 && dOk(l.mi));
  const cw = (mi) => (M[mi].cw > 0 ? M[mi].cw : ST.P.opt.defCaseKg);
  const keyOrder = (a, b) => ST.P.X.keyOf[a] - ST.P.X.keyOf[b] || M[a].code.localeCompare(M[b].code);

  function runPlan() {
    const t0 = Date.now();
    const P = DPE.plan(D, ST.opt, { uploads: [], arrived: [...ST.arrived] });
    P.lines.forEach((l, i) => { l.id = i; l.cases0 = l.cases; });
    P.ms = Date.now() - t0;
    ST.P = P; ST.dirty = false; shipCache = null;
    return P;
  }
  function retruck() { ST.P.trucks = DPE.buildTrucks(ST.P.lines, ST.P.X, ST.P.opt); }
  function restoreDefaults() { const ub = ST.opt.unitBasis, mb = ST.opt.mwhBasis; ST.opt = clone(DPE.DEF); ST.opt.unitBasis = ub; ST.opt.mwhBasis = mb; ST.dirty = true; }

  function srcGroup(si) {
    const o = ST.P.opt, code = S[si].code;
    for (const c of o.clubs) if (c.includes(code)) return c.join('+');
    if (o.club3p && S[si].type === '3P') return '3Ps';
    return code;
  }

  /* ------------------------------------------------------------ summary */
  function summary() {
    const P = ST.P, L = liveLines();
    const shipped = L.filter((l) => !l.held);
    const agg = (f) => { const a = { lines: 0, cases: 0, t: 0, v: 0, crit: 0, critT: 0 }; f.forEach((l) => { a.lines++; a.cases += l.cases; a.t += l.kg / 1000; a.v += lineVal(l) / 1e5; if (l.crit) { a.crit++; a.critT += l.kg / 1000; } }); return a; };
    const all = agg(shipped), held = agg(L.filter((l) => l.held));
    const tr = P.trucks;
    const cnt = (s) => tr.filter((t) => t.status === s).length;
    const ton = (s) => tr.filter((t) => t.status === s).reduce((a, t) => a + t.tonnes, 0);
    const bm = P.lines.filter((l) => l.belowMin && dOk(l.mi));
    const byLeg = [1, 2, 3].map((g) => ({ leg: g, ...agg(shipped.filter((l) => l.leg === g)), heldT: L.filter((l) => l.leg === g && l.held).reduce((x, l) => x + l.kg / 1000, 0) }));
    const bySrcMap = new Map();
    tr.forEach((t) => { let r = bySrcMap.get(t.src); if (!r) bySrcMap.set(t.src, r = { src: t.src, full: 0, pc: 0, ptl: 0, t: 0, ht: 0 });
      if (t.status === 'full') r.full++; else if (t.status === 'part-critical' || t.status === 'part-load') r.pc++; else if (t.status === 'PTL') r.ptl++;
      if (t.status === 'held') r.ht += t.tonnes; else r.t += t.tonnes; });
    const bySrc = [...bySrcMap.values()].sort((a, b) => b.t - a.t).map((r) => ({ ...r, name: six[r.src] != null ? S[six[r.src]].name : r.src }));
    const shortfalls = P.needs.filter((n) => n.crit && n.total - n.done > 1 && (!ST.div || P.X.keys[n.k].div === ST.div)).map((n) => {
      const K = P.X.keys[n.k], m = M[K.mats[0]];
      const idt = P.lines.filter((l) => l.leg === 3 && l.k === n.k && l.to === n.si && !l.off).reduce((a, l) => a + l.pcs, 0);
      return { n, K, short: n.total - n.done, cp: m.cp || 1, v: (n.total - n.done) * (m.rate || 0) / 1e5, idt, depot: sName(n.si) };
    }).sort((a, b) => b.v - a.v);
    return {
      all, held, byLeg, bySrc, shortfalls, validation: P.validation || [], belowMin: { lines: bm.length, cases: bm.reduce((a, l) => a + l.cases, 0) },
      trucks: { full: cnt('full'), fullT: ton('full'), part: cnt('part-critical') + cnt('part-load'), ptl: cnt('PTL'), partT: ton('part-critical') + ton('part-load') + ton('PTL'), held: cnt('held'), total: tr.filter((t) => t.status !== 'held').length },
    };
  }

  /* ---------------------------------------------------------- plan lines */
  function linesView(f) {
    const P = ST.P, q = (f.q || '').trim().toLowerCase();
    const froms = [...new Set(P.lines.map((l) => l.from))].sort((a, b) => (S[a].code < S[b].code ? -1 : 1));
    const tos = [...new Set(P.lines.map((l) => l.to))].sort((a, b) => (S[a].code < S[b].code ? -1 : 1));
    const L = P.lines.filter((l) => dOk(l.mi) && (!f.leg || l.leg === f.leg) && (f.from === '' || f.from == null || l.from === +f.from) && (f.to === '' || f.to == null || l.to === +f.to)
      && (!f.crit || l.crit) && (f.show === 'all' || (f.show === 'planned' ? !l.held && !l.off : f.show === 'held' ? l.held : l.off))
      && (!q || M[l.mi].code.includes(q) || M[l.mi].desc.toLowerCase().includes(q) || (l.reason || '').toLowerCase().includes(q)));
    L.sort((a, b) => a.leg - b.leg || S[a.from].code.localeCompare(S[b.from].code) || S[a.to].code.localeCompare(S[b.to].code) || b.crit - a.crit || a.tier - b.tier);
    const tot = L.reduce((a, l) => (a.c += l.off ? 0 : l.cases, a.kg += l.off ? 0 : l.kg, a.v += l.off ? 0 : lineVal(l), a), { c: 0, kg: 0, v: 0 });
    return { lines: L, froms, tos, tot };
  }
  function setCases(l, c) {
    const m = M[l.mi], cp = m.cp || 1;
    const pcs = l.inPcs ? Math.round(c * cp) : Math.round(c) * cp;
    l.pcs = pcs; l.cases = pcs / cp; l.kg = l.cases * (m.cw > 0 ? m.cw : ST.P.opt.defCaseKg); l.off = pcs === 0; l.edited = true;
  }
  /** Change one line's quantity in the DISPLAY unit (cases or pieces). */
  function editLine(l, v) { setCases(l, Math.max(0, +v || 0) / qf(l.mi)); retruck(); }
  function removeLine(l, off) { l.off = !!off; retruck(); }
  /** Returns an error message, or '' when added. */
  function addLine({ code, from, to, cases, crit }) {
    const P = ST.P, mi = mByCode[String(code).trim()];
    if (mi == null) return 'Material code not in the masters';
    const c = Math.round(+cases || 0);
    if (from === to || c <= 0 || from == null || to == null) return 'Choose two different sites and the cases';
    const m = M[mi], leg = isUnit(from) ? 1 : isMwh(from) ? 2 : 3;
    const lt = P.X.LT(from, to);
    P.lines.push({ id: P.lines.length, leg, k: P.X.keyOf[mi], mi, from, to, cases: c, cases0: c, pcs: c * (m.cp || 1), kg: c * (m.cw > 0 ? m.cw : P.opt.defCaseKg), a: lt == null ? P.opt.defaultLT : lt, tier: 0, crit: crit ? 1 : 0, reason: 'manual', manual: true });
    retruck();
    return '';
  }
  function setAlloc(leg, src, mi, to, want) {
    const P = ST.P;
    const ls = P.lines.filter((l) => !l.off && !l.held && !l.pass && l.leg === leg && l.from === src && l.mi === mi && l.to === to && l.cases > 0);
    let delta = want - ls.reduce((a, l) => a + l.cases, 0);
    if (Math.abs(delta) < 1e-9) return;
    if (delta > 0) {
      const l = ls.find((x) => !x.cb) || ls[0];
      if (l) { setCases(l, l.cases + delta); return; }
      const lt = P.X.LT(src, to);
      P.lines.push({ id: P.lines.length, leg, k: P.X.keyOf[mi], mi, from: src, to, cases: 0, cases0: 0, pcs: 0, kg: 0, a: lt == null ? P.opt.defaultLT : lt, tier: 0, crit: 0, reason: 'manual (sheet)', manual: true, inPcs: isPcsMat(mi) ? 1 : 0 });
      setCases(P.lines[P.lines.length - 1], delta);
      return;
    }
    ls.sort((a, b) => b.tier - a.tier || a.crit - b.crit || (b.cb || 0) - (a.cb || 0));
    for (const l of ls) { if (delta >= 0) break; const c = Math.max(0, l.cases + delta); delta += l.cases - c; setCases(l, c); }
  }
  /** Sheet cell edit: want is in the display unit. Returns the quantity the plan now holds (display unit). */
  function editSheetCell(leg, src, mi, to, want) {
    setAlloc(leg, src, mi, to, Math.max(0, +want || 0) / qf(mi));
    const got = qv(ST.P.lines.filter((l) => !l.off && !l.held && !l.pass && l.leg === leg && l.from === src && l.mi === mi && l.to === to).reduce((a, l) => a + l.cases, 0) * qf(mi));
    retruck();
    return got;
  }

  /* -------------------------------------------------------------- trucks */
  function trucksView(tf) {
    const P = ST.P;
    const byNo = new Map(); P.lines.forEach((l) => { if (l.truck != null && !l.off) { let a = byNo.get(l.truck); if (!a) byNo.set(l.truck, a = []); a.push(l); } });
    const srcs = [...new Set(P.trucks.map((t) => t.src))].sort();
    const hasDiv = new Set(), heldDiv = new Set();
    P.lines.forEach((l) => { if (l.off || !dOk(l.mi)) return; if (l.truck != null) hasDiv.add(l.truck); if (l.held) heldDiv.add(l.leg + '|' + l.to + '|' + srcGroup(l.from)); });
    const T = P.trucks.filter((t) => (!tf.src || t.src === tf.src) && (!tf.status || t.status === tf.status)
      && (!ST.div || (t.no != null ? hasDiv.has(t.no) : heldDiv.has(t.leg + '|' + t.to + '|' + t.src))));
    const ord = { full: 1, 'part-critical': 2, 'part-load': 3, PTL: 4, held: 5 };
    T.sort((a, b) => ord[a.status] - ord[b.status] || b.crit - a.crit || a.leg - b.leg || a.src.localeCompare(b.src) || S[a.to].code.localeCompare(S[b.to].code));
    const rows = T.map((t) => {
      const key = t.no != null ? 'T' + t.no : 'H' + t.leg + '|' + t.to + '|' + t.src;
      const ls = (t.no != null ? (byNo.get(t.no) || []) : P.lines.filter((l) => l.held && !l.off && l.leg === t.leg && l.to === t.to && srcGroup(l.from) === t.src)).filter((l) => dOk(l.mi));
      return { t, key, lines: ls.slice().sort((a, b) => b.crit - a.crit || a.tier - b.tier) };
    });
    return { rows, srcs };
  }

  /* ------------------------------------------------------------ arrivals */
  let shipCache = null;
  function shipments() {
    if (shipCache) return shipCache;
    const by = new Map(), sapGit = new Map();
    D.git.forEach(([mi, to, q]) => { if (to != null) sapGit.set(mi * 4096 + to, (sapGit.get(mi * 4096 + to) || 0) + q); });
    (D.ship || []).forEach((g, i) => {
      const [mi, from, to, q, post, age, key0, carrier, lr] = g;
      if (to == null) return;
      const key = key0 || ((from != null ? S[from].code : '?') + ' ' + dShort(post));
      const lt = from != null ? ST.P.X.LT(from, to) : null;
      const x = key + '|' + to;
      let s = by.get(x); if (!s) by.set(x, s = { key, from, to, post, lt, age, carrier: carrier || '', lr: lr || '', idx: [], cases: 0, kg: 0, inSap: 0, q: 0, mats: [] });
      s.idx.push(i); const m = M[mi]; const c = q / (m.cp || 1); s.cases += c; s.kg += c * (m.cw > 0 ? m.cw : 10);
      s.q += q; s.inSap += Math.min(q, sapGit.get(mi * 4096 + to) || 0); s.mats.push(mi);
      if (post && (!s.post || post < s.post)) s.post = post;
    });
    shipCache = [...by.values()].map((s) => (s.eta = s.post && s.lt != null ? addDays(s.post, s.lt) : '', s.sapPct = s.q ? s.inSap / s.q : 0, s));
    return shipCache;
  }
  function arrivalsView(af) {
    const X = ST.P.X;
    const all = shipments().filter((s) => (X.isDepot[s.to] || X.isMwh[s.to]) && s.mats.some(dOk));
    const tos = [...new Set(all.map((s) => s.to))].sort((a, b) => S[a].code.localeCompare(S[b].code));
    const q = (af.q || '').trim().toLowerCase();
    const rows = all.filter((s) => (af.to === '' || af.to == null || s.to === +af.to) && (!q || (s.key + ' ' + s.lr + ' ' + s.carrier).toLowerCase().includes(q)))
      .sort((a, b) => (a.eta || '').localeCompare(b.eta || '') || S[a.to].code.localeCompare(S[b.to].code));
    return { rows, tos, ticked: ticked() };
  }
  const isOn = (s) => s.idx.every((i) => ST.arrived.has(i));
  const ticked = () => new Set(shipments().filter(isOn).map((s) => s.key + '|' + s.to)).size;
  function tick(s, on) { s.idx.forEach((i) => (on ? ST.arrived.add(i) : ST.arrived.delete(i))); ST.dirty = true; }

  /* --------------------------------------------------------------- sheets */
  /** stock at a unit, in cases: SAP unrestricted / quality / tentative (uploaded unit stock is not part of the live feed) */
  function unitStock(si) {
    const by = new Map();
    D.stk.forEach(([mi, s2, unr, , qi]) => { if (s2 !== si) return; const cp = M[mi].cp || 1;
      let v = by.get(mi); if (!v) by.set(mi, v = [0, 0, 0]); v[0] += unr / cp; v[1] += qi / cp; });
    return { cols: ['UR Stock', 'QC Stock', 'Tentative'], by, src: 'sap' };
  }
  function alloc(si, leg, co, noPass) {
    const m = new Map(), held = new Map(), dests = new Set();
    ST.P.lines.forEach((l) => {
      if (l.off || !dOk(l.mi) || !(l.from === si || (co != null && l.from === co && l.cb)) || (leg && l.leg !== leg) || l.cases <= 0 || (noPass && l.pass)) return;
      if (l.held) { held.set(l.mi, (held.get(l.mi) || 0) + l.cases); return; }
      dests.add(l.to);
      let r = m.get(l.mi); if (!r) m.set(l.mi, r = new Map());
      const c = r.get(l.to) || { c: 0, crit: false, oo: false }; c.c += l.cases; c.crit = c.crit || !!l.crit; c.oo = c.oo || l.tier === 1; r.set(l.to, c);
    });
    return { m, held, dests };
  }
  function sources() {
    const s = new Set(); ST.P.lines.forEach((l) => { if (!l.off && l.cases > 0) s.add(l.from); });
    return [...s].sort((a, b) => srcKind(a) - srcKind(b) || S[a].code.localeCompare(S[b].code));
  }
  function sheetSources(leg) {
    if (leg === 1) return [...new Set(sources().filter((si) => srcKind(si) === 1).concat(S.map((s, i) => i).filter((i) => S[i].type === 'Unit' && D.stk.some((r) => r[1] === i))))]
      .sort((a, b) => (S[a].type === '3P') - (S[b].type === '3P') || S[a].code.localeCompare(S[b].code));
    return S.map((s, i) => i).filter((i) => ST.P.X.isMwh[i]);
  }

  function leg1Sheet(si) {
    const { m, held, dests } = alloc(si, 1);
    const stock = unitStock(si);
    const dcols = LEG1_COLS.map((c) => six[c]).filter((i) => i != null);
    S.forEach((s, i) => { if (dests.has(i) && !dcols.includes(i)) dcols.push(i); });
    const mats = new Set([...m.keys(), ...held.keys()]);
    stock.by.forEach((v, mi) => { if (v.some((x) => x > 0)) mats.add(mi); });
    const list = [...mats].filter(dOk).sort(keyOrder);
    const nS = stock.cols.length;
    const cTot = 4 + nS, cBal = cTot + 1, cD0 = cBal + 1, cAll = cD0 + dcols.length, cHeld = cAll + 1;
    const rows = [], colSum = new Array(cHeld + 1).fill(0), colKg = new Array(cHeld + 1).fill(0);
    list.forEach((mi) => {
      const mm = M[mi], r = new Array(cHeld + 1).fill(null), f = qf(mi);
      r[0] = codeVal(mm.code); r[1] = mm.desc; r[2] = mm.cp || null; r[3] = mm.cw || null;
      const sv = stock.by.get(mi) || [];
      let tot = 0; for (let j = 0; j < nS; j++) { const v = ST.unit === 'pcs' ? Math.round((sv[j] || 0) * f) : Math.round(sv[j] || 0); r[4 + j] = { v, s: 6 }; tot += v; }
      const am = m.get(mi) || new Map(); let all = 0;
      dcols.forEach((d, j) => { const a = am.get(d); if (a && a.c) { const v = qv(a.c * f); r[cD0 + j] = { v, s: a.crit ? 9 : a.oo ? 12 : 6, oo: a.oo }; all += v; } else r[cD0 + j] = { v: null, s: 6 }; });
      all = qv(all);
      r[cTot] = { v: tot, s: 8 }; r[cAll] = { v: all, s: 8 }; r[cBal] = { v: qv(tot - all), s: tot - all < -1e-9 ? 9 : 8 };
      r[cHeld] = { v: held.get(mi) ? qv(held.get(mi) * f) : null, s: 6 };
      for (let c = 4; c <= cHeld; c++) { const v = r[c] && typeof r[c] === 'object' ? r[c].v : r[c]; if (typeof v === 'number') { colSum[c] += v; colKg[c] += v / f * cw(mi); } }
      rows.push(r);
    });
    const r1 = new Array(cHeld + 1).fill(null), r2 = new Array(cHeld + 1).fill(null), r3 = new Array(cHeld + 1).fill(null);
    r1[2] = { v: ST.unit === 'pcs' ? 'Total Pcs' : 'Total Case', s: 10 }; r2[1] = { v: ddmmyyyy(D.meta.today), s: 4 }; r2[2] = { v: 'Wt in MT', s: 10 }; r3[2] = { v: 'Depot Code', s: 10 };
    for (let c = 4; c <= cHeld; c++) { r1[c] = { v: qv(colSum[c]), s: 8 }; r2[c] = { v: Math.round(colKg[c] / 100) / 10, s: 7 }; }
    dcols.forEach((d, j) => { r3[cD0 + j] = { v: S[d].code, s: 10 }; });
    const h = ['Material Code', 'Description', 'Case Pack', 'Wt/ Case'].concat(stock.cols, [' Total', 'Balance'], dcols.map((d) => S[d].name), ['Total Allocation', 'Held (waits for truck)']).map((v) => ({ v, s: 5 }));
    const widths = [11, 46, 9, 7].concat(stock.cols.map(() => 9), [8, 9], dcols.map(() => 8.5), [10, 10]);
    return { name: S[si].code, rows: [r1, r2, r3, h].concat(rows), widths, freeze: { row: 4, col: cD0 }, filter: 'A4:' + colIdx(cHeld) + (rows.length + 4), stockSrc: stock.src, meta: { hdr: 4, cD0, dcols, list, leg: 1, src: si } };
  }

  function leg2Sheet(wi) {
    const P = ST.P, X = P.X;
    const wname = S[wi].name.replace(/\s*MWH\s*$/i, '').trim().toLowerCase();
    const cbCode = (P.opt.callback || {})[S[wi].code];
    const co = cbCode != null && six[cbCode] != null ? six[cbCode] : S.findIndex((s, i) => X.isDepot[i] && s.mwh === S[wi].code && s.name.trim().toLowerCase() === wname);
    const { m, held, dests } = alloc(wi, 2, co >= 0 ? co : null, true);
    const fwd = new Map();
    P.lines.forEach((l) => { if (l.off || l.held || !l.pass || l.from !== wi || l.cases <= 0) return;
      let f = fwd.get(l.mi); if (!f) fwd.set(l.mi, f = { c: 0, to: [] }); f.c += l.cases; f.to.push(S[l.to].code + ' ' + fq(qty(l)) + ' (day ' + l.passDay + ')'); });
    const cb = new Map();
    P.lines.forEach((l) => { if (!l.off && !l.held && l.cb && l.from === wi) cb.set(l.mi, (cb.get(l.mi) || 0) + l.cases); });
    const dcols = S.map((s, i) => i).filter((i) => X.isDepot[i] && X.mwhOf[i] === wi);
    S.forEach((s, i) => { if (dests.has(i) && !dcols.includes(i)) dcols.push(i); });
    const arr = new Map(), l1in = new Map();
    (P.arrivedQ || new Map()).forEach((q, x) => { const mi = Math.floor(x / 4096); if (x % 4096 === wi) arr.set(mi, (arr.get(mi) || 0) + q / (M[mi].cp || 1)); });
    P.lines.forEach((l) => { if (!l.off && !l.held && l.leg === 1 && l.to === wi) l1in.set(l.mi, (l1in.get(l.mi) || 0) + l.cases); });
    const stk = (mi, si) => { const e = P.stk.get(mi * 4096 + si); return e ? e.q / (M[mi].cp || 1) : 0; };
    const mats = new Set([...m.keys(), ...held.keys(), ...arr.keys(), ...l1in.keys(), ...cb.keys(), ...fwd.keys()]);
    D.stk.forEach((r) => { if (r[1] === wi && r[2] > 0) mats.add(r[0]); });
    const list = [...mats].filter(dOk).sort(keyOrder);
    const cBal = 8, cD0 = 9, cTot = cD0 + dcols.length, cHeld = cTot + 1, cFw = cHeld + 1, cFwT = cFw + 1, cL1 = cFwT + 1;
    const sum = new Array(cL1 + 1).fill(0), kg = new Array(cL1 + 1).fill(0);
    const rows = list.map((mi) => {
      const mm = M[mi], r = new Array(cHeld + 1).fill(null), f = qf(mi);
      const Q = (x) => qv(x * f), K = (x) => x / f * cw(mi);
      const QS = (x) => (ST.unit === 'pcs' ? Math.round(x * f) : Math.round(x));
      const av = QS(arr.get(mi) || 0), ws = QS(stk(mi, wi)) - av, cs = co >= 0 ? QS(stk(mi, co)) : 0;
      r[0] = codeVal(X.keys[X.keyOf[mi]].key); r[1] = codeVal(mm.code); r[2] = mm.desc;
      const cq = Q(cb.get(mi) || 0);
      r[3] = { v: ws, s: 6 }; r[4] = { v: cs, s: 6 }; r[5] = { v: cq, s: 6 }; r[6] = { v: av, s: 6 }; r[7] = { v: qv(ws + cq + av), s: 8 };
      for (let c = 3; c <= 7; c++) { sum[c] += r[c].v; kg[c] += K(r[c].v); }
      const am = m.get(mi) || new Map(); let all = 0;
      dcols.forEach((d, j) => { const a = am.get(d); const v = a ? Q(a.c) : 0; r[cD0 + j] = { v, s: a && a.crit ? 9 : a && a.oo ? 12 : 6, oo: a && a.oo }; if (a) { all += v; sum[cD0 + j] += v; kg[cD0 + j] += K(v); } });
      all = qv(all);
      r[cTot] = { v: all, s: 8 }; sum[cTot] += all; kg[cTot] += K(all);
      const bal = qv(r[7].v - all);
      r[cBal] = { v: bal, s: bal < -1e-9 ? 9 : 8 }; sum[cBal] += bal; kg[cBal] += K(bal);
      const hv = Q(held.get(mi) || 0);
      r[cHeld] = { v: hv, s: 6 }; sum[cHeld] += hv; kg[cHeld] += K(hv);
      const fw = fwd.get(mi), fv = fw ? Q(fw.c) : 0;
      r[cFw] = { v: fv, s: 6 }; r[cFwT] = fw ? fw.to.join(', ') : '';
      sum[cFw] += fv; kg[cFw] += K(fv);
      const li = Q(l1in.get(mi) || 0);
      r[cL1] = { v: li, s: 6 }; sum[cL1] += li; kg[cL1] += K(li);
      return r;
    });
    const r1 = new Array(cL1 + 1).fill(null), r2 = new Array(cL1 + 1).fill(null);
    r1[2] = { v: 'Tonne-->', s: 4 }; r2[2] = { v: uLbl() + '-->', s: 4 };
    r1[1] = { v: ddmmyyyy(D.meta.today), s: 4 };
    for (let c = 3; c <= cL1; c++) { if (c === cFwT) continue; r1[c] = { v: Math.round(kg[c] / 100) / 10, s: 7 }; r2[c] = { v: qv(sum[c]), s: 8 }; }
    const h = ['Unique', 'M Code', 'SKU Description', S[wi].code, co >= 0 ? S[co].code : 'Depot', 'Req Callback', 'Arrival', 'Total RWH Stock', 'Balance']
      .concat(dcols.map((d) => S[d].code), ['Total ' + uLbl() + ' Planned', 'Held (waits for truck)', 'Forward on arrival (' + uLbl().toLowerCase() + ')', 'Forward to (depot ' + uLbl().toLowerCase() + ', day the incoming truck lands)', 'Raam Baan Leg 1 coming in (this plan)']).map((v) => ({ v, s: 5 }));
    const widths = [8, 11, 46, 10, 8, 8, 8, 10, 9].concat(dcols.map(() => 8), [10, 10, 10, 30, 11]);
    return { name: S[wi].code, rows: [r1, r2, h].concat(rows), widths, freeze: { row: 3, col: cD0 }, filter: 'A3:' + colIdx(cL1) + (rows.length + 3), meta: { hdr: 3, cD0, dcols, list, leg: 2, src: wi } };
  }
  const sheetFor = (leg, src) => (leg === 1 ? leg1Sheet(src) : leg2Sheet(src));

  /** Trucks per destination column + hover notes for the sheet view. */
  function sheetExtras(leg, src, dcols) {
    const P = ST.P, grp = srcGroup(src);
    const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
    const trk = dcols.map((d) => {
      const T = P.trucks.filter((t) => t.leg === leg && t.src === grp && t.to === d && t.later == null);
      const f = T.filter((t) => t.status === 'full'), pc = T.filter((t) => t.status === 'part-critical' || t.status === 'part-load'), ptl = T.filter((t) => t.status === 'PTL'), h = T.filter((t) => t.status === 'held');
      return { txt: [f.length ? f.map((t) => t.veh).join('+') + ' t' : '', pc.length ? pc.map((t) => t.veh + ' t part').join(' + ') : '', ptl.length ? 'PTL' : '', h.length ? 'held ' + f1(h.reduce((a, t) => a + t.tonnes, 0)) + ' t' : ''].filter(Boolean).join(' · '),
        crit: pc.length + ptl.length > 0, full: f.length > 0, held: h.length > 0 };
    });
    const why = new Map();
    P.lines.forEach((l) => { if (l.off || l.held || l.pass || !dOk(l.mi) || l.leg !== leg || l.from !== src || l.cases <= 0) return;
      const x = l.mi + '|' + l.to; const a = why.get(x) || []; a.push(l.cases + ' cs: ' + (TIER[l.tier] || '') + ' - ' + l.reason + (l.cb ? ' [stock from ' + S[l.cbFrom].code + ']' : '') + (l.truck != null ? ' [' + truckLabel(l) + ']' : '')); why.set(x, a); });
    return { trk, why };
  }

  /* -------------------------------------------------------------- exports */
  function stRow(l) {
    const t = l.truck != null ? truckOf(l.truck) || {} : {};
    return [codeVal(M[l.mi].code), M[l.mi].desc, S[l.from].code, S[l.to].code, Math.round(l.cases * 100) / 100, Math.round(l.pcs), l.inPcs ? 'PCS' : 'CASE', l.leg,
      truckLabel(l), t.veh == null ? '' : t.veh === 'PTL' ? 'PTL' : t.veh + ' MT', (t.status || (l.held ? 'held' : '')) + (l.pass ? ', on arrival day ' + l.passDay : ''), TIER[l.tier] || '',
      l.crit ? 'CRITICAL' : '', l.reason || '', Math.round(l.kg), l.a, l.via || ''];
  }
  const byTruck = (a, b) => (a.truck ?? 1e9) - (b.truck ?? 1e9) || b.crit - a.crit || a.tier - b.tier;
  function callbackRows(L) {
    const g = new Map();
    L.forEach((l) => { if (!l.cb || l.cbFrom == null || l.held || l.off || l.cases <= 0) return;
      const x = l.cbFrom + '|' + l.from + '|' + l.mi;
      let r = g.get(x); if (!r) g.set(x, r = { mi: l.mi, from: l.cbFrom, to: l.from, cases: 0, pcs: 0, inPcs: l.inPcs, kg: 0, tier: 9, crit: 0, dest: new Set() });
      r.cases += l.cases; r.pcs += l.pcs; r.kg += l.kg; r.tier = Math.min(r.tier, l.tier); r.crit = r.crit || l.crit; r.dest.add(S[l.to].code); });
    return [...g.values()].sort((a, b) => b.crit - a.crit || a.tier - b.tier);
  }
  function stSheet(name, L) {
    const d = L.filter((l) => !l.held).sort(byTruck);
    const cb = callbackRows(L);
    const cbRows = cb.map((r) => [codeVal(M[r.mi].code), M[r.mi].desc, S[r.from].code, S[r.to].code, Math.round(r.cases * 100) / 100, Math.round(r.pcs), r.inPcs ? 'PCS' : 'CASE', 2, 'same site', '', 'callback step 1',
      TIER[r.tier] || '', r.crit ? 'CRITICAL' : '', 'Callback step 1: ' + S[r.from].code + ' to ' + S[r.to].code + ' for ' + [...r.dest].join(', '), Math.round(r.kg), 0, [...r.dest].join(', ')]);
    const rows = cbRows.concat(d.map((l) => { const r = stRow(l); if (l.cb) r[10] = (r[10] ? r[10] + ', ' : '') + 'callback step 2'; return r; }));
    return { name, head: ST_HEAD, rows, style: cb.map((r) => (r.crit ? 2 : r.tier === 1 ? 11 : 0)).concat(d.map((l) => (l.crit ? 2 : l.tier === 1 ? 11 : 0))), widths: ST_W };
  }
  function stockTransferExport() {
    const P = ST.P, L = liveLines();
    const tr = P.trucks.filter((t) => t.no != null && L.some((l) => l.truck === t.no));
    const sheets = [stSheet('Stock transfer', L),
      { name: 'Trucks', head: ['Truck No', 'Status', 'Leg', 'From', 'To', 'To name', 'Vehicle', 'Tonnes', 'Fill %', 'Lines', 'Cases', 'Critical lines'],
        rows: tr.map((t) => { const ls = L.filter((l) => l.truck === t.no);
          return ['T' + String(t.no + 1).padStart(3, '0'), t.status + (t.later != null ? ' (after leg-1 lands, day ' + t.later + ')' : ''), t.leg, t.src, S[t.to].code, S[t.to].name, t.veh === 'PTL' ? 'PTL' : t.veh + ' MT', t.tonnes, t.fill == null ? '' : Math.round(t.fill * 100), ls.length, ls.reduce((a, l) => a + l.cases, 0), ls.filter((l) => l.crit).length]; }),
        style: tr.map((t) => (t.crit ? 2 : 0)), widths: [9, 13, 5, 11, 8, 18, 9, 8, 7, 7, 8, 12] },
      { name: 'Held', head: ST_HEAD, rows: L.filter((l) => l.held).map(stRow), style: L.filter((l) => l.held).map(() => 3), widths: ST_W }];
    return { name: 'Stock transfer plan ' + divTag() + D.meta.today + '.xlsx', sheets };
  }
  function legExport(leg) {
    const src = sources().filter((si) => srcKind(si) === leg);
    const sheets = src.map((si) => sheetFor(leg, si)).filter((sh) => sh.rows.length > sh.meta.hdr);
    sheets.push(stSheet('Stock transfer', liveLines().filter((l) => l.leg === leg)));
    return { name: (leg === 1 ? 'Raam Baan Leg 1 plan (units) ' : 'Raam Baan Leg 2 plan (MWH) ') + divTag() + D.meta.today + '.xlsx', sheets };
  }
  function pinakaExport() {
    const L = liveLines().filter((l) => l.leg === 3);
    const lanes = new Map();
    L.forEach((l) => { if (l.held) return; const x = l.from + '>' + l.to; let r = lanes.get(x);
      if (!r) lanes.set(x, r = { from: l.from, to: l.to, n: 0, c: 0, kg: 0, crit: 0 });
      r.n++; r.c += l.cases; r.kg += l.kg; r.crit += l.crit ? 1 : 0; });
    const lr = [...lanes.values()].sort((a, b) => S[a.from].code.localeCompare(S[b.from].code) || b.kg - a.kg);
    const V = ST.P.validation || [];
    const sheets = [stSheet('Pinaka', L),
      { name: 'By lane', head: ['From', 'From name', 'To', 'To name', 'Lines', 'Cases', 'Tonnes', 'Critical lines', 'Transit days'],
        rows: lr.map((r) => [S[r.from].code, S[r.from].name, S[r.to].code, S[r.to].name, r.n, r.c, Math.round(r.kg / 100) / 10, r.crit, ST.P.X.LT(r.from, r.to) ?? '']),
        style: lr.map((r) => (r.crit ? 2 : 0)), widths: [8, 16, 8, 16, 7, 8, 8, 11, 10] },
      { name: 'Checks', head: ['Check', 'Result', 'Detail'], rows: V.map((v) => [v.check, v.result, v.detail]), style: V.map((v) => (v.result === 'PASS' ? 0 : 2)), widths: [80, 8, 60] }];
    return { name: 'Pinaka inter-depot plan ' + divTag() + D.meta.today + '.xlsx', sheets };
  }
  function sourceExport(v) {
    if (v === 'all') {
      const sheets = [];
      sources().forEach((si) => { const k = srcKind(si); const sh = k === 1 ? leg1Sheet(si) : k === 2 ? leg2Sheet(si) : null; if (sh && sh.rows.length > sh.meta.hdr) sheets.push(sh); });
      sheets.push(stSheet('Pinaka', liveLines().filter((l) => l.leg === 3)));
      sheets.push(stSheet('Stock transfer', liveLines()));
      return { name: 'Distribution plan all sources ' + divTag() + D.meta.today + '.xlsx', sheets };
    }
    if (v === 'idt') return { name: 'Pinaka inter-depot plan ' + divTag() + D.meta.today + '.xlsx', sheets: [stSheet('Pinaka', liveLines().filter((l) => l.leg === 3))] };
    const si = +v, k = srcKind(si);
    const L = ST.P.lines.filter((l) => !l.off && dOk(l.mi) && l.from === si && l.cases > 0);
    const sheets = [];
    if (k === 1) sheets.push(leg1Sheet(si)); else if (k === 2) sheets.push(leg2Sheet(si));
    sheets.push(stSheet(k === 3 ? S[si].code + ' IDT' : S[si].code + ' transfer', L));
    return { name: 'Distribution plan ' + S[si].code + ' ' + S[si].name + ' ' + divTag() + D.meta.today + '.xlsx', sheets };
  }
  function sheetExport(leg, src) {
    const L = ST.P.lines.filter((l) => !l.off && dOk(l.mi) && l.from === src && l.leg === leg && l.cases > 0);
    return { name: 'Raam Baan Leg ' + leg + ' plan ' + S[src].code + ' ' + S[src].name + ' ' + divTag() + D.meta.today + '.xlsx', sheets: [sheetFor(leg, src), stSheet(S[src].code + ' transfer', L)] };
  }

  /* number formatting shared with the sheet text cells */
  const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }), nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
  function fq(x) { return x == null || !isFinite(x) ? '' : Number.isInteger(Math.round(x * 100) / 100) ? nf0.format(Math.round(x)) : nf2.format(x); }

  return {
    D, DPE, ST, S, M, six, mByCode, runPlan, retruck, restoreDefaults, sName, isUnit, isMwh, srcKind, dOk, qf, qv, qty, uLbl, isPcsMat, lineVal, truckLabel, truckOf, liveLines, srcGroup,
    summary, linesView, editLine, removeLine, addLine, setAlloc, editSheetCell, trucksView, shipments, arrivalsView, isOn, ticked, tick,
    sheetSources, sheetFor, sheetExtras, sources, stSheet, stockTransferExport, legExport, pinakaExport, sourceExport, sheetExport, fq,
  };
}
