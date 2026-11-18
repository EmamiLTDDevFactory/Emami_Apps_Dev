import * as XLSX from 'xlsx';
import { MAX_NOMINEES, RELATIONS, relationLabel, type LimitRow, type Nominee, type Policy, type PolicyInput, type RelationCode } from '../types/policy';

const today = () => new Date().toISOString().slice(0, 10);

/** One row per policy with the nominees spread across columns (the Web Dynpro's V_DOWNLOAD listed one row per nominee). */
export function exportPoliciesToExcel(rows: Policy[]): void {
  const data = rows.map((p) => {
    const row: Record<string, string | number> = {
      'Request No': p.reqno, Year: p.year, 'Employee ID': p.empId, Name: p.employeeName, 'Org Unit': p.orgUnit, Designation: p.designation,
      Location: p.locationText, 'Company Mail': p.email, 'Personal Mail': p.personalEmail, Mobile: p.contact, 'Sum Assured': p.sumAssured,
      'Base Premium': p.premium, GST: p.gst, 'Total Premium': p.total, 'Created By': p.createdBy, 'Request Date': p.requestDate,
    };
    for (let i = 0; i < MAX_NOMINEES; i++) {
      const n = p.nominees[i];
      row[`Nominee ${i + 1}`] = n?.name ?? '';
      row[`Nominee ${i + 1} Relation`] = n ? relationLabel(n.relation) : '';
      row[`Nominee ${i + 1} Share %`] = n?.share ?? '';
    }
    return row;
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Term Policy');
  XLSX.writeFile(book, `TermPolicy_${today()}.xlsx`);
}

export function downloadLimitTemplate(): void {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ 'Employee ID': '90000618', Limit: '50 LAKHS' }]), 'Limits');
  XLSX.writeFile(book, 'TermPolicy_Limit_Template.xlsx');
}

export function downloadMassTemplate(): void {
  const sample: Record<string, string> = { 'Employee ID': '90000618', 'Sum Assured': '50 LAKHS', Mobile: '9830012345', 'Personal Mail': '' };
  for (let i = 1; i <= MAX_NOMINEES; i++) {
    sample[`Nominee ${i}`] = i === 1 ? 'Sunita Das' : '';
    sample[`Nominee ${i} Relation`] = i === 1 ? 'Spouse' : '';
    sample[`Nominee ${i} Share %`] = i === 1 ? '100' : '';
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([sample]), 'Policies');
  const help = RELATIONS.map((r) => ({ Relation: r.label }));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(help), 'Allowed relations');
  XLSX.writeFile(book, 'TermPolicy_Mass_Upload_Template.xlsx');
}

async function firstSheetRows(file: File): Promise<Record<string, unknown>[]> {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
}
const txt = (v: unknown) => String(v ?? '').trim();

export async function parseLimitFile(file: File): Promise<LimitRow[]> {
  const rows = await firstSheetRows(file);
  return rows
    .map((r) => ({ empId: txt(r['Employee ID']), limit: txt(r['Limit']).toUpperCase() }))
    .filter((r) => r.empId || r.limit);
}

export async function parseMassFile(file: File): Promise<{ row: number; input: PolicyInput }[]> {
  const rows = await firstSheetRows(file);
  return rows.map((r, i) => {
    const nominees: Nominee[] = [];
    for (let n = 1; n <= MAX_NOMINEES; n++) {
      const name = txt(r[`Nominee ${n}`]);
      const rel = txt(r[`Nominee ${n} Relation`]).toLowerCase();
      const share = txt(r[`Nominee ${n} Share %`]);
      if (!name && !share) continue;
      const code = RELATIONS.find((x) => x.label.toLowerCase() === rel || x.code === rel)?.code ?? ('' as RelationCode | '');
      nominees.push({ name, relation: code, share });
    }
    return {
      row: i + 2, // header is row 1
      input: { empId: txt(r['Employee ID']), sumAssured: txt(r['Sum Assured']).toUpperCase(), contact: txt(r['Mobile']), personalEmail: txt(r['Personal Mail']), nominees },
    };
  });
}
