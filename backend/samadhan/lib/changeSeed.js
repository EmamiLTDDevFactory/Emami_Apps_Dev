'use strict';
/*
   v7 Phase 6 seeds and lists (master prompt §O "Common lists", "Service catalog", "Approval chains"): transports,
   change type / risk, approval decisions, the six approval chains and the service catalogue. Append-only; migration
   7.6-change records what it adds so its down step removes exactly those rows.
*/
const TR_TYPES = ['Workbench', 'Customizing', 'Transport of Copies', 'Relocation'];
const TR_STATUSES = ['Created', 'Released', 'Imported to QAS', 'Tested OK in QAS', 'Approved for PRD', 'Imported to PRD', 'Failed (RC ≥ 8)', 'Reverted'];
/** Default transport number pattern (Admin > Settings 'transport.regex' can change it): SID + K9 + 5 digits. */
const TR_RE_DEFAULT = '^[A-Z][A-Z0-9]{2}K9\\d{5}$';
const CHANGE_TYPES = ['Standard', 'Normal', 'Emergency'];
const CHANGE_RISKS = ['Low', 'Medium', 'High'];
const DECISIONS = ['Approved', 'Rejected', 'Need info'];
const WINDOW_KINDS = ['FREEZE', 'MAINTENANCE'];

/*
   Approval step approver types:
     manager   - the requester's manager; the email is given when the approval starts (New ticket / Start approval)
     email     - a fixed person by email (e.g. a role owner); one-click link by email
     agent     - a fixed Samadhan agent (by email, resolved at start)
     approver  - anyone with the approval.decide permission in scope (IT Head, CAB, Security ...), from My approvals
   Every step can be decided in Samadhan by someone with approval.decide (or approval.override for someone else's step).
*/
const CHAINS = [
    { key: 'ACCESS', name: 'Access / role', workspace: null, appliesTo: { recordClass: ['ACCESS_REQUEST'] },
        steps: [{ name: 'Manager', type: 'manager' }, { name: 'Role owner', type: 'approver' }, { name: 'IT Security', type: 'approver' }] },
    { key: 'NORMAL_CHANGE', name: 'Normal change', workspace: null, appliesTo: { recordClass: ['CHANGE'], changeType: ['Normal'] },
        steps: [{ name: 'Module / domain lead', type: 'approver' }, { name: 'IT Head (CAB)', type: 'approver' }] },
    { key: 'EMERGENCY_CHANGE', name: 'Emergency change', workspace: null, appliesTo: { recordClass: ['CHANGE'], changeType: ['Emergency'] },
        steps: [{ name: 'IT Head', type: 'approver' }] },
    { key: 'TRANSPORT_PRD', name: 'Transport to PRD', workspace: 'SAP', appliesTo: { recordClass: ['CHANGE'] },
        steps: [{ name: 'QA sign-off (test evidence)', type: 'approver' }, { name: 'Module lead', type: 'approver' }] },
    { key: 'FIREFIGHTER', name: 'Firefighter access', workspace: 'SAP', appliesTo: { recordClass: ['ACCESS_REQUEST'] },
        steps: [{ name: 'IT Head', type: 'approver' }] },
    { key: 'FIREWALL', name: 'Firewall / port opening', workspace: 'INFRA_IT', appliesTo: { recordClass: ['SERVICE_REQUEST', 'CHANGE'] },
        steps: [{ name: 'Network & Security lead', type: 'approver' }, { name: 'IT Head', type: 'approver' }] },
];

/*
   Service catalogue: [workspace, name, description, icon, recordClass, category, function, chainKey, portal, fulfilGroup, formFields]
   formFields are extra questions; their answers go into the ticket description (label: value).
*/
const F = (label, type = 'text', required = false, options) => ({ label, type, required, ...(options ? { options } : {}) });
const CATALOG = [
    ['SAP', 'New SAP user', 'A new SAP login for a joiner or a new role holder', 'UserPlus', 'ACCESS_REQUEST', 'Security & GRC', null, 'ACCESS', true, 'SAP Security & GRC',
        [F('SAP system (SID)', 'text', true), F('Client', 'text'), F('Reference user (same access as)'), F('Valid until', 'date')]],
    ['SAP', 'Unlock / password reset', 'SAP user locked or password expired', 'KeyRound', 'SERVICE_REQUEST', 'Security & GRC', null, null, true, 'SAP Security & GRC',
        [F('SAP system (SID)', 'text', true), F('Client', 'text'), F('SAP user id', 'text', true)]],
    ['SAP', 'Role assignment', 'Add an SAP role - manager, role owner and Security approve (SoD checked)', 'ShieldCheck', 'ACCESS_REQUEST', 'Security & GRC', null, 'ACCESS', true, 'SAP Security & GRC',
        [F('SAP system (SID)', 'text', true), F('Client', 'text', true), F('Role', 'text', true), F('Valid until', 'date', true), F('Business justification', 'textarea', true),
            F('I confirm this role does not conflict with my other duties (SoD)', 'checkbox', true)]],
    ['SAP', 'Firefighter access', 'Time-bound emergency access; IT Head approves; the log is reviewed on expiry', 'Flame', 'ACCESS_REQUEST', 'Security & GRC', null, 'FIREFIGHTER', false, 'SAP Security & GRC',
        [F('SAP system (SID)', 'text', true), F('Firefighter id', 'text', true), F('From', 'date', true), F('Valid until', 'date', true), F('Reason', 'textarea', true)]],
    ['SAP', 'Master data create / change', 'Material, customer, vendor, price or BOM', 'Database', 'SERVICE_REQUEST', 'MM', null, null, true, null,
        [F('Object', 'select', true, ['Material', 'Customer / BP', 'Vendor / BP', 'Price / condition', 'BOM', 'Other']), F('Codes / numbers'), F('What should change', 'textarea', true)]],
    ['SAP', 'Transport to PRD', 'Move tested transports to production', 'Truck', 'CHANGE', 'Basis', null, 'TRANSPORT_PRD', false, 'SAP Basis & ECS liaison',
        [F('Transport numbers', 'text', true), F('Tested in QAS by', 'text', true), F('Preferred date', 'date')]],
    ['SAP', 'Batch job', 'Schedule, change or stop a background job', 'Clock', 'SERVICE_REQUEST', 'Basis', null, null, false, 'SAP Basis & ECS liaison',
        [F('Job name', 'text', true), F('Frequency'), F('Details', 'textarea')]],
    ['SAP', 'Output device', 'A new or changed SAP printer / output device', 'Printer', 'SERVICE_REQUEST', 'Basis', null, null, false, 'SAP Basis & ECS liaison',
        [F('Printer name / IP', 'text', true), F('Location')]],
    ['SAP', 'Report / data extract', 'A one-off extract or a new report', 'FileSpreadsheet', 'SERVICE_REQUEST', 'SD', null, null, true, null,
        [F('Which data', 'textarea', true), F('Period'), F('Needed by', 'date')]],
    ['SAP', 'New org element', 'Company code, plant, sales org ... (raised as a Change)', 'Building2', 'CHANGE', 'FI', null, 'NORMAL_CHANGE', false, null,
        [F('Element', 'select', true, ['Company code', 'Plant', 'Storage location', 'Sales org', 'Purchasing org', 'Other']), F('Details', 'textarea', true)]],
    ['SEC_SALES', 'New app user / device mapping', 'A new user on a sales app, or a device change', 'Smartphone', 'SERVICE_REQUEST', null, null, null, true, null,
        [F('App', 'text', true), F('User / employee id', 'text', true), F('Device IMEI / model')]],
    ['SEC_SALES', 'App reinstall / version upgrade', 'Help to reinstall or upgrade a sales app', 'RefreshCw', 'SERVICE_REQUEST', null, null, null, true, null,
        [F('App', 'text', true), F('Current version'), F('Device model')]],
    ['SEC_SALES', 'Data correction', 'Correct orders, claims or master data in a sales app', 'Eraser', 'SERVICE_REQUEST', null, null, null, false, null,
        [F('App', 'text', true), F('Records / numbers', 'text', true), F('Correction needed', 'textarea', true)]],
    ['DIGITAL_APPS', 'App access', 'Access to an in-house web app', 'LogIn', 'ACCESS_REQUEST', 'Frontend (Next.js)', 'Login / Session', 'ACCESS', true, 'Apps Support',
        [F('App', 'text', true), F('Role needed'), F('Valid until', 'date')]],
    ['DIGITAL_APPS', 'Data correction', 'Correct data in an in-house app', 'Eraser', 'SERVICE_REQUEST', 'DB – PostgreSQL', 'Data Issue', null, false, 'Data',
        [F('App', 'text', true), F('Records', 'text', true), F('Correction needed', 'textarea', true)]],
    ['DIGITAL_APPS', 'DB read access (HANA / PostgreSQL)', 'Read-only database access', 'Database', 'ACCESS_REQUEST', 'DB – PostgreSQL', null, 'ACCESS', false, 'Data',
        [F('Database', 'select', true, ['SAP HANA', 'PostgreSQL']), F('Schema / tables', 'text', true), F('Valid until', 'date', true)]],
    ['DIGITAL_APPS', 'New environment / deployment', 'A new environment or a release deployment', 'Rocket', 'CHANGE', 'Release / Deployment', null, 'NORMAL_CHANGE', false, 'Backend / API',
        [F('App', 'text', true), F('Environment', 'select', true, ['Development', 'Quality / Test', 'Production']), F('Planned date', 'date')]],
    ['INFRA_IT', 'Laptop / device', 'A new or replacement laptop, desktop or phone', 'Laptop', 'SERVICE_REQUEST', 'End-user IT', 'Laptop / Desktop', null, true, 'End-user Support',
        [F('Device', 'select', true, ['Laptop', 'Desktop', 'Mobile phone', 'Monitor', 'Other']), F('For (name / employee id)', 'text', true), F('Location', 'text', true)]],
    ['INFRA_IT', 'Software install', 'Install licensed software', 'Package', 'SERVICE_REQUEST', 'End-user IT', 'Software Install / Licence', null, true, 'End-user Support',
        [F('Software', 'text', true), F('Asset tag')]],
    ['INFRA_IT', 'VPN', 'VPN access to work from outside', 'Shield', 'ACCESS_REQUEST', 'Network', 'VPN', 'ACCESS', true, 'Network & Security',
        [F('For (name / employee id)', 'text', true), F('Valid until', 'date')]],
    ['INFRA_IT', 'Shared mailbox / Teams', 'A shared mailbox, distribution list or Teams team', 'Users', 'SERVICE_REQUEST', 'Email & M365', null, null, true, 'M365',
        [F('Name', 'text', true), F('Members (emails)', 'textarea')]],
    ['INFRA_IT', 'New joiner IT kit', 'Laptop, email, VPN and apps for a new joiner', 'BadgePlus', 'SERVICE_REQUEST', 'End-user IT', null, null, true, 'IT Service Desk',
        [F('Joiner name', 'text', true), F('Joining date', 'date', true), F('Department'), F('Location', 'text', true)]],
    ['INFRA_IT', 'Server / VM request', 'A new server or virtual machine', 'Server', 'SERVICE_REQUEST', 'Servers & Storage', 'Virtual Machine', 'NORMAL_CHANGE', false, 'Server & Storage',
        [F('Purpose', 'textarea', true), F('CPU / RAM / disk'), F('Operating system')]],
    ['INFRA_IT', 'Firewall rule / port opening', 'Open a port or add a firewall rule (Network & Security, then IT Head)', 'BrickWall', 'CHANGE', 'Network', 'Firewall', 'FIREWALL', false, 'Network & Security',
        [F('Source', 'text', true), F('Destination', 'text', true), F('Port / protocol', 'text', true), F('Valid until', 'date'), F('Reason', 'textarea', true)]],
    ['INFRA_IT', 'Cloud resource request', 'An AWS / Azure resource', 'Cloud', 'SERVICE_REQUEST', 'Cloud – AWS', null, 'NORMAL_CHANGE', false, 'Cloud Ops (AWS / Azure)',
        [F('Cloud', 'select', true, ['AWS', 'Azure']), F('Resource', 'text', true), F('Cost centre')]],
    ['INFRA_IT', 'Backup restore request', 'Restore files, a mailbox or a database', 'History', 'SERVICE_REQUEST', 'Servers & Storage', 'Backup & Restore', null, false, 'Server & Storage',
        [F('What to restore', 'text', true), F('Restore point (date / time)', 'text', true)]],
];

module.exports = { TR_TYPES, TR_STATUSES, TR_RE_DEFAULT, CHANGE_TYPES, CHANGE_RISKS, DECISIONS, WINDOW_KINDS, CHAINS, CATALOG };
