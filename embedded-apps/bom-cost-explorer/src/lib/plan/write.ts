/**
 * Production Plan writes, browser -> SAP gateway (the app is a static export; the gateway does the CSRF
 * handshake with SAP, as for Gate Entry's saves). The "planner" role is checked in the UI (hub Manage
 * Access role Planner / Admin); SAP's own authority check is the real gate. Every upload is also written to
 * a local audit log ("plan:audit", this browser only - there is no app server to keep a central one).
 */
import { sapWrite, type SapGetOptions } from '../sap/client';
import { normalizeEntity } from '../sap/normalize';
import { odataString } from '../sap/filter';
import { NAV_UPLOAD_ENTRIES, PLAN_ENTRY, PLAN_SET, PLAN_UPLOAD, monthKeys, planFlagValue, type PlanEntry, type PlanUploadResult } from './fields';
import { D } from '../cost/decimal';
import { fetchPlanEntries } from './client';

export interface PlanRowInput {
  plan: string;
  matnr: string;
  werks: string;
  land1: string;
  months: string[]; // 12 values, April..March, decimal strings or numbers
}

const dec3 = (v: string | number) => D(v).toFixed(3);
const monthProps = (months: (string | number)[]) => Object.fromEntries(monthKeys('Mth').map((k, i) => [k, dec3(months[i] ?? 0)]));

/** One PlanEntry as SAP expects it in JSON (decimals as strings). */
export const entryPayload = (r: PlanRowInput) => ({ Plan1: r.plan.trim(), Matnr: r.matnr.trim().toUpperCase(), Werks: r.werks.trim().toUpperCase(), Land1: r.land1.trim().toUpperCase(), ...monthProps(r.months) });

export function uploadBody(plan: string, updMode: 'M' | 'R', dryrun: boolean, rows: PlanRowInput[]) {
  // Dryrun is CHAR1: 'X' = check only, '' = save (never a JSON boolean).
  return { Plan1: plan.trim(), UpdMode: updMode, Dryrun: planFlagValue(dryrun), [NAV_UPLOAD_ENTRIES]: rows.map(entryPayload) };
}

/** Deep insert into PlanUploadSet: Dryrun 'X' = check only, '' = save. */
export async function uploadPlan(plan: string, updMode: 'M' | 'R', dryrun: boolean, rows: PlanRowInput[], user: string, opts: SapGetOptions = {}): Promise<PlanUploadResult> {
  const r = await sapWrite('POST', PLAN_SET.UPLOAD, uploadBody(plan, updMode, dryrun, rows), opts);
  const d = ((r.body as { d?: Record<string, unknown> } | null)?.d ?? r.body ?? {}) as Record<string, unknown>;
  const head = normalizeEntity<Omit<PlanUploadResult, 'entries'>>(d, PLAN_UPLOAD);
  const raw = d[NAV_UPLOAD_ENTRIES] as { results?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined;
  const list = Array.isArray(raw) ? raw : raw?.results ?? [];
  const result = { ...head, entries: list.map((e) => normalizeEntity<PlanEntry>(e, PLAN_ENTRY)) };
  audit({ user, plan: plan.trim(), rows: rows.length, dryrun, mode: updMode, status: result.Status, saved: result.Saved, errors: result.Errors });
  return result;
}

export const entryKeyPath = (e: Pick<PlanEntry, 'Plan1' | 'Matnr' | 'Werks' | 'Land1'>) =>
  `${PLAN_SET.ENTRIES}(Plan1=${odataString(e.Plan1)},Matnr=${odataString(e.Matnr)},Werks=${odataString(e.Werks)},Land1=${odataString(e.Land1)})`;

/** PUT of one plan row (the full entity; monthly quantities as decimal strings). */
export async function updatePlanEntry(e: PlanEntry, months: (string | number)[], opts: SapGetOptions = {}) {
  await sapWrite('PUT', entryKeyPath(e), { Plan1: e.Plan1, Matnr: e.Matnr, Werks: e.Werks, Land1: e.Land1, Maktx: e.Maktx, ...monthProps(months) }, opts);
}

export async function deletePlanEntry(e: PlanEntry, opts: SapGetOptions = {}) {
  await sapWrite('DELETE', entryKeyPath(e), undefined, opts);
}

/**
 * Delete that also works when the gateway does not forward DELETE (it answers its own 404, mapped to 501):
 * the plan is saved again with Replace and every row except the deleted one, after a passing check run.
 * The whole plan is read from SAP here (all plants): Replace with only the rows on screen (one plant)
 * would drop every other plant's rows.
 */
export async function deletePlanEntryWithFallback(e: PlanEntry, user: string, opts: SapGetOptions = {}): Promise<'deleted' | 'replaced'> {
  try {
    await deletePlanEntry(e, opts);
    return 'deleted';
  } catch (err) {
    if ((err as { status?: number }).status !== 501) throw err;
  }
  const k = entryKeyPath(e);
  const all = (await fetchPlanEntries(e.Plan1, {}, opts)).rows;
  const keep = all.filter((x) => entryKeyPath(x) !== k).map((x) => ({ plan: x.Plan1, matnr: x.Matnr, werks: x.Werks, land1: x.Land1, months: monthKeys('Mth').map((m) => (x as unknown as Record<string, string>)[m]) }));
  if (!keep.length) throw new Error('This is the last row of the plan, and the SAP gateway does not pass DELETE on yet, so it cannot be removed from here.');
  const check = await uploadPlan(e.Plan1, 'R', true, keep, user, opts);
  if (check.Status === 'E') throw new Error(`SAP refused to rewrite the plan without this row: ${check.MsgTxt || `${check.Errors} errors`}`);
  const save = await uploadPlan(e.Plan1, 'R', false, keep, user, opts);
  if (save.Status !== 'S') throw new Error(`SAP did not save the plan: ${save.MsgTxt || save.Status}`);
  return 'replaced';
}

// ---- local audit log -----------------------------------------------------------------------------
export interface PlanAuditRow { at: string; user: string; plan: string; rows: number; dryrun: boolean; mode: string; status: string; saved: number; errors: number }
const AUDIT_KEY = 'plan:audit';
function audit(r: Omit<PlanAuditRow, 'at'>) {
  try {
    if (typeof localStorage === 'undefined') return;
    const list = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as PlanAuditRow[];
    list.unshift({ at: new Date().toISOString(), ...r });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* storage blocked */
  }
}
export function readPlanAudit(): PlanAuditRow[] {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]') as PlanAuditRow[];
  } catch {
    return [];
  }
}
