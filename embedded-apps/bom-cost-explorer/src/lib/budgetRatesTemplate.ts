import type { Land1, TableType } from './budgetRatesTypes';

const split = (s: string) => s.split(/\s+/).filter(Boolean);

// Headers the parser (budgetExcel.ts) reads, so a downloaded template always uploads.
const LK = split('LAND1 MATNR WERKS DATE_FROM DATE_TO CATEGORY UOM EPEIN WAERS BASIC ASSESABLE_VAL BASIC_CUSTOMS EIC PAL L_IMP_CESS L_NBT_4P01 VAT_SL FREIGHT CF_CHANGES B_RATE B_UOM B_QTY CONTINGENCY');
const AE = split('LAND1 MATNR WERKS DATE_FROM DATE_TO CATEGORY UOM EPEIN WAERS BASIC ASSESABLE_VAL BASIC_CUSTOMS VAT_IMP_DUBAI FREIGHT_VAL IMP_DUTY_DUBAI DUBAI_FREIGHT DUBAI_CLR_CHRG FREIGHT CF_CHANGES B_RATE B_UOM B_QTY CONTINGENCY');
const BD = split('LAND1 MATNR WERKS DATE_FROM DATE_TO CATEGORY UOM EPEIN WAERS Z_AYU_COS BASIC DISCOUNT ASSESABLE_VAL BASIC_CUSTOMS REGULAR_DUTY SUPPLIMENTARY_DUTY VAT ADV_INCOME_TAX ATV_BASE GLOBAL_TAX LOADING_P ATV_ACTUAL_P PRE_SHIPMENT_INSPECT FREIGHT_VAL FREIGHT_QTY CF_CHARGES ENTRY_TAX OTHER_CLEARING_CHRG INS OTH_CHNG OTH_EXP B_RATE B_UOM B_QTY CONTINGENCY');

// Domestic and Sri Lanka share SAP's st_component structure, so they share the template.
export const templateHeaders = (t: TableType, land1?: Land1) => (t === 'DOM' ? LK : land1 === 'AE' ? AE : land1 === 'BD' ? BD : LK);

const TEXT_SAMPLE: Record<string, string> = {
  LAND1: 'LK', MATNR: '400000001', WERKS: 'UN13', DATE_FROM: '01.04.2026', DATE_TO: '31.03.2027', CATEGORY: 'RM', UOM: 'KG', EPEIN: '1',
  WAERS: 'INR', B_UOM: 'KG', Z_AYU_COS: 'A',
};

/** Placeholder row: text fields get an obvious example, every number is 1. */
const sampleRow = (headers: string[], land1?: Land1) => headers.map((h) => (h === 'LAND1' ? land1 ?? 'IN' : TEXT_SAMPLE[h] ?? 1));

export async function generateTemplate(tableType: TableType, land1?: Land1): Promise<void> {
  const headers = templateHeaders(tableType, land1);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Budget');
  ws.addRow(headers);
  ws.addRow(sampleRow(headers, land1));
  ws.getRow(1).font = { bold: true };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  ws.columns.forEach((c) => { c.width = 16; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `budget_template_${tableType}_${tableType === 'INTL' ? land1 ?? 'LK' : 'IN'}_${new Date().getFullYear()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
