/**
 * Client of the MDM dashboard (SAP area DASH, class ZCL_MM_MDM_ADM_DASH): hub POST /me/mm-mdm-admin/DASH/<op>.
 * Everything is read live from SAP and read only. Timestamps from SAP are plain server-time strings ("2026-11-20T11:30:18", no zone);
 * they are formatted here by slicing the string, never through Date, so no time zone shift is applied.
 */
import { adminCall } from './adminApi';

export interface DashApp { appId: string; label: string; group: string; firstClass: boolean; known: boolean; total: number }
export interface DashMeta {
  apps: DashApp[];
  statuses: { code: string; label: string }[];
  flags: { code: string; label: string }[];
  buckets: { code: string; label: string; stale: boolean }[];
  staleDays: number;
  scope: { admin: boolean; restricted: boolean; users: string[]; message: string };
  now: string;
}

export interface DashRow {
  transId: string; appId: string; appText: string; objValue: string; description: string; materialType: string; plant: string;
  status: string; statusText: string; wfState: string; isOpen: boolean; flags: string[];
  initiator: string; initiatorName: string; created: string; lastAction: string; tatSeconds: number;
  pendingLevel: string; pendingType: string; pendingDept: string; pendingAgents: string; pendingNames: string; pendingItems: number;
  pendingSince: string; ageSeconds: number; ageBucket: string; stale: boolean; duplicate: boolean; topWiId: string; route: string;
}
export interface DashPage { total: number; page: number; pageSize: number; rows: DashRow[]; dateFrom: string; dateTo: string; restricted: boolean; message: string; generated: string }

export interface Count { code: string; label: string; count: number }
export interface Stage {
  appId: string; level: string; roleType: string; requests: number; fresh: number; stale: number; workItems: number; agents: number;
  oldestAge: number; avgAge: number; depts: { dept: string; workItems: number; requests: number }[];
}
export interface AgentRow {
  agent: string; name: string; requests: number; fresh: number; stale: number; workItems: number; oldestAge: number; avgAge: number;
  byApp: { appId: string; appText: string; count: number }[];
}
export interface Overview {
  window: {
    dateFrom: string; dateTo: string; total: number; byStatus: Count[]; inProgressOld: number; completed: number; duplicates: number;
    avgTatSeconds: number; medianTatSeconds: number; tatSamples: number; byApp: { appId: string; appText: string; count: number }[];
  };
  now: { openReal: number; openFresh: number; openStale: number; broken: number; byFlag: Count[]; byStatusAll: Count[] };
  stages: Stage[]; agents: AgentRow[]; agentCount: number; aging: { appId: string; bucket: string; requests: number }[];
  scope: string; restricted: boolean; generated: string;
}

export interface Step {
  serial: number; level: string; role: string; roleType: string; dept: string; user: string; userName: string; at: string;
  stepSeconds: number; status: string; statusText: string;
}
export interface PendingItem { wiId: string; agent: string; agentName: string; task: string; roleType: string; dept: string; since: string; ageSeconds: number; stale: boolean }
export interface Detail { request: DashRow; steps: Step[]; pending: PendingItem[]; phases: { type: string; state: string }[]; levelSource: string; generated: string }

export interface ChangeHeader { changeNr: string; user: string; userName: string; at: string; tcode: string; planChange: string }
export interface ChangeItem { tabname: string; tabkey: string; fname: string; fieldText: string; changeInd: string; valueOld: string; valueNew: string }
export interface ChangeLog {
  transId: string; appId: string; supported: boolean; note: string; objectClass: string; objectId: string; total: number; truncated: boolean;
  headers: ChangeHeader[]; items: ChangeItem[];
}

/** Request of the list; every field optional, AND semantics as in the old board */
export interface DashQuery {
  transId?: string; user?: string; apps?: string[]; status?: string; statusGroup?: '' | 'inprogress' | 'open' | 'broken' | 'stale';
  mtype?: string; plant?: string; genField2?: string; objValue?: string; text?: string; dateFrom?: string; dateTo?: string; allDates?: boolean;
  duplicate?: '' | 'Y' | 'N'; agent?: string; level?: string; roleType?: string; dept?: string; ageBucket?: string; flag?: string;
  excludeStale?: boolean; page?: number; pageSize?: number; sort?: string; dir?: 'asc' | 'desc';
}

async function call<T>(op: string, q: Record<string, unknown> = {}): Promise<T> {
  const r = await adminCall<{ ok: boolean; data: T }>('DASH', op, q);
  return r.data;
}
export const dashMeta = () => call<DashMeta>('meta');
export const dashOverview = (q: DashQuery) => call<Overview>('overview', { ...q });
export const dashList = (q: DashQuery) => call<DashPage>('list', { ...q });
export const dashDetail = (transId: string) => call<Detail>('detail', { transId });
export const dashChanges = (transId: string) => call<ChangeLog>('changes', { transId });
export const dashChangeItems = (transId: string, changeNr: string) => call<ChangeLog>('changeitems', { transId, changeNr });

/* ---------- formatting ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-20T11:30:18" -> "20 Nov 2026, 11:30" (SAP server time, no zone conversion) */
export function fmtTs(iso: string, withTime = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || '');
  if (!m) return '—';
  const day = `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return withTime && m[4] ? `${day}, ${m[4]}:${m[5]}` : day;
}
/** Compact duration: "45 s", "12 min", "5 h 10 min", "3 d 4 h", "2.4 y" */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 365) return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
  return `${(d / 365).toFixed(1)} y`;
}
export const fmtAge = (sec: number) => (sec < 3600 ? 'under 1 h' : fmtDur(sec));
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };

/** Request status -> badge class (same colours as the rest of the app) */
export const STATUS_CLS: Record<string, string> = { '00': 'badge-neutral', '01': 'badge-info', '02': 'badge-info', '03': 'badge-success', '04': 'badge-warn', '05': 'badge-error' };

/** Level text: "L0" is the initiator, "L2" is level 2 */
export const levelLabel = (l: string) => (l === 'L0' ? 'L0 Initiator' : l || 'Level unknown');

export const APPROX_NOTE = 'Waiting since = creation time of the READY work item (SWWWIHEAD.WI_CD/WI_CT). Level = container element LEVEL of the top workflow item, '
  + 'read from the container XML in SAP table SWWCNTP0 (checked equal to the workflow API on every open request when this screen was built). '
  + 'Role type and department come from the task of the waiting work item; when the task names no department, the role table WF_ROLE (as configured now) is used.';

const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** CSV of the rows on screen (UTF-8 with BOM so Excel opens it correctly) */
export function exportRowsCsv(rows: DashRow[], statusLabel: (c: string) => string) {
  const head = ['T-ID', 'App', 'Application', 'SAP code', 'Description', 'Material type', 'Plant', 'Status', 'Workflow', 'Flags', 'Initiator', 'Created', 'Last action',
    'Turnaround (s)', 'Waiting at level', 'Role type', 'Department', 'Pending with', 'Waiting since', 'Age (s)', 'Stale', 'Duplicate'];
  const lines = rows.map((r) => [r.transId, r.appId, r.appText, r.objValue, r.description, r.materialType, r.plant, statusLabel(r.status), r.wfState, r.flags.join(' '),
    r.initiatorName || r.initiator, r.created, r.lastAction, r.tatSeconds, r.pendingLevel, r.pendingType, r.pendingDept, r.pendingNames || r.pendingAgents,
    r.pendingSince, r.ageSeconds, r.stale ? 'yes' : 'no', r.duplicate ? 'yes' : 'no']);
  const blob = new Blob(['﻿' + [head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `mdm-dashboard-${isoDay(new Date())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
