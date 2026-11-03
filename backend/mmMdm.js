/*
   Material master requests (embedded-apps/mm-mdm) -> SAP Gateway service ZMM_MDM_SRV, server side. Mounted at
   /api/me/mm-mdm (rides the existing nginx /api/me rule). The app is a static export, so these routes are its "BFF":

     GET  /health                      { ok, system } | 502
     GET  /session                     user, department, roles (SAP GetSession)
     GET  /requests?scope&status&materialType&text        list      POST /requests   start a request
     GET  /requests/:id   PUT /requests/:id (save draft)  DELETE /requests/:id (delete draft)
     POST /requests/:id/{validate|submit|approve|sendback|reject|forward}
     GET  /fieldcontrol?type&level     GET /valuehelp/:name?...     POST /duplicates   POST /description   GET /hsn?text

   Every call needs a hub session (Bearer token, same check as the rest of /api/me) and a Material master grant in Manage
   Access. No business rule lives here or in the browser: validation, field control, workflow and posting are decided by
   SAP; this file only maps the screen model to the OData service (embedded-apps/mm-mdm/odata/service-contract.md).
   The client never sends status, routing keys, initiator or work item: they are read-only on the SAP side and are never
   written from here. Logs: user, route, timing - never payload values or credentials.
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');
const sap = require('./mmMdmSap');
const FORM = require('./mmMdmFields.json');

const APP_ID = 'mm-mdm';
const router = express.Router();

// ------------------------------------------------------------------ names of the OData service (contract.ts of the app)
const SET = { request: 'RequestSet', viewSelection: 'ViewSelectionSet' };
const ENTITY_SETS = {
    Material: { set: 'MaterialSet', keys: ['TransId'], multi: false },
    Description: { set: 'DescriptionSet', keys: ['TransId'], multi: false },
    Plant: { set: 'PlantSet', keys: ['TransId'], multi: false },
    SalesOrg: { set: 'SalesOrgSet', keys: ['TransId'], multi: false },
    Valuation: { set: 'ValuationSet', keys: ['TransId'], multi: false },
    StorageLocation: { set: 'StorageLocationSet', keys: ['TransId'], multi: false },
    WarehouseData: { set: 'WarehouseDataSet', keys: ['TransId'], multi: false },
    StorageTypeData: { set: 'StorageTypeDataSet', keys: ['TransId'], multi: false },
    EanData: { set: 'EanDataSet', keys: ['TransId'], multi: false },
    ForecastParameter: { set: 'ForecastParameterSet', keys: ['TransId'], multi: false },
    UnitOfMeasure: { set: 'UnitOfMeasureSet', keys: ['TransId', 'Meinh'], multi: true },
    TaxClassification: { set: 'TaxClassificationSet', keys: ['TransId', 'Aland'], multi: true },
    SalesTaxData: { set: 'SalesTaxDataSet', keys: ['TransId', 'SrNo'], multi: true },
    InspectionType: { set: 'InspectionTypeSet', keys: ['TransId', 'SerialNo'], multi: true },
    ClassCharacteristic: { set: 'ClassCharacteristicSet', keys: ['TransId', 'SrNo'], multi: true },
    ProductionVersion: { set: 'ProductionVersionSet', keys: ['TransId', 'Slno'], multi: true },
    ConsumptionData: { set: 'ConsumptionDataSet', keys: ['TransId', 'Priod'], multi: true },
    LongText: { set: 'LongTextSet', keys: ['TransId', 'Matnr', 'Fid'], multi: true },
};
const FN = { startRequest: 'StartRequest', validate: 'Validate', saveDraft: 'SaveDraft', submit: 'Submit', approve: 'Approve', sendBack: 'SendBack', reject: 'Reject', forward: 'Forward', deleteDraft: 'DeleteDraft', checkDuplicate: 'CheckDuplicate', buildDescription: 'BuildDescription', relatedHsn: 'GetRelatedHsn', fieldControl: 'GetFieldControl', session: 'GetSession' };
const VALUE_HELP_SETS = { MTART: 'MaterialTypeVhSet', MGRP: 'MainGroupSet', SGRP: 'SubGroupSet', SSGR: 'SubSubGroupSet' };
const GENERIC_VALUE_HELP = 'GenericValueHelpSet';
const STATUS_TEXT = { '00': 'Saved as draft', '01': 'Requested', '02': 'In progress', '03': 'Completed', '04': 'Sent back', '05': 'Rejected' };
// ---- attachments and comments (OData: AttachmentSet media resource, CommentSet; SAP implements them, see odata/service-contract.md)
/** Transport guards of the BFF. SAP decides what it accepts in the end. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 1000;
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'msg', 'eml', 'zip'];
const WORKFLOW = { approve: FN.approve, sendback: FN.sendBack, reject: FN.reject, forward: FN.forward };

// ------------------------------------------------------------------ name and value conversion
const toProp = (name) => name.toLowerCase().split('_').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
const toName = (prop) => prop.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const isDate = (entity, name) => (FORM.fields[`${entity}.${name}`] || {}).type === 'DATS';

const sapDate = (v) => {
    const m = typeof v === 'string' ? /\/Date\((-?\d+)/.exec(v) : null;
    return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : '';
};
const toSapDate = (v) => `/Date(${Date.parse(`${v}T00:00:00Z`)})/`;

function fromOData(entity, o) {
    const row = {};
    for (const [prop, v] of Object.entries(o)) {
        if (prop === '__metadata' || prop === 'TransId' || (v && typeof v === 'object' && '__deferred' in v)) continue;
        const name = toName(prop);
        row[name] = isDate(entity, name) ? sapDate(v) : v;
    }
    return row;
}

function toOData(entity, row) {
    const o = {};
    for (const [name, v] of Object.entries(row)) {
        if (name === 'TRANSID') continue;
        o[toProp(name)] = isDate(entity, name) && typeof v === 'string' && v ? toSapDate(v) : v;
    }
    return o;
}

const enc = (s) => `'${String(s).replace(/'/g, "''")}'`;
function key(entity, transId, row) {
    const cfg = ENTITY_SETS[entity];
    const parts = cfg.keys.map((k) => (k === 'TransId' ? `TransId=${enc(transId)}` : `${k}=${enc((row && row[toName(k)]) ?? '')}`));
    return `${cfg.set}(${parts.join(',')})`;
}

function header(o, extra = {}) {
    const st = String(o.Status ?? '00');
    return {
        transId: String(o.TransId ?? ''), appId: String(o.AppId ?? ''), objValue: String(o.ObjValue ?? ''), status: st, statusText: STATUS_TEXT[st] ?? st,
        initiator: String(o.Initiator ?? ''), startDate: sapDate(o.StartDate), endDate: sapDate(o.EndDate), workItemId: String(o.WorkItemId ?? ''), isDuplicate: Boolean(o.IsDuplicate),
        genType: String(o.GenType ?? ''), genField: String(o.GenField ?? ''), genField2: String(o.GenField2 ?? ''), genField3: String(o.GenField3 ?? ''),
        materialType: extra.materialType ?? String(o.MaterialType ?? ''), description: extra.description ?? String(o.MaterialDescription ?? ''),
    };
}

const EXPAND = [...Object.keys(ENTITY_SETS), 'History', 'ViewSelection'].join(',');

// The allowed actions are SAP's answer for this request and this user; nothing is inferred from the status.
const asAllowed = (o) => ({ edit: !!o.CanEdit, validate: !!o.CanValidate, saveDraft: !!o.CanSaveDraft, submit: !!o.CanSubmit, approve: !!o.CanApprove, sendBack: !!o.CanSendBack, reject: !!o.CanReject, forward: !!o.CanForward, deleteDraft: !!o.CanDeleteDraft, attach: !!o.CanAttach, comment: !!o.CanComment });

function fnResults(json) {
    const r = sap.results(json);
    if (r.length) return r;
    const d = json && json.d;
    const first = d ? Object.values(d).find((v) => v && typeof v === 'object' && 'results' in v) : undefined;
    return first ? first.results : [];
}
function fnSingle(json) {
    const d = (json && json.d) || {};
    const inner = Object.values(d).find((v) => v && typeof v === 'object' && !('__metadata' in v) && !('results' in v));
    return inner || d;
}
const toMessages = (rows) => rows.map((m) => ({ code: String(m.Code ?? ''), message: String(m.Message ?? ''), severity: String(m.Severity ?? 'E').toUpperCase()[0] || 'E', target: String(m.Target ?? '') }));

// ------------------------------------------------------------------ the service (screen model <-> OData)
async function load(c, id) {
    const json = await sap.odata.get(c, `${SET.request}?$filter=TransId eq ${enc(id)}&$expand=${EXPAND}`);
    const o = sap.results(json)[0];
    if (!o) throw new sap.SapError(`Request ${id} not found`, 404);
    const data = { single: {}, multi: {}, views: [] };
    for (const [entity, cfg] of Object.entries(ENTITY_SETS)) {
        const part = o[entity];
        if (!part) continue;
        if (cfg.multi) data.multi[entity] = (part.results || []).map((r) => fromOData(entity, r));
        else data.single[entity] = fromOData(entity, part);
    }
    const vs = o.ViewSelection || {};
    data.views = FORM.views.filter((v) => vs[toProp(v)] === true || vs[toProp(v)] === 'X');
    const history = ((o.History && o.History.results) || []).map((h) => ({
        serialNo: Number(h.SerialNo ?? 0), level: String(h.Lvl ?? ''), typeLevel: String(h.TypeLvl ?? 'R'), role: String(h.Role ?? ''), user: String(h.UserId ?? ''),
        status: String(h.Status ?? 'I'), date: sapDate(h.EndDate), comment: String(h.Comment ?? ''),
    })).sort((a, b) => a.serialNo - b.serialNo);
    const mat = data.single.Material || {};
    const desc = data.single.Description || {};
    return { header: header(o, { materialType: String(mat.MTART ?? ''), description: String(desc.MAKTX ?? '') }), data, history, allowed: asAllowed(o), level: String(o.Level ?? 'L0') };
}

function writeOps(transId, data, existing) {
    const ops = [];
    for (const [entity, row] of Object.entries(data.single || {})) if (ENTITY_SETS[entity]) ops.push({ method: 'MERGE', path: key(entity, transId), body: toOData(entity, row) });
    for (const [entity, rows] of Object.entries(data.multi || {})) {
        const cfg = ENTITY_SETS[entity];
        if (!cfg) continue;
        const ident = (r) => cfg.keys.filter((k) => k !== 'TransId').map((k) => String(r[toName(k)] ?? '')).join('|');
        const before = new Map(((existing && existing.multi[entity]) || []).map((r) => [ident(r), r]));
        const now = new Set();
        for (const r of rows) {
            const id = ident(r);
            now.add(id);
            if (before.has(id)) ops.push({ method: 'MERGE', path: key(entity, transId, r), body: toOData(entity, r) });
            else ops.push({ method: 'POST', path: cfg.set, body: { TransId: transId, ...toOData(entity, r) } });
        }
        for (const [id, r] of before) if (!now.has(id)) ops.push({ method: 'DELETE', path: key(entity, transId, r) });
    }
    const flags = {};
    for (const v of FORM.views) flags[toProp(v)] = ((data.views) || []).includes(v);
    ops.push({ method: 'MERGE', path: `${SET.viewSelection}(TransId=${enc(transId)})`, body: flags });
    return ops;
}

async function withWrites(c, id, data, fn, extra = {}, validateOnly = false) {
    const cur = await load(c, id);
    const ops = data ? writeOps(id, data, cur.data) : [];
    const q = Object.entries({ TransId: id, AppId: cur.header.appId, ...extra }).map(([k, v]) => `${k}=${typeof v === 'string' ? enc(v) : v}`).join('&');
    ops.push({ method: 'POST', path: `${fn}?${q}` });
    const res = await sap.batchChangeSet(c, ops, validateOnly ? { 'X-MM-Validate-Only': 'true' } : {});
    return res[res.length - 1] && res[res.length - 1].json;
}

const isoOf = (v) => {
    const m = typeof v === 'string' ? /\/Date\((-?\d+)/.exec(v) : null;
    return m ? new Date(Number(m[1])).toISOString() : typeof v === 'string' ? v : '';
};
const toAttachment = (o) => ({ attachId: String(o.AttachId ?? ''), fileName: String(o.FileName ?? ''), mimeType: String(o.MimeType ?? ''), size: Number(o.Size ?? 0), uploadedBy: String(o.UploadedBy ?? ''), uploadedAt: isoOf(o.UploadedAt), level: String(o.Lvl ?? '') });
const toComment = (o) => ({ commentId: String(o.CommentId ?? ''), text: String(o.Text ?? ''), user: String(o.UserId ?? ''), createdAt: isoOf(o.CreatedAt), level: String(o.Lvl ?? '') });
const extOf = (n) => (n.lastIndexOf('.') < 0 ? '' : n.slice(n.lastIndexOf('.') + 1).toLowerCase());
const safeName = (n) => String(n || '').replace(/[\u0000-\u001f]/g, '').trim();
/** null = the upload may go to SAP; otherwise the SapError to answer with (400 / 413 / 415). */
function checkUpload(fileName, size) {
    if (!fileName || /[\\/:*?"<>|]/.test(fileName) || fileName.length > 255) return new sap.SapError('The file name is not valid.', 400);
    if (!size) return new sap.SapError('The file is empty.', 400);
    if (size > MAX_UPLOAD_BYTES) return new sap.SapError(`The file is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`, 413);
    if (!ALLOWED_EXTENSIONS.includes(extOf(fileName))) return new sap.SapError(`This file type is not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`, 415);
    return null;
}

async function appIdOf(c, id) {
    const o = sap.results(await sap.odata.get(c, `${SET.request}?$filter=TransId eq ${enc(id)}&$select=TransId,AppId`))[0];
    if (!o) throw new sap.SapError(`Request ${id} not found`, 404);
    return String(o.AppId ?? '');
}

const service = {
    async session(c) {
        const o = fnSingle(await sap.odata.fn(c, FN.session, {}));
        return { user: String(o.User ?? c.user), displayName: String(o.DisplayName ?? c.user), department: String(o.Department ?? ''), roles: String(o.Roles ?? 'initiator').split(',').map((r) => r.trim()), mode: 'live' };
    },
    async list(c, q) {
        const f = [];
        if (q.scope) f.push(`Scope eq ${enc(q.scope)}`);
        if (q.status) f.push(`Status eq ${enc(q.status)}`);
        if (q.materialType) f.push(`MaterialType eq ${enc(q.materialType)}`);
        if (q.text) f.push(`substringof(${enc(q.text)},Search) eq true`);
        const url = `${SET.request}?$orderby=TransId desc&$top=200${f.length ? `&$filter=${encodeURIComponent(f.join(' and '))}` : ''}`;
        return sap.results(await sap.odata.get(c, url)).map((o) => header(o));
    },
    get: (c, id) => load(c, id),
    async start(c, i) {
        const o = fnSingle(await sap.odata.fn(c, FN.startRequest, {
            MaterialType: i.materialType || '', IndustrySector: i.industrySector || '', Description: i.description || '', MainGroup: i.mainGroup || '', SubGroup: i.subGroup || '', SubSubGroup: i.subSubGroup || '',
            ManufacturerPart: i.manufacturerPart || '', Plant: i.plant || '', StorageLocation: i.storageLocation || '', SalesOrg: i.salesOrg || '', DistributionChannel: i.distributionChannel || '',
            Views: (i.views || []).join(','), Draft: !!i.draft,
        }));
        return load(c, String(o.TransId));
    },
    async save(c, id, data) {
        const json = await withWrites(c, id, data, FN.saveDraft);
        return { request: await load(c, id), messages: toMessages(fnResults(json)) };
    },
    async validate(c, id, data) {
        return toMessages(fnResults(await withWrites(c, id, data, FN.validate, {}, true)));
    },
    async submit(c, id, data) {
        const json = await withWrites(c, id, data, FN.submit);
        return { request: await load(c, id), messages: toMessages(fnResults(json)) };
    },
    async act(c, id, action, body) {
        const json = await withWrites(c, id, body.data, WORKFLOW[action], { Comment: body.comment || '', Agent: body.agent || '' });
        return { request: await load(c, id), messages: toMessages(fnResults(json)) };
    },
    async deleteDraft(c, id) {
        const cur = await load(c, id);
        await sap.odata.fn(c, FN.deleteDraft, { TransId: id, AppId: cur.header.appId });
    },
    async fieldControl(c, materialType, level) {
        const rows = fnResults(await sap.odata.fn(c, FN.fieldControl, { MaterialType: materialType, Level: level }));
        const out = {};
        for (const r of rows) {
            const v = String(r.ViewName ?? '');
            (out[v] = out[v] || []).push({ field: `${String(r.Entity ?? '')}.${toName(String(r.Field ?? ''))}`, shown: !!r.Shown, displayOnly: !!r.DisplayOnly, required: !!r.Required, column: String(r.Column ?? ''), source: String(r.Source ?? 'view') });
        }
        return out;
    },
    async valueHelp(c, name, params) {
        const set = VALUE_HELP_SETS[name.toUpperCase()];
        const f = Object.entries(params).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} eq ${enc(v)}`);
        const url = set
            ? `${set}${f.length ? `?$filter=${encodeURIComponent(f.join(' and '))}` : ''}`
            : `${GENERIC_VALUE_HELP}?$filter=${encodeURIComponent([`Name eq ${enc(name.toUpperCase())}`, ...f].join(' and '))}`;
        return sap.results(await sap.odata.get(c, url)).map((o) => ({ key: String(o.Key ?? ''), text: String(o.Text ?? '') }));
    },
    async duplicates(c, i) {
        return fnResults(await sap.odata.fn(c, FN.checkDuplicate, { Description: i.description || '', MaterialType: i.materialType || '' }))
            .map((o) => ({ matnr: String(o.Matnr ?? ''), description: String(o.Description ?? ''), materialType: String(o.MaterialType ?? ''), score: Number(o.Score ?? 0) }));
    },
    async buildDescription(c, i) {
        const o = fnSingle(await sap.odata.fn(c, FN.buildDescription, { MainGroup: i.mainGroup || '', SubGroup: i.subGroup || '', SubSubGroup: i.subSubGroup || '', Description: i.description || '', ManufacturerPart: i.manufacturerPart || '' }));
        return { text: String(o.Text ?? ''), truncated: !!o.Truncated };
    },
    async listAttachments(c, id) {
        return sap.results(await sap.odata.get(c, `AttachmentSet?$filter=TransId eq ${enc(id)}&$orderby=AttachId`)).map(toAttachment);
    },
    async addAttachment(c, id, bytes, fileName, mimeType) {
        const bad = checkUpload(fileName, bytes.length);
        if (bad) throw bad;
        // TransId travels in the path of the navigation, never the uploader / time / level: SAP sets those.
        const json = await sap.postStream(c, `RequestSet(TransId=${enc(id)},AppId=${enc(await appIdOf(c, id))})/Attachments`, bytes, { fileName, mimeType });
        return toAttachment((json && json.d) || {});
    },
    async readAttachment(c, id, attachId) {
        const meta = sap.results(await sap.odata.get(c, `AttachmentSet?$filter=TransId eq ${enc(id)} and AttachId eq ${enc(attachId)}`))[0];
        if (!meta) throw new sap.SapError('Attachment not found', 404);
        const file = await sap.getStream(c, `AttachmentSet(TransId=${enc(id)},AttachId=${enc(attachId)})/$value`);
        return { fileName: String(meta.FileName ?? 'attachment'), mimeType: String(meta.MimeType || file.mimeType), bytes: file.bytes };
    },
    async deleteAttachment(c, id, attachId) {
        await sap.odata.del(c, `AttachmentSet(TransId=${enc(id)},AttachId=${enc(attachId)})`);
    },
    async listComments(c, id) {
        return sap.results(await sap.odata.get(c, `CommentSet?$filter=TransId eq ${enc(id)}&$orderby=CommentId`)).map(toComment);
    },
    async addComment(c, id, text) {
        const t = String(text || '').trim();
        if (!t) throw new sap.SapError('The comment is empty.', 400);
        if (t.length > MAX_COMMENT_LENGTH) throw new sap.SapError(`The comment is longer than ${MAX_COMMENT_LENGTH} characters.`, 400);
        const json = await sap.odata.post(c, 'CommentSet', { TransId: id, Text: t });
        return toComment((json && json.d) || {});
    },
    async relatedHsn(c, text) {
        return fnResults(await sap.odata.fn(c, FN.relatedHsn, { Text: text || '' })).map((o) => ({ code: String(o.Code ?? ''), text: String(o.Text ?? ''), count: Number(o.Count ?? 0) }));
    },
};

// ------------------------------------------------------------------ hub session and grant
function verifiedEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try {
        const p = jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] });
        return p && !p.purpose ? String(p.email || '').trim().toLowerCase() : '';
    } catch { return ''; }
}

async function requireUser(req, res, next) {
    const email = verifiedEmail(req);
    if (!email) return res.status(401).json({ error: 'Your Emami Apps session has expired or is missing. Please sign in again.' });
    try {
        const [grant, user] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]),
            pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length || (user.rows[0] && user.rows[0].is_active === false)) return res.status(403).json({ error: 'You do not have access to Material master. Ask an Emami Apps admin for it in Admin Center.' });
        req.caller = { user: email };
        next();
    } catch (e) {
        console.error('[mm-mdm] access check', e.message);
        res.status(500).json({ error: 'Could not verify your access.' });
    }
}

router.use(requireUser);
router.use(express.json({ limit: '6mb' }));

/** Wraps a handler: SAP errors keep their status and ALL their messages, anything else is a 500 without details. */
const handle = (name, fn) => async (req, res) => {
    const t0 = Date.now();
    try {
        const out = await fn(req);
        console.info(`[mm-mdm] ${req.caller.user} ${name} ms=${Date.now() - t0}`);
        res.status(out && out.__status ? out.__status : 200).json(out && out.__status ? out.body : out);
    } catch (e) {
        const status = e instanceof sap.SapError ? e.status : 500;
        console.error(`[mm-mdm] ${req.caller.user} ${name} failed: ${e.message}`);
        res.status(status).json({ error: status === 500 && !(e instanceof sap.SapError) ? 'Unexpected error.' : e.message, messages: e.messages || [] });
    }
};

router.get('/health', handle('health', async () => {
    if (!sap.isConfigured()) throw new sap.SapError('The SAP connection for Material master is not configured on the server.', 502);
    return { ok: true, system: sap.sapSystem() };
}));
router.get('/session', handle('session', (req) => service.session(req.caller)));
router.get('/requests', handle('list', (req) => service.list(req.caller, { scope: req.query.scope, status: req.query.status, materialType: req.query.materialType, text: req.query.text })));
router.post('/requests', handle('start', async (req) => ({ __status: 201, body: await service.start(req.caller, req.body || {}) })));
router.get('/requests/:id', handle('get', (req) => service.get(req.caller, req.params.id)));
router.put('/requests/:id', handle('save', (req) => service.save(req.caller, req.params.id, (req.body || {}).data)));
router.delete('/requests/:id', handle('delete', async (req) => { await service.deleteDraft(req.caller, req.params.id); return { ok: true }; }));
// Attachments: the file travels as the raw request body (Slug = URL-encoded file name, Content-Type = MIME type), like the OData media resource.
// File contents are never logged. Express's JSON parser skips these bodies; express.raw reads them up to the limit + 1 byte (so 413 is ours, not a crash).
router.get('/requests/:id/attachments', handle('attachments', (req) => service.listAttachments(req.caller, req.params.id)));
router.post('/requests/:id/attachments', express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES + 1 }), handle('attachment-add', async (req) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const name = safeName((() => { try { return decodeURIComponent(req.get('slug') || ''); } catch { return ''; } })());
    return { __status: 201, body: await service.addAttachment(req.caller, req.params.id, bytes, name, req.get('content-type') || 'application/octet-stream') };
}));
router.get('/requests/:id/attachments/:attId', async (req, res) => {
    const t0 = Date.now();
    try {
        const f = await service.readAttachment(req.caller, req.params.id, req.params.attId);
        console.info(`[mm-mdm] ${req.caller.user} attachment-get ms=${Date.now() - t0}`);
        res.set({ 'Content-Type': f.mimeType, 'Content-Length': String(f.bytes.length), 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`, 'X-Content-Type-Options': 'nosniff' });
        res.send(f.bytes);
    } catch (e) {
        const status = e instanceof sap.SapError ? e.status : 500;
        console.error(`[mm-mdm] ${req.caller.user} attachment-get failed: ${e.message}`);
        res.status(status).json({ error: status === 500 && !(e instanceof sap.SapError) ? 'Unexpected error.' : e.message, messages: e.messages || [] });
    }
});
router.delete('/requests/:id/attachments/:attId', handle('attachment-delete', async (req) => { await service.deleteAttachment(req.caller, req.params.id, req.params.attId); return { ok: true }; }));
router.get('/requests/:id/comments', handle('comments', (req) => service.listComments(req.caller, req.params.id)));
router.post('/requests/:id/comments', handle('comment-add', async (req) => ({ __status: 201, body: await service.addComment(req.caller, req.params.id, (req.body || {}).text) })));
router.post('/requests/:id/:action', handle('action', async (req) => {
    const { id, action } = req.params;
    const body = req.body || {};
    if (action === 'validate') {
        if (!body.data) throw new sap.SapError('data is required', 400);
        return { messages: await service.validate(req.caller, id, body.data) };
    }
    if (action === 'submit') {
        if (!body.data) throw new sap.SapError('data is required', 400);
        return service.submit(req.caller, id, body.data);
    }
    if (WORKFLOW[action]) return service.act(req.caller, id, action, body);
    throw new sap.SapError(`Unknown action ${action}`, 404);
}));
router.get('/fieldcontrol', handle('fieldcontrol', (req) => service.fieldControl(req.caller, String(req.query.type || ''), String(req.query.level || 'L0'))));
router.get('/valuehelp/:name', handle('valuehelp', (req) => service.valueHelp(req.caller, req.params.name, Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, String(v)])))));
router.post('/duplicates', handle('duplicates', (req) => service.duplicates(req.caller, req.body || {})));
router.post('/description', handle('description', (req) => service.buildDescription(req.caller, req.body || {})));
router.get('/hsn', handle('hsn', (req) => service.relatedHsn(req.caller, String(req.query.text || ''))));

module.exports = router;
module.exports._test = { asAllowed, service, toAttachment, toComment, checkUpload, MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, toProp, toName, fromOData, toOData, key, writeOps, header, toMessages, EXPAND };
