import * as XLSX from 'xlsx';
import type { MediclaimSubmission, TermPolicySubmission } from '../types/policy';

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportMediclaimSubmissionsToExcel(rows: MediclaimSubmission[]): void {
  const data = rows.map((r) => ({
    'Employee ID': r.employee.employeeId,
    Name: r.employee.name,
    Designation: r.employee.designation,
    Department: r.employee.department,
    Location: r.employee.location,
    'Company Code': r.employee.companyCode,
    'Policy Type': r.policyType,
    'Sum Insured': r.sumInsured,
    'Effective Date': r.effectiveDate,
    Dependents: r.dependents.map((d) => `${d.name} (${d.relationship})`).join('; '),
    'Nominee Name': r.nominee.name,
    'Nominee Relationship': r.nominee.relationship,
    'Pre-existing Disease': r.hasPreExistingDisease ? 'Yes' : 'No',
    'Pre-existing Disease Details': r.preExistingDiseaseDetails,
    'Existing Policy Number': r.existingPolicyNumber,
    'Submitted On': new Date(r.submittedAt).toLocaleString(),
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Mediclaim Submissions');
  XLSX.writeFile(book, `Mediclaim_Submissions_${todayStamp()}.xlsx`);
}

export function exportTermPolicySubmissionsToExcel(rows: TermPolicySubmission[]): void {
  const data = rows.map((r) => ({
    'Employee ID': r.employee.employeeId,
    Name: r.employee.name,
    Designation: r.employee.designation,
    Department: r.employee.department,
    Location: r.employee.location,
    'Company Code': r.employee.companyCode,
    'Sum Assured': r.sumAssured,
    'Effective Date': r.effectiveDate,
    Nominees: r.nominees.map((n) => `${n.name} (${n.relationship}, ${n.sharePercent ?? ''}%)`).join('; '),
    Smoker: r.isSmoker ? 'Yes' : 'No',
    'Critical Illness': r.hasCriticalIllness ? 'Yes' : 'No',
    'Critical Illness Details': r.criticalIllnessDetails,
    'Existing Term Cover': r.hasExistingTermCover ? `Yes (${r.existingTermCoverAmount})` : 'No',
    'Height (cm)': r.heightCm,
    'Weight (kg)': r.weightKg,
    'Submitted On': new Date(r.submittedAt).toLocaleString(),
  }));
  const sheet = XLSX.utils.json_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Term Policy Submissions');
  XLSX.writeFile(book, `TermPolicy_Submissions_${todayStamp()}.xlsx`);
}
