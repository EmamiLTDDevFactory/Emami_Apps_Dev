'use client';
/**
 * Budget analysis workbook of a costed plan (Plans > Excel "Budget analysis"). Sheets: Summary, FG cost, FG item breakup, Components (ABC),
 * YoY movers, Plant summary, Country summary, Plant x Country, Monthly cost, Rate sources, Vendors, Sensitivity, Risks & gaps, Parameters.
 */
import { exportTable, type XCol } from '../client/export';
import { CATEGORY_LABEL } from '../cost/categories';
import type { PlanCostLine } from './fields';
import { FISCAL_MONTHS } from './fields';
import { analyse, priorKey, type Fg, type Group, type PlanAnalysis, type PriorRates, type PriorStatus } from './analysis';
import type { PlanCostQuery } from './requests';
import type { SapMessage } from '../sap/messages';
import type { PlanFailure } from './batchRun';
import { planParams } from './export';

const r = (v: number | null, dp = 2) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(dp)));
const S = (header: string, get: (i: number) => string, width?: number): XCol => ({ header, width, get });
const N = (header: string, get: (i: number) => number | null, dp = 2, inr = false): XCol => ({ header, dp, curr: inr ? 'INR' : undefined, get: (i) => r(get(i), dp) });
const strip = (m: string) => m.replace(/^0+(?=\d)/, '');
const CATS = ['RM', 'PERFUME', 'PM', 'OTHER'] as const;

function summaryRows(a: PlanAnalysis, plan: string, plants: string[], budgetYr: string): { section: string; metric: string; value: number | null; note: string }[] {
  const t = a.totals; const rows: { section: string; metric: string; value: number | null; note: string }[] = [];
  const add = (section: string, metric: string, value: number | null, note = '') => rows.push({ section, metric, value: r(value, 2), note });
  add('Plan', 'Plan', null, plan); add('Plan', 'Plants costed', t.plants, plants.join(', ')); add('Plan', 'Countries', t.countries, [...new Set(a.fgs.map((f) => f.land1))].join(', '));
  add('Plan', 'FGs (plan country + plant + material)', t.fgs); add('Plan', 'Leaf components costed (FG lines)', t.items); add('Plan', 'Distinct components (component plant + material)', t.comps); add('Plan', 'Planned quantity (all FGs, mixed units)', t.planQty);
  add('Cost', 'Product cost at current SAP rates (INR)', t.costInr, 'rate SAP selected + freight, x plan quantity');
  add('Cost', `Product cost at budget rates ${budgetYr} (INR)`, t.budgetInr, 'zcomponent / zcomponent_n landed rate x plan quantity; leaves without a budget rate at the current rate');
  add('Cost', 'Budget vs current (%)', t.budgetVsCurrentPct, 'positive = budget above today\'s rates');
  add('Cost', 'Freight included in the budget cost (INR)', t.freightInr, 'component freight per unit x quantity; zero where freight is already inside the rate (Consumption / C-MAP)');
  for (const c of CATS) add('Cost by category', `${CATEGORY_LABEL[c]} (INR)`, t.byCat[c], t.budgetInr ? `${((t.byCat[c] / t.budgetInr) * 100).toFixed(1)}% of the budget cost` : '');
  if (a.prior) {
    add('Previous year', `Prior-year rates found (${a.prior.year})`, a.prior.found, `of ${a.prior.asked} components (${(t.priorCoverage * 100).toFixed(0)}% of FG lines)`);
    add('Previous year', `Cost at ${a.prior.year} rates, same quantities (INR)`, t.priorInr, 'components without a prior rate are kept at the budget rate, so the two totals compare');
    add('Previous year', 'Budget vs previous year (%)', t.yoyPct, 'positive = costlier than last year');
    add('Previous year', 'Budget vs previous year (INR)', t.priorInr === null ? null : t.budgetInr - t.priorInr);
    for (const n of a.prior.notes.slice(0, 5)) add('Previous year', 'Note', null, n);
  }
  add('Quality', 'Leaves with no SAP rate', t.noRate); add('Quality', 'Leaves with no budget rate', t.noBudget); add('Quality', 'FGs SAP could not cost', t.failed, t.failed ? 'listed on Risks & gaps' : '');
  add('Quality', 'Risks and gaps listed', a.risks.length);
  const top = a.fgs.slice().sort((x, y) => y.budgetInr - x.budgetInr).slice(0, 5);
  top.forEach((f, i) => add('Top FGs by cost', `${i + 1}. ${f.hwerks} ${f.land1} ${strip(f.fg)}`, f.budgetInr, f.fgText));
  a.comps.slice(0, 5).forEach((c, i) => add('Top components by cost', `${i + 1}. ${c.compPlant} ${strip(c.comp)}`, c.budgetInr, `${c.compText} · ${(c.share * 100).toFixed(1)}% of cost · class ${c.abc}`));
  const A = a.comps.filter((c) => c.abc === 'A').length;
  add('Concentration', 'Class A components (first 80% of cost)', A, `${a.comps.length ? ((A / a.comps.length) * 100).toFixed(0) : 0}% of the components carry 80% of the cost`);
  a.plants.forEach((g) => add('By plant', g.label, g.budgetInr, `${g.fgs} FGs · ${(g.share * 100).toFixed(1)}%${g.yoyPct === null ? '' : ` · vs prior year ${g.yoyPct.toFixed(1)}%`}`));
  a.countries.forEach((g) => add('By country', g.label, g.budgetInr, `${g.fgs} FGs · ${(g.share * 100).toFixed(1)}%${g.yoyPct === null ? '' : ` · vs prior year ${g.yoyPct.toFixed(1)}%`}`));
  return rows;
}

const groupCols = (rows: Group[], label: string): XCol[] => [
  S(label, (i) => rows[i].label), N('FGs', (i) => rows[i].fgs, 0), N('Plan qty', (i) => rows[i].planQty, 0), N('FG lines', (i) => rows[i].items, 0),
  N('Cost @ current INR', (i) => rows[i].costInr, 2, true), N('Cost @ budget INR', (i) => rows[i].budgetInr, 2, true), N('Share of plan %', (i) => rows[i].share * 100, 1),
  ...CATS.map((c) => N(`${CATEGORY_LABEL[c]} INR`, (i: number) => rows[i].byCat[c], 2, true)), N('Freight INR', (i) => rows[i].freightInr, 2, true),
  N('Budget vs current %', (i) => rows[i].budgetVsCurrentPct, 1), N('Prior-year cost INR', (i) => rows[i].priorInr, 2, true), N('vs prior year %', (i) => rows[i].yoyPct, 1),
  S('Local currency', (i) => rows[i].locCurr), N('Cost @ current (local)', (i) => rows[i].costLoc, 2),
  N('No-rate lines', (i) => rows[i].noRate, 0), N('No-budget lines', (i) => rows[i].noBudget, 0),
];

export function analysisSheets(a: PlanAnalysis, plan: string, plants: string[], budgetYr: string): { main: { cols: XCol[]; count: number }; extra: { name: string; cols: XCol[]; count: number }[] } {
  const sum = summaryRows(a, plan, plants, budgetYr);
  const main = { count: sum.length, cols: [S('Section', (i) => sum[i].section, 22), S('Metric', (i) => sum[i].metric, 52), N('Value', (i) => sum[i].value, 2), S('Note', (i) => sum[i].note, 90)] };
  const fgs = a.fgs; const items = a.items;
  const fgCols: XCol[] = [
    S('Plant', (i) => fgs[i].hwerks), S('Country', (i) => fgs[i].land1), S('FG', (i) => strip(fgs[i].fg)), S('FG description', (i) => fgs[i].fgText, 32), S('BOM source', (i) => fgs[i].bomSrc),
    N('Plan qty', (i) => fgs[i].planQty, 0), N('Components (leaves)', (i) => fgs[i].leaves, 0),
    N('Cost/pc @ current INR', (i) => fgs[i].costPcInr, 4, true), N('Cost/pc @ budget INR', (i) => fgs[i].budgetPcInr, 4, true),
    ...CATS.map((c) => N(`${CATEGORY_LABEL[c]}/pc INR`, (i: number) => (fgs[i].planQty ? fgs[i].byCat[c] / fgs[i].planQty : null), 4, true)),
    N('Freight/pc INR', (i) => (fgs[i].planQty ? fgs[i].freightInr / fgs[i].planQty : null), 4, true),
    S('Local currency', (i) => fgs[i].locCurr), N('Cost/pc @ current (local)', (i) => fgs[i].costPcLoc, 4), N('Total cost @ current (local)', (i) => fgs[i].costLoc, 2),
    N('Total cost @ current INR', (i) => fgs[i].costInr, 2, true), N('Total cost @ budget INR', (i) => fgs[i].budgetInr, 2, true), N('Total cost @ budget (local)', (i) => fgs[i].budgetLoc, 2),
    N('Budget vs current %', (i) => fgs[i].budgetVsCurrentPct, 1),
    N('Prior-year cost/pc INR', (i) => fgs[i].priorPcInr, 4, true), N('Prior-year total INR', (i) => fgs[i].priorInr, 2, true), N('vs prior year %', (i) => fgs[i].yoyPct, 1), N('Leaves with prior rate', (i) => fgs[i].priorCovered, 0),
    N('No-rate leaves', (i) => fgs[i].noRate, 0), N('No-budget leaves', (i) => fgs[i].noBudget, 0),
  ];
  const itemCols: XCol[] = [
    S('Plant', (i) => items[i].hwerks), S('Country', (i) => items[i].land1), S('FG', (i) => strip(items[i].fg)), S('FG description', (i) => items[i].fgText, 30),
    S('Component plant', (i) => items[i].compPlant), S('Component', (i) => strip(items[i].comp)), S('Component description', (i) => items[i].compText, 34), S('Mat type', (i) => items[i].mtart), S('Category', (i) => CATEGORY_LABEL[items[i].cat]), S('Unit', (i) => items[i].unit),
    N('Level', (i) => items[i].level, 0), N('Qty per FG pc', (i) => items[i].qtyPerPc, 6), N('Total qty (plan)', (i) => items[i].qtyTotal, 3),
    S('Current source', (i) => items[i].source), S('Vendor', (i) => items[i].vendorName || items[i].vendor, 24),
    N('Current rate INR', (i) => items[i].rateInr, 4, true), N('Freight INR', (i) => items[i].freightInr, 4, true), N('Current total/unit INR', (i) => items[i].totalPcInr, 4, true), N('Current cost INR', (i) => items[i].costInr, 2, true),
    S('Local currency', (i) => items[i].locCurr), N('Current rate (local)', (i) => items[i].ratePcLoc, 4), N('Current cost (local)', (i) => items[i].costLoc, 2),
    N('Price unit -> BOM unit factor', (i) => items[i].unitFactor, 3),
    N('Budget rate INR / BOM unit (zcomponent)', (i) => items[i].budgetRateInr, 4, true), N('Budget rate (source ccy)', (i) => items[i].budgetSrcAmt, 4), S('Budget ccy', (i) => items[i].budgetCurr), S('Budget source', (i) => items[i].budgetSource), S('Budget year', (i) => items[i].budgetYr),
    N('Budget cost INR', (i) => items[i].budgetCostInr, 2, true), N('Budget cost (local)', (i) => items[i].budgetCostLoc, 2),
    N('Budget vs current %', (i) => items[i].budgetVsCurrentPct, 1),
    N('Prior-year rate INR', (i) => items[i].priorRateInr, 4, true), N('Prior-year rate (local)', (i) => items[i].priorRateLoc, 4), S('Prior ccy', (i) => items[i].priorCurr), N('Prior-year cost INR', (i) => items[i].priorCostInr, 2, true), N('vs prior year %', (i) => items[i].yoyPct, 1),
    ...FISCAL_MONTHS.map((m, k): XCol => N(`${m} qty`, (i) => items[i].months[k], 3)),
  ];
  const comps = a.comps;
  const compCols: XCol[] = [
    N('Rank', (i) => i + 1, 0), S('Class', (i) => comps[i].abc), S('Component plant', (i) => comps[i].compPlant), S('Component', (i) => strip(comps[i].comp)), S('Description', (i) => comps[i].compText, 34), S('Mat type', (i) => comps[i].mtart), S('Category', (i) => CATEGORY_LABEL[comps[i].cat]), S('Unit', (i) => comps[i].unit),
    N('FGs using it', (i) => comps[i].fgCount, 0), S('Plants', (i) => comps[i].plants.join(', ')), N('Total qty (plan)', (i) => comps[i].qty, 3),
    N('Avg current rate INR', (i) => comps[i].avgCurrentRate, 4, true), N('Avg budget rate INR', (i) => comps[i].avgBudgetRate, 4, true), N('Avg prior-year rate INR', (i) => comps[i].avgPriorRate, 4, true),
    N('Cost @ current INR', (i) => comps[i].currentInr, 2, true), N('Cost @ budget INR', (i) => comps[i].budgetInr, 2, true), N('Share %', (i) => comps[i].share * 100, 2), N('Cumulative %', (i) => comps[i].cumShare * 100, 2),
    N('Budget vs current %', (i) => comps[i].budgetVsCurrentPct, 1), N('Prior-year cost INR', (i) => comps[i].priorInr, 2, true), N('vs prior year %', (i) => comps[i].yoyPct, 1),
    S('Budget rate', (i) => (comps[i].noBudget ? 'MISSING' : 'zcomponent')), S('Current source', (i) => comps[i].source), S('Vendor', (i) => comps[i].vendor, 24),
  ];
  // Year-on-year movers: components with a prior rate, by the INR effect of the rate change on the plan quantity.
  const movers = comps.filter((c) => c.priorInr !== null).map((c) => ({ c, effect: c.budgetInr - (c.priorInr as number) })).sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)).slice(0, 200);
  const moverCols: XCol[] = [
    N('Rank', (i) => i + 1, 0), S('Component plant', (i) => movers[i].c.compPlant), S('Component', (i) => strip(movers[i].c.comp)), S('Description', (i) => movers[i].c.compText, 34), S('Category', (i) => CATEGORY_LABEL[movers[i].c.cat]),
    N('Total qty (plan)', (i) => movers[i].c.qty, 3), N('Prior-year rate INR', (i) => movers[i].c.avgPriorRate, 4, true), N('Budget rate INR', (i) => movers[i].c.avgBudgetRate, 4, true), N('Rate change %', (i) => movers[i].c.yoyPct, 1),
    N('Cost effect vs prior year INR', (i) => movers[i].effect, 2, true), N('Cost @ budget INR', (i) => movers[i].c.budgetInr, 2, true),
  ];
  const monthCols = (g: Group[]): XCol[] => [S('Plant · country', (i) => g[i].label), ...FISCAL_MONTHS.map((m, k): XCol => N(`${m} INR`, (i) => g[i].months[k], 2, true)), N('Total INR', (i) => g[i].months.reduce((x, y) => x + y, 0), 2, true)];
  const pcs = a.plantCountry.slice().sort((x, y) => x.label.localeCompare(y.label));
  const monthly = a.plants.length ? [...pcs, { ...a.plants[0], label: 'PLAN TOTAL', months: a.totals.months } as Group] : pcs;
  const src = a.sources; const ven = a.vendors.slice(0, 300); const sens = a.sensitivity; const risks = a.risks;
  return {
    main,
    extra: [
      { name: 'FG cost (plant-wise)', cols: fgCols, count: fgs.length },
      { name: 'FG item breakup', cols: itemCols, count: items.length },
      { name: 'Components (ABC)', cols: compCols, count: comps.length },
      { name: 'YoY movers', cols: moverCols, count: movers.length },
      { name: 'Plant summary', cols: groupCols(a.plants, 'Plant'), count: a.plants.length },
      { name: 'Country summary', cols: groupCols(a.countries, 'Country'), count: a.countries.length },
      { name: 'Plant x Country', cols: groupCols(a.plantCountry.slice().sort((x, y) => x.label.localeCompare(y.label)), 'Plant · country'), count: a.plantCountry.length },
      { name: 'Monthly cost (budget)', cols: monthCols(monthly), count: monthly.length },
      { name: 'Rate sources', cols: [S('Current rate source', (i) => src[i].source), N('FG lines', (i) => src[i].items, 0), N('Cost INR', (i) => src[i].costInr, 2, true), N('Share %', (i) => src[i].share * 100, 1)], count: src.length },
      { name: 'Vendors', cols: [S('Vendor', (i) => ven[i].vendor), S('Name', (i) => ven[i].name, 34), N('Components', (i) => ven[i].comps, 0), N('FG lines', (i) => ven[i].items, 0), N('Cost INR', (i) => ven[i].costInr, 2, true), N('Share %', (i) => ven[i].share * 100, 2)], count: ven.length },
      { name: 'Sensitivity', cols: [S('Scenario', (i) => sens[i].label, 26), N('Change %', (i) => sens[i].pct, 1), N('Effect on plan cost INR', (i) => sens[i].impactInr, 2, true), N('Effect on plan cost %', (i) => sens[i].impactPct, 2)], count: sens.length },
      { name: 'Risks & gaps', cols: [S('Type', (i) => risks[i].type, 40), S('Reference', (i) => risks[i].ref, 60), S('Detail', (i) => risks[i].detail, 90)], count: risks.length },
    ],
  };
}

export async function exportBudgetAnalysis(p: { plan: string; plants: string[]; query: PlanCostQuery; cost: PlanCostLine[]; prior: PriorRates | null; priorStatus: PriorStatus | null; failed: PlanFailure[]; messages: SapMessage[] }) {
  const a = analyse(p.cost, p.prior, p.priorStatus, p.failed);
  const { main, extra } = analysisSheets(a, p.plan, p.plants, p.query.budgetYr);
  await exportTable({
    fmt: 'xlsx', name: 'Budget analysis', cols: main.cols, count: main.count, extraSheets: extra, messages: p.messages,
    extraParams: [
      ...planParams({ ...p.query, plants: p.plants.length ? p.plants : p.query.plants }),
      ['Current cost', 'Rate SAP selected (freight in) x plan quantity of the leaf (CostLineSet Mode P)'],
      ['Budget cost', 'zcomponent (India) / zcomponent_n (others) landed rate attached by SAP (BudLanded INR; BudSrcamt in BudSrccurr = local), brought from its price unit to the BOM unit with the line own factor SelRate / SelRatePc, x plan quantity; no budget rate = current rate, counted as no budget'],
      ['Previous year', p.priorStatus ? `Rates of ${p.priorStatus.year} read from BudCompSet / BudCompNSet (Landed per Meins): ${p.priorStatus.found} of ${p.priorStatus.asked} components found. Foreign-currency rates converted at the line's current exchange rate.` : 'not read'],
      ['Budget rates by month', 'The analysis uses one budget rate per component (BudLanded); the monthly H2 revisions of the Requirement tab are not applied'],
      ['ABC', 'Components ranked by budget cost: A = up to 80% cumulative, B = up to 95%, C = rest'],
      ['Sensitivity', 'RM includes Perfume; effect = category budget cost x change %'],
      ['Sheets', 'Summary, FG cost (plant-wise), FG item breakup, Components (ABC), YoY movers, Plant / Country / Plant x Country summaries, Monthly cost, Rate sources, Vendors, Sensitivity, Risks & gaps'],
    ],
  });
}

export { priorKey };
export type { Fg };
