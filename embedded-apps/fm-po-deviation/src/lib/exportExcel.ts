import * as XLSX from 'xlsx';
import type { PoRow } from '../types/po';
import { formatDate } from './formatters';

const STATUS_LABEL: Record<string, string> = { A: 'Approved', R: 'Rejected', '': 'Pending' };

export function exportPoRowsToExcel(rows: PoRow[], sheetName: string, filenamePrefix: string): void {
  const data = rows.map((r) => ({
    'PO Number': r.ebeln,
    Vendor: r.name1,
    'Vendor Code': r.lifnr,
    Description: r.stxt,
    Amount: r.netwr,
    Currency: r.waers,
    Status: STATUS_LABEL[r.status] ?? r.status,
    'Release Status': r.zpoInd === 'R' ? 'Released' : 'Unreleased',
    Date: formatDate(r.erdat),
    Remarks: r.addInfo,
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);
  XLSX.writeFile(book, `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
