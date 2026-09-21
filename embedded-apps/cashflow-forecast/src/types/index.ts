// ---------------------------------------------------------------------------
// CashFlow Intelligence – shared domain types
// ---------------------------------------------------------------------------

export type Scenario = 'BASE' | 'BEST' | 'STRESS';

export type Tone = 'blue' | 'green' | 'amber' | 'red';

/** Semantic icon keys so KPI data stays serializable over OData. */
export type IconKey =
  | 'wallet'
  | 'trendUp'
  | 'octagonAlert'
  | 'handCoins'
  | 'receiptText'
  | 'userX'
  | 'calendarClock'
  | 'gauge'
  | 'timer'
  | 'activity'
  | 'banknote'
  | 'globe'
  | 'scale'
  | 'landmark'
  | 'shieldCheck'
  | 'percent'
  | 'target';

export interface Kpi {
  key: string;
  icon: IconKey;
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}

export interface SecondaryKpi {
  key: string;
  icon: IconKey;
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}

export interface ForecastPoint {
  week: string;
  startDate: string;
  closingCash: number;
  inflows: number;
  outflows: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
  /** Optional planning series (mock/ABAP provide these when toggled). */
  poCommitments?: number;
  salesPipeline?: number;
  /** Display-only fields derived client-side. */
  label?: string;
  date?: string;
}

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

export interface Risk {
  riskId: string;
  category: string;
  score: number;
  severity: Severity;
  alert: string;
  financialImpact: number;
  mitigation: string;
  owner: string;
  due: string;
  status: 'Open' | 'In Progress' | 'Closed';
}

export type Direction = 'positive' | 'negative';

export interface ExplainFactor {
  name: string;
  impact: number;
  direction: Direction;
  rank: number;
  source: string;
  rationale: string;
}

export interface CashFlowLine {
  id: string;
  type: string;
  partner: string;
  dueDate: string;
  amount: number;
  currency: string;
  probability: number;
  planningLevel: string;
  companyCode: string;
}

export interface ActionItem {
  id: string;
  type: string;
  title: string;
  amount: number;
  owner: string;
  status: 'Proposed' | 'Approved' | 'In Progress' | 'Completed';
  createdAt: string;
}

export interface DashboardFilters {
  scenario: Scenario;
  companyCode: string;
  horizon: number;
  fromDate: string; // ISO date – first day of the forecast window
  granularity: 'WEEKLY' | 'MONTHLY';
  currency: CurrencyCode; // display currency only; transaction currency is resolved server-side
}

export type ActionItemType = 'LIQUIDITY_MITIGATION' | 'PAYMENT_RESEQUENCE' | 'HEDGE_PROPOSAL' | 'COLLECTION_WORKLIST';

export type Priority = 'Critical' | 'High' | 'Medium' | 'Info';

/** Agent-generated insight with a one-click governed action. */
export interface Insight {
  id: string;
  title: string;
  detail: string;
  priority: Priority;
  impact: number; // ₹ Cr
  confidence: number; // %
  sources: string[]; // SAP source lineage
  actionType?: ActionItemType;
  suggestedAction: string;
}

export interface ChartOptions {
  showBand: boolean;
  showPolicy: boolean;
  showPo: boolean; // PO / capex commitments (COOI, EKKO/EKET)
  showPipeline: boolean; // SD sales pipeline (VBEP confirmed)
  showConfidence: boolean; // confidence % line on the right axis
}

export type CurrencyCode = 'INR' | 'USD' | 'EUR';

export interface CompanyCodeOption {
  key: string;
  text: string;
}

export interface DashboardPayload {
  kpis: Kpi[];
  secondary: SecondaryKpi[];
  forecast: ForecastPoint[];
  risks: Risk[];
  factors: ExplainFactor[];
  lines: CashFlowLine[];
  actions: ActionItem[];
  insights: Insight[];
  policyBuffer: number;
  alert: string;
  asOf: string;
  currency: string;
  /** True when this payload came from the live SAP OData service rather than the demo dataset —
   * drives Sidebar's "Demo data / SAP OData V2 live" indicator and the footer credit line. */
  live: boolean;
}
