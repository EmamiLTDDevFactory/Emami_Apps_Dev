/**
 * Item level comparison of a finished good: actual consumption of its process orders (DashCdrillSet production mode, per piece produced, WIP exploded to its own
 * components) against CK13N, per piece. The CK13N side is its costing structure down to the last level (lib/ck/structure.ts, explosionFromStructure), so the
 * figures are the ones CK13N shows. Activities of every level are summed into one Conversion line and compared with the actual conversion per piece.
 */
import Decimal from 'decimal.js';
import { CAT_LABEL, type Cat, type CdrillComp } from './cdrill';
import { lastLevel, type StructNode } from '../ck/structure';

const ZERO = new Decimal(0);
const d = (v: string | null | undefined): Decimal => { try { return v && v.trim() !== '' ? new Decimal(v) : ZERO; } catch { return ZERO; } };
const strip = (m: string) => String(m ?? '').trim().replace(/^0+/, '');

export interface StdLine { matnr: string; text: string; mtart: string; uom: string; qtyPc: Decimal; valPc: Decimal; /** bulk it came from ('' = directly in the finished good) */ via: string }
export interface StdExplosion { lines: StdLine[]; convPc: Decimal; otherPc: Decimal; /** bulk lines that could not be exploded (no estimate): kept as they are */ unexploded: string[]; /** sum of the opened bulks' lines - their own values */ bulkDiff: Decimal; bulks: { matnr: string; ownPc: Decimal; explodedPc: Decimal }[] }

export interface ItemVarRow {
  matnr: string; text: string; cat: string; via: string;
  stdUom: string; actUom: string;
  stdQty: Decimal | null; actQty: Decimal | null; qtyPct: Decimal | null;
  stdVal: Decimal | null; actVal: Decimal | null; variance: Decimal | null; pct: Decimal | null;
  /** actual quantity and value consumed (not per piece); null without actual */
  actTotQty?: Decimal | null; actTotVal?: Decimal | null;
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
      stdVal, actVal, variance, pct: pctOf(actVal, stdVal), actTotQty: ac ? ac.qty : null, actTotVal: ac ? ac.val : null, status: st && ac ? 'both' : st ? 'ck-only' : 'actual-only',
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

/**
 * The standard side from CK13N's costing structure (lib/ck/structure.ts, built per piece: scale 1): every last-level line as CK13N values it
 * (components with an own estimate of the same costing date valued with it), activities of every level into conversion. Produced components that
 * were opened are listed in `bulks` with their own value against the sum of their lines (CK13N shows both; they differ when lines were re-costed).
 */
export function explosionFromStructure(nodes: StructNode[]): StdExplosion {
  const out: StdExplosion = { lines: [], convPc: ZERO, otherPc: ZERO, unexploded: [], bulkDiff: ZERO, bulks: [] };
  const parentOf = new Map<string, string>();
  const mark = (ns: StructNode[], via: string) => { for (const n of ns) { parentOf.set(n.id, via); if (n.children.length) mark(n.children, n.matnr); } };
  mark(nodes, '');
  for (const n of lastLevel(nodes)) {
    if (n.item.Typps === 'E') { out.convPc = out.convPc.plus(n.value); continue; }
    if (!n.matnr) { out.otherPc = out.otherPc.plus(n.value); continue; }
    out.lines.push({ matnr: n.matnr, text: n.item.ItemTxt, mtart: n.item.Mtart, uom: n.item.Uom || '', qtyPc: n.qty, valPc: n.value, via: parentOf.get(n.id) ?? '' });
  }
  const sumLines = (n: StructNode): Decimal => lastLevel([n]).reduce((t, x) => t.plus(x.value), ZERO);
  const opened: StructNode[] = [];
  const walk = (ns: StructNode[]) => { for (const n of ns) if (n.children.length) { opened.push(n); walk(n.children); } };
  walk(nodes.filter((n) => n.children.length));
  for (const n of opened.filter((x) => x.depth === 1)) { const e = sumLines(n); out.bulks.push({ matnr: n.matnr, ownPc: n.value, explodedPc: e }); out.bulkDiff = out.bulkDiff.plus(e.minus(n.value)); }
  return out;
}
