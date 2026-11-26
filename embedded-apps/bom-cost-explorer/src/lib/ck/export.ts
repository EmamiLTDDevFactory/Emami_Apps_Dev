/** Excel sheets of the Standard cost page (only what has been loaded). Written with downloadWacWorkbook (lib/wac/export.ts). */
import type { XCol } from '../client/export';
import type { WacSheet } from '../wac/export';
import { groupName, dec, type CompareRow } from './view';
import { itemOrigin, originBreakup } from '../cost/originBreakup';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from './types';

const n = (v: string | null | undefined) => { const d = dec(v); return d ? Number(d.toFixed(6)) : null; };

export function headerSheet(h: CkHeaderRow): WacSheet {
  const rows: [string, string | number | null][] = [
    ['Material', `${h.Matnr} ${h.Maktx}`.trim()], ['Plant', `${h.Werks} ${h.WerksTxt}`.trim()], ['Material type', h.Mtart], ['Costing variant', h.Klvar], ['Costing version', h.Tvers], ['Valuation variant', h.Bwvar], ['Costing type (Kkzma)', h.Kkzma],
    ['Cost estimate number (Kalnr)', h.Kalnr], ['Costing key date (Kadky)', h.Kadky ?? ''], ['Costing date from', h.Kadat ?? ''], ['Costing date to', h.Bidat ?? ''], ['Qty structure date (Aldat)', h.Aldat ?? ''], ['Valuation date (Bwdat)', h.Bwdat ?? ''],
    ['Costing lot size', [h.Losgr, h.Meeht].filter(Boolean).join(' ')], ['Price unit', h.Peinh], ['Status', h.StatusTxt || h.Status], ['Standard (last 30 days)', h.CurStd ? 'yes' : 'no'],
    [`Total per lot (${h.Curr})`, n(h.TotalLot)], [`Total per unit (${h.Curr})`, n(h.TotalUnit)], [`Standard price (${h.Curr})`, n(h.StdPrice)], [`Moving average price (${h.Curr})`, n(h.MapPrice)], ['Fixed unit', h.FixedUnit], ['Variable unit', h.VarUnit], ['Price control', h.PriceCtrl],
    [`Difference (${h.Curr})`, n(h.StdDiff)], ['Difference %', n(h.StdDiffPct)], ['Value basis', h.ValueBasis], ['Components', h.NComp], ['Items', h.NItem], ['Created by', h.Ernam], ['Created on', h.Erdat ?? ''], ['SAP message', h.Msg],
  ];
  const cols: XCol[] = [{ header: 'Field', width: 36, get: (i) => rows[i][0] }, { header: 'Value', width: 50, get: (i) => rows[i][1] }];
  return { name: 'Header', cols, count: rows.length };
}

export function componentsSheet(rows: CkCompRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Seq', width: 6, get: (i) => rows[i].Seq }, { header: 'Component', width: 14, get: (i) => rows[i].CompNo }, { header: 'Description', width: 36, get: (i) => rows[i].CompTxt },
    { header: 'Group', width: 16, get: (i) => groupName(String(rows[i].Grp)) }, { header: 'Total per unit', dp: 4, curr: 'INR', width: 15, get: (i) => n(rows[i].Total) },
    { header: 'Currency', width: 9, get: (i) => rows[i].Curr }, { header: 'Share %', dp: 2, width: 9, get: (i) => n(rows[i].SharePct) }, { header: 'Total row', width: 9, get: (i) => (rows[i].IsSum ? 'yes' : '') },
  ];
  return { name: 'Components', cols, count: rows.length };
}

export function itemsSheet(rows: CkItemRow[], origins?: ReadonlyMap<string, string> | null): WacSheet {
  const cols: XCol[] = [
    { header: 'Item', width: 8, get: (i) => rows[i].Posnr }, { header: 'Type', width: 18, get: (i) => `${rows[i].Typps} ${rows[i].TyppsTxt}`.trim() }, { header: 'Cost element', width: 26, get: (i) => `${rows[i].Kstar} ${rows[i].KstarTxt}`.trim() },
    { header: 'Origin group', width: 16, get: (i) => itemOrigin(rows[i], origins) },
    { header: 'Material / activity', width: 18, get: (i) => rows[i].Idnrk || rows[i].Lstar }, { header: 'Plant', width: 8, get: (i) => rows[i].ItemWerks }, { header: 'Cost centre', width: 12, get: (i) => rows[i].Kostl },
    { header: 'Description', width: 34, get: (i) => rows[i].ItemTxt }, { header: 'Quantity', dp: 4, width: 13, get: (i) => n(rows[i].Qty) }, { header: 'Unit', width: 7, get: (i) => rows[i].QtyUnit || rows[i].Uom },
    { header: 'Price', dp: 4, curr: 'INR', width: 13, get: (i) => n(rows[i].Price) }, { header: 'Price unit', width: 10, get: (i) => n(rows[i].PriceUnit) }, { header: 'Value per lot', dp: 4, curr: 'INR', width: 15, get: (i) => n(rows[i].ValueLot) },
    { header: 'Value per unit', dp: 4, curr: 'INR', width: 15, get: (i) => n(rows[i].ValueUnit) }, { header: 'Currency', width: 9, get: (i) => rows[i].Curr }, { header: 'Has own estimate', width: 10, get: (i) => (rows[i].HasEst ? 'yes' : '') },
  ];
  return { name: 'Items', cols, count: rows.length };
}

export function originSheet(rows: CkItemRow[], origins?: ReadonlyMap<string, string> | null): WacSheet {
  const { slices, total } = originBreakup(rows.map((r) => ({ origin: itemOrigin(r, origins), value: r.ValueUnit })));
  const cols: XCol[] = [
    { header: 'Origin group', width: 24, get: (i) => slices[i].origin }, { header: 'Items', width: 8, get: (i) => slices[i].lines },
    { header: 'Value per unit', dp: 4, curr: 'INR', width: 16, get: (i) => Number(slices[i].value.toFixed(6)) }, { header: 'Share % (computed here)', dp: 2, width: 12, get: (i) => (slices[i].share ? Number(slices[i].share!.toFixed(4)) : null) },
  ];
  void total;
  return { name: 'Origin groups', cols, count: slices.length };
}

export function estimatesSheet(rows: CkListRow[]): WacSheet {
  const cols: XCol[] = [
    { header: 'Status', width: 14, get: (i) => rows[i].StatusTxt || rows[i].Status }, { header: 'Costing variant', width: 9, get: (i) => rows[i].Klvar }, { header: 'Version', width: 8, get: (i) => rows[i].Tvers },
    { header: 'Valuation variant', width: 9, get: (i) => rows[i].Bwvar }, { header: 'Costing key date', width: 14, get: (i) => rows[i].Kadky ?? '' }, { header: 'Costing date from', width: 14, get: (i) => rows[i].Kadat ?? '' },
    { header: 'Costing date to', width: 14, get: (i) => rows[i].Bidat ?? '' }, { header: 'Lot size', dp: 3, width: 12, get: (i) => n(rows[i].Losgr) }, { header: 'Unit', width: 7, get: (i) => rows[i].Meeht },
    { header: 'Total per unit', dp: 4, curr: 'INR', width: 14, get: (i) => n(rows[i].Total) }, { header: 'Standard price', dp: 4, curr: 'INR', width: 14, get: (i) => n(rows[i].StdPrice) }, { header: 'Currency', width: 9, get: (i) => rows[i].Curr },
    { header: 'Standard (last 30 days)', width: 14, get: (i) => (rows[i].CurStd ? 'yes' : '') }, { header: 'Cost estimate number', width: 14, get: (i) => rows[i].Kalnr }, { header: 'Created by', width: 12, get: (i) => rows[i].Ernam }, { header: 'Created on', width: 12, get: (i) => rows[i].Erdat ?? '' },
  ];
  return { name: 'Estimates', cols, count: rows.length };
}

export function compareSheet(rows: CompareRow[], labelA: string, labelB: string): WacSheet {
  const cols: XCol[] = [
    { header: 'Component', width: 14, get: (i) => rows[i].CompNo }, { header: 'Description', width: 34, get: (i) => rows[i].CompTxt }, { header: 'Group', width: 16, get: (i) => groupName(rows[i].Grp) },
    { header: `A: ${labelA}`, dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].a) }, { header: `B: ${labelB}`, dp: 4, curr: 'INR', width: 18, get: (i) => n(rows[i].b) },
    { header: 'Difference B - A (computed here)', dp: 4, curr: 'INR', width: 22, get: (i) => n(rows[i].diff) }, { header: 'Currency A', width: 10, get: (i) => rows[i].curA }, { header: 'Currency B', width: 10, get: (i) => rows[i].curB },
  ];
  return { name: 'Compare', cols, count: rows.length };
}

/** Released CK13N estimate, every level (lib/ck/structure.ts): one row per line, indented by level, with the released value and, for information, a newer value of a component costed again after the release. */
export function structureSheet(rows: import('./structure').StructNode[], curr: string): WacSheet {
  const num = (v: import('decimal.js').default | null) => (v ? Number(v.toFixed(6)) : null);
  const cols: XCol[] = [
    { header: 'Level', width: 6, get: (i) => rows[i].depth },
    { header: 'Costing structure', width: 46, get: (i) => `${'  '.repeat(rows[i].depth - 1)}${rows[i].item.Typps === 'E' ? `${rows[i].item.Lstar} ${rows[i].item.KstarTxt}` : `${rows[i].matnr} ${rows[i].item.ItemTxt}`}`.trimEnd() },
    { header: 'Type', width: 8, get: (i) => rows[i].item.Typps }, { header: 'Material type', width: 9, get: (i) => rows[i].item.Mtart },
    { header: `Total value released (${curr})`, dp: 2, curr, width: 15, get: (i) => num(rows[i].itemValue) },
    { header: 'Quantity', dp: 3, width: 13, get: (i) => num(rows[i].qty) }, { header: 'Unit', width: 7, get: (i) => rows[i].item.Uom },
    { header: 'Plant', width: 7, get: (i) => rows[i].item.ItemWerks }, { header: 'Resource / cost centre', width: 18, get: (i) => [rows[i].item.Kostl, rows[i].item.Lstar].filter(Boolean).join(' ') },
    { header: `Costed again after release (${curr})`, dp: 2, curr, width: 17, get: (i) => (rows[i].basis === 'own' && !rows[i].value.minus(rows[i].itemValue).abs().lt('0.005') ? num(rows[i].value) : null) },
    { header: 'Own estimate status', width: 22, get: (i) => (rows[i].own ? `${rows[i].own!.StatusTxt || rows[i].own!.Status} ${rows[i].own!.Kadky ?? ''}`.trim() : '') },
  ];
  return { name: 'Costing structure', cols, count: rows.length };
}
