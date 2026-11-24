/** Pure logic for Installation Certificates / Capitalization (ICDetail, ICList, Capitalization controllers; log #4 #7 #24 #25 #26 #35). */
import type { CwipAgeing, InstallCert } from '@/lib/entities';
import { isStatus, num, toSapDate } from '@/lib/format';

export const PHOTO_LABELS = ['Installed equipment', 'Nameplate / serial number', 'Equipment in operation'] as const;
/** InstallCert.TechSignoff is MaxLength 12 on the live service (log #26). */
export const TECH_SIGNOFF_MAX = 12;
export const PHOTO_RULE_NOTE = 'Commissioning photos: JPG, JPEG or PNG only, up to 10 MB each; three are mandatory.';
export const DEFAULT_CWIP_OVERDUE_DAYS = 45;

export interface IcDraft {
  cwipid: string; cpeid: string; anlkl: string; kostl: string; ebeln: string; mblnr: string; title: string; werks: string;
  commissionDt: string; techSignoff: string; remarks: string;
  equipCost: string; freightCost: string; installCost: string;
}

export const totalCost = (d: Pick<IcDraft, 'equipCost' | 'freightCost' | 'installCost'>) => num(d.equipCost) + num(d.freightCost) + num(d.installCost);

/** ICDetail._validate. Photo count (saved + picked) is enforced on Save and Approve. */
export function validateIc(d: IcDraft, photoCount: number, enforcePhotos: boolean): { errors: string[]; fields: Partial<Record<keyof IcDraft, string>> } {
  const errors: string[] = [];
  const fields: Partial<Record<keyof IcDraft, string>> = {};
  if (!d.commissionDt) { errors.push('Commissioning date is required.'); fields.commissionDt = 'Required'; }
  if (!d.techSignoff.trim()) { errors.push('Technical sign-off name is required.'); fields.techSignoff = 'Required'; }
  if (!(num(d.equipCost) > 0)) { errors.push('Equipment cost must be greater than zero.'); fields.equipCost = 'Must be greater than zero'; }
  if (enforcePhotos && photoCount < 3) errors.push('All three commissioning photographs are mandatory.');
  return { errors, fields };
}

/** ICDetail._buildIcPayload. Decimals to 3dp (metadata scale), dates as /Date(ms)/, TechSignoff cut to 12. */
export function buildIcPayload(d: IcDraft, photoCount: number, now = new Date()): Record<string, string | number> {
  const money = (v: string) => num(v).toFixed(3);
  return {
    Cwipid: d.cwipid, Cpeid: d.cpeid, Anlkl: d.anlkl, Ebeln: d.ebeln, Kostl: d.kostl, Mblnr: d.mblnr,
    Title: d.title, Werks: d.werks,
    CommissionDt: toSapDate(d.commissionDt),
    PhotoCount: photoCount,
    Status: 'PENDING',
    EquipCost: money(d.equipCost), FreightCost: money(d.freightCost), InstallCost: money(d.installCost),
    TotalCost: totalCost(d).toFixed(3),
    Waers: 'INR',
    TechSignoff: d.techSignoff.trim().slice(0, TECH_SIGNOFF_MAX),
    TechSignDt: toSapDate(now),
    Remarks: d.remarks,
  };
}

export const isPending = (s: string | undefined) => isStatus(s, 'PENDING');
export const isCapitalized = (s: string | undefined) => isStatus(s, 'CAPITALIZED');
export const isFinanceRole = (role: string) => /finance/i.test(role || '');

/** ICDetail._loadExisting: Finance (or admin) approves; everybody else edits while PENDING. */
export function icPermissions(status: string, role: string, isAdmin: boolean) {
  const fin = isFinanceRole(role);
  return { editable: isPending(status) && !fin, canApprove: isPending(status) && (fin || isAdmin) };
}

/** Photo slot i (0-2) from DocumentSet-style rows with Category PHOTO1/2/3. */
export function photoSlots(docs: { Category?: string; Filename?: string; DocTitle?: string }[]): { label: string; name: string; uploaded: boolean }[] {
  return PHOTO_LABELS.map((label, i) => {
    const d = docs.find((x) => x.Category === 'PHOTO' + (i + 1));
    return { label, name: d ? d.DocTitle || d.Filename || '' : '', uploaded: !!d };
  });
}

export function icSearch(rows: InstallCert[], q: string): InstallCert[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => [r.Icid, r.Cpeid, r.Title].some((v) => (v || '').toLowerCase().includes(s)));
}

export interface CapSummary { count: number; value: number; avgAge: number; overdue: number }
export function capSummary(rows: Pick<CwipAgeing, 'Amount' | 'AgeDays'>[], overdueDays: number): CapSummary {
  const value = rows.reduce((s, r) => s + num(r.Amount), 0);
  const age = rows.reduce((s, r) => s + (Number(r.AgeDays) || 0), 0);
  return { count: rows.length, value, avgAge: rows.length ? Math.round(age / rows.length) : 0, overdue: rows.filter((r) => Number(r.AgeDays) > overdueDays).length };
}

export const overdueRows = <T extends Pick<CwipAgeing, 'AgeDays'>>(rows: T[], overdueDays: number) => rows.filter((r) => Number(r.AgeDays) > overdueDays);

/** Capitalization.formatIcStatus. */
export function icStatusText(s: string | undefined): string {
  const m: Record<string, string> = { PENDING: 'IC Pending', NOT_STARTED: 'IC Not Started', CAPITALIZED: 'Capitalized' };
  return m[(s || '').toUpperCase()] || s || '-';
}

/** CwipAgeing.Risk holds a UI5 ValueState name. */
export function riskTone(r: string | undefined): 'error' | 'warning' | 'success' | 'neutral' {
  const k = (r || '').toLowerCase();
  return k === 'error' ? 'error' : k === 'warning' ? 'warning' : k === 'success' ? 'success' : 'neutral';
}
