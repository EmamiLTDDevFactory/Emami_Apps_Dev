export type UserRole = 'employee' | 'manager' | 'finance' | 'B';

export type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Pending Release' | 'Pending at finance' | 'Paid';

export interface Attachment {
  id: string;
  name: string;
  uri: string;
  size?: number;
  type?: string;
}

export interface WorkflowEvent {
  step: string;
  actor: string;
  timestamp: string;
  outcome: string;
  remarks?: string;
}

export interface ExpenseClaim {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  claimDate: string;
  createdOn?: string;
  createdTime?: string;
  expenseDate?: string;
  expenseType: string;
  itemNo?: string;
  amount: number;
  costCenter: string;
  justification: string;
  attachments: Attachment[];
  managerApprovedAttachments?: Attachment[];
  lifnr?: string;
  name1?: string;
  stcd3?: string;
  bezei?: string;
  expenseAmt?: number;
  taxAmaount?: number;
  status: ClaimStatus;
  workflowHistory: WorkflowEvent[];
  currentApprover?: string;
  rawStatus?: string;
  // FI document number/fiscal year, returned once a claim is actually posted (rawStatus 'S').
  belnr?: string;
  gjahr?: string;
}

export interface SAPError {
  id: string;
  claimId: string;
  errorType: string;
  errorMessage: string;
  rootCause: string;
  status: 'Failed' | 'Resolved';
  resolutionHistory: {
    timestamp: string;
    resolvedBy: string;
    notes: string;
  }[];
}

export interface ClaimKPIs {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  paid: number;
  last3MonthsTotal: number;
}

export interface EmployeeProfile {
  employeeId: string;
  employeeName: string;
  name?: string;
  department: string;
  designation: string;
  role: UserRole;
  // Additive admin capability (SAP variable ZEXP_ADMIN), independent of role - see
  // lib/adminAccess.ts for how this is resolved.
  isAdmin?: boolean;
}

export interface TaxCode {
  Mwskz: string;
  Text1?: string;
  [key: string]: any;
}

export interface AreaCode {
  Bland: string;
  Bezei?: string;
  [key: string]: any;
}

// One row = one approver in one amount slab of one cost centre's DOA (Delegation of Authority)
// chain. Composite key: DoaCtype + Kostl + Expgrp + AmtFrom + Seqno.
export interface DoaChainRow {
  DoaCtype: string; // 'ADM' = Other Administrative Expenses (MBN/MBS mobile types reserved, unused yet)
  Kostl: string; // cost centre, upper-case, e.g. 'CORP16'
  Expgrp: string; // expense group - always '' for now, only empty-group rows are used
  AmtFrom: number; // slab start
  Seqno: string; // order within a slab for parallel approvers: '01', '02', ...
  AmtTo: number; // slab end; empty/0 = no cap
  DeptTxt: string; // department name, for display
  ApprEmail: string; // approver email - backend resolves PERNR + name from this
  ApprPernr?: string; // backend-filled, read-only in practice
  ApprName?: string; // backend-filled, read-only in practice
  ApprRule: 'O' | 'A'; // O = any one approver closes the level, A = all must approve
  Active: boolean;
  ValidFrom: string;
  ValidTo: string;
  Aenam?: string; // logged-in admin's PERNR - UI must send this on every POST/PUT
}
