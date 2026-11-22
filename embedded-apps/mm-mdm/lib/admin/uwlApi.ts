import { adminCall } from './adminApi';

export interface UwlItem {
  wiId: string; topWiId: string; task: string; text: string;
  appId: string; appName: string; transId: string; objValue: string;
  reqStatus: string; statusText: string; level: string; levelNote: string;
  agents: string; agentNames: string; initiator: string; initiatorName: string;
  created: string; ageDays: number; slaDays: number; slaBreached: boolean; stale: boolean; orphan: boolean;
}
export interface UwlCount { key: string; label: string; n: number; breached: number }
export interface UwlPage {
  scope: 'my' | 'all' | 'own'; asOf: string; staleDays: number; user: string; sapUsers: string[]; note: string;
  total: number; top: number; skip: number; sort: string; dir: 'asc' | 'desc';
  counts: { open: number; breached: number; stale: number; closedRequests: number; oldestDays: number; byApp: UwlCount[]; byLevel: UwlCount[]; byStatus: UwlCount[]; byAgent: UwlCount[] };
  items: UwlItem[];
}
export interface UwlMeta { apps: UwlCount[]; levels: UwlCount[]; statuses: UwlCount[]; staleDays: number; defaultDays: number }
export interface UwlQuery {
  app?: string; initiator?: string; agent?: string; from?: string; to?: string; status?: string; level?: string; q?: string;
  breached?: boolean; staleOnly?: boolean; allDates?: boolean; sort?: string; dir?: string; top?: number; skip?: number;
}

/** The SAP area class answers {ok:true,data} or {ok:false,messages}; the hub turns the latter into an error with the SAP messages */
async function call<T>(op: string, q: Record<string, unknown> = {}): Promise<T> {
  const r = await adminCall<T | { ok: boolean; data: T }>('UWL', op, q);
  // the hub already hands over SAP's data part; accept the {ok,data} envelope too
  return (r && typeof r === 'object' && 'ok' in r && 'data' in r ? (r as { data: T }).data : r) as T;
}
export const uwlMy = (q: UwlQuery) => call<UwlPage>('my', { ...q });
export const uwlAll = (q: UwlQuery) => call<UwlPage>('all', { ...q });
export const uwlMeta = () => call<UwlMeta>('meta');

/** Apps whose requests open in this application (route requestHref); every other app lives in the legacy Web Dynpro apps */
export const OPENS_HERE = new Set(['MC', 'MX', 'ME']);

export const SLA_HINT = 'Age in calendar days since the work item was created, compared with the SLA of the app family from /INOWITS/WF_SLA '
  + '(reviewer 4 days, approver 6). SAP does not store on the work item whether it is a review or an approval step, so the larger value (approver) is used: '
  + 'an item flagged here is late for sure, an item not flagged may still be late as a reviewer step. Items of closed requests are not flagged.';
export const LEVEL_HINT = 'Derived from /INOWITS/TRANS_I: the highest completed level plus one (sent back = L0). The workflow container is not read per row, so for unusual routes this can differ from the level SAP shows inside the request.';

export const ageText = (d: number) => (d <= 0 ? 'today' : d === 1 ? '1 day' : d < 365 ? `${d} days` : `${(d / 365).toFixed(1)} years`);
