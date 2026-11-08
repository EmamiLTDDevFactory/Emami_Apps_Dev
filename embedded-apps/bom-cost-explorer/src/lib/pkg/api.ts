/**
 * Packing material budget rate, browser -> SAP gateway (static export: no API routes; the gateway does the CSRF handshake for the writes).
 * Reads: PkgScenSet, PkgItemSet, PkgOvrSet. Every action is one POST of PkgActionSet. The entity and property names below are the assumed
 * contract, checked by probing the live service (the edit fields are OvrLevel / OvrRule / NewValue, not Level / Rule / Value): they live in this file only. SAP decides the rights by the email sent.
 */
import { sapGetCollection, sapWrite, SAP_MAX_TIMEOUT_MS, type SapGetOptions } from '../sap/client';
import { odataString } from '../sap/filter';
import type { PkgActionBody, PkgItem, PkgOvr, PkgResult, PkgScen } from './types';
import { isoDate, num, padScen, timeText } from './rules';

export const PKG_SET = { SCEN: 'PkgScenSet', ITEM: 'PkgItemSet', OVR: 'PkgOvrSet', ACTION: 'PkgActionSet' } as const;
const str = (v: unknown) => String(v ?? '');
type Raw = Record<string, unknown>;

const scen = (r: Raw): PkgScen => ({
  ScenId: str(r.ScenId), Descr: str(r.Descr), BudgetVersion: num(r.BudgetVersion), Status: str(r.Status), ValidFrom: isoDate(r.ValidFrom), ValidTo: isoDate(r.ValidTo),
  BudgetYear: str(r.BudgetYear), KeyDate: isoDate(r.KeyDate), Werks: str(r.Werks) || 'HO00', Prio: str(r.Prio), Norm: str(r.Norm), BaseScenId: str(r.BaseScenId),
  CreatedBy: str(r.CreatedBy), FinalBy: str(r.FinalBy),
});
const item = (r: Raw): PkgItem => ({
  ScenId: str(r.ScenId), Matnr: str(r.Matnr), Idnrk: str(r.Idnrk).trim(), Maktx: str(r.Maktx), Mtart: str(r.Mtart), Matkl: str(r.Matkl), RateSrc: str(r.RateSrc),
  BasicRateSap: num(r.BasicRateSap), BasicRateUsed: num(r.BasicRateUsed), BudgetRateSap: num(r.BudgetRateSap), BudgetRate: num(r.BudgetRate), Variance: num(r.Variance), VariancePct: num(r.VariancePct),
  Waers: str(r.Waers), Peinh: num(r.Peinh), Meins: str(r.Meins), MsgFlags: str(r.MsgFlags),
  PctSap: num(r.PctSap), PctUsed: num(r.PctUsed), ZbudSap: num(r.ZbudSap), ZbudUsed: num(r.ZbudUsed), CompBaseRate: num(r.CompBaseRate), CompBudRate: num(r.CompBudRate),
});
const ovr = (r: Raw): PkgOvr => ({
  ScenId: str(r.ScenId), OvrDate: isoDate(r.OvrDate), OvrTime: timeText(r.OvrTime), OvrUser: str(r.OvrUser), Level: str(r.OvrLevel), Matnr: str(r.Matnr), Matkl: str(r.Matkl),
  Idnrk: str(r.Idnrk), Rule: str(r.OvrRule), OldValue: str(r.OldValue), NewValue: str(r.NewValue),
});

const read = async <T,>(set: string, params: Record<string, string | undefined>, map: (r: Raw) => T, opts: SapGetOptions): Promise<T[]> =>
  (await sapGetCollection(set, params, { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts })).rows.map((r) => map(r as Raw));

export const scenFilter = (scenId: string) => `ScenId eq ${odataString(padScen(scenId))}`;
export const fetchScenarios = (opts: SapGetOptions = {}) => read(PKG_SET.SCEN, {}, scen, opts);
export const fetchItems = (scenId: string, opts: SapGetOptions = {}) => read(PKG_SET.ITEM, { $filter: scenFilter(scenId) }, item, opts);
export const fetchOverrides = (scenId: string, opts: SapGetOptions = {}) => read(PKG_SET.OVR, { $filter: scenFilter(scenId) }, ovr, opts);

const dt = (iso?: string) => (iso ? `${iso}T00:00:00` : undefined);
/** BudgetVersion is an Edm.String on SAP (a JSON number is rejected: 'Failed to read property BudgetVersion'; blank = next free). Decimals go as strings (OData V2 JSON), dates as Edm.DateTime. The user is the hub session email; SAP checks the rights for it. */
export function actionPayload(a: PkgActionBody, email: string) {
  return {
    Action: a.action, ScenId: a.scenId ? padScen(a.scenId) : '', Email: email.trim().toLowerCase(),
    Descr: a.descr ?? '', ValidFrom: dt(a.validFrom), ValidTo: dt(a.validTo), KeyDate: dt(a.keyDate),
    BudgetVersion: a.budgetVersion === undefined || a.budgetVersion === '' ? '' : String(a.budgetVersion),
    MtartSel: a.mtartSel ?? '', MatklSel: a.matklSel ?? '', MatnrSel: a.matnrSel ?? '', Prio: a.prio ?? '', Norm: a.norm ?? '',
    OvrLevel: a.level ?? '', OvrRule: a.rule ?? '', NewValue: a.value ?? '0', ScopeMatnr: a.scopeMatnr ?? '', ScopeMatkl: a.scopeMatkl ?? '', ScopeIdnrk: a.scopeIdnrk ?? '',
  };
}

export async function postAction(a: PkgActionBody, email: string, opts: SapGetOptions = {}): Promise<PkgResult> {
  const r = await sapWrite('POST', PKG_SET.ACTION, actionPayload(a, email), { timeoutMs: SAP_MAX_TIMEOUT_MS, ...opts });
  const d = ((r.body as { d?: Raw } | null)?.d ?? r.body ?? {}) as Raw;
  return { ScenId: str(d.ScenId), Msg: str(d.Msg), RowsZcomp: num(d.RowsZcomp), RowsZcompn: num(d.RowsZcompn), RowsSkip: num(d.RowsSkip) };
}
