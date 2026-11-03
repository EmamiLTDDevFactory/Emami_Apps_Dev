import { FORM, staticFieldControl } from '@/lib/form';
import { ITEM_STATUS_TEXT, STATUS_TEXT } from '@/lib/types';
import type { AllowedActions, DuplicateHit, FieldControl, HistoryItem, ListQuery, Message, RequestData, RequestHeader, RequestView, SessionInfo, StartInput, StatusCode, ValueHelpItem } from '@/lib/types';
import { ServiceError, type Caller, type MdmService, type WorkflowAction } from '../service';
import { runRules } from './rules';

// ---------------------------------------------------------------------------------------------
// Demo service: in-memory data and a simplified workflow (levels L1 reviewer, L2 approver).
// It exists so the screens can be built and tested without SAP. Real behavior lives in SAP.
// ---------------------------------------------------------------------------------------------

interface DemoUser { user: string; displayName: string; department: string; roles: SessionInfo['roles']; level?: string }
const USERS: Record<string, DemoUser> = {
  initiator: { user: 'initiator', displayName: 'Demo initiator', department: 'BRD', roles: ['initiator'] },
  reviewer: { user: 'reviewer', displayName: 'Demo reviewer (L1)', department: 'LGC', roles: ['reviewer'], level: 'L1' },
  approver: { user: 'approver', displayName: 'Demo approver (L2)', department: 'BRD', roles: ['approver'], level: 'L2' }
};
const LAST_LEVEL = 'L2';

interface Rec { header: RequestHeader; data: RequestData; history: HistoryItem[]; level: string }
interface Store { seq: number; matSeq: number; recs: Map<string, Rec> }

const g = globalThis as unknown as { __mmStore?: Store };

function today() { return new Date().toISOString().slice(0, 10); }
function pad(n: number) { return String(n).padStart(10, '0'); }

function emptyData(views: string[]): RequestData { return { single: {}, multi: {}, views }; }

function seed(s: Store) {
  const mk = (type: string, text: string, status: StatusCode, level: string, by = 'initiator', mat = ''): void => {
    const id = pad(++s.seq);
    const data = emptyData(['MARA_BASIC1', 'MARC_GEN', 'MARC_MRP1', 'MBEW_ACC1']);
    data.single['Material'] = { MTART: type, MBRSH: 'F', MEINS: 'EA', MATKL: '', BRGEW: 1.2, NTGEW: 1.0, GEWEI: 'KG' };
    data.single['Description'] = { MAKTX: text, SPRAS: 'EN' };
    data.single['Plant'] = { WERKS: 'P001' };
    data.single['SalesOrg'] = { VKORG: 'S001', VTWEG: '10' };
    const header: RequestHeader = { transId: id, appId: 'MC', objValue: mat, status, statusText: STATUS_TEXT[status], initiator: by, startDate: today(), workItemId: status === '02' ? String(100000000 + s.seq) : '', isDuplicate: false, genType: type, genField: '', genField2: '', genField3: 'P001', materialType: type, description: text };
    const history: HistoryItem[] = [{ serialNo: 1, level: 'L0', typeLevel: 'I', role: '0', user: by, status: 'I', date: today() }];
    s.recs.set(id, { header, data, history, level });
  };
  mk('FERT', 'HIMANI BOROPLUS 20 ML', '00', 'L0');
  mk('ROH', 'PARAFFIN WAX RAW MATERIAL', '01', 'L0');
  mk('FERT', 'ZANDU BALM 25 ML', '02', 'L1');
  mk('PKGN', 'CARTON 5 IN 1 SHAMPOO', '02', 'L2');
  mk('FERT', 'EMAMI SHAMPOO 3.5ML', '04', 'L0');
  mk('ROH', 'GLYCERINE 99.5 PCT', '03', 'L2', 'initiator', 'RM0000000412');
  mk('FERT', 'BONITA HAND WASH 200 ML', '05', 'L2');
}

const STORE_KEY = 'mm_demo_store';

/** The demo data lives in the browser: kept in memory and mirrored to sessionStorage so a page reload keeps the requests. */
function store(): Store {
  if (!g.__mmStore) {
    let loaded: Store | undefined;
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORE_KEY) : null;
      if (raw) { const o = JSON.parse(raw) as { seq: number; matSeq: number; recs: Array<[string, Rec]> }; loaded = { seq: o.seq, matSeq: o.matSeq, recs: new Map(o.recs) }; }
    } catch { loaded = undefined; }
    if (loaded) g.__mmStore = loaded;
    else { g.__mmStore = { seq: 1000000000, matSeq: 413, recs: new Map() }; seed(g.__mmStore); }
  }
  return g.__mmStore;
}

/** Saves the demo data for the next page load (called by the demo adapter after every call). */
export function persistDemoStore(): void {
  try {
    const s = g.__mmStore;
    if (s && typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORE_KEY, JSON.stringify({ seq: s.seq, matSeq: s.matSeq, recs: [...s.recs] }));
  } catch { /* storage full or blocked: the demo then only lasts for this page */ }
}

/** Forgets all demo changes (tests, and the "reset demo data" action). */
export function resetDemoStore(): void {
  g.__mmStore = undefined;
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

function userOf(c: Caller): DemoUser { return USERS[c.user] ?? USERS.initiator; }

function allowedFor(u: DemoUser, r: Rec): AllowedActions {
  const none: AllowedActions = { edit: false, validate: false, saveDraft: false, submit: false, approve: false, sendBack: false, reject: false, forward: false, deleteDraft: false };
  const st = r.header.status;
  if (u.roles.includes('initiator') && r.header.initiator === u.user) {
    if (st === '00' || st === '01') return { ...none, edit: true, validate: true, saveDraft: true, submit: true, deleteDraft: st === '00' };
    if (st === '04') return { ...none, edit: true, validate: true, saveDraft: true, submit: true };
  }
  if (st === '02' && u.level && r.level === u.level) return { ...none, edit: true, validate: true, approve: true, sendBack: true, reject: true, forward: true };
  return none;
}

function view(u: DemoUser, r: Rec): RequestView {
  return { header: { ...r.header }, data: JSON.parse(JSON.stringify(r.data)), history: r.history.map((h) => ({ ...h })), allowed: allowedFor(u, r), level: r.level };
}

function rec(id: string): Rec {
  const r = store().recs.get(id);
  if (!r) throw new ServiceError(404, `Request ${id} not found`);
  return r;
}

function setStatus(r: Rec, st: StatusCode) { r.header.status = st; r.header.statusText = STATUS_TEXT[st]; }

function addHistory(r: Rec, u: DemoUser, level: string, typeLevel: HistoryItem['typeLevel'], status: HistoryItem['status'], comment?: string) {
  r.history.push({ serialNo: r.history.length + 1, level, typeLevel, role: level === 'L0' ? '0' : level.replace('L', ''), user: u.user, status, date: today(), comment });
}

function syncHeader(r: Rec) {
  const m = r.data.single['Material'] ?? {};
  const d = r.data.single['Description'] ?? {};
  r.header.materialType = String(m['MTART'] ?? '');
  r.header.description = String(d['MAKTX'] ?? '');
  r.header.genType = r.header.materialType;
  r.header.genField3 = String((r.data.single['Plant'] ?? {})['WERKS'] ?? '');
}

function assertEditable(u: DemoUser, r: Rec) {
  if (!allowedFor(u, r).edit) throw new ServiceError(403, 'You cannot change this request in its current status or level');
}

const MTART = ['ERSA', 'FERT', 'FRT2', 'GIFT', 'PKGN', 'POP', 'POS', 'ROH', 'SCRP', 'SPEX', 'VERP', 'WIP', 'ZSTM'];
const HELP: Record<string, ValueHelpItem[]> = {
  MTART: MTART.map((k) => ({ key: k, text: k })),
  MBRSH: [{ key: 'F', text: 'F' }],
  WERKS: [{ key: 'P001', text: 'Plant 1 (demo)' }, { key: 'P002', text: 'Plant 2 (demo)' }],
  LGORT: [{ key: 'SL01', text: 'Storage location 1 (demo)' }, { key: 'SL02', text: 'Storage location 2 (demo)' }],
  VKORG: [{ key: 'S001', text: 'Sales org 1 (demo)' }],
  VTWEG: [{ key: '10', text: 'Channel 10 (demo)' }, { key: '20', text: 'Channel 20 (demo)' }],
  MEINS: ['EA', 'KG', 'G', 'L', 'ML', 'PC', 'M'].map((k) => ({ key: k, text: k })),
  GEWEI: ['KG', 'G'].map((k) => ({ key: k, text: k })),
  VOLEH: ['L', 'ML'].map((k) => ({ key: k, text: k })),
  MATKL: [{ key: 'BC01', text: 'Body care (demo)' }, { key: 'HC01', text: 'Health care (demo)' }],
  MGRP: [{ key: '0001', text: 'HIMANI' }, { key: '0002', text: 'ZANDU' }, { key: '0003', text: 'EMAMI' }],
  SGRP: [{ key: '01', text: 'BALM' }, { key: '02', text: 'SHAMPOO' }],
  SSGR: [{ key: '01', text: '20 ML' }, { key: '02', text: '100 ML' }]
};

function demoDescriptionText(i: { mainGroup?: string; subGroup?: string; subSubGroup?: string; description: string; manufacturerPart?: string }) {
  // Current rule (V_INIT, V_POPUP, V_DESCRITION): group texts, description and part number joined by a space,
  // upper case, 40 characters (MAKTX). Behavior above 40 characters is to be confirmed from the code.
  const parts = [i.mainGroup, i.subGroup, i.subSubGroup, i.description, i.manufacturerPart].map((p) => (p ?? '').trim()).filter(Boolean);
  const full = parts.join(' ').toUpperCase();
  return { text: full.slice(0, 40), truncated: full.length > 40 };
}

function soundexLite(s: string) {
  const t = s.toUpperCase().replace(/[^A-Z]/g, '');
  return t.replace(/[AEIOUYHW]/g, '').replace(/(.)\1+/g, '$1');
}

export class MockService implements MdmService {
  async session(c: Caller): Promise<SessionInfo> {
    const u = userOf(c);
    return { user: u.user, displayName: u.displayName, department: u.department, roles: u.roles, mode: 'mock' };
  }

  async listRequests(c: Caller, q: ListQuery): Promise<RequestHeader[]> {
    const u = userOf(c);
    let list = [...store().recs.values()];
    if (q.scope === 'mine') list = list.filter((r) => r.header.initiator === u.user);
    if (q.scope === 'inbox') list = list.filter((r) => allowedFor(u, r).approve || (r.header.initiator === u.user && r.header.status === '04'));
    if (q.status) list = list.filter((r) => r.header.status === q.status);
    if (q.materialType) list = list.filter((r) => r.header.materialType === q.materialType);
    if (q.text) {
      const t = q.text.toLowerCase();
      list = list.filter((r) => [r.header.transId, r.header.objValue, r.header.description].some((v) => (v ?? '').toLowerCase().includes(t)));
    }
    return list.map((r) => ({ ...r.header })).sort((a, b) => b.transId.localeCompare(a.transId));
  }

  async getRequest(c: Caller, id: string): Promise<RequestView> {
    return view(userOf(c), rec(id));
  }

  async startRequest(c: Caller, input: StartInput): Promise<RequestView> {
    const u = userOf(c);
    if (!u.roles.includes('initiator')) throw new ServiceError(403, 'Only an initiator can start a request');
    if (!input.materialType) throw new ServiceError(422, 'Please fill Material Type', [{ code: 'E022', message: 'Please fill Material Type', severity: 'E', target: 'Material/MTART' }]);
    if (!input.views.length) throw new ServiceError(422, 'Please select atleast one view to proceed', [{ code: 'E003', message: 'Please select atleast one view to proceed', severity: 'E' }]);
    const s = store();
    const id = pad(++s.seq);
    const data = emptyData(input.views);
    data.single['Material'] = { MTART: input.materialType, MBRSH: input.industrySector, MGRPDES: input.mainGroup ?? '', SGRPDES: input.subGroup ?? '', SSGRPDES: input.subSubGroup ?? '' };
    data.single['Description'] = { MAKTX: input.description, SPRAS: 'EN' };
    data.single['Plant'] = { WERKS: input.plant ?? '' };
    data.single['SalesOrg'] = { VKORG: input.salesOrg ?? '', VTWEG: input.distributionChannel ?? '' };
    data.single['StorageLocation'] = { LGORT: input.storageLocation ?? '' };
    const status: StatusCode = input.draft ? '00' : '01';
    const header: RequestHeader = { transId: id, appId: 'MC', objValue: '', status, statusText: STATUS_TEXT[status], initiator: u.user, startDate: today(), workItemId: '', isDuplicate: false, genType: input.materialType, genField: '', genField2: '', genField3: input.plant ?? '', materialType: input.materialType, description: input.description };
    const r: Rec = { header, data, history: [], level: 'L0' };
    addHistory(r, u, 'L0', 'I', 'I');
    s.recs.set(id, r);
    return view(u, r);
  }

  async saveRequest(c: Caller, id: string, data: RequestData) {
    const u = userOf(c); const r = rec(id);
    assertEditable(u, r);
    r.data = JSON.parse(JSON.stringify(data));
    if (r.header.initiator === u.user && (r.header.status === '01')) setStatus(r, '00');
    syncHeader(r);
    return { request: view(u, r), messages: [] as Message[] };
  }

  async validate(c: Caller, id: string, data: RequestData): Promise<Message[]> {
    const u = userOf(c); const r = rec(id);
    if (!allowedFor(u, r).validate) throw new ServiceError(403, 'You cannot validate this request');
    return runRules(data);
  }

  async submit(c: Caller, id: string, data: RequestData) {
    const u = userOf(c); const r = rec(id);
    if (!allowedFor(u, r).submit) throw new ServiceError(403, 'You cannot submit this request');
    const messages = runRules(data).filter((m) => m.severity === 'E');
    if (messages.length) throw new ServiceError(422, 'Validation failed', messages);
    r.data = JSON.parse(JSON.stringify(data));
    syncHeader(r);
    const resubmit = r.header.status === '04';
    addHistory(r, u, 'L0', 'I', 'C');
    setStatus(r, '02');
    r.level = 'L1';
    r.header.workItemId = r.header.workItemId || String(100000000 + Number(r.header.transId.slice(-4)));
    if (resubmit) addHistory(r, u, 'L1', 'R', 'I');
    return { request: view(u, r), messages: [] as Message[] };
  }

  async act(c: Caller, id: string, action: WorkflowAction, body: { comment?: string; agent?: string; data?: RequestData }) {
    const u = userOf(c); const r = rec(id);
    const al = allowedFor(u, r);
    const lvl = r.level;
    const typeLevel: HistoryItem['typeLevel'] = lvl === LAST_LEVEL ? 'A' : 'R';
    if (action === 'approve') {
      if (!al.approve) throw new ServiceError(403, 'You cannot approve this request');
      if (body.data) { r.data = JSON.parse(JSON.stringify(body.data)); syncHeader(r); }
      if (lvl === LAST_LEVEL) {
        const messages = runRules(r.data).filter((m) => m.severity === 'E');
        if (messages.length) throw new ServiceError(422, 'Validation failed', messages);
        addHistory(r, u, lvl, typeLevel, 'C', body.comment);
        const s = store();
        r.header.objValue = `${r.header.materialType === 'ROH' ? 'RM' : 'FG'}${String(++s.matSeq).padStart(10, '0')}`;
        (r.data.single['Material'] ??= {})['MATNR'] = r.header.objValue;
        setStatus(r, '03');
        r.header.endDate = today();
      } else {
        addHistory(r, u, lvl, typeLevel, 'C', body.comment);
        r.level = `L${Number(lvl.slice(1)) + 1}`;
        setStatus(r, '02');
      }
    } else if (action === 'sendback') {
      if (!al.sendBack) throw new ServiceError(403, 'You cannot send back this request');
      addHistory(r, u, lvl, typeLevel, 'S', body.comment);
      setStatus(r, '04'); r.level = 'L0';
    } else if (action === 'reject') {
      if (!al.reject) throw new ServiceError(403, 'You cannot reject this request');
      addHistory(r, u, lvl, typeLevel, 'R', body.comment);
      setStatus(r, '05'); r.header.endDate = today();
    } else {
      if (!al.forward) throw new ServiceError(403, 'You cannot forward this request');
      addHistory(r, u, lvl, typeLevel, 'F', `${body.agent ?? ''} ${body.comment ?? ''}`.trim());
    }
    return { request: view(u, r), messages: [] as Message[] };
  }

  async deleteDraft(c: Caller, id: string): Promise<void> {
    const u = userOf(c); const r = rec(id);
    if (!allowedFor(u, r).deleteDraft) throw new ServiceError(403, 'Only your own drafts can be deleted');
    store().recs.delete(id);
  }

  async fieldControl(_c: Caller, materialType: string, _level: string): Promise<FieldControl> {
    return staticFieldControl(materialType);
  }

  async valueHelp(_c: Caller, name: string, params: Record<string, string>): Promise<ValueHelpItem[]> {
    const key = name.toUpperCase();
    return HELP[key] ?? (params.mtart && key === 'MGRP' ? HELP.MGRP : []);
  }

  async duplicates(_c: Caller, input: { description: string; materialType: string }): Promise<DuplicateHit[]> {
    const key = soundexLite(input.description);
    const tokens = new Set(input.description.toUpperCase().split(/\s+/).filter(Boolean));
    const hits: DuplicateHit[] = [];
    for (const r of store().recs.values()) {
      const d = (r.header.description ?? '').toUpperCase();
      const overlap = d.split(/\s+/).filter((t) => tokens.has(t)).length;
      const phon = key && soundexLite(d) === key ? 2 : 0;
      const score = overlap + phon;
      if (score > 0) hits.push({ matnr: r.header.objValue || `request ${r.header.transId}`, description: r.header.description ?? '', materialType: r.header.materialType ?? '', score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async buildDescription(_c: Caller, input: { mainGroup?: string; subGroup?: string; subSubGroup?: string; description: string; manufacturerPart?: string }) {
    return demoDescriptionText(input);
  }

  async relatedHsn(_c: Caller, text: string) {
    const words = text.toUpperCase().split(/\s+/).filter(Boolean);
    const table = [{ code: '33059090', text: 'Hair preparations, other' }, { code: '33049910', text: 'Skin care preparations' }, { code: '34011190', text: 'Soap, toilet' }];
    return table.map((t) => ({ ...t, count: words.filter((w) => t.text.toUpperCase().includes(w)).length })).filter((t) => t.count > 0);
  }
}

export { FORM, ITEM_STATUS_TEXT };
