import { fn, get, isOk, odataKey, type FnResult } from '@/lib/api';
import type { LiveState } from './logic';

/** Run a function import; SAP can answer 200 with Success=false + Message, which must surface as an error (never as success). */
export async function act(name: string, params: Record<string, string>): Promise<FnResult> {
  const r = await fn(name, params);
  const explicit = r && r.Success !== undefined && r.Success !== null;
  if (explicit && !isOk(r)) throw new Error(String(r.Message || `${name} was not accepted by SAP.`));
  return r;
}

/** Live Status/CurrLevel of one document straight from SAP (the optimistic-concurrency re-read). null = SAP does not know it (gone / no access). */
export function readLive(type: 'CPE' | 'BUD', id: string): Promise<LiveState | null> {
  return type === 'BUD'
    ? get<LiveState>(`BudgetSet${odataKey(id)}`, { $select: 'Budgetid,Status,CurrLevel' })
    : get<LiveState>(`CPESet${odataKey(id)}`, { $select: 'Cpeid,Status,CurrLevel' });
}
