'use strict';
/*
   Ticket migration (Admin > Ticket migration): open tickets from another tool come in through an Excel template.
     - itsm : the ITSM support vendor's open tickets (Allied Digital's tool today) - Infra & IT, Digital Apps, SAP ...
     - sales: Secondary Sales open tickets (distributor / MR / app fields).
   The template columns live HERE (one source for the download and the checks). The page builds the .xlsx with an
   Instructions sheet and the live allowed values; the upload is checked line by line first (dry run, nothing saved),
   then imported. Each ticket keeps its legacy number (searchable, shown on the ticket), its logged date and status;
   it is created quietly (no mail to requesters or agents). Re-importing the same file skips tickets already in.
*/
const { pool } = require('../db/pool');
const { EMAIL_RE, PHONE_RE, PRIORITIES } = require('../constants');
const { fail, logActivity, stripTags, textToHtml } = require('./util');

// list: the name of the allowed-values list the page shows (Lists sheet) and the check uses.
const COMMON_HEAD = [
    { key: 'legacyRef', header: 'Legacy ticket no', required: true, hint: 'The ticket number in the old tool. Used to skip tickets already imported.', example: 'AD-INC-0104523' },
    { key: 'subject', header: 'Subject', required: true, hint: 'Short title of the issue or request (up to 300 characters).', example: 'Laptop not connecting to office Wi-Fi' },
    { key: 'description', header: 'Description', hint: 'Full description as logged.', example: 'Since this morning the laptop shows "No internet" on EMAMI-CORP.' },
];
const COMMON_TAIL = [
    { key: 'priority', header: 'Priority', hint: 'Low, Medium, High or Urgent (P1 = Urgent, P2 = High, P3 = Medium, P4 = Low). Empty: worked out by Samadhan.', example: 'Medium', list: 'priorities' },
    { key: 'status', header: 'Status', hint: 'An open status. New / Assigned become Open; Work in progress becomes In Progress or WIP; On hold becomes Pending.', example: 'Open', list: 'statuses' },
    { key: 'loggedOn', header: 'Logged on', required: true, hint: 'When the ticket was raised: DD-MM-YYYY HH:MM (IST) or an Excel date.', example: '24-11-2026 10:15' },
    { key: 'requesterName', header: 'Requester name', required: true, hint: 'Who raised the ticket.', example: 'Ravi Kumar' },
    { key: 'requesterEmail', header: 'Requester email', hint: 'Company email of the requester (needed for replies by email).', example: 'ravi.kumar@emamigroup.com' },
    { key: 'requesterPhone', header: 'Requester phone', hint: 'Mobile or desk phone.', example: '9876543210' },
    { key: 'groupName', header: 'Assigned group', hint: 'A Samadhan group. Empty: routed like a new ticket.', example: '', list: 'groups' },
    { key: 'agentEmail', header: 'Assigned agent email', hint: 'The Samadhan agent who continues the ticket. Empty: round robin in the group.', example: '', list: 'agents' },
    { key: 'workNotes', header: 'Last update / work notes', hint: 'Becomes a private note on the ticket (history from the old tool).', example: 'Driver re-installed, waiting for the user to test.' },
];

const TEMPLATES = {
    itsm: {
        title: 'ITSM open tickets (support vendor tool)',
        sheet: 'ITSM tickets',
        file: 'Samadhan-ITSM-open-tickets-template.xlsx',
        intro: 'Open tickets from the ITSM support vendor\'s current tool (infra: laptop, desktop, servers, network, cloud; software applications; SAP). One row per ticket.',
        desks: 'notSales',
        columns: [
            ...COMMON_HEAD,
            { key: 'applicationCode', header: 'Application code', required: true, hint: 'Where the ticket belongs, e.g. EUC (laptop / desktop / printer), INFRA, CLOUD, NET, M365, SEC, SAP, HUB.', example: 'EUC', list: 'applications' },
            { key: 'type', header: 'Ticket type', hint: 'Incident, Service Request, Access Request, Change Request ... (the desk\'s list).', example: 'Incident', list: 'types' },
            { key: 'category', header: 'Category', hint: 'The desk\'s category.', example: 'End-user IT', list: 'categories' },
            { key: 'subCategory', header: 'Sub-category', hint: 'Under the category.', example: 'Laptop / Desktop' },
            { key: 'impact', header: 'Impact', hint: '1 Enterprise-wide, 2 Department / Plant / Region, 3 Multiple users, 4 Single user.', example: '4', list: 'impacts' },
            { key: 'urgency', header: 'Urgency', hint: '1 Critical, 2 High, 3 Medium, 4 Low.', example: '3', list: 'urgencies' },
            ...COMMON_TAIL,
            { key: 'vendor', header: 'Support vendor', hint: 'Empty: the current ITSM support vendor.', example: 'Allied Digital Services', list: 'vendors' },
            { key: 'site', header: 'Site / location', hint: 'Office, plant or depot.', example: 'Kolkata HO - 5th floor' },
            { key: 'assetTag', header: 'Asset tag', hint: 'Laptop / desktop / device asset number.', example: 'EML-LT-04512' },
            { key: 'serverName', header: 'Server / host', hint: 'Server, VM or host name.', example: '' },
            { key: 'hosting', header: 'Hosting / hyperscaler', hint: 'Where it runs (Azure today).', example: 'Azure', list: 'hosting' },
            { key: 'environment', header: 'Environment', hint: 'Production, Quality / Test, Development ...', example: 'Production', list: 'environments' },
            { key: 'resolutionDue', header: 'Resolution due', hint: 'Optional: keep the old tool\'s due date (DD-MM-YYYY HH:MM). Empty: Samadhan\'s SLA.', example: '' },
        ],
    },
    sales: {
        title: 'Secondary Sales open tickets',
        sheet: 'Secondary Sales tickets',
        file: 'Samadhan-Secondary-Sales-open-tickets-template.xlsx',
        intro: 'Open Secondary Sales tickets (distributors, MRs, sales apps such as mSFA, DMS, B2B). One row per ticket.',
        desks: 'sales',
        columns: [
            ...COMMON_HEAD,
            { key: 'applicationCode', header: 'Application code', hint: 'Sales app, e.g. MSFA, RMSFA, DMS, SCB2B. Empty: SS (Secondary Sales - general).', example: 'MSFA', list: 'applications' },
            { key: 'type', header: 'Type', hint: 'Ticket type from the Secondary Sales list.', example: '', list: 'types' },
            { key: 'category', header: 'Category', hint: 'Secondary Sales category.', example: '', list: 'categories' },
            { key: 'subCategory', header: 'Function / sub-category', hint: 'Under the category.', example: '' },
            ...COMMON_TAIL.filter((c) => c.key !== 'requesterPhone'),
            { key: 'source', header: 'Source', hint: 'How it came in: Email, Phone, Portal, WhatsApp ... Empty: Migration import.', example: 'Phone', list: 'sources' },
            { key: 'region', header: 'Region', hint: '', example: 'East', list: 'region' },
            { key: 'salesOrg', header: 'Sales org', hint: '', example: '' },
            { key: 'state', header: 'State', hint: '', example: 'West Bengal' },
            { key: 'depot', header: 'Depot', hint: '', example: '' },
            { key: 'distributorCode', header: 'Distributor code', hint: 'Fills name / region / depot from the distributor master when those are empty.', example: '' },
            { key: 'distributorName', header: 'Distributor name', hint: '', example: '' },
            { key: 'asmName', header: 'ASM name', hint: '', example: '' },
            { key: 'depotCoordinator', header: 'Depot coordinator', hint: '', example: '' },
            { key: 'mrUid', header: 'MR UID', hint: '', example: '' },
            { key: 'mobileNo', header: 'Mobile no', hint: 'Requester mobile.', example: '9876543210' },
            { key: 'alternateMobileNo', header: 'Alternate mobile no', hint: '', example: '' },
            { key: 'callerName', header: 'Caller name', hint: '', example: '' },
            { key: 'callerContactNumber', header: 'Caller contact number', hint: '', example: '' },
            { key: 'callSubject', header: 'Call subject', hint: '', example: '' },
            { key: 'l2Agent', header: 'L2 agent', hint: '', example: '' },
            { key: 'helpdeskAnalysis', header: 'Helpdesk analysis', hint: '', example: '' },
            { key: 'rcaSolution', header: 'RCA / solution', hint: '', example: '' },
        ],
    },
};
const KINDS = Object.keys(TEMPLATES);
const SALES_FIELDS = ['region', 'salesOrg', 'state', 'depot', 'distributorCode', 'distributorName', 'asmName', 'depotCoordinator', 'mrUid', 'mobileNo',
    'alternateMobileNo', 'callerName', 'callerContactNumber', 'callSubject', 'l2Agent', 'helpdeskAnalysis', 'rcaSolution'];

const norm = (s) => String(s ?? '').toLowerCase().replace(/\*/g, '').replace(/[^a-z0-9]+/g, '');
const ci = (list, v) => list.find((x) => String(x).toLowerCase() === String(v).trim().toLowerCase()) ?? null;
const PRIORITY_WORDS = { low: 1, medium: 2, moderate: 2, normal: 2, high: 3, urgent: 4, critical: 4, p1: 4, p2: 3, p3: 2, p4: 1, 'very high': 4 };
const STATUS_ALIASES = [
    [/^(new|assigned|logged|registered|open|queued|acknowledged)$/i, ['Open']],
    [/(in.?progress|work.?in.?progress|wip|working)/i, ['In Progress', 'WIP-FUNC', 'Open']],
    [/(vendor|ams|third.?party|oem)/i, ['Pending with Vendor / AMS', 'Pending']],
    [/(on.?hold|pending|awaiting|waiting|user)/i, ['Pending', 'Confirmation / Information pending from User']],
    [/escalat/i, ['Escalation to L3 Support', 'Open']],
];

/** "24-11-2026 10:15", "24/11/2026", "2026-11-24T10:15", an Excel serial or a Date -> Date (IST for day-first text). */
function parseWhen(v) {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
    const s = String(v).trim();
    if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000 && Number(s) < 80000) {
        // Excel serial (days since 1899-12-30), as IST wall time.
        const ms = Math.round((Number(s) - 25569) * 86400000);
        return new Date(ms - 330 * 60000);
    }
    let m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(s);
    if (m) {
        let h = Number(m[4] ?? 0);
        if (m[7]) h = (h % 12) + (m[7].toLowerCase() === 'pm' ? 12 : 0);
        const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23) return undefined;
        const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[5] ?? '00'}:${m[6] ?? '00'}+05:30`;
        const dt = new Date(iso);
        // 31-02-2026 would roll over into March: refuse it.
        return Number.isNaN(dt.getTime()) || Number(new Date(dt.getTime() + 330 * 60000).getUTCDate()) !== d ? undefined : dt;
    }
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) {
        const dt = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}+05:30`);
        return Number.isNaN(dt.getTime()) ? undefined : dt;
    }
    return undefined;
}

/** The lists the template shows and the checks use (live from the database). */
async function lists(kind) {
    const tpl = TEMPLATES[kind];
    if (!tpl) throw fail(400, 'Unknown template.');
    const { catalog } = require('./workspaces');
    const c = await catalog();
    if (!c.ready) throw fail(400, 'Service desks are not set up on this database yet.');
    const salesWs = c.wsByKey.get('SEC_SALES');
    const apps = c.applications.filter((a) => a.active && (tpl.desks === 'sales' ? a.workspaceId === salesWs?.id : a.workspaceId !== salesWs?.id));
    const { loadFields } = require('../routes/me');
    const { byWorkspace } = await loadFields();
    const deskKeys = [...new Set(apps.map((a) => c.wsById.get(a.workspaceId)?.key).filter(Boolean))];
    const perDesk = Object.fromEntries(deskKeys.map((k) => {
        const f = byWorkspace?.[k];
        const typeField = f?.fields.find((x) => x.key === 'type');
        return [k, { types: typeField?.choices ?? [], tree: f?.tree ?? [] }];
    }));
    const statuses = (await pool.query('SELECT id, name, "pausesSla" FROM samadhan.ticket_statuses WHERE NOT "isResolved" AND NOT "isClosed" ORDER BY position, id')).rows;
    const groups = (await pool.query('SELECT id, name, "workspaceId" FROM samadhan.groups ORDER BY name')).rows;
    const agents = (await pool.query('SELECT id, name, email FROM samadhan.agents WHERE active ORDER BY name')).rows;
    const itsm = require('./itsm');
    const partners = await itsm.listPartners({ activeOnly: true });
    const { IT_LISTS } = require('./itSeed');
    const { IMPACTS, URGENCIES } = require('./workspaceSeed');
    const regionField = byWorkspace?.SEC_SALES?.fields.find((x) => x.key === 'region');
    return {
        c, apps, perDesk, statuses, groups, agents,
        vendors: partners.filter((p) => p.kind === 'ITSM_VENDOR'),
        hosting: [...IT_LISTS.hosting, ...(await itsm.hostingExtra())],
        environments: IT_LISTS.environment,
        impacts: IMPACTS, urgencies: URGENCIES,
        sources: await require('./config').sources(),
        region: regionField?.choices ?? [],
        model: await itsm.model(),
    };
}

/** What the page needs to build the template: columns and allowed values (strings only). */
async function templateInfo(kind) {
    const tpl = TEMPLATES[kind];
    const L = await lists(kind);
    const deskName = (id) => L.c.wsById.get(id)?.name ?? '';
    const values = {
        applications: L.apps.map((a) => `${a.code} – ${a.name} (${deskName(a.workspaceId)})`),
        types: [...new Set(Object.values(L.perDesk).flatMap((d) => d.types))],
        categories: [...new Set(Object.values(L.perDesk).flatMap((d) => d.tree.map((t) => t.value)))],
        subCategories: Object.entries(L.perDesk).flatMap(([, d]) => d.tree.flatMap((t) => t.children.map((ch) => `${t.value} > ${ch}`))),
        priorities: Object.values(PRIORITIES),
        statuses: L.statuses.map((s) => s.name),
        groups: L.groups.filter((g) => !g.workspaceId || L.apps.some((a) => a.workspaceId === g.workspaceId)).map((g) => g.name),
        agents: L.agents.map((a) => `${a.email} (${a.name})`),
        vendors: L.vendors.map((v) => v.name),
        hosting: L.hosting,
        environments: L.environments,
        impacts: Object.entries(L.impacts).map(([k, v]) => `${k} – ${v}`),
        urgencies: Object.entries(L.urgencies).map(([k, v]) => `${k} – ${v}`),
        sources: L.sources,
        region: L.region,
    };
    const currentVendor = L.vendors.find((v) => v.id === L.model.vendorId)?.name ?? null;
    return { kind, title: tpl.title, sheet: tpl.sheet, file: tpl.file, intro: tpl.intro, columns: tpl.columns, values, currentVendor };
}

/**
 * rows: array of arrays, header row first (the template's sheet as the page read it). dryRun checks every line and
 * saves nothing. slaFrom 'import' (default) starts the SLA clock at the import; 'logged' keeps the original date
 * (tickets already past due are marked overdue without sending overdue mails).
 */
async function importTickets(args, agent) {
    if (args.dryRun !== false) return runImport(args, agent);
    // One import at a time across every backend copy (load balancer): two Admins pressing Import together would
    // otherwise both pass the "already moved" check and create the same tickets twice.
    const client = await pool.connect();
    try {
        const got = (await client.query(`SELECT pg_try_advisory_lock(hashtext('samadhan.ticket_migration')) AS ok`)).rows[0].ok;
        if (!got) throw fail(409, 'Another ticket import is running - try again in a minute.');
        try { return await runImport(args, agent); } finally { await client.query(`SELECT pg_advisory_unlock(hashtext('samadhan.ticket_migration'))`).catch(() => {}); }
    } finally {
        client.release();
    }
}

async function runImport({ kind, rows, dryRun = true, slaFrom = 'import' }, agent) {
    const tpl = TEMPLATES[kind];
    if (!tpl) throw fail(400, 'Unknown template.');
    if (!Array.isArray(rows) || rows.length < 2) throw fail(400, 'The sheet needs the header row and at least one ticket.');
    if (rows.length > 5001) throw fail(400, 'At most 5,000 tickets per upload - split the file.');
    const head = (rows[0] || []).map(norm);
    const col = {};
    for (const c of tpl.columns) col[c.key] = head.findIndex((h) => h === norm(c.header) || h === norm(c.key));
    const missingCols = tpl.columns.filter((c) => c.required && col[c.key] < 0).map((c) => c.header);
    if (missingCols.length) throw fail(400, `Columns missing: ${missingCols.join(', ')}. Use the downloaded template and keep its header row.`);
    const L = await lists(kind);
    const salesWs = L.c.wsByKey.get('SEC_SALES');
    const appByCode = (code) => {
        const k = String(code).trim().split(/[\s–-]/)[0].toUpperCase();
        return L.apps.find((a) => a.code === k) ?? null;
    };
    const statusFor = (v) => {
        const s = String(v ?? '').trim();
        if (!s) return L.statuses.find((x) => x.name === 'Open') ?? L.statuses[0];
        const exact = L.statuses.find((x) => x.name.toLowerCase() === s.toLowerCase());
        if (exact) return exact;
        for (const [re, names] of STATUS_ALIASES) {
            if (!re.test(s)) continue;
            for (const n of names) { const hit = L.statuses.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (hit) return hit; }
        }
        return null;
    };
    const already = new Set((await pool.query(
        `SELECT lower("legacyRef") AS r FROM samadhan.tickets WHERE "legacyRef" IS NOT NULL AND "deletedAt" IS NULL`).catch(() => ({ rows: [] }))).rows.map((r) => r.r));
    const out = { total: rows.length - 1, ok: 0, skipped: 0, errors: [], created: [] };
    const seenInFile = new Set();
    const { createTicket } = require('./tickets');
    const { computeDueDates } = require('./sla');
    const v = (r, k) => (col[k] >= 0 ? (r[col[k]] instanceof Date ? r[col[k]] : String(r[col[k]] ?? '').trim()) : '');
    for (const [i, r] of rows.slice(1).entries()) {
        const line = i + 2;
        if (!Array.isArray(r) || r.every((x) => String(x ?? '').trim() === '')) { out.total--; continue; }
        const errs = [];
        const legacy = String(v(r, 'legacyRef')).slice(0, 80);
        const subject = String(v(r, 'subject'));
        if (!legacy) errs.push('Legacy ticket no is empty.');
        if (!subject) errs.push('Subject is empty.');
        if (legacy && already.has(legacy.toLowerCase())) { out.skipped++; continue; }
        if (legacy && seenInFile.has(legacy.toLowerCase())) errs.push(`Legacy ticket no ${legacy} appears twice in the file.`);
        // Application (desk)
        const appCell = v(r, 'applicationCode') || (tpl.desks === 'sales' ? 'SS' : '');
        const app = appCell ? appByCode(appCell) : null;
        if (!appCell) errs.push('Application code is empty.');
        else if (!app) errs.push(`Application code "${appCell}" is not in the list (sheet Lists).`);
        const deskKey = app ? L.c.wsById.get(app.workspaceId)?.key : null;
        const desk = deskKey ? L.perDesk[deskKey] : null;
        // Type / category / sub-category (the desk's lists)
        const type = v(r, 'type') ? (desk?.types.length ? ci(desk.types, v(r, 'type')) : String(v(r, 'type'))) : null;
        if (v(r, 'type') && desk?.types.length && !type) errs.push(`Type "${v(r, 'type')}" is not in the ${L.c.wsByKey.get(deskKey)?.name ?? 'desk'} list.`);
        const catNode = v(r, 'category') && desk?.tree.length ? desk.tree.find((t) => t.value.toLowerCase() === String(v(r, 'category')).toLowerCase()) : null;
        const category = v(r, 'category') ? (desk?.tree.length ? catNode?.value ?? null : String(v(r, 'category'))) : null;
        if (v(r, 'category') && desk?.tree.length && !category) errs.push(`Category "${v(r, 'category')}" is not in the desk's list.`);
        let fn = v(r, 'subCategory') ? String(v(r, 'subCategory')) : null;
        if (fn && catNode?.children.length) {
            const hit = ci(catNode.children, fn);
            if (!hit) errs.push(`Sub-category "${fn}" is not under ${catNode.value}.`);
            fn = hit;
        }
        // Priority, impact, urgency
        let priority;
        const pr = String(v(r, 'priority')).toLowerCase();
        if (pr) {
            priority = PRIORITY_WORDS[pr] ?? PRIORITY_WORDS[pr.replace(/\s*-.*$/, '')];
            if (!priority) errs.push(`Priority "${v(r, 'priority')}": use Low, Medium, High, Urgent or P1-P4.`);
        }
        const level = (k, max = 4) => {
            const s = String(v(r, k)).trim();
            if (!s) return null;
            const n = Number(s.split(/[\s–-]/)[0]);
            if (!Number.isInteger(n) || n < 1 || n > max) { errs.push(`${k === 'impact' ? 'Impact' : 'Urgency'} "${s}": a number 1 to 4.`); return null; }
            return n;
        };
        const impact = col.impact >= 0 ? level('impact') : null;
        const urgency = col.urgency >= 0 ? level('urgency') : null;
        // Status
        const status = statusFor(v(r, 'status'));
        if (!status) errs.push(`Status "${v(r, 'status')}" is not an open status in Samadhan (resolved / closed tickets are not migrated).`);
        // Dates
        const logged = parseWhen(v(r, 'loggedOn'));
        if (!v(r, 'loggedOn')) errs.push('Logged on is empty.');
        else if (logged === undefined) errs.push(`Logged on "${v(r, 'loggedOn')}" is not a date (DD-MM-YYYY HH:MM).`);
        else if (logged && logged > new Date(Date.now() + 5 * 60000)) errs.push('Logged on is in the future.');
        const dueCell = col.resolutionDue >= 0 ? v(r, 'resolutionDue') : '';
        const due = dueCell ? parseWhen(dueCell) : null;
        if (dueCell && due === undefined) errs.push(`Resolution due "${dueCell}" is not a date.`);
        // Requester
        const reqName = String(v(r, 'requesterName')).slice(0, 200);
        const reqEmail = String(v(r, 'requesterEmail')).toLowerCase();
        const reqPhone = String(v(r, 'requesterPhone') || v(r, 'mobileNo'));
        if (!reqName) errs.push('Requester name is empty.');
        if (reqEmail && !EMAIL_RE.test(reqEmail)) errs.push(`Requester email "${reqEmail}" is not valid.`);
        if (reqPhone && !PHONE_RE.test(reqPhone)) errs.push(`Phone "${reqPhone}" is not a phone number.`);
        // Group, agent, vendor
        const gName = String(v(r, 'groupName'));
        const group = gName ? L.groups.find((g) => g.name.toLowerCase() === gName.toLowerCase()) : null;
        if (gName && !group) errs.push(`Group "${gName}" is not in Samadhan.`);
        const aCell = String(v(r, 'agentEmail')).toLowerCase().split(/\s/)[0];
        const agentRow = aCell ? L.agents.find((a) => a.email.toLowerCase() === aCell) : null;
        if (aCell && !agentRow) errs.push(`Agent "${aCell}" is not an active Samadhan agent.`);
        const vName = String(v(r, 'vendor'));
        const vendor = vName ? L.vendors.find((x) => x.name.toLowerCase() === vName.toLowerCase() || (x.shortName ?? '').toLowerCase() === vName.toLowerCase()) : null;
        if (vName && !vendor) errs.push(`Support vendor "${vName}" is not in the list (Admin > Support model).`);
        // IT details
        const hosting = v(r, 'hosting') ? ci(L.hosting, v(r, 'hosting')) : null;
        if (v(r, 'hosting') && !hosting) errs.push(`Hosting "${v(r, 'hosting')}" is not in the list.`);
        const environment = v(r, 'environment') ? ci(L.environments, v(r, 'environment')) : null;
        if (v(r, 'environment') && !environment) errs.push(`Environment "${v(r, 'environment')}" is not in the list.`);
        const source = v(r, 'source') ? ci(L.sources, v(r, 'source')) : null;
        if (v(r, 'source') && !source) errs.push(`Source "${v(r, 'source')}" is not in the list.`);

        if (errs.length) { out.errors.push({ line, legacyRef: legacy || null, error: errs.join(' ') }); continue; }
        seenInFile.add(legacy.toLowerCase());
        out.ok++;
        if (dryRun) continue;

        const fields = {
            type: type || undefined, category: category || undefined, function: fn || undefined, priority, impact: impact ?? undefined, urgency: urgency ?? undefined,
            groupId: group?.id, agentId: agentRow?.id, tags: ['migrated'],
        };
        if (tpl.desks === 'sales') for (const k of SALES_FIELDS) { const x = String(v(r, k)); if (x) fields[k] = x.slice(0, 2000); }
        const it = tpl.desks === 'sales' ? null : Object.fromEntries(Object.entries({ siteLocation: v(r, 'site'), assetTag: v(r, 'assetTag'), serverName: v(r, 'serverName'), hosting, environment })
            .filter(([, x]) => x).map(([k, x]) => [k, String(x).slice(0, 200)]));
        let t;
        try {
            t = await createTicket({
                applicationId: app.id, allowAnyDesk: true, classificationSource: 'manual', quiet: true, actorAgentId: agent?.id ?? null, actorName: agent?.name,
                subject: subject.slice(0, 300), description: textToHtml(String(v(r, 'description') || subject)),
                requester: { email: reqEmail || null, name: reqName, phone: reqPhone || null, mobile: reqPhone || null },
                source: source || 'Migration import', createdAt: logged,
                fields, it: it && Object.keys(it).length ? it : undefined,
                supportPartnerId: vendor?.id ?? undefined, legacyRef: legacy,
            });
        } catch (e) {
            out.ok--;
            out.errors.push({ line, legacyRef: legacy, error: `Not created: ${e.message}` });
            continue;
        }
        // Status, SLA clock and first response (the old tool already acknowledged the ticket).
        const now = new Date();
        const base = slaFrom === 'logged' ? logged : now;
        const dues = await computeDueDates({ createdAt: base, groupId: t.groupId, priority: t.priority, slaPausedMins: 0, firstRespondedAt: now, workspaceId: t.workspaceId, applicationId: t.applicationId });
        const resolutionDueAt = due ?? dues.resolutionDueAt ?? null;
        const late = resolutionDueAt && resolutionDueAt < now;
        await pool.query(
            `UPDATE samadhan.tickets SET "statusId" = $2, "statusChangedAt" = $3, "slaPausedAt" = $4, "firstRespondedAt" = $3, "firstResponseDueAt" = NULL,
                    "resolutionDueAt" = $5, "frReminded" = true, "frViolated" = false, "resReminded" = $6, "resViolated" = $6 WHERE id = $1`,
            [t.id, status.id, now, status.pausesSla ? now : null, resolutionDueAt, Boolean(late)]);
        const notes = String(v(r, 'workNotes'));
        const history = `Moved from the old tool by ${agent?.name ?? 'an Admin'}: legacy ticket ${legacy}, logged ${logged ? logged.toISOString() : '-'}, status there "${v(r, 'status') || 'Open'}".`;
        const html = textToHtml(notes ? `${history}\n\nLast update in the old tool:\n${notes}` : history);
        await pool.query(`INSERT INTO samadhan.conversations ("ticketId", kind, "bodyHtml", "bodyText", "agentId") VALUES ($1, 'NOTE', $2, $3, $4)`, [t.id, html, stripTags(html), agent?.id ?? null]);
        await logActivity(t.id, 'migrated', { template: kind, legacyRef: legacy, slaFrom }, agent?.id ?? null);
        already.add(legacy.toLowerCase());
        out.created.push({ line, legacyRef: legacy, id: t.id, ref: t.displayRef ?? `#${t.id}` });
    }
    out.errors = out.errors.slice(0, 1000);
    return { ...out, dryRun };
}

module.exports = { KINDS, TEMPLATES, importTickets, parseWhen, templateInfo };
