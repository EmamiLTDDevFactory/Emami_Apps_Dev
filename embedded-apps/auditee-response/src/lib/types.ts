// Shapes of the hub backend /api/me/auditee (backend/auditeeResponse.js; contract fix/AUDITEE-CONTRACT.md). The demo service returns the same.

export type WorkpaperStatus = 'Send to Auditee' | 'Management Responded' | 'Close' | string;

export interface Observation {
  lineItem: string;
  ownerLineItem: string;
  myRole: 'PERSON_RESPONSIBLE' | 'OWNER';
  title: string;
  observation: string;
  rootCause: string;
  businessImplication: string;
  recommendation: string;
  managementResponse: string;
  financialImpact?: string;
  risk: string;
  residualRisk: string;
  /** ISO date YYYY-MM-DD, '' when none */
  timeline: string;
  categories: string[];
  myResponse: string;
  attachmentsCount: number;
}

export type Track = 'audit' | 'mis';
export const TRACKS: Track[] = ['audit', 'mis'];

export interface Workpaper {
  guid: string;
  track: Track;
  fy: string;
  scheduling: string;
  period: string;
  legalEntity: string;
  location: string;
  city: string;
  process: string;
  subProcess: string;
  status: WorkpaperStatus;
  statusText: string;
  performer: string;
  reviewer: string;
  canRespond: boolean;
  canSubmit: boolean;
  /** every one of my assignee sides has a submitted response in SAP */
  mySubmitted: boolean;
  /** assignees who still have to submit (SAP header MailText); empty once all have submitted */
  waitingFor: string[];
  /** where drafts live: 'browser' (as built: SAP stores only submitted responses) or 'sap' */
  draftStorage: 'browser' | 'sap';
  attachmentsCount?: number;
  observations: Observation[];
}

export interface ResponseInput {
  lineItem: string;
  ownerLineItem: string;
  text: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  annexure: boolean;
  byAuditee: boolean;
  uploadedBy: string;
  mine: boolean;
}

export const STATUS = { toAuditee: 'Send to Auditee', responded: 'Management Responded', closed: 'Close' } as const;
/** Same limit as the backend (MAX_RESPONSE in backend/auditeeResponse.js). */
export const MAX_RESPONSE = 4000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'msg', 'eml', 'zip'];

export const obsKey = (o: { lineItem: string; ownerLineItem: string }) => `${o.lineItem}|${o.ownerLineItem}`;
