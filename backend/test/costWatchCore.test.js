const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../costWatchCore');

const row = (o) => ({ Hwerks: '1000', Headmat: 'FG1', Headtxt: 'Oil', Haschild: '', Idnrk: 'A', Maktx: 'Paraffin', Mtart: 'ROH', Meins: 'KG', ProdQty: '1', SelSource: 'CONTRACT', SelRatePcLoc: '10', FrtPcLoc: '1', SelFxInr: '1', TotCostPcInr: '11', LocCurr: 'INR', ...o });
const snap = (rows, qty = 1) => C.buildSnapshots(rows, { system: 'NGQ', qty, prio: ['CONTRACT'], lookback: 365 })[0];
const base = () => [row({}), row({ Idnrk: 'B', ProdQty: '2', SelRatePcLoc: '5', FrtPcLoc: '0', TotCostPcInr: '5' }), row({ Idnrk: 'C', ProdQty: '1', SelRatePcLoc: '3', FrtPcLoc: '0', TotCostPcInr: '3', SelSource: 'INFOREC' })];
const rules = (prevRows, curRows, extra = {}) => C.evaluateRules({ prev: prevRows ? snap(prevRows) : null, cur: snap(curRows), ...extra });
const ids = (as) => as.map((a) => a.rule);

test('filter: same literals as the app (decimal m, booleans, quoted budget year, or-lists, no +)', () => {
  const f = C.costLineFilter(['fg1', 'FG2'], '1000', 1000, { prio: ['CONTRACT', 'INFOREC'], lookback: 730, donor: '1100', inclBudget: true, budgetYr: 2026 });
  assert.match(f, /^Mode eq 'B' and \(Matnr eq 'FG1' or Matnr eq 'FG2'\) and Werks eq '1000' and ExplQty eq 1000m/);
  assert.match(f, /Lookback eq 730 and Prio eq 'CONTRACT,INFOREC' and DonorPlant eq '1100' and InclFrt eq true and StdFrt eq false and InclBudget eq true and BudgetYr eq '2026'/);
  assert.ok(!C.queryString({ $filter: f }).includes('+'));
  assert.throws(() => C.costLineFilter([], '1000', 1));
});

test('snapshot: leaf rows only, q = ProdQty / qty, total = sum q * p_inr', () => {
  const s = C.buildSnapshots([...base(), row({ Idnrk: 'P', Haschild: 'X' })], { system: 'NGQ', qty: 1 })[0];
  assert.equal(s.line_count, 3);
  assert.equal(s.total_per_unit, '24.000000'); // 11 + 2*5 + 3
  const dup = C.buildSnapshots([row({}), row({ TotCostPcInr: '21', SelRatePcLoc: '20' })], { system: 'NGQ', qty: 2 })[0];
  assert.equal(dup.lines[0].q, '1.000000000'); // (1 + 1) / 2
  assert.equal(dup.lines[0].p_inr, '16.000000');
});

test('R1: cost per piece moved > 2 % vs yesterday', () => {
  const a = rules(base(), [row({ TotCostPcInr: '12', SelRatePcLoc: '11' }), ...base().slice(1)]);
  assert.ok(ids(a).includes('R1'));
  assert.ok(!ids(rules(base(), base())).includes('R1'));
});
test('R1: > 5 % vs 30 days even when yesterday is flat', () => {
  const d30 = snap([row({ TotCostPcInr: '9' }), ...base().slice(1)]);
  const a = C.evaluateRules({ prev: snap(base()), cur: snap(base()), d30 });
  assert.ok(ids(a).includes('R1'));
});
test('R2: component rate > 10 % and share >= 0.5 %', () => {
  const a = rules(base(), [row({}), row({ Idnrk: 'B', ProdQty: '2', SelRatePcLoc: '6', FrtPcLoc: '0', TotCostPcInr: '6' }), base()[2]]);
  assert.deepEqual(a.filter((x) => x.rule === 'R2').map((x) => x.idnrk), ['B']);
});
test('R3: rate source got worse (CONTRACT to MBEW, any to none)', () => {
  const a = rules(base(), [row({ SelSource: 'MBEW' }), ...base().slice(1)]);
  assert.ok(a.some((x) => x.rule === 'R3' && x.idnrk === 'A'));
  const b = rules(base(), [row({ SelSource: '' }), ...base().slice(1)]);
  assert.ok(b.some((x) => x.rule === 'R3' && x.evidence.after === 'none'));
});
test('R4: no rate / MBEW only for a component above 1 % of the cost', () => {
  const a = rules(null, [row({ SelSource: 'MBEW' }), ...base().slice(1)]);
  assert.ok(a.some((x) => x.rule === 'R4' && x.direction === 'mbew only'));
});
test('R5: freight per piece jump > 25 %', () => {
  const a = rules(base(), [row({ FrtPcLoc: '1.5', TotCostPcInr: '11.5' }), ...base().slice(1)]);
  assert.ok(a.some((x) => x.rule === 'R5'));
});
test('R6: FX factor moved > 1 % on a non-INR plant', () => {
  const p = [row({ LocCurr: 'BDT', SelFxInr: '0.70' }), ...base().slice(1)];
  const c = [row({ LocCurr: 'BDT', SelFxInr: '0.72' }), ...base().slice(1)];
  assert.ok(rules(p, c).some((x) => x.rule === 'R6' && x.evidence.currency === 'BDT'));
});
test('R7: component added / removed / quantity per piece > 5 %', () => {
  const a = rules(base(), [...base(), row({ Idnrk: 'D' })]);
  assert.ok(a.some((x) => x.rule === 'R7' && x.direction === 'added'));
  assert.ok(rules(base(), base().slice(0, 2)).some((x) => x.rule === 'R7' && x.direction === 'removed'));
  assert.ok(rules(base(), [row({ ProdQty: '1.1' }), ...base().slice(1)]).some((x) => x.rule === 'R7' && x.direction === 'qty up'));
});
test('R8: low cover on a high-cost component', () => {
  assert.ok(rules(null, [row({ CovH1: '7' }), ...base().slice(1)]).some((x) => x.rule === 'R8'));
  assert.ok(!rules(null, [row({ CovH1: '999' }), ...base().slice(1)]).some((x) => x.rule === 'R8'));
});
test('R9: new plan check errors', () => {
  const a = C.evaluateRules({ prev: null, cur: snap(base()), checks: { prev: [{ Kind: 'NOBOM', Matnr: 'FG1', Werks: '1000', Comp: '' }], cur: [{ Kind: 'NOBOM', Matnr: 'FG1', Werks: '1000', Comp: '' }, { Kind: 'MULTIVER', Matnr: 'FG1', Werks: '1000', Comp: '', Msg: 'Multiple production versions' }] } });
  assert.deepEqual(a.filter((x) => x.rule === 'R9').map((x) => x.evidence.kind), ['MULTIVER']);
});
test('severity by rupee impact (change per piece x volume)', () => {
  assert.equal(C.severity(60000, C.DEFAULT_THRESHOLDS), 'high');
  assert.equal(C.severity(-6000, C.DEFAULT_THRESHOLDS), 'medium');
  assert.equal(C.severity(10, C.DEFAULT_THRESHOLDS), 'low');
  const a = rules(base(), [row({ TotCostPcInr: '12', SelRatePcLoc: '11' }), ...base().slice(1)], { volume: 100000 });
  assert.equal(a.find((x) => x.rule === 'R1').impact_inr, 100000);
});
test('dedup: not repeated for 7 days unless 25 % worse; snoozed is silent', () => {
  const now = new Date('2026-10-20T06:00:00Z');
  const ex = { status: 'open', last_notified_at: '2026-10-18T06:00:00Z', last_notified_impact: 1000 };
  assert.equal(C.shouldNotify(null, { impact_inr: 1 }, now), true);
  assert.equal(C.shouldNotify(ex, { impact_inr: 1100 }, now), false);
  assert.equal(C.shouldNotify(ex, { impact_inr: 1250 }, now), true);
  assert.equal(C.shouldNotify({ ...ex, last_notified_at: '2026-10-10T06:00:00Z' }, { impact_inr: 1000 }, now), true);
  assert.equal(C.shouldNotify({ status: 'snoozed', snooze_until: '2026-10-25T00:00:00Z' }, { impact_inr: 99999 }, now), false);
  assert.equal(C.fingerprint({ rule: 'R2', sku: 'FG1', plant: '1000', idnrk: 'B', direction: 'up' }), 'R2|FG1|1000|B|up');
});
test('signed links: valid, tampered, expired', () => {
  const t = C.signLink('s3cret', { a: 'ack', id: 'x' });
  assert.equal(C.verifyLink('s3cret', t).id, 'x');
  assert.equal(C.verifyLink('other', t), null);
  assert.equal(C.verifyLink('s3cret', `${t}x`), null);
  assert.equal(C.verifyLink('s3cret', C.signLink('s3cret', { id: 'y' }, -1)), null);
});
test('digest: subject counts, template passes the numbers rule, invented numbers fail', () => {
  const alerts = [{ rule: 'R1', sku: 'FG1', plant: '1000', idnrk: '', severity: 'high', impact_inr: 60000.4 }, { rule: 'R2', sku: 'FG1', plant: '1000', idnrk: 'B', severity: 'medium', impact_inr: 6000 }];
  assert.equal(C.digestSubject('23 Oct 2026', alerts), 'Cost watch - 23 Oct 2026: 1 high, 1 medium');
  const { facts, template } = C.digestFacts(alerts);
  assert.equal(C.validateNumbers(template, [], facts).ok, true);
  assert.equal(C.validateNumbers('Impact 7,000 INR [F1].', [], facts).ok, false);
  assert.equal(C.digestFacts([]).template, 'No change above the thresholds.');
});
test('replay: 30 days, alerts only on the event days, nothing on quiet days', () => {
  let rowsOf = (d) => {
    const r = base();
    if (d >= 10) r[1] = row({ Idnrk: 'B', ProdQty: '2', SelRatePcLoc: '6', FrtPcLoc: '0', TotCostPcInr: '6' }); // day 10: rate up 20 %
    if (d >= 20) r[0] = row({ SelSource: 'MBEW' }); // day 20: source worse
    return r;
  };
  const events = {};
  let prev = null;
  for (let d = 1; d <= 30; d++) {
    const cur = snap(rowsOf(d));
    const a = C.evaluateRules({ prev, cur }).filter((x) => x.rule !== 'R4'); // R4 is a standing condition
    if (a.length) events[d] = [...new Set(a.map((x) => x.rule))].sort();
    prev = cur;
  }
  assert.deepEqual(Object.keys(events).map(Number), [10, 20]);
  assert.ok(events[10].includes('R2'));
  assert.ok(events[20].includes('R3'));
});

test('Consumption / MBEW lines: SAP freight is not counted (rate already includes it)', () => {
  const s = snap([row({ SelSource: 'MBEW', SelRatePcLoc: '104.54', FrtPcLoc: '10', FrtPcInr: '10', TotCostPcInr: '114.54' }), row({ Idnrk: 'B' })]);
  const mbew = s.lines.find((l) => l.idnrk === 'A');
  assert.equal(mbew.f_loc, '0.000000');
  assert.equal(mbew.p_inr, '104.540000');
  assert.equal(s.lines.find((l) => l.idnrk === 'B').p_inr, '11.000000'); // a contract line keeps its freight
  assert.equal(C.freightIncluded('consump'), true);
  assert.equal(C.freightIncluded('INFOREC'), false);
});

test('R10: a statistical outlier against the last 30 days (needs 8 snapshots, a real spread, and no R1)', () => {
  const hist = ['100.0', '100.2', '99.9', '100.1', '100.0', '99.8', '100.2', '100.1', '99.9', '100.0'];
  const cur = base(); // cost per piece of the base snapshot
  const mk = (total) => ({ ...snap(base()), total_per_unit: total });
  const flat = C.evaluateRules({ prev: snap(base()), cur: mk('100.05'), history30: hist });
  assert.ok(!flat.some((a) => a.rule === 'R10'));
  const few = C.evaluateRules({ prev: snap(base()), cur: mk('130'), history30: hist.slice(0, 5), thresholds: { r1DayPct: 1000, r1MonthPct: 1000 } });
  assert.ok(!few.some((a) => a.rule === 'R10'));
  const out = C.evaluateRules({ prev: { total_per_unit: '129.9', lines: [] }, cur: mk('130'), history30: hist, thresholds: { r1DayPct: 1000, r1MonthPct: 1000 } });
  const r10 = out.find((a) => a.rule === 'R10');
  assert.ok(r10 && r10.direction === 'up' && r10.evidence.z > 3);
  void cur;
});

test('isLeaf: a subcontracted assembly (Sobsl 30) counts its own cost; other parents do not', () => {
  const { isLeaf } = require('../costWatchCore');
  assert.equal(isLeaf({ Haschild: '' }), true);
  assert.equal(isLeaf({ Haschild: 'X', Sobsl: '' }), false);
  assert.equal(isLeaf({ Haschild: 'X', Sobsl: '30' }), true);
  assert.equal(isLeaf({ Haschild: 'X', Sobsl: '50' }), false);
});
