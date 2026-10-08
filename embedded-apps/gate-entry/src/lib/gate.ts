/**
 * Gate entry operations on ZMM_GATE_ENTRY_SRV (SEGW ZMM_GATE_ENTRY_MDL) on NGD, through the Azure gateway.
 *
 * Contract checked live on NGD 2026-10-08 (UI5_CONVERSION_PROMPT.md is the brief):
 *  - keyed reads for one PO / one ASN, filtered reads for lists; no function imports.
 *  - save = ONE deep insert on GateEntrySet with navigation Pos (one element per PO, exactly one for an ASN), each
 *    with its Items; SAP allocates ReqNo and returns it. All or nothing.
 *  - ConfirmDateWarning and GateCancel.Admin are ABAP flags ('X' / ''), not Edm.Boolean - SAP refuses true/false.
 *  - out time and cancel are creates on GateOutTimeSet / GateCancelSet.
 *  - the gateway logs on with its technical user, so the signed-in Emami Apps email (lower case) goes with every
 *    call: first in every list $filter, as the second key of AsnSet (ShipId, Email), and as property Email on
 *    every create. Every entity type except GateRequestPdf has Email (NGD, 2026-10-09).
 *  - the gateway has no route for DELETE or for .../$value (both answer its own 404), see deleteLine / getPdf.
 */
import { and, dec, eq, fromSapDate, fromSapTime, num, odataKey, str, toSapDate, toSapTime } from './format';
import { getHubEmail } from './hub';
import { GateError, parseSapError, sapDelete, sapGet, sapPost, sapPut, sapRawUrl } from './sap';
import type { AsnDetail, AsnSummary, EntryDetail, EntryHeader, EntryItem, EntrySummary, Line, PoBlock, PoInfo, PoItem, SharedHeader } from './types';

const flag = (b: boolean) => (b ? 'X' : '');

const email = () => getHubEmail().toLowerCase();

/** Filtered list read with Email = the Emami Apps login email in front of the other conditions. */
const list = async (path: string, ...conds: (string | undefined | false | null)[]): Promise<any[]> =>
  (await sapGet<any[]>(path, { $filter: and(eq('Email', email()), ...conds) })) ?? [];

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

const itemKey = (i: { reqNo: string; slno: string; ebeln: string; ebelp: string }) =>
  `(ReqNo=${odataKey(i.reqNo)},Slno=${odataKey(i.slno)},Ebeln=${odataKey(i.ebeln)},Ebelp=${odataKey(i.ebelp)})`;

/* -------------------------------- ASN -------------------------------- */

/** WD OVS_ASN: open ASNs SAP offers (plants of the SAP user, not yet used, not cancelled), optionally for one PO. */
export async function searchAsn(poNo?: string): Promise<AsnSummary[]> {
  const rows = await list('/AsnSet', poNo && eq('Ebeln', poNo));
  return (rows ?? []).map(mapAsn);
}

export async function getAsn(shipId: string): Promise<{ asn: AsnDetail; items: PoItem[] }> {
  const [a, items] = await Promise.all([
    sapGet<any>(`/AsnSet(ShipId=${odataKey(shipId)},Email=${odataKey(email())})`),
    list('/AsnItemSet', eq('ShipId', shipId)),
  ]);
  return {
    asn: { ...mapAsn(a), lrDate: fromSapDate(a.LrDate), invDate: fromSapDate(a.InvDate), regio: str(a.Regio), rgnDesc: str(a.RgnDesc) },
    items: (items ?? []).map(mapItem),
  };
}

/* --------------------------------- PO --------------------------------- */

/** WD PO_ENTER. SAP answers with the WD message (not released, not authorised, ...), often as "PO_NO: text". */
export async function getPo(ebeln: string): Promise<{ po: PoInfo; items: PoItem[] }> {
  const [p, items] = await Promise.all([
    sapGet<any>(`/PoInfoSet(${odataKey(ebeln)})`),
    list('/PoItemSet', eq('Ebeln', ebeln)),
  ]);
  return {
    po: { ebeln: str(p.Ebeln), werks: str(p.Werks), lifnr: str(p.Lifnr), poVendrName: str(p.PoVendrName), regio: str(p.Regio), rgnDesc: str(p.RgnDesc) },
    items: (items ?? []).map(mapItem),
  };
}

/** WD PO_HIST: earlier, non-cancelled receipts of a PO. */
export async function poHistory(ebeln: string) {
  const rows = await list('/GateRequestItemSet', eq('Ebeln', ebeln));
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

/** One element of GateEntrySet.Pos: the shared truck data plus one PO (or the ASN) and its lines. */
function posElement(h: SharedHeader, o: { plnt: string; poNo: string; poVendr: string; poVendrName: string; regio: string; regioDesc: string; asnNo?: string; items: Line[] }) {
  return {
    Email: email(),
    ReqDate: toSapDate(h.reqDate),
    PoNo: o.poNo,
    PoVendr: o.poVendr,
    PoVendrName: o.poVendrName,
    Regio: o.regio,
    RegioDesc: o.regioDesc,
    Plnt: o.plnt,
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
    Items: o.items.map(sapItem),
  };
}

const createEntry = async (pos: ReturnType<typeof posElement>[], confirm: boolean) =>
  reqNoOf(await sapPost<any>('/GateEntrySet', { Email: email(), ConfirmDateWarning: flag(confirm), Pos: pos }));

/** PO mode: one Pos element per PO with its received lines; SAP saves them under one new request number. */
export async function createFromPos(h: SharedHeader, pos: PoBlock[], confirm: boolean): Promise<string> {
  return createEntry(
    pos.map(({ po, lines }) => posElement(h, {
      plnt: po.werks, poNo: po.ebeln, poVendr: po.lifnr, poVendrName: po.poVendrName, regio: po.regio, regioDesc: po.rgnDesc,
      items: lines.filter((l) => l.selected && l.qntRecievd > 0),
    })),
    confirm,
  );
}

/** ASN mode: exactly one Pos element with the ticked lines. */
export async function createFromAsn(h: SharedHeader, asn: AsnDetail, lines: Line[], confirm: boolean): Promise<string> {
  return createEntry(
    [posElement(h, {
      plnt: asn.werks, poNo: '', poVendr: asn.lifnr, poVendrName: asn.name1, regio: asn.regio, regioDesc: asn.rgnDesc, asnNo: asn.shipId,
      items: lines.filter((l) => l.selected),
    })],
    confirm,
  );
}

function reqNoOf(r: any): string {
  const reqNo = str(r?.ReqNo);
  if (!reqNo) throw new GateError(502, 'INTERNAL', 'SAP saved the entry but returned no request number - search for it under Gate entries.');
  return reqNo;
}

/* ------------------------ search / read / actions ------------------------ */

export async function searchEntries(f: { year?: string; poNo?: string; reqNo?: string; asnNo?: string }): Promise<EntrySummary[]> {
  const rows = await list('/GateSummarySet', f.year && eq('Year', f.year), f.poNo && eq('PoNo', f.poNo), f.reqNo && eq('ReqNo', f.reqNo.toUpperCase()), f.asnNo && eq('AsnNo', f.asnNo));
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
    list('/GateRequestSet', eq('ReqNo', key)),
    list('/GateRequestItemSet', eq('ReqNo', key)),
  ]);
  const byPo = new Map<string, EntryItem[]>();
  (items ?? []).forEach((r) => {
    const k = `${str(r.Slno)}|${str(r.Ebeln)}`;
    const { __metadata, ...raw } = r ?? {};
    byPo.set(k, [...(byPo.get(k) ?? []), { ...mapItem(r), reqNo: str(r.ReqNo), slno: str(r.Slno), raw }]);
  });
  return {
    reqNo: key,
    entries: (headers ?? [])
      .map((h) => ({ ...mapHeader(h), items: byPo.get(`${str(h.Slno)}|${str(h.PoNo)}`) ?? [] }))
      .sort((a, b) => Number(a.slno) - Number(b.slno)),
  };
}

/** SAP stamps the current date and time. */
export async function recordOutTime(reqNo: string) {
  await sapPost('/GateOutTimeSet', { ReqNo: reqNo.toUpperCase(), Email: email() });
}

/** SAP decides who may cancel (and refuses while a GRN is not reversed); admin = the admin cancel of the WD app. */
export async function cancelEntry(reqNo: string, reason: string, admin = false) {
  await sapPost('/GateCancelSet', { ReqNo: reqNo.toUpperCase(), Reason: reason.trim(), Admin: flag(admin), Email: email() });
}

/** Admin: delete one received line. The Azure gateway has no DELETE route yet (answers GATEWAY_UNSUPPORTED). */
export async function deleteLine(i: EntryItem) {
  await sapDelete(`/GateRequestItemSet${itemKey(i)}`);
}

/** Admin: set a line's received quantity to 0 - PUT of the full entity as read (SAP refuses partial updates). */
export async function zeroLine(i: EntryItem) {
  await sapPut(`/GateRequestItemSet${itemKey(i)}`, { ...i.raw, QntRecievd: dec(0) });
}

/**
 * The gate pass PDF (Smartform) is a media entity: GET GateRequestPdfSet('<ReqNo>')/$value. The Azure gateway has no
 * route for /$value today (its own 404), so callers fall back to a printable page built from the entry
 * (components/print.ts) when this throws GATEWAY_UNSUPPORTED.
 */
export async function getPdf(reqNo: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(sapRawUrl(`/GateRequestPdfSet(${odataKey(reqNo.toUpperCase())})/$value`), { cache: 'no-store' });
  } catch {
    throw new GateError(502, 'SAP_UNAVAILABLE', 'SAP is not reachable right now. Check the network and try again.');
  }
  if (!res.ok) throw parseSapError(res.status, await res.text());
  const blob = await res.blob();
  if (!blob.size) throw new GateError(404, 'NOT_FOUND', 'SAP returned an empty PDF');
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}
