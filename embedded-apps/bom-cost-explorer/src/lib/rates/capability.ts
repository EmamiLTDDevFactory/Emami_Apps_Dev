/**
 * How this SAP system can deliver rate options, found out lazily the first time something needs them
 * (Rate sources tab, row drawer, re-pick what-ifs) - never on the main costing run:
 *
 *   unknown     -> not tested yet (or the last verdict expired)
 *   direct      -> RateOptionSet?$filter=<costing filter>       flat rows
 *   expand      -> CostLineSet?<costing filter>&$expand=RateOptions
 *   unavailable -> neither works; the UI shows a neutral note
 *
 * A verdict holds for RATES_TTL_MS (15 min). Kept per SAP system in memory and in localStorage
 * ("rates:capability:<system>"), with the probes that led to it for the /admin/connection page.
 * The app is a static export (no server), so this replaces the "server memory" of the spec.
 */
export type RatesMode = 'unknown' | 'direct' | 'expand' | 'unavailable';
export const RATES_TTL_MS = 15 * 60_000;

export interface RatesProbe {
  kind: 'direct' | 'expand';
  at: number;
  ok: boolean;
  status: number; // HTTP status (0 = no response)
  ms: number;
  message: string; // SAP's / the gateway's raw message, '' on success
  url: string;
}

export interface RatesCapability {
  state: RatesMode;
  at: number;
  reason?: string;
  probes: RatesProbe[];
}

const mem = new Map<string, RatesCapability>();
const storageKey = (system: string) => `rates:capability:${system}`;

function load(system: string): RatesCapability {
  const m = mem.get(system);
  if (m) return m;
  try {
    if (typeof localStorage !== 'undefined') {
      const v = JSON.parse(localStorage.getItem(storageKey(system)) || 'null') as RatesCapability | null;
      if (v && typeof v.state === 'string') {
        mem.set(system, v);
        return v;
      }
    }
  } catch {
    /* private mode / blocked storage */
  }
  return { state: 'unknown', at: 0, probes: [] };
}

function save(system: string, c: RatesCapability) {
  mem.set(system, c);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey(system), JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

/** Current verdict; an expired one reads as 'unknown' (its probes stay visible for diagnostics). */
export function getRatesCapability(system: string, now = Date.now()): RatesCapability {
  const c = load(system);
  if (c.state !== 'unknown' && now - c.at > RATES_TTL_MS) return { ...c, state: 'unknown' };
  return c;
}

export function setRatesCapability(system: string, state: Exclude<RatesMode, 'unknown'>, probes: RatesProbe[], reason?: string, now = Date.now()) {
  save(system, { state, at: now, reason, probes });
}

/** "Re-test": forget the verdict, so the next need for rate options probes again. */
export function resetRatesCapability(system: string) {
  mem.delete(system);
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey(system));
  } catch {
    /* ignore */
  }
}
