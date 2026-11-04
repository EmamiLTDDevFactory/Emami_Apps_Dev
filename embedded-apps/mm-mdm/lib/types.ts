/** App IDs of the old app: MC create (built now), MX change and ME extension (phase 2) */
export type AppId = 'MC' | 'MX' | 'ME';

/**
 * Request status, as stored in the request header (M_TRANS / CM_META).
 * 00 draft, 01 in approval, 02 sent back, 03 rejected, 04 forwarded, 05 approved and posted.
 * The code-to-meaning mapping is to be confirmed against the header table (README, open items).
 */
export type StatusCode = '00' | '01' | '02' | '03' | '04' | '05';

/** View (tab) id, see VIEWS in lib/fieldConfig.ts */
export type ViewId = string;

export type Severity = 'E' | 'W' | 'I';

export interface User {
  id: string;
  name: string;
  department: string;
  /** null = initiator; 1..7 = workflow level agent (WF_ROLE / USR_DEP) */
  level: number | null;
}

/** Key data (V_INIT) plus all view fields of the material */
export interface MaterialData {
  materialNumber: string;
  // key data (Material Creation: Key data)
  materialType: string;
  industrySector: string;
  materialGroup: string;
  businessVertical: string;
  scheme: string;
  /** 18 characters: Banner + Brand + Product + SKU + Variant + Scheme, 3 digits each */
  prodHierarchy: string;
  division: string;
  description: string;
  longText: string;
  // organizational data
  plant: string;
  storageLocation: string;
  salesOrg: string;
  distChannel: string;
  warehouseNo: string;
  storageType: string;
  /**
   * All view fields (Basic data, Sales, MRP, Accounting, ...). They are defined in
   * lib/fieldConfig.ts and stored by key; table fields hold a JSON array.
   */
  [field: string]: string;
}

export type FieldKey = string;

export interface MaterialRecord extends MaterialData {
  createdOn: string;
  createdBy: string;
  transId: string;
}

/** Same shape as the SAP message: text, target view and field, severity */
export interface Message {
  severity: Severity;
  text: string;
  view?: ViewId;
  field?: FieldKey;
}

export interface HistoryEntry {
  at: string;
  by: string;
  department: string;
  level: number | null;
  action: string;
  status: StatusCode;
  comment?: string;
}

export interface ForwardInfo {
  to: string; // user id of the person asked for input
  by: string; // user id of the reviewer who forwarded
  level: number;
}

export interface MdmRequest {
  transId: string;
  appId: AppId;
  status: StatusCode;
  /** 0 = with the initiator; 1..7 = current workflow level */
  level: number;
  sentBackFrom?: number;
  forward?: ForwardInfo;
  materialNumber: string;
  data: MaterialData;
  views: ViewId[];
  initiator: string; // user id
  createdOn: string;
  changedOn: string;
  history: HistoryEntry[];
}

export type ActionId =
  | 'SAVE_DRAFT'
  | 'SUBMIT'
  | 'DELETE_DRAFT'
  | 'SAVE'
  | 'APPROVE'
  | 'SEND_BACK'
  | 'REJECT'
  | 'FORWARD'
  | 'RETURN';

export type MessageType = 'success' | 'error' | 'warning' | 'info';
export interface StatusMessage {
  type: MessageType;
  text: string;
  at: number;
}
