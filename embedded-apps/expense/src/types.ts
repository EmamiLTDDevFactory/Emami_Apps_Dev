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

// Non-CTC: Mobile Exp - one month's claim line, submitted as its own CLAIMNAV row with its own
// amount (unlike every other expense type, where only row 0 carries a non-zero Amount).
export interface MobileMonthItem {
  expenseDate: string; // YYYY-MM-DD, first day of the card's month - backend derives the month from this
  amount: number;
  receiptNo?: string; // OCR-read invoice/bill number
  attachment: Attachment;
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
  // Independent capability flags from SAP's LoginSet (IsManager/IsFinance, live 2026-11-25) -
  // tabs/lists/actions gate on these directly now, not on `role`, so one person can hold any
  // combination (e.g. manager AND finance). `role` is kept only as a display/profile label.
  isManager?: boolean;
  isFinance?: boolean;
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
  DoaCtype: string; // 'ADM' = Other Administrative Expenses, 'MBN' = Mobile non-sales (MBS no longer used)
  Kostl: string; // cost centre, upper-case, e.g. 'CORP16'
  Expgrp: string; // expense group - no longer used in the DOA matrix; always sent blank
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
  // HoD flag - only allowed for DoaCtype='MBN' rows. When set, this approver is offered as a
  // choosable HoD for non-sales mobile claims above the employee's eligibility cap.
  Hod?: boolean;
  Aenam?: string; // logged-in admin's PERNR - UI must send this on every POST/PUT
  // Audit fields - all backend-filled, read-only. Do not send Ernam/Erdat/Erzet/Aedat/Aezet.
  Ernam?: string;
  Erdat?: string;
  Erzet?: string;
  Aedat?: string;
  Aezet?: string;
}

// Mobile Expense cap maintenance (MobCapSet, live on dev 2026-11-24) - replaces the earlier
// MobBusSet idea; the sales channel now comes from the employee's cost centre, not an HR mapping.
export interface MobCapRow {
  Mcat: string; // category: 'NS' (non-sales) | 'SC' | 'SH' | 'SM' | 'SE' | 'SG' (sales channels)
  Kostl: string; // cost centre - must be blank for NS, mandatory for every sales category
  Trfgr: string; // grade: E1, E2 (executive), M1..M5 (managerial)
  Trfst: string; // level: 'A', 'B', or blank = any level
  MaxAmt: number; // cap amount; ignored/cleared when NoCap is set
  NoCap: boolean; // "on actuals" - no cap enforced, claim always goes on the actual amount
  Active: boolean;
  ValidFrom: string;
  ValidTo: string;
  Remark: string;
  Aenam?: string; // logged-in admin's PERNR - UI must send this on every POST/PUT
  // Audit fields - all backend-filled, read-only. Do not send Ernam/Erdat/Erzet/Aedat/Aezet.
  Ernam?: string;
  Erdat?: string;
  Erzet?: string;
  Aedat?: string;
  Aezet?: string;
}

// Admin configuration maintenance (ConfigVarSet/ConfigLogSet, live on dev 2026-11-24) - replaces
// the former STVARV variables. Each variable is a list of lines (Numb = line number, backend-
// assigned on create); High is only meaningful for ZEXP_FINANCE ('POST' | 'PARK').
export type ConfigVarName =
  | 'ZEXP_ADMIN'
  | 'ZEXP_DOA_ADMIN'
  | 'ZEXP_FINANCE'
  | 'ZEXP_EXPTYPE_SET'
  | 'ZEXP_MOBILE_SET'
  | 'ZEXP_NON_CTC_GO_LIVE'
  | 'ZFI_EXPENCE_CLAIM';

export interface ConfigVarRow {
  Name: string; // one of ConfigVarName
  Numb: string; // line number - backend-assigned; '0000' for the two single-line variables
  VarType?: string;
  Sign?: string;
  Opti?: string;
  Low: string; // PERNR / GL set name / date YYYYMMDD / absolute path, depending on Name
  High?: string; // 'POST' | 'PARK' - ZEXP_FINANCE only
  LowText?: string; // backend-resolved display text (employee name / set text)
  Aenam?: string; // logged-in admin's PERNR - must be sent on every POST/PUT
  Remove?: boolean; // PUT-only - true removes the line; there is no DELETE
}

export interface ConfigLogRow {
  LogDate: string;
  LogTime: string;
  Seqno: string;
  Varname: string;
  Numb: string;
  Action: string; // ADD | CHANGE | REMOVE
  OldLow?: string;
  OldHigh?: string;
  NewLow?: string;
  NewHigh?: string;
  ChangedBy?: string;
  ChangedName?: string;
  Remark?: string;
  Aenam?: string;
}
