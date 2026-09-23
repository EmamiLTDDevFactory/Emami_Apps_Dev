export interface EmployeeOrgDetails {
  employeeId: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  grade: string;
  location: string;
  companyCode: string;
  dateOfJoining: string;
  reportingManager: string;
  costCenter: string;
}

export interface Nominee {
  name: string;
  relationship: string;
  dob: string;
  contactNumber: string;
  sharePercent?: number;
}

/** The fields a form actually collects — everything the server (mock today, SAP tomorrow) adds
 * on create is deliberately excluded here (id/employee/submittedAt/status). */
export interface TermPolicyDraft {
  sumAssured: string;
  nominees: Nominee[];
  isSmoker: boolean;
  hasCriticalIllness: boolean;
  criticalIllnessDetails: string;
  hasExistingTermCover: boolean;
  existingTermCoverAmount: string;
  heightCm: string;
  weightKg: string;
  effectiveDate: string;
}

export interface TermPolicySubmission extends TermPolicyDraft {
  id: string;
  employee: EmployeeOrgDetails;
  submittedAt: string;
  status: 'Submitted';
}
