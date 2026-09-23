import type { Customer, DashboardPayload, Kpi, WorklistRow } from '../types';

// ---------------------------------------------------------------------------
// Demo dataset — ported verbatim from the standalone prototype's
// apps/api/src/data.ts. Shown whenever ZCREDIT_ADV_SRV isn't reachable (see
// src/lib/sapClient.ts's loadDashboard) — this app has no separate "demo
// mode" toggle; it always tries the real SAP service first.
// ---------------------------------------------------------------------------

export const customers: Customer[] = [
  { id: 'D000245', name: 'Eastern Trade Distributors', org: 'EM01', cca: '5000', channel: '10', depot: 'Kolkata', limit: 5000000, outstanding: 3800000, openOrder: 500000, openDelivery: 200000, pgi: 100000, billing: 90000, overdue: 800000, avgDelay: 18, onTime: 82, tenure: 9, secondaryTrend: 6, returns: 2.2 },
  { id: 'D000126', name: 'Metro Retail Partners', org: 'EM01', cca: '5000', channel: '30', depot: 'Mumbai', limit: 4000000, outstanding: 3900000, openOrder: 600000, openDelivery: 200000, pgi: 150000, billing: 120000, overdue: 1500000, avgDelay: 35, onTime: 60, tenure: 5, secondaryTrend: -12, returns: 5.9 },
  { id: 'D000991', name: 'Healthy Life Agencies', org: 'EM02', cca: '5001', channel: '10', depot: 'Delhi', limit: 3500000, outstanding: 1200000, openOrder: 200000, openDelivery: 100000, pgi: 50000, billing: 30000, overdue: 50000, avgDelay: 2, onTime: 96, tenure: 12, secondaryTrend: 9, returns: 1.1 },
  { id: 'D000443', name: 'Rural Reach Enterprise', org: 'EM02', cca: '5001', channel: '40', depot: 'Patna', limit: 2200000, outstanding: 1800000, openOrder: 350000, openDelivery: 160000, pgi: 80000, billing: 60000, overdue: 620000, avgDelay: 24, onTime: 72, tenure: 4, secondaryTrend: -3, returns: 3.8 },
];

export const worklist: WorklistRow[] = [
  { priority: 'Critical', stage: 'Sales Order', document: '70004567', customerId: 'D000126', org: 'EM01', cca: '5000', channel: '30', amount: 850000, risk: 'Critical', recommendation: 'Escalate', sla: 'Breached 3h', date: '2026-08-27' },
  { priority: 'High', stage: 'Delivery', document: '80006771', customerId: 'D000245', org: 'EM01', cca: '5000', channel: '10', amount: 500000, risk: 'High', recommendation: 'Conditional Release', sla: '1h 20m', date: '2026-08-28' },
  { priority: 'High', stage: 'PGI', document: '80006802', customerId: 'D000443', org: 'EM02', cca: '5001', channel: '40', amount: 310000, risk: 'High', recommendation: 'Partial Release', sla: '2h 05m', date: '2026-08-28' },
  { priority: 'Medium', stage: 'Billing', document: '90001482', customerId: 'D000991', org: 'EM02', cca: '5001', channel: '10', amount: 210000, risk: 'Low', recommendation: 'Release', sla: '5h 48m', date: '2026-08-26' },
  { priority: 'Medium', stage: 'Sales Order', document: '70004601', customerId: 'D000245', org: 'EM01', cca: '5000', channel: '10', amount: 375000, risk: 'Medium', recommendation: 'Partial Release', sla: '6h 10m', date: '2026-08-25' },
];

export const kpis: Kpi[] = [
  { label: 'Total Credit Limit', value: '₹44.2 Cr', detail: '2,000 customers', accent: 'blue', badge: 'MASTER' },
  { label: 'Total Exposure', value: '₹31.8 Cr', detail: '71.9% utilization', accent: 'blue', badge: 'EXPOSURE' },
  { label: 'Outstanding Receivables', value: '₹24.6 Cr', detail: '↑ 2.8% vs prior period', accent: 'amber', badge: 'AR' },
  { label: 'Overdue Receivables', value: '₹4.4 Cr', detail: '17.9% of outstanding', accent: 'red', badge: 'OVERDUE' },
  { label: 'Average DSO', value: '43 days', detail: '−2 days vs prior period', accent: 'green', badge: 'DSO' },
  { label: 'Disputed Receivables', value: '₹1.10 Cr', detail: '5 documents | 3 customers', accent: 'red', badge: 'DISPUTES' },
  { label: 'Open Sales Orders', value: '₹7.86 Cr', detail: '164 documents', accent: 'blue', badge: 'O2C-ORD' },
  { label: 'Blocked Orders', value: '₹6.48 Cr', detail: '56 documents | 9 SLA breaches', accent: 'red', badge: 'BLOCK-ORD' },
  { label: 'Open Deliveries', value: '₹4.72 Cr', detail: '88 deliveries', accent: 'amber', badge: 'O2C-DLV' },
  { label: 'Blocked Deliveries', value: '₹3.27 Cr', detail: '31 deliveries | 6 urgent', accent: 'red', badge: 'BLOCK-DLV' },
  { label: 'Pending PGI', value: '₹1.82 Cr', detail: '19 deliveries | 7 over 24h', accent: 'purple', badge: 'PGI' },
  { label: 'Open Billing', value: '₹2.14 Cr', detail: '24 documents | 5 over 24h', accent: 'purple', badge: 'BILLING' },
  { label: 'Pending Approvals', value: '₹4.92 Cr', detail: '27 decisions', accent: 'amber', badge: 'APPROVALS' },
  { label: 'Collection Efficiency', value: '91.0%', detail: 'Target 92.0%', accent: 'green', badge: 'COLLECTION' },
  { label: 'High/Critical Customers', value: '18', detail: '₹5.36 Cr exposure', accent: 'red', badge: 'PORTFOLIO' },
  { label: 'Credit Limit Expiring', value: '23', detail: 'Within next 30 days', accent: 'amber', badge: 'LIMITS' },
  { label: 'Policy Exceptions', value: '45', detail: '12 expired | 7 overlaps', accent: 'purple', badge: 'POLICY' },
  { label: 'Data Reconciliation', value: '99.7%', detail: '2 items in retry', accent: 'green', badge: 'DATA' },
];

export function buildMockDashboard(): DashboardPayload {
  return { kpis, customers, worklist, live: false };
}
