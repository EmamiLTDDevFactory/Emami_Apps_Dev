// Fast-feedback checks (gate-entry-web src/shared/schemas.ts). SAP (ZCL_GATE_ENTRY_BL) stays the authority.
import type { Line, SharedHeader } from './types';

export type Errors = Record<string, string>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}(:\d{2})?$/;

export function checkHeader(h: SharedHeader, invoiceFromAsn = false): Errors {
  const e: Errors = {};
  if (!ISO.test(h.reqDate)) e.reqDate = 'Enter the request date';
  if (!h.truckNo.trim()) e.truckNo = 'Fill in the vehicle Number';
  else if (h.truckNo.trim().length > 20) e.truckNo = 'At most 20 characters';
  if (!ISO.test(h.truckDate)) e.truckDate = 'Enter the truck entry date';
  if (!HHMM.test(h.truckTim)) e.truckTim = 'Enter the truck entry time';
  if (!h.lrno.trim()) e.lrno = 'Fill in the LR number';
  if (h.frVendr === '01' && !h.vehVendrNo.trim()) e.vehVendrNo = 'Fill in the freight vendor';
  if (h.frVendr === '02' && !h.vehVendrName.trim()) e.vehVendrName = 'Fill in the freight vendor';
  if (!invoiceFromAsn) {
    if (!h.invNo.trim()) e.invNo = 'Fill in the invoice Number';
    else if (h.invNo.trim().length > 16) e.invNo = 'At most 16 characters';
    if (!ISO.test(h.invDate)) e.invDate = 'Enter the invoice date';
  }
  return e;
}

/** Errors per line key (ebeln/ebelp) plus '_' for the whole list. */
export function checkLines(lines: Line[]): Errors {
  const e: Errors = {};
  const ticked = lines.filter((l) => l.selected);
  if (!ticked.length) e._ = 'No Item has been recieved.';
  ticked.forEach((l) => {
    const k = `${l.ebeln}/${l.ebelp}`;
    if (!(l.qntRecievd > 0)) e[k] = 'Quantity received cannot be zero.';
    else if (l.qntRecievd > l.menge) e[k] = `Allowed quantity exceeded. Suggested quantity:: ${l.menge}`;
  });
  return e;
}
