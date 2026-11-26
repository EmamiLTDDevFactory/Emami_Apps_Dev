/**
 * Item level comparison of a finished good: actual consumption of its process orders (DashCdrillSet production mode, per piece produced, WIP exploded to its own
 * components) against the CK13N standard cost estimate (CkItemSet), per piece.
 *
 * CK13N itemization is single level: the bulk / WIP is ONE line of the finished good's estimate. The actual side has no WIP line (SAP explodes it), so the bulk is
 * exploded here with ITS OWN current CK13N estimate in the item plant: child quantity and value per unit of bulk x the bulk quantity per piece of the finished good.
 * CkItemSet live (NWP, 26.11.2026): QtyUnit = quantity per 1 unit of the header, ValueUnit = value per 1 unit of the header (Losgr already divided out).
 * The bulk estimate may be newer than the price the finished good's estimate used for the bulk, so the exploded total can differ from the CK13N header total;
 * that difference is returned (bulkDiff) and shown, never hidden.
 * Activity items (Typps E: machine, labour, power, steam) are summed into one Conversion line and compared with the actual conversion per piece of the orders.
 */
import Decimal from 'decimal.js';
import type { CkItemRow } from '../ck/types';
import { CAT_LABEL, type Cat, type CdrillComp } from './cdrill';

const ZERO = new Decimal(0);
const d = (v: string | null | undefined): Decimal => { try { return v && v.trim() !== '' ? new Decimal(v) : ZERO; } catch { return ZERO; } };
const strip = (m: string) => String(m ?? '').trim().replace(/^0+/, '');

/** Material types exploded through their own estimate (bulk / semi-finished). */
export const EXPLODE_MTART = new Set(['HALB', 'WIP']);
const MAX_DEPTH = 3;

export interface StdLine { matnr: string; text: string; mtart: string; uom: string; qtyPc: Decimal; valPc: Decimal; /** bulk it came from ('' = directly in the finished good) */ via: string }
export interface StdExplosion { lines: StdLine[]; convPc: Decimal; otherPc: Decimal; /** bulk lines that could not be exploded (no estimate): kept as they are */ unexploded: string[]; /** exploded value - the bulk line value of the finished good's estimate */ bulkDiff: Decimal; bulks: { matnr: string; ownPc: Decimal; explodedPc: Decimal }[] }

export type ItemFetcher = (matnr: string, werks: string) => Promise<CkItemRow[]>;

/** Per piece standard lines of the finished good, bulk exploded through its own CK13N estimate (recursively, max 3 levels). */
export async function explodeCk(items: CkItemRow[], werks: string, fetchItems: ItemFetcher): Promise<StdExplosion> {
  const out: StdExplosion = { lines: [], convPc: ZERO, otherPc: ZERO, unexploded: [], bulkDiff: ZERO, bulks: [] };
  async function walk(rows: CkItemRow[], factor: Decimal, via: string, depth: number): Promise<Decimal> {
    let total = ZERO;
    for (const r of rows) {
      const qty = d(r.QtyUnit).times(factor);
      const val = d(r.ValueUnit).times(factor);
      total = total.plus(val);
      if (r.Typps === 'E') { out.convPc = out.convPc.plus(val); continue; }
      if (r.Typps !== 'M' || !strip(r.Idnrk)) { out.otherPc = out.otherPc.plus(val); continue; }
      if (EXPLODE_MTART.has(String(r.Mtart).toUpperCase()) && depth < MAX_DEPTH) {
        let children: CkItemRow[] = [];
        try { children = await fetchItems(strip(r.Idnrk), r.ItemWerks || werks); } catch { children = []; }
        if (children.length) {
          const exploded = await walk(children, qty, strip(r.Idnrk), depth + 1);
          out.bulks.push({ matnr: strip(r.Idnrk), ownPc: val, explodedPc: exploded });
          out.bulkDiff = out.bulkDiff.plus(exploded.minus(val));
          continue;
        }
        out.unexploded.push(strip(r.Idnrk));
      }
      out.lines.push({ matnr: strip(r.Idnrk), text: r.ItemTxt, mtart: r.Mtart, uom: r.QtyUnit ? (r.Uom || '') : r.Uom, qtyPc: qty, valPc: val, via });
    }
    return total;
  }
  await walk(items, new Decimal(1), '', 0);
  return out;
}

export interface ItemVarRow {
  matnr: string; text: string; cat: string; via: string;
  stdUom: string; actUom: string;
  stdQty: Decimal | null; actQty: Decimal | null; qtyPct: Decimal | null;
  stdVal: Decimal | null; actVal: Decimal | null; variance: Decimal | null; pct: Decimal | null;
  status: 'both' | 'ck-only' | 'actual-only';
}
export interface ItemVariance { rows: ItemVarRow[]; conv: ItemVarRow; total: ItemVarRow }

const pctOf = (a: Decimal | null, s: Decimal | null): Decimal | null => (a && s && !s.isZero() ? a.minus(s).div(s.abs()).times(100) : null);
const catOfMtart = (mtart: string): string => (['VERP', 'PKGN'].includes(String(mtart).toUpperCase()) ? CAT_LABEL.P : String(mtart).toUpperCase() === 'ROH' ? CAT_LABEL.R : CAT_LABEL.O);

/** Matches the standard lines and the actual components by material; quantity variance only when both sides use the same unit. Biggest absolute variance first. */
export function ckItemVariance(std: StdExplosion, actual: Record<Cat, CdrillComp[]>, actualConvPc: Decimal | null): ItemVariance {
  const s = new Map<string, StdLine & { vias: Set<string> }>();
  for (const l of std.lines) {
    const e = s.get(l.matnr);
    if (e) { e.qtyPc = e.qtyPc.plus(l.qtyPc); e.valPc = e.valPc.plus(l.valPc); if (l.via) e.vias.add(l.via); } else s.set(l.matnr, { ...l, vias: new Set(l.via ? [l.via] : []) });
  }
  const a = new Map<string, CdrillComp>();
  for (const c of Object.values(actual).flat()) {
    const k = strip(c.matnr);
    const e = a.get(k);
    a.set(k, e ? { ...e, qtyPc: e.qtyPc.plus(c.qtyPc), costPc: e.costPc.plus(c.costPc), qty: e.qty.plus(c.qty), val: e.val.plus(c.val) } : { ...c, matnr: k });
  }
  const rows: ItemVarRow[] = [];
  for (const k of new Set([...s.keys(), ...a.keys()])) {
    const st = s.get(k); const ac = a.get(k);
    const stdQty = st ? st.qtyPc : null; const actQty = ac ? ac.qtyPc : null;
    const sameUnit = !!st && !!ac && (st.uom || '').toUpperCase() === (ac.meins || '').toUpperCase();
    const stdVal = st ? st.valPc : null; const actVal = ac ? ac.costPc : null;
    const variance = (actVal ?? ZERO).minus(stdVal ?? ZERO);
    rows.push({
      matnr: k, text: ac?.maktx || st?.text || '', cat: ac ? CAT_LABEL[ac.cat] : catOfMtart(st!.mtart), via: st ? [...st.vias].join(', ') : '',
      stdUom: st?.uom ?? '', actUom: ac?.meins ?? '', stdQty, actQty, qtyPct: sameUnit ? pctOf(actQty, stdQty) : null,
      stdVal, actVal, variance, pct: pctOf(actVal, stdVal), status: st && ac ? 'both' : st ? 'ck-only' : 'actual-only',
    });
  }
  rows.sort((x, y) => y.variance!.abs().comparedTo(x.variance!.abs()) || x.matnr.localeCompare(y.matnr));
  const conv: ItemVarRow = { matnr: '', text: 'Conversion (machine, labour, power, steam)', cat: 'Conversion', via: '', stdUom: '', actUom: '', stdQty: null, actQty: null, qtyPct: null,
    stdVal: std.convPc, actVal: actualConvPc, variance: actualConvPc ? actualConvPc.minus(std.convPc) : null, pct: pctOf(actualConvPc, std.convPc), status: actualConvPc ? 'both' : 'ck-only' };
  const sv = rows.reduce((t, r) => t.plus(r.stdVal ?? ZERO), ZERO).plus(std.convPc).plus(std.otherPc);
  const av = rows.reduce((t, r) => t.plus(r.actVal ?? ZERO), ZERO).plus(actualConvPc ?? ZERO);
  const total: ItemVarRow = { matnr: '', text: 'Total per piece', cat: '', via: '', stdUom: '', actUom: '', stdQty: null, actQty: null, qtyPct: null, stdVal: sv, actVal: av, variance: av.minus(sv), pct: pctOf(av, sv), status: 'both' };
  return { rows, conv, total };
}
