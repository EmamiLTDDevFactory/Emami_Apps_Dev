import * as XLSX from 'xlsx';
import { fmtDate } from './format';
import { genderLabel, relLabel } from './rules';
import { sanitizeRow } from './spreadsheetSafe';
import type { PolicyReportRow } from './types';

/**
 * HR download columns (SPEC 5.4: ALV V_DOWNLOAD list + the Year column of the contract). Amounts stay numbers; every text
 * cell goes through the formula-injection guard (names / mail ids are typed by employees).
 */
export function reportToSheetRows(rows: PolicyReportRow[]): Record<string, string | number>[] {
  return rows.map((r, i) =>
    sanitizeRow({
      'Sl No': i + 1,
      Year: r.Year,
      Company: r.CompText,
      Location: r.LocText,
      Department: r.OuText,
      'Employee ID': r.EmpId,
      Designation: r.DesignText,
      'CTC above 5L': r.CtcAbove5L ? 'YES' : 'NO',
      'Request No': r.ReqNo,
      'Family No': r.FamilyNo || r.SlNo,
      Name: r.Name,
      DOB: fmtDate(r.Dob),
      'Age in yrs': r.AgeInYrs,
      Gender: genderLabel(r.Gender),
      'Relation with Primary employee': relLabel(r.Relation, r.Gender),
      'E-mail': r.CorpEmail,
      'Personal E-mail': r.PersonalEmail,
      'Mobile No.': r.Contact,
      'Top-Up': r.TopUpYesNo ? 'Yes' : 'No',
      'Sum Insured': r.SumBase,
      'Premium on sum insured': r.PreBase,
      'Top up Sum': r.TopUpPolicy,
      'Individual Premium': r.PreAmt,
      'Top up Premium': r.TopUpPre,
      'Total Premium': r.TotalPre,
      'Employee Share': r.EmpShare,
      'Employer Share': r.EmployerShare,
      'Created On': fmtDate(r.CrtDate),
      New: r.NewInd ? 'New' : '',
    })
  );
}

/** Medical Insurance_<year>.xlsx (the WD sent Medical Insurance_<year>.xls). */
export function exportPolicyReportToExcel(rows: PolicyReportRow[], year: string): void {
  const sheet = XLSX.utils.json_to_sheet(reportToSheetRows(rows));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Medical Insurance');
  XLSX.writeFile(book, `Medical Insurance_${year}.xlsx`);
}
