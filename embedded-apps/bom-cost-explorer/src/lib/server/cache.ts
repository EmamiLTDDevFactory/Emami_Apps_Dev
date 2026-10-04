import { createHash } from 'node:crypto';

/** Tiny TTL + LRU cache (in-process). */
export class TtlCache<V> {
  private m = new Map<string, { v: V; at: number }>();
  constructor(private ttlMs: number, private max = 50) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (Date.now() - e.at > this.ttlMs) {
      this.m.delete(k);
      return undefined;
    }
    this.m.delete(k);
    this.m.set(k, e); // refresh LRU position
    return e.v;
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, { v, at: Date.now() });
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
}

export const hashKey = (...parts: unknown[]) => createHash('sha1').update(JSON.stringify(parts)).digest('hex');

const g = globalThis as unknown as { __bomCaches?: Record<string, TtlCache<unknown>> };
/** Survives Next dev hot reloads. */
export function namedCache<V>(name: string, ttlMs: number, max = 50): TtlCache<V> {
  g.__bomCaches ??= {};
  return (g.__bomCaches[name] ??= new TtlCache<unknown>(ttlMs, max)) as TtlCache<V>;
}
