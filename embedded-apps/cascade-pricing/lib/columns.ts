import type { Column } from './types';

/** Condition Creation, Review / Approval and Version history. */
export const CASCADE_COLS: Column[] = [
  { key: 'S_LAND1', label: 'Selling Country' },
  { key: 'D_LAND1', label: 'Dest. Country' },
  { key: 'KUNNR', label: 'Customer' },
  { key: 'NAME1', label: 'Customer Name' },
  { key: 'VKORG', label: 'Sales Org.' },
  { key: 'WERKS', label: 'Plant' },
  { key: 'CHARG', label: 'Batch' },
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
export const MAP_COLS: Column[] = [
  { key: 'MATNR', label: 'Material Code' },
  { key: 'MAKTX', label: 'Material Description' },
  { key: 'CASCADE_DESC', label: 'Cascade Description' },
  { key: 'ZBUSINESS', label: 'Business' },
];

/** The rate file's columns, in file order (parseRateFile). */
export const RATE_FILE_KEYS = [
  'LLAND', 'MATNR', 'ZRRP_KSCHL', 'ZRRP_KBETR', 'ZCVT_KSCHL', 'ZCVT_KBETR', 'ZRPI_KSCHL', 'ZRPI_KBETR', 'ZRTL_KSCHL', 'ZRTL_KBETR',
  'ZPTT_KSCHL', 'ZPTT_KBETR', 'ZDEX_KSCHL', 'ZDEX_KBETR', 'ZDML_KSCHL', 'ZDML_KBETR', 'ZCUD_KSCHL', 'ZCUD_KBETR', 'ZCFD_KSCHL', 'ZCFD_KBETR',
  'ZLCC_KSCHL', 'ZLCC_KBETR', 'ZDAX_KSCHL', 'ZDAX_KBETR', 'ZAP_KSCHL', 'ZAP_KBETR', 'VFROM', 'VTO', 'WAERK',
] as const;

/** Cascade Rate Upload grid (after ENRICH_RATES); VFROM / VTO are editable. */
export const RATE_COLS: Column[] = [
  { key: 'LLAND', label: 'Selling Country' },
  { key: 'MATNR', label: 'Material Code' },
  { key: 'MAKTX', label: 'Material Description' },
  { key: 'CASCADE_DESC', label: 'Cascade Description' },
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
  { key: 'VFROM', label: 'Valid From', editable: true },
  { key: 'VTO', label: 'Valid To', editable: true },
  { key: 'WAERK', label: 'Currency' },
];

/** The simulation file's columns, in file order (parseSimulationFile). */
export const SIM_FILE_KEYS = ['VKORG', 'WERKS', 'KUNNR', 'MATNR', 'CHARG', 'L_WAERK', 'B_WAERK'] as const;

/** Pricing Simulation before Run: the uploaded rows plus the editable Pricing Factor %. */
export const SIM_INPUT_COLS: Column[] = [
  { key: 'VKORG', label: 'Sales Org.' },
  { key: 'WERKS', label: 'Plant' },
  { key: 'KUNNR', label: 'Customer' },
  { key: 'MATNR', label: 'Material Code' },
  { key: 'CHARG', label: 'Batch' },
  { key: 'L_WAERK', label: 'Local Currency' },
  { key: 'B_WAERK', label: 'Billing Currency' },
  { key: 'ZPRICE_IN', label: 'Pricing Factor %', editable: true },
];

/** Pricing Simulation after Run: the cascade with the Pricing Factor % still editable (run again from the base price). */
export const SIM_COLS: Column[] = [{ key: 'ZPRICE_IN', label: 'Pricing Factor %', editable: true }, ...CASCADE_COLS];

const NUMERIC_HINTS = ['RRP', 'CIF', 'DZ', 'PC', 'AP', 'DLC', 'DUTY', 'MARGIN', 'RETAIL', 'PTT', 'DAM', 'DEX', 'VAT', 'CF', 'CHARGE', 'PRICE'];
const NEVER_NUMERIC: ReadonlySet<string> = new Set(['MATNR', 'KUNNR', 'VKORG', 'ZVERSION', 'VALIDFROM', 'VALIDTO', 'VFROM', 'VTO', 'PDATE']);
export const DATE_KEYS: ReadonlySet<string> = new Set(['VALIDFROM', 'VALIDTO', 'VFROM', 'VTO', 'PDATE']);

/** Right-aligned, 2 decimals: keys ending in KBETR or containing one of the hints, and ZPRICE_IN. Condition types (…_KSCHL), codes and dates never. */
export function isNumericKey(key: string): boolean {
  if (NEVER_NUMERIC.has(key) || key.endsWith('_KSCHL')) return false;
  if (key === 'ZPRICE_IN' || key.endsWith('KBETR')) return true;
  return NUMERIC_HINTS.some((h) => key.includes(h));
}
