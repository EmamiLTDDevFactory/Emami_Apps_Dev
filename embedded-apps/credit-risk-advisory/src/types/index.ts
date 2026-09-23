// ---------------------------------------------------------------------------
// Credit Risk Advisory AI — shared domain types, ported from the standalone
// credit-risk-advisory-fullstack prototype's apps/web/src/types.ts and
// apps/api/src/types.ts. Auth/login types are dropped — this app has no
// login of its own, it's gated by the hub's own session (see HubGate.tsx).
// ---------------------------------------------------------------------------

export interface Customer {
  id: string;
  name: string;
  org: 'EM01' | 'EM02';
  cca: '5000' | '5001';
  channel: string;
  depot: string;
  limit: number;
  outstanding: number;
  openOrder: number;
  openDelivery: number;
  pgi: number;
  billing: number;
  overdue: number;
  avgDelay: number;
  onTime: number;
  tenure: number;
  secondaryTrend: number;
  returns: number;
}

export type RiskBand = 'Low' | 'Medium' | 'High' | 'Critical';

/** Deterministic risk output — same formula as the source project's
 * apps/api/src/risk.ts `deterministicRisk`, computed client-side here (see
 * src/lib/risk.ts) since this app has no server of its own. */
export interface AdvisoryResult {
  exposure: number;
  utilization: number;
  score: number;
  band: RiskBand;
  hardStops: string[];
  recommendation: string;
}

export interface Advisory {
  result: AdvisoryResult;
  explanation: string;
  confidence: number;
}

export interface CustomerDetail {
  customer: Customer;
  advisory: Advisory;
}

export interface Kpi {
  label: string;
  value: string;
  detail: string;
  /** Card accent color — blue | red | amber | green | purple (prototype style). */
  accent?: string;
  /** Unique category tag rendered as a pill on the card (e.g. EXPOSURE, PGI). */
  badge?: string;
}

export interface WorklistRow {
  priority: string;
  stage: string;
  document: string;
  customerId: string;
  org: string;
  cca: string;
  channel: string;
  amount: number;
  risk: RiskBand | string;
  recommendation: string;
  sla: string;
  date: string;
}

export type Decision = 'APPROVE' | 'REJECT' | 'REWORK' | 'CONDITIONAL_RELEASE';

export interface DecisionInput {
  decision: Decision;
  reason: string;
  idempotencyKey: string;
  amount?: number;
}

export interface DecisionOutcome {
  status: string;
  execution: string;
  correlationId: string;
  recordId: string;
}

export type UploadKind = 'CREDIT_GUARANTEE' | 'SUPPORTING_DOC' | 'AUDIT_IMAGE' | 'EXPERT_OPINION';

export interface UploadResponse {
  id: string;
  kind: UploadKind;
  mime: string;
  size: number;
  note?: string;
  uploadedAt: string;
}

export interface DashboardFilters {
  org: 'ALL' | 'EM01' | 'EM02';
  cca: 'ALL' | '5000' | '5001';
  channel: 'ALL' | '10' | '30' | '35' | '40';
  risk: 'ALL' | RiskBand | 'HIGH+';
  fromDate: string;
  toDate: string;
}

export interface DashboardPayload {
  kpis: Kpi[];
  customers: Customer[];
  worklist: WorklistRow[];
  /** True when this payload came from the live SAP OData service rather than the demo dataset. */
  live: boolean;
}
