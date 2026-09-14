// Types for the Service-PO bulk-upload feature (ZSrvPOUploadSet) — a single deep-entity POST
// whose response carries the full per-row result; there is no separate GET for this entity.

/** d.Status — 'S' every row posted, 'P' partial (some posted, some failed), 'E' nothing posted
 * (parse failure, or every row rejected — ToUploadItems.results is empty in that case). */
export type PoUploadStatus = 'S' | 'P' | 'E';

/** Per-row Type — 'S' posted, 'E' failed. */
export type PoUploadRowType = 'S' | 'E';

/** One row of ToUploadItems.results. Menge/GrPrice arrive as STRINGS (parseFloat before any
 * arithmetic or formatting); Ebeln/Ebelp are empty strings on a failed row. */
export interface PoUploadResultRow {
  rowno: number; // Rowno — Excel row number, header counted as row 1, so the first data row is 2
  lifnr: string; // Lifnr — vendor code, zero-padded
  bukrs: string; // Bukrs — company code
  poId: number; // PoId — this row's group id within the upload, not a PO number
  txz01: string; // Txz01 — line text
  menge: string; // Menge — quantity, STRING
  grPrice: string; // GrPrice — price, STRING
  werks: string; // Werks — plant
  sakto: string; // Sakto — GL account, zero-padded
  kostl: string; // Kostl — cost center, zero-padded
  ebeln: string; // Ebeln — PO number, empty when the row failed
  ebelp: string; // Ebelp — PO item, e.g. "00010", empty when the row failed
  type: PoUploadRowType;
  message: string; // SAP message, verbatim — show unmodified, do not truncate
}

export interface PoUploadResult {
  guid: string;
  status: PoUploadStatus;
  message: string;
  totalRows: number;
  successCnt: number;
  errorCnt: number;
  rows: PoUploadResultRow[]; // empty when Status === 'E' from a parse failure
}
