/**
 * Budget rate management, browser -> SAP gateway (static export: no API routes; the gateway does the CSRF handshake for the writes, as for the
 * budget and plan uploads). Reads: BudHistSet, BudRateSet, BudRateSrcDtlSet. Writes: PATCH of one BudRateSet row, POST of BudRateActionSet.
 * The approval rights live in SAP (ZBOM_BUD_AUTH), which decides by the email sent; the screen always sends the hub session email.
 */
import { sapGetCollection, sapWrite, SAP_MAX_TIMEOUT_MS, type SapGetOptions } from '../sap/client';
import { odataDate, odataString } from '../sap/filter';
import { MATERIAL_TYPES, type ActionPayload, type ActionResult, type BasePrcRow, type BudHistRow, type BudRateRow, type BudRateSrcDtlRow, type FreightLine, type FrtDtlRow, type HistoryFilter, type RateEdit, type RateFilter } from './types';
import { amount, dateText, defaultHistWindow, isPerfume, padMatnr, stripZeros } from './rules';

export const BUD_MGMT_SET = { HIST: 'BudHistSet', RATE: 'BudRateSet', SRCDTL: 'BudRateSrcDtlSet', BASEDET: 'BasePrcDetSet', FRTDET: 'FrtDtlSet', ACTION: 'BudRateActionSet' } as const;

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? '');
/** Freight line items of a row: FrtCond1-4 with FrtRate1-4, the empty ones left out. */
const frtLines = (r: Record<string, unknown>): FreightLine[] => [1, 2, 3, 4].map((i) => ({ cond: str(r[`FrtCond${i}`]).trim(), rate: num(r[`FrtRate${i}`]) })).filter((l) => l.cond || l.rate !== 0);
const or = (field: string, values: string[]) => {
  const u = Array.from(new Set(values.filter(Boolean)));
  if (!u.length) return null;
  const p = u.map((v) => `${field} eq ${odataString(v)}`);
  return p.length === 1 ? p[0] : `(${p.join(' or ')})`;
};
/** Category limits are amounts: sent as Edm.Decimal literals. */
const dec = (s: string) => `${amount(s)}m`;

export function historyFilter(f: HistoryFilter): string {
  return [
    `Land1 eq ${odataString(f.land1)}`, `Gjahr eq ${odataString(f.gjahr)}`,
    `HistFrom eq ${odataDate(f.histFrom)}`, `HistTo eq ${odataDate(f.histTo)}`,
    `CatAFrom eq ${dec(f.catAFrom)}`, `CatBFrom eq ${dec(f.catBFrom)}`,
    or('Mtart', f.mtart ?? []),
  ].filter(Boolean).join(' and ');
}

export function rateFilter(f: RateFilter): string {
  return [
    `Gjahr eq ${odataString(f.gjahr)}`, `Land1 eq ${odataString(f.land1)}`,
    f.status ? `ApprStatus eq ${odataString(f.status)}` : null,
    or('Matnr', (f.matnr ?? []).map(padMatnr)), or('Werks', f.werks ?? []),
  ].filter(Boolean).join(' and ');
}

/** BudRateSet rows carry no company code but BudRateSrcDtlSet requires one ("Matnr and Bukrs filters are required"): the History rows' company code, 1000, when none is known. */
export const DEFAULT_BUKRS = '1000';

const hist = (r: Record<string, unknown>): BudHistRow => ({
  Rowid: str(r.Rowid), Matnr: str(r.Matnr), Maktx: str(r.Maktx), Land1: str(r.Land1), Werks: str(r.Werks), Bukrs: str(r.Bukrs), Mtart: str(r.Mtart), Matkl: str(r.Matkl), BaseUom: str(r.BaseUom),
  NetQty: num(r.NetQty), NetValue: num(r.NetValue), Currency: str(r.Currency), AvgRate: num(r.AvgRate), CtryValue: num(r.CtryValue), Matcat: str(r.Matcat),
});
const rate = (r: Record<string, unknown>): BudRateRow => ({
  Gjahr: str(r.Gjahr), Land1: str(r.Land1), Matnr: str(r.Matnr), Werks: str(r.Werks), Bukrs: str(r.Bukrs), ValidFrom: dateText(r.ValidFrom), Matcat: str(r.Matcat), RateSrc: str(r.RateSrc),
  SrcRate: num(r.SrcRate), DerivedRate: num(r.DerivedRate), DerivedCurr: str(r.DerivedCurr), AdjType: str(r.AdjType), AdjValue: num(r.AdjValue),
  OverrideRate: num(r.OverrideRate), OverrideRsn: str(r.OverrideRsn), FrtTotal: num(r.FrtTotal), FrtLines: frtLines(r), LandedRate: num(r.LandedRate), LandedCurr: str(r.LandedCurr), BaseUom: str(r.BaseUom),
  ApprStatus: str(r.ApprStatus), SubmittedBy: str(r.SubmittedBy), SubmittedOn: dateText(r.SubmittedOn), ApprovedBy: str(r.ApprovedBy), ApprovedOn: dateText(r.ApprovedOn),
  RejectedBy: str(r.RejectedBy), RejectionRsn: str(r.RejectionRsn),
});

const srcDtl = (r: Record<string, unknown>): BudRateSrcDtlRow => ({
  RateSrc: str(r.RateSrc), CondType: str(r.CondType), Vendor: str(r.Vendor), Vendname: str(r.Vendname), Rate: num(r.Rate), Currency: str(r.Currency), PriceUnit: num(r.PriceUnit), CondUnit: str(r.CondUnit),
  ValidFrom: dateText(r.ValidFrom), ValidTo: dateText(r.ValidTo), RatePc: num(r.RatePc),
  FrtLines: frtLines(r), FrtTotal: num(r.FrtTotal), FrtCurr: str(r.FrtCurr), LandedRate: num(r.LandedRate), LandedCurr: str(r.LandedCurr),
});
const basePrc = (r: Record<string, unknown>): BasePrcRow => ({
  Rowid: num(r.Rowid), Matnr: str(r.Matnr), Ebeln: str(r.Ebeln), Ebelp: str(r.Ebelp), Podate: dateText(r.Podate), Vendor: str(r.Vendor), Plant: str(r.Plant), Matdesc: str(r.Matdesc), Baseunit: str(r.Baseunit),
  Qtybase: num(r.Qtybase), Doccurr: str(r.Doccurr), Valuedoc: num(r.Valuedoc), Localcurr: str(r.Localcurr), Valuelocal: num(r.Valuelocal), Valuegroup: num(r.Valuegroup),
  Wtdavglocal: num(r.Wtdavglocal), Wtdavggroup: num(r.Wtdavggroup), Rowtype: str(r.Rowtype),
});
export const srcDtlFilter = (matnr: string, bukrs: string, land1: string) => [`Matnr eq ${odataString(padMatnr(matnr))}`, `Bukrs eq ${odataString(bukrs || DEFAULT_BUKRS)}`, `Land1 eq ${odataString(land1)}`].join(' and ');

const read = async <T,>(set: string, filter: string, map: (r: Record<string, unknown>) => T, opts: SapGetOptions, select?: string): Promise<T[]> =>
  (await sapGetCollection(set, { $filter: filter, $select: select }, { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts })).rows.map((r) => map(r as Record<string, unknown>));

/** BudHistSet leaves Matkl out unless the columns are asked for: $select names them all. */
const HIST_SELECT = 'Rowid,Matnr,Maktx,Land1,Werks,Bukrs,Mtart,Matkl,BaseUom,NetQty,NetValue,Currency,AvgRate,CtryValue,Matcat';
/** Material types to read: the ticked ones, or all of them when none is ticked (BudHistSet returns nothing without a type). */
export const historyTypes = (f: HistoryFilter): string[] => (f.mtart?.length ? f.mtart : [...MATERIAL_TYPES]);
/** BudHistSet honours only the first type of an "A or B" filter and drops the rest, so every type is read with its own request and the rows are put together. */
export async function fetchHistory(f: HistoryFilter, opts: SapGetOptions = {}): Promise<BudHistRow[]> {
  const parts = await Promise.all(historyTypes(f).map((t) => read(BUD_MGMT_SET.HIST, historyFilter({ ...f, mtart: [t] }), hist, opts, HIST_SELECT)));
  return parts.flat();
}
/** Materials of the Perfume segment (ROH with material group 106) of a country and year, for the tabs whose rows carry no material group. */
export async function fetchPerfumeMaterials(land1: string, gjahr: string, opts: SapGetOptions = {}): Promise<Set<string>> {
  const w = defaultHistWindow(gjahr);
  const rows = await read(BUD_MGMT_SET.HIST, historyFilter({ land1, gjahr, histFrom: w.from, histTo: w.to, catAFrom: '8,000,000', catBFrom: '4,000,000', mtart: ['ROH'] }), (r) => ({ m: str(r.Matnr), g: str(r.Matkl) }), opts, 'Matnr,Matkl,Mtart');
  return new Set(rows.filter((r) => isPerfume('ROH', r.g)).map((r) => stripZeros(r.m)));
}
export const fetchRates = (f: RateFilter, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.RATE, rateFilter(f), rate, opts);

export const fetchRateSrcDtl = (matnr: string, bukrs: string, land1: string, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.SRCDTL, srcDtlFilter(matnr, bukrs, land1), srcDtl, opts);

export const fetchBasePrcDet = (matnr: string, bukrs: string, land1: string, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.BASEDET, srcDtlFilter(matnr, bukrs, land1), basePrc, opts);

/** FrtDtlSet: every freight condition type of a material in a country for the history window. The dates go as YYYYMMDD strings, as in SAP's own example request. */
const firstOf = (r: Record<string, unknown>, names: string[]) => names.find((n) => r[n] !== undefined && r[n] !== null && String(r[n]).trim() !== '');
const frtDtl = (r: Record<string, unknown>): FrtDtlRow => {
  const pick = (names: string[]) => { const n = firstOf(r, names); return n ? str(r[n]).trim() : ''; };
  const an = firstOf(r, FRT_AMOUNT_FIELDS);
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) if (k !== '__metadata' && (typeof v !== 'object' || v === null)) raw[k] = str(v);
  return { cond: pick(['CondType', 'Kschl', 'FrtCond', 'Cond']), text: pick(['CondText', 'Vtext', 'Description', 'Text']), vendor: pick(['Vendor', 'Lifnr']), amount: an ? num(r[an]) : null, curr: pick(['Currency', 'Waers', 'FrtCurr', 'Curr']), raw };
};
export const FRT_AMOUNT_FIELDS = ['FrtAmt', 'FrtRate', 'FrtValue', 'Amount', 'Rate', 'Kwert', 'Value'];
const yyyymmdd = (iso: string) => iso.replace(/-/g, '').slice(0, 8);
export const frtDtlFilter = (matnr: string, bukrs: string, land1: string, histFrom: string, histTo: string) =>
  [`Matnr eq ${odataString(padMatnr(matnr))}`, `Land1 eq ${odataString(land1)}`, `Bukrs eq ${odataString(bukrs || DEFAULT_BUKRS)}`, `HistFrom eq ${odataString(yyyymmdd(histFrom))}`, `HistTo eq ${odataString(yyyymmdd(histTo))}`].join(' and ');
export const fetchFrtDtl = (matnr: string, bukrs: string, land1: string, histFrom: string, histTo: string, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.FRTDET, frtDtlFilter(matnr, bukrs, land1, histFrom, histTo), frtDtl, opts);

export const rateKeyPath = (r: Pick<BudRateRow, 'Gjahr' | 'Land1' | 'Matnr' | 'Werks' | 'ValidFrom'>) =>
  `${BUD_MGMT_SET.RATE}(Gjahr=${odataString(r.Gjahr)},Land1=${odataString(r.Land1)},Matnr=${odataString(padMatnr(r.Matnr))},Werks=${odataString(r.Werks)},ValidFrom=${odataString(r.ValidFrom)})`;

/** Decimals go as strings (OData V2 JSON). No adjustment = AdjType 'N' with a zero value; no override = 0. */
export function patchBody(e: RateEdit) {
  return {
    AdjType: e.adjType,
    AdjValue: e.adjType === 'N' ? '0' : String(amount(e.adjValue)),
    OverrideRate: e.overrideRate.trim() === '' ? '0' : String(amount(e.overrideRate)),
    OverrideRsn: e.overrideRate.trim() === '' ? '' : e.overrideRsn.trim(),
  };
}

export async function patchRate(r: BudRateRow, e: RateEdit, opts: SapGetOptions = {}): Promise<void> {
  await sapWrite('PATCH', rateKeyPath(r), patchBody(e), opts);
}

export function actionBody(p: ActionPayload) {
  return {
    Action: p.action, Gjahr: p.gjahr, Land1: p.land1, MatnrCsv: p.matnrCsv, WerksCsv: p.werksCsv,
    Reason: p.action === 'REJECT' ? p.reason.trim() : '', Email: p.email.trim().toLowerCase(),
  };
}

export async function postAction(p: ActionPayload, opts: SapGetOptions = {}): Promise<ActionResult> {
  const r = await sapWrite('POST', BUD_MGMT_SET.ACTION, actionBody(p), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const d = ((r.body as { d?: Record<string, unknown> } | null)?.d ?? r.body ?? {}) as Record<string, unknown>;
  return { RowsActed: num(d.RowsActed), Message: str(d.Message) };
}

/**
 * Generate Draft Rates: SAP loads the history, classifies, derives the basic rate, attaches freight and saves a draft (status D) row per material
 * into ZBOM_BUD_RATE. The history window and the A / B limits go with the action (Edm.DateTime as /Date(ms)/, decimals as strings).
 */
const msDate = (iso: string) => `/Date(${Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))})/`;
/** `matnrs`: generate for these materials only (MatnrCsv); none = every material of the history. */
export function generateBody(f: HistoryFilter, email: string, matnrs: string[] = []) {
  return {
    Action: 'GENERATE', Gjahr: f.gjahr, Land1: f.land1, MatnrCsv: matnrs.join(','), WerksCsv: '', Reason: '', Email: email.trim().toLowerCase(),
    HistFrom: msDate(f.histFrom), HistTo: msDate(f.histTo), CatAFrom: String(amount(f.catAFrom)), CatBFrom: String(amount(f.catBFrom)), MtartCsv: historyTypes(f).join(','),
  };
}
export async function postGenerate(f: HistoryFilter, email: string, matnrs: string[] = [], opts: SapGetOptions = {}): Promise<ActionResult> {
  const r = await sapWrite('POST', BUD_MGMT_SET.ACTION, generateBody(f, email, matnrs), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const d = ((r.body as { d?: Record<string, unknown> } | null)?.d ?? r.body ?? {}) as Record<string, unknown>;
  return { RowsActed: num(d.RowsActed), Message: str(d.Message) };
}
