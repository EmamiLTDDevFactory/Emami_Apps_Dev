/**
 * RigidSet of ZMM_BOM_COST_SRV (read-only): the ZRIGID rate of a rigid packing item per mould and vendor (class ZCL_MM_RIGID_COST).
 * Filters: Matnr (item, or the polymer for Mode 'U'), Werks, Gjahr, Mode = C calc (default) / F flag / B budget / H history / U usage.
 * Rows: F flag, M mould x vendor build-up, B BOM component of an M row, D budget (ZCOMPONENT), P packing budget build-up (ZPKG_BUD_ITEM), H saved ZRIGID rates, U item using a polymer.
 * Amounts are per 1000 pieces unless stated; decimals arrive as strings.
 */
import type { FieldMap } from '../price-context/odata';

export const RIGID_SET = 'RigidSet';
export const RIGID_FIELDS = {
  Grain: ['Grain', 's'], Rowid: ['Rowid', 's'], Matnr: ['Matnr', 's'], Maktx: ['Maktx', 's'], Werks: ['Werks', 's'], Mould: ['Mould', 's'], MouldTxt: ['MouldTxt', 's'], Mds: ['Mds', 's'], Design: ['Design', 's'], Mcat: ['Mcat', 's'], McatTxt: ['McatTxt', 's'], Lifnr: ['Lifnr', 's'], Vendor: ['Vendor', 's'], Mach: ['Mach', 's'], MachTxt: ['MachTxt', 's'], Flag: ['Flag', 's'], Msg: ['Msg', 's'], Gjahr: ['Gjahr', 's'], Uname: ['Uname', 's'], Infnr: ['Infnr', 's'], Comp: ['Comp', 's'], CompTxt: ['CompTxt', 's'], Gewei: ['Gewei', 's'], Origin: ['Origin', 's'], Meins: ['Meins', 's'], Waers: ['Waers', 's'], Category: ['Category', 's'], Mode: ['Mode', 's'],
  ValidFrom: ['ValidFrom', 't'], ValidTo: ['ValidTo', 't'], CrtDate: ['CrtDate', 't'],
  Nmould: ['Nmould', 'i'],
  Ntgew: ['Ntgew', 'd'], RunCavity: ['RunCavity', 'd'], CycTime: ['CycTime', 'd'], HoursDay: ['HoursDay', 'd'], FacProd: ['FacProd', 'd'], TotOut: ['TotOut', 'd'], TotOutMon: ['TotOutMon', 'd'], Kansw: ['Kansw', 'd'], Nafag: ['Nafag', 'd'], Zujhr: ['Zujhr', 'd'], OpenPr: ['OpenPr', 'd'], Zmrt: ['Zmrt', 'd'], ConvCost: ['ConvCost', 'd'], MatCost: ['MatCost', 'd'], Zmbx: ['Zmbx', 'd'], Zmpb: ['Zmpb', 'd'], Zmtp: ['Zmtp', 'd'], Zppb: ['Zppb', 'd'], ZppbT: ['ZppbT', 'd'], Zmac: ['Zmac', 'd'], Zmat: ['Zmat', 'd'], Zitc: ['Zitc', 'd'], Zmar: ['Zmar', 'd'], Zehp: ['Zehp', 'd'], Zwad: ['Zwad', 'd'], Zdaj: ['Zdaj', 'd'], Zmfg: ['Zmfg', 'd'], LandRate: ['LandRate', 'd'], CompQty: ['CompQty', 'd'], BomQty: ['BomQty', 'd'], DosPerc: ['DosPerc', 'd'], DosPercS: ['DosPercS', 'd'], ScrapPct: ['ScrapPct', 'd'], Zpbr: ['Zpbr', 'd'], Zmds: ['Zmds', 'd'], Zmfr: ['Zmfr', 'd'], CompCost: ['CompCost', 'd'], Budqty: ['Budqty', 'd'], Basic: ['Basic', 'd'], DiscAmt: ['DiscAmt', 'd'], TaxAmt: ['TaxAmt', 'd'], FrgAmt: ['FrgAmt', 'd'], Freight: ['Freight', 'd'], Landed: ['Landed', 'd'], Total: ['Total', 'd'], RSap: ['RSap', 'd'], RUsed: ['RUsed', 'd'], FUsed: ['FUsed', 'd'], Cbr: ['Cbr', 'd'], Cbud: ['Cbud', 'd'], Br: ['Br', 'd'], VarPct: ['VarPct', 'd'], LandedRate: ['LandedRate', 'd'], FrtTotal: ['FrtTotal', 'd'],
} as const satisfies FieldMap;

type KindType = { s: string; d: string; i: number; t: string | null; b: boolean; f: boolean };
export type RigidRow = { [K in keyof typeof RIGID_FIELDS]: KindType[(typeof RIGID_FIELDS)[K][1]] };
export type RigidMode = 'C' | 'F' | 'B' | 'H' | 'U';
