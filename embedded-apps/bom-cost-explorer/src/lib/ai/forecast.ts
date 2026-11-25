/**
 * Rate outlook of a material from its monthly purchase history (the Avg base price breakup): plain statistics, no model. A SUGGESTION for a person to
 * review, never written anywhere. Monthly rate = value / quantity of the month; trend = least squares line over the last 12 months with data;
 * outlook = the 6-month weighted average moved by the trend for the horizon, the move capped at +-10 %; range = +-1 standard deviation of the monthly rates.
 */
export interface MonthPoint { month: string; qty: number; value: number; avg: number | null }
export interface RateOutlook {
  months: number; enough: boolean;
  latest: number | null; avg3: number | null; avg6: number | null; avg12: number | null;
  /** trend in percent of the average per month (null when under 3 months) */
  slopePctPerMonth: number | null;
  volatilityPct: number | null;
  horizon: number;
  outlook: number | null; low: number | null; high: number | null;
  reason: string;
}
const wavg = (p: MonthPoint[]): number | null => { const q = p.reduce((a, x) => a + x.qty, 0); return q > 0 ? p.reduce((a, x) => a + x.value, 0) / q : null; };

export function rateOutlook(byMonth: MonthPoint[], horizon = 6): RateOutlook {
  const pts = byMonth.filter((m) => /^\d{4}-\d{2}$/.test(m.month) && m.qty > 0 && m.avg !== null).sort((a, b) => a.month.localeCompare(b.month));
  const last = (n: number) => pts.slice(-n);
  const base: RateOutlook = { months: pts.length, enough: pts.length >= 3, latest: pts.length ? pts[pts.length - 1].avg : null, avg3: wavg(last(3)), avg6: wavg(last(6)), avg12: wavg(last(12)), slopePctPerMonth: null, volatilityPct: null, horizon, outlook: null, low: null, high: null, reason: '' };
  if (pts.length < 3) return { ...base, reason: `Only ${pts.length} month(s) of purchases: a trend needs at least 3.` };
  const y = last(12).map((m) => m.avg as number);
  const n = y.length, xm = (n - 1) / 2, ym = y.reduce((a, v) => a + v, 0) / n;
  let sxy = 0, sxx = 0;
  y.forEach((v, i) => { sxy += (i - xm) * (v - ym); sxx += (i - xm) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const slopePct = ym ? (slope / ym) * 100 : 0;
  const sd = Math.sqrt(y.reduce((a, v) => a + (v - ym) ** 2, 0) / n);
  const avg6 = base.avg6 ?? ym;
  const move = Math.max(-0.1, Math.min(0.1, (slopePct * horizon) / 100));
  const outlook = avg6 * (1 + move);
  return { ...base, slopePctPerMonth: slopePct, volatilityPct: ym ? (sd / ym) * 100 : null, outlook, low: Math.max(0, outlook - sd), high: outlook + sd, reason: Math.abs((slopePct * horizon) / 100) > 0.1 ? 'The trend move was capped at 10 %.' : '' };
}
