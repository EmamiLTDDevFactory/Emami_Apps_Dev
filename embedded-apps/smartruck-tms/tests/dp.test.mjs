import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createSession } from '../src/lib/dpModel.js';
import { parseForecast, parseCsvText, applyForecast, channelName } from '../src/lib/dpForecast.js';
import { diffDatasets, diffPlans, diffSheets } from '../src/lib/dpDiff.js';

const require = createRequire(import.meta.url);
const DPE = require('../src/lib/dpEngine.js');
const DPX = require('../src/lib/dpXlsx.js');
const D = JSON.parse(fs.readFileSync(new URL('../public/dp-demo.json', import.meta.url), 'utf8'));
const fresh = () => JSON.parse(JSON.stringify(D));

test('engine copies are byte-identical (frontend, backend) and unchanged in shape', () => {
  const a = fs.readFileSync(new URL('../src/lib/dpEngine.js', import.meta.url));
  const b = fs.readFileSync(new URL('../../../backend/tmsDpEngine.js', import.meta.url));
  assert.ok(a.equals(b), 'src/lib/dpEngine.js and backend/tmsDpEngine.js differ');
  assert.equal(typeof DPE.plan, 'function'); assert.equal(typeof DPE.buildTrucks, 'function'); assert.ok(DPE.DEF.trucks);
});

test('demo sample: loads, every table index is valid, plans', () => {
  assert.ok(D.mats.length >= 30 && D.sites.length > 50);
  for (const t of ['stk', 'lots', 'git', 'sto', 'fc', 'afc', 'sale', 'trend', 'oo', 'prod']) for (const r of D[t]) { assert.ok(D.mats[r[0]], t + ' material index'); }
  const P = DPE.plan(D, {}, { uploads: [], arrived: [] });
  assert.ok(P.lines.length > 100 && P.trucks.length > 10);
});

test('session plans exactly like the raw engine (same lines, same trucks)', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const raw = DPE.plan(fresh(), {}, { uploads: [], arrived: [] });
  assert.equal(S.ST.P.lines.length, raw.lines.length);
  assert.equal(S.ST.P.trucks.length, raw.trucks.length);
  assert.deepEqual(S.ST.P.lines.map((l) => [l.leg, l.mi, l.from, l.to, l.pcs]), raw.lines.map((l) => [l.leg, l.mi, l.from, l.to, l.pcs]));
});

test('summary: totals add up and agree with the lines and trucks', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const sm = S.summary(), L = S.liveLines();
  assert.equal(sm.all.lines + sm.held.lines, L.length);
  assert.equal(sm.byLeg.reduce((a, l) => a + l.lines, 0), sm.all.lines);
  assert.equal(sm.trucks.full + sm.trucks.part + sm.trucks.ptl, S.ST.P.trucks.filter((t) => t.status !== 'held').length);
  const t = sm.byLeg.reduce((a, l) => a + l.t, 0); assert.ok(Math.abs(t - sm.all.t) < 1e-6);
});

test('division filter and cases / pieces switch', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const all = S.liveLines().length; S.ST.div = 'HCD';
  const h = S.liveLines(); assert.ok(h.length < all && h.every((l) => S.M[l.mi].div === 'HCD'));
  S.ST.div = ''; const l = S.liveLines().find((x) => S.M[x.mi].cp > 1);
  const cs = S.qty(l); S.ST.unit = 'pcs'; assert.equal(S.qty(l), Math.round(l.cases * S.M[l.mi].cp)); assert.ok(S.qty(l) >= cs);
});

test('edit a line, remove a line, add a line: trucks rebuild', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const l = S.liveLines().find((x) => x.leg === 2 && x.cases >= 2 && !x.held);
  const before = S.ST.P.trucks.reduce((a, t) => a + t.tonnes, 0);
  S.editLine(l, l.cases * S.qf(l.mi) + 5);
  assert.ok(S.ST.P.trucks.reduce((a, t) => a + t.tonnes, 0) > before, 'tonnes grow with the edit');
  S.removeLine(l, true); assert.ok(l.off);
  assert.equal(S.addLine({ code: 'nope', from: 0, to: 1, cases: 1 }), 'Material code not in the masters');
  assert.match(S.addLine({ code: S.M[0].code, from: 1, to: 1, cases: 1 }), /different sites/);
  const n = S.ST.P.lines.length; const from = S.six.UN13, to = S.six.DP59;
  assert.equal(S.addLine({ code: S.M[0].code, from, to, cases: 3, crit: true }), ''); assert.equal(S.ST.P.lines.length, n + 1);
  assert.equal(S.ST.P.lines[n].leg, 1); assert.equal(S.ST.P.lines[n].manual, true);
});

test('leg 1 / leg 2 sheets: DP.xlsx layout, cell edit goes back to the plan', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const hasPlan = (sh) => sh.rows.slice(4).some((row) => row.slice(sh.meta.cD0, sh.meta.cD0 + sh.meta.dcols.length).some((c) => c && +c.v > 0));
  const un = S.sheetSources(1).find((si) => hasPlan(S.sheetFor(1, si)));
  assert.ok(un != null, 'a unit with a leg-1 plan in the sample');
  const s1 = S.sheetFor(1, un);
  assert.equal(s1.meta.hdr, 4); assert.equal(s1.rows[3][0].v, 'Material Code'); assert.equal(s1.freeze.row, 4);
  const mw = S.sheetSources(2).find((si) => S.sheetFor(2, si).rows.length > 4);
  const s2 = S.sheetFor(2, mw);
  assert.equal(s2.meta.hdr, 3); assert.equal(s2.rows[2][0].v, 'Unique'); assert.ok(s2.rows[2].some((c) => c && c.v === 'Total RWH Stock'));
  const r = s1.rows.slice(4).find((row) => row.slice(s1.meta.cD0, s1.meta.cD0 + s1.meta.dcols.length).some((c) => c && +c.v > 0));
  const mi = s1.meta.list[s1.rows.slice(4).indexOf(r)], c = r.slice(s1.meta.cD0).findIndex((x) => x && +x.v > 0), to = s1.meta.dcols[c];
  const cur = r[s1.meta.cD0 + c].v;
  const got = S.editSheetCell(1, un, mi, to, cur + S.M[mi].cp * 0 + 4);
  assert.ok(got >= cur, 'quantity moved up');
  const again = S.sheetFor(1, un); const row2 = again.rows.slice(4)[again.meta.list.indexOf(mi)];
  assert.equal(row2[again.meta.cD0 + c].v, got);
});

test('exports: every format builds a workbook that dpXlsx can write', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const ex = [S.stockTransferExport(), S.legExport(1), S.legExport(2), S.pinakaExport(), S.sourceExport('all'), S.sourceExport('idt'), S.sourceExport(String(S.sources()[0])), S.sheetExport(1, S.sheetSources(1)[0])];
  for (const e of ex) { assert.match(e.name, /\.xlsx$/); assert.ok(e.sheets.length >= 1); }
  const st = ex[0].sheets[0]; assert.equal(st.head[0], 'Material'); assert.equal(st.head.length, 17);
  assert.ok(st.rows.length >= S.liveLines().filter((l) => !l.held).length, 'one row per dispatched line (+ callback step 1 rows)');
  assert.ok(DPX.writeXlsx(ex[0].sheets).size > 1000);
});

test('arrivals: ticking a vehicle marks it, planning on arrival works', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const v = S.arrivalsView({ to: '', q: '' });
  assert.ok(v.rows.length > 0, 'vehicles on the road in the sample');
  S.tick(v.rows[0], true); assert.ok(S.isOn(v.rows[0])); assert.equal(S.ST.dirty, true);
  S.ST.opt.arrivalOnly = true; S.runPlan(); assert.equal(S.ST.dirty, false);
  S.tick(v.rows[0], false); assert.ok(!S.isOn(v.rows[0]));
});

test('trucks view and lines view filters', () => {
  const S = createSession(fresh(), DPE); S.runPlan();
  const tv = S.trucksView({ src: '', status: 'full' }); assert.ok(tv.rows.every((r) => r.t.status === 'full'));
  const lv = S.linesView({ leg: 3, show: 'planned', from: '', to: '', crit: false, q: '' }); assert.ok(lv.lines.every((l) => l.leg === 3 && !l.held && !l.off));
  const q = S.linesView({ leg: 0, show: 'all', from: '', to: '', crit: false, q: S.M[0].code }); assert.ok(q.lines.every((l) => l.mi === 0 || S.M[l.mi].desc.toLowerCase().includes(S.M[0].code) || (l.reason || '').includes(S.M[0].code)));
});

/* ---------------------------------------------------------------- forecast */
test('forecast: Trip Trail layout, aggregation and channel names', () => {
  const r = parseForecast([['Material', 'Plant', 'Channel', 'M0', 'M1', 'Additional'], ['400001152', 'DP59', 'GT', 100, 50, 0], ['400001152', 'DP59 Delhi', '30', '20', '10', '5'], ['400001152', 'DP59', 'GT', 1, 1, 1], ['', 'DP59', 'GT', 1, 1, 1], ['abc', 'DP59', 'GT', 1, 0, 0]]);
  assert.equal(r.format, 'Trip Trail layout');
  assert.deepEqual(r.rows.find((x) => x.channel === 'GT'), { material: '400001152', plant: 'DP59', channel: 'GT', m0: 101, m1: 51, additional: 1 });
  assert.deepEqual(r.rows.find((x) => x.channel === 'MT'), { material: '400001152', plant: 'DP59', channel: 'MT', m0: 20, m1: 10, additional: 5 });
  assert.equal(r.skipped, 2);
  assert.equal(channelName('57'), 'Ecom'); assert.equal(channelName('Zepto'), 'GT'); assert.equal(channelName('ECOM-X'), 'Ecom'); assert.equal(channelName(''), 'GT');
});
test('forecast: CCD and HCD console Fcast columns, title rows above the header', () => {
  const ccd = parseForecast([['report'], ['Item code', 'Site', 'Firm FC-GT', 'Firm FC-MT', 'Tent FC-GT', 'Tent FC-MT', 'Channel'], [400001152, 'DP59', 10, 5, 4, 2, '10']]);
  assert.equal(ccd.format, 'CCD console Fcast'); assert.deepEqual(ccd.rows[0], { material: '400001152', plant: 'DP59', channel: 'GT', m0: 15, m1: 6, additional: 0 });
  const hcd = parseForecast([['Item', 'Plant', 'M0 Saleable', 'M0 Free', 'M1 Saleable', 'M1 Free', 'Channel'], ['400009', 'dp12', 7, 3, 2, 1, 'MT']]);
  assert.equal(hcd.format, 'HCD console Fcast'); assert.deepEqual(hcd.rows[0], { material: '400009', plant: 'DP12', channel: 'MT', m0: 10, m1: 3, additional: 0 });
  assert.match(parseForecast([['a', 'b']]).warnings[0], /No header row/);
});
test('forecast: csv text and applying it to a dataset', () => {
  const rows = parseCsvText('Material,Plant,Channel,M0,M1,Additional\r\n"' + D.mats[0].code + '","DP59","GT",120,60,0\r\n999,DP59,GT,5,5,0\r\n' + D.mats[1].code + ',ZZ99,GT,1,1,0\r\n');
  assert.equal(rows.length, 4);
  const f = parseForecast(rows); assert.equal(f.rows.length, 3);
  const { D: D2, missing } = applyForecast(fresh(), f.rows);
  assert.deepEqual(missing.materials, ['999']); assert.deepEqual(missing.plants, ['ZZ99']);
  assert.equal(D2.fc.length, 1); assert.deepEqual(D2.fc[0].slice(3), [120, 60]); assert.equal(D2.meta.forecast.rows, 3);
  const S = createSession(D2, DPE); S.runPlan(); assert.ok(S.ST.P.lines.length >= 0);
});

/* -------------------------------------------------------------------- diff */
test('diff: identical datasets and plans have no differences', () => {
  const inp = diffDatasets(fresh(), fresh());
  assert.ok(inp.tables.every((t) => t.onlyA === 0 && t.onlyB === 0 && t.differ === 0 && t.top.length === 0));
  const A = createSession(fresh(), DPE), B = createSession(fresh(), DPE); A.runPlan(); B.runPlan();
  const out = diffPlans(A, B);
  assert.equal(out.counts.diffLines, 0); assert.equal(out.trucks.a.total, out.trucks.b.total); assert.equal(out.depots.length, 0);
});
test('diff: a changed stock row, a dropped open order and a different plan are reported', () => {
  const B = fresh();
  B.stk[0][2] += 777; const dropped = B.oo.shift(); B.sale.push([B.stk[0][0], B.stk[0][1], 'GT', 4242]);
  const inp = diffDatasets(fresh(), B);
  const stk = inp.tables.find((t) => t.name === 'stk'), oo = inp.tables.find((t) => t.name === 'oo'), sale = inp.tables.find((t) => t.name === 'sale');
  assert.equal(stk.differ, 1); assert.equal(stk.top[0].delta[0], 777);
  assert.equal(oo.onlyA, 1); assert.equal(oo.top[0].side, 'A only'); assert.ok(dropped);
  assert.ok(sale.onlyB === 1 || sale.differ === 1);
  const A = createSession(fresh(), DPE), Bs = createSession(B, DPE); A.runPlan(); Bs.runPlan();
  const out = diffPlans(A, Bs);
  assert.ok(out.counts.diffLines > 0, 'removing an open order changes the plan');
  assert.ok(out.lines.length <= 100 && out.lines.every((l, i, a) => i === 0 || Math.abs(a[i - 1].kg) >= Math.abs(l.kg)));
  const sheets = diffSheets(inp, out); assert.equal(sheets.length, 5); assert.ok(DPX.writeXlsx(sheets).size > 500);
});
