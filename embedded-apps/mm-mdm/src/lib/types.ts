// Domain types shared by the browser and the server layer.
// Field names are the ABAP names (MATNR, WERKS ...) so they match the form definition and the staging tables.

export type StatusCode = '00' | '01' | '02' | '03' | '04' | '05';

export const STATUS_TEXT: Record<StatusCode, string> = {
  '00': 'Saved as draft',
  '01': 'Requested',
  '02': 'In progress',
  '03': 'Completed',
  '04': 'Sent back',
  '05': 'Rejected'
};

export type Severity = 'E' | 'W' | 'I' | 'S';

export interface Message {
  code: string; // rule ID or SAP message ID, for example E027
  message: string;
  severity: Severity;
  /** Property path, for example Material/NTGEW or Plant/DISMM. Empty for general messages. */
  target?: string;
}

export interface RequestHeader {
  transId: string;
  appId: string; // MC, MX, ME ...
  objValue: string; // material number once known
  status: StatusCode;
  statusText: string;
  initiator: string;
  startDate?: string;
  endDate?: string;
  workItemId?: string;
  isDuplicate: boolean;
  // routing keys: read only, set by the server
  genType: string;
  genField: string;
  genField2: string;
  genField3: string;
  // convenience values for lists
  materialType?: string;
  description?: string;
}

export type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;

export interface RequestData {
  /** Entities with one row per request: Material, Plant, SalesOrg, Valuation ... key: entity name */
  single: Record<string, Row>;
  /** Entities with several rows: UnitOfMeasure, InspectionType ... */
  multi: Record<string, Row[]>;
  /** Selected views (tabs), the flags of /INOWITS/M_VWSEL */
  views: string[];
}

export interface HistoryItem {
  serialNo: number;
  level: string; // L1, L2 ...
  typeLevel: 'R' | 'A' | 'I'; // reviewer, approver, initiator
  role: string;
  user: string;
  status: 'I' | 'F' | 'C' | 'S' | 'R'; // initiated, forwarded, completed, sent back, rejected
  date: string;
  comment?: string;
}

export const ITEM_STATUS_TEXT: Record<HistoryItem['status'], string> = {
  I: 'Initiated',
  F: 'Forwarded',
  C: 'Completed',
  S: 'Sent back',
  R: 'Rejected'
};

export interface AllowedActions {
  edit: boolean;
  validate: boolean;
  saveDraft: boolean;
  submit: boolean;
  approve: boolean;
  sendBack: boolean;
  reject: boolean;
  forward: boolean;
  deleteDraft: boolean;
  /** may add and delete attachments (SAP's answer for this request and user, never inferred from the status) */
  attach: boolean;
  /** may add comments */
  comment: boolean;
}

export interface RequestView {
  header: RequestHeader;
  data: RequestData;
  history: HistoryItem[];
  allowed: AllowedActions;
  /** Current workflow level for field control: L0 initiator, L1, L2 ... */
  level: string;
}

export interface SessionInfo {
  user: string;
  displayName: string;
  department: string;
  roles: Array<'initiator' | 'reviewer' | 'approver'>;
  mode: 'mock' | 'live';
}

export interface FieldFlags {
  shown: boolean;
  displayOnly: boolean;
  required: boolean;
  column: '' | 'L' | 'R';
  source: 'view' | 'general' | 'none';
}

/** Result of GetFieldControl: per view the ordered fields with their flags */
export type FieldControl = Record<string, Array<{ field: string } & FieldFlags>>;

export interface StartInput {
  materialType: string;
  industrySector: string;
  description: string;
  mainGroup?: string;
  subGroup?: string;
  subSubGroup?: string;
  manufacturerPart?: string;
  plant?: string;
  storageLocation?: string;
  salesOrg?: string;
  distributionChannel?: string;
  views: string[];
  draft: boolean;
}

export interface DuplicateHit {
  matnr: string;
  description: string;
  materialType: string;
  score: number;
}

export interface ValueHelpItem {
  key: string;
  text: string;
}

export interface ListQuery {
  scope?: 'mine' | 'inbox' | 'all';
  status?: string;
  materialType?: string;
  text?: string;
}

/** An attachment of a request. The uploader, the time and the level are set by SAP. */
export interface AttachmentItem {
  attachId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  level: string;
}

/** A comment of the request's comment thread (not the comment of a workflow step: that is HistoryItem.comment). */
export interface CommentItem {
  commentId: string;
  text: string;
  user: string;
  createdAt: string;
  level: string;
}

/** File content in transport: base64 in the demo service (the live backend streams bytes). */
export interface FilePayload {
  fileName: string;
  mimeType: string;
  base64: string;
}
