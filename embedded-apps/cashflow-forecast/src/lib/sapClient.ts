// SAP Gateway OData V2 integration for CashFlow Intelligence — service `ZCASHFLOW_AI_SRV`, per
// the blueprint this app was ported from (../../../../Downloads/cashflow-Forecast at the time of
// conversion: docs/API_CONTRACT.md, docs/BRD.md/FS.md/TS.md, abap/SEGW_BLUEPRINT.md). Unlike this
// monorepo's other SAP-integrated apps (Market Rate, PO Followup, Provision Tracking, PO
// Deviation Approval — all confirmed live against a real deployed Gateway host), ZCASHFLOW_AI_SRV
// has NOT been deployed yet: the abap/ folder shipped with the source project is a structured
// SEGW/DPC_EXT template with pseudocode method bodies, not a working service. SAP_BASE_URL below
// is therefore a placeholder — replace it with the real Gateway host once ZCASHFLOW_AI_SRV is
// actually generated and activated in SAP, matching the exact pattern every sibling app's own
// sapClient.ts already uses (a single hardcoded absolute base URL, no environment variable).
//
// Because there is genuinely nothing live to call yet, fetchDashboard() below still performs a
// REAL attempt (real entity sets, real field mapping, real $filter/$orderby/$top query
// construction) on every call, and only falls back to the bundled demo dataset (src/data/mock.ts)
// when that attempt fails — network error, 404, or the placeholder host never having been
// updated. This keeps the integration itself fully real and ready to go live the moment the
// Gateway service exists, without the dashboard being unusable in the meantime.
import axios from 'axios';
import { buildMockDashboard, companyCodes as MOCK_COMPANY_CODES } from '../data/mock';
import type {
  ActionItem,
  ActionItemType,
  CashFlowLine,
  CompanyCodeOption,
  DashboardFilters,
  DashboardPayload,
  ExplainFactor,
  ForecastPoint,
  IconKey,
  Insight,
  Kpi,
  Priority,
  Risk,
  SecondaryKpi,
  Severity,
} from '../types';

// TODO: replace with the real Gateway host once ZCASHFLOW_AI_SRV is deployed (see file header).
const SAP_BASE_URL = 'https://REPLACE-WITH-REAL-GATEWAY-HOST.example.com/api/NGD/ZCASHFLOW_AI_SRV';

/** True once someone has actually replaced SAP_BASE_URL above with a real host. Every exported
 * function below still contains the REAL SAP call — this flag only skips actually attempting it
 * while the placeholder is still in place, so testing against the bundled demo dataset
 * (src/data/mock.ts) is instant and doesn't depend on how the placeholder hostname happens to
 * fail (DNS error, timeout, etc. all vary by network/browser). The moment the URL above is
 * replaced, this flips to true and every function starts calling SAP for real with no other code
 * changes needed anywhere in this file. */
const SAP_CONFIGURED = !SAP_BASE_URL.includes('REPLACE-WITH-REAL-GATEWAY-HOST');

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  timeout: 15000,
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
  // OData string literals escape a single quote by doubling it.
  return value.replace(/'/g, "''");
}

/** OData v2 JSON encodes Edm.DateTime as "/Date(epochMillis)/" — same shape every other SAP
 * integration in this repo already unpacks (see fm-po-deviation/src/lib/sapClient.ts). Returns an
 * ISO 'YYYY-MM-DD' date, or '' if the value isn't in that wire shape (e.g. already a plain string
 * from a differently-typed field). */
function parseODataDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/\/Date\((-?\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString().split('T')[0];
  return value;
}

/** Short display date ("03 Sep") for fields the UI shows as a compact label rather than a raw
 * ISO string (Risk.due, ActionItem.createdAt, CashFlowLine.dueDate) — same 'en-GB, day+month'
 * shape src/utils/format.ts's fmtDate already uses elsewhere in this app. */
function shortDate(isoOrWire: unknown, withYear = false): string {
  const iso = parseODataDate(isoOrWire);
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(isoOrWire ?? '');
  return d.toLocaleDateString('en-GB', withYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' });
}

async function getEntitySet<T = Record<string, unknown>>(set: string, params: Record<string, string> = {}): Promise<T[]> {
  const { data } = await sapClient.get(`/${set}`, { params: { '$format': 'json', ...params } });
  const results = data?.d?.results ?? data?.value;
  return Array.isArray(results) ? (results as T[]) : [];
}

function buildScopeFilter(filters: Pick<DashboardFilters, 'companyCode' | 'scenario'>): string {
  const parts: string[] = [`Scenario eq '${filters.scenario}'`];
  if (filters.companyCode && filters.companyCode !== 'ALL') {
    parts.push(`CompanyCode eq '${escapeODataString(filters.companyCode)}'`);
  }
  return parts.join(' and ');
}

// ---------------------------------------------------------------------------
// KPISet -> Kpi[] / SecondaryKpi[]
// Wire fields per docs/API_CONTRACT.md: Key, Label, Value, Note, Tone, Currency, CompanyCode,
// AsOfDate. There's no Icon field on the wire (KPI payloads stay OData-serializable, see
// types/index.ts's IconKey comment) — icons are assigned client-side from the well-known Key,
// exactly as the demo dataset already does, so a real SAP row renders identically to its mock
// counterpart the moment the Key matches.
// ---------------------------------------------------------------------------

const PRIMARY_KPI_ICONS: Record<string, IconKey> = {
  opening: 'wallet',
  net13w: 'trendUp',
  lowest: 'octagonAlert',
  receipts: 'handCoins',
  payments: 'receiptText',
  atRiskAr: 'userX',
  daysCash: 'calendarClock',
  confidence: 'gauge',
  lcr: 'scale',
  bank: 'landmark',
  hedge: 'shieldCheck',
  discount: 'percent',
};

const SECONDARY_KPI_ICONS: Record<string, IconKey> = {
  ccc: 'timer',
  dso: 'activity',
  dpo: 'banknote',
  fx: 'globe',
};

const KNOWN_TONES = new Set(['blue', 'green', 'amber', 'red']);

function toTone(raw: unknown): Kpi['tone'] {
  const t = String(raw ?? '').toLowerCase();
  return KNOWN_TONES.has(t) ? (t as Kpi['tone']) : undefined;
}

function splitKpis(rows: Record<string, unknown>[]): { primary: Kpi[]; secondary: SecondaryKpi[] } {
  const primary: Kpi[] = [];
  const secondary: SecondaryKpi[] = [];
  rows.forEach((r) => {
    const key = str(r.Key);
    const base = { key, label: str(r.Label), value: str(r.Value), note: str(r.Note), tone: toTone(r.Tone) };
    if (key in SECONDARY_KPI_ICONS) {
      secondary.push({ ...base, icon: SECONDARY_KPI_ICONS[key] });
    } else {
      primary.push({ ...base, icon: PRIMARY_KPI_ICONS[key] ?? 'activity' });
    }
  });
  return { primary, secondary };
}

// ---------------------------------------------------------------------------
// ForecastSet -> ForecastPoint[]
// Wire fields: CompanyCode, Scenario, Week, StartDate, EndDate, OpeningCash, Inflows, Outflows,
// ClosingCash, LowerBound, UpperBound, Confidence. PoCommitments/SalesPipeline aren't in the base
// contract but the UI treats them as optional planning overlays the ABAP facade may add later
// (see ChartOptions' showPo/showPipeline) — read defensively, undefined if SAP doesn't send them.
// ---------------------------------------------------------------------------

function toForecastPoint(raw: Record<string, unknown>): ForecastPoint {
  const weekRaw = str(raw.Week);
  return {
    week: /^\d+$/.test(weekRaw) ? `W${weekRaw}` : weekRaw,
    startDate: parseODataDate(raw.StartDate),
    closingCash: num(raw.ClosingCash),
    inflows: num(raw.Inflows),
    outflows: num(raw.Outflows),
    lowerBound: num(raw.LowerBound),
    upperBound: num(raw.UpperBound),
    confidence: num(raw.Confidence),
    poCommitments: raw.PoCommitments != null ? num(raw.PoCommitments) : undefined,
    salesPipeline: raw.SalesPipeline != null ? num(raw.SalesPipeline) : undefined,
  };
}

// ---------------------------------------------------------------------------
// RiskSet -> Risk[]
// Wire fields: RiskId, Category, Score, Severity, Alert, FinancialImpact, Mitigation, Owner,
// DueDate, Status.
// ---------------------------------------------------------------------------

const KNOWN_SEVERITIES = new Set<Severity>(['Critical', 'High', 'Medium', 'Low']);
const KNOWN_RISK_STATUSES = new Set(['Open', 'In Progress', 'Closed']);

function toRisk(raw: Record<string, unknown>): Risk {
  const severity = str(raw.Severity) as Severity;
  const status = str(raw.Status);
  return {
    riskId: str(raw.RiskId),
    category: str(raw.Category),
    score: num(raw.Score),
    severity: KNOWN_SEVERITIES.has(severity) ? severity : 'Medium',
    alert: str(raw.Alert),
    financialImpact: num(raw.FinancialImpact),
    mitigation: str(raw.Mitigation),
    owner: str(raw.Owner),
    due: shortDate(raw.DueDate) || str(raw.DueDate),
    status: (KNOWN_RISK_STATUSES.has(status) ? status : 'Open') as Risk['status'],
  };
}

// ---------------------------------------------------------------------------
// ExplainabilitySet -> ExplainFactor[]
// Wire fields: ExplanationId, Week, FactorName, Impact, Direction, Rank, Source, Rationale.
// ---------------------------------------------------------------------------

function toExplainFactor(raw: Record<string, unknown>): ExplainFactor {
  const direction = str(raw.Direction).toLowerCase();
  return {
    name: str(raw.FactorName),
    impact: num(raw.Impact),
    direction: direction === 'negative' ? 'negative' : 'positive',
    rank: num(raw.Rank),
    source: str(raw.Source),
    rationale: str(raw.Rationale),
  };
}

// ---------------------------------------------------------------------------
// CashFlowLineSet -> CashFlowLine[]
// Wire fields: DocumentKey, SourceType, CompanyCode, Partner, DueDate, Amount, Currency,
// Probability, PlanningLevel, PlanningGroup, Risk. PlanningGroup/Risk aren't surfaced by the
// current UI (see types/index.ts's CashFlowLine) so they're read from `raw` but not mapped.
// ---------------------------------------------------------------------------

function toCashFlowLine(raw: Record<string, unknown>): CashFlowLine {
  return {
    id: str(raw.DocumentKey),
    type: str(raw.SourceType),
    partner: str(raw.Partner),
    dueDate: shortDate(raw.DueDate) || str(raw.DueDate),
    amount: num(raw.Amount),
    currency: str(raw.Currency) || 'INR',
    probability: num(raw.Probability),
    planningLevel: str(raw.PlanningLevel),
    companyCode: str(raw.CompanyCode),
  };
}

// ---------------------------------------------------------------------------
// ActionSet -> ActionItem[]
// Wire fields: ActionId, ActionType, Title, Amount, Owner, Status, ApprovalRequired, CreatedBy,
// CreatedAt.
// ---------------------------------------------------------------------------

const KNOWN_ACTION_STATUSES = new Set(['Proposed', 'Approved', 'In Progress', 'Completed']);

function toActionItem(raw: Record<string, unknown>): ActionItem {
  const status = str(raw.Status);
  return {
    id: str(raw.ActionId),
    type: str(raw.ActionType),
    title: str(raw.Title),
    amount: num(raw.Amount),
    owner: str(raw.Owner),
    status: (KNOWN_ACTION_STATUSES.has(status) ? status : 'Proposed') as ActionItem['status'],
    createdAt: shortDate(raw.CreatedAt, true) || str(raw.CreatedAt),
  };
}

// ---------------------------------------------------------------------------
// InsightSet -> Insight[]
// Wire fields: InsightId, Title, Detail, Priority, Impact, Confidence, Sources, ActionType,
// SuggestedAction. `Sources` travels as a single delimited string over OData v2 (no native array
// primitive) — split on comma/semicolon, matching how every other list-shaped SAP field in this
// monorepo is unpacked.
// ---------------------------------------------------------------------------

const KNOWN_PRIORITIES = new Set<Priority>(['Critical', 'High', 'Medium', 'Info']);
const KNOWN_ACTION_TYPES = new Set<ActionItemType>(['LIQUIDITY_MITIGATION', 'PAYMENT_RESEQUENCE', 'HEDGE_PROPOSAL', 'COLLECTION_WORKLIST']);

function toInsight(raw: Record<string, unknown>): Insight {
  const priority = str(raw.Priority) as Priority;
  const actionType = str(raw.ActionType) as ActionItemType;
  return {
    id: str(raw.InsightId),
    title: str(raw.Title),
    detail: str(raw.Detail),
    priority: KNOWN_PRIORITIES.has(priority) ? priority : 'Info',
    impact: num(raw.Impact),
    confidence: num(raw.Confidence),
    sources: str(raw.Sources).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
    actionType: KNOWN_ACTION_TYPES.has(actionType) ? actionType : undefined,
    suggestedAction: str(raw.SuggestedAction),
  };
}

// ---------------------------------------------------------------------------
// FilterValueSet -> CompanyCodeOption[]
// Wire fields: Dimension, Key, Text. Populates the Company Code filter dropdown from SAP instead
// of a hardcoded list — falls back to the demo list (src/data/mock.ts) if unreachable/empty.
// ---------------------------------------------------------------------------

export async function fetchCompanyCodeOptions(): Promise<CompanyCodeOption[]> {
  if (!SAP_CONFIGURED) return MOCK_COMPANY_CODES;
  try {
    const rows = await getEntitySet<Record<string, unknown>>('FilterValueSet', {
      '$filter': `Dimension eq 'CompanyCode'`,
    });
    const options = rows.map((r) => ({ key: str(r.Key), text: str(r.Text) })).filter((o) => o.key);
    if (options.length === 0) return MOCK_COMPANY_CODES;
    return [{ key: 'ALL', text: 'All Company Codes' }, ...options];
  } catch {
    return MOCK_COMPANY_CODES;
  }
}

// ---------------------------------------------------------------------------
// Full dashboard fetch — real SAP call first, demo dataset as the fallback (see file header for
// why: ZCASHFLOW_AI_SRV isn't deployed yet, so every attempt here fails until it is, and that's
// the ONLY thing that should ever make this fall back).
// ---------------------------------------------------------------------------

export async function fetchDashboard(filters: DashboardFilters): Promise<DashboardPayload> {
  const scope = buildScopeFilter(filters);
  const [kpiRows, forecastRows, riskRows, factorRows, lineRows, actionRows, insightRows] = await Promise.all([
    getEntitySet('KPISet'),
    getEntitySet('ForecastSet', { '$filter': scope, '$orderby': 'StartDate' }),
    getEntitySet('RiskSet', { '$filter': scope }),
    getEntitySet('ExplainabilitySet', { '$filter': scope }),
    getEntitySet('CashFlowLineSet', { '$filter': scope, '$orderby': 'DueDate', '$top': '200' }),
    getEntitySet('ActionSet', { '$filter': scope }),
    getEntitySet('InsightSet', { '$filter': scope }),
  ]);

  const { primary: kpis, secondary } = splitKpis(kpiRows);
  const forecast = forecastRows.map(toForecastPoint);
  const risks = riskRows.map(toRisk);
  const factors = factorRows.map(toExplainFactor).sort((a, b) => a.rank - b.rank);
  const lines = lineRows.map(toCashFlowLine);
  const actions = actionRows.map(toActionItem);
  const insights = insightRows.map(toInsight);

  // Not on any entity set in docs/API_CONTRACT.md yet — policyBuffer needs a real config source
  // (a dedicated KPI row or Treasury policy table) once one is confirmed; the demo constant is
  // used as the floor until then. `alert`/`asOf` ARE derivable from what's actually on the wire,
  // so they're computed here rather than left as placeholder text.
  const policyBuffer = 40;
  const lowestPoint = forecast.length ? forecast.reduce((min, p) => (p.closingCash < min.closingCash ? p : min)) : null;
  const alert = lowestPoint && lowestPoint.closingCash < policyBuffer
    ? `Liquidity falls below the ₹${policyBuffer} Cr policy buffer in ${lowestPoint.week}. Review the proposed mitigation actions below.`
    : 'Liquidity is projected to stay above the policy buffer across the full horizon.';
  const asOf = shortDate(kpiRows[0]?.AsOfDate, true) || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const currencyCode = str(kpiRows[0]?.Currency) || 'INR';

  return {
    kpis,
    secondary,
    forecast,
    risks,
    factors,
    lines,
    actions,
    insights,
    policyBuffer,
    alert,
    asOf,
    currency: `${currencyCode} (Cr)`,
    live: true,
  };
}

/** Loads the live SAP dashboard, falling back to the bundled demo dataset on any failure (network
 * error, timeout, or the placeholder SAP_BASE_URL never having been replaced) so the screen is
 * always usable. */
export async function loadDashboard(filters: DashboardFilters): Promise<DashboardPayload> {
  if (!SAP_CONFIGURED) return buildMockDashboard();
  try {
    return await fetchDashboard(filters);
  } catch {
    return buildMockDashboard();
  }
}

async function simulateCreateAction(): Promise<{ status: string; id?: string }> {
  await new Promise((r) => setTimeout(r, 350));
  return { status: 'SIMULATED', id: `ACT-${Date.now().toString().slice(-6)}` };
}

/** CSRF-aware POST used only for governed recommendation creation (ActionSet) — per
 * docs/API_CONTRACT.md, this must only ever create a work item, never post/pay/clear in SAP.
 * Falls back to a client-simulated result when the real service isn't reachable, same reasoning
 * as loadDashboard above, so the Action Center/Insights buttons stay usable pre-deployment. */
export async function createAction(payload: Record<string, unknown>): Promise<{ status: string; id?: string }> {
  if (!SAP_CONFIGURED) return simulateCreateAction();
  try {
    const meta = await sapClient.get('/', { headers: { 'X-CSRF-Token': 'Fetch' } });
    const token = meta.headers?.['x-csrf-token'] ?? '';
    const { data } = await sapClient.post('/ActionSet', payload, {
      headers: token ? { 'X-CSRF-Token': token } : undefined,
    });
    const body = data?.d || data;
    return { status: 'CREATED', id: str(body?.ActionId) || undefined };
  } catch {
    return simulateCreateAction();
  }
}
