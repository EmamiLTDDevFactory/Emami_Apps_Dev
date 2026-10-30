/**
 * SAP names of the weighted-average-cost (WAC) entity sets of ZMM_BOM_COST_SRV, kept apart from
 * lib/sap/entities.ts / fields.ts on purpose (those stay untouched). Each entity is internal key ->
 * [SAP property, kind] exactly like lib/sap/fields.ts, so the shared normaliser reads it.
 *
 * Variances, source costs and rates use kind 's' (kept as the string SAP sent). Checked against NWP on 2026-10-31: the key
 * property is `Rowid` (numeric); a source with no rates answers 0.0000 / 0.000000 with a blank flag (not an empty value), so
 * "no data" is decided in view.ts (hasData helpers), never by testing for ''.
 */
import type { FieldKind } from '../sap/fields';

export const WAC_SET = { ROWS: 'WacRowSet', COMPARE: 'WacCompareSet', COMP: 'WacCompSet', DOCS: 'WacDocSet' } as const;
export type WacSetKey = keyof typeof WAC_SET;

type FieldMap = Record<string, readonly [sapName: string, kind: FieldKind]>;
const def = <T extends FieldMap>(m: T) => m;

/** Filter-only properties (the same names on every set; some only on one - see buildWacFilter). */
export const WAC_FILTER = {
  Matnr: 'Matnr', Werks: 'Werks', Prodha: 'Prodha', DateFrom: 'DateFrom', DateTo: 'DateTo', InclCmp: 'InclCmp',
  VarPctIn: 'VarPctIn', VarHighIn: 'VarHighIn', SrcIn: 'SrcIn', GrpIn: 'GrpIn',
} as const;

export const WAC_ROW = def({
  Rowid: ['Rowid', 'i'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Mtart: ['Mtart', 's'],
  Zbrand: ['Zbrand', 's'], Prodha: ['Prodha', 's'], Zskugrcodecrs: ['Zskugrcodecrs', 's'], Zskugroupcrs: ['Zskugroupcrs', 's'],
  Uom: ['Uom', 's'], Docs: ['Docs', 'i'], Batches: ['Batches', 'i'], DupDocs: ['DupDocs', 'i'], Qty: ['Qty', 'd'],
  ActRm: ['ActRm', 'd'], ActPm: ['ActPm', 'd'], ActPerf: ['ActPerf', 'd'], ActMat: ['ActMat', 'd'],
  ActConv: ['ActConv', 'd'], ActLanded: ['ActLanded', 'd'], ActRecon: ['ActRecon', 'd'],
  VarpSel: ['VarpSel', 's'], VarpCmap: ['VarpCmap', 's'], VarpCon: ['VarpCon', 's'], VarpAvg: ['VarpAvg', 's'],
  FlagSel: ['FlagSel', 's'], FlagCmap: ['FlagCmap', 's'], FlagCon: ['FlagCon', 's'], FlagAvg: ['FlagAvg', 's'],
  Status: ['Status', 's'], Msg: ['Msg', 's'],
});

export const WAC_COMPARE = def({
  Rowid: ['Rowid', 'i'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Grp: ['Grp', 's'], Src: ['Src', 's'],
  ActPu: ['ActPu', 's'], SrcPu: ['SrcPu', 's'], VarAbs: ['VarAbs', 's'], VarPct: ['VarPct', 's'], Flag: ['Flag', 's'], Dir: ['Dir', 's'],
  NComp: ['NComp', 'i'], NRated: ['NRated', 'i'], CoverPct: ['CoverPct', 's'],
});

export const WAC_COMP = def({
  Rowid: ['Rowid', 'i'], Matnr: ['Matnr', 's'], Werks: ['Werks', 's'], Idnrk: ['Idnrk', 's'], CompTxt: ['CompTxt', 's'], Mtart: ['Mtart', 's'],
  Grp: ['Grp', 's'], SrcSel: ['SrcSel', 's'], Uom: ['Uom', 's'], QtyPu: ['QtyPu', 'd'],
  RateSel: ['RateSel', 's'], RateCmap: ['RateCmap', 's'], RateCon: ['RateCon', 's'], RateAvg: ['RateAvg', 's'],
  CostSel: ['CostSel', 's'], CostCmap: ['CostCmap', 's'], CostCon: ['CostCon', 's'], CostAvg: ['CostAvg', 's'],
  VarpCmap: ['VarpCmap', 's'], VarpCon: ['VarpCon', 's'], VarpAvg: ['VarpAvg', 's'], Flag: ['Flag', 's'],
});

export const WAC_DOC = def({
  Rowid: ['Rowid', 'i'], Mblnr: ['Mblnr', 's'], Mjahr: ['Mjahr', 's'], Werks: ['Werks', 's'], Matnr: ['Matnr', 's'], Charg: ['Charg', 's'],
  Budat: ['Budat', 't'], Aufnr: ['Aufnr', 's'], Via: ['Via', 's'], Qty: ['Qty', 'd'], Uom: ['Uom', 's'], Hwaer: ['Hwaer', 's'], FxInr: ['FxInr', 's'],
  Rm: ['Rm', 'd'], Pm: ['Pm', 'd'], Perf: ['Perf', 'd'], Conv: ['Conv', 'd'], Landed: ['Landed', 'd'], Rows: ['Rows', 'i'],
});

export const WAC_FIELDS = { ROWS: WAC_ROW, COMPARE: WAC_COMPARE, COMP: WAC_COMP, DOCS: WAC_DOC } as const;
