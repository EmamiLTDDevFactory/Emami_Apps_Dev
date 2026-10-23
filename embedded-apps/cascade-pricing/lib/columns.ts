import type { Column } from './types';

/** Condition Creation, Review / Approval, Version history and the simulation result. */
export const CASCADE_COLUMNS: Column[] = [
  { key: 'S_LAND1', label: 'Selling Country' },
  { key: 'D_LAND1', label: 'Dest. Country' },
  { key: 'KUNNR', label: 'Customer' },
  { key: 'NAME1', label: 'Customer Name' },
  { key: 'VKORG', label: 'Sales Org.' },
  { key: 'MATNR', label: 'Material Code' },
  { key: 'MAKTX', label: 'Material Description' },
  { key: 'CASCADE_DESC', label: 'Cascade Mat Desc' },
  { key: 'ZSKUSIZE', label: 'SKU Size' },
  { key: 'ZVERSION', label: 'Version' },
  { key: 'L_WAERK', label: 'Local Currency' },
  { key: 'B_WAERK', label: 'Billing Currency' },
  { key: 'ZI_RRP_PER_PC', label: 'RRP/Pc Incl VAT' },
  { key: 'ZVAT', label: 'VAT' },
  { key: 'ZE_RRP_PER_PC', label: 'RRP/Pc Excl VAT' },
  { key: 'ZRRP_PER_DZ', label: 'RRP/Dz' },
  { key: 'ZRETAIL', label: 'Retailer Margin' },
  { key: 'ZPTT', label: 'PTT Incl A&P' },
  { key: 'ZAP_ON_PTT', label: 'A&P on PTT' },
  { key: 'ZDAMGE', label: 'Damage/Expiry' },
  { key: 'ZPTT_E_AP', label: 'PTT Excl A&P' },
  { key: 'ZDMARGIN', label: 'Distributor Margin' },
  { key: 'ZDLC', label: 'DLC' },
  { key: 'ZCUS_DUTY', label: 'Custom Duty' },
  { key: 'ZCF', label: 'C&F' },
  { key: 'ZLC_CHARGE', label: 'LC Charge' },
  { key: 'ZCIF', label: 'CIF' },
  { key: 'ZDAM_ZDAX', label: 'Damage/Expiry' },
  { key: 'ZCIF_F', label: 'Billing Price before A&P - CIF' },
  { key: 'ZAP', label: 'A&P' },
  { key: 'ZCIF_AFTER_AP', label: 'Billing Price after A&P - CIF' },
  { key: 'VALIDFROM', label: 'Valid From' },
  { key: 'VALIDTO', label: 'Valid To' },
];

/** Cascade Material Extraction (CascadeMapSet). */
export const MATERIAL_COLUMNS: Column[] = [
  { key: 'MATNR', label: 'Material Code' },
  { key: 'MAKTX', label: 'Material Description' },
  { key: 'CASCADE_DESC', label: 'Cascade Description' },
  { key: 'ZBUSINESS', label: 'Business' },
];

/** Cascade Rate Upload: also the column order of the rate Excel file. */
export const RATE_COLUMNS: Column[] = [
  { key: 'LLAND', label: 'Selling Country' },
  { key: 'MATNR', label: 'Material Code' },
  { key: 'ZRRP_KSCHL', label: 'RRP Incl VAT Condition' },
  { key: 'ZRRP_KBETR', label: 'RRP Incl VAT rate' },
  { key: 'ZCVT_KSCHL', label: 'VAT Condition' },
  { key: 'ZCVT_KBETR', label: 'VAT Rate' },
  { key: 'ZRPI_KSCHL', label: 'RRP Condition' },
  { key: 'ZRPI_KBETR', label: 'RRP Rate' },
  { key: 'ZRTL_KSCHL', label: 'Retailer Margin Condition' },
  { key: 'ZRTL_KBETR', label: 'Retailer Margin Rate' },
  { key: 'ZPTT_KSCHL', label: 'A&P on PTT' },
  { key: 'ZPTT_KBETR', label: 'A&P on PTT Rate' },
  { key: 'ZDEX_KSCHL', label: 'Damage/Expiry' },
  { key: 'ZDEX_KBETR', label: 'Damage/Expiry Rate' },
  { key: 'ZDML_KSCHL', label: 'Distributor Margin' },
  { key: 'ZDML_KBETR', label: 'Distributor Margin Rate' },
  { key: 'ZCUD_KSCHL', label: 'Customs Duty' },
  { key: 'ZCUD_KBETR', label: 'Customs Duty Rate' },
  { key: 'ZCFD_KSCHL', label: 'C&F Condition' },
  { key: 'ZCFD_KBETR', label: 'C&F Rate' },
  { key: 'ZLCC_KSCHL', label: 'LC Charge' },
  { key: 'ZLCC_KBETR', label: 'LC Charge Rate' },
  { key: 'ZDAX_KSCHL', label: 'Damage/Expiry' },
  { key: 'ZDAX_KBETR', label: 'Damage/Expiry Rate' },
  { key: 'ZAP_KSCHL', label: 'A&P' },
  { key: 'ZAP_KBETR', label: 'A&P Rate' },
  { key: 'VFROM', label: 'Valid From' },
  { key: 'VTO', label: 'Valid To' },
  { key: 'WAERK', label: 'Currency' },
];

/** Pricing Simulation input: also the column order of the simulation Excel file. */
export const SIM_INPUT_COLUMNS: Column[] = [
  { key: 'VKORG', label: 'Sales Org.' },
  { key: 'WERKS', label: 'Plant' },
  { key: 'KUNNR', label: 'Customer' },
  { key: 'MATNR', label: 'Material Code' },
  { key: 'CHARG', label: 'Batch' },
  { key: 'L_WAERK', label: 'Local Currency' },
  { key: 'B_WAERK', label: 'Billing Currency' },
];

const NUMERIC_HINTS = ['RRP', 'CIF', 'DZ', 'PC', 'AP', 'DLC', 'DUTY', 'MARGIN', 'RETAIL', 'PTT', 'DAM', 'DEX', 'VAT', 'CF', 'CHARGE'];

/** Amount / rate columns: right-aligned, 2 decimals. Condition types (…_KSCHL) are text even when the name matches. */
export function isNumericKey(key: string): boolean {
  if (key.endsWith('_KSCHL')) return false;
  if (key.startsWith('Z') && key.endsWith('KBETR')) return true;
  return NUMERIC_HINTS.some((h) => key.includes(h));
}

export const DATE_KEYS: ReadonlySet<string> = new Set(['VALIDFROM', 'VALIDTO', 'VFROM', 'VTO', 'PDATE']);
