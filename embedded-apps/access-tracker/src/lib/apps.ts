// App ids -> display names, a copy of the hub's catalog (hub-next/src/data/mockData.ts RAW_APPS).
// Keep in step when an app is added there; an id missing here still renders, just as its raw id.
export const APP_CATALOG: { id: string; name: string; cat: string }[] = [
  { id: 'expense', name: 'Non CTC Expense', cat: 'Cross-Function' },
  { id: 'finance', name: 'Recruitment Consultant Portal', cat: 'HR' },
  { id: 'hr', name: 'Dispatch Tracker', cat: 'Supply Chain' },
  { id: 'inventory', name: 'Mould Health Inspection', cat: 'Packaging' },
  { id: 'audit-capa', name: 'Audit & CAPA', cat: 'CQA' },
  { id: 'market-rate', name: 'Current Market Rate', cat: 'CPD' },
  { id: 'dev-tracker', name: 'Development Tracker', cat: 'IT' },
  { id: 'po-followup', name: 'Delivery Confirmation', cat: 'CPD' },
  { id: 'payment-tracking', name: 'IBD Provision Tracking', cat: 'IBD' },
  { id: 'timesheet', name: 'TimeSheet', cat: 'IT' },
  { id: 'fm-po-deviation', name: 'PO Approval', cat: 'Cross-Function' },
  { id: 'mediclaim', name: 'Mediclaim Policy', cat: 'Cross-Function' },
  { id: 'term-policy', name: 'Term Policy', cat: 'Cross-Function' },
  { id: 'cashflow-forecast', name: 'CashFlow Intelligence', cat: 'Finance' },
  { id: 'journal-anomaly-agent', name: 'Journal & GL Anomaly Agent', cat: 'Finance' },
  { id: 'credit-risk-advisory', name: 'Credit Risk Advisory', cat: 'Finance' },
  { id: 'salescode', name: 'Salescode', cat: 'SD' },
  { id: 'audit-tool', name: 'Audit Tool', cat: 'MSD' },
  { id: 'rate-auction', name: 'Rate Auction', cat: 'CPD' },
  { id: 'bom-cost-explorer', name: 'BOM Simulator', cat: 'CPD' },
  { id: 'sap-agent', name: 'SAP Agent', cat: 'IT' },
  { id: 'gate-entry', name: 'Gate Entry', cat: 'Supply Chain' },
  { id: 'shelf-life-deviation', name: 'Shelf Life Deviation', cat: 'CPD' },
  { id: 'access-tracker', name: 'Access Tracker', cat: 'IT' },
  { id: 'change-control', name: 'IT Change Control Board', cat: 'IT' },
];

const BY_ID = new Map(APP_CATALOG.map((a) => [a.id, a]));
export const appName = (id: string | null | undefined) => (id ? BY_ID.get(id)?.name ?? id : '—');
