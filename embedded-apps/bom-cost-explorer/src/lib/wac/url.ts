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

export function wacSearch(s: WacUrlState): string {
  const p = new URLSearchParams();
  if (s.plants.length) p.set('plants', s.plants.join(','));
  if (s.from) p.set('from', s.from);
  if (s.to) p.set('to', s.to);
  if (s.mat.length) p.set('mat', s.mat.join(','));
  if (s.prodha.length) p.set('prodha', s.prodha.join(','));
  if (s.cmp) p.set('cmp', '1');
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
