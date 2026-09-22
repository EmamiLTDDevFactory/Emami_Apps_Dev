// Field names below are taken directly from the source Fiori app's (fm_po_deviation)
// controllers/views — that app's own local metadata.xml was a placeholder that never carried the
// real schema (the live SAP service's own $metadata endpoint refuses system query options as of
// 2026-09-12), so there is no ground-truth EDMX to check these against. Confirmed a subset live
// against the real gateway (https://emdcindpwebapp1-.../api/NGD/ZFMPODEVIATION_SRV): PoSet and
// UserSet respond correctly. The printform PDF is read from POPrintFormSet's keyed GetEntity (see
// src/lib/sapClient.ts's fetchPrintformPdf), per instruction. `Email` on Po is now confirmed live
// (per instruction, 2026-09-14), so this app scopes "my approvals" the same way every other
// SAP-integrated app in this repo does (see src/lib/sapClient.ts) — every Po row read here sends
// that filter for real, mock mode has been removed entirely.

/** Status on a Po row — 'A' approved, 'R' rejected, 'L' a history-log entry (not a real PO row),
 * blank/other = pending. */
export type PoStatus = 'A' | 'R' | 'L' | '';

/** Write-only field sent on submit (Action) — mirrors Status 1:1 except 'U' (unrelease), which has
 * no corresponding Status value of its own in the source app. */
export type PoAction = 'A' | 'R' | 'U';

/** One row from PoSet — Ebelp === '00000' is the PO header row; every other Ebelp is a real line
 * item. A single PO's full read returns both shapes mixed together (see fetchPoByNumber). */
export interface PoRow {
  ebeln: string; // Ebeln — PO number (key)
  ebelp: string; // Ebelp — PO item number, '00000' = header
  lifnr: string; // Lifnr — vendor code
  name1: string; // Name1 — vendor name
  stxt: string; // Stxt — line/short text
  netwr: string; // Netwr — net amount
  waers: string; // Waers — currency
  status: PoStatus; // Status
  zpoInd: string; // ZpoInd — release indicator: 'R' released, else unreleased
  erdat: string; // Erdat — created date, ISO 'YYYY-MM-DD' once parsed
  uzeit: string; // Uzeit — created time, 'HH:mm:ss' once parsed
  addInfo: string; // AddInfo — free-text: rejection reason on write, log actor on log rows
  initRem: string; // InitRem — log entry comments
  zname: string; // Zname — header "created by" display name
  delDate: string; // DelDate — line item delivery date
  ccenter: string; // Ccenter — cost center
  gl: string; // Gl — GL account
  menge: string; // Menge — quantity
  meins: string; // Meins — unit of measure
  order: string; // Order — internal order
  loekz: boolean; // Loekz — deletion indicator
  email: string; // Email — confirmed live, see header comment
  raw: Record<string, unknown>; // the untouched OData row, so a write-back can echo fields this
  // type doesn't otherwise model (matches the source app's `Object.assign({}, ...getObject())`
  // approach of round-tripping the full row rather than reconstructing a payload from scratch).
}

export interface PoUser {
  id: string; // Id
  username: string; // Username
}
