/**
 * Maintenance (Admin Console): CAPEX users and plants, DOA rules and approval chains, SLA / quota settings.
 * Who may use it is decided in Emami Apps (Admin role of the CAPEX Portal app, Admin Center) - NOT by the SAP IsAdmin flag.
 * The data still lives in SAP (ZCAPEX_USER / ZCAPEX_USRPLT / ZCAPEX_DOA / ZCAPEX_DOACHN / ZCAPEX_CONFIG), so the Fiori app
 * sees every change at once. Lists come from AdminDataSet (one JSON row per list), saves go through the AdminSave function.
 */
import { fn, isOk, list, ApiError } from './api';
import { fmtInr } from './format';
import type { DoaRuleLike } from './rules';

export interface AdminUser {
  userid: string; fullname: string; email: string; role: string; unit: string;
  isAdmin: boolean; isGlobal: boolean; active: boolean; plants: string[];
}
export interface AdminStep { role: string; approver: string; slaDays: number; mandatory: boolean; evalReq: boolean }
export interface AdminDoa {
  /** blank = a new rule (SAP picks the next D<n>) */
  doaid: string; capextype: string; doctype: string; amountFrom: number; amountTo: number;
  waers: string; rangeText: string; active: boolean; validFrom: string; validTo: string; chain: AdminStep[];
}

const flag = (v: unknown) => v === 'X' || v === true;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/** SAP drops blank / zero values from the JSON, so every field is defaulted here. */
export function normalizeUser(r: Record<string, unknown>): AdminUser {
  return {
    userid: str(r.userid), fullname: str(r.fullname), email: str(r.email), role: str(r.role), unit: str(r.unit),
    isAdmin: flag(r.isAdmin), isGlobal: flag(r.isGlobal), active: flag(r.active),
    plants: Array.isArray(r.plants) ? r.plants.map(str).filter(Boolean) : [],
  };
}
export function normalizeDoa(r: Record<string, unknown>): AdminDoa {
  const chain = (Array.isArray(r.chain) ? r.chain : []) as Record<string, unknown>[];
  return {
    doaid: str(r.doaid), capextype: str(r.capextype), doctype: str(r.doctype),
    amountFrom: Number(r.amountFrom) || 0, amountTo: Number(r.amountTo) || 0, waers: str(r.waers) || 'INR', rangeText: str(r.rangeText),
    active: flag(r.active), validFrom: str(r.validFrom), validTo: str(r.validTo),
    chain: chain.slice().sort((a, b) => (Number(a.seqnr) || 0) - (Number(b.seqnr) || 0)).map((s) => ({
      role: str(s.role), approver: str(s.approver), slaDays: Number(s.slaDays) || 0, mandatory: flag(s.mandatory), evalReq: flag(s.evalReq),
    })),
  };
}

/** Read one maintenance list. */
export async function loadAdmin<T>(kind: 'USERS' | 'DOA', normalize: (r: Record<string, unknown>) => T): Promise<T[]> {
  const { rows } = await list<{ Json?: string }>('AdminDataSet', { $filter: `Kind eq '${kind}'` });
  const text = rows[0]?.Json || '[]';
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new ApiError('SAP sent an unreadable maintenance list.', 502); }
  return (Array.isArray(parsed) ? parsed : []).map((r) => normalize(r as Record<string, unknown>));
}

const X = (b: boolean) => (b ? 'X' : '');

/** Save one row. SAP re-validates everything and answers with its own message. */
export async function saveUser(u: AdminUser): Promise<string> {
  const body = { userid: u.userid.trim().toUpperCase(), fullname: u.fullname.trim(), email: u.email.trim(), role: u.role.trim(), unit: u.unit.trim().toUpperCase(),
    isAdmin: X(u.isAdmin), isGlobal: X(u.isGlobal), active: X(u.active), plants: u.plants.map((p) => p.trim().toUpperCase()).filter(Boolean) };
  return runSave('USER', body);
}
export async function saveDoa(d: AdminDoa): Promise<string> {
  const body: Record<string, unknown> = {
    doaid: d.doaid.trim().toUpperCase(), capextype: d.capextype.trim(), doctype: d.doctype, amountFrom: d.amountFrom, amountTo: d.amountTo,
    waers: d.waers || 'INR', rangeText: d.rangeText.trim(), active: X(d.active),
    chain: d.chain.map((s, i) => ({ seqnr: i + 1, role: s.role.trim(), approver: s.approver.trim().toUpperCase(), slaDays: s.slaDays, mandatory: X(s.mandatory), evalReq: X(s.evalReq) })),
  };
  if (d.validFrom) body.validFrom = d.validFrom;
  if (d.validTo) body.validTo = d.validTo;
  return runSave('DOA', body);
}
export const saveConfig = (param: string, value: string): Promise<string> => runSave('CONFIG', { param, value });

async function runSave(kind: string, body: unknown): Promise<string> {
  const r = await fn('AdminSave', { Kind: kind, Json: JSON.stringify(body) });
  if (!isOk(r)) throw new ApiError(String(r?.Message || 'SAP did not accept the change.'), 422);
  return String(r.Message || 'Saved.');
}

/** Same checks as SAP (which stays the final judge), so the form can point at the problem before the round trip. */
export function validateUser(u: AdminUser, isNew: boolean, all: AdminUser[]): string {
  if (!u.userid.trim() || !u.fullname.trim() || !u.email.trim() || !u.role.trim()) return 'User ID, name, e-mail and role are required.';
  if (!/^\S+@\S+\.\S+$/.test(u.email.trim())) return 'Enter a valid e-mail address.';
  const id = u.userid.trim().toUpperCase();
  if (isNew && all.some((x) => x.userid.toUpperCase() === id)) return `User ID ${id} already exists. Open it from the list to change it.`;
  if (u.active) {
    const clash = all.find((x) => x.active && x.userid.toUpperCase() !== id && x.email.trim().toLowerCase() === u.email.trim().toLowerCase());
    if (clash) return `E-mail ${u.email.trim()} already belongs to the active user ${clash.userid}. A login must match exactly one active user.`;
  }
  if (!u.isGlobal && !u.plants.length) return 'Pick at least one plant, or tick "All plants".';
  return '';
}
export function validateDoa(d: AdminDoa, all: AdminDoa[]): string {
  if (!d.capextype.trim()) return 'CAPEX type is required (use * for all types).';
  if (d.active && d.doctype !== 'CPE' && d.doctype !== 'BUD') return 'Pick the document type (CPE or Budget). The approval engine matches on it.';
  if (d.amountFrom < 0 || d.amountTo < d.amountFrom) return 'The upper amount must be at least the lower amount.';
  if (d.validFrom && d.validTo && d.validTo < d.validFrom) return 'Valid to cannot be before valid from.';
  if (!d.chain.length) return 'Add at least one approval step.';
  if (d.chain.some((s) => !s.role.trim())) return 'Every approval step needs a role.';
  if (d.active) {
    const clash = all.find((x) => x.active && x.doaid !== d.doaid && x.capextype === d.capextype && x.doctype === d.doctype
      && (!x.validTo || !d.validFrom || x.validTo >= d.validFrom) && (!d.validTo || !x.validFrom || d.validTo >= x.validFrom)
      && d.amountFrom <= x.amountTo && x.amountFrom <= d.amountTo);
    if (clash) return `Rule ${clash.doaid} already covers part of this amount range for the same CAPEX type and document type.`;
  }
  return '';
}

export const rangeLabel = (d: Pick<AdminDoa, 'amountFrom' | 'amountTo' | 'rangeText'>): string =>
  d.rangeText || `${fmtInr(d.amountFrom)} - ${d.amountTo ? fmtInr(d.amountTo) : 'no limit'}`;

/** Shape the routing simulator already understands. */
export function toRuleLike(d: AdminDoa): DoaRuleLike {
  return {
    Doaid: d.doaid, Capextype: d.capextype, Doctype: d.doctype, AmountFrom: d.amountFrom, AmountTo: d.amountTo, Active: d.active ? 'X' : '', RangeText: d.rangeText,
    chain: d.chain.map((s, i) => ({ Doaid: d.doaid, Seqnr: String(i + 1), Role: s.role, Approver: s.approver, Mandatory: s.mandatory ? 'X' : '', SlaDays: s.slaDays })),
  };
}

/** The SLA / quota settings the console edits (everything else in ConfigSet is technical and stays in SAP). */
export const SLA_PARAMS = ['SLA_WARN_DAYS', 'SLA_BREACH_DAYS', 'SLA_AUTO_ESCALATE'] as const;
