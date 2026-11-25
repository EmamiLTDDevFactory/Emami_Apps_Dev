/**
 * Client of the WF admin area (SAP class ZCL_MM_MDM_ADM_WF) through the hub: workflow maintenance of the flow engine
 * (replaces Web Dynpro /INOWITS/MDM_ROLE_MAIN). Always live; an error carries SAP's own messages.
 * Dates are ISO (YYYY-MM-DD, 9999-12-31 = open end), flags are booleans.
 */
import { AdminMessage, adminCall } from './adminApi';

export interface WfKey { appId: string; genType: string; genField: string; genField2: string; genField3: string; genField4: string }
export type WfKeyField = 'genType' | 'genField' | 'genField2' | 'genField3' | 'genField4';

export interface WfAgent {
  role: string; startDate: string; endDate: string; agent: string; name: string; isAppr: boolean; levelText: string; mailId: string;
  active: boolean; userF: string; dept: string;
  /** e-mail of the agent (reviewer levels): SAP resolves it to the SAP user on save */
  email?: string;
  /** computed by SAP */
  counted?: boolean; expired?: boolean; receives?: 'workitem' | 'notification' | 'none' | string; locked?: boolean;
}
export interface WfView { agent: string; viewName: string; active: boolean; readOnly: boolean; description?: string }
export interface WfLevel {
  typeLvl: string; lvl: string; levelText: string; maxRole: number; minAppr: number; type: string; active: boolean; pirType: string;
  agents: WfAgent[]; views: WfView[]; roleLabel?: string; counted?: number;
}
export interface WfGroup extends WfKey { levels: WfLevel[]; l0Views: WfView[] }

export interface WfCfg {
  appId: string; text: string; family: string;
  gtLabel: string; gf1Label: string; gf2Label: string; gf3Label: string; gf4Label: string;
  gf1Visible: boolean; gf2Visible: boolean; gf3Visible: boolean; gf4Visible: boolean;
  gtVh: string; gf1Vh: string; gf2Vh: string; gf3Vh: string; gf4Vh: string;
  deptVisible: boolean; viewsEnabled: boolean; l0Required: boolean; pirVisible: boolean; wfId: string; groupCount: number;
}
export interface WfItem { key: string; text: string; extra: string }
export interface WfCons { mtart: string; rqMatkl: string; rqBusiness: string }
export interface WfMeta { apps: WfCfg[]; levelTexts: WfItem[]; departments: WfItem[]; pirTypes: WfItem[]; wfCons: WfCons[]; today: string; actor: string; sapUser: string }

export interface WfSummary extends WfKey { levelCount: number; reviewerLevels: number; approverLevels: number; countedAgents: number; issues: string[] }
export interface WfMsg extends AdminMessage { target?: string }

export interface WfSimAgent { role: string; agent: string; name: string; receives: string; mailId: string; levelText: string; dept: string; endDate: string; key: WfKey }
export interface WfSimLevel {
  lvl: string; typeLvl: string; roleLabel: string; type: string; typeText: string; minAppr: number; maxRole: number; counted: number;
  levelText: string; stale: boolean; agents: WfSimAgent[];
}
export interface WfSim {
  wouldStart: boolean; engineCalled: boolean; messages: WfMsg[]; workflowId: string; reviewerSkipped: boolean; levels: WfSimLevel[];
  matched: WfKey[]; initiatorViews: WfView[]; notes: string[]; key: WfKey;
}
export interface WfUse extends WfKey {
  lvl: string; typeLvl: string; roleLabel: string; type: string; levelActive: boolean; role: string; startDate: string; endDate: string; active: boolean;
  expired: boolean; isAppr: boolean; agent: string; name: string; mailId: string; levelText: string; receives: string;
}
export interface WfLogRow extends WfKey {
  transId: string; kind: 'level' | 'agent' | 'view' | string; reason: string; context: string; changedOn: string; changedBy: string;
  lvl: string; role: string; startDate: string; viewName: string; agent: string; chAgent: string; summary: string;
}
export interface WfKeyRow { keyName: string; value: string; active: boolean }
export interface WfMassGroup { key: WfKey; roleRows: number; viewRows: number; skipped: boolean; reason: string; transId: string }

const call = <T>(op: string, payload: Record<string, unknown> = {}) => adminCall<T>('WF', op, payload);

export const emptyKey = (appId = ''): WfKey => ({ appId, genType: '', genField: '', genField2: '', genField3: '', genField4: '' });
export const KEY_FIELDS: WfKeyField[] = ['genType', 'genField', 'genField2', 'genField3', 'genField4'];

export const wfApi = {
  meta: () => call<WfMeta>('meta'),
  search: (key: Partial<WfKey>) => call<{ cfg: WfCfg; groups: WfSummary[]; total: number; truncated: boolean }>('search', { ...key }),
  getGroup: (key: WfKey) => call<{ group: WfGroup; version: string; issues: WfMsg[]; cfg: WfCfg; openRequests: number }>('getGroup', { ...key }),
  validate: (group: WfGroup, mode: 'create' | 'update') => call<{ valid: boolean; messages: WfMsg[]; group: WfGroup }>('validateGroup', { group, mode }),
  save: (group: WfGroup, mode: 'create' | 'update', version: string) =>
    call<{ group: WfGroup; version: string; messages: WfMsg[]; transId: string; logRows: number; viewLogRows: number }>('saveGroup', { group, mode, version }),
  remove: (key: WfKey, force = false) => call<{ deleted: WfKey; transId: string; levels: number; agents: number; views: number; openRequests: number }>('deleteGroup', { ...key, force }),
  copy: (source: WfKey, target: WfKey, overwrite = false) =>
    call<{ target: WfKey; transId: string; levels: number; agents: number; views: number; messages: WfMsg[] }>('copyGroup', { source, target, overwrite }),
  copyType: (appId: string, oldType: string, newType: string) =>
    call<{ copied: { source: WfKey; target: WfKey; transId: string; levels: number; agents: number; views: number }[]; count: number }>('copyGenType', { appId, oldType, newType }),
  massAgent: (p: Partial<WfKey> & { oldAgent: string; newAgent: string; dryRun: boolean; includeInactive: boolean }) =>
    call<{ dryRun: boolean; groups: WfMassGroup[]; changedGroups: number; skippedGroups: number; roleRows: number; viewRows: number; messages: WfMsg[]; note: string }>('massAgentChange', { ...p }),
  whereUsed: (user: string, appId: string) => call<{ uses: WfUse[]; total: number }>('whereUsed', { user, appId }),
  keys: (appId: string) => call<{ appId: string; keys: WfKeyRow[] }>('getKeys', { appId }),
  saveKeys: (appId: string, keys: WfKeyRow[]) => call<{ appId: string; saved: number }>('saveKeys', { appId, keys }),
  log: (p: Partial<WfKey> & { agent?: string; lvl?: string; dateFrom?: string; dateTo?: string; limit?: number }) => call<{ rows: WfLogRow[]; total: number }>('changeLog', { ...p }),
  simulate: (key: WfKey) => call<WfSim>('simulate', { ...key }),
  valueHelp: (kind: string, appId = '', query = '', limit = 40) => call<{ kind: string; items: WfItem[] }>('valueHelp', { kind, appId, query, limit }).then((r) => r.items),
};
