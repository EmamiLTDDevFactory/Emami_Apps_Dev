'use client';
/** Excel export of the Variance check: Orders (ZMM_PCOST view), Components (ZMM_COST of every checked order), Causes, Parameters. Text cells go through
 *  sanitizeCell inside downloadWacWorkbook (formula injection guard). exceljs is loaded on demand. */
import type { WacSheet } from '../wac/export';
import type { PoVarRow } from './fields';
import { CAT_LABEL, dec, strip, type Cause, type CkCompare } from './view';

const n = (v: string | null | undefined, dp = 6) => { const d = dec(v ?? ''); return d ? Number(d.toFixed(dp)) : null; };
const nd = (v: { toFixed: (dp: number) => string } | null, dp = 6) => (v ? Number(v.toFixed(dp)) : null);

export function ordersSheet(rows: PoVarRow[], flagged: (r: PoVarRow) => boolean): WacSheet {
  return {
    name: 'Orders', count: rows.length, cols: [
      { header: 'Over threshold', get: (i) => (flagged(rows[i]) ? 'Yes' : '') },
      { header: 'Process order', get: (i) => strip(rows[i].Aufnr) }, { header: 'Plant', get: (i) => rows[i].Werks },
      { header: 'Material', get: (i) => strip(rows[i].Matnr) }, { header: 'Description', width: 36, get: (i) => rows[i].Maktx },
      { header: 'Batch', get: (i) => rows[i].Charg }, { header: 'Material doc.', get: (i) => strip(rows[i].Mblnr) },
      { header: 'Posting date', get: (i) => rows[i].Budat ?? '' }, { header: 'Created / changed', get: (i) => rows[i].Erdat ?? '' },
      { header: 'Quantity', dp: 3, get: (i) => n(rows[i].Menge, 3) }, { header: 'Unit', get: (i) => rows[i].Meins },
      { header: 'RM', dp: 2, curr: 'INR', get: (i) => n(rows[i].Rm, 2) }, { header: 'PM', dp: 2, curr: 'INR', get: (i) => n(rows[i].Pm, 2) },
      { header: 'Perfume', dp: 2, curr: 'INR', get: (i) => n(rows[i].Perf, 2) }, { header: 'Other', dp: 2, curr: 'INR', get: (i) => n(rows[i].Oth, 2) },
      { header: 'Conversion', dp: 2, curr: 'INR', get: (i) => n(rows[i].Conv, 2) }, { header: 'Consumer scheme', dp: 2, curr: 'INR', get: (i) => n(rows[i].Cons, 2) },
      { header: 'Trade scheme', dp: 2, curr: 'INR', get: (i) => n(rows[i].Trd, 2) }, { header: 'Total cost', dp: 2, curr: 'INR', get: (i) => n(rows[i].Total, 2) },
      { header: 'Actual / pc', dp: 4, curr: 'INR', get: (i) => n(rows[i].ActPc, 4) }, { header: 'Price control', get: (i) => rows[i].Vprsv },
      { header: 'Valuation type', get: (i) => rows[i].Bwtar }, { header: 'Standard / pc (MBEW)', dp: 4, curr: 'INR', get: (i) => n(rows[i].StdPc, 4) },
      { header: 'Diff % (std - actual) / std', dp: 2, get: (i) => n(rows[i].DiffPct, 2) }, { header: 'Variance value (actual - std)', dp: 2, curr: 'INR', get: (i) => n(rows[i].VarVal, 2) },
      { header: 'CK13N / pc', dp: 4, curr: 'INR', get: (i) => n(rows[i].CkPc, 4) }, { header: 'CK13N costing date', get: (i) => rows[i].CkKadky ?? '' },
      { header: 'CK13N variant / status', get: (i) => [rows[i].CkKlvar, rows[i].CkStatus].filter(Boolean).join(' / ') },
      { header: 'Diff % vs CK13N', dp: 2, get: (i) => n(rows[i].CkDiffPct, 2) }, { header: 'Variance vs CK13N', dp: 2, curr: 'INR', get: (i) => n(rows[i].CkVarVal, 2) },
      { header: 'Flag', get: (i) => rows[i].Flag }, { header: 'Note', width: 50, get: (i) => rows[i].Msg },
    ],
  };
}

export function ckSheet(cmp: Map<string, CkCompare>): WacSheet {
  const rows = [...cmp.entries()].flatMap(([aufnr, c]) => c.lines.map((l) => ({ aufnr, l, fg: c.fgQty })));
  return {
    name: 'Components vs CK13N', count: rows.length, cols: [
      { header: 'Process order', get: (i) => strip(rows[i].aufnr) }, { header: 'FG pieces', dp: 0, get: (i) => nd(rows[i].fg, 3) },
      { header: 'Component', get: (i) => rows[i].l.matnr }, { header: 'Description', width: 36, get: (i) => rows[i].l.maktx }, { header: 'Category', get: (i) => CAT_LABEL[rows[i].l.cat] ?? rows[i].l.cat },
      { header: 'Via (bulk / WIP)', get: (i) => rows[i].l.via },
      { header: 'Status', get: (i) => ({ both: '', 'ck-only': 'In CK13N, not consumed', 'actual-only': 'Consumed, not in CK13N' })[rows[i].l.status] },
      { header: 'Actual qty', dp: 3, get: (i) => nd(rows[i].l.actQty, 3) }, { header: 'Actual unit', get: (i) => rows[i].l.actUom },
      { header: 'Actual rate', dp: 4, curr: 'INR', get: (i) => nd(rows[i].l.actRate, 4) }, { header: 'Actual value', dp: 2, curr: 'INR', get: (i) => nd(rows[i].l.actVal, 2) },
      { header: 'CK13N qty', dp: 3, get: (i) => nd(rows[i].l.ckQty, 3) }, { header: 'CK13N unit', get: (i) => rows[i].l.ckUom },
      { header: 'CK13N rate', dp: 4, curr: 'INR', get: (i) => nd(rows[i].l.ckRate, 4) }, { header: 'CK13N value', dp: 2, curr: 'INR', get: (i) => nd(rows[i].l.ckVal, 2) },
      { header: 'Rate diff %', dp: 2, get: (i) => nd(rows[i].l.diffPct, 2) }, { header: 'Qty diff %', dp: 2, get: (i) => nd(rows[i].l.qtyPct, 2) },
      { header: 'Rate variance', dp: 2, curr: 'INR', get: (i) => nd(rows[i].l.rateVar, 2) }, { header: 'Qty variance', dp: 2, curr: 'INR', get: (i) => nd(rows[i].l.qtyVar, 2) },
      { header: 'Total variance', dp: 2, curr: 'INR', get: (i) => nd(rows[i].l.totVar, 2) },
    ],
  };
}

export function componentsSheet(breakups: Map<string, PoVarRow[]>): WacSheet {
  const rows = [...breakups.entries()].flatMap(([aufnr, rs]) => rs.filter((r) => r.Grain !== 'M').map((r) => ({ aufnr, r })));
  return {
    name: 'Components', count: rows.length, cols: [
      { header: 'Process order', get: (i) => strip(rows[i].aufnr) }, { header: 'Line', get: (i) => ({ H: 'Finished good', W: 'WIP / bulk', C: 'Component' } as Record<string, string>)[rows[i].r.Grain] ?? rows[i].r.Grain },
      { header: 'Level', get: (i) => rows[i].r.Level }, { header: 'Parent', get: (i) => strip(rows[i].r.Parent) },
      { header: 'Material', get: (i) => strip(rows[i].r.Matnr) }, { header: 'Description', width: 36, get: (i) => rows[i].r.Maktx },
      { header: 'Category', get: (i) => CAT_LABEL[rows[i].r.Cat] ?? rows[i].r.Cat }, { header: 'Plant', get: (i) => rows[i].r.Werks }, { header: 'Batch', get: (i) => rows[i].r.Charg },
      { header: 'Quantity', dp: 3, get: (i) => n(rows[i].r.Menge, 3) }, { header: 'Unit', get: (i) => rows[i].r.Meins },
      { header: 'Actual value', dp: 2, curr: 'INR', get: (i) => n(rows[i].r.Total, 2) }, { header: 'Actual rate', dp: 4, curr: 'INR', get: (i) => n(rows[i].r.ActPc, 4) },
      { header: 'Price control', get: (i) => rows[i].r.Vprsv }, { header: 'Standard rate (MBEW)', dp: 4, curr: 'INR', get: (i) => n(rows[i].r.StdPc, 4) },
      { header: 'Diff % (std - actual) / std', dp: 2, get: (i) => n(rows[i].r.DiffPct, 2) }, { header: 'Variance value (actual - std x qty)', dp: 2, curr: 'INR', get: (i) => n(rows[i].r.VarVal, 2) },
      { header: 'Variance per FG piece', dp: 4, curr: 'INR', get: (i) => n(rows[i].r.VarFgPc, 4) }, { header: 'FG quantity', dp: 3, get: (i) => n(rows[i].r.FgQty, 3) },
      { header: 'Flag', get: (i) => rows[i].r.Flag }, { header: 'Note', width: 50, get: (i) => rows[i].r.Msg },
    ],
  };
}

export function causesSheet(rows: Cause[]): WacSheet {
  return {
    name: 'Causes', count: rows.length, cols: [
      { header: 'Material', get: (i) => rows[i].matnr }, { header: 'Description', width: 36, get: (i) => rows[i].maktx }, { header: 'Category', get: (i) => CAT_LABEL[rows[i].cat] ?? rows[i].cat },
      { header: 'Plant', get: (i) => rows[i].werks }, { header: 'Orders', get: (i) => rows[i].orders.length }, { header: 'Order numbers', width: 40, get: (i) => rows[i].orders.map(strip).join(', ') },
      { header: 'Quantity', dp: 3, get: (i) => nd(rows[i].qty, 3) }, { header: 'Unit', get: (i) => rows[i].meins },
      { header: 'Actual rate', dp: 4, curr: 'INR', get: (i) => nd(rows[i].actRate, 4) }, { header: 'MBEW rate', dp: 4, curr: 'INR', get: (i) => nd(rows[i].stdRate, 4) },
      { header: 'Diff % vs MBEW', dp: 2, get: (i) => nd(rows[i].diffPct, 2) }, { header: 'Variance vs MBEW', dp: 2, curr: 'INR', get: (i) => nd(rows[i].varVal, 2) },
      { header: 'CK13N rate variance', dp: 2, curr: 'INR', get: (i) => (rows[i].ckOrders ? nd(rows[i].ckRateVar, 2) : null) },
      { header: 'CK13N qty variance', dp: 2, curr: 'INR', get: (i) => (rows[i].ckOrders ? nd(rows[i].ckQtyVar, 2) : null) },
      { header: 'CK13N total variance', dp: 2, curr: 'INR', get: (i) => (rows[i].ckOrders ? nd(rows[i].ckTotVar, 2) : null) },
      { header: 'Flags', get: (i) => rows[i].flags.join(', ') },
    ],
  };
}
