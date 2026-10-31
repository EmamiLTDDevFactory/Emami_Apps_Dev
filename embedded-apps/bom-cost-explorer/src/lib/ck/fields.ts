/**
 * CK13N (standard cost estimate) sets of ZMM_BOM_COST_SRV. Checked against live NWP responses (HAR, 2026-10-31): CkHeaderSet and
 * CkCompSet answer and every property below exists; CkListSet and CkItemSet have not been seen live yet, so their names are still the
 * agreed contract: `npm run check:ck-so-metadata` checks them against $metadata. Kept apart from lib/sap/fields.ts on purpose.
 */
import type { FieldMap } from '../price-context/odata';

export const CK_SET = { LIST: 'CkListSet', HEADER: 'CkHeaderSet', COMP: 'CkCompSet', ITEM: 'CkItemSet' } as const;
export type CkSetKey = keyof typeof CK_SET;

export const CK_FILTER = { Matnr: 'Matnr', Werks: 'Werks', Kalnr: 'Kalnr', Kadky: 'Kadky', Tvers: 'Tvers', Bwvar: 'Bwvar', Kkzma: 'Kkzma', Klvar: 'Klvar', Status: 'Status', DateFrom: 'DateFrom', DateTo: 'DateTo', CurOnly: 'CurOnly' } as const;

const def = <T extends FieldMap>(m: T) => m;

export const CK_LIST = def({
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Kalnr: ['Kalnr', 's'], Kadky: ['Kadky', 't'], Tvers: ['Tvers', 's'], Bwvar: ['Bwvar', 's'], Kkzma: ['Kkzma', 's'], Klvar: ['Klvar', 's'],
  Status: ['Status', 's'], StatusTxt: ['StatusTxt', 's'], CurStd: ['CurStd', 'f'], Kadat: ['Kadat', 't'], Bidat: ['Bidat', 't'], Losgr: ['Losgr', 'd'], Meeht: ['Meeht', 's'],
  Total: ['Total', 's'], StdPrice: ['StdPrice', 's'], Curr: ['Curr', 's'], Ernam: ['Ernam', 's'], Erdat: ['Erdat', 't'],
});
export const CK_HEADER = def({
  Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], WerksTxt: ['WerksTxt', 's'], Mtart: ['Mtart', 's'], Kalnr: ['Kalnr', 's'], Kadky: ['Kadky', 't'], Tvers: ['Tvers', 's'], Bwvar: ['Bwvar', 's'], Kkzma: ['Kkzma', 's'], Klvar: ['Klvar', 's'],
  Status: ['Status', 's'], StatusTxt: ['StatusTxt', 's'], CurStd: ['CurStd', 'f'], Kadat: ['Kadat', 't'], Bidat: ['Bidat', 't'], Bwdat: ['Bwdat', 't'], Aldat: ['Aldat', 't'], Losgr: ['Losgr', 'd'], Meeht: ['Meeht', 's'], Peinh: ['Peinh', 's'], Curr: ['Curr', 's'],
  TotalLot: ['TotalLot', 's'], TotalUnit: ['TotalUnit', 's'], ValueBasis: ['ValueBasis', 's'], StdPrice: ['StdPrice', 's'], PriceCtrl: ['PriceCtrl', 's'], StdDiff: ['StdDiff', 's'], StdDiffPct: ['StdDiffPct', 's'],
  NComp: ['NComp', 'i'], NItem: ['NItem', 'i'], Ernam: ['Ernam', 's'], Erdat: ['Erdat', 't'], Msg: ['Msg', 's'],
});
export const CK_COMP = def({
  CompNo: ['CompNo', 's'], CompTxt: ['CompTxt', 's'], Grp: ['Grp', 's'], Seq: ['Seq', 'i'], Total: ['Total', 's'], SharePct: ['SharePct', 's'], Curr: ['Curr', 's'], IsSum: ['IsSum', 'f'],
});
export const CK_ITEM = def({
  Posnr: ['Posnr', 's'], Typps: ['Typps', 's'], TyppsTxt: ['TyppsTxt', 's'], Kstar: ['Kstar', 's'], KstarTxt: ['KstarTxt', 's'], Idnrk: ['Idnrk', 's'], ItemTxt: ['ItemTxt', 's'], Mtart: ['Mtart', 's'], ItemWerks: ['ItemWerks', 's'],
  Kostl: ['Kostl', 's'], Lstar: ['Lstar', 's'], Qty: ['Qty', 's'], Uom: ['Uom', 's'], QtyUnit: ['QtyUnit', 's'], Price: ['Price', 's'], PriceUnit: ['PriceUnit', 's'], ValueLot: ['ValueLot', 's'], ValueUnit: ['ValueUnit', 's'], Curr: ['Curr', 's'], HasEst: ['HasEst', 'f'],
});
export const CK_FIELDS = { LIST: CK_LIST, HEADER: CK_HEADER, COMP: CK_COMP, ITEM: CK_ITEM } as const;
/** kind 's' properties that are amounts / ratios: '' = nothing from SAP, shown as n/a, never as 0 */
export const CK_NULLABLE: Record<CkSetKey, ReadonlySet<string>> = {
  LIST: new Set(['Total', 'StdPrice']),
  HEADER: new Set(['TotalLot', 'TotalUnit', 'StdPrice', 'StdDiff', 'StdDiffPct', 'Peinh']),
  COMP: new Set(['Total', 'SharePct']),
  ITEM: new Set(['Qty', 'Price', 'PriceUnit', 'ValueLot', 'ValueUnit']),
};
