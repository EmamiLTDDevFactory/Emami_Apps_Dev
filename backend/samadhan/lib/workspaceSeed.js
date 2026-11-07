'use strict';
/*
   v7 Phase 3 seeds (master prompt §H 6 / 7.2, §O "Common lists"): workspaces, applications and the Impact x Urgency
   matrix. Used by the migration step 7.2-workspaces (inserted once, tagged with seedKey so the down step removes exactly
   these rows) and by tests. Admins can rename, re-order or deactivate everything later; codes are fixed.

   Application mapping decisions (docs/v7/APP-MAPPING.md §0, user 2026-11-07): Rural mSFA -> own code RMSFA, CDMS -> own
   code CDMS, Salescode B2B App -> SCB2B in Secondary Sales (B2B stays the Digital Apps code).
*/

const SEC_SALES_DESC = 'Secondary sales apps: Arteria (mSFA, Supervisor) today, Salescode.AI (SFA, Supervisor, DMS, B2B, B2C) going forward.';
const SAP_DESC = 'Primary sales and every SAP process: ECC run support now, S/4HANA after go-live.';

// Only Secondary Sales is enabled; the others switch on with the workspaces.enabled flag and their own enabled toggle.
const WORKSPACES = [
    { key: 'SEC_SALES', name: 'Secondary Sales', shortCode: 'SS', icon: 'ShoppingCart', color: 'accent', enabled: true, portalEnabled: true, position: 1,
      priorityMode: 'SEVERITY_MATRIX', categoryLabel: 'Category', functionLabel: 'Function', description: SEC_SALES_DESC },
    { key: 'SAP', name: 'SAP & Primary Sales', shortCode: 'SAP', icon: 'Boxes', color: 'info', enabled: false, portalEnabled: false, position: 2,
      priorityMode: 'IMPACT_URGENCY', categoryLabel: 'Module', functionLabel: 'Sub-process', description: SAP_DESC },
    { key: 'S4_PROGRAM', name: 'S/4HANA Programme', shortCode: 'S4P', icon: 'Rocket', color: 'warn', enabled: false, portalEnabled: false, position: 3,
      priorityMode: 'IMPACT_URGENCY', categoryLabel: 'Process area', functionLabel: 'Sub-process', description: 'Defects, data migration, cutover, RAID, hypercare.' },
    { key: 'DIGITAL_APPS', name: 'Digital Apps', shortCode: 'DIG', icon: 'AppWindow', color: 'good', enabled: false, portalEnabled: false, position: 4,
      priorityMode: 'IMPACT_URGENCY', categoryLabel: 'Category', functionLabel: 'Sub-category', description: 'B2B / B2C and other in-house Next.js / OData / BTP apps.' },
    { key: 'INFRA_IT', name: 'Infra & IT', shortCode: 'IT', icon: 'Server', color: 'bad', enabled: false, portalEnabled: false, position: 5,
      priorityMode: 'IMPACT_URGENCY', categoryLabel: 'Category', functionLabel: 'Sub-category', description: 'Servers, cloud, network, database, security, end-user IT, M365.' },
];

// [code, name, workspace, aliases, active, vendor]
const APPLICATIONS = [
    ['SS', 'Secondary Sales – General', 'SEC_SALES', ['secondary sales', 'distributor', 'scheme', 'claim', 'e invoice', 'tcs'], true],
    ['MSFA', 'mSFA App (Arteria)', 'SEC_SALES', ['msfa', 'msecsales', 'm-sfa', 'arteria'], true, 'Arteria'],
    ['RMSFA', 'Rural mSFA App (Arteria)', 'SEC_SALES', ['rural msfa', 'rural sfa', 'rmsfa'], true, 'Arteria'],
    ['SUP', 'Supervisor App (Arteria)', 'SEC_SALES', ['supervisor app', 'arteria supervisor'], true, 'Arteria'],
    ['MR', 'SFA App (Salescode.AI)', 'SEC_SALES', ['salescode sfa', 'sfa app', 'mr app', 'medical rep', 'mr expense'], true, 'Salescode.AI'],
    ['SCSUP', 'Supervisor App (Salescode.AI)', 'SEC_SALES', ['salescode supervisor', 'salescode manager', 'manager app'], true, 'Salescode.AI'],
    ['MERCH', 'Merchandising App', 'SEC_SALES', ['merchandising', 'merchandiser', 'planogram'], true],
    ['DMS', 'DMS (Salescode.AI)', 'SEC_SALES', ['dms', 'distributor management', 'salescode dms', 'salescode portal'], true, 'Salescode.AI'],
    ['CDMS', 'CDMS (legacy distributor system)', 'SEC_SALES', ['cdms'], true],
    ['SCB2B', 'B2B App (Salescode.AI)', 'SEC_SALES', ['salescode b2b', 'b2b', 'b2b app', 'b2b portal'], true, 'Salescode.AI'],
    ['SCB2C', 'B2C App (Salescode.AI)', 'SEC_SALES', ['salescode b2c', 'b2c', 'b2c app', 'e-commerce', 'ecommerce', 'online store'], true, 'Salescode.AI'],
    // B2B / B2C are Salescode.AI apps (user, 2026-11-07): the Digital Apps codes stay for history, inactive.
    ['B2B', 'B2B App (in-house, not used)', 'DIGITAL_APPS', [], false],
    ['B2C', 'B2C App (in-house, not used)', 'DIGITAL_APPS', [], false],
    ['SMD', 'Samadhan', 'DIGITAL_APPS', ['samadhan', 'helpdesk app'], true],
    ['HUB', 'Emami Apps Hub', 'DIGITAL_APPS', ['emami apps', 'hub', 'apps hub'], true],
    ['CUST', 'Other Custom App', 'DIGITAL_APPS', ['custom app', 'web app', 'portal app'], true],
    ['SAP', 'SAP ECC (current)', 'SAP', ['sap', 't-code', 'tcode', 'idoc', 'short dump', 'st22', 'ecc'], true],
    ['S4H', 'SAP S/4HANA', 'SAP', ['s/4hana', 's4hana', 's4 hana'], false],
    ['FIORI', 'SAP Fiori Apps', 'SAP', ['fiori', 'launchpad', 'ui5'], true],
    ['BTP', 'SAP BTP', 'SAP', ['btp', 'cpi', 'iflow', 'integration suite'], true],
    ['ALM', 'SolMan / Cloud ALM', 'SAP', ['solman', 'solution manager', 'cloud alm', 'charm'], true],
    ['NWP', 'SAP NetWeaver Portal', 'SAP', ['netweaver portal', 'nw portal', 'ep portal'], true],
    ['S4P', 'S/4HANA Programme', 'S4_PROGRAM', ['s4 programme', 's/4 programme', 'cutover', 'mock cutover', 'hypercare'], true],
    ['INFRA', 'Servers, Storage & Data Centre', 'INFRA_IT', ['server down', 'server', 'storage', 'nas', 'san', 'data centre', 'backup'], true],
    ['CLOUD', 'Cloud – AWS / Azure', 'INFRA_IT', ['aws', 'azure', 'ec2', 's3 bucket', 'cloud'], true],
    ['NET', 'Network & Connectivity', 'INFRA_IT', ['vpn', 'firewall', 'network', 'internet', 'wifi', 'wi-fi', 'lan', 'mpls'], true],
    ['DB', 'Database Administration (HANA / PostgreSQL)', 'INFRA_IT', ['database', 'postgresql', 'postgres', 'hana db'], true],
    ['SEC', 'Cyber Security', 'INFRA_IT', ['phishing', 'malware', 'virus', 'ransomware', 'suspicious login', 'security incident'], true],
    ['EUC', 'End-user IT (laptop, printer, mobile)', 'INFRA_IT', ['laptop', 'desktop', 'printer', 'keyboard', 'mouse', 'monitor'], true],
    ['M365', 'Email & Microsoft 365', 'INFRA_IT', ['outlook', 'teams', 'onedrive', 'sharepoint', 'mailbox', 'office 365', 'm365'], true],
    ['GEN', 'General / Other', 'INFRA_IT', ['other'], true],
];

const RECORD_CLASSES = ['INCIDENT', 'SERVICE_REQUEST', 'ACCESS_REQUEST', 'CHANGE', 'PROBLEM', 'QUERY', 'ENHANCEMENT', 'DEFECT', 'TASK', 'RISK'];
const CLASSIFICATION_SOURCES = ['manual', 'subject_tag', 'keyword', 'sender_rule', 'ai', 'default', 'backfill'];

// §O: 1x1, 1x2, 2x1 -> Urgent (4) · 1x3, 2x2, 3x1 -> High (3) · 1x4, 2x3, 3x2, 4x1 -> Medium (2) · else Low (1).
// Priorities use Samadhan's numbering: 1 Low, 2 Medium, 3 High, 4 Urgent.
function matrixPriority(impact, urgency) {
    const s = impact + urgency;
    return s <= 3 ? 4 : s === 4 ? 3 : s === 5 ? 2 : 1;
}
const MATRIX = [];
for (let i = 1; i <= 4; i++) for (let u = 1; u <= 4; u++) MATRIX.push({ impact: i, urgency: u, priority: matrixPriority(i, u) });
const IMPACTS = { 1: 'Enterprise-wide', 2: 'Department / Plant / Region', 3: 'Multiple users', 4: 'Single user' };
const URGENCIES = { 1: 'Critical – work stopped, no workaround', 2: 'High – severely impaired', 3: 'Medium – workaround available', 4: 'Low – can wait' };

/*
   Backfill of existing tickets (APP-MAPPING.md §0). Returns the application code for a ticket's type / category.
   Category / function / type values are never changed by the backfill.
*/
const TYPE_MAP = {
    'msfa': 'MSFA', 'rural msfa': 'RMSFA', 'salescode dms': 'DMS', 'cdms': 'CDMS', 'salescode sfa': 'MR',
    'salescode supervisor app': 'SUP', 'salescode manager app': 'SUP', 'salescode b2b app': 'SCB2B', 'salescode portal': 'DMS', 'wrong ticket': 'SS',
};
function backfillCode(type, category) {
    const t = String(type ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (TYPE_MAP[t]) return TYPE_MAP[t];
    const c = String(category ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (c.startsWith('msecsales') || c === 'msfa reports') return 'MSFA';
    if (c.startsWith('rural msfa')) return 'RMSFA';
    if (c.startsWith('cdms')) return 'CDMS';
    if (c === 'mr expense') return 'MR';
    if (c.startsWith('salescode')) return 'DMS';
    return 'SS';
}
// The same rule in SQL, for the one UPDATE that backfills every ticket (t = the tickets alias).
const BACKFILL_SQL = `CASE lower(regexp_replace(trim(coalesce(t.type, '')), '\\s+', ' ', 'g'))
${Object.entries(TYPE_MAP).map(([k, v]) => `    WHEN '${k}' THEN '${v}'`).join('\n')}
    ELSE CASE
        WHEN lower(trim(coalesce(t.category, ''))) LIKE 'msecsales%' OR lower(regexp_replace(trim(coalesce(t.category, '')), '\\s+', ' ', 'g')) = 'msfa reports' THEN 'MSFA'
        WHEN lower(trim(coalesce(t.category, ''))) LIKE 'rural msfa%' THEN 'RMSFA'
        WHEN lower(trim(coalesce(t.category, ''))) LIKE 'cdms%' THEN 'CDMS'
        WHEN lower(regexp_replace(trim(coalesce(t.category, '')), '\\s+', ' ', 'g')) = 'mr expense' THEN 'MR'
        WHEN lower(trim(coalesce(t.category, ''))) LIKE 'salescode%' THEN 'DMS'
        ELSE 'SS' END
END`;

module.exports = { SEC_SALES_DESC, SAP_DESC, WORKSPACES, APPLICATIONS, RECORD_CLASSES, CLASSIFICATION_SOURCES, MATRIX, IMPACTS, URGENCIES, matrixPriority, backfillCode, BACKFILL_SQL, TYPE_MAP };
