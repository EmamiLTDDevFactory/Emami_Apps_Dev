'use client';
import type { CostLine, MaterialRow, PlantRow } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import type { CostQuery, PageRequest } from '../query/schema';
import type { TableTotals } from '../server/table';

import { bffBase, readSession, signinUrl, writeSession } from './session';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: SapMessage[] = [], public issues: { path: string; message: string }[] = []) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const token = readSession()?.token;
    res = await fetch(`${bffBase()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) },
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Network error - could not reach the server.', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      writeSession(null);
      window.location.href = signinUrl();
    }
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.details ?? [], body.issues ?? []);
  }
  return body as T;
}

export interface CostResult {
  rows: CostLine[];
  messages: SapMessage[];
  ms: number;
  total: number;
}
export interface PagedResult<T = Record<string, unknown>> {
  rows: T[];
  total: number;
  totals: TableTotals;
  messages: SapMessage[];
  ms: number;
  cached: boolean;
}

export const api = {
  cost: (query: CostQuery, signal?: AbortSignal) => call<CostResult>('/api/cost', { method: 'POST', body: JSON.stringify({ query }), signal }),
  paged: (query: CostQuery, page: Partial<PageRequest>, signal?: AbortSignal) => call<PagedResult>('/api/cost', { method: 'POST', body: JSON.stringify({ query, page }), signal }),
  plants: () => call<{ plants: PlantRow[] }>('/api/plants'),
  materials: (q: string, signal?: AbortSignal) => call<{ materials: MaterialRow[] }>(`/api/materials?q=${encodeURIComponent(q)}`, { signal }),
  config: () => call<Record<string, string> & { user: { email: string; plants: string[]; role: string }; mock: boolean }>('/api/config'),
};
