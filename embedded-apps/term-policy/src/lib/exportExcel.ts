import * as XLSX from 'xlsx';
import type { TermPolicySubmission } from '../types/policy';

export function exportTermPolicySubmissionsToExcel(rows: TermPolicySubmission[]): void {
  const data = rows.map((r) => ({
    'Employee ID': r.employee.employeeId,
    Name: r.employee.name,
    Department: r.employee.department,
    Location: r.employee.location,
    'Sum Assured': r.sumAssured,
    Nominees: r.nominees.map((n) => `${n.name} (${n.relationship}, ${n.sharePercent ?? 0}%)`).join('; '),
    Smoker: r.isSmoker ? 'Yes' : 'No',
    'Critical Illness': r.hasCriticalIllness ? `Yes - ${r.criticalIllnessDetails}` : 'No',
    'Existing Term Cover': r.hasExistingTermCover ? r.existingTermCoverAmount : 'No',
    'Height (cm)': r.heightCm,
    'Weight (kg)': r.weightKg,
    'Submitted On': new Date(r.submittedAt).toLocaleDateString(),
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Term Policy Submissions');
  XLSX.writeFile(book, `TermPolicy_Submissions_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
