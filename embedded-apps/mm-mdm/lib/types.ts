/** App IDs of the request: MC create, MX change, ME extension */
export type AppId = 'MC' | 'MX' | 'ME';

/**
 * Request status, as SAP stores it in the request header (backend STATUS_TEXT):
 * 00 saved as draft, 01 requested, 02 in progress, 03 completed, 04 sent back, 05 rejected.
 */
export type StatusCode = '00' | '01' | '02' | '03' | '04' | '05';

/** View (tab) id, see VIEWS in lib/materialViews.ts */
export type ViewId = string;

export type Severity = 'E' | 'W' | 'I';

/** The signed-in hub user as SAP knows them (GET /session). There is no user switching. */
export interface User {
  id: string;
  name: string;
  department: string;
  roles: string[];
}

/**
 * Key data plus all view fields of the material, flat: the app's field key -> string. Table fields hold a JSON array of rows.
 * lib/mmMap.ts converts it from and to the backend model (data.single / data.multi).
 */
export interface MaterialData {
  materialNumber: string;
  // key data
  materialType: string;
  industrySector: string;
  materialGroup: string;
  businessVertical: string;
  scheme: string;
  /** 18 characters: Banner 2 + Brand 4 + Product 4 + SKU 3 + Variant 3 + Scheme 2 */
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
  [field: string]: string;
}

export type FieldKey = string;

/** A message about a field or the request: SAP's text, the tab and field it is about when known, severity */
export interface Message {
  severity: Severity;
  text: string;
  view?: ViewId;
  field?: FieldKey;
}

export type MessageType = 'success' | 'error' | 'warning' | 'info';
export interface StatusMessage {
  type: MessageType;
  text: string;
  at: number;
}
