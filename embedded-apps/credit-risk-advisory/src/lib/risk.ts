import type { AdvisoryResult, Advisory, Customer } from '../types';

/** Deterministic credit-risk scoring — ported verbatim (same formula/weights) from the source
 * prototype's apps/api/src/risk.ts `deterministicRisk`. That project ran this server-side inside
 * a LangGraph node (policy -> explain); this app has no server of its own (every embedded app in
 * this monorepo calls SAP directly from the browser), so the deterministic policy step runs
 * client-side here and the "explain" step is a plain template string instead of an LLM call — the
 * source project's own LLM_PROVIDER defaulted to "mock" anyway, so this produces the exact same
 * kind of explanation the prototype did out of the box. */
export function deterministicRisk(c: Customer): AdvisoryResult {
  const exposure = c.outstanding + c.openOrder + c.openDelivery + c.pgi + c.billing;
  const utilization = exposure / c.limit;
  const score = Math.min(
    100,
    Math.round(
      utilization * 35 +
        (c.avgDelay / 45) * 20 +
        ((100 - c.onTime) / 100) * 18 +
        (c.overdue / Math.max(c.outstanding, 1)) * 17 +
        (c.returns / 10) * 5 +
        (c.secondaryTrend < 0 ? 5 : 0)
    )
  );
  const band = score >= 80 ? 'Critical' : score >= 65 ? 'High' : score >= 45 ? 'Medium' : 'Low';
  const hardStops: string[] = [];
  if (utilization > 1.15) hardStops.push('Exposure exceeds 115% of credit limit');
  if (c.avgDelay > 45) hardStops.push('Average payment delay exceeds 45 days');
  const recommendation = hardStops.length
    ? 'Hold / Escalate'
    : score >= 80
      ? 'Escalate'
      : score >= 65
        ? 'Conditional Release'
        : score >= 45
          ? 'Partial Release'
          : 'Full Release';
  return { exposure, utilization, score, band, hardStops, recommendation };
}

/** Same shape the source project's LangGraph "explain" node produced — a deterministic advisory
 * explanation and confidence (0.99 when a hard stop fired, 0.86 otherwise), never a real LLM
 * call. */
export function advise(customer: Customer): Advisory {
  const result = deterministicRisk(customer);
  const confidence = result.hardStops.length ? 0.99 : 0.86;
  const explanation = `${result.recommendation} because utilization is ${(result.utilization * 100).toFixed(1)}%, overdue is ₹${customer.overdue.toLocaleString('en-IN')}, average delay is ${customer.avgDelay} days and on-time payment is ${customer.onTime}%. Human approval and current SAP revalidation are required.`;
  return { result, explanation, confidence };
}

/** Portfolio-analytics-only shortcut (band without the full advisory) — matches the source
 * project's own PortfolioAnalytics.tsx `band()` helper, which computed just the band inline
 * rather than calling the full advisory for every customer in a chart. */
export function riskBand(c: Customer): AdvisoryResult['band'] {
  return deterministicRisk(c).band;
}
