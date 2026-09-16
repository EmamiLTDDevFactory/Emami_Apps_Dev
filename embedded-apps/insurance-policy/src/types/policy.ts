/** Read-only employee organization details shown at the top of every form — see
 * src/lib/orgService.ts for where this comes from (mock today, SAP EmployeeOrgSet later). */
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

export type DependentRelationship = 'Spouse' | 'Child' | 'Parent' | 'Parent-in-law';
export type Gender = 'Male' | 'Female' | 'Other';

export interface Dependent {
  name: string;
  relationship: DependentRelationship;
  dob: string;
  gender: Gender;
}

export interface Nominee {
  name: string;
  relationship: string;
  dob: string;
  contactNumber: string;
  sharePercent?: number;
}

export type MediclaimPolicyType = 'Self Only' | 'Self + Family';

export interface MediclaimSubmission {
  id: string;
  employee: EmployeeOrgDetails;
  policyType: MediclaimPolicyType;
  sumInsured: string;
  effectiveDate: string;
  dependents: Dependent[];
  nominee: Nominee;
  hasPreExistingDisease: boolean;
  preExistingDiseaseDetails: string;
  existingPolicyNumber: string;
  submittedAt: string;
  status: 'Submitted';
}

export interface TermPolicySubmission {
  id: string;
  employee: EmployeeOrgDetails;
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
  submittedAt: string;
  status: 'Submitted';
}

export type MediclaimDraft = Omit<MediclaimSubmission, 'id' | 'employee' | 'submittedAt' | 'status'>;
export type TermPolicyDraft = Omit<TermPolicySubmission, 'id' | 'employee' | 'submittedAt' | 'status'>;
