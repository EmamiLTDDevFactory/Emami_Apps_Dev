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

export const cases: CaseRecord[] = [
  { id: 'a1b2c3d4e5f60001', document: '1900008472', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'Critical', status: 'OPEN', disposition: null, assignedTo: 'M. Iyer', dueAt: '2026-09-09T00:00:00Z', rowVersion: 1, createdAt: '2026-09-07T03:10:00Z', updatedAt: '2026-09-07T03:10:00Z' },
  { id: 'a1b2c3d4e5f60002', document: '1900008521', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'Critical', status: 'IN_REVIEW', disposition: null, assignedTo: 'R. Sen', dueAt: '2026-09-08T00:00:00Z', rowVersion: 2, createdAt: '2026-09-07T02:05:00Z', updatedAt: '2026-09-07T09:40:00Z' },
  { id: 'a1b2c3d4e5f60003', document: '2100003318', companyCode: '1010', fiscalYear: '2026', period: 9, severity: 'High', status: 'PENDING_APPROVAL', disposition: null, assignedTo: 'F. Haddad', dueAt: '2026-09-10T00:00:00Z', rowVersion: 3, createdAt: '2026-09-06T01:30:00Z', updatedAt: '2026-09-07T07:15:00Z' },
  { id: 'a1b2c3d4e5f60004', document: '1900008499', companyCode: '1000', fiscalYear: '2026', period: 9, severity: 'High', status: 'CLOSED', disposition: 'Valid business reason', assignedTo: 'M. Iyer', dueAt: null, rowVersion: 4, createdAt: '2026-09-05T10:00:00Z', updatedAt: '2026-09-06T15:00:00Z' },
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
