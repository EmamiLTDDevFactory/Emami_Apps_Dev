export type TableType = 'DOM' | 'INTL';
export type Land1 = 'LK' | 'AE' | 'BD';

export interface BudCompDom {
  Matnr: string; Werks: string; Gjahr: string;
  ValidFrom: string; ValidTo: string; Category: string; Maktx: string;
  Meins: string; Waers: string;
  Basic: number; DiscountP: number; DiscountAmt: number; DiscountBasic: number;
  ExciseP: number; ExciseAmt: number; CessP: number; CessAmt: number;
  HscessP: number; HscessAmt: number; TaxP: number; TaxAmt: number;
  VatP: number; VatAmt: number; FrgAmt: number;
  IgstRate: number; IgstAmount: number; CgstRate: number; CgstAmount: number;
  SgstUtgstRate: number; SgstUtgstAmount: number;
  Freight: number; Landed: number; Total: number;
  Budqty: number; Buduom: string; Contingency: number; Erdat: string; Ernam: string;
  /** upload-only (Excel B_RATE / B_UOM) */
  BRate?: number; BUom?: string;
}

export interface BudCompIntl {
  Matnr: string; Werks: string; Gjahr: string; Land1: string; AyuCos: string;
  ValidFrom: string; ValidTo: string; Category: string; Maktx: string;
  Meins: string; Waers: string;
  Basic: number; AssesableValueP: number; AssesableValueAmt: number;
  BasicCustomsP: number; BasicCustomsAmt: number;
  EicP: number; EicAmt: number; PalP: number; PalAmt: number;
  LImpCessP: number; LImpCessAmt: number; LNbt4p01P: number; LNbt4p01Amt: number;
  VatP: number; VatAmt: number; Freight: number; CfCharges: number; Landed: number;
  BRate: number; BUom: string; BQty: number; Contingency: number;
  FreightAmt: number; ImpDutyDubaiP: number; ImpDutyDubaiAmt: number;
  DubaiFreight: number; DubaiClrChrg: number; Discount: number;
  RegularDutyP: number; RegularDutyAmt: number;
  SupplimentaryDutyP: number; SupplimentaryDutyAmt: number;
  AdvIncomeTaxP: number; AdvIncomeTaxAmt: number;
  AtvBaseP: number; AtvBaseAmt: number; GlobalTaxP: number; GlobalTaxAmt: number;
  LoadingP: number; AtvActualP: number; PreshipmentInspect: number;
  CfChargesP: number; EntryTax: number; OthersClearing: number;
  Ins: number; OthChgs: number; OthChgsVal: number; OthExp: number;
  Erdat: string; Ernam: string;
}

export interface UploadResult {
  TableType: string; RowsSaved: number; RowsFailed: number;
  Message: string; Errors: string;
}

export interface BudgetSearchParams {
  tableType: TableType;
  gjahr: string;
  werks: string[];
  matnr: string[];
  land1: Land1[];
}

export const LAND1_LABEL: Record<Land1, string> = { LK: 'Sri Lanka', AE: 'Dubai', BD: 'Bangladesh' };
export const LAND1_FLAG: Record<Land1, string> = { LK: '🇱🇰', AE: '🇦🇪', BD: '🇧🇩' };
export const LAND1_LIST: Land1[] = ['LK', 'AE', 'BD'];

/** Column kinds: s text, m material number, d date, a amount (2 dp), p percent (4 dp). */
export type ColKind = 's' | 'm' | 'd' | 'a' | 'p';
export interface BudgetColumn { key: string; kind: ColKind }

const c = (spec: string): BudgetColumn[] =>
  spec.split(/\s+/).filter(Boolean).map((t) => {
    const [key, k] = t.split(':');
    return { key, kind: (k as ColKind) || 'a' };
  });

export const DOM_COLUMNS: BudgetColumn[] = c(
  'Matnr:m Maktx:s Werks:s Gjahr:s ValidFrom:d ValidTo:d Category:s Meins:s Waers:s Basic ' +
  'DiscountP:p DiscountAmt DiscountBasic ExciseP:p ExciseAmt CessP:p CessAmt TaxP:p TaxAmt VatP:p VatAmt ' +
  'IgstRate:p IgstAmount CgstRate:p CgstAmount SgstUtgstRate:p SgstUtgstAmount FrgAmt Freight Landed Total ' +
  'Budqty Buduom:s Contingency Erdat:d Ernam:s',
);

export const INTL_COLUMNS: BudgetColumn[] = c(
  'Matnr:m Maktx:s Werks:s Land1:s AyuCos:s Gjahr:s ValidFrom:d ValidTo:d Category:s Meins:s Waers:s Basic ' +
  'AssesableValueP:p AssesableValueAmt BasicCustomsP:p BasicCustomsAmt EicP:p EicAmt PalP:p PalAmt ' +
  'LImpCessP:p LImpCessAmt VatP:p VatAmt Freight CfCharges Landed BRate BUom:s BQty Contingency ' +
  'FreightAmt ImpDutyDubaiP:p ImpDutyDubaiAmt DubaiFreight DubaiClrChrg Discount RegularDutyP:p RegularDutyAmt ' +
  'SupplimentaryDutyP:p SupplimentaryDutyAmt AdvIncomeTaxP:p AdvIncomeTaxAmt AtvBaseP:p AtvBaseAmt ' +
  'GlobalTaxP:p GlobalTaxAmt LoadingP AtvActualP PreshipmentInspect CfChargesP:p EntryTax ' +
  'OthersClearing Ins OthChgs OthChgsVal OthExp Erdat:d Ernam:s',
);

export const columnsFor = (t: TableType) => (t === 'DOM' ? DOM_COLUMNS : INTL_COLUMNS);

/** Material number for display: leading zeros dropped. */
export const stripLeadingZeros = (matnr: string) => (/^\d+$/.test(matnr) ? matnr.replace(/^0+(?=\d)/, '') : matnr);
