// UI types (from gate-entry-web src/shared/types.ts).

export interface PoItem {
  ebeln: string;
  ebelp: string;
  txz01: string;
  matnr: string;
  werks: string;
  poQnty: number; // PO quantity incl. tolerance
  menge: number; // quantity still receivable
  meins: string;
  qntRecievd: number; // what the user enters / ASN suggestion
  retVend122: number;
}

/** A line on the form: the item plus whether it is ticked. */
export interface Line extends PoItem {
  selected: boolean;
}

export interface PoInfo {
  ebeln: string;
  werks: string;
  lifnr: string;
  poVendrName: string;
  regio: string;
  rgnDesc: string;
}

export interface AsnSummary {
  shipId: string;
  ebeln: string;
  vehicleNo: string;
  lrNo: string;
  invNum: string;
  werks: string;
  lifnr: string;
  name1: string;
}

export interface AsnDetail extends AsnSummary {
  lrDate: string | null;
  invDate: string | null;
  regio: string;
  rgnDesc: string;
}

export interface EntrySummary {
  reqNo: string;
  reqDate: string | null;
  reqTime: string | null;
  reqBy: string;
  asnNo: string;
  truckNo: string;
  truckDate: string | null;
  truckTim: string | null;
  truckOutDat: string | null;
  truckOutTim: string | null;
}

/** A saved line of a gate entry; raw = the SAP row as read, sent back whole by the admin PUT. */
export interface EntryItem extends PoItem {
  reqNo: string;
  slno: string;
  raw: Record<string, unknown>;
}

export interface EntryHeader {
  reqNo: string;
  slno: string;
  reqDate: string | null;
  reqTime: string | null;
  reqBy: string;
  poNo: string;
  poVendr: string;
  poVendrName: string;
  regio: string;
  regioDesc: string;
  truckNo: string;
  truckDate: string | null;
  truckTim: string | null;
  lrno: string;
  lrdt: string | null;
  vehVendrNo: string;
  vehVendrName: string;
  invNo: string;
  invDate: string | null;
  asnNo: string;
  items: EntryItem[];
}

export interface EntryDetail {
  reqNo: string;
  entries: EntryHeader[]; // one per PO
}

/** Truck / LR / freight / invoice data entered once per gate entry (shared by all its POs). */
export interface SharedHeader {
  reqDate: string;
  truckNo: string;
  truckDate: string;
  truckTim: string;
  lrno: string;
  lrdt: string;
  frVendr: '01' | '02'; // 01 = SAP vendor number, 02 = manual name
  vehVendrNo: string;
  vehVendrName: string;
  invNo: string;
  invDate: string;
}

/** A PO added to the entry (PO mode). */
export interface PoBlock {
  po: PoInfo;
  lines: Line[];
}
