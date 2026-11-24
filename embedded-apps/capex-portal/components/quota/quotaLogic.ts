/** Pure logic for Unit Quota (UnitQuota/QuotaItemDetail controllers + Component.rollupQuotaByUnit; log #6 #80 #93). */
import type { QuotaItem, QuotaSummary } from '@/lib/entities';
import { fyDigits, isStatus, num } from '@/lib/format';
import { DEFAULT_QUOTA_SINGLE_CAP, DEFAULT_QUOTA_YEAR_CAP, checkQuota, yearCapFor, type QuotaCaps } from '@/lib/rules';

/** ConfigSet -> caps: QUOTA_YEAR_CAP, QUOTA_SINGLE_CAP and every QUOTA_YEAR_CAP_<WERKS> (Component._loadLiveQuotaCaps). Defaults 2,00,000 / 50,000. */
export function capsFromConfig(config: Record<string, string>): Required<QuotaCaps> {
  const n = (k: string, d: number) => (config[k] !== undefined && config[k] !== '' ? Number(config[k]) || d : d);
  const plantCaps: Record<string, number> = {};
  Object.keys(config).forEach((k) => {
    if (k.startsWith('QUOTA_YEAR_CAP_')) plantCaps[k.slice('QUOTA_YEAR_CAP_'.length)] = Number(config[k]) || 0;
  });
  return { yearCap: n('QUOTA_YEAR_CAP', DEFAULT_QUOTA_YEAR_CAP), singleCap: n('QUOTA_SINGLE_CAP', DEFAULT_QUOTA_SINGLE_CAP), plantCaps };
}

export interface UnitRow { werks: string; plantName: string; used: number; reserved: number; count: number; cap: number; remaining: number }

/**
 * Per-unit consumption for a fiscal year. Prefers QuotaSummarySet (live shape: Used/Reserved/Itemcount/Yearcap/Remaining);
 * a plant missing there is rolled up from its APPROVED items as Fiori did. The cap is the row's own Yearcap, else the plant/default cap.
 */
export function rollupUnits(summary: QuotaSummary[], items: QuotaItem[], caps: QuotaCaps, fiscalYear: string): UnitRow[] {
  const fy = fyDigits(fiscalYear);
  const inFy = (v: string) => !fy || fyDigits(v) === fy;
  const out = new Map<string, UnitRow>();
  summary.filter((s) => inFy(s.Fiscalyear)).forEach((s) => {
    const cap = num(s.Yearcap) || yearCapFor(caps, s.Werks);
    const used = num(s.Used);
    out.set(s.Werks, { werks: s.Werks, plantName: s.PlantName || s.Werks, used, reserved: num(s.Reserved), count: Number(s.Itemcount) || 0, cap, remaining: s.Remaining !== undefined && s.Remaining !== '' ? num(s.Remaining) : Math.max(0, cap - used) });
  });
  items.filter((i) => inFy(i.Fiscalyear) && isStatus(i.Status, 'APPROVED')).forEach((i) => {
    if (out.has(i.Werks)) return;
    const row = out.get('~' + i.Werks) ?? { werks: i.Werks, plantName: i.PlantName || i.Werks, used: 0, reserved: 0, count: 0, cap: yearCapFor(caps, i.Werks), remaining: 0 };
    row.used += num(i.Amount); row.count += 1; row.remaining = Math.max(0, row.cap - row.used);
    out.set('~' + i.Werks, row);
  });
  return [...out.values()].sort((a, b) => a.plantName.localeCompare(b.plantName));
}

export const usedPct = (r: Pick<UnitRow, 'used' | 'cap'>) => (r.cap ? Math.min(100, (r.used / r.cap) * 100) : 0);
/** formatQuotaState: >= 90% error, >= 70% warning, else success. */
export function usedTone(r: Pick<UnitRow, 'used' | 'cap'>): 'error' | 'warning' | 'success' {
  const p = r.cap ? (r.used / r.cap) * 100 : 0;
  return p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success';
}

export interface QuotaDraft { plant: string; title: string; amount: string; justification: string }

/** UnitQuota.onQuotaCheck/onQuotaSubmit: live check message (null while no amount) through lib/rules.checkQuota. */
export function quotaCheck(draft: QuotaDraft, units: UnitRow[], caps: QuotaCaps): { ok: boolean; reason: string; remainingAfter: number } | null {
  const amt = num(draft.amount);
  if (!(amt > 0)) return null;
  const unit = units.find((u) => u.werks === draft.plant);
  const used = unit?.used ?? 0;
  const r = checkQuota(used, amt, caps, draft.plant);
  const cap = unit?.cap ?? yearCapFor(caps, draft.plant);
  return { ...r, remainingAfter: cap - used - amt };
}

/** UnitQuota.onQuotaSubmit validation messages. */
export function validateQuota(d: QuotaDraft, units: UnitRow[], caps: QuotaCaps): string[] {
  const e: string[] = [];
  if (!d.plant) e.push('Select the unit.');
  if (!d.title.trim()) e.push('Description is required.');
  if (!(num(d.amount) > 0)) e.push('Amount must be greater than zero.');
  if (!d.justification.trim()) e.push('Justification is required.');
  const unit = units.find((u) => u.werks === d.plant);
  const c = checkQuota(unit?.used ?? 0, num(d.amount), caps, d.plant);
  if (!c.ok) e.push(c.reason);
  return e;
}

export const isQuotaPending = (s: string | undefined) => !isStatus(s, 'APPROVED') && !isStatus(s, 'REJECTED');
