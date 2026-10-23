/**
 * Lazy rate options: loaded only when the Rate sources tab, the row drawer or a re-pick what-if needs
 * them - the main costing call never sends $expand (one SAP run per Run click).
 *
 * Resolution when the capability is unknown / expired (capability.ts):
 *   a) probe "direct" (RateOptionSet with the costing filter) using RATES_PROBE_MATNR / RATES_PROBE_WERKS
 *      and ExplQty 1, or - when those are not set - the user's own query once;
 *   b) if that is "not there" (HTTP 404 / 501, not implemented, Resource not found for segment, unknown
 *      property), probe "expand" the same way;
 *   c) both "not there" -> unavailable.
 * Any other failure (network, 500, timeout) is thrown to the caller and decides nothing.
 * Results are cached 5 minutes per system + query.
 */
import { sapConfig, type SapConfig } from '../sap/config';
import { SapError, sapGetCollection, type SapGetOptions } from '../sap/client';
import { buildSelectionFilter } from '../sap/filter';
import { ENTITY_SET, NAV_RATE_OPTIONS } from '../sap/entities';
import { RATE_OPTION, type CostLine } from '../sap/fields';
import { normalizeEntity } from '../sap/normalize';
import { MAX_MATERIALS, defaultQuery, type CostQuery } from '../query/schema';
import { getRatesCapability, setRatesCapability, type RatesProbe } from './capability';
import { EXPAND_PARENT, RATE_OPTION_DIRECT, RATE_OPTION_SET, optionKey, type RateOptionRow } from './fields';
import { rateOptionFilter } from './optionFilter';

export type RatesResult =
  | { rows: RateOptionRow[]; mode: 'direct' | 'expand' }
  | { unavailable: true; reason: string };

export const RATES_CACHE_MS = 5 * 60_000;
export const UNAVAILABLE_NOTE = 'Rate options are not available from SAP for this system';

const NOT_THERE = /not implemented|RATEOPTIONSET|Resource not found for (the )?segment|Property .* (not found|is invalid)|No service found|navigation/i;

/** "This shape does not exist on this system" (as opposed to a temporary failure). */
export function isRatesShapeMissing(e: unknown): boolean {
  if (!(e instanceof SapError) || e.kind === 'aborted' || e.kind === 'timeout' || e.kind === 'config' || e.kind === 'network') return false;
  if (e.sapStatus === 404 || e.sapStatus === 501) return true;
  return NOT_THERE.test(`${e.message} ${e.details.map((d) => d.message).join(' ')}`);
}

/** The probe / fetch request for each shape. Same filter builder as the costing call; RateOptionSet gets the
 * six CHAR1 flags as 'X' / '' (rateOptionFilter, RATEOPTION_BOOL_STYLE); the $expand route is a CostLineSet call
 * and keeps the costing filter unchanged. */
export function directRequest(q: CostQuery | string) {
  return { entitySet: RATE_OPTION_SET, params: { $filter: rateOptionFilter(typeof q === 'string' ? q : buildSelectionFilter(q)) } as Record<string, string | undefined> };
}
export function expandRequest(q: CostQuery | string) {
  return {
    entitySet: ENTITY_SET.COST_LINES,
    params: { $filter: typeof q === 'string' ? q : buildSelectionFilter(q), $select: [...Object.values(EXPAND_PARENT).map(([n]) => n), NAV_RATE_OPTIONS].join(','), $expand: NAV_RATE_OPTIONS } as Record<string, string | undefined>,
  };
}

/** Flat rows from RateOptionSet. */
export function fromDirect(raw: Record<string, unknown>[]): RateOptionRow[] {
  return raw.map((r) => normalizeEntity<RateOptionRow>(r, RATE_OPTION_DIRECT));
}

/** Flat rows from CostLineSet?$expand=RateOptions: {results:[...]} unwrapped, parent keys filled in. */
export function fromExpand(raw: Record<string, unknown>[]): RateOptionRow[] {
  const out: RateOptionRow[] = [];
  for (const r of raw) {
    const line = normalizeEntity<{ Seqnr: number; Hwerks: string; Headmat: string; RateOptions?: RateOptionRow[] }>(r, EXPAND_PARENT, { [NAV_RATE_OPTIONS]: RATE_OPTION });
    for (const o of line.RateOptions ?? []) {
      out.push({ ...o, Seqnr: o.Seqnr || line.Seqnr, Hwerks: o.Hwerks || line.Hwerks, Headmat: o.Headmat || line.Headmat });
    }
  }
  return out;
}

/** Copies of the cost lines with RateOptions filled from the flat rows (join Seqnr|Hwerks|Headmat). */
export function attachRateOptions(lines: CostLine[], options: RateOptionRow[]): CostLine[] {
  const by = new Map<string, RateOptionRow[]>();
  for (const o of options) {
    const k = optionKey(o);
    const list = by.get(k);
    if (list) list.push(o);
    else by.set(k, [o]);
  }
  return lines.map((l) => ({ ...l, RateOptions: by.get(optionKey(l)) ?? [] }));
}

/** The probe as a filter: the configured probe material/plant (Mode B, ExplQty 1), else the caller's own filter. */
function probeFilter(own: string, base: CostQuery): string {
  const matnr = (process.env.NEXT_PUBLIC_RATES_PROBE_MATNR || '').trim();
  const werks = (process.env.NEXT_PUBLIC_RATES_PROBE_WERKS || '').trim();
  return matnr && werks ? buildSelectionFilter({ ...base, mode: 'B', materials: [matnr], plants: [werks], explQty: '1' }) : own;
}

async function run(kind: 'direct' | 'expand', q: string, opts: SapGetOptions, c: SapConfig): Promise<{ rows: RateOptionRow[]; probe: RatesProbe }> {
  const req = kind === 'direct' ? directRequest(q) : expandRequest(q);
  const t = Date.now();
  const url = `${req.entitySet}?$filter=${encodeURIComponent(req.params.$filter ?? '')}${req.params.$expand ? `&$expand=${req.params.$expand}` : ''}`;
  try {
    const r = await sapGetCollection(req.entitySet, req.params, opts);
    const rows = kind === 'direct' ? fromDirect(r.rows) : fromExpand(r.rows);
    return { rows, probe: { kind, at: t, ok: true, status: r.status ?? 200, ms: r.ms, message: '', url } };
  } catch (e) {
    const err = e as SapError;
    (err as SapError & { probe?: RatesProbe }).probe = { kind, at: t, ok: false, status: err.sapStatus ?? 0, ms: Date.now() - t, message: err.message, url };
    throw err;
  }
}

const cache = new Map<string, { at: number; result: RatesResult }>();
const inflight = new Map<string, Promise<RatesResult>>();
export const clearRatesCache = () => { cache.clear(); inflight.clear(); };

/** Rate options for a costing query (mode B). Shares one request per query between callers. */
export function fetchRateOptions(q: CostQuery, opts: SapGetOptions = {}): Promise<RatesResult> {
  if (q.materials.length > MAX_MATERIALS) return fetchRateOptionsBatched(q, opts);
  const own = buildSelectionFilter(q);
  return fetchRateOptionsByFilter(own, opts, probeFilter(own, q));
}

/** Plant runs cost more FGs than SAP takes per request: rate options in the same batches, rows merged. */
async function fetchRateOptionsBatched(q: CostQuery, opts: SapGetOptions): Promise<RatesResult> {
  const rows: RateOptionRow[] = [];
  let mode: 'direct' | 'expand' = 'direct';
  for (let i = 0; i < q.materials.length; i += MAX_MATERIALS) {
    const r = await fetchRateOptions({ ...q, materials: q.materials.slice(i, i + MAX_MATERIALS) }, opts);
    if ('unavailable' in r) return r;
    rows.push(...r.rows);
    mode = r.mode;
  }
  return { rows, mode };
}

/**
 * Same, for any CostLineSet filter (e.g. the Production Plan's Mode P filter). `probe` is the filter for
 * the capability probe (default: the same filter). Shares the capability verdict and the cache.
 */
export async function fetchRateOptionsByFilter(filter: string, opts: SapGetOptions = {}, probe?: string): Promise<RatesResult> {
  const c = sapConfig();
  if (c.expand === 'off') return { unavailable: true, reason: `${UNAVAILABLE_NOTE} (switched off: SAP_EXPAND_RATE_OPTIONS=off).` };
  const pf = probe ?? probeFilter(filter, defaultQuery('B'));
  const key = `${c.system}|${filter}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RATES_CACHE_MS) return hit.result;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = resolve(filter, pf, opts, c)
    .then((result) => { cache.set(key, { at: Date.now(), result }); return result; })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function resolve(q: string, pq: string, opts: SapGetOptions, c: SapConfig): Promise<RatesResult> {
  const cap = getRatesCapability(c.system);
  if (cap.state === 'unavailable') return { unavailable: true, reason: cap.reason || UNAVAILABLE_NOTE };
  if (cap.state === 'direct' || cap.state === 'expand') {
    try {
      return { rows: (await run(cap.state, q, opts, c)).rows, mode: cap.state };
    } catch (e) {
      if (!isRatesShapeMissing(e)) throw e; // temporary failure: keep the verdict
      // SAP changed under us: re-resolve below.
    }
  }
  const sameQuery = pq === q;
  const probes: RatesProbe[] = [];
  for (const kind of ['direct', 'expand'] as const) {
    try {
      const r = await run(kind, pq, opts, c);
      probes.push(r.probe);
      setRatesCapability(c.system, kind, probes);
      return { rows: sameQuery ? r.rows : (await run(kind, q, opts, c)).rows, mode: kind };
    } catch (e) {
      const probe = (e as { probe?: RatesProbe }).probe;
      if (probe) probes.push(probe);
      if (!isRatesShapeMissing(e)) throw e;
    }
  }
  const reason = `${UNAVAILABLE_NOTE}.`;
  setRatesCapability(c.system, 'unavailable', probes, reason);
  return { unavailable: true, reason };
}
