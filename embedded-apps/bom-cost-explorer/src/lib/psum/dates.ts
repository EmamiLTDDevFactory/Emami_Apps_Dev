import { toDay } from '../wac/dates';

export type PsumPreset = 'full6' | 'full3' | 'full12' | 'td6' | 'custom';
export const PSUM_PRESET_LABEL: Record<PsumPreset, string> = {
  full6: 'Last 6 full months', full3: 'Last 3 full months', full12: 'Last 12 full months', td6: '6 months to date', custom: 'Custom',
};

/** from / to of a preset for "today": the "full" presets end on the last day of the previous month; "6 months to date" starts on the
 * 1st of the month five months back and ends today (so it is six calendar months, the last one partial). */
export function psumRange(p: PsumPreset, now: Date = new Date()): { from: string; to: string } | null {
  const y = now.getFullYear(), m = now.getMonth();
  const full = (n: number) => ({ from: toDay(new Date(y, m - n, 1)), to: toDay(new Date(y, m, 0)) });
  switch (p) {
    case 'full6': return full(6);
    case 'full3': return full(3);
    case 'full12': return full(12);
    case 'td6': return { from: toDay(new Date(y, m - 5, 1)), to: toDay(now) };
    default: return null;
  }
}

export interface MonthSlice { key: string; label: string; from: string; to: string }
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

/** The calendar months inside [from, to], the first and last clipped to the range. */
export function monthSlices(from: string, to: string): MonthSlice[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return [];
  const a = parse(from), b = parse(to);
  const out: MonthSlice[] = [];
  for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d <= b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const first = toDay(d), last = toDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    out.push({ key: first.slice(0, 7), label: `${MON[d.getMonth()]} ${d.getFullYear()}`, from: first < from ? from : first, to: last > to ? to : last });
  }
  return out;
}
