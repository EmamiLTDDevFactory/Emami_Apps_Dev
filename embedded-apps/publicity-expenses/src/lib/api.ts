/**
 * Client for the Publicity Expenses routes of the shared Emami Apps backend (backend/publicityExpenses/, mounted at
 * /api/me/publicity-expenses - rides the existing nginx /api/me rule). The hub session JWT goes as a Bearer token; the
 * backend checks the Publicity Expenses grant in Manage Access. A dev.emamiapps.in page reads the dev backend through
 * /dev-api (same split as the sibling apps). NEXT_PUBLIC_PUBEXP_API_URL overrides the base (local development).
 */
import { compactPeriods } from './format';
import { getHubToken } from './hub';
import type {
  AppConfig, AuditEntry, Breakdown, BudgetLine, BudgetStatus, Candidate, DrillRequest, DrillResult, Impact, MappingInfo, Mapping, Me, Meta, Rule, RuleWithImpact,
  SummaryRow, TemplateLine, TrendMonth, UploadResult, UploadRow, ExclusionMeta, Dimension,
} from './types';

const API_HOST = 'https://audit-capa-api.emamiapps.in';

function apiBase(): string {
  const override = process.env.NEXT_PUBLIC_PUBEXP_API_URL;
  if (override) return override.replace(/\/+$/, '');
  const isDev = typeof window !== 'undefined' && window.location.hostname.includes('dev');
  return `${API_HOST}${isDev ? '/dev-api' : ''}/api/me/publicity-expenses`;
}

/** 401 = no / expired hub session, 403 = signed in but no Publicity Expenses access. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, params: Record<string, string | number | undefined> = {}, body?: unknown): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}${q.toString() ? `?${q}` : ''}`, {
      method,
      headers: { Authorization: `Bearer ${getHubToken()}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check your connection and try again.', 0);
  }
  const answer = await res.json().catch(() => null);
  if (!res.ok || !answer || answer.success === false) {
    throw new ApiError(answer?.error || `The server answered ${res.status}.`, res.status);
  }
  return answer as T;
}
const get = <T>(path: string, params: Record<string, string | number | undefined> = {}) => call<T>('GET', path, params);

/** The selection every data call carries: fiscal year, periods (added up; P01..Pn = YTD), companies (empty = all). */
export interface Period { fy: string; periods: number[]; companies: string[]; refresh?: boolean; excl?: boolean; /** settings revision: changes after a save so screens refetch */ rev?: number }
const qp = (p: Period) => ({ fy: p.fy, periods: compactPeriods(p.periods), companies: p.companies.join(',') || undefined, refresh: p.refresh ? 1 : undefined, exclusions: p.excl === false ? 'off' : undefined });
const body = (p: Period) => ({ fy: p.fy, periods: compactPeriods(p.periods), companies: p.companies, exclusions: p.excl === false ? 'off' : undefined });
export type RuleInput = Omit<Rule, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'>;

export const api = {
  me: () => get<Me>('/me'),
  config: () => get<{ config: AppConfig }>('/config').then((b) => b.config),
  summary: (p: Period) => get<{ rows: SummaryRow[]; meta: Meta }>('/summary', qp(p)),
  /** POST: a sub-total can carry hundreds of report rows. */
  detail: (p: Period, req: DrillRequest) => call<DrillResult>('POST', '/detail', {}, { ...body(p), ...req }),
  trend: (p: Period) => get<{ months: TrendMonth[]; periods: number[]; meta: Meta }>('/trend', qp(p)),
  breakdown: (p: Period) => get<Breakdown>('/breakdown', qp(p)),
  // Admin
  rules: (p: Period) => get<{ rules: RuleWithImpact[]; total: ExclusionMeta; reportTotal: number; dimensions: Dimension[] }>('/exclusions', qp(p)),
  candidates: (p: Period, dimension: string) => get<{ values: Candidate[] }>('/exclusions/candidates', { ...qp(p), dimension }).then((b) => b.values),
  previewRule: (p: Period, rule: Pick<RuleInput, 'dimension' | 'values' | 'pattern'>) => call<{ impact: Impact }>('POST', '/exclusions/preview', {}, { ...body(p), rule }).then((b) => b.impact),
  createRule: (r: RuleInput) => call<{ rule: Rule }>('POST', '/exclusions', {}, r).then((b) => b.rule),
  updateRule: (id: number, r: RuleInput) => call<{ rule: Rule }>('PUT', `/exclusions/${id}`, {}, r).then((b) => b.rule),
  deleteRule: (id: number) => call<{ rule: Rule }>('DELETE', `/exclusions/${id}`),
  bulkRules: (rows: unknown[], dryRun: boolean, fileName: string) => call<{ errors: { row: number; message: string }[]; valid: number; created: Rule[] }>('POST', '/exclusions/bulk', {}, { rows, dryRun, fileName }),
  budget: (fy: string) => get<BudgetStatus>('/budget', { fy }),
  budgetTemplate: (p: Period, kind: 'OB' | 'RB') => get<{ lines: TemplateLine[] }>('/budget/template', { ...qp(p), kind }).then((b) => b.lines),
  uploadBudget: (body: { fy: number; kind: 'OB' | 'RB'; unit: string; rows: UploadRow[]; fileName: string; note: string; dryRun: boolean }) => call<UploadResult>('POST', '/budget/upload', {}, body),
  budgetLines: (id: number) => get<{ lines: BudgetLine[] }>(`/budget/versions/${id}/lines`).then((b) => b.lines),
  activateBudget: (id: number) => call('POST', `/budget/versions/${id}/activate`, {}, {}),
  deactivateBudget: (fy: number, kind: 'OB' | 'RB') => call('POST', '/budget/deactivate', {}, { fy, kind }),
  mapping: (p: Period) => get<MappingInfo>('/settings/mapping', qp(p)),
  saveMapping: (mapping: Mapping) => call('PUT', '/settings/mapping', {}, { mapping }),
  audit: () => get<{ entries: AuditEntry[] }>('/audit').then((b) => b.entries),
};
