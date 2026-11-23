/**
 * Client for the Publicity Expenses routes of the shared Emami Apps backend (backend/publicityExpenses/, mounted at
 * /api/me/publicity-expenses - rides the existing nginx /api/me rule). The hub session JWT goes as a Bearer token; the
 * backend checks the Publicity Expenses grant in Manage Access. A dev.emamiapps.in page reads the dev backend through
 * /dev-api (same split as the sibling apps). NEXT_PUBLIC_PUBEXP_API_URL overrides the base (local development).
 */
import { getHubToken } from './hub';
import type { AppConfig, Breakdown, DetailRow, Meta, SummaryRow, TrendMonth } from './types';

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

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}${q.toString() ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${getHubToken()}` }, cache: 'no-store' });
  } catch {
    throw new ApiError('Could not reach the Emami Apps server. Check your connection and try again.', 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    throw new ApiError(body?.error || `The server answered ${res.status}.`, res.status);
  }
  return body as T;
}

export interface Period { fy: string; period: number; company?: string; refresh?: boolean }
const qp = (p: Period) => ({ fy: p.fy, period: p.period, company: p.company, refresh: p.refresh ? 1 : undefined });

export const api = {
  config: () => get<{ config: AppConfig }>('/config').then((b) => b.config),
  summary: (p: Period) => get<{ rows: SummaryRow[]; meta: Meta }>('/summary', qp(p)),
  detail: (p: Period, cell: { key: string; gl?: string; site?: string }) => get<{ rows: DetailRow[]; meta: Meta }>('/detail', { ...qp(p), ...cell }),
  trend: (p: Period) => get<{ months: TrendMonth[]; meta: Meta }>('/trend', qp(p)),
  breakdown: (p: Period) => get<Breakdown>('/breakdown', qp(p)),
};
