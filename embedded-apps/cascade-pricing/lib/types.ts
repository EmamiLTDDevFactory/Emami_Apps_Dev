// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type CascadeSet = 'CascadeMapSet' | 'ApprovalSet' | 'ConditionPendingSet';

export type ActionName =
  | 'SEND_APPROVAL'
  | 'APPROVE'
  | 'APPROVE_SIM'
  | 'REJECT'
  | 'DELETE'
  | 'CREATE_COND'
  | 'RUN_SIM'
  | 'ENRICH_RATES'
  | 'SAVE_RATES'
  | 'COMPARE';

export interface SimParams {
  BUKRS: string;
  KALSM: string;
  PDATE: string;
}

export interface ActionPayload {
  ROWS?: Row[];
  RATE_ROWS?: Row[];
  PARAMS?: SimParams;
}

export interface ActionRequest {
  action: ActionName;
  vfrom?: string;
  vto?: string;
  payload?: ActionPayload;
}

/** The action result: SAP's PROCESSED / FAILED / MESSAGE / DATA in lower case; data is a JSON string or ''. */
export interface ActionResult {
  processed: number;
  failed: number;
  message: string;
  data: string;
}

/** A row CREATE_COND or SAVE_RATES could not process (in data). */
export interface FailureItem {
  VKORG: string;
  KUNNR: string;
  MATNR: string;
  KSCHL: string;
  MESSAGE: string;
}

/** Rate rows (upload / ENRICH_RATES) and simulation rows carry a client-side __id: selection and React keys only. */
export type RateRow = Row & { __id?: string };
export type SimRow = Row & { __id?: string; ZPRICE_IN: number | string };

export interface Column {
  key: string;
  label: string;
  editable?: boolean;
}

const CASCADE_KEY = ['S_LAND1', 'D_LAND1', 'VKORG', 'KUNNR', 'MATNR', 'VALIDFROM', 'VALIDTO', 'ZVERSION'] as const;

/** Row identity: __id when the row has one (rate / simulation rows), MATNR for materials, the cascade key otherwise. */
export function rowKey(row: Row, kind?: 'material'): string {
  if (typeof row.__id === 'string' && row.__id) return row.__id;
  if (kind === 'material') return String(row.MATNR ?? '');
  return CASCADE_KEY.map((k) => String(row[k] ?? '')).join('|');
}

let seq = 0;
/** A client-side row id (never sent to SAP). */
export function makeRowId(): string {
  seq += 1;
  return `r${Date.now().toString(36)}${seq.toString(36)}`;
}

/** The same price point across versions and validity: groups a version history. */
export function priceKey(row: Row): string {
  return ['S_LAND1', 'D_LAND1', 'VKORG', 'KUNNR', 'MATNR'].map((k) => String(row[k] ?? '')).join('|');
}

export type Tone = 'info' | 'error' | 'success';
export interface StatusMessage {
  id: number;
  at: string;
  text: string;
  tone: Tone;
}
