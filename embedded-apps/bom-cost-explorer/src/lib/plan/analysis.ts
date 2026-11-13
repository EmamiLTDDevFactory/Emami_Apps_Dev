/**
 * Budget analysis of a costed plan (the decision workbook): pure maths on the CostLineSet Mode P leaf lines, no SAP calls.
 *
 *   Current cost  = the rate SAP selected (TotCostPcInr per component unit, freight in) x the component quantity of the plan
 *   Budget cost   = the zcomponent / zcomponent_n budget landed rate SAP attached to the line (BudLanded, INR; BudSrcamt in BudSrccurr =
 *                   local currency) x the same quantity. A leaf with no budget rate is costed at the current rate and counted as "no budget".
 *                   SAP sends that rate per PRICE unit (e.g. 65,000 per kg) while the BOM quantity is in the component unit (e.g. g): it is brought to
 *                   the component unit with the line's own factor SelRate / SelRatePc (1,000 for kg -> g). Without a selected rate the factor is unknown:
 *                   the rate is used as sent and the line is listed on Risks & gaps.
 *   Prior year    = the previous year's zcomponent (India) / zcomponent_n (other countries) landed rate of the same component and plant, x the same
 *                   quantity (like for like). Local-currency rates are turned into INR at the line's own exchange rate.
 *   Product cost  = per plan country + plant + FG: sum of its leaf costs, per piece = / plan quantity.
 */
import { isLeafRow } from '../cost/tree';
import { costCategory, CATEGORIES, type CostCategory } from '../cost/categories';
import { componentFreightInr, type FreightTagged } from '../cost/freightIncluded';
import { FISCAL_MONTHS, monthKeys, type PlanCostLine } from './fields';
import { headerKey } from './maths';
import type { PlanFailure } from './batchRun';

export type Line = PlanCostLine & FreightTagged;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const strip = (m: string) => m.replace(/^0+(?=\d)/, '');
export const pct = (a: number, b: number): number | null => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const div = (a: number, b: number): number | null => (b ? a / b : null);
const QTY = monthKeys('QtyM');

/** Previous-year rate of one component: per unit in `curr`, and in INR when it could be converted. */
export interface PriorRate { rate: number; curr: string; inr: number | null }
export type PriorRates = Map<string, PriorRate>;
export const priorKey = (land1: string, werks: string, matnr: string) => `${land1 || 'IN'}|${werks}|${strip(matnr)}`;
export interface PriorStatus { year: string; asked: number; found: number; notes: string[] }

/** INR per 1 unit of the line's local currency; null when it cannot be told. */
export function lineFxInr(l: Line): number | null {
  const inr = n(l.TotCostPcInr); const loc = n(l.TotCostPcLoc);
  if (inr > 0 && loc > 0) return inr / loc;
  if (!l.LocCurr || l.LocCurr === 'INR') return 1;
  return n(l.BudExchrate) > 0 ? n(l.BudExchrate) : null;
}

/** One leaf of one FG with every rate and cost the workbook shows. */
export interface Item {
  key: string; land1: string; hwerks: string; fg: string; fgText: string; planQty: number;
  comp: string; compText: string; mtart: string; cat: CostCategory; unit: string; compPlant: string; level: number;
  qtyTotal: number; qtyPerPc: number; months: number[];
  source: string; vendor: string; vendorName: string; rateInr: number; freightInr: number; totalPcInr: number; costInr: number;
  locCurr: string; ratePcLoc: number; costLoc: number;
  budgetRateInr: number | null; budgetSrcAmt: number | null; budgetCurr: string; budgetSource: string; budgetYr: string; budgetCostInr: number | null; budgetCostLoc: number | null;
  priorRateInr: number | null; priorRateLoc: number | null; priorCurr: string; priorCostInr: number | null;
  budgetVsCurrentPct: number | null; yoyPct: number | null;
  hasRate: boolean; hasBudget: boolean; unitKnown: boolean; unitFactor: number;
}

export interface Fg {
  key: string; land1: string; landx: string; hwerks: string; fg: string; fgText: string; planQty: number; bomSrc: string; leaves: number; noRate: number; noBudget: number;
  costInr: number; costPcInr: number | null; costLoc: number; locCurr: string; costPcLoc: number | null;
  budgetInr: number; budgetPcInr: number | null; budgetLoc: number | null; priorInr: number | null; priorPcInr: number | null; priorCovered: number;
  byCat: Record<CostCategory, number>; freightInr: number;
  yoyPct: number | null; budgetVsCurrentPct: number | null;
  months: number[]; // budget cost per month
}

export interface Comp {
  key: string; comp: string; compText: string; mtart: string; cat: CostCategory; unit: string; compPlant: string; fgCount: number; plants: string[];
  qty: number; currentInr: number; budgetInr: number; avgCurrentRate: number | null; avgBudgetRate: number | null; priorInr: number | null; avgPriorRate: number | null;
  noBudget: boolean; yoyPct: number | null; budgetVsCurrentPct: number | null; source: string; vendor: string;
  share: number; cumShare: number; abc: 'A' | 'B' | 'C';
}

export interface Group {
  key: string; label: string; fgs: number; planQty: number; items: number; costInr: number; budgetInr: number; priorInr: number | null; priorBudgetInr: number; byCat: Record<CostCategory, number>; freightInr: number;
  months: number[]; locCurr: string; costLoc: number; noRate: number; noBudget: number; share: number; yoyPct: number | null; budgetVsCurrentPct: number | null;
}

export interface PlanAnalysis {
  items: Item[]; fgs: Fg[]; comps: Comp[]; plants: Group[]; countries: Group[]; plantCountry: Group[];
  sources: { source: string; items: number; costInr: number; share: number }[];
  vendors: { vendor: string; name: string; items: number; comps: number; costInr: number; share: number }[];
  sensitivity: { label: string; pct: number; impactInr: number; impactPct: number | null }[];
  risks: { type: string; ref: string; detail: string }[];
  totals: Totals; prior: PriorStatus | null;
}
export interface Totals {
  fgs: number; plants: number; countries: number; comps: number; items: number; planQty: number; costInr: number; budgetInr: number; priorInr: number | null; priorBudgetInr: number; priorCoverage: number;
  byCat: Record<CostCategory, number>; freightInr: number; noRate: number; noBudget: number; yoyPct: number | null; budgetVsCurrentPct: number | null; months: number[]; failed: number;
}

const zeroCat = (): Record<CostCategory, number> => ({ RM: 0, PERFUME: 0, PM: 0, OTHER: 0 });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildItems(lines: Line[], prior: PriorRates | null): Item[] {
  const planQtyOf = new Map<string, number>();
  for (const l of lines) { const k = headerKey(l); if (!planQtyOf.has(k)) planQtyOf.set(k, n(l.PlanQty)); }
  const out: Item[] = [];
  for (const l of lines) {
    if (!isLeafRow(l)) continue;
    const key = headerKey(l);
    const planQty = planQtyOf.get(key) ?? 0;
    const qty = n(l.QtyTot);
    const fx = lineFxInr(l);
    const costInr = n(l.TotCostInr);
    const hasBudget = n(l.BudLanded) > 0;
    const uf = n(l.SelRate) > 0 && n(l.SelRatePc) > 0 ? n(l.SelRate) / n(l.SelRatePc) : null; // price unit -> component unit
    const budgetRate = hasBudget ? n(l.BudLanded) / (uf ?? 1) : null;
    const pr = prior?.get(priorKey(l.Land1, l.Werks, l.Idnrk)) ?? null;
    const priorInrRaw = pr ? (pr.inr ?? (pr.curr === 'INR' ? pr.rate : null)) : null;
    const priorInr = priorInrRaw === null ? null : priorInrRaw / (uf ?? 1);
    const curRate = n(l.TotCostPcInr);
    out.push({
      key, land1: l.Land1, hwerks: l.Hwerks, fg: l.Headmat, fgText: l.Headtxt, planQty,
      comp: l.Idnrk, compText: l.Maktx, mtart: l.Mtart, cat: costCategory(l), unit: l.Meins, compPlant: l.Werks, level: l.Level,
      qtyTotal: qty, qtyPerPc: planQty ? qty / planQty : 0, months: QTY.map((k) => n((l as unknown as Record<string, unknown>)[k])),
      source: l.SelSource || 'NO RATE', vendor: l.SelVendor, vendorName: l.SelVname,
      rateInr: n(l.SelRatePcInr), freightInr: componentFreightInr(l).toNumber(), totalPcInr: curRate, costInr,
      locCurr: l.LocCurr, ratePcLoc: n(l.SelRatePcLoc), costLoc: n(l.TotCostLoc),
      budgetRateInr: budgetRate, budgetSrcAmt: hasBudget && n(l.BudSrcamt) ? n(l.BudSrcamt) / (uf ?? 1) : null, budgetCurr: l.BudSrccurr, budgetSource: l.BudSource, budgetYr: l.BudGjahr,
      budgetCostInr: budgetRate === null ? null : budgetRate * qty,
      budgetCostLoc: hasBudget && n(l.BudSrcamt) ? (n(l.BudSrcamt) / (uf ?? 1)) * qty : hasBudget && fx ? (budgetRate as number) * qty / fx : null,
      priorRateInr: priorInr, priorRateLoc: pr ? pr.rate / (uf ?? 1) : null, priorCurr: pr ? pr.curr : '', priorCostInr: priorInr === null ? null : priorInr * qty,
      budgetVsCurrentPct: budgetRate !== null && curRate ? pct(budgetRate, curRate) : null,
      yoyPct: budgetRate !== null && priorInr ? pct(budgetRate, priorInr) : null,
      hasRate: !!l.SelSource, hasBudget, unitKnown: uf !== null, unitFactor: uf ?? 1,
    });
  }
  return out;
}

/** The cost that counts for decisions: budget when there is a budget rate, else the current rate (flagged as no budget). */
const bud = (i: Item) => (i.budgetCostInr === null ? i.costInr : i.budgetCostInr);

export function rollupFgs(items: Item[], lines: Line[]): Fg[] {
  const meta = new Map<string, Line>();
  for (const l of lines) if (!meta.has(headerKey(l))) meta.set(headerKey(l), l);
  const by = new Map<string, Item[]>();
  for (const i of items) (by.get(i.key) ?? by.set(i.key, []).get(i.key)!).push(i);
  // FGs without leaves (no BOM / nothing costed) still appear, with zero cost.
  for (const k of meta.keys()) if (!by.has(k)) by.set(k, []);
  const out: Fg[] = [];
  for (const [key, its] of by) {
    const m = meta.get(key)!;
    const planQty = n(m.PlanQty);
    const costInr = sum(its.map((i) => i.costInr));
    const budgetInr = sum(its.map(bud));
    const covered = its.filter((i) => i.priorCostInr !== null);
    const priorInr = covered.length ? sum(its.map((i) => (i.priorCostInr === null ? bud(i) : i.priorCostInr))) : null; // uncovered leaves at budget so the two totals compare
    const budgetOfCovered = sum(covered.map(bud));
    const byCat = zeroCat();
    for (const i of its) byCat[i.cat] += bud(i);
    const months = QTY.map((_, mi) => sum(its.map((i) => i.months[mi] * (i.budgetRateInr ?? i.totalPcInr))));
    const locCurr = its.find((i) => i.locCurr)?.locCurr ?? '';
    const costLoc = sum(its.map((i) => i.costLoc));
    const bLoc = its.every((i) => i.budgetCostLoc !== null) && its.length ? sum(its.map((i) => i.budgetCostLoc ?? 0)) : null;
    out.push({
      key, land1: m.Land1, landx: m.Landx, hwerks: m.Hwerks, fg: m.Headmat, fgText: m.Headtxt, planQty, bomSrc: m.BomSrc, leaves: its.length,
      noRate: its.filter((i) => !i.hasRate).length, noBudget: its.filter((i) => !i.hasBudget).length,
      costInr, costPcInr: div(costInr, planQty), costLoc, locCurr, costPcLoc: div(costLoc, planQty),
      budgetInr, budgetPcInr: div(budgetInr, planQty), budgetLoc: bLoc, priorInr, priorPcInr: priorInr === null ? null : div(priorInr, planQty), priorCovered: covered.length,
      byCat, freightInr: sum(its.map((i) => i.freightInr * i.qtyTotal)),
      yoyPct: priorInr === null || !covered.length ? null : pct(sum(its.map(bud)), priorInr), budgetVsCurrentPct: pct(budgetInr, costInr), months,
    });
    void budgetOfCovered;
  }
  return out.sort((a, b) => a.land1.localeCompare(b.land1) || a.hwerks.localeCompare(b.hwerks) || b.budgetInr - a.budgetInr);
}

export function rollupComps(items: Item[]): Comp[] {
  const by = new Map<string, Item[]>();
  for (const i of items) { const k = `${i.compPlant}|${i.comp}`; (by.get(k) ?? by.set(k, []).get(k)!).push(i); }
  const rows = [...by].map(([key, its]) => {
    const f = its[0];
    const qty = sum(its.map((i) => i.qtyTotal));
    const currentInr = sum(its.map((i) => i.costInr));
    const budgetInr = sum(its.map(bud));
    const cov = its.filter((i) => i.priorCostInr !== null);
    const priorQty = sum(cov.map((i) => i.qtyTotal));
    const priorInr = cov.length ? sum(cov.map((i) => i.priorCostInr as number)) : null;
    const avgBud = div(budgetInr, qty);
    return {
      key, comp: f.comp, compText: f.compText, mtart: f.mtart, cat: f.cat, unit: f.unit, compPlant: f.compPlant, fgCount: new Set(its.map((i) => i.key)).size, plants: [...new Set(its.map((i) => i.hwerks))].sort(),
      qty, currentInr, budgetInr, avgCurrentRate: div(currentInr, qty), avgBudgetRate: avgBud, priorInr, avgPriorRate: priorInr === null ? null : div(priorInr, priorQty),
      noBudget: its.every((i) => !i.hasBudget), yoyPct: priorInr === null ? null : pct(sum(cov.map(bud)), priorInr), budgetVsCurrentPct: pct(budgetInr, currentInr),
      source: f.source, vendor: f.vendorName || f.vendor, share: 0, cumShare: 0, abc: 'C' as 'A' | 'B' | 'C',
    };
  }).sort((a, b) => b.budgetInr - a.budgetInr);
  const total = sum(rows.map((r) => r.budgetInr));
  let cum = 0;
  for (const r of rows) {
    r.share = total ? r.budgetInr / total : 0;
    cum += r.share; r.cumShare = cum;
    r.abc = cum - r.share < 0.8 ? 'A' : cum - r.share < 0.95 ? 'B' : 'C'; // the component that crosses 80% / 95% still belongs to the higher class
  }
  return rows;
}

function groupBy(fgs: Fg[], items: Item[], keyOf: (f: { land1: string; hwerks: string }) => string, labelOf: (f: Fg) => string): Group[] {
  const by = new Map<string, Fg[]>();
  for (const f of fgs) (by.get(keyOf(f)) ?? by.set(keyOf(f), []).get(keyOf(f))!).push(f);
  const total = sum(fgs.map((f) => f.budgetInr));
  return [...by].map(([key, fs]) => {
    const byCat = zeroCat();
    for (const f of fs) for (const c of CATEGORIES) byCat[c] += f.byCat[c];
    const cov = fs.filter((f) => f.priorInr !== null);
    const priorInr = cov.length ? sum(fs.map((f) => f.priorInr ?? f.budgetInr)) : null;
    const budgetInr = sum(fs.map((f) => f.budgetInr));
    const costInr = sum(fs.map((f) => f.costInr));
    return {
      key, label: labelOf(fs[0]), fgs: fs.length, planQty: sum(fs.map((f) => f.planQty)), items: sum(fs.map((f) => f.leaves)), costInr, budgetInr, priorInr, priorBudgetInr: sum(cov.map((f) => f.budgetInr)),
      byCat, freightInr: sum(fs.map((f) => f.freightInr)), months: QTY.map((_, i) => sum(fs.map((f) => f.months[i]))),
      locCurr: [...new Set(fs.map((f) => f.locCurr).filter(Boolean))].join('/'), costLoc: sum(fs.map((f) => f.costLoc)),
      noRate: sum(fs.map((f) => f.noRate)), noBudget: sum(fs.map((f) => f.noBudget)), share: total ? budgetInr / total : 0,
      yoyPct: priorInr === null ? null : pct(budgetInr, priorInr), budgetVsCurrentPct: pct(budgetInr, costInr),
    };
  }).sort((a, b) => b.budgetInr - a.budgetInr);
  void items;
}

export function analyse(lines: PlanCostLine[], prior: PriorRates | null, status: PriorStatus | null = null, failed: PlanFailure[] = []): PlanAnalysis {
  const ls = lines as Line[];
  const items = buildItems(ls, prior);
  const fgs = rollupFgs(items, ls);
  const comps = rollupComps(items);
  const plants = groupBy(fgs, items, (f) => f.hwerks, (f) => f.hwerks);
  const countries = groupBy(fgs, items, (f) => f.land1, (f) => f.land1);
  const plantCountry = groupBy(fgs, items, (f) => `${f.hwerks}|${f.land1}`, (f) => `${f.hwerks} · ${f.land1}`);
  const totalBud = sum(items.map(bud));

  const srcMap = new Map<string, { items: number; costInr: number }>();
  for (const i of items) { const s = srcMap.get(i.source) ?? { items: 0, costInr: 0 }; s.items++; s.costInr += bud(i); srcMap.set(i.source, s); }
  const sources = [...srcMap].map(([source, v]) => ({ source, ...v, share: totalBud ? v.costInr / totalBud : 0 })).sort((a, b) => b.costInr - a.costInr);

  const vMap = new Map<string, { name: string; items: number; comps: Set<string>; costInr: number }>();
  for (const i of items) {
    if (!i.vendor) continue;
    const v = vMap.get(i.vendor) ?? { name: i.vendorName, items: 0, comps: new Set<string>(), costInr: 0 };
    v.items++; v.comps.add(i.comp); v.costInr += bud(i); vMap.set(i.vendor, v);
  }
  const vendors = [...vMap].map(([vendor, v]) => ({ vendor, name: v.name, items: v.items, comps: v.comps.size, costInr: v.costInr, share: totalBud ? v.costInr / totalBud : 0 })).sort((a, b) => b.costInr - a.costInr);

  const catTotals = zeroCat();
  for (const i of items) catTotals[i.cat] += bud(i);
  const sensitivity = ([['RM +5%', ['RM', 'PERFUME'], 5], ['RM +10%', ['RM', 'PERFUME'], 10], ['PM +5%', ['PM'], 5], ['PM +10%', ['PM'], 10], ['All materials +5%', CATEGORIES, 5], ['All materials +10%', CATEGORIES, 10], ['All materials -5%', CATEGORIES, -5]] as [string, CostCategory[], number][])
    .map(([label, cats, p]) => { const impact = sum(cats.map((c) => catTotals[c])) * p / 100; return { label, pct: p, impactInr: impact, impactPct: totalBud ? (impact / totalBud) * 100 : null }; });

  const risks: PlanAnalysis['risks'] = [];
  for (const f of failed) for (const m of f.materials) risks.push({ type: 'Not costed (SAP failed)', ref: `${f.werks} ${strip(m)}`, detail: f.message });
  for (const f of fgs) {
    const ref = `${f.hwerks} ${f.land1} ${strip(f.fg)} ${f.fgText}`;
    if (!f.leaves) risks.push({ type: 'FG without cost lines', ref, detail: 'No leaf lines came back from SAP (no usable BOM).' });
    if (f.planQty <= 0) risks.push({ type: 'Zero plan quantity', ref, detail: 'Cost per piece cannot be worked out.' });
    if (f.bomSrc && f.bomSrc !== 'OWN') risks.push({ type: 'BOM taken from another plant', ref, detail: `BOM source ${f.bomSrc}: the plant has no BOM of its own.` });
  }
  for (const c of comps) {
    const ref = `${c.compPlant} ${strip(c.comp)} ${c.compText}`;
    if (c.noBudget) risks.push({ type: 'No budget rate (zcomponent)', ref, detail: `Costed at the current rate; ${c.fgCount} FG(s), budget-cost value ${Math.round(c.budgetInr).toLocaleString('en-IN')} INR.` });
    if (c.currentInr > 0 && !c.avgCurrentRate) risks.push({ type: 'No rate', ref, detail: 'SAP selected no rate for this component.' });
    if (c.budgetVsCurrentPct !== null && !c.noBudget && Math.abs(c.budgetVsCurrentPct) >= 10) risks.push({ type: c.budgetVsCurrentPct > 0 ? 'Budget rate above current rate (>=10%)' : 'Budget rate below current rate (>=10%): exposure', ref, detail: `${c.budgetVsCurrentPct.toFixed(1)}% on ${Math.round(c.budgetInr).toLocaleString('en-IN')} INR of budget cost.` });
  }
  const unitless = items.filter((i) => i.hasBudget && !i.unitKnown);
  if (unitless.length) risks.push({ type: 'Budget price unit not verified', ref: `${unitless.length} FG line(s)`, detail: 'No selected rate on these lines, so the budget rate could not be brought from its price unit (e.g. kg) to the BOM unit (e.g. g). It is used as sent: check these components.' });
  for (const i of items) if (!i.hasRate) risks.push({ type: 'Leaf without a rate', ref: `${i.hwerks} ${i.land1} ${strip(i.fg)} / ${strip(i.comp)} ${i.compText}`, detail: 'SelSource is blank: cost is zero or missing.' });

  const priorBudgetInr = sum(fgs.filter((f) => f.priorInr !== null).map((f) => f.budgetInr));
  const priorInr = fgs.some((f) => f.priorInr !== null) ? sum(fgs.map((f) => f.priorInr ?? f.budgetInr)) : null;
  const totals: Totals = {
    fgs: fgs.length, plants: plants.length, countries: countries.length, comps: comps.length, items: items.length, planQty: sum(fgs.map((f) => f.planQty)),
    costInr: sum(fgs.map((f) => f.costInr)), budgetInr: totalBud, priorInr, priorBudgetInr, priorCoverage: items.length ? items.filter((i) => i.priorCostInr !== null).length / items.length : 0,
    byCat: catTotals, freightInr: sum(fgs.map((f) => f.freightInr)), noRate: items.filter((i) => !i.hasRate).length, noBudget: items.filter((i) => !i.hasBudget).length,
    yoyPct: priorInr === null ? null : pct(totalBud, priorInr), budgetVsCurrentPct: pct(totalBud, sum(fgs.map((f) => f.costInr))), months: QTY.map((_, i) => sum(fgs.map((f) => f.months[i]))), failed: failed.reduce((a, f) => a + f.materials.length, 0),
  };
  return { items, fgs, comps, plants, countries, plantCountry, sources, vendors, sensitivity, risks, totals, prior: status };
}

export { FISCAL_MONTHS };
