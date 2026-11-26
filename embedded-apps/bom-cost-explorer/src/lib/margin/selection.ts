/**
 * The selection every Margin screen shares (Board, What-if, Alerts, Portfolio, History) and how it travels in the URL. Reading the URL fills the form
 * only: nothing is ever requested from it. All values are encoded with encodeURIComponent (a space is %20, never "+").
 */
import { EMPTY_LIST, type ListFilter } from '../so/types';
import type { MarginQuery } from './filter';

export interface MarginSel {
  materials: string[]; plants: string[]; market: string; channel: string; prodha: string; brand: string;
  source: 'L' | 'S'; priceDate: string; freight: boolean; explQty: string;
  /** O = latest sales order (the sales-area part applies); 'U' (uploaded prices) is retired and never set by the screens */
  priceSrc: 'U' | 'O';
  vkorg: string[]; vtweg: string[]; segment: string; days: number;
  auart: ListFilter; pstyv: ListFilter; kdgrp: ListFilter; kunnr: ListFilter;
}
export const DEFAULT_SEL: MarginSel = {
  materials: [], plants: [], market: '', channel: '', prodha: '', brand: '', source: 'L', priceDate: '', freight: true, explQty: '', priceSrc: 'O',
  vkorg: [], vtweg: [], segment: '', days: 365, auart: EMPTY_LIST, pstyv: EMPTY_LIST, kdgrp: EMPTY_LIST, kunnr: EMPTY_LIST,
};

/** SAP's live costing costs a finished good IN A PLANT: without a plant, or without finished goods / a hierarchy / a brand, it answers with an empty list and no message.
 * So a live run must name both (a snapshot read is not limited this way). Returns the text for the field that is missing. */
export function liveSelectionErrors(s: MarginSel): { materials?: string; plants?: string } {
  if (s.source !== 'L') return {};
  const e: { materials?: string; plants?: string } = {};
  if (!s.plants.length) e.plants = 'Pick at least one plant: SAP costs a finished good in a plant, so a live run needs one (without it SAP returns nothing).';
  if (!s.materials.length && !s.prodha.trim() && !s.brand.trim()) e.materials = 'Pick at least one finished good (or a product hierarchy or brand).';
  return e;
}

export function toMarginQuery(s: MarginSel): MarginQuery {
  const order = s.priceSrc === 'O';
  return {
    materials: s.materials, plants: s.plants, market: order ? '' : s.market, channel: order ? '' : s.channel, prodha: s.prodha, brand: s.brand,
    source: s.source, priceDate: s.priceDate || undefined, explQty: s.explQty || undefined, inclFrt: s.freight,
    priceSrc: order ? 'O' : '', vkorg: order ? s.vkorg : [], vtweg: order ? s.vtweg : [], segment: order && s.segment ? [s.segment] : [], soDays: order ? s.days : undefined,
    auart: order ? s.auart : EMPTY_LIST, pstyv: order ? s.pstyv : EMPTY_LIST, kdgrp: order ? s.kdgrp : EMPTY_LIST, kunnr: order ? s.kunnr : EMPTY_LIST,
  };
}

const list = (v: string | null) => (v ? Array.from(new Set(v.split(',').map((x) => decodeURIComponent(x).trim()).filter(Boolean))) : []);
const enc = (v: string[]) => v.map(encodeURIComponent).join(',');
const LISTS = [['auart', 'a', 'ax'], ['pstyv', 'p', 'px'], ['kdgrp', 'k', 'kx'], ['kunnr', 'u', 'ux']] as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseMarginSearch(search: string): MarginSel {
  const p = new URLSearchParams(search);
  const s: MarginSel = { ...DEFAULT_SEL };
  s.materials = list(p.get('mat')); s.plants = list(p.get('plants')).map((x) => x.toUpperCase());
  s.market = p.get('mk') ?? ''; s.channel = p.get('ch') ?? ''; s.prodha = p.get('prodha') ?? ''; s.brand = p.get('brand') ?? '';
  s.source = p.get('src') === 'S' ? 'S' : 'L';
  const pd = p.get('pd'); s.priceDate = pd && DAY.test(pd) ? pd : '';
  s.freight = p.get('frt') !== '0';
  const q = p.get('qty'); s.explQty = q && /^\d+(\.\d+)?$/.test(q) ? q : '';
  s.priceSrc = 'O';   // prices always come from the latest sales order (selling price, MRP) and the costed components; uploaded prices are no longer used
  s.vkorg = list(p.get('vk')); s.vtweg = list(p.get('vt')); s.segment = p.get('seg') ?? '';
  const d = Number(p.get('days')); s.days = Number.isInteger(d) && d >= 1 ? d : DEFAULT_SEL.days;
  for (const [k, i, e] of LISTS) s[k] = { in: list(p.get(i)), ex: list(p.get(e)) };
  return s;
}

export function marginSearch(s: MarginSel, keep: Record<string, string> = {}): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => { if (v) parts.push(`${k}=${v}`); };
  add('mat', enc(s.materials)); add('plants', enc(s.plants)); add('mk', encodeURIComponent(s.market)); add('ch', encodeURIComponent(s.channel));
  add('prodha', encodeURIComponent(s.prodha)); add('brand', encodeURIComponent(s.brand));
  if (s.source === 'S') parts.push('src=S');
  add('pd', encodeURIComponent(s.priceDate)); if (!s.freight) parts.push('frt=0'); add('qty', encodeURIComponent(s.explQty));
  if (s.priceSrc === 'O') {
    parts.push('ps=O'); add('vk', enc(s.vkorg)); add('vt', enc(s.vtweg)); add('seg', encodeURIComponent(s.segment));
    if (s.days !== DEFAULT_SEL.days) parts.push(`days=${s.days}`);
    for (const [k, i, e] of LISTS) { add(i, enc(s[k].in)); add(e, enc(s[k].ex)); }
  }
  for (const [k, v] of Object.entries(keep)) add(k, encodeURIComponent(v));
  return parts.length ? `?${parts.join('&')}` : '';
}
