/** Budget Excel upload parsing (exceljs, like the production plan upload; the spec's `xlsx` is not in this project). */
import type { BudCompDom, BudCompIntl, Land1 } from './budgetRatesTypes';
import { padMatnr } from './budgetRatesApi';

type Cell = unknown;

/** header (upper case) -> SAP field. IGNORED headers are read and dropped. */
const DOM_MAP: Record<string, string> = {
  MATNR: 'Matnr', WERKS: 'Werks', DATE_FROM: 'ValidFrom', DATE_TO: 'ValidTo', CATEGORY: 'Category', UOM: 'Meins', WAERS: 'Waers',
  BASIC: 'Basic', DISCOUNT_P: 'DiscountP', DISCOUNT_AMT: 'DiscountAmt', ASSESABLE_VAL: 'AssesableValueP', EXCISE_P: 'ExciseP',
  BASIC_CUSTOMS: 'BasicCustomsP', EIC: 'EicP', PAL: 'PalP', L_IMP_CESS: 'LImpCessP', L_NBT_4P01: 'LNbt4p01P',
  VAT_SL: 'VatP', FREIGHT: 'Freight', CF_CHANGES: 'FrgAmt', B_RATE: 'BRate', B_UOM: 'BUom', B_QTY: 'Budqty', CONTINGENCY: 'Contingency',
};
const INTL_MAP: Record<string, string> = {
  MATNR: 'Matnr', WERKS: 'Werks', DATE_FROM: 'ValidFrom', DATE_TO: 'ValidTo', CATEGORY: 'Category', UOM: 'Meins', WAERS: 'Waers', BASIC: 'Basic',
  ASSESABLE_VAL: 'AssesableValueP', BASIC_CUSTOMS: 'BasicCustomsP', EIC: 'EicP', PAL: 'PalP', L_IMP_CESS: 'LImpCessP', L_NBT_4P01: 'LNbt4p01P',
  VAT_SL: 'VatP', FREIGHT: 'Freight', CF_CHANGES: 'CfCharges',
  VAT_IMP_DUBAI: 'VatP', FREIGHT_VAL: 'FreightAmt', IMP_DUTY_DUBAI: 'ImpDutyDubaiP', DUBAI_FREIGHT: 'DubaiFreight', DUBAI_CLR_CHRG: 'DubaiClrChrg',
  DISCOUNT: 'Discount', REGULAR_DUTY: 'RegularDutyP', SUPPLIMENTARY_DUTY: 'SupplimentaryDutyP', VAT: 'VatP', ADV_INCOME_TAX: 'AdvIncomeTaxP',
  ATV_BASE: 'AtvBaseP', GLOBAL_TAX: 'GlobalTaxP', LOADING_P: 'LoadingP', ATV_ACTUAL_P: 'AtvActualP', PRE_SHIPMENT_INSPECT: 'PreshipmentInspect',
  CF_CHARGES: 'CfChargesP', ENTRY_TAX: 'EntryTax', OTHER_CLEARING_CHRG: 'OthersClearing', INS: 'Ins', OTH_CHNG: 'OthChgs', OTH_EXP: 'OthExp',
  B_RATE: 'BRate', B_UOM: 'BUom', B_QTY: 'BQty', CONTINGENCY: 'Contingency', Z_AYU_COS: 'AyuCos',
};
const TEXT_FIELDS = new Set(['Matnr', 'Werks', 'Category', 'Meins', 'Waers', 'Buduom', 'BUom', 'AyuCos', 'ValidFrom', 'ValidTo']);
const DATE_FIELDS = new Set(['ValidFrom', 'ValidTo']);

const plain = (v: Cell): unknown => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text !== undefined) return o.text;
  }
  return v;
};

/** DD.MM.YYYY (or a real Excel date, or already YYYYMMDD) -> YYYYMMDD. */
export function sapDate(v: unknown): string {
  if (v instanceof Date) return `${v.getUTCFullYear()}${String(v.getUTCMonth() + 1).padStart(2, '0')}${String(v.getUTCDate()).padStart(2, '0')}`;
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m) return `${m[3]}${m[2].padStart(2, '0')}${m[1].padStart(2, '0')}`;
  return s.replace(/[-./]/g, '');
}

async function readSheet(file: File): Promise<unknown[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no sheet.');
  const grid: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => { grid[n - 1] = (row.values as unknown[]).slice(1).map(plain); });
  return grid.filter(Boolean);
}

function rowsFromGrid(grid: unknown[][], map: Record<string, string>): Record<string, unknown>[] {
  if (!grid.length) throw new Error('The sheet is empty.');
  const heads = grid[0].map((h) => String(h ?? '').trim().toUpperCase());
  const mapped = heads.filter((h) => map[h]).length;
  if (mapped < 3 || !heads.includes('MATNR') || !heads.includes('WERKS')) {
    throw new Error(`Row 1 must hold the column headers (MATNR, WERKS, ...); only ${mapped} known headers found. Download the template for the layout.`);
  }
  const out: Record<string, unknown>[] = [];
  for (const cells of grid.slice(1)) {
    if (!cells.some((v) => v !== undefined && v !== null && String(v).trim() !== '')) continue;
    const r: Record<string, unknown> = {};
    heads.forEach((h, i) => {
      const f = map[h];
      const v = cells[i];
      if (!f || v === undefined || v === null || String(v).trim() === '') return;
      if (DATE_FIELDS.has(f)) r[f] = sapDate(v);
      else if (TEXT_FIELDS.has(f)) r[f] = String(v).trim();
      else { const n = Number(String(v).replace(/,/g, '')); r[f] = Number.isFinite(n) ? n : 0; }
    });
    if (r.Matnr) r.Matnr = padMatnr(String(r.Matnr));
    if (r.Werks) r.Werks = String(r.Werks).toUpperCase();
    if (r.Matnr || r.Werks) out.push(r);
  }
  return out;
}

export async function parseDomesticExcel(file: File): Promise<Partial<BudCompDom>[]> {
  return rowsFromGrid(await readSheet(file), DOM_MAP) as Partial<BudCompDom>[];
}

export async function parseIntlExcel(file: File, land1: Land1): Promise<Partial<BudCompIntl>[]> {
  return rowsFromGrid(await readSheet(file), INTL_MAP).map((r) => ({ ...r, Land1: land1 })) as Partial<BudCompIntl>[];
}
