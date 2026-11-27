/** Pure helpers of the workflow maintenance screen: draft editing, the live routing preview, unsaved-change detection. */
import { WfAgent, WfCfg, WfGroup, WfKey, WfLevel, WfView } from './wfApi';

export const OPEN_END = '9999-12-31';
export const todayIso = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

export const AREA_LABEL: Record<string, string> = { R: 'Reviewer', A: 'Approver', I: 'Initiator' };
export const TYPE_LABEL: Record<string, string> = { '01': 'Sequential', '02': 'Parallel' };

export const keyText = (k: Partial<WfKey>) => [k.appId, k.genType, k.genField, k.genField2, k.genField3, k.genField4].filter(Boolean).join(' / ');
export const sameKey = (a: WfKey, b: WfKey) =>
  a.appId === b.appId && a.genType === b.genType && a.genField === b.genField && a.genField2 === b.genField2 && a.genField3 === b.genField3 && a.genField4 === b.genField4;

export const emptyGroup = (appId: string): WfGroup => ({ appId, genType: '', genField: '', genField2: '', genField3: '', genField4: '', levels: [], l0Views: [] });

/** The level number of "L12" (0 when it is not a level id) */
export const lvlNum = (lvl: string) => { const m = /^L(\d+)$/i.exec(lvl || ''); return m ? Number(m[1]) : 0; };
export const nextLevelId = (g: WfGroup) => `L${g.levels.reduce((m, l) => Math.max(m, lvlNum(l.lvl)), 0) + 1}`;

/** Counted = gets a work item: active, an approver, end date not in the past (the same rule SAP applies when it saves) */
export const isCounted = (a: WfAgent, today = todayIso()) => a.active && a.isAppr && !!a.endDate && a.endDate >= today;
export const isExpired = (a: WfAgent, today = todayIso()) => a.active && !!a.endDate && a.endDate < today;

/** Counters as SAP recomputes them on save: sequential minimum = number of approvers */
export function recount(l: WfLevel): WfLevel {
  const n = l.agents.filter((a) => isCounted(a)).length;
  return { ...l, maxRole: n, counted: n, minAppr: l.type === '01' ? n : l.minAppr };
}

export function newLevel(g: WfGroup): WfLevel {
  const hasApprover = g.levels.some((l) => l.typeLvl === 'A');
  return { typeLvl: hasApprover ? 'R' : 'A', lvl: nextLevelId(g), levelText: '', maxRole: 0, minAppr: 1, type: '01', active: true, pirType: '', agents: [], views: [] };
}

export function newAgent(l: WfLevel): WfAgent {
  const next = l.agents.reduce((m, a) => Math.max(m, Number(a.role) || 0), 0) + 1;
  return { role: String(Math.min(next, 99)).padStart(2, '0'), startDate: todayIso(), endDate: OPEN_END, agent: '', name: '', isAppr: true, levelText: '', mailId: '', email: '', active: true, userF: '', dept: '' };
}

/** Engine order: Initiator, reviewers, approvers; numeric level number inside */
export const flowOrder = (levels: WfLevel[]) =>
  [...levels].sort((a, b) => ({ I: 1, R: 2, A: 3 } as Record<string, number>)[a.typeLvl] - ({ I: 1, R: 2, A: 3 } as Record<string, number>)[b.typeLvl] || lvlNum(a.lvl) - lvlNum(b.lvl));

export const swapRoles = (l: WfLevel, i: number, j: number): WfLevel => {
  if (j < 0 || j >= l.agents.length) return l;
  const agents = l.agents.map((a) => ({ ...a }));
  const t = agents[i].role; agents[i].role = agents[j].role; agents[j].role = t;
  [agents[i], agents[j]] = [agents[j], agents[i]];
  return { ...l, agents };
};

export interface PreviewAgent { agent: string; label: string; receives: 'workitem' | 'notification'; role: string; note: string }
export interface PreviewLevel { lvl: string; typeLvl: string; area: string; wfType: string; rule: string; active: boolean; agents: PreviewAgent[]; levelText: string }

/** Who gets what, computed from the draft in the browser (the SAP engine check works on the saved version) */
export function previewFlow(g: WfGroup): PreviewLevel[] {
  const today = todayIso();
  return flowOrder(g.levels).filter((l) => l.typeLvl).map((l) => {
    const n = l.agents.filter((a) => isCounted(a, today)).length;
    const rule = !n ? 'nobody can approve' : l.type === '02' ? `${Math.min(l.minAppr || 1, n)} of ${n} approvers, in parallel` : n === 1 ? 'one approver' : `all ${n} approvers, one after the other`;
    const agents: PreviewAgent[] = [...l.agents].sort((a, b) => a.role.localeCompare(b.role)).filter((a) => a.active && (!a.endDate || a.endDate >= today)).map((a) => ({
      agent: a.agent || a.mailId, label: a.name && a.name !== a.agent ? `${a.name} (${a.agent})` : a.agent || a.mailId, role: a.role,
      receives: (isCounted(a, today) ? 'workitem' : 'notification') as 'workitem' | 'notification',
      note: a.isAppr ? '' : 'mail only, does not approve',
    })).filter((a) => a.agent);
    return { lvl: l.lvl, typeLvl: l.typeLvl, area: AREA_LABEL[l.typeLvl] || l.typeLvl, wfType: TYPE_LABEL[l.type] || '', rule, active: l.active, agents, levelText: l.levelText };
  });
}

/** Comparable form of a draft (ignores the fields SAP computes) */
export function snapshot(g: WfGroup): string {
  const view = (v: WfView) => [v.agent, v.viewName, v.active, v.readOnly];
  return JSON.stringify([
    g.appId, g.genType, g.genField, g.genField2, g.genField3, g.genField4,
    g.l0Views.map(view),
    g.levels.map((l) => [l.typeLvl, l.lvl, l.levelText, l.type, l.active, l.pirType, l.type === '02' ? l.minAppr : 0,
      l.agents.map((a) => [a.role, a.startDate, a.endDate, a.agent, a.isAppr, a.levelText, a.isAppr ? '' : a.mailId, a.active, a.userF, a.dept]), l.views.map(view)]),
  ]);
}

/** SAP leaves the value-help kind empty for 'Department' key fields (Product Hierarchy, Vendor): use the DEPT list */
const vhOf = (label: string, vh: string | undefined) => vh || (/^department$/i.test(label.trim()) ? 'DEPT' : '');

export const visibleKeyFields = (cfg: WfCfg | undefined, used: WfKey[] = []): { field: 'genType' | 'genField' | 'genField2' | 'genField3' | 'genField4'; label: string; vh: string }[] => {
  const c = cfg;
  const any = (f: 'genField' | 'genField2' | 'genField3' | 'genField4') => used.some((k) => !!k[f]);
  const out: { field: 'genType' | 'genField' | 'genField2' | 'genField3' | 'genField4'; label: string; vh: string }[] = [
    { field: 'genType', label: c?.gtLabel || 'Generic type', vh: vhOf(c?.gtLabel || 'Generic type', c?.gtVh) },
  ];
  if (!c || c.gf1Visible || any('genField')) out.push({ field: 'genField', label: c?.gf1Label || 'Generic field 1', vh: vhOf(c?.gf1Label || 'Generic field 1', c?.gf1Vh) });
  if (!c || c.gf2Visible || any('genField2')) out.push({ field: 'genField2', label: c?.gf2Label || 'Generic field 2', vh: vhOf(c?.gf2Label || 'Generic field 2', c?.gf2Vh) });
  if (c?.gf3Visible || any('genField3')) out.push({ field: 'genField3', label: c?.gf3Label || 'Generic field 3', vh: vhOf(c?.gf3Label || 'Generic field 3', c?.gf3Vh) });
  if (c?.gf4Visible || any('genField4')) out.push({ field: 'genField4', label: c?.gf4Label || 'Generic field 4', vh: vhOf(c?.gf4Label || 'Generic field 4', c?.gf4Vh) });
  return out;
};

export const fmtIso = (d: string) => (!d ? '' : d === OPEN_END ? 'open end' : d);

/** Signatures used to mark what changed since the last load / save */
export const levelSig = (l: WfLevel) => JSON.stringify([l.lvl, l.typeLvl, l.type, l.minAppr, l.levelText, l.pirType, l.active]);
export const agentSig = (a: WfAgent) => JSON.stringify([a.role, a.startDate, a.endDate, a.agent, a.email || '', a.mailId, a.isAppr, a.levelText, a.active, a.userF, a.dept]);
export const viewSig = (v: WfView) => JSON.stringify([v.agent, v.viewName, v.active, v.readOnly]);
