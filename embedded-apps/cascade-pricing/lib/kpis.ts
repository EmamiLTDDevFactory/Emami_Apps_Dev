import { priceKey, statusLight, type Row } from './types';

/**
 * Standard cascade-pricing KPIs, all from the row values SAP returns.
 * Shares are % of RRP excl VAT (the consumer price the trade and the company split); the CIF side is converted back
 * to local currency with the rate implied by the row (CIF in local = DLC - duty - C&F - LC charge; fx = that / CIF).
 * Averages are simple (no volumes in the contract).
 */
export const GUARDRAILS = {
  retailMin: 15, retailMax: 30, // retailer margin, % of RRP excl VAT
  distMin: 8, distMax: 15, // distributor margin, % of PTT excl A&P
  realisationMin: 35, // net realisation, % of RRP excl VAT
  apMax: 10, // total A&P, % of RRP excl VAT
  corridorMax: 15, // spread of net billing price across markets for one SKU, %
  expiryDays: 60,
} as const;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface RowMetrics {
  fx: number;
  retailPct: number; distPct: number; distOnPttPct: number; channelPct: number; apPct: number; damagePct: number;
  landingPct: number; landingOnCifPct: number; realisationPct: number; netBilling: number;
}

export function rowMetrics(r: Row): RowMetrics | null {
  const e = n(r.ZE_RRP_PER_PC);
  const cif = n(r.ZCIF);
  if (e <= 0 || cif <= 0) return null;
  const landing = n(r.ZCUS_DUTY) + n(r.ZCF) + n(r.ZLC_CHARGE);
  const cifLocal = n(r.ZDLC) - landing;
  const fx = cifLocal > 0 ? cifLocal / cif : 1;
  const pct = (v: number) => (v / e) * 100;
  return {
    fx,
    retailPct: pct(n(r.ZRETAIL)),
    distPct: pct(n(r.ZDMARGIN)),
    distOnPttPct: n(r.ZPTT_E_AP) > 0 ? (n(r.ZDMARGIN) / n(r.ZPTT_E_AP)) * 100 : 0,
    channelPct: pct(n(r.ZRETAIL) + n(r.ZDMARGIN)),
    apPct: pct(n(r.ZAP_ON_PTT) + n(r.ZAP) * fx),
    damagePct: pct(n(r.ZDAMGE) + n(r.ZDAM_ZDAX) * fx),
    landingPct: pct(landing),
    landingOnCifPct: cifLocal > 0 ? (landing / cifLocal) * 100 : 0,
    realisationPct: pct(n(r.ZCIF_AFTER_AP) * fx),
    netBilling: n(r.ZCIF_AFTER_AP),
  };
}

export interface WaterfallStep { label: string; pct: number; kind: 'trade' | 'investment' | 'landing' | 'net' }
export interface MarketKpi { country: string; currency: string; points: number; realisationPct: number; channelPct: number; landingOnCifPct: number; netBilling: number }
export interface CorridorKpi { matnr: string; maktx: string; markets: number; min: number; max: number; spreadPct: number; currency: string; minMarket: string; maxMarket: string }
export interface Exception { row: Row; reasons: string[] }
export interface ChangeKpi { row: Row; prev: Row; billingPct: number; rrpPct: number }

export interface Kpis {
  points: number; skus: number; markets: number;
  red: number; green: number; conditionPending: number;
  coveragePct: number; mapped: number; materials: number;
  realisationPct: number; channelPct: number; retailPct: number; distOnPttPct: number; apPct: number; landingOnCifPct: number;
  netPerDz: { currency: string; value: number }[];
  waterfall: WaterfallStep[];
  byMarket: MarketKpi[];
  corridor: CorridorKpi[];
  corridorBreaches: number;
  exceptions: Exception[];
  changes: ChangeKpi[];
  avgBillingChangePct: number; increases: number; decreases: number;
  expiringSoon: number;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return Math.round((d(toYmd) - d(fromYmd)) / 86400000);
}

/**
 * @param rows      price points under review (ApprovalSet)
 * @param pending   approved rows waiting for condition creation (ConditionPendingSet)
 * @param history   version history of those price points (COMPARE), any order
 * @param materials CascadeMapSet
 * @param today     YYYYMMDD
 */
export function computeKpis(rows: Row[], pending: Row[], history: Row[], materials: Row[], today: string): Kpis {
  const withM = rows.map((r) => ({ r, m: rowMetrics(r) })).filter((x): x is { r: Row; m: RowMetrics } => x.m !== null);
  const ms = withM.map((x) => x.m);
  const mean = (f: (m: RowMetrics) => number) => avg(ms.map(f));

  const tradeRetail = mean((m) => m.retailPct);
  const waterfall: WaterfallStep[] = [
    { label: 'Retailer margin', pct: tradeRetail, kind: 'trade' },
    { label: 'Distributor margin', pct: mean((m) => m.distPct), kind: 'trade' },
    { label: 'A&P (trade + CIF)', pct: mean((m) => m.apPct), kind: 'investment' },
    { label: 'Damage / expiry', pct: mean((m) => m.damagePct), kind: 'investment' },
    { label: 'Duty, C&F, LC charge', pct: mean((m) => m.landingPct), kind: 'landing' },
    { label: 'Net realisation', pct: mean((m) => m.realisationPct), kind: 'net' },
  ];

  const byCountry = new Map<string, { r: Row; m: RowMetrics }[]>();
  withM.forEach((x) => { const k = String(x.r.S_LAND1 ?? ''); byCountry.set(k, [...(byCountry.get(k) ?? []), x]); });
  const byMarket: MarketKpi[] = [...byCountry.entries()].map(([country, xs]) => ({
    country, currency: String(xs[0].r.L_WAERK ?? ''), points: xs.length,
    realisationPct: avg(xs.map((x) => x.m.realisationPct)), channelPct: avg(xs.map((x) => x.m.channelPct)),
    landingOnCifPct: avg(xs.map((x) => x.m.landingOnCifPct)), netBilling: avg(xs.map((x) => x.m.netBilling)),
  })).sort((a, b) => b.realisationPct - a.realisationPct);

  // Latest version per price point, then the spread of the net billing price per SKU (same billing currency).
  const latest = new Map<string, { r: Row; m: RowMetrics }>();
  withM.forEach((x) => { const k = priceKey(x.r); const cur = latest.get(k); if (!cur || n(x.r.ZVERSION) > n(cur.r.ZVERSION)) latest.set(k, x); });
  const bySku = new Map<string, { r: Row; m: RowMetrics }[]>();
  [...latest.values()].forEach((x) => { const k = `${x.r.MATNR}|${x.r.B_WAERK}`; bySku.set(k, [...(bySku.get(k) ?? []), x]); });
  const corridor: CorridorKpi[] = [...bySku.values()].filter((xs) => xs.length > 1).map((xs) => {
    const sorted = [...xs].sort((a, b) => a.m.netBilling - b.m.netBilling);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    return { matnr: String(lo.r.MATNR), maktx: String(lo.r.MAKTX ?? ''), markets: xs.length, min: lo.m.netBilling, max: hi.m.netBilling, spreadPct: lo.m.netBilling > 0 ? ((hi.m.netBilling - lo.m.netBilling) / lo.m.netBilling) * 100 : 0, currency: String(lo.r.B_WAERK ?? ''), minMarket: String(lo.r.S_LAND1), maxMarket: String(hi.r.S_LAND1) };
  }).sort((a, b) => b.spreadPct - a.spreadPct);

  const g = GUARDRAILS;
  const exceptions: Exception[] = withM.map(({ r, m }) => {
    const reasons: string[] = [];
    if (m.retailPct < g.retailMin || m.retailPct > g.retailMax) reasons.push(`Retailer margin ${m.retailPct.toFixed(1)}% (${g.retailMin}-${g.retailMax}%)`);
    if (m.distOnPttPct < g.distMin || m.distOnPttPct > g.distMax) reasons.push(`Distributor margin ${m.distOnPttPct.toFixed(1)}% of PTT (${g.distMin}-${g.distMax}%)`);
    if (m.realisationPct < g.realisationMin) reasons.push(`Net realisation ${m.realisationPct.toFixed(1)}% (min ${g.realisationMin}%)`);
    if (m.apPct > g.apMax) reasons.push(`A&P ${m.apPct.toFixed(1)}% (max ${g.apMax}%)`);
    return { row: r, reasons };
  }).filter((x) => x.reasons.length > 0);

  // Each row against the previous version of the same price point.
  const hist = new Map<string, Row[]>();
  history.forEach((h) => { const k = priceKey(h); hist.set(k, [...(hist.get(k) ?? []), h]); });
  const changes: ChangeKpi[] = [];
  rows.forEach((r) => {
    const prev = (hist.get(priceKey(r)) ?? []).filter((h) => n(h.ZVERSION) < n(r.ZVERSION)).sort((a, b) => n(b.ZVERSION) - n(a.ZVERSION))[0];
    if (!prev || n(prev.ZCIF_AFTER_AP) <= 0 || n(prev.ZI_RRP_PER_PC) <= 0) return;
    changes.push({ row: r, prev, billingPct: ((n(r.ZCIF_AFTER_AP) - n(prev.ZCIF_AFTER_AP)) / n(prev.ZCIF_AFTER_AP)) * 100, rrpPct: ((n(r.ZI_RRP_PER_PC) - n(prev.ZI_RRP_PER_PC)) / n(prev.ZI_RRP_PER_PC)) * 100 });
  });
  changes.sort((a, b) => Math.abs(b.billingPct) - Math.abs(a.billingPct));

  const perDz = new Map<string, number[]>();
  ms.forEach((m, i) => { const c = String(withM[i].r.B_WAERK ?? ''); perDz.set(c, [...(perDz.get(c) ?? []), m.netBilling * 12]); });
  const mapped = materials.filter((m) => String(m.CASCADE_DESC ?? '').trim() !== '').length;
  const expiringSoon = [...rows, ...pending].filter((r) => /^\d{8}$/.test(String(r.VALIDTO ?? '')) && String(r.VALIDTO) >= today && daysBetween(today, String(r.VALIDTO)) <= g.expiryDays).length;

  return {
    points: rows.length, skus: new Set(rows.map((r) => r.MATNR)).size, markets: new Set(rows.map((r) => r.S_LAND1)).size,
    red: rows.filter((r) => statusLight(r) === '1').length, green: rows.filter((r) => statusLight(r) === '3').length, conditionPending: pending.length,
    coveragePct: materials.length ? (mapped / materials.length) * 100 : 0, mapped, materials: materials.length,
    realisationPct: mean((m) => m.realisationPct), channelPct: mean((m) => m.channelPct), retailPct: tradeRetail, distOnPttPct: mean((m) => m.distOnPttPct),
    apPct: mean((m) => m.apPct), landingOnCifPct: mean((m) => m.landingOnCifPct),
    netPerDz: [...perDz.entries()].map(([currency, xs]) => ({ currency, value: avg(xs) })),
    waterfall, byMarket, corridor, corridorBreaches: corridor.filter((c) => c.spreadPct > g.corridorMax).length,
    exceptions, changes, avgBillingChangePct: avg(changes.map((c) => c.billingPct)),
    increases: changes.filter((c) => c.billingPct > 0.005).length, decreases: changes.filter((c) => c.billingPct < -0.005).length,
    expiringSoon,
  };
}
