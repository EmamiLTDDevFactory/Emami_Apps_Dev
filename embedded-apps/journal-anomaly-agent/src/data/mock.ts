import type { CaseRecord, CompanyCodeOption, Explanation, Summary, WorklistEntry } from '../types';

// ---------------------------------------------------------------------------
// Demo dataset — ported from the source project's own db/seeds/001_seed.sql and its frontend
// fallback values (apps/web/src/api.ts's fallbackEntries, pages.tsx's hardcoded KPI numbers).
// Shown whenever ZJE_ANOMALY_SRV isn't reachable (see src/lib/sapClient.ts's SAP_CONFIGURED
// guard) — every screen is fully demonstrable against this realistic population.
// ---------------------------------------------------------------------------

export const worklist: WorklistEntry[] = [
  { document: '1900008472', companyCode: '1000', fiscalYear: '2026', period: 9, userName: 'FI_CLOSE01', glPair: '510100 / 299900', amount: '₹2.50 Cr', risk: 'Critical', score: 94, signal: 'After-hours + rare GL pair', scoredAt: '2026-09-07T02:41:00Z' },
  { document: '1900008521', companyCode: '1000', fiscalYear: '2026', period: 9, userName: 'CONTROLLER2', glPair: '420400 / 219500', amount: '₹1.84 Cr', risk: 'Critical', score: 89, signal: 'Trade scheme accrual spike', scoredAt: '2026-09-07T01:55:00Z' },
  { document: '2100003318', companyCode: '1010', fiscalYear: '2026', period: 9, userName: 'DUB_FI03', glPair: '610200 / 299900', amount: 'AED 620K', risk: 'High', score: 82, signal: 'Missing evidence + round amount', scoredAt: '2026-09-07T01:10:00Z' },
  { document: '1900008499', companyCode: '1000', fiscalYear: '2026', period: 9, userName: 'FI_USER07', glPair: '510100 / 210100', amount: '₹98.4 L', risk: 'High', score: 78, signal: 'Round amount + suspense GL', scoredAt: '2026-09-06T23:47:00Z' },
  { document: '1900008556', companyCode: '1000', fiscalYear: '2026', period: 9, userName: 'TRADE_AP01', glPair: '420400 / 219500', amount: '₹76.1 L', risk: 'High', score: 74, signal: 'Trade scheme accrual spike', scoredAt: '2026-09-06T22:30:00Z' },
  { document: '2100003342', companyCode: '1010', fiscalYear: '2026', period: 9, userName: 'DUB_FI03', glPair: '610200 / 210100', amount: 'AED 410K', risk: 'Medium', score: 66, signal: 'Unusual posting time', scoredAt: '2026-09-06T20:05:00Z' },
  { document: '1900008601', companyCode: '1020', fiscalYear: '2026', period: 8, userName: 'LOG_FI02', glPair: '610200 / 210100', amount: '₹54.3 L', risk: 'Medium', score: 61, signal: 'Missing text/reference', scoredAt: '2026-09-05T18:20:00Z' },
  { document: '1900008610', companyCode: '1000', fiscalYear: '2026', period: 8, userName: 'FI_USER07', glPair: '510100 / 299900', amount: '₹44.9 L', risk: 'Medium', score: 58, signal: 'Rare GL pair', scoredAt: '2026-09-05T16:40:00Z' },
  { document: '1900008632', companyCode: '1020', fiscalYear: '2026', period: 8, userName: 'LOG_FI02', glPair: '610200 / 210100', amount: '₹38.2 L', risk: 'Medium', score: 52, signal: 'Posting burst', scoredAt: '2026-09-05T14:15:00Z' },
  { document: '1900008701', companyCode: '1000', fiscalYear: '2026', period: 8, userName: 'FI_CLOSE01', glPair: '420400 / 219500', amount: '₹21.7 L', risk: 'Low', score: 41, signal: 'Recurring accrual context', scoredAt: '2026-09-04T11:30:00Z' },
  { document: '2100003401', companyCode: '1010', fiscalYear: '2026', period: 8, userName: 'DUB_FI05', glPair: '610200 / 210100', amount: 'AED 95K', risk: 'Low', score: 28, signal: 'Balanced + period open', scoredAt: '2026-09-04T09:05:00Z' },
  { document: '1900008755', companyCode: '1000', fiscalYear: '2026', period: 8, userName: 'AP_USER11', glPair: '510100 / 210100', amount: '₹9.6 L', risk: 'Low', score: 18, signal: 'Auto-cleared', scoredAt: '2026-09-03T08:50:00Z' },
];

export const summary: Summary = {
  journals: {
    entriesScored: 18426,
    flagged: 495,
    critical: 9,
    high: 38,
    medium: 448,
    low: 17931,
    avgScore: 24.6,
    scoredLast24h: 612,
    lastScoredAt: '2026-09-07T14:41:00Z',
  },
  cases: { openCases: 12, overdueCases: 2, closedCases: 38 },
};

// Dates below are deliberately relative to "now" (not fixed 2026-09 literals like the rest of this
// file) so the case-aging/SLA-breach KPIs in CaseList.tsx — computed as `now - createdAt`/`dueAt`
// vs `now` — stay meaningful whenever this demo is actually opened, not just on one fixed date.
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

export const cases: CaseRecord[] = [
  { id: 'a1b2c3d4e5f60001', document: '1900008472', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'Critical', status: 'OPEN', disposition: null, assignedTo: 'M. Iyer', dueAt: daysAgo(-2), rowVersion: 1, createdAt: daysAgo(6), updatedAt: daysAgo(6) },
  { id: 'a1b2c3d4e5f60002', document: '1900008521', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'Critical', status: 'IN_REVIEW', disposition: null, assignedTo: 'R. Sen', dueAt: daysAgo(1), rowVersion: 2, createdAt: daysAgo(5), updatedAt: daysAgo(1) },
  { id: 'a1b2c3d4e5f60003', document: '2100003318', companyCode: '1010', fiscalYear: '2026', period: 9, severity: 'High', status: 'PENDING_APPROVAL', disposition: null, assignedTo: 'F. Haddad', dueAt: daysAgo(-3), rowVersion: 3, createdAt: daysAgo(4), updatedAt: daysAgo(1) },
  { id: 'a1b2c3d4e5f60004', document: '1900008499', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'High', status: 'CLOSED', disposition: 'Valid business reason', assignedTo: 'M. Iyer', dueAt: null, rowVersion: 4, createdAt: daysAgo(9), updatedAt: daysAgo(7) },
  { id: 'a1b2c3d4e5f60005', document: '1900008556', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'High', status: 'OPEN', disposition: null, assignedTo: 'M. Iyer', dueAt: daysAgo(0), rowVersion: 1, createdAt: daysAgo(3), updatedAt: daysAgo(3) },
  { id: 'a1b2c3d4e5f60006', document: '2100003342', companyCode: '1010', fiscalYear: '2026', period: 9, severity: 'Medium', status: 'OPEN', disposition: null, assignedTo: null, dueAt: daysAgo(-5), rowVersion: 1, createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  { id: 'a1b2c3d4e5f60007', document: '1900008601', companyCode: '1020', fiscalYear: '2026', period: 8, severity: 'Medium', status: 'IN_REVIEW', disposition: null, assignedTo: 'S. Bose', dueAt: daysAgo(2), rowVersion: 2, createdAt: daysAgo(8), updatedAt: daysAgo(2) },
  { id: 'a1b2c3d4e5f60008', document: '1900008610', companyCode: '1000', fiscalYear: '2026', period: 8, severity: 'Medium', status: 'CLOSED', disposition: 'Reclassification approved', assignedTo: 'R. Sen', dueAt: null, rowVersion: 3, createdAt: daysAgo(14), updatedAt: daysAgo(11) },
  { id: 'a1b2c3d4e5f60009', document: '1900008632', companyCode: '1020', fiscalYear: '2026', period: 8, severity: 'Medium', status: 'CLOSED', disposition: 'Valid business reason', assignedTo: 'F. Haddad', dueAt: null, rowVersion: 2, createdAt: daysAgo(16), updatedAt: daysAgo(13) },
  { id: 'a1b2c3d4e5f60010', document: '1900008701', companyCode: '1000', fiscalYear: '2026', period: 8, severity: 'Low', status: 'CLOSED', disposition: 'Auto-cleared, no exception', assignedTo: 'M. Iyer', dueAt: null, rowVersion: 1, createdAt: daysAgo(20), updatedAt: daysAgo(18) },
  { id: 'a1b2c3d4e5f60011', document: '2100003401', companyCode: '1010', fiscalYear: '2026', period: 8, severity: 'Low', status: 'PENDING_APPROVAL', disposition: null, assignedTo: 'S. Bose', dueAt: daysAgo(-1), rowVersion: 2, createdAt: daysAgo(2), updatedAt: daysAgo(1) },
  { id: 'a1b2c3d4e5f60012', document: '1900008755', companyCode: '1000', fiscalYear: '2026', period: 8, severity: 'Low', status: 'OPEN', disposition: null, assignedTo: null, dueAt: daysAgo(-4), rowVersion: 1, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
];

export function buildExplanation(entry: Pick<WorklistEntry, 'score' | 'risk'>): Explanation {
  return {
    score: entry.score,
    band: entry.risk,
    drivers: [
      { code: 'AFTER_HOURS', category: 'Timing', contribution: 18 },
      { code: 'RARE_GL_PAIR', category: 'Accounting rule', contribution: 17 },
      { code: 'ROUND_AMOUNT', category: 'Value/materiality', contribution: 14 },
      { code: 'NO_REFERENCE', category: 'Evidence', contribution: 12 },
      { code: 'BALANCED_ENTRY', category: 'Control', contribution: -4 },
    ],
  };
}

export const companyCodes: CompanyCodeOption[] = [
  { key: 'ALL', text: 'All Company Codes' },
  { key: '1000', text: '1000 · Emami India' },
  { key: '1010', text: '1010 · Dubai' },
  { key: '1020', text: '1020 · Bangladesh' },
  { key: '1030', text: '1030 · Sri Lanka' },
];
