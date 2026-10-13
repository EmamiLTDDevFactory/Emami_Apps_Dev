/**
 * Mock of the Production Plan sets (see src/lib/plan/fields.ts for the contract). In-memory store,
 * seeded with two plans; FG5001 in BD10 has no BOM of its own, so it is costed with the BOM of plant 1000
 * ("LASTPROD", last production 12.08.2026) - the LASTPROD example. Wired in from mock/sap.ts.
 */
import { MAT, NO_BOM, PLANTS } from './data';
import { PLAN_MAX_ROWS_PER_REQUEST, PLAN_NAME_MAX } from '../src/lib/plan/fields';

type Raw = Record<string, unknown>;
interface Msg { code: string; message: string; severity: 'warning' | 'info' | 'error' }

export interface PlanDeps {
  parseFilter: (f: string) => Map<string, string[]>;
  costLinesFor: (matnr: string, plant: string, qty: number, msgs: Msg[], expand?: boolean) => Raw[];
  json: (body: unknown, status?: number, msgs?: Msg[]) => Response;
  odataError: (status: number, code: string, message: string) => Response;
  sleep: (ms: number, signal?: AbortSignal | null) => Promise<void>;
  delay: () => number;
}

interface Entry { Plan1: string; Matnr: string; Werks: string; Land1: string; m: number[]; Status: string; Msg: string }

const n3 = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(3);
const dt = (iso: string) => `/Date(${Date.parse(`${iso}T00:00:00Z`)})/`;
const landOf = (w: string) => PLANTS.find((p) => p.Werks === w)?.Land1 ?? '';
const months = (base: number, seed: number) => Array.from({ length: 12 }, (_, i) => Math.round(base * (0.8 + ((seed * 7 + i * 13) % 9) / 20)));

const store = new Map<string, Map<string, Entry>>();
const key = (e: Pick<Entry, 'Matnr' | 'Werks' | 'Land1'>) => `${e.Matnr}|${e.Werks}|${e.Land1}`;
function seed() {
  store.clear();
  const add = (plan: string, Matnr: string, Werks: string, base: number, s: number) => {
    const m = store.get(plan) ?? new Map<string, Entry>();
    const e: Entry = { Plan1: plan, Matnr, Werks, Land1: landOf(Werks), m: months(base, s), Status: '', Msg: '' };
    m.set(key(e), e);
    store.set(plan, m);
  };
  add('FY27-BASE', 'FG1001', '1000', 12000, 1);
  add('FY27-BASE', 'FG1001', '1100', 6000, 2);
  add('FY27-BASE', 'FG3001', '1000', 20000, 3);
  add('FY27-BASE', 'FG2001', '1200', 8000, 4);
  add('FY27-BASE', 'FG5001', 'BD10', 3000, 5); // no BOM in BD10 -> LASTPROD from 1000
  add('FY27-EXPORT', 'FG1002', 'AE10', 2500, 6);
}
seed();
export const resetPlanMock = seed;

/** Plant whose BOM is used, and how (OWN, or LASTPROD from another plant). */
function bomSource(matnr: string, werks: string): { plant: string; src: 'OWN' | 'LASTPROD'; date: string | null } {
  if (NO_BOM[matnr]?.includes(werks)) return { plant: '1000', src: 'LASTPROD', date: '2026-08-12' };
  return { plant: werks, src: 'OWN', date: null };
}

const entryRaw = (e: Entry): Raw => ({
  __metadata: { type: 'ZMM_BOM_COST_SRV.PlanEntry' },
  Plan1: e.Plan1, Matnr: e.Matnr, Maktx: MAT.get(e.Matnr)?.Maktx ?? '', Werks: e.Werks, Land1: e.Land1,
  ...Object.fromEntries(e.m.map((v, i) => [`Mth${i + 1}`, n3(v)])),
  Total: n3(e.m.reduce((a, b) => a + b, 0)), Status: e.Status, Msg: e.Msg,
});

function matchEntries(f: Map<string, string[]>): Entry[] {
  const plan = f.get('Plan1')?.[0] ?? '';
  const mats = (f.get('Matnr') ?? []).map((x) => x.toUpperCase());
  const werks = (f.get('Werks') ?? []).map((x) => x.toUpperCase());
  return [...(store.get(plan)?.values() ?? [])].filter((e) => (!mats.length || mats.includes(e.Matnr)) && (!werks.length || werks.includes(e.Werks)));
}

/** Validation the ABAP would do on an uploaded / edited entry ('' = fine). */
function entryError(e: Raw): string {
  const m = String(e.Matnr ?? '').toUpperCase();
  const w = String(e.Werks ?? '').toUpperCase();
  if (!m) return 'Material is missing';
  if (!MAT.has(m)) return `Material ${m} does not exist`;
  // WIP plans ("WIP <plan>", from PlanWipSet) hold semi-finished materials.
  if (!['FERT', 'HALB'].includes(MAT.get(m)!.Mtart)) return `Material ${m} is not a finished or semi-finished good`;
  if (!/^[A-Z0-9]{4}$/.test(w)) return `Plant ${w || '(blank)'} is not a 4-character plant`;
  if (!PLANTS.some((p) => p.Werks === w)) return `Plant ${w} does not exist or is not authorised`;
  for (let i = 1; i <= 12; i++) {
    const v = e[`Mth${i}`];
    if (typeof v !== 'string') return `Mth${i} must be a decimal string`;
    if (!(Number(v) >= 0)) return `Mth${i} must be a number of 0 or more`;
  }
  return '';
}

function parseKey(seg: string): Record<string, string> | null {
  const m = /^\w+\((.*)\)$/.exec(seg);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const part of m[1].match(/\w+='(?:[^']|'')*'/g) ?? []) {
    const [, k, v] = /^(\w+)='(.*)'$/.exec(part)!;
    out[k] = v.replace(/''/g, "'");
  }
  return out;
}

/** Handles a plan request, or returns null when it is not one. */
export async function handlePlan(seg: string, sp: URLSearchParams, init: RequestInit | undefined, deps: PlanDeps): Promise<Response | null> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const set = seg.replace(/\(.*$/, '');
  const f = deps.parseFilter(sp.get('$filter') ?? '');
  const signal = init?.signal ?? undefined;
  // Like the live Azure gateway today: DELETE is not forwarded, the gateway answers its own 404 page.
  if (method === 'DELETE' && process.env.MOCK_SAP_NO_DELETE === 'true') {
    return new Response(`<pre>Cannot DELETE /api/${seg}</pre>`, { status: 404, headers: { 'content-type': 'text/html' } });
  }

  if (set === 'PlanHeadSet' && method === 'GET') {
    await deps.sleep(deps.delay(), signal);
    const rows = [...store.entries()].map(([plan, m]) => {
      const list = [...m.values()];
      return { __metadata: { type: 'ZMM_BOM_COST_SRV.PlanHead' }, Plan1: plan, RowCnt: list.length, PlantCnt: new Set(list.map((e) => e.Werks)).size, Total: n3(list.reduce((a, e) => a + e.m.reduce((x, y) => x + y, 0), 0)) };
    });
    return deps.json({ d: { results: rows } });
  }

  if (set === 'PlanEntrySet') {
    if (method === 'GET') {
      if (!f.get('Plan1')?.length) return deps.odataError(400, 'ZPLAN/001', 'Filter Plan1 is required');
      await deps.sleep(deps.delay(), signal);
      return deps.json({ d: { results: matchEntries(f).map(entryRaw) } });
    }
    const k = parseKey(seg);
    if (!k?.Plan1 || !k.Matnr || !k.Werks) return deps.odataError(400, 'ZPLAN/002', 'Key Plan1, Matnr, Werks, Land1 is required');
    const plan = store.get(k.Plan1);
    const id = key({ Matnr: k.Matnr.toUpperCase(), Werks: k.Werks.toUpperCase(), Land1: k.Land1 ?? landOf(k.Werks.toUpperCase()) });
    if (method === 'DELETE') {
      if (!plan?.delete(id)) return deps.odataError(404, 'ZPLAN/004', `Plan row ${k.Plan1} ${k.Matnr} ${k.Werks} not found`);
      return new Response(null, { status: 204 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as Raw;
      const err = entryError({ ...body, Matnr: k.Matnr, Werks: k.Werks });
      if (err) return deps.odataError(400, 'ZPLAN/005', err);
      const e = plan?.get(id);
      if (!e) return deps.odataError(404, 'ZPLAN/004', `Plan row ${k.Plan1} ${k.Matnr} ${k.Werks} not found`);
      e.m = Array.from({ length: 12 }, (_, i) => Number(body[`Mth${i + 1}`]));
      return new Response(null, { status: 204 });
    }
  }

  if (set === 'PlanUploadSet' && method === 'POST') {
    const body = JSON.parse(String(init?.body ?? '{}')) as Raw & { Entries?: Raw[] | { results?: Raw[] } };
    const plan = String(body.Plan1 ?? '').trim();
    const entries = (Array.isArray(body.Entries) ? body.Entries : body.Entries?.results) ?? [];
    if (!plan || plan.length > PLAN_NAME_MAX) return deps.odataError(400, 'ZPLAN/010', `Plan name must be 1 to ${PLAN_NAME_MAX} characters`);
    if (typeof body.Dryrun !== 'boolean') return deps.odataError(400, 'ZPLAN/011', 'Dryrun must be a boolean');
    await deps.sleep(deps.delay(), signal);
    const seen = new Set<string>();
    const out: Raw[] = entries.map((e): Raw => {
      const w = String(e.Werks ?? '').toUpperCase();
      const row: Raw = { ...e, Plan1: plan, Matnr: String(e.Matnr ?? '').toUpperCase(), Werks: w, Land1: String(e.Land1 ?? landOf(w)).toUpperCase() };
      let msg = entryError(row);
      const id = key(row as Pick<Entry, 'Matnr' | 'Werks' | 'Land1'>);
      if (!msg && seen.has(id)) msg = 'Duplicate row (plan + material + plant + country)';
      seen.add(id);
      if (!msg && NO_BOM[row.Matnr as string]?.includes(w)) return { ...row, Status: 'W', Msg: `No BOM in plant ${w}: the BOM of plant 1000 (last production 12.08.2026) will be used` };
      return { ...row, Status: msg ? 'E' : 'S', Msg: msg };
    });
    const errors = out.filter((r) => r.Status === 'E').length;
    let saved = 0;
    if (!errors && !body.Dryrun) {
      const m = body.UpdMode === 'R' ? new Map<string, Entry>() : store.get(plan) ?? new Map<string, Entry>();
      for (const r of out) {
        const e: Entry = { Plan1: plan, Matnr: r.Matnr as string, Werks: r.Werks as string, Land1: r.Land1 as string, m: Array.from({ length: 12 }, (_, i) => Number(r[`Mth${i + 1}`])), Status: '', Msg: '' };
        m.set(key(e), e);
        saved++;
      }
      store.set(plan, m);
    }
    const status = errors ? 'E' : body.Dryrun ? 'V' : 'S';
    const msgTxt = errors ? `${errors} row(s) have errors; nothing was saved` : body.Dryrun ? `Check passed: ${out.length} row(s) can be saved` : `${saved} row(s) saved in plan ${plan}${body.UpdMode === 'R' ? ' (plan replaced)' : ''}`;
    return deps.json({ d: { Plan1: plan, UpdMode: body.UpdMode ?? 'M', Dryrun: body.Dryrun, Status: status, Saved: saved, Errors: errors, MsgTxt: msgTxt, Entries: { results: out } } }, 201);
  }

  if (set === 'PlanCheckSet' && method === 'GET') {
    const plan = f.get('Plan1')?.[0] ?? '';
    if (!plan) return deps.odataError(400, 'ZPLAN/001', 'Filter Plan1 is required');
    await deps.sleep(deps.delay(), signal);
    const item = f.get('ItemCheck')?.[0] === 'true';
    const rows: Raw[] = [];
    for (const e of store.get(plan)?.values() ?? []) {
      const b = bomSource(e.Matnr, e.Werks);
      if (b.src === 'LASTPROD') rows.push({ Kind: 'FG', Plan1: plan, Matnr: e.Matnr, Werks: e.Werks, Comp: '', Msg: `No BOM in plant ${e.Werks}; BOM from plant ${b.plant} (last production 12.08.2026)` });
      if (item) rows.push({ Kind: 'ITEM', Plan1: plan, Matnr: e.Matnr, Werks: e.Werks, Comp: 'RM0003', Msg: 'No valid rate in the look-back window' });
    }
    return deps.json({ d: { results: rows } });
  }

  const modeP = f.get('Mode')?.[0] === 'P';
  const ratesMode = process.env.MOCK_SAP_RATES || '';
  const wantsExpand = (sp.get('$expand') ?? '').includes('RateOptions');
  if (set === 'CostLineSet' && modeP && wantsExpand && (ratesMode === 'expand-fails' || ratesMode === 'direct-works' || process.env.MOCK_SAP_EXPAND_501 === 'true')) {
    return deps.odataError(501, '/IWBEP/CM_MGW_RT/021', "Method 'RATEOPTIONSET_GET_ENTITYSET' not implemented in data provider class.");
  }
  if (set === 'RateOptionSet' && modeP && ratesMode !== 'direct-works') {
    return deps.odataError(404, '/IWBEP/CM_MGW_RT/020', "Resource not found for segment 'RateOptionSet'");
  }
  if ((set === 'PlanSummarySet' || set === 'PlanWipSet' || ((set === 'CostLineSet' || set === 'RateOptionSet') && modeP)) && method === 'GET') {
    const plan = f.get('Plan1')?.[0] ?? '';
    if (!plan) return deps.odataError(400, 'ZPLAN/001', 'Filter Plan1 is required');
    const rows = matchEntries(f);
    if (set !== 'PlanWipSet' && rows.length > PLAN_MAX_ROWS_PER_REQUEST) {
      return deps.odataError(400, 'ZPLAN/030', `${rows.length} plan rows selected; at most ${PLAN_MAX_ROWS_PER_REQUEST} per request. Filter by plant or material.`);
    }
    await deps.sleep(deps.delay() + 30 * rows.length, signal);
    const msgs: Msg[] = [];
    let seq = 0;
    const lines: Raw[] = [];
    for (const e of rows) {
      const qtyTot = e.m.reduce((a, b) => a + b, 0);
      const b = bomSource(e.Matnr, e.Werks);
      if (b.src === 'LASTPROD') msgs.push({ code: 'ZPLAN/040', message: `${e.Matnr} ${e.Werks}: BOM from plant ${b.plant} (last production 12.08.2026)`, severity: 'warning' });
      const exploded = deps.costLinesFor(e.Matnr, b.plant, qtyTot || 1, msgs, wantsExpand || set === 'RateOptionSet');
      for (const r of exploded) {
        seq++;
        const share = (i: number) => (qtyTot ? (Number(r.ProdQty) * e.m[i]) / qtyTot : 0);
        lines.push({
          ...r, Seqnr: seq, Hwerks: e.Werks, Plan1: plan,
          ...(r.RateOptions && typeof r.RateOptions === 'object' && 'results' in (r.RateOptions as Raw)
            ? { RateOptions: { results: ((r.RateOptions as { results: Raw[] }).results).map((o) => ({ ...o, Seqnr: seq, Hwerks: e.Werks })) } }
            : {}), Stlal: '01', ItemStlal: '01', BomPlant: b.plant, BomSrc: b.src, BomSrcDate: b.date ? dt(b.date) : null,
          PlanQty: n3(qtyTot), ...Object.fromEntries(e.m.map((_, i) => [`QtyM${i + 1}`, n3(share(i))])), QtyTot: r.ProdQty,
          ActRatePc: n3(Number(r.SelRatePc ?? 0) * 0.97), ActRatePcInr: n3(Number(r.SelRatePcInr ?? 0) * 0.97),
        });
      }
    }
    if (set === 'RateOptionSet') {
      const flat: Raw[] = [];
      for (const l of lines) {
        for (const o of ((l.RateOptions as { results?: Raw[] } | undefined)?.results ?? [])) {
          const q = Number(l.ProdQty ?? 0);
          flat.push({ ...o, TotCostInr: n3(Number(o.RatePcInr ?? 0) * q + Number(l.FrtPcInr ?? 0) * q), TotCostLoc: n3(Number(o.RatePcLoc ?? 0) * q + Number(l.FrtPcLoc ?? 0) * q), Selected: o.Source === l.SelSource ? 'X' : '', Idnrk: l.Idnrk, Maktx: l.Maktx, ProdQty: l.ProdQty });
        }
      }
      return deps.json({ d: { results: flat } }, 200, msgs);
    }
    if (set === 'CostLineSet') {
      const select = (sp.get('$select') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      const out = select.length ? lines.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k === '__metadata' || select.includes(k)))) : lines;
      return deps.json({ d: { results: out } }, 200, msgs);
    }
    // Summary / WIP: aggregate the leaf (summary) or parent (WIP) components per plant.
    const agg = new Map<string, Raw & { q: number[] }>();
    for (const r of lines) {
      const leaf = !String(r.Haschild ?? '').trim();
      if (set === 'PlanSummarySet' ? !leaf : leaf || Number(r.Level) === 0) continue;
      const k = set === 'PlanSummarySet' ? `${r.Idnrk}|${r.Hwerks}` : `${r.Headmat}|${r.Idnrk}|${r.Hwerks}`;
      const a = agg.get(k) ?? { q: Array(12).fill(0), Comp: r.Idnrk, CompTxt: r.Maktx, Mtart: r.Mtart, Werks: r.Hwerks, Meins: r.Meins, Matnr: r.Headmat, FgTxt: MAT.get(String(r.Headmat))?.Maktx ?? '', Land1: landOf(String(r.Hwerks)) };
      for (let i = 0; i < 12; i++) a.q[i] += Number(r[`QtyM${i + 1}`] ?? 0);
      agg.set(k, a);
    }
    const out = [...agg.values()].map(({ q, ...a }) => {
      const tot = q.reduce((x, y) => x + y, 0);
      const months = Object.fromEntries(q.map((v, i) => [`Qm${i + 1}`, n3(v)]));
      if (set === 'PlanWipSet') return { ...a, Ntgew: '0.100', Gewei: 'KG', ...months, Qtot: n3(tot) };
      const stock = Math.round(tot * 0.4);
      const po = Math.round(tot * 0.5);
      const del = Math.round(po * 0.3);
      return { ...a, Hrkft: '', ...months, BudQty: n3(tot), Lbkum: n3(stock), Salk3: n3(stock * 12.5), PoQty: n3(po), DelQty: n3(del), RemQty: n3(po - del) };
    });
    return deps.json({ d: { results: out } }, 200, msgs);
  }
  return null;
}
