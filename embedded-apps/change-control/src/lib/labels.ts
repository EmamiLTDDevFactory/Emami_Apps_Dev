import type { Action, Category, ChangeType, Outcome, Priority, Risk, Role, Status } from './api';

export const STATUS_LABEL: Record<Status, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  cab_review: 'CAB Review',
  approved: 'Approved',
  rejected: 'Rejected',
  implementing: 'Implementing',
  implemented: 'Implemented',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

/** The happy path, in order — drives the progress stepper and the pipeline bars. */
export const FLOW: Status[] = ['draft', 'submitted', 'cab_review', 'approved', 'implementing', 'implemented', 'closed'];

export const TYPE_LABEL: Record<ChangeType, string> = { standard: 'Standard', normal: 'Normal', emergency: 'Emergency' };
export const TYPE_HINT: Record<ChangeType, string> = {
  normal: 'Normal: Change Manager review, then CAB approval',
  standard: 'Standard: pre-approved, low-risk routine change',
  emergency: 'Emergency: urgent fix, CAB Chair approves (ECAB)',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  infrastructure: 'Infrastructure / Servers',
  application: 'Application',
  sap: 'SAP',
  network: 'Network',
  security: 'Security',
  database: 'Database',
  end_user: 'End-user Computing',
};

export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };
export const OUTCOME_LABEL: Record<Outcome, string> = { successful: 'Successful', partial: 'Partially successful', failed: 'Failed', rolled_back: 'Rolled back' };
export const LEVEL_LABEL = ['', 'Low', 'Medium', 'High'];

export const ROLE_LABEL: Record<Role, string> = {
  User: 'Requester',
  'Change Manager': 'Change Manager',
  'CAB Member': 'CAB Member',
  'CAB Chair': 'CAB Chair',
  Admin: 'Admin',
};

export const ACTION_LABEL: Record<Action, string> = {
  submit: 'Submit for review',
  cancel: 'Cancel change',
  return_to_draft: 'Return to requester',
  forward_to_cab: 'Forward to CAB',
  reject: 'Reject',
  emergency_approve: 'Emergency approve (ECAB)',
  approve: 'Approve (CAB decision)',
  start_implementation: 'Start implementation',
  complete: 'Record implementation result',
  close: 'Close after review (PIR)',
};

/** Same 3x3 matrix as backend/changeControl.js — only a preview; the backend decides. */
export function riskFromScore(impact: number, likelihood: number): Risk {
  const s = impact * likelihood;
  return s <= 2 ? 'low' : s <= 4 ? 'medium' : 'high';
}

export const canSeeAudit = (role: Role) => role === 'Change Manager' || role === 'CAB Chair' || role === 'Admin';

const IST = 'Asia/Kolkata';
export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: IST });
}
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST });
}
/** <input type="datetime-local"> value -> ISO, read as IST wherever the browser is. */
export const istToIso = (local: string) => new Date(`${local}:00+05:30`).toISOString();
