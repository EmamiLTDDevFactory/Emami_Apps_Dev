/**
 * Demo implementation of the Gateway service ZMM_MDM_SRV.
 * Function names follow the function imports of the FS (StartRequest, SaveDraft, Submit,
 * Approve, SendBack, Reject, Forward, DeleteDraft, CheckDuplicate, BuildDescription,
 * GetFieldControl, allowed actions). The screens call only these; in live mode each one
 * becomes one $batch change set sent through the Next.js server layer.
 * All rules run here, never in the screens.
 */
import {
  ActionId, FieldKey, HistoryEntry, MaterialData, MaterialRecord, MdmRequest, Message, StatusCode, User, ViewId,
} from './types';
import { ALL_VIEW_IDS, FIELD_BY_KEY, KEY_FIELDS, KEY_FIELD_BY_KEY, VIEWS, VIEW_BY_ID, defaultsForType, tableRows } from './fieldConfig';
import { LEVELS, RESUBMIT_TO, WORKFLOW_DEFS, WORKFLOW_TYPES, levelDef, userById } from './workflowConfig';
import { HELP_PARENT, PH_LENGTH, decodeHierarchy, isValidValue } from './valueHelps';
import { VIEW_VISIBILITY } from './viewVisibility';

export interface Db {
  materials: MaterialRecord[];
  requests: MdmRequest[];
}

export interface Result {
  ok: boolean;
  messages: Message[];
  db: Db;
  request?: MdmRequest;
}

const now = () => new Date().toISOString();
const err = (text: string, view?: ViewId, field?: FieldKey): Message => ({ severity: 'E', text, view, field });
const warn = (text: string, view?: ViewId, field?: FieldKey): Message => ({ severity: 'W', text, view, field });
const fail = (db: Db, messages: Message[]): Result => ({ ok: false, messages, db });

/** Material description (MAKTX) length */
export const DESCRIPTION_MAX = 40;
export const LONG_TEXT_MAX = 1000;

/* ------------------------------------------------------------------ */
/* CheckDuplicate (phonetic key, stand-in for /INOWITS/P_PHONETICS)     */
/* ------------------------------------------------------------------ */

function soundex(word: string): string {
  const w = word.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!w) return '';
  if (/^\d/.test(w)) return w; // keep numbers (sizes, ratings) as they are
  const codes: Record<string, string> = { B: '1', F: '1', P: '1', V: '1', C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2', D: '3', T: '3', L: '4', M: '5', N: '5', R: '6' };
  let out = w[0];
  let last = codes[w[0]] ?? '';
  for (const ch of w.slice(1)) {
    const c = codes[ch] ?? '';
    if (c && c !== last) out += c;
    if (ch !== 'H' && ch !== 'W') last = c;
  }
  return (out + '000').slice(0, 4);
}

export function phoneticKey(text: string): string[] {
  return Array.from(new Set(text.split(/[\s\-/,.]+/).map(soundex).filter(Boolean))).sort();
}

export interface DuplicateHit {
  kind: 'Material' | 'Request';
  id: string;
  description: string;
  plant: string;
  score: number;
}

export function checkDuplicate(db: Db, description: string, excludeTransId?: string): DuplicateHit[] {
  const key = phoneticKey(description);
  if (key.length < 2) return [];
  const score = (other: string) => {
    const k2 = phoneticKey(other);
    const common = key.filter((x) => k2.includes(x)).length;
    return Math.round((common / Math.max(key.length, k2.length)) * 100);
  };
  const hits: DuplicateHit[] = [];
  db.materials.forEach((m) => {
    const s = score(m.description);
    if (s >= 75) hits.push({ kind: 'Material', id: m.materialNumber, description: m.description, plant: m.plant, score: s });
  });
  db.requests
    .filter((r) => r.transId !== excludeTransId && ['00', '01', '02', '04'].includes(r.status))
    .forEach((r) => {
      const s = score(r.data.description);
      if (s >= 75) hits.push({ kind: 'Request', id: r.transId, description: r.data.description, plant: r.data.plant, score: s });
    });
  return hits.sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ */
/* GetFieldControl                                                     */
/* ------------------------------------------------------------------ */

export type FieldMode = 'edit' | 'display';
export type PageView = 'NORMAL' | 'PRELIMINARY' | 'FORWARD' | 'DISPLAY';

export interface FieldControl {
  pageView: PageView;
  /** Key data screen (initial screen): only the initiator changes it, in draft or after a send back */
  keyData: FieldMode;
  /** Views this user sees on this request, in SAP order */
  views: { id: ViewId; mode: FieldMode }[];
  field: (key: FieldKey) => { mode: FieldMode; required: boolean } | null;
}

/* ------------------------------------------------------------------ */
/* GetViewVisibility (MDM : Workflow Maintenance > View Visibility)     */
/* ------------------------------------------------------------------ */

export interface ViewAccess {
  view: ViewId;
  readOnly: boolean;
}

/**
 * Which views a level sees for a material type, and whether it may change them.
 * Level 0 = initiator (Normal view), 1..7 = reviewer levels (Preliminary view).
 * DEMO: reads the mock table in lib/viewVisibility.ts.
 * LIVE: replace the body with the backend call (View Visibility table) – same return shape.
 */
export function getViewVisibility(materialType: string, level: number): ViewAccess[] {
  const order = (id: string) => VIEWS.findIndex((v) => v.id === id);
  return VIEW_VISIBILITY
    .filter((x) => x.materialType === materialType && x.level === level && VIEW_BY_ID[x.view])
    .map((x) => ({ view: x.view, readOnly: x.readOnly }))
    .sort((a, b) => order(a.view) - order(b.view));
}

/** Reviewer levels that may change a view (for "maintained by" labels) */
export function viewEditors(materialType: string, view: ViewId): number[] {
  return Array.from(new Set(
    VIEW_VISIBILITY.filter((x) => x.materialType === materialType && x.view === view && x.level > 0 && !x.readOnly).map((x) => x.level),
  )).sort((a, b) => a - b);
}

/**
 * Field behavior for this user on this request.
 * NORMAL view (initiator, draft or sent back): only the key data screen is open. The material
 *   views are filled by the reviewers; the initiator sees the views its visibility rows allow.
 * PRELIMINARY view (reviewer at the current level): the views of the level's visibility rows;
 *   those not flagged read-only are open for input.
 * FORWARD: the views of the forwarding level, display only.
 * DISPLAY: the views of the user's own level, display only.
 */
export function getFieldControl(r: MdmRequest, user: User): FieldControl {
  let pageView: PageView = 'DISPLAY';
  let level = user.level ?? 0;
  let canEdit = false;

  if ((r.status === '00' || r.status === '02') && user.id === r.initiator) {
    pageView = 'NORMAL';
  } else if (r.status === '01' && user.level === r.level) {
    pageView = 'PRELIMINARY';
    canEdit = true;
  } else if (r.status === '04' && r.forward?.to === user.id) {
    pageView = 'FORWARD';
    level = r.forward.level;
  }

  const views = getViewVisibility(r.data.materialType, level)
    .filter((x) => r.views.includes(x.view))
    .map((x) => ({ id: x.view, mode: (canEdit && !x.readOnly ? 'edit' : 'display') as FieldMode }));
  const keyData: FieldMode = pageView === 'NORMAL' ? 'edit' : 'display';

  return {
    pageView,
    keyData,
    views,
    field: (key) => {
      const kf = KEY_FIELD_BY_KEY[key];
      if (kf) return { mode: keyData, required: keyData === 'edit' && !!kf.required };
      const def = FIELD_BY_KEY[key];
      if (!def) return null;
      const v = views.find((x) => x.id === def.view);
      if (!v) return null;
      return { mode: def.readOnly ? 'display' : v.mode, required: v.mode === 'edit' && !!def.required };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Allowed actions                                                      */
/* ------------------------------------------------------------------ */

export function getAllowedActions(r: MdmRequest, user: User): ActionId[] {
  const isInitiator = user.id === r.initiator;
  if (r.status === '00' && isInitiator) return ['SAVE_DRAFT', 'SUBMIT', 'DELETE_DRAFT'];
  if (r.status === '02' && isInitiator) return ['SAVE_DRAFT', 'SUBMIT'];
  if (r.status === '01' && user.level === r.level) return ['SAVE', 'APPROVE', 'SEND_BACK', 'FORWARD', 'REJECT'];
  if (r.status === '04' && r.forward?.to === user.id) return ['RETURN', 'REJECT'];
  return [];
}

/* ------------------------------------------------------------------ */
/* Validation (mandatory by field control, then rule groups)            */
/* ------------------------------------------------------------------ */

/**
 * Key data check (initial screen). Material creation can only start when every required
 * field is filled and every entered value exists in its value help, in the right context
 * (storage location of the plant, channel of the sales org, and so on).
 */
export function validateKeyData(d: MaterialData): Message[] {
  const m: Message[] = [];
  for (const f of KEY_FIELDS) {
    const val = (d[f.key] ?? '').trim();
    if (!val) {
      if (f.required) m.push(err(`${f.label} is required`, undefined, f.key));
      continue;
    }
    const parent = f.help && HELP_PARENT[f.help];
    if (parent && !d[parent as FieldKey]) continue; // reported via the parent field
    if (f.help && !isValidValue(f.help, val, d)) {
      const where = f.help === 'storageLocation' || f.help === 'warehouseNo' ? ` for plant ${d.plant}`
        : f.help === 'distChannel' ? ` for sales org ${d.salesOrg}`
        : f.help === 'storageType' ? ` for warehouse ${d.warehouseNo}` : '';
      m.push(err(`${f.label} ${val} is not valid${where}`, undefined, f.key));
    }
  }
  if (d.materialType && isValidValue('materialType', d.materialType) && !WORKFLOW_DEFS[d.materialType]) {
    m.push(err(`No workflow is defined for material type ${d.materialType}. Only ${WORKFLOW_TYPES.join(', ')} can be requested for now.`, undefined, 'materialType'));
  }
  if (d.description.length > DESCRIPTION_MAX) m.push(err(`Material description: use ${DESCRIPTION_MAX} characters or fewer`, undefined, 'description'));
  if (d.longText.length > LONG_TEXT_MAX) m.push(err(`Long text: use ${LONG_TEXT_MAX} characters or fewer`, undefined, 'longText'));
  if (d.prodHierarchy && !decodeHierarchy(d.prodHierarchy).valid) {
    m.push(err(`Prod. hierarchy must be a valid ${PH_LENGTH}-character code (Banner, Brand, Product, SKU, Variant, Scheme)`, undefined, 'prodHierarchy'));
  }
  if (d.storageType && !d.warehouseNo) m.push(err('Enter a warehouse number before the storage type', undefined, 'storageType'));
  return m;
}

export function validate(r: MdmRequest, data: MaterialData, fc: FieldControl): Message[] {
  const msgs: Message[] = fc.keyData === 'edit' ? validateKeyData(data) : [];
  for (const v of fc.views.filter((x) => x.mode === 'edit')) {
    for (const f of VIEW_BY_ID[v.id].fields) {
      const val = (data[f.key] ?? '').trim();
      if (f.type === 'table') {
        const rows = tableRows(val);
        const reqCols = (f.columns ?? []).filter((c) => c.required);
        rows.forEach((row, i) => reqCols.forEach((c) => {
          if (!String(row[c.key] ?? '').trim()) msgs.push(err(`${f.label}: ${c.label} is required in row ${i + 1}`, v.id, f.key));
        }));
        continue;
      }
      if (f.required && !val) {
        msgs.push(err(`${f.label} is required`, v.id, f.key));
        continue;
      }
      if (!val) continue;
      if (f.type === 'number') {
        const n = Number(val);
        if (Number.isNaN(n) || n < 0) msgs.push(err(`${f.label}: enter a number of 0 or more`, v.id, f.key));
        else if (f.integer && !Number.isInteger(n)) msgs.push(err(`${f.label}: enter a whole number`, v.id, f.key));
      }
      if (f.maxLength && val.length > f.maxLength) msgs.push(err(`${f.label}: use ${f.maxLength} characters or fewer`, v.id, f.key));
      if (f.pattern && !f.pattern.re.test(val)) msgs.push(err(f.pattern.text, v.id, f.key));
    }
  }
  const editing = (v: ViewId) => fc.views.some((x) => x.id === v && x.mode === 'edit');
  const has = (k: FieldKey) => !msgs.some((x) => x.field === k);

  // Cross-field rules (examples from the validation catalogue groups)
  if (editing('basic') && data.grossWeight && data.netWeight && has('grossWeight') && has('netWeight') && Number(data.netWeight) > Number(data.grossWeight)) {
    msgs.push(err('Net weight cannot be more than gross weight', 'basic', 'netWeight'));
  }
  if (editing('storage1') && data.totalShelfLife && data.minRemainingShelfLife && has('minRemainingShelfLife') && Number(data.minRemainingShelfLife) > Number(data.totalShelfLife)) {
    msgs.push(err('Minimum remaining shelf life cannot exceed total shelf life', 'storage1', 'minRemainingShelfLife'));
  }
  // The standard price is set by the level that maintains Accounting 1 (per view visibility)
  if (fc.pageView === 'PRELIMINARY' && editing('acct1') && data.priceControl === 'S' && has('standardPrice') && !(Number(data.standardPrice) > 0)) {
    msgs.push(err('Standard price must be more than 0 for price control S', 'acct1', 'standardPrice'));
  }
  if (editing('mrp2') && data.procurementType === 'F' && !data.plannedDeliveryDays) {
    msgs.push(warn('Planned delivery time is empty for an externally procured material', 'mrp2', 'plannedDeliveryDays'));
  }
  if (editing('salesOrg1') && data.deliveringPlant && data.deliveringPlant !== data.plant) {
    msgs.push(warn(`Delivery plant ${data.deliveringPlant} differs from the request plant ${data.plant}`, 'salesOrg1', 'deliveringPlant'));
  }
  if (editing('basic') && !data.ean) {
    msgs.push(warn('EAN/UPC is empty – needed for retail listing', 'basic', 'ean'));
  }
  return msgs;
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

function nextTransId(db: Db): string {
  // Stand-in for M_TRANSID_GENERATE (with the lock the FS adds)
  const max = db.requests.reduce((m, r) => Math.max(m, parseInt(r.transId.slice(2), 10) || 0), 1000);
  return `MC${String(max + 1).padStart(10, '0')}`;
}

function nextMaterialNumber(db: Db): string {
  const max = db.materials.reduce((m, x) => (/^\d+$/.test(x.materialNumber) ? Math.max(m, Number(x.materialNumber)) : m), 100000100);
  return String(max + 1);
}

const entry = (user: User, action: string, status: StatusCode, comment?: string): HistoryEntry => ({
  at: now(), by: user.name, department: user.department, level: user.level, action, status, comment: comment || undefined,
});

/** Only fields the user may edit are taken over; everything else keeps the stored value */
function mergeEditable(stored: MaterialData, incoming: MaterialData, fc: FieldControl): MaterialData {
  let out = { ...stored };
  // A new material type brings the rule defaults of that type (fields marked (R))
  if (fc.keyData === 'edit' && incoming.materialType && incoming.materialType !== stored.materialType) {
    out = { ...out, ...defaultsForType(incoming.materialType) };
  }
  (Object.keys(incoming) as FieldKey[]).forEach((k) => {
    if (fc.field(k)?.mode === 'edit') out[k] = incoming[k];
  });
  return out;
}

const trimKeyData = (d: MaterialData): MaterialData => ({ ...d, description: d.description.trim(), longText: d.longText.trim() });

function update(db: Db, r: MdmRequest): Db {
  return { ...db, requests: db.requests.map((x) => (x.transId === r.transId ? r : x)) };
}

function guard(db: Db, transId: string, user: User, action: ActionId): { r?: MdmRequest; res?: Result } {
  const r = db.requests.find((x) => x.transId === transId);
  if (!r) return { res: fail(db, [err(`Request ${transId} not found`)]) };
  if (!getAllowedActions(r, user).includes(action)) return { res: fail(db, [err('You are not allowed to perform this action on this request')]) };
  return { r };
}

/**
 * StartRequest: V_INIT. Creates the request as a draft (00) from the key data screen.
 * The request carries every view; which level sees and maintains which view comes from
 * getViewVisibility (backend).
 */
export function startRequest(db: Db, data: MaterialData, user: User): Result {
  if (user.level !== null) return fail(db, [err('Only initiators can start a material request')]);
  const k = trimKeyData(data);
  const clean: MaterialData = {
    ...k,
    // Material - Text starts with the description of the initial screen (MAKT, EN)
    descriptions: tableRows(k.descriptions).length ? k.descriptions : JSON.stringify([{ lang: 'EN', text: k.description }]),
  };
  const msgs = validateKeyData(clean);
  if (msgs.some((m) => m.severity === 'E')) return fail(db, msgs);
  const at = now();
  const r: MdmRequest = {
    transId: nextTransId(db), appId: 'MC', status: '00', level: 0, materialNumber: '',
    data: clean, views: [...ALL_VIEW_IDS], initiator: user.id, createdOn: at, changedOn: at,
    history: [entry(user, 'Saved as draft', '00')],
  };
  return { ok: true, messages: [], db: { ...db, requests: [...db.requests, r] }, request: r };
}

/** New request straight to level 1: StartRequest and Submit in one step (one change set) */
export function startAndSubmit(db: Db, data: MaterialData, user: User, comment = ''): Result {
  const started = startRequest(db, data, user);
  if (!started.ok) return started;
  const r = started.request!;
  return submit(started.db, r.transId, r.data, user, comment);
}

/** SaveDraft (initiator) and Save (reviewer): stores edits without moving the request */
export function saveDraft(db: Db, transId: string, data: MaterialData, user: User): Result {
  const g = guard(db, transId, user, user.level === null ? 'SAVE_DRAFT' : 'SAVE');
  if (g.res) return g.res;
  const r = g.r!;
  const fc = getFieldControl(r, user);
  const merged = mergeEditable(r.data, fc.keyData === 'edit' ? trimKeyData(data) : data, fc);
  if (fc.keyData === 'edit') {
    const msgs = validateKeyData(merged);
    if (msgs.some((m) => m.severity === 'E')) return fail(db, msgs);
  }
  const updated: MdmRequest = { ...r, data: merged, changedOn: now(), history: [...r.history, entry(user, user.level === null ? 'Draft saved' : 'Saved', r.status)] };
  return { ok: true, messages: [{ severity: 'I', text: 'Saved' }], db: update(db, updated), request: updated };
}

export function submit(db: Db, transId: string, data: MaterialData, user: User, comment: string): Result {
  const g = guard(db, transId, user, 'SUBMIT');
  if (g.res) return g.res;
  const r = g.r!;
  const fc = getFieldControl(r, user);
  const merged = mergeEditable(r.data, trimKeyData(data), fc);
  const msgs = validate(r, merged, fc);
  if (msgs.some((m) => m.severity === 'E')) return fail(db, msgs);
  const wf = WORKFLOW_DEFS[merged.materialType];
  const first = wf.levels[0];
  const level = r.status === '02' && RESUBMIT_TO === 'SENDING_LEVEL' && r.sentBackFrom ? r.sentBackFrom : first;
  const updated: MdmRequest = {
    ...r, data: merged, status: '01', level, sentBackFrom: undefined, changedOn: now(),
    history: [...r.history, entry(user, r.status === '02' ? `Resubmitted – sent to level ${level} (${levelDef(level)!.team})` : `Submitted – sent to level ${level} (${levelDef(level)!.team})`, '01', comment)],
  };
  return { ok: true, messages: msgs, db: update(db, updated), request: updated };
}

export function approve(db: Db, transId: string, data: MaterialData, user: User, comment: string): Result {
  const g = guard(db, transId, user, 'APPROVE');
  if (g.res) return g.res;
  const r = g.r!;
  const fc = getFieldControl(r, user);
  const merged = mergeEditable(r.data, data, fc);
  const msgs = validate(r, merged, fc);
  if (msgs.some((m) => m.severity === 'E')) return fail(db, msgs);

  const wf = WORKFLOW_DEFS[merged.materialType];
  const idx = wf.levels.indexOf(r.level);
  const nextLevel = wf.levels[idx + 1];

  if (nextLevel) {
    const updated: MdmRequest = {
      ...r, data: merged, level: nextLevel, changedOn: now(),
      history: [...r.history, entry(user, `Approved – sent to level ${nextLevel} (${levelDef(nextLevel)!.team})`, '01', comment)],
    };
    return { ok: true, messages: msgs, db: update(db, updated), request: updated };
  }

  // Last level: post (poster class, six steps of STND_UPDATE, one commit), then complete the work item
  const materialNumber = nextMaterialNumber(db);
  const at = now();
  const record: MaterialRecord = { ...merged, materialNumber, transId: r.transId, createdOn: at, createdBy: userById(r.initiator)?.name ?? r.initiator };
  const updated: MdmRequest = {
    ...r, data: { ...merged, materialNumber }, materialNumber, status: '05', changedOn: at,
    history: [
      ...r.history,
      entry(user, 'Approved', '05', comment),
      { at, by: 'SAP', department: 'System', level: null, action: `Posted – material ${materialNumber} created (MARA, MARC, MVKE, MLAN, QMAT, MBEW)`, status: '05' },
    ],
  };
  return { ok: true, messages: msgs, db: { materials: [...db.materials, record], requests: db.requests.map((x) => (x.transId === r.transId ? updated : x)) }, request: updated };
}

const needComment = (db: Db, comment: string, what: string): Result | null =>
  comment.trim().length < 5 ? fail(db, [err(`Add a comment to ${what} (at least 5 characters)`)]) : null;

export function sendBack(db: Db, transId: string, user: User, comment: string): Result {
  const g = guard(db, transId, user, 'SEND_BACK');
  if (g.res) return g.res;
  const c = needComment(db, comment, 'send the request back');
  if (c) return c;
  const r = g.r!;
  const updated: MdmRequest = { ...r, status: '02', sentBackFrom: r.level, level: 0, changedOn: now(), history: [...r.history, entry(user, 'Sent back to initiator', '02', comment)] };
  return { ok: true, messages: [], db: update(db, updated), request: updated };
}

export function reject(db: Db, transId: string, user: User, comment: string): Result {
  const g = guard(db, transId, user, 'REJECT');
  if (g.res) return g.res;
  const c = needComment(db, comment, 'reject the request');
  if (c) return c;
  const r = g.r!;
  const updated: MdmRequest = { ...r, status: '03', forward: undefined, changedOn: now(), history: [...r.history, entry(user, 'Rejected', '03', comment)] };
  return { ok: true, messages: [], db: update(db, updated), request: updated };
}

/** Forward: the reviewer asks another person for input; the work item returns to the same level */
export function forward(db: Db, transId: string, user: User, toUserId: string, comment: string): Result {
  const g = guard(db, transId, user, 'FORWARD');
  if (g.res) return g.res;
  const to = userById(toUserId);
  if (!to || to.id === user.id) return fail(db, [err('Choose a person to forward to')]);
  const c = needComment(db, comment, 'say what input you need');
  if (c) return c;
  const r = g.r!;
  const updated: MdmRequest = {
    ...r, status: '04', forward: { to: to.id, by: user.id, level: r.level }, changedOn: now(),
    history: [...r.history, entry(user, `Forwarded to ${to.name} for input`, '04', comment)],
  };
  return { ok: true, messages: [], db: update(db, updated), request: updated };
}

export function returnForward(db: Db, transId: string, user: User, comment: string): Result {
  const g = guard(db, transId, user, 'RETURN');
  if (g.res) return g.res;
  const c = needComment(db, comment, 'give your input');
  if (c) return c;
  const r = g.r!;
  const by = userById(r.forward!.by);
  const updated: MdmRequest = {
    ...r, status: '01', forward: undefined, changedOn: now(),
    history: [...r.history, entry(user, `Input returned to ${by?.name ?? 'reviewer'} (level ${r.level})`, '01', comment)],
  };
  return { ok: true, messages: [], db: update(db, updated), request: updated };
}

/** DeleteDraft: only status 00; clears the header and every staging row of the request */
export function deleteDraft(db: Db, transId: string, user: User): Result {
  const g = guard(db, transId, user, 'DELETE_DRAFT');
  if (g.res) return g.res;
  return { ok: true, messages: [], db: { ...db, requests: db.requests.filter((r) => r.transId !== transId) } };
}

/* ------------------------------------------------------------------ */
/* Read model                                                           */
/* ------------------------------------------------------------------ */

/** Requests waiting for this user (work items) */
export function waitingFor(db: Db, user: User): MdmRequest[] {
  return db.requests.filter((r) => {
    if (user.level === null) return r.initiator === user.id && r.status === '02';
    return (r.status === '01' && r.level === user.level) || (r.status === '04' && r.forward?.to === user.id);
  });
}

export function routingKeys(r: MdmRequest) {
  return {
    workflow: WORKFLOW_DEFS[r.data.materialType]?.id ?? '—',
    materialType: r.data.materialType,
    plant: r.data.plant,
    salesOrg: `${r.data.salesOrg}/${r.data.distChannel}`,
  };
}

export const LEVEL_COUNT = LEVELS.length;
