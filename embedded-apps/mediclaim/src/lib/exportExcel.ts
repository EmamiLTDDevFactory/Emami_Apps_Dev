import * as XLSX from 'xlsx';
import type { MediclaimSubmission } from '../types/policy';

export function exportMediclaimSubmissionsToExcel(rows: MediclaimSubmission[]): void {
  const data = rows.map((r) => ({
    'Employee ID': r.employee.employeeId,
    Name: r.employee.name,
    Department: r.employee.department,
    Location: r.employee.location,
    'Policy Type': r.policyType,
    'Sum Insured': r.sumInsured,
    Dependents: r.dependents.map((d) => `${d.name} (${d.relationship})`).join('; '),
    'Nominee Name': r.nominee.name,
    'Nominee Relationship': r.nominee.relationship,
    'Pre-existing Disease': r.hasPreExistingDisease ? `Yes - ${r.preExistingDiseaseDetails}` : 'No',
    'Existing Policy Number': r.existingPolicyNumber,
    'Submitted On': new Date(r.submittedAt).toLocaleDateString(),
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Mediclaim Submissions');
  XLSX.writeFile(book, `Mediclaim_Submissions_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
