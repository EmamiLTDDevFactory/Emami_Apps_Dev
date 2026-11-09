/**
 * Budget rate management, browser -> SAP gateway (static export: no API routes; the gateway does the CSRF handshake for the writes, as for the
 * budget and plan uploads). Reads: BudHistSet, BudRateSet, BudRateSrcSet. Writes: PATCH of one BudRateSet row, POST of BudRateActionSet.
 * The approval rights live in SAP (ZBOM_BUD_AUTH), which decides by the email sent; the screen always sends the hub session email.
 */
import { sapGetCollection, sapWrite, SAP_MAX_TIMEOUT_MS, type SapGetOptions } from '../sap/client';
import { odataDate, odataString } from '../sap/filter';
import type { ActionPayload, ActionResult, BudHistRow, BudRateRow, BudRateSrcRow, HistoryFilter, RateEdit, RateFilter } from './types';
import { amount, dateText, padMatnr } from './rules';

export const BUD_MGMT_SET = { HIST: 'BudHistSet', RATE: 'BudRateSet', SRC: 'BudRateSrcSet', ACTION: 'BudRateActionSet' } as const;

const num = (v: unknown) => Number(v) || 0;
const str = (v: unknown) => String(v ?? '');
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

export const sourceFilter = (matnr: string, bukrs: string, werks: string, land1: string) =>
  [`Matnr eq ${odataString(padMatnr(matnr))}`, `Bukrs eq ${odataString(bukrs)}`, werks ? `Werks eq ${odataString(werks)}` : null, `Land1 eq ${odataString(land1)}`].filter(Boolean).join(' and ');

const hist = (r: Record<string, unknown>): BudHistRow => ({
  Rowid: str(r.Rowid), Matnr: str(r.Matnr), Maktx: str(r.Maktx), Land1: str(r.Land1), Werks: str(r.Werks), Bukrs: str(r.Bukrs), Mtart: str(r.Mtart), BaseUom: str(r.BaseUom),
  NetQty: num(r.NetQty), NetValue: num(r.NetValue), Currency: str(r.Currency), AvgRate: num(r.AvgRate), CtryValue: num(r.CtryValue), Matcat: str(r.Matcat),
});
const rate = (r: Record<string, unknown>): BudRateRow => ({
  Gjahr: str(r.Gjahr), Land1: str(r.Land1), Matnr: str(r.Matnr), Werks: str(r.Werks), Bukrs: str(r.Bukrs), ValidFrom: dateText(r.ValidFrom), Matcat: str(r.Matcat), RateSrc: str(r.RateSrc),
  SrcRate: num(r.SrcRate), DerivedRate: num(r.DerivedRate), DerivedCurr: str(r.DerivedCurr), AdjType: str(r.AdjType), AdjValue: num(r.AdjValue),
  OverrideRate: num(r.OverrideRate), OverrideRsn: str(r.OverrideRsn), FrtTotal: num(r.FrtTotal), LandedRate: num(r.LandedRate), LandedCurr: str(r.LandedCurr),
  ApprStatus: str(r.ApprStatus), SubmittedBy: str(r.SubmittedBy), SubmittedOn: dateText(r.SubmittedOn), ApprovedBy: str(r.ApprovedBy), ApprovedOn: dateText(r.ApprovedOn),
  RejectedBy: str(r.RejectedBy), RejectionRsn: str(r.RejectionRsn),
});
const src = (r: Record<string, unknown>): BudRateSrcRow => ({
  RateSrc: str(r.RateSrc), CondType: str(r.CondType), Vendor: str(r.Vendor), Vendname: str(r.Vendname), Rate: num(r.Rate), Currency: str(r.Currency), PriceUnit: num(r.PriceUnit),
  ValidFrom: dateText(r.ValidFrom), ValidTo: dateText(r.ValidTo), RatePc: num(r.RatePc), LocalCurr: str(r.LocalCurr), RateLocal: num(r.RateLocal),
});

const read = async <T,>(set: string, filter: string, map: (r: Record<string, unknown>) => T, opts: SapGetOptions): Promise<T[]> =>
  (await sapGetCollection(set, { $filter: filter }, { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts })).rows.map((r) => map(r as Record<string, unknown>));

export const fetchHistory = (f: HistoryFilter, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.HIST, historyFilter(f), hist, opts);
export const fetchRates = (f: RateFilter, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.RATE, rateFilter(f), rate, opts);
export const fetchRateSources = (matnr: string, bukrs: string, werks: string, land1: string, opts: SapGetOptions = {}) => read(BUD_MGMT_SET.SRC, sourceFilter(matnr, bukrs, werks, land1), src, opts);

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
export function generateBody(f: HistoryFilter, email: string) {
  return {
    Action: 'GENERATE', Gjahr: f.gjahr, Land1: f.land1, MatnrCsv: '', WerksCsv: '', Reason: '', Email: email.trim().toLowerCase(),
    HistFrom: msDate(f.histFrom), HistTo: msDate(f.histTo), CatAFrom: String(amount(f.catAFrom)), CatBFrom: String(amount(f.catBFrom)), MtartCsv: (f.mtart ?? []).join(','),
  };
}
export async function postGenerate(f: HistoryFilter, email: string, opts: SapGetOptions = {}): Promise<ActionResult> {
  const r = await sapWrite('POST', BUD_MGMT_SET.ACTION, generateBody(f, email), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const d = ((r.body as { d?: Record<string, unknown> } | null)?.d ?? r.body ?? {}) as Record<string, unknown>;
  return { RowsActed: num(d.RowsActed), Message: str(d.Message) };
}
