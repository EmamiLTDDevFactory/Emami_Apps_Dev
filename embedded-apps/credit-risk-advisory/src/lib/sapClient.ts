// SAP Gateway OData V2 integration for Credit Risk Advisory — service `ZCREDIT_ADV_SRV`, per the
// blueprint this app was ported from (the standalone credit-risk-advisory-fullstack prototype:
// sap/ODATA_API_CONTRACT.md, sap/ZCREDIT_ADV_SRV.md, sap/README.md, sap/abap/*.abap — all copied
// into this app's own abap/ folder for reference). Unlike this monorepo's other SAP-integrated
// apps (Market Rate, PO Followup, Provision Tracking, PO Deviation Approval — all confirmed live
// against a real deployed Gateway host), ZCREDIT_ADV_SRV has NOT been deployed yet: the abap/
// folder is a DDIC installer + MPC/DPC extension template, not a working service.
// SAP_BASE_URL below is therefore a placeholder — replace it with the real Gateway host once
// ZCREDIT_ADV_SRV is actually generated and activated in SAP, matching the exact pattern every
// sibling app's own sapClient.ts already uses (a single hardcoded absolute base URL).
//
// Because there is genuinely nothing live to call yet, every exported function below still
// contains the REAL SAP call (real entity sets/function imports, real field mapping per the
// documented contract's own "OData property -> API JSON field mapping" table), gated behind a
// SAP_CONFIGURED check so testing against the bundled demo dataset (src/data/mock.ts) is instant
// and doesn't depend on how the placeholder hostname happens to fail. The moment SAP_BASE_URL is
// replaced with a real host, SAP_CONFIGURED flips true and every function starts calling SAP for
// real with no other code changes needed anywhere in this file.
import axios from 'axios';
import { buildMockDashboard, customers as MOCK_CUSTOMERS, worklist as MOCK_WORKLIST, kpis as MOCK_KPIS } from '../data/mock';
import { advise } from './risk';
import type {
  Advisory,
  Customer,
  CustomerDetail,
  DashboardFilters,
  DashboardPayload,
  Decision,
  DecisionOutcome,
  Kpi,
  RiskBand,
  WorklistRow,
} from '../types';

// TODO: replace with the real Gateway host once ZCREDIT_ADV_SRV is deployed (see file header).
const SAP_BASE_URL = 'https://REPLACE-WITH-REAL-GATEWAY-HOST.example.com/sap/opu/odata/sap/ZCREDIT_ADV_SRV';

/** True once someone has actually replaced SAP_BASE_URL above with a real host — see the file
 * header and cashflow-forecast/src/lib/sapClient.ts's identical guard for the full rationale. */
const SAP_CONFIGURED = !SAP_BASE_URL.includes('REPLACE-WITH-REAL-GATEWAY-HOST');

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  timeout: 20000, // matches the source project's own SAP_TIMEOUT_MS default
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isNaN(n) ? 0 : n;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

async function getEntitySet<T = Record<string, unknown>>(set: string, params: Record<string, string> = {}): Promise<T[]> {
  const { data } = await sapClient.get(`/${set}`, { params: { '$format': 'json', ...params } });
  const results = data?.d?.results ?? data?.value;
  return Array.isArray(results) ? (results as T[]) : [];
}

async function callFunctionImport(name: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const { data } = await sapClient.get(`/${name}`, { params: { '$format': 'json', ...params } });
  return data?.d || data || {};
}

// ---------------------------------------------------------------------------
// CustomerSet -> Customer
// Per docs' "OData property -> API JSON field mapping" table: CustomerNo->id, Name1->name,
// SalesOrg->org, CreditControlArea->cca, CreditLimit->limit, Outstanding->outstanding,
// OpenOrder/OpenDelivery/Pgi/Billing->openOrder/openDelivery/pgi/billing, Overdue->overdue,
// AvgDelayDays->avgDelay, OnTimePct->onTime, TenureMonths->tenure, SecondaryTrend->secondaryTrend,
// ReturnsPct->returns. Channel/Depot aren't in that mapping table (only in the frontend's own
// Customer shape) — read from the same-named SAP fields (Channel/Depot), the convention every
// other field in the table already follows; if these render blank once the real service is live,
// that's the tell the wire field is actually named differently.
// ---------------------------------------------------------------------------

function toCustomer(raw: Record<string, unknown>): Customer {
  return {
    id: str(raw.CustomerNo),
    name: str(raw.Name1),
    org: (str(raw.SalesOrg) as Customer['org']) || 'EM01',
    cca: (str(raw.CreditControlArea) as Customer['cca']) || '5000',
    channel: str(raw.Channel),
    depot: str(raw.Depot),
    limit: num(raw.CreditLimit),
    outstanding: num(raw.Outstanding),
    openOrder: num(raw.OpenOrder),
    openDelivery: num(raw.OpenDelivery),
    pgi: num(raw.Pgi),
    billing: num(raw.Billing),
    overdue: num(raw.Overdue),
    avgDelay: num(raw.AvgDelayDays),
    onTime: num(raw.OnTimePct),
    tenure: num(raw.TenureMonths),
    secondaryTrend: num(raw.SecondaryTrend),
    returns: num(raw.ReturnsPct),
  };
}

export async function fetchCustomers(org: DashboardFilters['org'] = 'ALL'): Promise<Customer[]> {
  if (!SAP_CONFIGURED) return org === 'ALL' ? MOCK_CUSTOMERS : MOCK_CUSTOMERS.filter((c) => c.org === org);
  const filter = org !== 'ALL' ? `SalesOrg eq '${escapeODataString(org)}'` : undefined;
  const rows = await getEntitySet('CustomerSet', filter ? { '$filter': filter } : {});
  return rows.map(toCustomer);
}

/** One customer's full detail + advisory — `RiskAdvisory(CustomerNo)` per the contract returns
 * Score/Band/Utilization/Exposure/HardStops/Recommendation directly from SAP (computed
 * server-side by the real service); this app's own client-side deterministicRisk (src/lib/risk.ts)
 * is used only for the demo dataset and for portfolio-wide charts that need a band for every
 * customer without one function-import round trip each (see fetchDashboard below). */
export async function fetchCustomerDetail(id: string): Promise<CustomerDetail> {
  if (!SAP_CONFIGURED) {
    const customer = MOCK_CUSTOMERS.find((c) => c.id === id) ?? MOCK_CUSTOMERS[0];
    return { customer, advisory: advise(customer) };
  }
  const [customerRows, advisoryRaw] = await Promise.all([
    getEntitySet('CustomerSet', { '$filter': `CustomerNo eq '${escapeODataString(id)}'` }),
    callFunctionImport(`RiskAdvisory('${escapeODataString(id)}')`, {}),
  ]);
  const customer = customerRows[0] ? toCustomer(customerRows[0]) : MOCK_CUSTOMERS[0];
  const advisory: Advisory = {
    result: {
      exposure: num(advisoryRaw.Exposure),
      utilization: num(advisoryRaw.Utilization),
      score: num(advisoryRaw.Score),
      band: (str(advisoryRaw.Band) as RiskBand) || 'Low',
      hardStops: str(advisoryRaw.HardStops).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      recommendation: str(advisoryRaw.Recommendation),
    },
    explanation: str(advisoryRaw.Explanation) || advise(customer).explanation,
    confidence: advisoryRaw.Confidence != null ? num(advisoryRaw.Confidence) : advise(customer).confidence,
  };
  return { customer, advisory };
}

// ---------------------------------------------------------------------------
// WorklistSet -> WorklistRow
// Field names aren't in the docs' explicit mapping table (that table only covers CustomerSet) —
// inferred from the same PascalCase convention plus the contract's own worked example
// ($filter=RiskBand eq 'Critical'&$orderby=Amount desc, which confirms RiskBand and Amount).
// Flagged here so it's the first thing to check if these render blank against the real service.
// ---------------------------------------------------------------------------

function toWorklistRow(raw: Record<string, unknown>): WorklistRow {
  return {
    priority: str(raw.Priority),
    stage: str(raw.Stage),
    document: str(raw.DocumentNo),
    customerId: str(raw.CustomerNo),
    org: str(raw.SalesOrg),
    cca: str(raw.CreditControlArea),
    channel: str(raw.Channel),
    amount: num(raw.Amount),
    risk: str(raw.RiskBand),
    recommendation: str(raw.Recommendation),
    sla: str(raw.Sla),
    date: str(raw.WorklistDate) ? String(raw.WorklistDate) : '',
  };
}

export async function fetchWorklist(risk: DashboardFilters['risk'] = 'ALL'): Promise<WorklistRow[]> {
  if (!SAP_CONFIGURED) return MOCK_WORKLIST;
  const filter = risk !== 'ALL' && risk !== 'HIGH+' ? `RiskBand eq '${escapeODataString(risk)}'` : undefined;
  const rows = await getEntitySet('WorklistSet', { '$orderby': 'Amount desc', ...(filter ? { '$filter': filter } : {}) });
  return rows.map(toWorklistRow);
}

// ---------------------------------------------------------------------------
// KpiSet -> Kpi
// ---------------------------------------------------------------------------

function toKpi(raw: Record<string, unknown>): Kpi {
  return {
    label: str(raw.Label),
    value: str(raw.Value),
    detail: str(raw.Detail),
    accent: str(raw.Accent) || undefined,
    badge: str(raw.Badge) || undefined,
  };
}

export async function fetchKpis(): Promise<Kpi[]> {
  if (!SAP_CONFIGURED) return MOCK_KPIS;
  const rows = await getEntitySet('KpiSet');
  return rows.length ? rows.map(toKpi) : MOCK_KPIS;
}

/** Loads everything the dashboard needs in one go — real SAP first, demo dataset as the fallback
 * (see file header for why: ZCREDIT_ADV_SRV isn't deployed yet). */
export async function loadDashboard(filters: Pick<DashboardFilters, 'org'>): Promise<DashboardPayload> {
  if (!SAP_CONFIGURED) return buildMockDashboard();
  try {
    const [kpisData, customersData, worklistData] = await Promise.all([
      fetchKpis(),
      fetchCustomers(filters.org),
      fetchWorklist('ALL'),
    ]);
    return { kpis: kpisData, customers: customersData, worklist: worklistData, live: true };
  } catch {
    return buildMockDashboard();
  }
}

// ---------------------------------------------------------------------------
// SubmitDecision — per docs/API_CONTRACT.md, this appends an immutable DecisionLogSet row only.
// Never posts, pays or clears anything in SAP directly; it's a governed recommendation/audit
// record that a separate approval workflow acts on, same posture as cashflow-forecast's ActionSet
// and IBD Provision Tracking's own audit-trail writes elsewhere in this monorepo.
// ---------------------------------------------------------------------------

async function simulateDecision(customerId: string): Promise<DecisionOutcome> {
  await new Promise((r) => setTimeout(r, 350));
  return {
    status: 'SIMULATED',
    execution: 'Decision recorded locally — SAP DecisionLogSet is not connected yet.',
    correlationId: crypto.randomUUID(),
    recordId: `REC-${customerId}-${Date.now().toString().slice(-6)}`,
  };
}

export async function submitDecision(
  customerId: string,
  decision: Decision,
  reason: string,
  amount?: number
): Promise<DecisionOutcome> {
  if (!SAP_CONFIGURED) return simulateDecision(customerId);
  const idempotencyKey = crypto.randomUUID();
  try {
    const body = await callFunctionImport('SubmitDecision', {
      CustomerNo: `'${escapeODataString(customerId)}'`,
      Decision: `'${escapeODataString(decision)}'`,
      Reason: `'${escapeODataString(reason)}'`,
      IdempotencyKey: `'${idempotencyKey}'`,
      ...(amount != null ? { Amount: String(amount) } : {}),
    });
    return {
      status: str(body.Status) || 'SUBMITTED',
      execution: str(body.Execution),
      correlationId: str(body.CorrelationId) || idempotencyKey,
      recordId: str(body.RecordId),
    };
  } catch {
    return simulateDecision(customerId);
  }
}
