/** Selection in the URL: ?mat=...&plant=...&klvar=...&tvers=...&stack=A,B. Reading it never starts a request (only Show does). Other params (e.g. ?pc=) are kept. */
import { decodeStack, encodeStack } from './view';

export interface CkUrl { mat: string; plant: string; klvar: string; tvers: string; stack: string[] }

export function parseCkUrl(search: string): Partial<CkUrl> {
  const p = new URLSearchParams(search);
  const out: Partial<CkUrl> = {};
  const mat = (p.get('mat') ?? '').trim(), plant = (p.get('plant') ?? '').trim().toUpperCase();
  if (mat) out.mat = mat;
  if (plant) out.plant = plant;
  if (p.get('klvar')) out.klvar = p.get('klvar')!.trim();
  if (p.get('tvers')) out.tvers = p.get('tvers')!.trim();
  const stack = decodeStack(p.get('stack'));
  if (stack.length) out.stack = stack;
  return out;
}

/** The search string for a selection, merged into the current one so unrelated params survive. */
export function ckSearch(current: string, s: CkUrl): string {
  const p = new URLSearchParams(current);
  const set = (k: string, v: string) => { if (v) p.set(k, v); else p.delete(k); };
  set('mat', s.mat); set('plant', s.plant); set('klvar', s.klvar); set('tvers', s.tvers); set('stack', encodeStack(s.stack));
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
