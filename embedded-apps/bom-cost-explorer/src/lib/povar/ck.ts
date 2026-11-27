'use client';
/**
 * CK13N side of the Variance check: the costing structure of the finished good's current standard estimate, every level, per piece - the same
 * rule as the Standard cost screen and the MIS drawer (lib/ck/structure.ts: released values, bulk / WIP opened to the last level). Cached per
 * material and plant for the session of the screen, so "Find the causes" reads each finished good once.
 */
import Decimal from 'decimal.js';
import { fetchCk } from '../ck/service';
import { buildStructure } from '../ck/structure';
import { explosionFromStructure, type StdExplosion } from '../dash/ckItemVariance';
import type { CkHeaderRow } from '../ck/types';

export interface CkStd { head: CkHeaderRow | null; exp: StdExplosion }
const cache = new Map<string, Promise<CkStd>>();
const key = (matnr: string, werks: string) => `${werks}|${matnr.replace(/^0+/, '')}`;

export function loadCkStd(matnr: string, werks: string): Promise<CkStd> {
  const k = key(matnr, werks);
  const hit = cache.get(k);
  if (hit) return hit;
  const p = (async (): Promise<CkStd> => {
    const q = { matnr: matnr.replace(/^0+/, ''), werks };
    const [h, it] = await Promise.all([fetchCk('HEADER', q), fetchCk('ITEM', q)]);
    const head = h.rows[0] ?? null;
    if (!head) return { head: null, exp: explosionFromStructure([]) };
    const r = await buildStructure(it.rows, { kadky: head.Kadky ?? '', tvers: head.Tvers, klvar: head.Klvar, bwvar: head.Bwvar }, werks, new Decimal(1), {
      list: (m, w) => fetchCk('LIST', { matnr: m, werks: w }).then((x) => x.rows),
      items: (kk) => fetchCk('ITEM', { key: kk }).then((x) => x.rows),
    });
    return { head, exp: explosionFromStructure(r.nodes) };
  })();
  cache.set(k, p);
  p.catch(() => cache.delete(k));
  return p;
}
export const clearCkCache = () => cache.clear();
