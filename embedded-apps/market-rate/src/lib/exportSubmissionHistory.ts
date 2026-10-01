import * as XLSX from 'xlsx';
import { MONTHS } from '../components/CompactFilters';
import type { SubmissionRecord } from './marketRateApi';

/** The slice of a Submission History matrix row the export needs (see submission-history.tsx's
 * MatrixRow) — identity columns plus one submitted/not flag per MONTHS entry. */
export interface ExportRow {
  key: string;
  email: string;
  vendorCode: string;
  vendorName: string;
  materialCode: string;
  materialDesc: string;
  monthStatus: boolean[];
}

/** A numeric SAP value as a real number in the sheet (so Excel can sum/sort it), or the raw text
 * when it doesn't parse, or blank. */
function num(value: string | undefined): number | string {
  if (!value) return '';
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

/** Downloads the Admin Submission History report as .xlsx, exactly as currently filtered (year,
 * selected months, status, search):
 * - "Submission History": one row per vendor × material, the same columns as the on-screen table —
 *   Rate / Freight Value / Freight Terms / Landed Rate from the latest submitted month in the
 *   selection (blank if none), then Submitted/Pending per selected month and the total.
 * - "Monthly Detail": one row per vendor × material × selected month, with that month's own
 *   status and, for a submitted month, its rate, UOM, freight, freight terms, landed rate and
 *   submitted-on date (blank for a pending month). */
export function exportSubmissionHistoryToExcel({
  rows,
  monthIdxs,
  year,
  monthsLabel,
  recordFor,
  latestFor,
}: {
  rows: ExportRow[];
  monthIdxs: number[];
  year: string;
  monthsLabel: string;
  recordFor: (row: ExportRow, monthValue: string) => SubmissionRecord | undefined;
  latestFor: (row: ExportRow) => { record: SubmissionRecord; monthLabel: string } | undefined;
}): void {
  const summary = rows.map((row) => {
    const latest = latestFor(row);
    const r = latest?.record;
    const line: Record<string, string | number> = {
      'Vendor Code': row.vendorCode,
      'Vendor Name': row.vendorName,
      'Material Code': row.materialCode,
      'Material Description': row.materialDesc,
      'Submitted By': row.email,
      Rate: num(r?.rate),
      'Rate UOM': r?.ratePer ?? '',
      'Freight Value': num(r?.freight),
      'Freight Terms': r?.freightTerms ?? '',
      'Landed Rate': num(r?.totalRate),
      'Rate Month': latest?.monthLabel ?? '',
    };
    for (const i of monthIdxs) line[MONTHS[i].label] = row.monthStatus[i] ? 'Submitted' : 'Pending';
    line.Total = `${monthIdxs.filter((i) => row.monthStatus[i]).length}/${monthIdxs.length}`;
    return line;
  });

  const detail = rows.flatMap((row) =>
    monthIdxs.map((i) => {
      // Only a submitted month carries real values — a pending month's record holds SAP's zero
      // placeholders, which would read as a quoted rate of 0.
      const r = row.monthStatus[i] ? recordFor(row, MONTHS[i].value) : undefined;
      return {
        Year: year,
        Month: MONTHS[i].label,
        'Vendor Code': row.vendorCode,
        'Vendor Name': row.vendorName,
        'Material Code': row.materialCode,
        'Material Description': row.materialDesc,
        'Submitted By': row.email,
        Status: row.monthStatus[i] ? 'Submitted' : 'Pending',
        Rate: num(r?.rate),
        'Rate UOM': r?.ratePer ?? '',
        'Freight Value': num(r?.freight),
        'Freight Terms': r?.freightTerms ?? '',
        'Landed Rate': num(r?.totalRate),
        'Submitted On': r?.submittedOn ?? '',
      };
    })
  );

  const book = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  const detailSheet = XLSX.utils.json_to_sheet(detail);
  // Roughly fit each column to its header/content so the file opens readable.
  for (const [sheet, data] of [[summarySheet, summary], [detailSheet, detail]] as const) {
    const headers = Object.keys(data[0] ?? {});
    sheet['!cols'] = headers.map((h) => ({
      wch: Math.min(40, Math.max(h.length, ...data.map((d) => String((d as Record<string, unknown>)[h] ?? '').length)) + 2),
    }));
  }
  XLSX.utils.book_append_sheet(book, summarySheet, 'Submission History');
  XLSX.utils.book_append_sheet(book, detailSheet, 'Monthly Detail');

  const period = monthsLabel === 'All months' ? 'All' : monthsLabel.replace(/,\s*/g, '-').replace(/\s+/g, '');
  XLSX.writeFile(book, `Market_Rate_Submission_History_${year}_${period}.xlsx`);
}
