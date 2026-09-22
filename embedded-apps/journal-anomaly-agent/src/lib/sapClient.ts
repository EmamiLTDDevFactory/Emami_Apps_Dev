// SAP Gateway OData V2 integration for the Journal Entry & GL Anomaly Agent — service
// `ZJE_ANOMALY_SRV`, per the blueprint this app was ported from (the standalone
// journal-anomaly-agent project: sap/ODATA_API_CONTRACT.md, sap/ZJE_ANOMALY_SRV.md,
// abap/zcl_zje_anomaly_dpc_ext.abap). Same posture as this monorepo's cashflow-forecast app:
// ZJE_ANOMALY_SRV has NOT been deployed yet — the abap/ folder shipped with the source project is
// a structured SEGW/DPC_EXT implementation with several methods left as documented stubs (e.g.
// DashboardSet aggregation, LineSet/GLMasterSet projections), not a fully working service.
// SAP_BASE_URL below is a placeholder — replace it with the real Gateway host once
// ZJE_ANOMALY_SRV is actually generated and activated in SAP.
//
// Every exported function still contains the REAL SAP call (real entity sets, real field mapping,
// real $filter/$orderby/$top query construction) and only falls back to the bundled demo dataset
// (src/data/mock.ts) when SAP_CONFIGURED is false or the real attempt fails — network error, 404,
// or the placeholder host never having been updated. This keeps the integration itself fully real
// and ready to go live the moment the Gateway service exists.
//
// The source project's own Node/Express API + PostgreSQL layer (apps/api/) is NOT reproduced
// here — this monorepo's embedded apps call SAP OData directly from the browser (same pattern as
// every sibling SAP-integrated app: Market Rate, PO Followup, Provision Tracking, PO Deviation
// Approval, cashflow-forecast), with no separate backend of their own. Its case-workflow rules
// (idempotency key, one-open-case-per-document, optimistic locking via RowVersion, disposition
// required to close) are enforced client-side here in the same spirit, and for real would be
// enforced server-side by ZCL_ZJE_ANOMALY_DPC_EXT exactly as documented.
import axios from 'axios';
import { buildExplanation, cases as MOCK_CASES, companyCodes as MOCK_COMPANY_CODES, summary as MOCK_SUMMARY, worklist as MOCK_WORKLIST } from '../data/mock';
import type { CaseRecord, CaseStatus, CompanyCodeOption, Explanation, FilterDraft, RiskBand, Summary, WorklistEntry } from '../types';

// TODO: replace with the real Gateway host once ZJE_ANOMALY_SRV is deployed (see file header).
const SAP_BASE_URL = 'https://REPLACE-WITH-REAL-GATEWAY-HOST.example.com/sap/opu/odata/sap/ZJE_ANOMALY_SRV';

/** True once someone has actually replaced SAP_BASE_URL above with a real host — see
 * cashflow-forecast/src/lib/sapClient.ts for the identical pattern and its full rationale. */
export const SAP_CONFIGURED = !SAP_BASE_URL.includes('REPLACE-WITH-REAL-GATEWAY-HOST');

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
 * integration in this repo already unpacks. Returns an ISO string, or '' if not in that shape. */
function parseODataDate(value: unknown): string {
  if (typeof value !== 'string') return '';
  const match = value.match(/\/Date\((-?\d+)\)\//);
  if (match) return new Date(Number(match[1])).toISOString();
  return value;
}

/** ZJE_ANOMALY_SRV splits a timestamp into a Date field (Edm.DateTime, midnight) and a Time field
 * (Edm.Time, "PTnnHnnMnnS") — see the ATOM field mapping table (ScoredAtDate/Time -> scoredAt,
 * DueAtDate/Time -> dueAt) and ZJE_CASE's own due_at_date/due_at_time columns. Combines both back
 * into one ISO 8601 timestamp, the shape every type in this app expects. */
function combineDateTime(dateValue: unknown, timeValue: unknown): string {
  const isoDate = parseODataDate(dateValue);
  if (!isoDate) return '';
  const datePart = isoDate.split('T')[0];
  const timeMatch = typeof timeValue === 'string' ? timeValue.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
  const h = (timeMatch?.[1] || '0').padStart(2, '0');
  const m = (timeMatch?.[2] || '0').padStart(2, '0');
  const s = (timeMatch?.[3] || '0').padStart(2, '0');
  return `${datePart}T${h}:${m}:${s}Z`;
}

async function getEntitySet<T = Record<string, unknown>>(set: string, params: Record<string, string> = {}): Promise<T[]> {
  const { data } = await sapClient.get(`/${set}`, { params: { '$format': 'json', ...params } });
  const results = data?.d?.results ?? data?.value;
  return Array.isArray(results) ? (results as T[]) : [];
}

async function getEntity<T = Record<string, unknown>>(set: string, key: string): Promise<T | null> {
  const { data } = await sapClient.get(`/${set}(${key})`, { params: { '$format': 'json' } });
  const entity = data?.d;
  return entity ?? null;
}

const KNOWN_RISK_BANDS = new Set<RiskBand>(['Critical', 'High', 'Medium', 'Low']);
function toRiskBand(raw: unknown, fallback: RiskBand = 'Low'): RiskBand {
  const v = str(raw) as RiskBand;
  return KNOWN_RISK_BANDS.has(v) ? v : fallback;
}

// ---------------------------------------------------------------------------
// WorklistSet -> WorklistEntry[]
// Wire fields (per sap/ODATA_API_CONTRACT.md's ATOM field mapping + ZJE_DOCDATA/ZJE_DOCCTX):
// CompanyCode, FiscalYear, DocumentNo, FiscalPeriod, UserName, GlPair, Amount, CompositeScore,
// RiskBand, KeySignal, ScoredAtDate, ScoredAtTime.
// ---------------------------------------------------------------------------

function toWorklistEntry(raw: Record<string, unknown>): WorklistEntry {
  return {
    document: str(raw.DocumentNo),
    companyCode: str(raw.CompanyCode),
    fiscalYear: str(raw.FiscalYear) || undefined,
    period: raw.FiscalPeriod != null ? num(raw.FiscalPeriod) : undefined,
    userName: str(raw.UserName),
    glPair: str(raw.GlPair),
    amount: str(raw.Amount),
    risk: toRiskBand(raw.RiskBand),
    score: num(raw.CompositeScore),
    signal: str(raw.KeySignal),
    scoredAt: combineDateTime(raw.ScoredAtDate, raw.ScoredAtTime) || undefined,
  };
}

function buildWorklistFilter(filters: FilterDraft): string {
  const parts: string[] = [];
  if (filters.companyCode) parts.push(`CompanyCode eq '${escapeODataString(filters.companyCode)}'`);
  if (filters.period) parts.push(`FiscalPeriod eq ${Number(filters.period) || 0}`);
  if (filters.risk) parts.push(`RiskBand eq '${escapeODataString(filters.risk)}'`);
  return parts.join(' and ');
}

/** Risk-ranked journal worklist — GET WorklistSet, ordered by CompositeScore desc (see
 * ZCL_ZJE_ANOMALY_DPC_EXT's GET_ENTITYSET). `$top` is capped at 500 by the DPC (ZJE/TOO_MANY
 * above that); this always asks for <=200, matching the source API's own limit. */
export async function fetchWorklist(filters: FilterDraft): Promise<WorklistEntry[]> {
  if (!SAP_CONFIGURED) return MOCK_WORKLIST;
  try {
    const filter = buildWorklistFilter(filters);
    const rows = await getEntitySet<Record<string, unknown>>('WorklistSet', {
      '$top': '200',
      '$orderby': 'CompositeScore desc',
      ...(filter ? { '$filter': filter } : {}),
    });
    return rows.length ? rows.map(toWorklistEntry) : MOCK_WORKLIST;
  } catch {
    return MOCK_WORKLIST;
  }
}

// ---------------------------------------------------------------------------
// DashboardSet -> Summary
// Not fully enumerated in sap/ODATA_API_CONTRACT.md beyond "pre-aggregated KPI summary for one
// company code or ALL" — field names below are a best-effort PascalCase mapping matching the
// Summary shape every screen already renders; confirm against the real $metadata once
// ZJE_ANOMALY_SRV is deployed and adjust if any differ.
// ---------------------------------------------------------------------------

function toSummary(raw: Record<string, unknown>): Summary {
  return {
    journals: {
      entriesScored: num(raw.EntriesScored),
      flagged: num(raw.Flagged),
      critical: num(raw.Critical),
      high: num(raw.High),
      medium: num(raw.Medium),
      low: num(raw.Low),
      avgScore: num(raw.AvgScore),
      scoredLast24h: num(raw.ScoredLast24h),
      lastScoredAt: combineDateTime(raw.LastScoredAtDate, raw.LastScoredAtTime) || null,
    },
    cases: {
      openCases: num(raw.OpenCases),
      overdueCases: num(raw.OverdueCases),
      closedCases: num(raw.ClosedCases),
    },
  };
}

/** GET DashboardSet('ALL') or DashboardSet('<companyCode>') — one row, scoped like every other
 * read here through AUTHORITY-CHECK ZJE_ANOMALY_AUTH. */
export async function fetchSummary(companyCode: string): Promise<Summary> {
  if (!SAP_CONFIGURED) return MOCK_SUMMARY;
  try {
    const scope = companyCode && companyCode !== 'ALL' ? escapeODataString(companyCode) : 'ALL';
    const row = await getEntity<Record<string, unknown>>('DashboardSet', `Scope='${scope}'`);
    return row ? toSummary(row) : MOCK_SUMMARY;
  } catch {
    return MOCK_SUMMARY;
  }
}

// ---------------------------------------------------------------------------
// RiskScoreSet + DriverSet -> Explanation
// Wire fields: DriverSet's Code/Category/Contribution are read directly (source project's own
// GET /journals/{cc}/{fy}/{doc}/explanation shape); RiskScoreSet supplies the latest
// CompositeScore/RiskBand for the same document (ModelVersion/Seq ordered, latest first).
// ---------------------------------------------------------------------------

function toDriver(raw: Record<string, unknown>) {
  return { code: str(raw.Code), category: str(raw.Category), contribution: num(raw.Contribution) };
}

/** Explainable drivers behind one document's composite score — falls back to a representative
 * synthetic breakdown (matching the source prototype's own hardcoded Entry Explorer content) when
 * SAP isn't reachable, so the drawer/explorer always has something concrete to show. */
export async function fetchExplanation(entry: WorklistEntry): Promise<Explanation> {
  if (!SAP_CONFIGURED) return buildExplanation(entry);
  try {
    const filter = `CompanyCode eq '${escapeODataString(entry.companyCode)}' and FiscalYear eq '${escapeODataString(entry.fiscalYear ?? '')}' and DocumentNo eq '${escapeODataString(entry.document)}'`;
    const [scoreRows, driverRows] = await Promise.all([
      getEntitySet<Record<string, unknown>>('RiskScoreSet', { '$filter': filter, '$orderby': 'Seq desc', '$top': '1' }),
      getEntitySet<Record<string, unknown>>('DriverSet', { '$filter': filter, '$orderby': 'Seq desc' }),
    ]);
    if (scoreRows.length === 0 && driverRows.length === 0) return buildExplanation(entry);
    const latest = scoreRows[0];
    return {
      score: latest ? num(latest.CompositeScore) : entry.score,
      band: latest ? toRiskBand(latest.RiskBand, entry.risk) : entry.risk,
      drivers: driverRows.length ? driverRows.map(toDriver) : buildExplanation(entry).drivers,
    };
  } catch {
    return buildExplanation(entry);
  }
}

// ---------------------------------------------------------------------------
// CaseSet -> CaseRecord[] / create / update
// Wire fields (ZJE_CASE, per zcl_zje_anomaly_dpc_ext.abap): CaseId, CompanyCode, FiscalYear,
// DocumentNo, FiscalPeriod, Severity, Status, Disposition, AssignedTo, DueAtDate, DueAtTime,
// RowVersion, CreatedAtDate/Time, UpdatedAtDate/Time.
// ---------------------------------------------------------------------------

const KNOWN_CASE_STATUSES = new Set<CaseStatus>(['OPEN', 'IN_REVIEW', 'PENDING_APPROVAL', 'CLOSED']);

function toCaseRecord(raw: Record<string, unknown>): CaseRecord {
  const status = str(raw.Status) as CaseStatus;
  return {
    id: str(raw.CaseId),
    document: str(raw.DocumentNo),
    companyCode: str(raw.CompanyCode),
    fiscalYear: str(raw.FiscalYear),
    period: raw.FiscalPeriod != null ? num(raw.FiscalPeriod) : undefined,
    severity: toRiskBand(raw.Severity, 'Medium'),
    status: KNOWN_CASE_STATUSES.has(status) ? status : 'OPEN',
    disposition: raw.Disposition != null && raw.Disposition !== '' ? str(raw.Disposition) : null,
    assignedTo: raw.AssignedTo != null && raw.AssignedTo !== '' ? str(raw.AssignedTo) : null,
    dueAt: combineDateTime(raw.DueAtDate, raw.DueAtTime) || null,
    rowVersion: num(raw.RowVersion) || 1,
    createdAt: combineDateTime(raw.CreatedAtDate, raw.CreatedAtTime) || new Date().toISOString(),
    updatedAt: combineDateTime(raw.UpdatedAtDate, raw.UpdatedAtTime) || new Date().toISOString(),
  };
}

/** GET CaseSet, optionally filtered by Status — the maker-checker case queue. */
export async function fetchCases(status?: string): Promise<CaseRecord[]> {
  if (!SAP_CONFIGURED) return status ? MOCK_CASES.filter((c) => c.status === status) : MOCK_CASES;
  try {
    const rows = await getEntitySet<Record<string, unknown>>('CaseSet', {
      '$top': '200',
      '$orderby': 'CreatedAtDate desc',
      ...(status ? { '$filter': `Status eq '${escapeODataString(status)}'` } : {}),
    });
    return rows.map(toCaseRecord);
  } catch {
    return status ? MOCK_CASES.filter((c) => c.status === status) : MOCK_CASES;
  }
}

function randomIdempotencyKey(): string {
  // 32-char hex, well within the contract's 16-120 char requirement — matches
  // ZCL_ZJE_ANOMALY_DPC_EXT's own GEN_CASE_ID shape (GUID_CREATE, 32 uppercase hex chars).
  let hex = '';
  for (let i = 0; i < 32; i += 1) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

/** POST CaseSet — creates a governed investigation case only; never posts, pays or clears
 * anything in SAP (see ODATA_API_CONTRACT.md's write-operations table). Requires a fresh
 * Idempotency-Key per attempt; a replayed key returns the original case per the DPC's own
 * dedupe rule, so a caller is free to retry safely. Falls back to a client-simulated case when
 * SAP isn't reachable, same posture as cashflow-forecast's createAction. */
export async function createCase(input: {
  document: string;
  companyCode: string;
  fiscalYear: string;
  fiscalPeriod?: number;
  severity: RiskBand;
  rationale: string;
}): Promise<{ id: string; status: CaseStatus }> {
  if (!SAP_CONFIGURED) {
    await new Promise((r) => setTimeout(r, 350));
    return { id: `sim-${randomIdempotencyKey().slice(0, 12)}`, status: 'OPEN' };
  }
  try {
    const idempotencyKey = randomIdempotencyKey();
    const meta = await sapClient.get('/', { headers: { 'X-CSRF-Token': 'Fetch' } });
    const token = meta.headers?.['x-csrf-token'] ?? '';
    const { data } = await sapClient.post(
      '/CaseSet',
      {
        CompanyCode: input.companyCode,
        FiscalYear: input.fiscalYear,
        DocumentNo: input.document,
        FiscalPeriod: input.fiscalPeriod,
        Severity: input.severity,
        Rationale: input.rationale,
      },
      { headers: { 'Idempotency-Key': idempotencyKey, ...(token ? { 'X-CSRF-Token': token } : {}) } }
    );
    const body = data?.d || data;
    return { id: str(body?.CaseId) || idempotencyKey, status: (str(body?.Status) as CaseStatus) || 'OPEN' };
  } catch (err: any) {
    const code = err?.response?.data?.error?.code?.value;
    if (code === 'ZJE/OPEN_CASE_EXISTS') {
      const existingId = err?.response?.data?.error?.innererror?.existingId;
      throw new Error(existingId ? `An open case already exists for this document (${existingId}).` : 'An open case already exists for this document.');
    }
    await new Promise((r) => setTimeout(r, 350));
    return { id: `sim-${randomIdempotencyKey().slice(0, 12)}`, status: 'OPEN' };
  }
}

/** MERGE CaseSet('CaseId') — status/assignee/disposition updates only, optimistic-locked on
 * RowVersion (see ODATA_API_CONTRACT.md — a stale version returns 409 ZJE/STALE_VERSION with the
 * current version, surfaced here as a thrown Error so the caller can refetch and retry). */
export async function updateCase(id: string, patch: { status?: CaseStatus; disposition?: string; rowVersion: number }): Promise<void> {
  if (!SAP_CONFIGURED) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  try {
    await sapClient.request({
      method: 'MERGE' as any,
      url: `/CaseSet('${escapeODataString(id)}')`,
      data: { Status: patch.status, Disposition: patch.disposition, RowVersion: patch.rowVersion },
    });
  } catch (err: any) {
    const code = err?.response?.data?.error?.code?.value;
    if (code === 'ZJE/STALE_VERSION') {
      const currentRowVersion = err?.response?.data?.error?.innererror?.currentRowVersion;
      throw new Error(currentRowVersion ? `This case changed since it was loaded (now version ${currentRowVersion}) — refresh and try again.` : 'This case changed since it was loaded — refresh and try again.');
    }
    if (code === 'ZJE/DISPOSITION_REQUIRED') {
      throw new Error('A disposition is required to close this case.');
    }
    throw new Error(err instanceof Error ? err.message : 'Could not update this case.');
  }
}

export async function fetchCompanyCodeOptions(): Promise<CompanyCodeOption[]> {
  return MOCK_COMPANY_CODES;
}
