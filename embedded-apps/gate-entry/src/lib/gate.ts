/**
 * Gate entry operations on ZGATE_ENTRY_SRV (ported from gate-entry-web src/lib/sap/gate-service.ts).
 *
 * Differences from that BFF design, because this app runs in the browser behind the shared Azure gateway
 * (technical SAP user, $format=json appended to every call) - see README "SAP contract":
 *  - Email: the signed-in hub user's email goes with every call ($filter Email eq '..' on reads, an Email
 *    parameter on function imports, an Email property on the create). ZCL_GATE_ENTRY_BL maps it to the SAP user
 *    for ZGATE_AUTH (plants, cancel authority) and REQ_BY, since sy-uname is the gateway's technical user.
 *  - Keyed reads become filtered reads (AsnSet, PoInfoSet) so the Email filter can travel with them.
 *  - Multi-PO entries are ONE deep insert (items of every PO, each with its Ebeln); the BL splits them into one
 *    header per PO under one new request number, exactly as it already does for an ASN. No $batch: the gateway
 *    appends $format to the URL, which $batch does not accept.
 *  - Print returns the PDF base64 in a property (GateRequestPdfSet?$filter=..) instead of a $value stream.
 */
import { and, dec, eq, fromSapDate, fromSapTime, num, odataKey, str, toSapDate, toSapTime } from './format';
import { getHubEmail } from './hub';
import { GateError, sapGet, sapPost } from './sap';
import type { AsnDetail, AsnSummary, EntryDetail, EntryHeader, EntrySummary, Line, PoBlock, PoInfo, PoItem, SharedHeader } from './types';

const email = () => getHubEmail().toLowerCase();
const withEmail = (...c: (string | undefined | false | null)[]) => and(eq('Email', email()), ...c);

/* ------------------------------ mappers ------------------------------ */

const mapItem = (r: any): PoItem => ({
  ebeln: str(r.Ebeln),
  ebelp: str(r.Ebelp),
  txz01: str(r.Txz01),
  matnr: str(r.Matnr),
  werks: str(r.Werks),
  poQnty: num(r.PoQnty),
  menge: num(r.Menge),
  meins: str(r.Meins),
  qntRecievd: num(r.QntRecievd),
  retVend122: num(r.RetVend122),
});

const mapAsn = (r: any): AsnSummary => ({
  shipId: str(r.ShipId),
  ebeln: str(r.Ebeln),
  vehicleNo: str(r.VehicleNo),
  lrNo: str(r.LrNo),
  invNum: str(r.InvNum),
  werks: str(r.Werks),
  lifnr: str(r.Lifnr),
  name1: str(r.Name1),
});

const mapHeader = (r: any): Omit<EntryHeader, 'items'> => ({
  reqNo: str(r.ReqNo),
  slno: str(r.Slno),
  reqDate: fromSapDate(r.ReqDate),
  reqTime: fromSapTime(r.ReqTime),
  reqBy: str(r.ReqBy),
  poNo: str(r.PoNo),
  poVendr: str(r.PoVendr),
  poVendrName: str(r.PoVendrName),
  regio: str(r.Regio),
  regioDesc: str(r.RegioDesc),
  truckNo: str(r.TruckNo),
  truckDate: fromSapDate(r.TruckDate),
  truckTim: fromSapTime(r.TruckTim),
  lrno: str(r.Lrno),
  lrdt: fromSapDate(r.Lrdt),
  vehVendrNo: str(r.VehVendrNo),
  vehVendrName: str(r.VehVendrName),
  invNo: str(r.InvNo),
  invDate: fromSapDate(r.InvDate),
  asnNo: str(r.AsnNo),
});

const first = <T>(rows: T[] | undefined, what: string): T => {
  if (!rows || !rows.length) throw new GateError(404, 'NOT_FOUND', `${what} not found`);
  return rows[0];
};

/* -------------------------------- ASN -------------------------------- */

/** WD OVS_ASN: the user's open ASNs (their plants, not yet used, not cancelled), optionally for one PO. */
export async function searchAsn(poNo?: string): Promise<AsnSummary[]> {
  const rows = await sapGet<any[]>('/AsnSet', { $filter: withEmail(poNo && eq('Ebeln', poNo)) });
  return (rows ?? []).map(mapAsn);
}

export async function getAsn(shipId: string): Promise<{ asn: AsnDetail; items: PoItem[] }> {
  const [hdr, items] = await Promise.all([
    sapGet<any[]>('/AsnSet', { $filter: withEmail(eq('ShipId', shipId)) }),
    sapGet<any[]>('/AsnItemSet', { $filter: withEmail(eq('ShipId', shipId)) }),
  ]);
  const a = first(hdr, `ASN ${shipId}`);
  return {
    asn: { ...mapAsn(a), lrDate: fromSapDate(a.LrDate), invDate: fromSapDate(a.InvDate), regio: str(a.Regio), rgnDesc: str(a.RgnDesc) },
    items: (items ?? []).map(mapItem),
  };
}

/* --------------------------------- PO --------------------------------- */

/** WD PO_ENTER. SAP answers with the WD message (not released, not authorised, ...) as an error on field poNo. */
export async function getPo(ebeln: string): Promise<{ po: PoInfo; items: PoItem[] }> {
  const [hdr, items] = await Promise.all([
    sapGet<any[]>('/PoInfoSet', { $filter: withEmail(eq('Ebeln', ebeln)) }),
    sapGet<any[]>('/PoItemSet', { $filter: withEmail(eq('Ebeln', ebeln)) }),
  ]);
  const p = first(hdr, `PO ${ebeln}`);
  return {
    po: { ebeln: str(p.Ebeln), werks: str(p.Werks), lifnr: str(p.Lifnr), poVendrName: str(p.PoVendrName), regio: str(p.Regio), rgnDesc: str(p.RgnDesc) },
    items: (items ?? []).map(mapItem),
  };
}

/** WD PO_HIST: earlier, non-cancelled receipts of a PO. */
export async function poHistory(ebeln: string) {
  const rows = await sapGet<any[]>('/GateRequestItemSet', { $filter: withEmail(eq('Ebeln', ebeln)) });
  return (rows ?? []).map((r) => ({ reqNo: str(r.ReqNo), slno: str(r.Slno), ...mapItem(r) }));
}

/* ------------------------------- create ------------------------------- */

const sapItem = (i: Line) => ({
  Ebeln: i.ebeln,
  Ebelp: i.ebelp,
  Txz01: i.txz01,
  Matnr: i.matnr,
  Werks: i.werks,
  PoQnty: dec(i.poQnty),
  Menge: dec(i.menge),
  Meins: i.meins,
  QntRecievd: dec(i.qntRecievd),
  RetVend122: dec(i.retVend122),
  Selected: 'X',
});

function requestBody(h: SharedHeader, o: { plnt: string; poNo: string; poVendr: string; poVendrName: string; regio: string; regioDesc: string; asnNo?: string; items: Line[]; confirm: boolean }) {
  return {
    Email: email(),
    ReqDate: toSapDate(h.reqDate),
    PoNo: o.poNo,
    PoVendr: o.poVendr,
    PoVendrName: o.poVendrName,
    Regio: o.regio,
    RegioDesc: o.regioDesc,
    TruckNo: h.truckNo.trim().toUpperCase(),
    TruckDate: toSapDate(h.truckDate),
    TruckTim: toSapTime(h.truckTim),
    Lrno: h.lrno.trim(),
    ...(h.lrdt ? { Lrdt: toSapDate(h.lrdt) } : {}),
    FrVendr: h.frVendr,
    VehVendrNo: h.frVendr === '01' ? h.vehVendrNo.trim() : '',
    VehVendrName: h.frVendr === '02' ? h.vehVendrName.trim() : '',
    InvNo: h.invNo.trim(),
    InvDate: toSapDate(h.invDate),
    ...(o.asnNo ? { AsnNo: o.asnNo } : {}),
    Plnt: o.plnt,
    ConfirmDateWarning: o.confirm,
    Items: o.items.map(sapItem),
  };
}

/** PO mode: one deep insert with the received lines of every PO (the BL creates one header per PO). */
export async function createFromPos(h: SharedHeader, pos: PoBlock[], confirm: boolean): Promise<string> {
  const lead = pos[0].po;
  const items = pos.flatMap((p) => p.lines.filter((l) => l.selected && l.qntRecievd > 0));
  const r = await sapPost<any>('/GateRequestSet', requestBody(h, {
    plnt: lead.werks, poNo: lead.ebeln, poVendr: lead.lifnr, poVendrName: lead.poVendrName, regio: lead.regio, regioDesc: lead.rgnDesc, items, confirm,
  }));
  return reqNoOf(r);
}

/** ASN mode: one deep insert with the ticked lines (the BL splits them per PO). */
export async function createFromAsn(h: SharedHeader, asn: AsnDetail, lines: Line[], confirm: boolean): Promise<string> {
  const r = await sapPost<any>('/GateRequestSet', requestBody(h, {
    plnt: asn.werks, poNo: '', poVendr: asn.lifnr, poVendrName: asn.name1, regio: asn.regio, regioDesc: asn.rgnDesc, asnNo: asn.shipId,
    items: lines.filter((l) => l.selected), confirm,
  }));
  return reqNoOf(r);
}

function reqNoOf(r: any): string {
  const reqNo = str(r?.ReqNo);
  if (!reqNo) throw new GateError(502, 'INTERNAL', 'SAP saved the entry but returned no request number - search for it under Gate entries.');
  return reqNo;
}

/* ------------------------ search / read / actions ------------------------ */

export async function searchEntries(f: { year?: string; poNo?: string; reqNo?: string; asnNo?: string }): Promise<EntrySummary[]> {
  const rows = await sapGet<any[]>('/GateSummarySet', {
    $filter: withEmail(f.year && eq('Year', f.year), f.poNo && eq('PoNo', f.poNo), f.reqNo && eq('ReqNo', f.reqNo.toUpperCase()), f.asnNo && eq('AsnNo', f.asnNo)),
  });
  return (rows ?? [])
    .map((r) => ({
      reqNo: str(r.ReqNo),
      reqDate: fromSapDate(r.ReqDate),
      reqTime: fromSapTime(r.ReqTime),
      reqBy: str(r.ReqBy),
      asnNo: str(r.AsnNo),
      truckNo: str(r.TruckNo),
      truckDate: fromSapDate(r.TruckDate),
      truckTim: fromSapTime(r.TruckTim),
      truckOutDat: fromSapDate(r.TruckOutDat),
      truckOutTim: fromSapTime(r.TruckOutTim),
    }))
    .sort((a, b) => `${b.reqDate}${b.reqTime}${b.reqNo}`.localeCompare(`${a.reqDate}${a.reqTime}${a.reqNo}`));
}

export async function getEntry(reqNo: string): Promise<EntryDetail> {
  const key = reqNo.toUpperCase();
  const [headers, items] = await Promise.all([
    sapGet<any[]>('/GateRequestSet', { $filter: withEmail(eq('ReqNo', key)) }),
    sapGet<any[]>('/GateRequestItemSet', { $filter: withEmail(eq('ReqNo', key)) }),
  ]);
  const byPo = new Map<string, PoItem[]>();
  (items ?? []).forEach((r) => {
    const k = `${str(r.Slno)}|${str(r.Ebeln)}`;
    byPo.set(k, [...(byPo.get(k) ?? []), mapItem(r)]);
  });
  return {
    reqNo: key,
    entries: (headers ?? [])
      .map((h) => ({ ...mapHeader(h), items: byPo.get(`${str(h.Slno)}|${str(h.PoNo)}`) ?? [] }))
      .sort((a, b) => Number(a.slno) - Number(b.slno)),
  };
}

export async function recordOutTime(reqNo: string) {
  await sapPost('/RecordOutTime', undefined, { ReqNo: odataKey(reqNo.toUpperCase()), Email: odataKey(email()) });
}

export async function cancelEntry(reqNo: string, reason: string) {
  await sapPost('/CancelRequest', undefined, { ReqNo: odataKey(reqNo.toUpperCase()), Reason: odataKey(reason.trim()), Email: odataKey(email()) });
}

/** The gate pass PDF (Smartform ZF_GATE_ENTRY), base64 in property Pdf. */
export async function getPdf(reqNo: string): Promise<Blob> {
  const rows = await sapGet<any[]>('/GateRequestPdfSet', { $filter: withEmail(eq('ReqNo', reqNo.toUpperCase())) });
  const b64 = str(first(rows, `PDF of ${reqNo}`).Pdf);
  if (!b64) throw new GateError(404, 'NOT_FOUND', 'SAP returned an empty PDF');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
