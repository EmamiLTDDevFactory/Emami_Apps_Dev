/**
 * Fact builders of the costing screens: each turns what the screen shows into FACTS (deterministic code, full precision) plus a plain-text
 * template, so the AI only ever writes the words. Pure functions, no SAP calls, nothing is written anywhere.
 */
import Decimal from 'decimal.js';
import { FactBook } from '../facts';
import { listTemplate, type NarrateSpec } from '../narrate';
import type { BrandView, SalesView, Window } from '../../dash/logic';
import type { Group, Result } from '../../dash/margin';
import type { BridgeRow } from '../../dash/types';
import type { AnalysisTotals, MaterialWeighted, PlantCompare } from '../../freight/analysis';

const L = (v: Decimal) => v.div(100000);
const top = <T,>(a: T[], f: (x: T) => Decimal, n: number) => [...a].sort((x, y) => f(y).abs().cmp(f(x).abs())).slice(0, n);

/* ---------- MIS: budget vs actual COGM by brand ---------- */
export function misSpec(o: { brands: BrandView[]; tot: { ftm: Window; ytm: Window }; plants: string; asOf: string; fy: string; version: string; bn: (c: string) => string }): NarrateSpec {
  const b = new FactBook(); const s = 'mis';
  const t = o.tot.ytm;
  const f = {
    bud: b.add('Year-to-date budget COGM', L(t.budget), { unit: 'lakh', source: `${s}.ytm.budget`, dp: 1 }),
    act: b.add('Year-to-date actual COGM of the same finished goods', L(t.actualCmp), { unit: 'lakh', source: `${s}.ytm.actualCmp`, dp: 1 }),
    var: b.add('Year-to-date variance (actual minus budget)', L(t.variance), { unit: 'lakh', source: `${s}.ytm.variance`, dp: 1 }),
    pct: t.variancePct ? b.add('Year-to-date variance in percent of budget', t.variancePct, { unit: '%', source: `${s}.ytm.variancePct`, dp: 1 }) : '',
    all: b.add('Year-to-date actual COGM of all finished goods, including those without a budget', L(t.actual), { unit: 'lakh', source: `${s}.ytm.actual`, dp: 1 }),
    ftmVar: o.tot.ftm.variancePct ? b.add('Month-to-date variance in percent of budget', o.tot.ftm.variancePct, { unit: '%', source: `${s}.ftm.variancePct`, dp: 1 }) : '',
  };
  const red = o.brands.filter((x) => x.band === 'red').length, amber = o.brands.filter((x) => x.band === 'amber').length;
  const noBud = o.brands.reduce((a, x) => a + x.fgNoBudget, 0), fgs = o.brands.reduce((a, x) => a + x.fgCnt, 0);
  b.add('Brands in red (variance above the red limit)', red, { unit: 'count', source: `${s}.red` });
  b.add('Brands in amber (variance above the amber limit)', amber, { unit: 'count', source: `${s}.amber` });
  b.add('Finished goods without an approved budget (left out of the comparison)', noBud, { unit: 'count', source: `${s}.noBudget` });
  b.add('Finished goods in total', fgs, { unit: 'count', source: `${s}.fgs` });
  const worst = top(o.brands.filter((x) => x.ytm.variancePct), (x) => x.ytm.variance, 5);
  for (const x of worst) {
    const name = o.bn(x.brand) || x.brand || '(no brand)';
    b.add(`Brand ${name}: year-to-date variance`, L(x.ytm.variance), { unit: 'lakh', source: `${s}.brand.${x.brand}.variance`, dp: 1 });
    if (x.ytm.variancePct) b.add(`Brand ${name}: variance in percent of budget`, x.ytm.variancePct, { unit: '%', source: `${s}.brand.${x.brand}.pct`, dp: 1 });
    if (x.fgNoBudget) b.add(`Brand ${name}: finished goods without budget`, x.fgNoBudget, { unit: 'count', source: `${s}.brand.${x.brand}.noBudget` });
  }
  return {
    feature: 'mis', title: `MIS: budget vs actual COGM, plants ${o.plants}, as of ${o.asOf}`, facts: b, ignore: o.plants.split(/[\s,;]+/),
    task: `Review the MIS (budget vs actual COGM, financial year ${o.fy}${o.version ? `, approved budget version ${o.version}` : ''}) for plants ${o.plants} as of ${o.asOf}. Say how far actual is from budget, which brands drive it, and what is not covered by a budget.`,
    template: () => listTemplate(`MIS, plants ${o.plants}, as of ${o.asOf}:`, b.list(), 22),
  };
}

/* ---------- variance bridge ---------- */
export function bridgeSpec(rows: BridgeRow[], brandName: string, plants: string, asOf: string): NarrateSpec {
  const b = new FactBook(); const s = 'bridge';
  const by = new Map<string, Decimal>(); const msg = new Map<string, string>();
  for (const r of rows) { by.set(r.Effect, (by.get(r.Effect) ?? new Decimal(0)).plus(new Decimal(r.Value || 0))); if (r.Msg && !msg.has(r.Effect)) msg.set(r.Effect, r.Msg); }
  const LABEL: Record<string, string> = { BUDGET: 'Budget (flexed to actual quantity)', RATE_R: 'Raw material rate effect', USAGE_R: 'Raw material usage effect', RATE_P: 'Packing material rate effect', USAGE_P: 'Packing material usage effect', RATE_F: 'Perfume rate effect', USAGE_F: 'Perfume usage effect', NOSPLIT: 'Material variance not analysed', OVERHEAD: 'Overheads effect', UNEXPL: 'Unexplained part', ACTUAL: 'Actual (same finished goods)' };
  for (const [k, v] of by) if (LABEL[k]) b.add(`${LABEL[k]}${brandName ? ` (${brandName})` : ''}`, L(v), { unit: 'lakh', source: `${s}.${k}`, dp: 2 });
  const bud = by.get('BUDGET'), act = by.get('ACTUAL');
  if (bud && act && !bud.isZero()) b.add('Total variance in percent of budget', act.minus(bud).div(bud).times(100), { unit: '%', source: `${s}.variancePct`, dp: 1 });
  return {
    feature: 'bridge', title: `Variance bridge${brandName ? `: ${brandName}` : ''}, plants ${plants}, as of ${asOf}`, facts: b, ignore: plants.split(/[\s,;]+/),
    task: `Explain the budget-to-actual COGM bridge: which effect (rate or usage of raw material, packing, perfume, or overheads) explains most of the variance. Say plainly that mix and currency effects are not available (no planned volumes, no budget exchange rate) and that finished goods outside the analysed set are shown as "not analysed".`,
    template: () => listTemplate('Variance bridge:', b.list(), 16),
  };
}

/* ---------- Margin ---------- */
export function marginSpec(o: { base: Result; scen: Result; groups: Group[]; nbc: number; by: string; period: string; sens: { label: string; delta: Decimal }[] }): NarrateSpec {
  const b = new FactBook(); const s = 'margin';
  const r = o.scen;
  b.add('Gross margin', L(r.gm), { unit: 'lakh', source: `${s}.gm`, dp: 3 });
  if (r.gmPct) b.add('Gross margin in percent of revenue', r.gmPct, { unit: '%', source: `${s}.gmPct`, dp: 1 });
  b.add('Revenue', L(r.revenue), { unit: 'lakh', source: `${s}.revenue`, dp: 3 });
  b.add('Cost of goods sold', L(r.cogs), { unit: 'lakh', source: `${s}.cogs`, dp: 3 });
  b.add('Quantity sold', r.qty, { unit: 'pcs', source: `${s}.qty` });
  const dm = o.scen.gm.minus(o.base.gm);
  if (!dm.isZero()) b.add('Gross margin change against the invoice base (scenario drivers on screen)', L(dm), { unit: 'lakh', source: `${s}.scenarioDelta`, dp: 3 });
  if (!r.budQty.isZero()) b.add('Budget cost of goods for the same quantity', L(r.budCogs), { unit: 'lakh', source: `${s}.budCogs`, dp: 3 });
  b.add('Lines without an approved budget (NBC / trading goods)', o.nbc, { unit: 'count', source: `${s}.nbc` });
  const worst = [...o.groups].filter((g) => g.scen.gmPct).sort((x, y) => x.scen.gmPct!.cmp(y.scen.gmPct!)).slice(0, 3);
  const best = [...o.groups].filter((g) => g.scen.gmPct).sort((x, y) => y.scen.gmPct!.cmp(x.scen.gmPct!)).slice(0, 2);
  for (const g of [...worst, ...best]) b.add(`${g.label}: gross margin in percent`, g.scen.gmPct!, { unit: '%', source: `${s}.group.${g.key}.gmPct`, dp: 1 });
  const big = top(o.groups, (g) => g.scen.gm, 3);
  for (const g of big) b.add(`${g.label}: gross margin`, L(g.scen.gm), { unit: 'lakh', source: `${s}.group.${g.key}.gm`, dp: 3 });
  if (o.sens[0]) b.add(`Gross margin change if "${o.sens[0].label}"`, L(o.sens[0].delta), { unit: 'lakh', source: `${s}.sensitivity.0`, dp: 3 });
  return {
    feature: 'margin', title: `Margin analysis, ${o.period}, grouped by ${o.by}`, facts: b,
    task: `Review the margin analysis (invoice-condition margin, ${o.period}). State gross margin and percent, which groups are strongest and weakest, how the scenario drivers on screen moved it, and what is not covered by a budget.`,
    template: () => listTemplate(`Margin analysis, ${o.period}:`, b.list(), 18),
  };
}

/* ---------- Sales view ---------- */
export function salesSpec(o: { brands: SalesView[]; tot: { gsv: Decimal; deductions: Decimal; nsv: Decimal; cogm: Decimal; gm: Decimal; gmPct: Decimal | null; soldQty: Decimal }; plants: string; period: string; bn: (c: string) => string }): NarrateSpec {
  const b = new FactBook(); const s = 'sales';
  const t = o.tot;
  b.add('Gross sales value (GSV)', L(t.gsv), { unit: 'lakh', source: `${s}.gsv`, dp: 1 });
  b.add('Deductions (GSV minus NSV)', L(t.deductions), { unit: 'lakh', source: `${s}.deductions`, dp: 1 });
  b.add('Net sales value (NSV)', L(t.nsv), { unit: 'lakh', source: `${s}.nsv`, dp: 1 });
  b.add('Cost of goods (COGM of the sold volume)', L(t.cogm), { unit: 'lakh', source: `${s}.cogm`, dp: 1 });
  b.add('Gross margin', L(t.gm), { unit: 'lakh', source: `${s}.gm`, dp: 1 });
  if (t.gmPct) b.add('Gross margin in percent of NSV', t.gmPct, { unit: '%', source: `${s}.gmPct`, dp: 1 });
  if (!t.gsv.isZero()) b.add('Deductions in percent of GSV', t.deductions.div(t.gsv).times(100), { unit: '%', source: `${s}.deductionPct`, dp: 1 });
  const noCost = o.brands.reduce((a, x) => a + x.noCogm, 0), lines = o.brands.reduce((a, x) => a + x.skuCnt, 0);
  b.add('SKU x channel lines without an actual cost (left out of the margin)', noCost, { unit: 'count', source: `${s}.noCost` });
  b.add('SKU x channel lines in total', lines, { unit: 'count', source: `${s}.lines` });
  for (const x of top(o.brands, (y) => y.nsv, 5)) {
    const n = o.bn(x.brand) || x.brand || '(no brand)';
    b.add(`Brand ${n}: NSV`, L(x.nsv), { unit: 'lakh', source: `${s}.brand.${x.brand}.nsv`, dp: 1 });
    if (x.gmPct) b.add(`Brand ${n}: gross margin in percent`, x.gmPct, { unit: '%', source: `${s}.brand.${x.brand}.gmPct`, dp: 1 });
  }
  return {
    feature: 'sales', title: `Sales view, plants ${o.plants || 'all'}, ${o.period}`, facts: b, ignore: o.plants.split(/[\s,;]+/),
    task: `Review the sales view (GSV to NSV to COGM to gross margin) for ${o.period}. Say how large the deductions are, how the margin looks, which brands carry the sales, and how many lines have no actual cost so the margin is not complete.`,
    template: () => listTemplate(`Sales view, ${o.period}:`, b.list(), 20),
  };
}

/* ---------- Freight analysis ---------- */
export function freightSpec(o: { totals: AnalysisTotals; materials: MaterialWeighted[]; plants: PlantCompare[]; rule: string; period: string }): NarrateSpec {
  const b = new FactBook(); const s = 'freight';
  b.add('Components analysed', o.totals.rows, { unit: 'count', source: `${s}.rows` });
  b.add('Components in alert by the chosen rule', o.totals.flagged, { unit: 'count', source: `${s}.flagged` });
  b.add('Components with actual freight above standard', o.totals.above, { unit: 'count', source: `${s}.above` });
  b.add('Components with actual freight below standard', o.totals.below, { unit: 'count', source: `${s}.below` });
  b.add('Components with no actual freight in the range', o.totals.noActual, { unit: 'count', source: `${s}.noActual` });
  for (const m of o.materials.filter((x) => x.variancePct).sort((x, y) => y.variancePct!.cmp(x.variancePct!)).slice(0, 4)) {
    b.add(`Material ${m.material} ${m.text}: freight variance in percent`, m.variancePct!, { unit: '%', source: `${s}.material.${m.material}.pct`, dp: 1 });
    if (m.variance) b.add(`Material ${m.material}: freight variance per unit`, m.variance, { unit: 'INR/unit', source: `${s}.material.${m.material}.variance`, dp: 4 });
  }
  for (const p of o.plants.filter((x) => x.bothLines).sort((x, y) => y.variance.abs().cmp(x.variance.abs())).slice(0, 4)) {
    b.add(`Plant ${p.plant}: freight variance (actual minus standard)`, p.variance, { unit: 'INR', source: `${s}.plant.${p.plant}.variance`, dp: 0 });
    if (p.variancePct) b.add(`Plant ${p.plant}: freight variance in percent`, p.variancePct, { unit: '%', source: `${s}.plant.${p.plant}.pct`, dp: 1 });
  }
  return {
    feature: 'freight', title: `Freight analysis, ${o.period}`, facts: b, ignore: o.plants.map((p) => p.plant),
    task: `Review the freight analysis (standard vs actual freight of raw and packing materials), ${o.period}, alert rule: ${o.rule}. Say how many components breach the rule, which materials and plants drift most, and where there is no actual freight yet.`,
    template: () => listTemplate(`Freight analysis, ${o.period}:`, b.list(), 18),
  };
}

/* ---------- Rigid packing rate (ZRIGID, read-only) ---------- */
import type { VendorLine } from '../../rigid/model';
import type { RigidAlert } from '../../rigid/analysis';
export function rigidSpec(o: { item: string; plant: string; vendors: VendorLine[]; alerts: RigidAlert[]; cockpitRatePc: Decimal | null; budgetPc: Decimal | null; lastSaved: Decimal | null; resinShare: Decimal | null; convShare: Decimal | null }): NarrateSpec {
  const b = new FactBook(); const s = 'rigid';
  const best = o.vendors[0];
  if (best) {
    b.add('Cheapest ZRIGID landed rate per 1000 pieces', best.landed, { unit: 'INR', source: `${s}.best.landed`, dp: 0 });
    b.add('Cheapest ZRIGID landed rate per piece', best.landed.div(1000), { unit: 'INR/pc', source: `${s}.best.landedPc`, dp: 4 });
    b.add('Output per day of the cheapest mould and vendor', best.output, { unit: 'pcs', source: `${s}.best.output` });
    if (o.resinShare) b.add('Share of resin in the landed rate', o.resinShare, { unit: '%', source: `${s}.best.resinShare`, dp: 1 });
    if (o.convShare) b.add('Share of conversion in the landed rate', o.convShare, { unit: '%', source: `${s}.best.convShare`, dp: 1 });
    if (o.vendors.length > 1) b.add('Landed rate difference per 1000 pieces between the dearest and the cheapest mould or vendor', o.vendors[o.vendors.length - 1].diff, { unit: 'INR', source: `${s}.spread`, dp: 0 });
  }
  b.add('Mould and vendor combinations calculated', o.vendors.length, { unit: 'count', source: `${s}.count` });
  if (o.cockpitRatePc) b.add('Rate per piece used in this costing', o.cockpitRatePc, { unit: 'INR/pc', source: `${s}.cockpit`, dp: 4 });
  if (o.budgetPc) b.add('Budget landed rate per piece', o.budgetPc, { unit: 'INR/pc', source: `${s}.budget`, dp: 4 });
  if (o.lastSaved) b.add('Last rate per 1000 pieces saved by ZRIGID', o.lastSaved, { unit: 'INR', source: `${s}.lastSaved`, dp: 0 });
  b.add('Alerts raised', o.alerts.length, { unit: 'count', source: `${s}.alerts` });
  return {
    feature: 'rigid', title: `Rigid packing rate ${o.item}, plant ${o.plant}`, facts: b, ignore: [o.item, o.plant],
    task: `Explain the ZRIGID bottom-up rate of the rigid packing item ${o.item} in plant ${o.plant}: the cheapest mould and vendor, how much of the rate is resin and how much conversion, how it compares with the rate used in this costing, the budget and the last saved rate, and what the alerts mean. Say plainly that this is a simulation and nothing is posted to SAP.`,
    template: () => listTemplate(`Rigid packing rate ${o.item}, plant ${o.plant}:`, b.list(), 16),
  };
}
