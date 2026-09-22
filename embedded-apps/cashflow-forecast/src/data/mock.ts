import type {
  ActionItem,
  CashFlowLine,
  CompanyCodeOption,
  DashboardPayload,
  ExplainFactor,
  ForecastPoint,
  Insight,
  Kpi,
  Risk,
  SecondaryKpi,
} from '../types';

// ---------------------------------------------------------------------------
// Demo dataset — mirrors the OData V2 contract in docs/API_CONTRACT.md (see the standalone
// cashflow-Forecast project this app was ported from). Values in INR Crore (₹ Cr). Shown whenever
// ZCASHFLOW_AI_SRV isn't reachable (see src/lib/sapClient.ts's fetchDashboard) — this app has no
// separate "demo mode" toggle; it always tries the real SAP service first.
// ---------------------------------------------------------------------------

export const POLICY_BUFFER = 40; // ₹ Cr liquidity policy buffer

export const kpis: Kpi[] = [
  { key: 'opening', icon: 'wallet', label: 'Opening Cash', value: '₹128.4 Cr', note: '+4.2% vs prior week', tone: 'green' },
  { key: 'net13w', icon: 'trendUp', label: '13-Week Net Cash Flow', value: '₹22.7 Cr', note: 'Forecast confidence 87%', tone: 'blue' },
  { key: 'lowest', icon: 'octagonAlert', label: 'Lowest Liquidity Point', value: '₹31.8 Cr', note: 'W3 · below ₹40 Cr policy buffer', tone: 'amber' },
  { key: 'receipts', icon: 'handCoins', label: 'Expected Receipts', value: '₹312.6 Cr', note: 'AR + SD pipeline · 13 weeks', tone: 'green' },
  { key: 'payments', icon: 'receiptText', label: 'Expected Payments', value: '₹289.9 Cr', note: 'AP + payroll + statutory dues', tone: 'red' },
  { key: 'atRiskAr', icon: 'userX', label: 'At-Risk Receivables', value: '₹18.3 Cr', note: '24 accounts flagged by agent', tone: 'amber' },
  { key: 'daysCash', icon: 'calendarClock', label: 'Days Cash on Hand', value: '41 days', note: 'Target ≥ 45 days', tone: 'amber' },
  { key: 'confidence', icon: 'gauge', label: 'Forecast Confidence', value: '87%', note: '+2 pts vs last run', tone: 'blue' },
  { key: 'lcr', icon: 'scale', label: 'Liquidity Coverage Ratio', value: '2.8x', note: 'Policy floor 2.0x', tone: 'green' },
  { key: 'bank', icon: 'landmark', label: 'Bank Balances', value: '₹142.6 Cr', note: '9 accounts · 2 currencies', tone: 'blue' },
  { key: 'hedge', icon: 'shieldCheck', label: 'Hedge Coverage', value: '64%', note: 'Target ≥ 80% of EUR exposure', tone: 'amber' },
  { key: 'discount', icon: 'percent', label: 'Discount-Loss Risk', value: '₹0.8 Cr', note: 'If deferrals run past terms', tone: 'amber' },
  // Placeholder values only — this KPI isn't a KPISet row (no counterparty-concentration field
  // exists in docs/API_CONTRACT.md), it's recomputed client-side from CashFlowLineSet's own
  // partner/amount fields (see src/app/page.tsx's concentrationInfo) for both mock and live data,
  // same posture as policyBuffer/alert in sapClient.ts's fetchDashboard.
  { key: 'concentration', icon: 'target', label: 'Top Receivable Concentration', value: '—', note: 'Largest single counterparty share of receipts', tone: 'blue' },
];

export const secondary: SecondaryKpi[] = [
  { key: 'ccc', icon: 'timer', label: 'Cash Conversion Cycle', value: '62 days', note: '-5 days vs prior quarter', tone: 'green' },
  { key: 'dso', icon: 'activity', label: 'Days Sales Outstanding', value: '54 days', note: 'Sector median 49', tone: 'amber' },
  { key: 'dpo', icon: 'banknote', label: 'Days Payables Outstanding', value: '48 days', note: 'Within negotiated terms', tone: 'blue' },
  { key: 'fx', icon: 'globe', label: 'FX Exposure (EUR)', value: '€18.5 Cr', note: 'Cluster in W4–W5', tone: 'amber' },
];

const inflows = [28, 21, 19, 31, 35, 24, 38, 42, 29, 37, 41, 33, 35];
const outflows = [44, 39, 58, 16, 20, 31, 22, 17, 37, 21, 27, 15, 12];
const closing = [112, 94, 31.8, 47, 62, 55, 71, 96, 88, 104, 118, 136, 151.1];
// Optional planning series (₹ Cr): capex/PO commitments (COOI, EKKO/EKET) and
// the confirmed SD sales pipeline (VBEP). Toggled via chart-layer checkboxes.
const poCommitments = [3.2, 4.1, 6.0, 2.4, 1.2, 3.0, 2.2, 1.1, 4.0, 2.1, 3.3, 1.0, 2.5];
const salesPipeline = [2.1, 3.0, 4.2, 5.1, 6.3, 4.0, 5.2, 6.1, 7.0, 5.4, 6.2, 7.1, 8.0];

export const forecast: ForecastPoint[] = closing.map((v, i) => ({
  week: `W${i + 1}`,
  startDate: '2026-09-01',
  closingCash: v,
  inflows: inflows[i],
  outflows: outflows[i],
  lowerBound: +(v * 0.9).toFixed(1),
  upperBound: +(v * 1.1).toFixed(1),
  confidence: i <= 4 ? 92 : i <= 9 ? 85 : 74,
  poCommitments: poCommitments[i],
  salesPipeline: salesPipeline[i],
}));

export const risks: Risk[] = [
  {
    riskId: 'RSK-001',
    category: 'Liquidity Risk',
    score: 82,
    severity: 'Critical',
    alert: 'Policy-buffer breach expected in Week 3',
    financialImpact: 12.4,
    mitigation: 'Accelerate ₹4.9 Cr collections; defer ₹5.1 Cr eligible payments; prepare ₹5 Cr contingency funding.',
    owner: 'Treasury',
    due: '03 Sep',
    status: 'Open',
  },
  {
    riskId: 'RSK-002',
    category: 'Collection Risk',
    score: 71,
    severity: 'High',
    alert: 'Six distributors are paying 9 days slower',
    financialImpact: 8.1,
    mitigation: 'Prioritized collection worklist, dispute validation and promise-to-pay tracking.',
    owner: 'AR Head',
    due: '02 Sep',
    status: 'In Progress',
  },
  {
    riskId: 'RSK-003',
    category: 'FX Exposure',
    score: 54,
    severity: 'Medium',
    alert: 'EUR maturities cluster in Weeks 4 and 5',
    financialImpact: 5.6,
    mitigation: 'Run 5% and 10% FX shocks and submit hedge proposal for approval.',
    owner: 'Treasury',
    due: '05 Sep',
    status: 'Open',
  },
  {
    riskId: 'RSK-004',
    category: 'Payroll & Statutory',
    score: 47,
    severity: 'Medium',
    alert: 'PF/GST outflows collide with W3 trough',
    financialImpact: 3.9,
    mitigation: 'Sequence statutory payments around the trough; validate challan calendar.',
    owner: 'Payroll',
    due: '04 Sep',
    status: 'Open',
  },
  {
    riskId: 'RSK-005',
    category: 'Data Quality',
    score: 23,
    severity: 'Low',
    alert: 'Three source feeds exceed freshness SLA',
    financialImpact: 0.4,
    mitigation: 'Retry extraction, reconcile counts and quarantine incomplete segments.',
    owner: 'SAP IT',
    due: 'Today',
    status: 'In Progress',
  },
];

export const factors: ExplainFactor[] = [
  { name: 'Opening cash position', impact: 112.4, direction: 'positive', rank: 0, source: 'BSEG / FDSB', rationale: 'Bank and treasury opening balances as of 01 Sep 2026.' },
  { name: 'Vendor invoice maturities', impact: -18.4, direction: 'negative', rank: 1, source: 'BSIK / EKET', rationale: 'Scheduled payables within horizon by payment terms.' },
  { name: 'Payroll & statutory calendar', impact: -13.4, direction: 'negative', rank: 2, source: 'HR + TDS/GST', rationale: 'Payroll run dates plus PF, TDS and GST challan schedule.' },
  { name: 'Expected customer receipts', impact: 11.2, direction: 'positive', rank: 3, source: 'BSID / VBEP', rationale: 'Open AR weighted by collection behaviour model.' },
  { name: 'Customer delay behaviour', impact: -3.1, direction: 'negative', rank: 4, source: 'AR history', rationale: 'Rolling 90-day delay profile shifts receipt dates.' },
  { name: 'Early-payment discounts', impact: 2.6, direction: 'positive', rank: 5, source: 'Payment terms', rationale: 'Discounted early settlements expected from 8 customers.' },
  { name: 'Capex commitments', impact: -4.8, direction: 'negative', rank: 6, source: 'AUFK / PO', rationale: 'Committed capital orders with due dates in horizon.' },
];

export const lines: CashFlowLine[] = [
  { id: 'L-1001', type: 'Customer Receipt', partner: 'Meridian Retail Ltd', dueDate: '05 Sep', amount: 12.5, currency: 'INR', probability: 92, planningLevel: 'L1', companyCode: '1000' },
  { id: 'L-1002', type: 'Vendor Payment', partner: 'Aurora Polymers Pvt', dueDate: '05 Sep', amount: -8.2, currency: 'INR', probability: 98, planningLevel: 'L1', companyCode: '1000' },
  { id: 'L-1003', type: 'Payroll', partner: 'Payroll Run Sept', dueDate: '01 Sep', amount: -11.4, currency: 'INR', probability: 100, planningLevel: 'L1', companyCode: '1000' },
  { id: 'L-1004', type: 'Customer Receipt', partner: 'Grandline Distributors', dueDate: '08 Sep', amount: 6.8, currency: 'INR', probability: 74, planningLevel: 'L2', companyCode: '1000' },
  { id: 'L-1005', type: 'FX Settlement', partner: 'EUR Forward F-2231', dueDate: '11 Sep', amount: -5.3, currency: 'EUR', probability: 96, planningLevel: 'L1', companyCode: '1010' },
  { id: 'L-1006', type: 'Statutory', partner: 'GST Challan Aug', dueDate: '12 Sep', amount: -3.9, currency: 'INR', probability: 100, planningLevel: 'L1', companyCode: '1000' },
  { id: 'L-1007', type: 'Customer Receipt', partner: 'Northstar Exports', dueDate: '15 Sep', amount: 9.1, currency: 'INR', probability: 68, planningLevel: 'L2', companyCode: '2000' },
  { id: 'L-1008', type: 'Capex Commitment', partner: 'PO 4500042211', dueDate: '18 Sep', amount: -4.8, currency: 'INR', probability: 88, planningLevel: 'L2', companyCode: '1000' },
  { id: 'L-1009', type: 'Vendor Payment', partner: 'Helios Components', dueDate: '22 Sep', amount: -6.6, currency: 'INR', probability: 97, planningLevel: 'L1', companyCode: '1000' },
  { id: 'L-1010', type: 'Customer Receipt', partner: 'Kestrel Foods', dueDate: '26 Sep', amount: 4.2, currency: 'INR', probability: 61, planningLevel: 'L3', companyCode: '2000' },
];

export const actions: ActionItem[] = [
  { id: 'ACT-1001', type: 'LIQUIDITY_MITIGATION', title: 'Accelerate collections for W3 trough', amount: 4.9, owner: 'Treasury', status: 'Proposed', createdAt: '01 Sep 2026' },
  { id: 'ACT-1002', type: 'PAYMENT_RESEQUENCE', title: 'Defer eligible vendor payments by 7 days', amount: 5.1, owner: 'AP', status: 'Proposed', createdAt: '01 Sep 2026' },
  { id: 'ACT-1003', type: 'HEDGE_PROPOSAL', title: 'Hedge EUR exposure for W4–W5 cluster', amount: 3.2, owner: 'Treasury', status: 'Approved', createdAt: '31 Aug 2026' },
];

export const insights: Insight[] = [
  {
    id: 'INS-001',
    title: 'Week 3 liquidity breach',
    detail: 'Projected closing ₹31.8 Cr falls ₹8.2 Cr below the ₹40 Cr policy buffer.',
    priority: 'Critical',
    impact: 12.4,
    confidence: 93,
    sources: ['FDSB', 'BSIK', 'FDFIEP'],
    actionType: 'LIQUIDITY_MITIGATION',
    suggestedAction: 'Accelerate ₹4.9 Cr collections and defer ₹5.1 Cr eligible payments.',
  },
  {
    id: 'INS-002',
    title: 'Collection slowdown detected',
    detail: 'Six distributors are paying 9 days slower on a rolling 90-day profile.',
    priority: 'High',
    impact: 8.1,
    confidence: 87,
    sources: ['BSID', 'FIAR history'],
    actionType: 'COLLECTION_WORKLIST',
    suggestedAction: 'Generate prioritized collection worklist with promise-to-pay tracking.',
  },
  {
    id: 'INS-003',
    title: 'Discount-safe payment re-sequencing',
    detail: '₹5.1 Cr of AP can be deferred 7 days without losing early-payment discounts (T052).',
    priority: 'High',
    impact: 5.1,
    confidence: 91,
    sources: ['BSIK', 'T052'],
    actionType: 'PAYMENT_RESEQUENCE',
    suggestedAction: 'Create re-sequencing proposal for approval workflow.',
  },
  {
    id: 'INS-004',
    title: 'EUR exposure cluster in W4–W5',
    detail: 'Net EUR position €18.5 Cr with only 64% hedge coverage.',
    priority: 'Medium',
    impact: 5.6,
    confidence: 84,
    sources: ['TCURR', 'VTBF'],
    actionType: 'HEDGE_PROPOSAL',
    suggestedAction: 'Submit hedge proposal to raise coverage to 85%.',
  },
  {
    id: 'INS-005',
    title: 'DSO 5 days above sector median',
    detail: 'DSO 54 vs sector 49; a 3-day improvement frees ≈ ₹6.2 Cr of working capital.',
    priority: 'Medium',
    impact: 6.2,
    confidence: 78,
    sources: ['BSID', 'KNKK'],
    actionType: 'COLLECTION_WORKLIST',
    suggestedAction: 'Prioritize top 20 overdue accounts by exposure × delay.',
  },
  {
    id: 'INS-006',
    title: 'Forecast confidence dampened',
    detail: 'Three source feeds exceed freshness SLA; overall confidence reduced by 4 pts.',
    priority: 'Info',
    impact: 0,
    confidence: 99,
    sources: ['ZCF_DQ_LOG'],
    suggestedAction: 'SAP IT retry and reconciliation already scheduled.',
  },
];

export const companyCodes: CompanyCodeOption[] = [
  { key: 'ALL', text: 'All Company Codes' },
  { key: '1000', text: '1000 · Manufacturing India' },
  { key: '1010', text: '1010 · Trading Europe' },
  { key: '2000', text: '2000 · Retail India' },
];

export function buildMockDashboard(): DashboardPayload {
  return {
    kpis,
    secondary,
    forecast,
    risks,
    factors,
    lines,
    actions,
    insights,
    policyBuffer: POLICY_BUFFER,
    alert: 'Liquidity falls below the ₹40 Cr policy buffer in Week 3. The agent proposes collection acceleration and payment re-sequencing.',
    asOf: '01 Sep 2026',
    currency: 'INR (₹ Cr)',
    live: false,
  };
}
