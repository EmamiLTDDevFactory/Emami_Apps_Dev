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

export type MediclaimPolicyType = 'Self Only' | 'Self + Family';
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

/** The fields a form actually collects — everything the server (mock today, SAP tomorrow) adds
 * on create is deliberately excluded here (id/employee/submittedAt/status). */
export interface MediclaimDraft {
  policyType: MediclaimPolicyType;
  sumInsured: string;
  effectiveDate: string;
  dependents: Dependent[];
  nominee: Nominee;
  hasPreExistingDisease: boolean;
  preExistingDiseaseDetails: string;
  existingPolicyNumber: string;
}

export interface MediclaimSubmission extends MediclaimDraft {
  id: string;
  employee: EmployeeOrgDetails;
  submittedAt: string;
  status: 'Submitted';
}
