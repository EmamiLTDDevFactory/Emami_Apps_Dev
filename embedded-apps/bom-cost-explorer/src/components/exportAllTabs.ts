/**
 * BOM costing > Excel (all tabs): one workbook with a sheet per result tab - BOM tree, Cost breakup, Dashboard, Simulator,
 * Data quality, Scenarios, Rate sources, Rate summary, Rate coverage - every field the tab shows, plus a Parameters sheet.
 * The sheet builders are the tabs' own (their per-tab Excel buttons use the same ones); a tab whose data is not available
 * (rate options not offered by SAP, no process-order data set ...) is left out and named on the Parameters sheet.
 */
import type { CostLine } from '@/lib/sap/fields';
import type { CostQuery } from '@/lib/query/schema';
import { describeQuery } from '@/lib/query/schema';
import type { SapMessage } from '@/lib/sap/messages';
import type { SimRow, SimSettings } from '@/lib/cost/simulate';
import { isIdentity } from '@/lib/cost/simulate';
import { analyse, dataQuality, DQ_LABEL } from '@/lib/cost/analytics';
import { perPiece } from '@/lib/cost/perPiece';
import { CATEGORIES } from '@/lib/cost/categories';
import { D } from '@/lib/cost/decimal';
import { isLeafRow } from '@/lib/cost/tree';
import { rateSummary } from '@/lib/cost/rateSummary';
import { rateCoverage } from '@/lib/rates/coverage';
import { buildSourcesModel } from '@/lib/rates/sources';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { buildBreakup } from '@/lib/costbreakup/breakup';
import { fetchProcOrders, monthsAgo, actualsPerPiece } from '@/lib/costbreakup/procOrder';
import { fetchActivities, activitiesPerUnit, fiscalPeriod } from '@/lib/costbreakup/activity';
import type { Scenario } from '@/lib/client/scenarios';
import { costLineSheets, exportWorkbook, type XCol, type XSheet } from '@/lib/client/export';
import { rateSourcesXlsx } from './rates/RateSources';
import { rateSummarySheets } from './rates/RateSummary';
import { breakupCols } from './costbreakup/CostBreakup';

export interface AllTabsInput {
  query: CostQuery;
  rows: CostLine[];
  sim: SimRow[];
  /** the client what-ifs in effect (effectiveSim) */
  settings: SimSettings;
  messages: SapMessage[];
  rates: RatesState;
  scenarios: Scenario[];
  plantNames: Record<string, string>;
  coverDays: number;
  groupCurr: string;
}

const num = (v: { toString(): string } | null | undefined) => (v === null || v === undefined ? null : Number(v.toString()));
const txt = (get: (i: number) => string | number | null, header: string, width?: number): XCol => ({ header, width, get });
const INR = (header: string, get: (i: number) => number | null, dp = 2): XCol => ({ header, dp, curr: 'INR', width: 16, get });

/** A sheet of label / value pairs. */
const pairs = (name: string, list: [string, string | number | null][], head: [string, string] = ['Item', 'Value']): XSheet => ({
  name,
  count: list.length,
  cols: [txt((i) => list[i][0], head[0], 34), { header: head[1], width: 30, get: (i) => list[i][1] }],
});

export async function buildAllTabSheets(x: AllTabsInput): Promise<{ sheets: XSheet[]; notes: [string, string][] }> {
  const { query, rows, sim, settings, rates } = x;
  const sheets: XSheet[] = [];
  const notes: [string, string][] = [];

  // ---- BOM tree + rate options
  const cl = costLineSheets({ query, rows, sim, settings });
  sheets.push({ name: 'BOM tree', cols: cl.cols, count: rows.length });
  if (cl.options.count) sheets.push(cl.options);

  // ---- Cost breakup (needs SAP's activity and process-order data sets; either may be missing)
  try {
    const plants = [...new Set(rows.map((l) => l.Hwerks))];
    const fgCodes = [...new Set(rows.map((l) => l.Headmat))];
    const semis = rows.filter((l) => !isLeafRow(l) && l.Idnrk && l.Idnrk !== l.Headmat);
    const actPlants = [...new Set([...plants, ...semis.map((l) => l.Werks || l.Hwerks)])];
    const actMats = [...new Set([...fgCodes, ...semis.map((l) => l.Idnrk)])];
    const period = fiscalPeriod();
    const [po, act] = await Promise.all([
      fetchProcOrders(plants, fgCodes, monthsAgo(12)).catch((e) => ({ status: 'error' as const, note: (e as Error).message, rows: [] })),
      fetchActivities(actPlants, actMats, period).catch((e) => ({ status: 'error' as const, note: (e as Error).message, rows: [] })),
    ]);
    const fgs = buildBreakup(
      rows,
      (l) => D(l.ProdQty),
      () => D(query.explQty),
      po.status === 'ready' ? actualsPerPiece(po.rows) : new Map(),
      act.status === 'ready' ? activitiesPerUnit(act.rows, period.poper) : new Map(),
    );
    if (fgs.length) sheets.push({ name: 'Cost breakup', cols: breakupCols(fgs), count: fgs.length });
    notes.push(['Cost breakup', `Conversion: activities ${act.status === 'ready' ? `${act.rows.length} rows, period ${period.poper}/${period.gjahr}` : act.note || act.status}; process orders ${po.status === 'ready' ? `${po.rows.length} rows (last 12 months)` : po.note || po.status}`]);
  } catch (e) {
    notes.push(['Cost breakup', `not exported: ${(e as Error).message}`]);
  }

  // ---- Dashboard
  const a = analyse(rows, sim, { coverDays: x.coverDays });
  const k = a.kpis;
  sheets.push(pairs('Dashboard KPIs', [
    [`Total ${x.groupCurr}`, num(k.total)],
    ['Leaf lines', k.leafCount],
    [`Freight ${x.groupCurr}`, num(k.freight)],
    ['Freight share %', num(k.freightShare)],
    ['Rows without rate', k.noRate],
    ['Rows from donor plant', k.donor],
    [`Components with cover < ${x.coverDays} days`, k.lowCover],
    [`Value at risk (cover) ${x.groupCurr}`, num(k.lowCoverValue)],
    ['Budget lines', k.budgetRows],
    ['Budget variance INR (+ above budget)', num(k.budgetVariance)],
    ['Budget base INR', num(k.budgetBase)],
    ['Client what-ifs included', isIdentity(settings) ? 'No' : 'Yes'],
  ], ['KPI', 'Value']));

  const pcs = perPiece(rows, sim, query.explQty, settings.qtyMult || 1);
  const pcCols: XCol[] = [
    txt((i) => pcs[i].plant, 'Plant'), txt((i) => `${x.plantNames[pcs[i].plant] ?? ''}`, 'Plant name', 20), txt((i) => pcs[i].head, 'Header'), txt((i) => pcs[i].text, 'Header text', 30),
    ...CATEGORIES.map((c) => INR(`${c} / pc INR (SAP)`, (i) => num(pcs[i].base[c]), 4)), INR('Total / pc INR (SAP)', (i) => num(pcs[i].base.TOTAL), 4),
    ...CATEGORIES.map((c) => INR(`${c} / pc INR (sim)`, (i) => num(pcs[i].sim[c]), 4)), INR('Total / pc INR (sim)', (i) => num(pcs[i].sim.TOTAL), 4),
    INR('Delta / pc INR', (i) => num(pcs[i].delta), 4), { header: 'Delta %', dp: 2, get: (i) => num(pcs[i].deltaPct) },
  ];
  sheets.push({ name: 'Dashboard per pc', cols: pcCols, count: pcs.length });

  const brk: { section: string; key: string; label: string; value: number | null }[] = [];
  for (const [s, v] of a.bySource) brk.push({ section: 'Cost by rate source', key: s, label: s, value: num(v) });
  for (const d of a.topDrivers) brk.push({ section: 'Top 10 cost drivers', key: d.comp, label: d.text, value: num(d.value) });
  for (const [p, v] of a.byPlant) brk.push({ section: 'Cost by plant', key: p, label: x.plantNames[p] ?? '', value: num(v) });
  for (const [g, v] of a.byGroup) brk.push({ section: 'Cost by material group', key: g, label: '', value: num(v) });
  sheets.push({ name: 'Dashboard breakdowns', count: brk.length, cols: [txt((i) => brk[i].section, 'Breakdown', 24), txt((i) => brk[i].key, 'Key'), txt((i) => brk[i].label, 'Label', 30), INR('Cost INR', (i) => brk[i].value)] });

  const cr = a.coverRisk;
  sheets.push({
    name: 'Coverage risk', count: cr.length,
    cols: [txt((i) => cr[i].row.Hwerks, 'Plant'), txt((i) => cr[i].row.Headmat, 'Header'), txt((i) => cr[i].row.Idnrk, 'Component'), txt((i) => cr[i].row.Maktx, 'Description', 30),
      txt((i) => cr[i].row.CovH1, 'Cover H1'), txt((i) => cr[i].row.CovH2, 'Cover H2'), txt((i) => cr[i].row.CovH3, 'Cover H3'), { header: 'Min cover (days)', dp: 0, get: (i) => cr[i].cover }, INR('Cost value INR', (i) => num(cr[i].value))],
  });
  const bv = [...a.budgetOver.map((b) => ({ b, side: 'Above budget' })), ...a.budgetUnder.map((b) => ({ b, side: 'Below budget' }))];
  sheets.push({
    name: 'Budget variance', count: bv.length,
    cols: [txt((i) => bv[i].side, 'Side', 14), txt((i) => bv[i].b.plant, 'Plant'), txt((i) => bv[i].b.label, 'Component', 36), { header: 'Qty', dp: 3, get: (i) => num(bv[i].b.qty) }, INR('Variance INR', (i) => num(bv[i].b.variance))],
  });

  // ---- Simulator: the what-ifs in effect, then base vs simulated per line
  const sl: [string, string | number | null][] = [
    ['Rate pick', settings.pick], ['Priority', settings.prio.join(' > ')], ['Freight change %', settings.freightPct], ['Quantity multiplier', settings.qtyMult],
    ...Object.entries(settings.ratePct).map(([s, v]): [string, string | number | null] => [`Rate change % - ${s}`, v ?? null]),
    ...Object.entries(settings.fxPct).map(([c, v]): [string, string | number | null] => [`FX change % - ${c}`, v]),
    ...Object.entries(settings.compPct).map(([c, v]): [string, string | number | null] => [`Component rate change % - ${c}`, v]),
    ...Object.entries(settings.overrides).map(([r, v]): [string, string | number | null] => [`Manual rate/pc INR - ${r}`, v]),
  ];
  sheets.push(pairs('Simulator settings', sl, ['Setting', 'Value']));
  const leaf = rows.map((r, i) => i).filter((i) => isLeafRow(rows[i]));
  sheets.push({
    name: 'Simulator lines', count: leaf.length,
    cols: [txt((i) => rows[leaf[i]].Hwerks, 'Plant'), txt((i) => rows[leaf[i]].Headmat, 'Header'), txt((i) => rows[leaf[i]].Idnrk, 'Component'), txt((i) => rows[leaf[i]].Maktx, 'Description', 30),
      txt((i) => rows[leaf[i]].SelSource, 'SAP source'), INR('SAP total INR', (i) => num(rows[leaf[i]].TotCostInr)),
      txt((i) => sim[leaf[i]].source, 'SIM source'), { header: 'SIM qty', dp: 3, get: (i) => num(sim[leaf[i]].qty) }, INR('SIM rate/pc INR', (i) => num(sim[leaf[i]].ratePcInr), 4), INR('SIM freight/pc INR', (i) => num(sim[leaf[i]].frtPcInr), 4),
      INR('SIM total INR', (i) => num(sim[leaf[i]].total)), INR('Delta INR', (i) => Number(sim[leaf[i]].total.minus(D(rows[leaf[i]].TotCostInr)).toFixed(2))),
      txt((i) => (sim[leaf[i]].repicked ? 'X' : ''), 'Re-picked'), txt((i) => (sim[leaf[i]].overridden ? 'X' : ''), 'Overridden'), txt((i) => (sim[leaf[i]].changed ? 'X' : ''), 'Changed')],
  });

  // ---- Data quality
  const dq = dataQuality(rows);
  sheets.push({
    name: 'Data quality', count: dq.length,
    cols: [txt((i) => DQ_LABEL[dq[i].kind], 'Finding', 24), txt((i) => rows[dq[i].i].Hwerks, 'Plant'), txt((i) => rows[dq[i].i].Headmat, 'Header'), txt((i) => rows[dq[i].i].Idnrk, 'Component'), txt((i) => rows[dq[i].i].Maktx, 'Description', 30), txt((i) => dq[i].detail, 'Detail', 50), INR('Total INR', (i) => num(rows[dq[i].i].TotCostInr))],
  });

  // ---- Scenarios (definitions and the summary of each one's last SAP run)
  const sc = x.scenarios;
  const base = sc.find((s) => s.baseline) ?? sc[0];
  sheets.push({
    name: 'Scenarios', count: sc.length,
    cols: [txt((i) => sc[i].name, 'Scenario', 26), txt((i) => (sc[i].id === base?.id ? 'X' : ''), 'Baseline'), txt((i) => sc[i].note ?? '', 'Note', 40),
      txt((i) => new Date(sc[i].createdAt).toLocaleString('en-IN'), 'Created', 20), txt((i) => (sc[i].lastRun ? new Date(sc[i].lastRun!.at).toLocaleString('en-IN') : ''), 'Last run', 20),
      { header: 'Rows', dp: 0, get: (i) => sc[i].lastRun?.rows ?? null }, { header: 'Run time (ms)', dp: 0, get: (i) => sc[i].lastRun?.ms ?? null },
      INR('Total INR', (i) => (sc[i].lastRun ? Number(sc[i].lastRun!.totalInr) : null)),
      INR('Delta vs baseline INR', (i) => (sc[i].lastRun && base?.lastRun ? Number((Number(sc[i].lastRun!.totalInr) - Number(base.lastRun.totalInr)).toFixed(2)) : null)),
      txt((i) => describeQuery(sc[i].query).map(([a2, b]) => `${a2}: ${b}`).join(' | '), 'Query', 60), txt((i) => (isIdentity(sc[i].sim) ? '' : JSON.stringify(sc[i].sim)), 'Client what-ifs', 40)],
  });

  // ---- Rate sources / coverage need SAP's rate options; Rate summary also works without them
  const ready = rates.status === 'ready';
  const rs = rateSummary(rows, query.explQty);
  const sum = rateSummarySheets(rs);
  sheets.push({ name: 'Rate summary', cols: sum.fgCols, count: rs.fgs.length }, ...sum.sheets);
  if (ready) {
    const model = buildSourcesModel(rows);
    const { xcols, count } = rateSourcesXlsx(model);
    sheets.push({ name: 'Rate sources', cols: xcols, count });
    notes.push(['Rate sources', `Used total INR ${model.usedTotal.toFixed(2)}; cheapest total INR ${model.cheapestTotal.toFixed(2)}; saving INR ${model.saving.toFixed(2)}`]);
    const cov = rateCoverage(rows, query.prio, true);
    sheets.push({
      name: 'Coverage by source', count: cov.sources.length,
      cols: [txt((i) => cov.sources[i].source, 'Source'), { header: 'Components with a rate', dp: 0, get: (i) => cov.sources[i].components }, { header: 'Leaf rows using it', dp: 0, get: (i) => cov.sources[i].usedLeaf }, { header: 'Share of leaf rows %', dp: 1, get: (i) => Number((cov.sources[i].share * 100).toFixed(1)) }, txt((i) => ((query.prio as string[]).includes(cov.sources[i].source) ? 'Yes' : 'No'), 'In priority')],
    });
    const mb = cov.mbewOnly.flatMap((g) => g.rows.map((r) => ({ g, r })));
    sheets.push({ name: 'C-MAP only', count: mb.length, cols: [txt((i) => mb[i].g.idnrk, 'Component'), txt((i) => mb[i].g.maktx, 'Description', 30), txt((i) => mb[i].r.hwerks, 'Plant'), txt((i) => mb[i].r.headmat, 'Header'), txt((i) => mb[i].r.werks, 'Component plant')] });
    const op = cov.outsidePrio;
    sheets.push({
      name: 'Outside priority', count: op.length,
      cols: [txt((i) => op[i].line.Idnrk, 'Component'), txt((i) => op[i].line.Maktx, 'Description', 30), txt((i) => op[i].line.Headmat, 'Header'), txt((i) => op[i].line.Hwerks, 'Plant'), txt((i) => op[i].line.SelSource, 'Used source'), { header: 'Sources found', dp: 0, get: (i) => op[i].line.SrcCount },
        txt((i) => op[i].unused.map((u) => `${u.source} ${u.ratePcInr.toFixed(4)}`).join('; '), 'Not in priority (rate/pc INR)', 50)],
    });
    notes.push(['Rate coverage', `Priority ${query.prio.join(' > ')}; look-back ${query.lookback} days; ${cov.leafRows} leaf rows; ${cov.donorRows} from donor plant ${cov.donorPlants.join(', ')}`]);
  } else {
    notes.push(['Rate sources, Rate coverage', `not exported: rate options ${rates.status}${rates.note ? ` (${rates.note})` : ''}`]);
  }
  return { sheets, notes };
}

export async function exportAllTabs(x: AllTabsInput) {
  const { sheets, notes } = await buildAllTabSheets(x);
  // Excel: a sheet name is at most 31 characters and unique.
  const seen = new Set<string>();
  const clean = sheets.map((s) => {
    let name = s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = `${s.name.slice(0, 28)} ${n}`;
    seen.add(name.toLowerCase());
    return { ...s, name };
  });
  await exportWorkbook({
    fileLabel: 'BOM costing all tabs', query: x.query, sheets: clean, messages: x.messages,
    extraParams: [['Sheets', clean.map((s) => s.name).join(', ')], ['Rows (BOM tree)', String(x.rows.length)], ...(isIdentity(x.settings) ? [] : [['Simulation (client-side, not SAP)', JSON.stringify(x.settings)] as [string, string]]), ...notes],
  });
}
