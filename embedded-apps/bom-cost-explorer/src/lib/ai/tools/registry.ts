/**
 * Ask-the-costing assistant tools - READ-ONLY. Each wraps existing app logic (SAP client, filter builders, what-if
 * engine) and returns { summary, rows (max 50), facts } with fact ids from the question's shared FactBook, so the final
 * answer can be validated by the numbers rule. Full results stay in this browser under result_id (30 minutes); the
 * model only sees summaries and capped rows. Vendor names are masked (V1, V2 ...). SAP costing runs need the user's
 * confirmation (unless an identical result from the last 10 minutes exists) and at most 2 run per question.
 */
import { z } from 'zod';
import { D, ZERO, type Decimal } from '../../cost/decimal';
import { isLeafRow } from '../../cost/tree';
import { costCategory, CATEGORY_LABEL } from '../../cost/categories';
import { simulate, EMPTY_SIM, type SimSettings } from '../../cost/simulate';
import { api, type CostResult } from '../../client/api';
import { fetchMaterials } from '../../sap/service';
import { loadHierMaterials } from '../../client/hier';
import { attachRateOptions, fetchRateOptions } from '../../rates/options';
import { loadFreightBreakup } from '../../freight/useFreightBreakup';
import { freightKeyOf, selectedRows } from '../../freight/breakup';
import { defaultQuery, RATE_SOURCES, type CostQuery } from '../../query/schema';
import { defaultPlanCostQuery } from '../../plan/requests';
import { fetchPlanSummary } from '../../plan/client';
import { shortage } from '../../plan/maths';
import { buildSnapshots, listSnapshots, loadSnapshot } from '../../snapshots/snapshot';
import { budgetBaseline, explainChange } from '../variance';
import type { FactBook } from '../facts';
import type { VendorMask } from '../guard';
import type { CostLine } from '../../sap/fields';
import type { ToolDef } from '../gateway';
import { fetchMis, fetchSales, fetchMargin } from '../../dash/service';
import { brandViews, totals as misTotals, salesViews, brandSales, salesTotals } from '../../dash/logic';
import { parseMargin, totalOf, NO_DRIVERS } from '../../dash/margin';

export const ROW_CAP = 50;
const RESULT_TTL = 30 * 60_000;
const RECENT_MS = 10 * 60_000;
export const MAX_SAP_RUNS = 2;

export interface StoredResult { id: string; at: number; query: CostQuery; result: CostResult; rows: CostLine[] }
const results = new Map<string, StoredResult>();
const recent = new Map<string, string>(); // query hash -> result id
export const clearAiResults = () => { results.clear(); recent.clear(); };

export interface ToolContext {
  book: FactBook; mask: VendorMask; system: string;
  /** asks the user to confirm a SAP run; resolves true for Run */
  confirm: (req: { tool: string; materials: string[]; plant: string; qty: string; prio: string; donor: string; lookback: number }) => Promise<boolean>;
  /** the current screen's run, offered as result "current" */
  current?: { query: CostQuery; result: CostResult } | null;
  sapRuns: number;
}

export interface ToolOutput { summary: string; rows?: unknown[]; facts?: { id: string; label: string; display: string; unit: string }[]; result_id?: string; [k: string]: unknown }

const fact = (c: ToolContext, label: string, v: Decimal | number | string, unit: string, source: string, dp?: number) => c.book.add(label, v, { unit, source, dp });
const factsOf = (c: ToolContext, ids: string[]) => ids.map((id) => { const f = c.book.get(id)!; return { id, label: f.label, display: f.display, unit: f.unit }; });
const store = (q: CostQuery, r: CostResult) => {
  const id = `R${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  results.set(id, { id, at: Date.now(), query: q, result: r, rows: r.rows });
  recent.set(JSON.stringify(q), id);
  return id;
};
function getResult(c: ToolContext, id: string): StoredResult {
  if (id === 'current' && c.current) {
    const hit = recent.get(JSON.stringify(c.current.query));
    if (hit && results.has(hit)) return results.get(hit)!;
    const nid = store(c.current.query, c.current.result);
    return results.get(nid)!;
  }
  const r = results.get(id);
  if (!r || Date.now() - r.at > RESULT_TTL) throw new Error(`Result ${id} is not available (expired after 30 minutes). Run the costing again.`);
  return r;
}
const leafRows = (rows: CostLine[]) => rows.filter(isLeafRow);
const perPcBase = (q: CostQuery) => (D(q.explQty).gt(0) ? D(q.explQty) : D(1));

/* ---------- definitions (JSON schema for the model; zod for validation) ---------- */

const S = {
  search_materials: z.object({ text: z.string().default(''), brand: z.string().optional(), product: z.string().optional(), crs: z.string().optional(), mtart: z.string().optional() }),
  search_plants: z.object({ text: z.string().default('') }),
  run_costing: z.object({ matnr: z.array(z.string().min(1)).min(1).max(10), werks: z.string().min(1), qty: z.union([z.string(), z.number()]).default('1'), prio: z.array(z.enum(RATE_SOURCES)).optional(), donor: z.string().optional(), lookback: z.number().int().min(1).max(3650).optional(), freight_days: z.number().int().min(1).max(3650).optional(), std_frt: z.boolean().optional() }),
  get_result_summary: z.object({ result_id: z.string() }),
  top_cost_drivers: z.object({ result_id: z.string(), by: z.enum(['component', 'material_group', 'source', 'plant']).default('component'), n: z.number().int().min(1).max(50).default(10) }),
  find_components: z.object({ result_id: z.string(), filter: z.enum(['source', 'mbew_only', 'no_rate', 'donor', 'mtart', 'min_cost', 'low_cover']), value: z.string().optional() }),
  get_rate_options: z.object({ result_id: z.string(), idnrk: z.string() }),
  get_freight_breakup: z.object({ matnr: z.string(), werks: z.string() }),
  compare_plants: z.object({ matnr: z.string(), bom_werks: z.string(), plants: z.array(z.string()).min(1).max(10) }),
  explain_change: z.object({ current: z.string().default('current'), baseline: z.string().default('budget'), matnr: z.string().optional(), werks: z.string().optional() }),
  run_scenario: z.object({ result_id: z.string(), rate_pct_by_source: z.record(z.number()).optional(), component_pct: z.record(z.number()).optional(), fx_pct: z.record(z.number()).optional(), qty_pct: z.number().optional(), repick: z.enum(['sap', 'priority', 'cheapest', 'latest']).optional() }),
  get_plan_summary: z.object({ plan: z.string(), werks: z.string() }),
  get_shortages: z.object({ plan: z.string(), werks: z.string() }),
  get_mis: z.object({ plants: z.array(z.string().min(1)).min(1).max(10), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
  get_sales_summary: z.object({ plants: z.array(z.string()).max(10).default([]), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), vkorg: z.array(z.string()).max(5).optional(), matnr: z.array(z.string()).max(20).optional() }),
  get_margin_summary: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), plants: z.array(z.string()).max(10).default([]), vkorg: z.array(z.string()).max(5).default([]), matnr: z.array(z.string()).max(20).default([]) }),
};
export type ToolName = keyof typeof S;

const prop = (type: string, description: string, extra: Record<string, unknown> = {}) => ({ type, description, ...extra });
export const TOOL_DEFS: ToolDef[] = [
  { name: 'search_materials', description: 'Find materials by number or text (2+ characters), optionally by brand / product hierarchy / CRS / material type. Read-only.', input_schema: { type: 'object', properties: { text: prop('string', 'search text'), brand: prop('string', 'brand code'), product: prop('string', 'product hierarchy'), crs: prop('string', 'CRS code'), mtart: prop('string', 'material type, e.g. FERT') } } },
  { name: 'search_plants', description: 'List plants whose code or name contains the text.', input_schema: { type: 'object', properties: { text: prop('string', 'part of a plant code or name') } } },
  { name: 'run_costing', description: 'Run SAP BOM costing (Mode B) for up to 10 FG materials in one plant. Asks the user to confirm unless the same run exists from the last 10 minutes. Returns result_id and the cost per piece per FG.', input_schema: { type: 'object', required: ['matnr', 'werks'], properties: { matnr: prop('array', 'FG material numbers', { items: { type: 'string' } }), werks: prop('string', 'plant'), qty: prop('string', 'explosion quantity, default 1'), prio: prop('array', 'rate source priority', { items: { type: 'string', enum: [...RATE_SOURCES] } }), donor: prop('string', 'donor plant'), lookback: prop('integer', 'rate look-back days'), freight_days: prop('integer', 'freight look-back days'), std_frt: prop('boolean', 'standard freight instead of actual') } } },
  { name: 'get_result_summary', description: 'Cost per piece per FG of a result, split by RM / Perfume / PM / Other, and the settings used. result_id "current" = the run on screen.', input_schema: { type: 'object', required: ['result_id'], properties: { result_id: prop('string', 'result id or "current"') } } },
  { name: 'top_cost_drivers', description: 'Biggest cost items of a result per piece, grouped by component, material group, rate source or plant.', input_schema: { type: 'object', required: ['result_id'], properties: { result_id: prop('string', 'result id or "current"'), by: prop('string', 'grouping', { enum: ['component', 'material_group', 'source', 'plant'] }), n: prop('integer', 'how many, max 50') } } },
  { name: 'find_components', description: 'Components of a result matching a filter: source (value = CONTRACT/INFOREC/MARKT/CONSUMP/MBEW), mbew_only, no_rate, donor, mtart (value), min_cost (value = INR per piece), low_cover.', input_schema: { type: 'object', required: ['result_id', 'filter'], properties: { result_id: prop('string', 'result id or "current"'), filter: prop('string', 'filter', { enum: ['source', 'mbew_only', 'no_rate', 'donor', 'mtart', 'min_cost', 'low_cover'] }), value: prop('string', 'filter value where needed') } } },
  { name: 'get_rate_options', description: 'All rate options SAP found for one component of a result (source, rate per piece INR, vendor masked, which one was selected).', input_schema: { type: 'object', required: ['result_id', 'idnrk'], properties: { result_id: prop('string', 'result id or "current"'), idnrk: prop('string', 'component material') } } },
  { name: 'get_freight_breakup', description: 'Freight of a component in a plant split by condition type (latest PO, no look-back limit).', input_schema: { type: 'object', required: ['matnr', 'werks'], properties: { matnr: prop('string', 'component'), werks: prop('string', 'component plant') } } },
  { name: 'compare_plants', description: 'SAP plant comparison (Mode C): one BOM costed in several plants. Needs the user’s confirmation.', input_schema: { type: 'object', required: ['matnr', 'bom_werks', 'plants'], properties: { matnr: prop('string', 'FG'), bom_werks: prop('string', 'BOM plant'), plants: prop('array', 'plants to compare', { items: { type: 'string' } }) } } },
  { name: 'explain_change', description: 'Why the cost per piece changed: current result vs baseline ("budget", "previous" = last stored run of that FG, or another result_id). Gives quantity / rate / freight / FX effects and top drivers.', input_schema: { type: 'object', properties: { current: prop('string', 'result id or "current"'), baseline: prop('string', '"budget", "previous" or a result id'), matnr: prop('string', 'FG (if the result has several)'), werks: prop('string', 'plant') } } },
  { name: 'run_scenario', description: 'What-if on a result in the browser (no SAP): rate % by source, % by component (key plant|component), FX % by currency, quantity %, re-pick (priority/cheapest/latest). Returns simulated vs SAP cost per piece.', input_schema: { type: 'object', required: ['result_id'], properties: { result_id: prop('string', 'result id or "current"'), rate_pct_by_source: prop('object', 'e.g. {"CONTRACT":5}'), component_pct: prop('object', 'e.g. {"1000|RM0001":-3}'), fx_pct: prop('object', 'e.g. {"USD":2}'), qty_pct: prop('number', 'quantity change %'), repick: prop('string', 'rate re-pick', { enum: ['sap', 'priority', 'cheapest', 'latest'] }) } } },
  { name: 'get_plan_summary', description: 'Production plan component requirement for a plan and plant (top components by quantity).', input_schema: { type: 'object', required: ['plan', 'werks'], properties: { plan: prop('string', 'plan name, exactly'), werks: prop('string', 'plant') } } },
  { name: 'get_mis', description: 'MIS of the costing dashboard (read-only): budget vs actual COGM by brand, month and year to date, in rupees lakh, for production plants and an as-of date (default today). Brands over budget, finished goods without a budget.', input_schema: { type: 'object', required: ['plants'], properties: { plants: prop('array', 'production plant codes', { items: { type: 'string' } }), as_of: prop('string', 'YYYY-MM-DD, default today') } } },
  { name: 'get_sales_summary', description: 'Sales view of the dashboard (read-only): invoiced GSV, NSV, deductions, COGM and gross margin by brand for a period; optional billing plants, sales organisations and materials. COGM is SAP actual cost per piece of the period x sold quantity.', input_schema: { type: 'object', required: ['from', 'to'], properties: { from: prop('string', 'YYYY-MM-DD'), to: prop('string', 'YYYY-MM-DD'), plants: prop('array', 'billing plants, empty = all', { items: { type: 'string' } }), vkorg: prop('array', 'sales organisations', { items: { type: 'string' } }), matnr: prop('array', 'material numbers', { items: { type: 'string' } }) } } },
  { name: 'get_margin_summary', description: 'Margin analysis of the dashboard (read-only): gross margin and percent from the invoice cost conditions for a period; give at least one of materials, sales organisation or plants.', input_schema: { type: 'object', required: ['from', 'to'], properties: { from: prop('string', 'YYYY-MM-DD'), to: prop('string', 'YYYY-MM-DD'), plants: prop('array', 'plants', { items: { type: 'string' } }), vkorg: prop('array', 'sales organisations', { items: { type: 'string' } }), matnr: prop('array', 'material numbers', { items: { type: 'string' } }) } } },
  { name: 'get_shortages', description: 'Components of a plan and plant whose requirement exceeds stock plus open PO.', input_schema: { type: 'object', required: ['plan', 'werks'], properties: { plan: prop('string', 'plan name'), werks: prop('string', 'plant') } } },
];

/* ---------- implementations ---------- */

async function costOrConfirm(c: ToolContext, q: CostQuery, tool: string): Promise<{ id: string; r: StoredResult } | { declined: true } | { limit: true }> {
  const hit = recent.get(JSON.stringify(q));
  if (hit && results.has(hit) && Date.now() - results.get(hit)!.at < RECENT_MS) return { id: hit, r: results.get(hit)! };
  if (c.current && JSON.stringify(c.current.query) === JSON.stringify(q)) { const r = getResult(c, 'current'); return { id: r.id, r }; }
  if (c.sapRuns >= MAX_SAP_RUNS) return { limit: true };
  const ok = await c.confirm({ tool, materials: q.materials, plant: q.mode === 'C' ? q.bomPlant : q.plants.join(', '), qty: q.explQty, prio: q.prio.join(' > '), donor: q.donorPlant || 'none', lookback: q.lookback });
  if (!ok) return { declined: true };
  c.sapRuns++;
  const res = await api.cost(q);
  const id = store(q, res);
  return { id, r: results.get(id)! };
}

function fgTotals(c: ToolContext, r: StoredResult, src: string) {
  const base = perPcBase(r.query);
  const m = new Map<string, { head: string; text: string; plant: string; total: Decimal; mbew: number; norate: number; leaves: number }>();
  for (const l of leafRows(r.rows)) {
    const k = `${l.Hwerks}|${l.Headmat}`;
    const e = m.get(k) ?? { head: l.Headmat, text: l.Headtxt, plant: l.Hwerks, total: ZERO, mbew: 0, norate: 0, leaves: 0 };
    e.total = e.total.plus(D(l.TotCostInr)); e.leaves++;
    if (l.SelSource === 'MBEW') e.mbew++;
    if (!l.SelSource) e.norate++;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ fg: e.head, text: e.text, plant: e.plant, components: e.leaves, cost_per_pc: fact(c, `Cost per piece of ${e.head} in plant ${e.plant}`, e.total.div(base), 'INR/pc', src, 4), mbew_only_components: e.mbew, no_rate_components: e.norate }));
}

const settingsOf = (q: CostQuery, system: string) => ({ system, priority: q.prio.join(' > '), lookback_days: q.lookback, donor_plant: q.donorPlant || 'none', freight: q.inclFrt ? (q.stdFrt ? 'standard' : 'actual') : 'excluded', explosion_qty: q.explQty });

export async function runAiTool(name: string, input: Record<string, unknown>, c: ToolContext): Promise<ToolOutput> {
  const schema = S[name as ToolName];
  if (!schema) throw new Error(`Unknown tool ${name}`);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  const a = parsed.data as Record<string, unknown>;
  switch (name as ToolName) {
    case 'search_materials': {
      const t = String(a.text ?? '');
      const rows = a.brand || a.product || a.crs
        ? (await loadHierMaterials({ brand: a.brand ? [String(a.brand)] : [], product: a.product ? [String(a.product)] : [], sku: a.crs ? [String(a.crs)] : [], mtart: a.mtart ? String(a.mtart) : '', q: t }))?.rows ?? []
        : t.trim().length >= 2 ? await fetchMaterials(t) : [];
      const list = rows.filter((m) => !a.mtart || m.Mtart === a.mtart).slice(0, ROW_CAP).map((m) => ({ matnr: m.Matnr, text: m.Maktx, type: m.Mtart, unit: m.Meins }));
      return { summary: `${list.length} material(s) found.`, rows: list, facts: factsOf(c, [fact(c, 'Materials found', list.length, 'count', 'search_materials.count')]) };
    }
    case 'search_plants': {
      const t = String(a.text ?? '').toLowerCase();
      const { plants } = await api.plants();
      const list = plants.filter((p) => !t || `${p.Werks} ${p.Name1}`.toLowerCase().includes(t)).slice(0, ROW_CAP).map((p) => ({ plant: p.Werks, name: p.Name1 }));
      return { summary: `${list.length} plant(s).`, rows: list };
    }
    case 'run_costing': {
      const q: CostQuery = { ...defaultQuery('B'), materials: (a.matnr as string[]).map((m) => m.toUpperCase()), plants: [String(a.werks).toUpperCase()], explQty: String(a.qty ?? '1'),
        ...(a.prio ? { prio: a.prio as CostQuery['prio'] } : {}), ...(a.donor ? { donorPlant: String(a.donor).toUpperCase() } : {}), ...(a.lookback ? { lookback: a.lookback as number } : {}),
        ...(a.freight_days ? { freightDays: a.freight_days as number } : {}), ...(a.std_frt !== undefined ? { stdFrt: !!a.std_frt } : {}) };
      const out = await costOrConfirm(c, q, 'run_costing');
      if ('declined' in out) return { summary: 'The user declined the SAP run. Nothing was run.' };
      if ('limit' in out) return { summary: `Limit of ${MAX_SAP_RUNS} SAP runs per question reached. Answer with what you have.` };
      const fgs = fgTotals(c, out.r, `run_costing.${out.id}`);
      return { summary: `SAP costing done for ${fgs.length} FG(s). result_id ${out.id}.`, result_id: out.id, rows: fgs.map((f) => ({ ...f, cost_per_pc: `[${f.cost_per_pc}]` })), facts: factsOf(c, fgs.map((f) => f.cost_per_pc)), settings: settingsOf(q, c.system), sap_messages: out.r.result.messages.slice(0, 5).map((m) => m.message) };
    }
    case 'get_result_summary': {
      const r = getResult(c, String(a.result_id));
      const base = perPcBase(r.query);
      const fgs = fgTotals(c, r, `get_result_summary.${r.id}`);
      const cats = new Map<string, Decimal>();
      for (const l of leafRows(r.rows)) { const k = `${l.Headmat}|${CATEGORY_LABEL[costCategory(l)]}`; cats.set(k, (cats.get(k) ?? ZERO).plus(D(l.TotCostInr))); }
      const split = [...cats.entries()].slice(0, ROW_CAP).map(([k, v]) => { const [fg, cat] = k.split('|'); return { fg, category: cat, cost_per_pc: `[${fact(c, `${cat} cost per piece of ${fg}`, v.div(base), 'INR/pc', `get_result_summary.${r.id}.split`, 4)}]` }; });
      return { summary: `Result ${r.id}: ${fgs.length} FG(s), ${leafRows(r.rows).length} leaf lines.`, result_id: r.id, rows: [...fgs.map((f) => ({ ...f, cost_per_pc: `[${f.cost_per_pc}]` })), ...split], facts: factsOf(c, [...fgs.map((f) => f.cost_per_pc), ...split.map((s) => s.cost_per_pc.slice(1, -1))]), settings: settingsOf(r.query, c.system) };
    }
    case 'top_cost_drivers': {
      const r = getResult(c, String(a.result_id));
      const base = perPcBase(r.query);
      const by = String(a.by);
      const m = new Map<string, { key: string; text: string; cost: Decimal }>();
      for (const l of leafRows(r.rows)) {
        const k = by === 'component' ? `${l.Werks}|${l.Idnrk}` : by === 'material_group' ? (l.Matkl || '—') : by === 'source' ? (l.SelSource || 'NO RATE') : l.Hwerks;
        const e = m.get(k) ?? { key: k, text: by === 'component' ? l.Maktx : '', cost: ZERO };
        e.cost = e.cost.plus(D(l.TotCostInr)); m.set(k, e);
      }
      const list = [...m.values()].sort((x, y) => y.cost.cmp(x.cost)).slice(0, Math.min(Number(a.n), ROW_CAP));
      const ids = list.map((e) => fact(c, `Cost per piece of ${by} ${e.key}`, e.cost.div(base), 'INR/pc', `top_cost_drivers.${r.id}`, 4));
      return { summary: `Top ${list.length} by ${by}.`, rows: list.map((e, i) => ({ [by]: e.key, text: e.text, cost_per_pc: `[${ids[i]}]` })), facts: factsOf(c, ids) };
    }
    case 'find_components': {
      const r = getResult(c, String(a.result_id));
      const base = perPcBase(r.query);
      const f = String(a.filter); const v = String(a.value ?? '').toUpperCase();
      const leaves = leafRows(r.rows);
      const match = (l: CostLine) => f === 'source' ? l.SelSource === v : f === 'mbew_only' ? l.SelSource === 'MBEW' : f === 'no_rate' ? !l.SelSource : f === 'donor' ? !!l.Donor : f === 'mtart' ? l.Mtart === v
        : f === 'min_cost' ? D(l.TotCostInr).div(base).gte(D(v || '0')) : f === 'low_cover' ? (() => { const cov = Number((l as unknown as { CovH1?: string }).CovH1 ?? 999); return cov < 15; })() : false;
      const hits = leaves.filter(match);
      const list = hits.slice(0, ROW_CAP).map((l) => ({ fg: l.Headmat, plant: l.Werks, component: l.Idnrk, text: l.Maktx, type: l.Mtart, source: l.SelSource || 'NO RATE', donor: l.Donor || '', cost_per_pc: `[${fact(c, `Cost per piece of ${l.Idnrk} in ${l.Headmat}`, D(l.TotCostInr).div(base), 'INR/pc', `find_components.${r.id}`, 4)}]` }));
      const n = fact(c, `Components matching ${f}${v ? ` ${v}` : ''}`, hits.length, 'count', `find_components.${r.id}.count`);
      return { summary: `${hits.length} component line(s) match${hits.length > ROW_CAP ? `; first ${ROW_CAP} shown` : ''}.${f === 'mbew_only' ? ' MBEW only means no contract, info record, market or consumption rate was found in the look-back window.' : ''}`, rows: list, facts: factsOf(c, [n, ...list.map((x) => x.cost_per_pc.slice(1, -1))]) };
    }
    case 'get_rate_options': {
      const r = getResult(c, String(a.result_id));
      const opts = await fetchRateOptions(r.query);
      if ('unavailable' in opts) return { summary: `Rate options are not available from SAP: ${opts.reason}` };
      const withOpts = attachRateOptions(r.rows, opts.rows).filter((l) => l.Idnrk === String(a.idnrk).toUpperCase() && isLeafRow(l));
      const line = withOpts[0];
      if (!line) return { summary: `Component ${a.idnrk} is not in result ${r.id}.` };
      const list = (line.RateOptions ?? []).slice(0, ROW_CAP).map((o) => { const x = o as typeof o & { Vname?: string; Vendor?: string; Selected?: string }; return { source: o.Source, plant: o.Plant, vendor: c.mask.mask(x.Vname || x.Vendor), currency: o.Curr, valid_from: o.ValidFrom, selected: x.Selected === 'X' || o.Source === line.SelSource, rate_per_pc_inr: `[${fact(c, `${o.Source} rate per piece INR of ${line.Idnrk}${o.Plant ? ` (plant ${o.Plant})` : ''}`, o.RatePcInr, 'INR', `get_rate_options.${line.Idnrk}`, 4)}]` }; });
      return { summary: `${list.length} rate option(s) for ${line.Idnrk}; selected source ${line.SelSource || 'none'}.`, rows: list, facts: factsOf(c, list.map((x) => x.rate_per_pc_inr.slice(1, -1))) };
    }
    case 'get_freight_breakup': {
      const rows = await loadFreightBreakup(freightKeyOf({ Idnrk: String(a.matnr).toUpperCase(), Werks: String(a.werks).toUpperCase(), Hwerks: String(a.werks).toUpperCase() } as CostLine, { freightDays: 3650, stdFrt: false }));
      const used = selectedRows(rows).slice(0, ROW_CAP);
      const list = used.map((r) => ({ condition: r.Conditiontype, po: r.Purchasedocument, po_date: r.Podate, per_pc_local: `[${fact(c, `Freight per piece (local) ${r.Conditiontype} of ${a.matnr}`, r.UsedPcLoc, r.Localcurrency || 'INR', 'get_freight_breakup', 4)}]`, per_pc_inr: `[${fact(c, `Freight per piece INR ${r.Conditiontype} of ${a.matnr}`, r.UsedPcInr, 'INR', 'get_freight_breakup', 4)}]` }));
      return { summary: list.length ? `${list.length} freight condition(s) used.` : 'No freight rows found in SAP for this component and plant.', rows: list, facts: factsOf(c, list.flatMap((x) => [x.per_pc_local.slice(1, -1), x.per_pc_inr.slice(1, -1)])) };
    }
    case 'compare_plants': {
      const q: CostQuery = { ...defaultQuery('C'), materials: [String(a.matnr).toUpperCase()], bomPlant: String(a.bom_werks).toUpperCase(), compPlants: (a.plants as string[]).map((p) => p.toUpperCase()) };
      const out = await costOrConfirm(c, q, 'compare_plants');
      if ('declined' in out) return { summary: 'The user declined the SAP run. Nothing was run.' };
      if ('limit' in out) return { summary: `Limit of ${MAX_SAP_RUNS} SAP runs per question reached.` };
      const m = new Map<string, Decimal>();
      for (const l of leafRows(out.r.rows)) m.set(l.Hwerks, (m.get(l.Hwerks) ?? ZERO).plus(D(l.TotCostInr)));
      const list = [...m.entries()].map(([p, v]) => ({ plant: p, cost_per_pc: `[${fact(c, `Cost per piece of ${a.matnr} costed in plant ${p}`, v.div(perPcBase(q)), 'INR/pc', `compare_plants.${out.id}`, 4)}]` }));
      return { summary: `Plant comparison of ${a.matnr} (BOM plant ${a.bom_werks}).`, result_id: out.id, rows: list, facts: factsOf(c, list.map((x) => x.cost_per_pc.slice(1, -1))) };
    }
    case 'explain_change': {
      const r = getResult(c, String(a.current ?? 'current'));
      const snaps = buildSnapshots(r.rows, r.query, c.system, 'assistant');
      const cur = snaps.find((s) => (!a.matnr || s.sku === String(a.matnr).toUpperCase()) && (!a.werks || s.plant === String(a.werks).toUpperCase())) ?? snaps[0];
      if (!cur) return { summary: 'The result has no FG to explain.' };
      let baseLines; let baseParams; let label;
      const bl = String(a.baseline ?? 'budget');
      if (bl === 'budget') { baseLines = budgetBaseline(cur.lines); baseParams = cur.params; label = 'budget'; }
      else if (bl === 'previous') {
        const prev = listSnapshots(cur.sku, cur.plant).find((s) => s.total_per_unit !== cur.total_per_unit);
        const s = prev ? await loadSnapshot(prev.run_id) : null;
        if (!s) return { summary: `No previous run of ${cur.sku} in plant ${cur.plant} is stored in this browser.` };
        baseLines = s.lines; baseParams = s.params; label = `run of ${s.ts}`;
      } else {
        const b = getResult(c, bl);
        const s = buildSnapshots(b.rows, b.query, c.system, 'assistant').find((x) => x.sku === cur.sku && x.plant === cur.plant);
        if (!s) return { summary: `Result ${bl} has no ${cur.sku} in plant ${cur.plant}.` };
        baseLines = s.lines; baseParams = s.params; label = `result ${bl}`;
      }
      const x = explainChange(baseLines, cur.lines, baseParams, cur.params);
      const ids = {
        total0: fact(c, `Cost per piece of ${cur.sku}, ${label}`, x.total0, 'INR/pc', 'explain_change.total0', 4),
        total1: fact(c, `Cost per piece of ${cur.sku}, current`, x.total1, 'INR/pc', 'explain_change.total1', 4),
        delta: fact(c, `Change per piece of ${cur.sku}`, x.delta, 'INR/pc', 'explain_change.delta', 4),
      };
      const eff = Object.entries(x.effects).filter(([, v]) => !v.isZero()).map(([t, v]) => ({ effect: t, per_pc: `[${fact(c, `${t} effect per piece`, v, 'INR/pc', `explain_change.effects.${t}`, 4)}]` }));
      const drivers = x.topDrivers.map((d) => ({ component: d.idnrk, effect: d.kind === 'changed' ? d.label : d.kind, sources: d.source0 !== d.source1 ? `${d.source0 || 'none'} -> ${d.source1 || 'none'}` : d.source1, change_per_pc: `[${fact(c, `Change from ${d.idnrk}`, d.delta, 'INR/pc', `explain_change.byComponent.${d.idnrk}`, 4)}]` }));
      return { summary: `Change of ${cur.sku} in plant ${cur.plant} vs ${label}. Warnings: ${x.warnings.join(' ') || 'none'}.`, totals: { baseline: `[${ids.total0}]`, current: `[${ids.total1}]`, change: `[${ids.delta}]` }, rows: [...eff, ...drivers], facts: factsOf(c, [ids.total0, ids.total1, ids.delta, ...eff.map((e) => e.per_pc.slice(1, -1)), ...drivers.map((d) => d.change_per_pc.slice(1, -1))]) };
    }
    case 'run_scenario': {
      const r = getResult(c, String(a.result_id));
      const settings: SimSettings = { ...EMPTY_SIM, pick: (a.repick as SimSettings['pick']) ?? 'sap', ratePct: (a.rate_pct_by_source as Record<string, number>) ?? {}, fxPct: (a.fx_pct as Record<string, number>) ?? {}, qtyMult: a.qty_pct ? 1 + Number(a.qty_pct) / 100 : 1, compPct: (a.component_pct as Record<string, number>) ?? {}, prio: r.query.prio };
      const sim = simulate(r.rows, settings);
      const base = perPcBase(r.query);
      const qtyBase = base.times(settings.qtyMult || 1);
      const m = new Map<string, { sap: Decimal; sim: Decimal }>();
      r.rows.forEach((l, i) => { if (!isLeafRow(l)) return; const k = `${l.Hwerks}|${l.Headmat}`; const e = m.get(k) ?? { sap: ZERO, sim: ZERO }; e.sap = e.sap.plus(D(l.TotCostInr)); e.sim = e.sim.plus(sim[i].total); m.set(k, e); });
      const list = [...m.entries()].map(([k, e]) => {
        const [plant, fg] = k.split('|');
        const s0 = e.sap.div(base); const s1 = e.sim.div(qtyBase);
        return { fg, plant, sap_per_pc: `[${fact(c, `SAP cost per piece of ${fg}`, s0, 'INR/pc', `run_scenario.${r.id}`, 4)}]`, simulated_per_pc: `[${fact(c, `Simulated cost per piece of ${fg}`, s1, 'INR/pc', `run_scenario.${r.id}`, 4)}]`, change_pct: s0.isZero() ? null : `[${fact(c, `Simulated change of ${fg} in percent`, s1.minus(s0).div(s0).times(100), '%', `run_scenario.${r.id}`)}]` };
      });
      return { summary: 'Simulated in the browser on the SAP result (not an SAP figure).', rows: list, facts: factsOf(c, list.flatMap((x) => [x.sap_per_pc, x.simulated_per_pc, x.change_pct].filter(Boolean).map((s) => (s as string).slice(1, -1)))) };
    }
    case 'get_mis': {
      const plants = (a.plants as string[]).map((p) => p.toUpperCase());
      const asOf = String(a.as_of ?? new Date().toISOString().slice(0, 10));
      const r = await fetchMis(plants, asOf);
      const brands = brandViews(r.rows); const t = misTotals(brands);
      const L = (v: Decimal) => v.div(100000);
      const ids = [
        fact(c, `MIS year-to-date budget COGM, plants ${plants.join(', ')}`, L(t.ytm.budget), 'lakh', 'get_mis.ytm.budget', 1),
        fact(c, 'MIS year-to-date actual COGM (same finished goods)', L(t.ytm.actualCmp), 'lakh', 'get_mis.ytm.actualCmp', 1),
        fact(c, 'MIS year-to-date variance (actual minus budget)', L(t.ytm.variance), 'lakh', 'get_mis.ytm.variance', 1),
        ...(t.ytm.variancePct ? [fact(c, 'MIS year-to-date variance in percent of budget', t.ytm.variancePct, '%', 'get_mis.ytm.variancePct', 1)] : []),
      ];
      const list = brands.filter((b) => b.ytm.variancePct).sort((x, y) => y.ytm.variance.abs().cmp(x.ytm.variance.abs())).slice(0, 10).map((b) => ({ brand: b.brand, finished_goods: b.fgCnt, without_budget: b.fgNoBudget,
        variance_lakh: `[${fact(c, `Brand ${b.brand} year-to-date variance`, L(b.ytm.variance), 'lakh', `get_mis.brand.${b.brand}`, 1)}]`, variance_pct: `[${fact(c, `Brand ${b.brand} variance in percent`, b.ytm.variancePct!, '%', `get_mis.brand.${b.brand}.pct`, 1)}]` }));
      return { summary: `MIS as of ${asOf}, plants ${plants.join(', ')}: ${brands.length} brand(s). Amounts in rupees lakh.`, rows: list, facts: factsOf(c, ids) };
    }
    case 'get_sales_summary': {
      const plants = (a.plants as string[]).map((p) => p.toUpperCase());
      const r = await fetchSales(plants, String(a.from), String(a.to), undefined, { vkorg: (a.vkorg as string[] | undefined) ?? [], matnr: (a.matnr as string[] | undefined) ?? [] });
      const b = brandSales(salesViews(r.rows)); const t = salesTotals(b);
      const L = (v: Decimal) => v.div(100000);
      const ids = [
        fact(c, 'Gross sales value (GSV)', L(t.gsv), 'lakh', 'get_sales_summary.gsv', 1), fact(c, 'Net sales value (NSV)', L(t.nsv), 'lakh', 'get_sales_summary.nsv', 1),
        fact(c, 'Deductions (GSV minus NSV)', L(t.deductions), 'lakh', 'get_sales_summary.deductions', 1), fact(c, 'COGM of the sold volume', L(t.cogm), 'lakh', 'get_sales_summary.cogm', 1),
        fact(c, 'Gross margin', L(t.gm), 'lakh', 'get_sales_summary.gm', 1), ...(t.gmPct ? [fact(c, 'Gross margin in percent of NSV', t.gmPct, '%', 'get_sales_summary.gmPct', 1)] : []),
      ];
      const list = [...b].sort((x, y) => y.nsv.cmp(x.nsv)).slice(0, 10).map((x) => ({ brand: x.brand, nsv_lakh: `[${fact(c, `Brand ${x.brand} NSV`, L(x.nsv), 'lakh', `get_sales_summary.brand.${x.brand}`, 1)}]`, ...(x.gmPct ? { gm_pct: `[${fact(c, `Brand ${x.brand} gross margin percent`, x.gmPct, '%', `get_sales_summary.brand.${x.brand}.gm`, 1)}]` } : {}) }));
      return { summary: `Sales ${a.from} to ${a.to}${plants.length ? `, plants ${plants.join(', ')}` : ', all plants'}: ${b.length} brand(s). Amounts in rupees lakh; the margin covers lines that have an actual cost.`, rows: list, facts: factsOf(c, ids) };
    }
    case 'get_margin_summary': {
      const sel = { plants: (a.plants as string[]).map((p) => p.toUpperCase()), vkorg: a.vkorg as string[], vtweg: [], crssku: [], vbeln: [], matnr: a.matnr as string[] };
      const r = await fetchMargin(sel, String(a.from), String(a.to));
      const parsed = parseMargin(r.rows);
      const t = totalOf(parsed.sku, NO_DRIVERS, 'gross');
      const L = (v: Decimal) => v.div(100000);
      const ids = [
        fact(c, 'Revenue', L(t.revenue), 'lakh', 'get_margin_summary.revenue', 3), fact(c, 'Cost of goods sold', L(t.cogs), 'lakh', 'get_margin_summary.cogs', 3), fact(c, 'Gross margin', L(t.gm), 'lakh', 'get_margin_summary.gm', 3),
        ...(t.gmPct ? [fact(c, 'Gross margin in percent of revenue', t.gmPct, '%', 'get_margin_summary.gmPct', 1)] : []), fact(c, 'Quantity sold', t.qty, 'pcs', 'get_margin_summary.qty'),
      ];
      return { summary: `Margin ${a.from} to ${a.to}: ${parsed.sku.length} SKU line(s). Revenue basis: gross sales.`, facts: factsOf(c, ids) };
    }
    case 'get_plan_summary':
    case 'get_shortages': {
      const q = { ...defaultPlanCostQuery(String(a.plan)), plants: [String(a.werks).toUpperCase()] };
      const { rows } = await fetchPlanSummary(q);
      const items = rows.map((s) => ({ s, short: shortage(s) }));
      const pick = name === 'get_shortages' ? items.filter((x) => x.short.gt(0)).sort((x, y) => y.short.cmp(x.short)) : items.sort((x, y) => D(y.s.BudQty).cmp(D(x.s.BudQty)));
      const list = pick.slice(0, ROW_CAP).map(({ s, short }) => ({ component: s.Comp, text: s.CompTxt, plant: s.Werks, unit: s.Meins,
        requirement: `[${fact(c, `Requirement of ${s.Comp} in plan ${a.plan}`, s.BudQty, s.Meins || 'qty', `${name}.BudQty`, 3)}]`,
        ...(name === 'get_shortages' ? { shortage: `[${fact(c, `Shortage of ${s.Comp} in plan ${a.plan}`, short, s.Meins || 'qty', `${name}.shortage`, 3)}]` } : {}) }));
      const n = fact(c, name === 'get_shortages' ? `Components short in plan ${a.plan}` : `Components in plan ${a.plan}`, pick.length, 'count', `${name}.count`);
      return { summary: `${pick.length} component(s)${pick.length > ROW_CAP ? `; first ${ROW_CAP} shown` : ''}.`, rows: list, facts: factsOf(c, [n, ...list.flatMap((x) => Object.values(x).filter((v) => typeof v === 'string' && /^\[F\d+\]$/.test(v)).map((v) => (v as string).slice(1, -1)))]) };
    }
  }
  throw new Error(`Tool ${name} not implemented`);
}
