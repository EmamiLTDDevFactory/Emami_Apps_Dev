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
  | 'SAVE_RATES'
  | 'COMPARE';

export interface SimParams {
  BUKRS: string;
  KALSM: string;
  PDATE: string;
}

export interface ActionRequest {
  action: ActionName;
  vfrom?: string;
  vto?: string;
  payload?: { ROWS: Row[]; PARAMS?: SimParams };
}

export interface ActionResult {
  processed: number;
  failed: number;
  message: string;
  data: string;
}

export interface Column {
  key: string;
  label: string;
}

/** Actions that carry the top bar's Valid From / Valid To. */
export const DATED_ACTIONS: ReadonlySet<ActionName> = new Set<ActionName>(['SEND_APPROVAL', 'APPROVE', 'APPROVE_SIM']);

const CASCADE_KEY = ['S_LAND1', 'D_LAND1', 'VKORG', 'KUNNR', 'MATNR', 'VALIDFROM', 'VALIDTO', 'ZVERSION'] as const;

/** Row identity: MATNR for the material map, the composite cascade key everywhere else. */
export function rowKey(row: Row, set?: CascadeSet | 'RateRows' | 'SimRows'): string {
  if (set === 'CascadeMapSet') return String(row.MATNR ?? '');
  if (set === 'RateRows') return [row.LLAND, row.MATNR, row.VFROM, row.VTO].map((v) => String(v ?? '')).join('|');
  if (set === 'SimRows' && row.ZVERSION === undefined) return [row.VKORG, row.WERKS, row.KUNNR, row.MATNR, row.CHARG].map((v) => String(v ?? '')).join('|');
  return CASCADE_KEY.map((k) => String(row[k] ?? '')).join('|');
}

/** The same price point across versions and validity: used to group version history. */
export function priceKey(row: Row): string {
  return ['S_LAND1', 'D_LAND1', 'VKORG', 'KUNNR', 'MATNR'].map((k) => String(row[k] ?? '')).join('|');
}

export type StatusTone = 'info' | 'error' | 'success';
export interface Status {
  busy: boolean;
  message: string;
  tone: StatusTone;
}
