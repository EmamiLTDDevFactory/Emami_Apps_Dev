/** Calendar days as local YYYY-MM-DD strings (never toISOString: that would shift the day by the time zone). */
export const toDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type WacPreset = 'lastMonth' | 'thisMonth' | 'last7' | 'last30' | 'custom';

export const PRESET_LABEL: Record<WacPreset, string> = {
  lastMonth: 'Last full month', thisMonth: 'This month', last7: 'Last 7 days', last30: 'Last 30 days', custom: 'Custom',
};

/** from / to of a preset for "today" (custom keeps whatever was typed, so it returns null). */
export function presetRange(p: WacPreset, now: Date = new Date()): { from: string; to: string } | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case 'lastMonth': return { from: toDay(new Date(y, m - 1, 1)), to: toDay(new Date(y, m, 0)) };
    case 'thisMonth': return { from: toDay(new Date(y, m, 1)), to: toDay(now) };
    case 'last7': return { from: toDay(new Date(y, m, now.getDate() - 6)), to: toDay(now) };
    case 'last30': return { from: toDay(new Date(y, m, now.getDate() - 29)), to: toDay(now) };
    default: return null;
  }
}
