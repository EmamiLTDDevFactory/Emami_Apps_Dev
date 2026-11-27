/**
 * PoVarSet (ZCL_MM_PO_VARIANCE, structure ZPOVAR_S_ROW; sources in sap/povar). One set, two reads:
 *  - orders (Grain O): tcode ZMM_PCOST - one row per process-order receipt of ZMB31_POUTILITY, cost per piece vs the finished good's MBEW price;
 *  - breakup (Aufnr eq one order and Grain eq 'C'): tcode ZMM_COST - H = finished-good receipt, W = WIP / bulk line, C = consumed component with its rate vs MBEW.
 *  M rows carry a message (Flag EMPTY / AUTH / PARTIAL / ERROR / MSG).
 * Decimals are kept as SAP's strings (kind 'd'); DiffPct follows ZMM_PCOST: (standard - actual) / standard x 100, so NEGATIVE = costlier than standard.
 */
import type { FieldMap } from '../price-context/odata';

export const POVAR_SET = 'PoVarSet';
export const POVAR_FILTER = { Grain: 'Grain', Aufnr: 'Aufnr', Matnr: 'Matnr', Werks: 'Werks', PostType: 'PostType', DateFrom: 'DateFrom', DateTo: 'DateTo', DateType: 'DateType' } as const;

export const POVAR_FIELDS = {
  Rowid: ['Rowid', 'i'], Grain: ['Grain', 's'], Aufnr: ['Aufnr', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Mtart: ['Mtart', 's'], Matkl: ['Matkl', 's'], Cat: ['Cat', 's'],
  Werks: ['Werks', 's'], Charg: ['Charg', 's'], PostType: ['PostType', 's'], Mblnr: ['Mblnr', 's'], Mjahr: ['Mjahr', 's'], Budat: ['Budat', 't'], Erdat: ['Erdat', 't'],
  Zbusiness: ['Zbusiness', 's'], Crssku: ['Crssku', 's'], Level: ['Level', 'i'], Parent: ['Parent', 's'], IsWip: ['IsWip', 's'],
  Menge: ['Menge', 'd'], Meins: ['Meins', 's'], BaseUom: ['BaseUom', 's'], FgQty: ['FgQty', 'd'],
  Rm: ['Rm', 'd'], Pm: ['Pm', 'd'], Perf: ['Perf', 'd'], Oth: ['Oth', 'd'], Conv: ['Conv', 'd'], Cons: ['Cons', 'd'], Trd: ['Trd', 'd'], Total: ['Total', 'd'], ActPc: ['ActPc', 'd'],
  Bwtar: ['Bwtar', 's'], Vprsv: ['Vprsv', 's'], Peinh: ['Peinh', 'd'], Stprs: ['Stprs', 'd'], Verpr: ['Verpr', 'd'], StdPc: ['StdPc', 'd'], StdVal: ['StdVal', 'd'],
  VarVal: ['VarVal', 'd'], VarFgPc: ['VarFgPc', 'd'], DiffPct: ['DiffPct', 'd'], Flag: ['Flag', 's'], Msg: ['Msg', 's'],
  // CK13N current standard estimate of the material and plant (ZCL_MM_CK_READER->pick), per base unit; order rows (O) and the finished-good row (H) only
  CkPc: ['CkPc', 'd'], CkKadky: ['CkKadky', 't'], CkStatus: ['CkStatus', 's'], CkKlvar: ['CkKlvar', 's'], CkDiffPct: ['CkDiffPct', 'd'], CkVarVal: ['CkVarVal', 'd'],
} as const satisfies FieldMap;

export interface PoVarRow {
  Rowid: number; Grain: string; Aufnr: string; Matnr: string; Maktx: string; Mtart: string; Matkl: string; Cat: string;
  Werks: string; Charg: string; PostType: string; Mblnr: string; Mjahr: string; Budat: string | null; Erdat: string | null;
  Zbusiness: string; Crssku: string; Level: number; Parent: string; IsWip: string;
  Menge: string; Meins: string; BaseUom: string; FgQty: string;
  Rm: string; Pm: string; Perf: string; Oth: string; Conv: string; Cons: string; Trd: string; Total: string; ActPc: string;
  Bwtar: string; Vprsv: string; Peinh: string; Stprs: string; Verpr: string; StdPc: string; StdVal: string;
  VarVal: string; VarFgPc: string; DiffPct: string; Flag: string; Msg: string;
  CkPc: string; CkKadky: string | null; CkStatus: string; CkKlvar: string; CkDiffPct: string; CkVarVal: string;
}
