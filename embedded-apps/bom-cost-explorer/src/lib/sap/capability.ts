/**
 * Whether this SAP system can $expand RateOptions on CostLineSet - remembered so an unsupported
 * expand is not re-tried on every run (which would double each costing run).
 *
 *   unknown     -> the next Mode B run sends $expand
 *   supported   -> keep sending it
 *   unsupported -> do not send it until `retryAt` (15 min), then test again
 *
 * Kept per SAP system, in memory and (best effort) in localStorage so a page reload keeps it.
 */
export type ExpandCapability = 'unknown' | 'supported' | 'unsupported';
export const RETEST_AFTER_MS = 15 * 60_000;

interface Entry {
  state: ExpandCapability;
  at: number;
  retryAt?: number;
  reason?: string;
}

const mem = new Map<string, Entry>();
const key = (system: string) => `bce:rate-options-expand:${system}`;

function read(system: string): Entry {
  const m = mem.get(system);
  if (m) return m;
  try {
    if (typeof localStorage !== 'undefined') {
      const v = JSON.parse(localStorage.getItem(key(system)) || 'null') as Entry | null;
      if (v) {
        mem.set(system, v);
        return v;
      }
    }
  } catch {
    /* private mode */
  }
  return { state: 'unknown', at: 0 };
}

function write(system: string, e: Entry) {
  mem.set(system, e);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key(system), JSON.stringify(e));
  } catch {
    /* ignore */
  }
}

export function getCapability(system: string, now = Date.now()): Entry {
  const e = read(system);
  // An "unsupported" verdict expires after 15 minutes: test again.
  if (e.state === 'unsupported' && e.retryAt && now >= e.retryAt) return { state: 'unknown', at: e.at, reason: e.reason };
  return e;
}

export function markSupported(system: string, now = Date.now()) {
  write(system, { state: 'supported', at: now });
}

export function markUnsupported(system: string, reason: string, now = Date.now()) {
  write(system, { state: 'unsupported', at: now, retryAt: now + RETEST_AFTER_MS, reason });
}

/** Admin "re-test": forget the verdict so the next Mode B run sends $expand again. */
export function resetCapability(system: string) {
  mem.delete(system);
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key(system));
  } catch {
    /* ignore */
  }
}

/** Should this run send $expand=RateOptions? */
export function shouldExpand(mode: 'auto' | 'on' | 'off', system: string, now = Date.now()): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return getCapability(system, now).state !== 'unsupported';
}
