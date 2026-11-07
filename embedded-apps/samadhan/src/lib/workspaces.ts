/*
   v7 Phase 3: workspaces (service desks) and applications on the client (master prompt §H 6 / 7, §N 2).
   Pure helpers over /meta. On an older backend (or before migration 7.2) meta has no workspaces / applications and
   every helper answers as before: one desk, "#id" references, the top-level fields and category tree.
*/
import type { Application, CategoryNode, FieldDef, Meta, RecordClass, Status, Workspace } from './types';

/** The multi-desk mode (Admin > Workspaces). Off = the UI looks exactly as before (no switcher). */
export const multiDesk = (meta: Meta) => meta.options?.['workspaces.enabled'] === true && (meta.workspaces?.length ?? 0) > 1;

export const workspaceById = (meta: Meta, id: number | null | undefined): Workspace | undefined => meta.workspaces?.find((w) => w.id === id);
export const workspaceByKey = (meta: Meta, key: string | null | undefined): Workspace | undefined => (key ? meta.workspaces?.find((w) => w.key === key) : undefined);
export const appById = (meta: Meta, id: number | null | undefined): Application | undefined => meta.applications?.find((a) => a.id === id);

/** Workspaces tickets can be in now (Secondary Sales always; others with the flag on). */
export const availableWorkspaces = (meta: Meta): Workspace[] => (meta.workspaces ?? []).filter((w) => w.available);
/** Applications that can be picked now (active, workspace available), in Admin order. */
export const availableApps = (meta: Meta): Application[] => (meta.applications ?? []).filter((a) => a.available);

/** Readable reference: MSFA-100123 (or "#100123" when the ticket has no application, e.g. an older backend). */
export function refOf(meta: Meta, t: { id: number; applicationId?: number | null; ref?: string | null }): string {
  if (t.ref && t.ref.includes('-')) return t.ref;
  const app = appById(meta, t.applicationId ?? null);
  return app ? `${app.code}-${t.id}` : `#${t.id}`;
}

/** Fields and category tree for a workspace (top-level = Secondary Sales, as before). */
export function fieldsFor(meta: Meta, workspaceKey?: string | null): { fields: FieldDef[]; tree: CategoryNode[] } {
  const ws = workspaceKey ? meta.byWorkspace?.[workspaceKey] : null;
  return ws ? { fields: ws.fields, tree: ws.tree } : { fields: meta.fields, tree: meta.categoryTree };
}

/** "Category" / "Function" labels of a workspace (SAP: Module / Sub-process). */
export function labelsFor(meta: Meta, workspaceId?: number | null) {
  const w = workspaceById(meta, workspaceId);
  return { category: w?.categoryLabel || 'Category', function: w?.functionLabel || 'Function' };
}

/** Statuses offered in a workspace: a status with no workspace mapping is offered everywhere. */
export function statusesFor(meta: Meta, workspaceId?: number | null): Status[] {
  const map = meta.statusWorkspaces ?? [];
  if (!workspaceId || !map.length) return meta.statuses;
  return meta.statuses.filter((s) => { const rows = map.filter((m) => m.statusId === s.id); return !rows.length || rows.some((m) => m.workspaceId === workspaceId); });
}

/** Groups offered in a workspace: a group without a workspace is offered everywhere. */
export function groupsFor(meta: Meta, workspaceId?: number | null) {
  const gw = meta.groupWorkspaces ?? {};
  if (!workspaceId) return meta.groups;
  return meta.groups.filter((g) => !gw[g.id] || gw[g.id] === workspaceId);
}

/** Impact x Urgency priority for a workspace in that mode (null = the severity matrix decides). */
export function matrixPriority(meta: Meta, workspaceId: number | null | undefined, impact?: number | null, urgency?: number | null): number | null {
  const w = workspaceById(meta, workspaceId);
  if (!w || w.priorityMode === 'SEVERITY_MATRIX' || !impact || !urgency) return null;
  return meta.priorityMatrix?.find((m) => m.workspaceId === w.id && m.impact === impact && m.urgency === urgency)?.priority ?? null;
}
export const usesImpactUrgency = (meta: Meta, workspaceId?: number | null) => {
  const w = workspaceById(meta, workspaceId);
  return !!w && w.priorityMode !== 'SEVERITY_MATRIX';
};

export const RECORD_CLASS_LABEL: Record<RecordClass, string> = {
  INCIDENT: 'Incident', SERVICE_REQUEST: 'Service request', ACCESS_REQUEST: 'Access request', CHANGE: 'Change', PROBLEM: 'Problem',
  QUERY: 'Query', ENHANCEMENT: 'Enhancement', DEFECT: 'Defect', TASK: 'Task', RISK: 'Risk',
};
export const CLASSIFICATION_LABEL: Record<string, string> = {
  manual: 'Set by an agent', subject_tag: 'From the subject tag', keyword: 'From keywords', sender_rule: 'From a sender rule', ai: 'Suggested by AI',
  default: 'Default (not recognised)', backfill: 'From the v7 upgrade',
};
/** Shown with Confirm / Change in the ticket header (§J). */
export const needsReview = (source?: string | null, confidence?: number | null) =>
  source === 'default' || source === 'ai' || (source === 'keyword' && (confidence ?? 0) < 0.8);

/** Colour chip per workspace (design tokens of the app). */
export const WS_TONE: Record<string, string> = {
  accent: 'bg-accent/10 text-accent border-accent/30', info: 'bg-plum/10 text-plum border-plum/30', warn: 'bg-warn/10 text-warn border-warn/30',
  good: 'bg-good/10 text-good border-good/30', bad: 'bg-bad/10 text-bad border-bad/30',
};
export const wsTone = (w?: Workspace) => WS_TONE[w?.color ?? 'accent'] ?? WS_TONE.accent;
