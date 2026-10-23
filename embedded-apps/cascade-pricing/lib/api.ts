import { mockAction, mockGetSet, MockError } from './mock';
import type { ActionRequest, ActionResult, CascadeSet, Row } from './types';

/** On while the SAP service is not available (next.config.mjs, CASCADE_MOCK=false turns it off). */
export const MOCK_MODE = process.env.NEXT_PUBLIC_CASCADE_MOCK !== 'false';

/** The service that fronts SAP: GET <base>/cascade/{set}, POST <base>/action. The browser never calls SAP itself. */
const API_BASE = (process.env.NEXT_PUBLIC_CASCADE_API_BASE || `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api`).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' && body.error ? body.error : `Request failed (${res.status}).`;
}

export async function getSet(set: CascadeSet): Promise<Row[]> {
  if (MOCK_MODE) return mockGetSet(set);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/cascade/${encodeURIComponent(set)}`, { cache: 'no-store', credentials: 'include' });
  } catch {
    throw new ApiError('Could not reach the pricing service. Check your connection.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new ApiError('Unexpected answer from the pricing service.', 502);
  return data as Row[];
}

export async function postAction(req: ActionRequest): Promise<ActionResult> {
  if (MOCK_MODE) {
    try {
      return await mockAction(req);
    } catch (e) {
      if (e instanceof MockError) throw new ApiError(e.message, e.status);
      throw e;
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req), credentials: 'include' });
  } catch {
    throw new ApiError('Could not reach the pricing service. Check your connection.', 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  const body = (await res.json()) as Partial<ActionResult>;
  return { processed: Number(body.processed ?? 0), failed: Number(body.failed ?? 0), message: String(body.message ?? ''), data: typeof body.data === 'string' ? body.data : '' };
}

/** The action's data field (a JSON string) as rows; empty when absent or not a row array. */
export function parseRows(result: ActionResult): Row[] {
  if (!result.data) return [];
  try {
    const v: unknown = JSON.parse(result.data);
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Row[]) : [];
  } catch {
    return [];
  }
}
