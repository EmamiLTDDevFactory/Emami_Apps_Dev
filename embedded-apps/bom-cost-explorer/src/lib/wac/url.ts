/** Filter state in the URL: ?plants=UN13,UB01&from=2026-10-01&to=2026-10-31&mat=...&prodha=...&cmp=1. Reading the URL never starts a run. */
export interface WacUrlState { plants: string[]; from: string; to: string; mat: string[]; prodha: string[]; cmp: boolean }

const list = (v: string | null) => (v ? Array.from(new Set(v.split(/[,\s;]+/).map((x) => x.trim()).filter(Boolean))) : []);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseWacUrl(search: string): Partial<WacUrlState> {
  const p = new URLSearchParams(search);
  const out: Partial<WacUrlState> = {};
  const plants = list(p.get('plants'));
  if (plants.length) out.plants = plants.map((x) => x.toUpperCase());
  const from = p.get('from'), to = p.get('to');
  if (from && DAY.test(from)) out.from = from;
  if (to && DAY.test(to)) out.to = to;
  const mat = list(p.get('mat'));
  if (mat.length) out.mat = mat;
  const prodha = list(p.get('prodha'));
  if (prodha.length) out.prodha = prodha;
  if (p.get('cmp') === '1') out.cmp = true;
  return out;
}

/** The query string of the selection. Values are encoded with encodeURIComponent (a space is %20, never "+"); list separators stay commas.
 * `keep` carries parameters owned by someone else (the shared price context `pc`) so writing the selection never drops them. */
export function wacSearch(s: WacUrlState, keep: Record<string, string> = {}): string {
  const list = (v: string[]) => v.map(encodeURIComponent).join(',');
  const parts: string[] = [];
  if (s.plants.length) parts.push(`plants=${list(s.plants)}`);
  if (s.from) parts.push(`from=${encodeURIComponent(s.from)}`);
  if (s.to) parts.push(`to=${encodeURIComponent(s.to)}`);
  if (s.mat.length) parts.push(`mat=${list(s.mat)}`);
  if (s.prodha.length) parts.push(`prodha=${list(s.prodha)}`);
  if (s.cmp) parts.push('cmp=1');
  for (const [k, v] of Object.entries(keep)) if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
