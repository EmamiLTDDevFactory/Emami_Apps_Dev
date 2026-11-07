'use strict';
/*
   v7 Phase 4 seeds (master prompt §O): the SAP & Primary Sales desk - types with their record class, the Module ->
   Sub-process tree, the common lists, new statuses (id >= 100, offered in the non-sales desks), SAP groups, SLA
   policies for SAP / Infra / Digital incidents, canned responses and scenarios. Inserted once by migration 7.4-sap,
   tagged so its down step removes exactly them. No customer data is invented: systems, clients, plants and T-code
   lists come from the Admin's Excel import (Admin > SAP & Infra masters).
*/

const SAP_TYPES = [
    ['Incident', 'INCIDENT'], ['Service Request', 'SERVICE_REQUEST'], ['Access / Authorization Request', 'ACCESS_REQUEST'],
    ['Master Data Request', 'SERVICE_REQUEST'], ['Report / Data Extract', 'SERVICE_REQUEST'], ['Batch Job Request', 'SERVICE_REQUEST'],
    ['Transport Movement', 'CHANGE'], ['Change Request', 'CHANGE'], ['Enhancement', 'ENHANCEMENT'], ['Problem', 'PROBLEM'], ['Query / How-to', 'QUERY'],
];

const SAP_TREE = {
    SD: ['Sales Order', 'Pricing & Conditions', 'Credit Management', 'Delivery & Shipping', 'Billing / Invoicing', 'Returns, Credit & Debit Memo', 'Output / Printing',
        'Schemes, Rebates & Settlement', 'ATP', 'Customer / BP Master', 'STO', 'Intercompany', 'GST e-Invoice / e-Way Bill', 'Consignment', 'Reports'],
    MM: ['Purchase Requisition', 'Purchase Order', 'Release Strategy', 'Goods Receipt', 'Goods Issue / Transfer Posting', 'Physical Inventory', 'Invoice Verification (MIRO)',
        'Vendor / BP Master', 'Material Master', 'Batch Management', 'Subcontracting / Job Work', 'Service Entry Sheet', 'Inventory Valuation', 'Reports'],
    PP: ['BOM', 'Master Recipe / Routing', 'Process / Production Order', 'MRP Run', 'Planned Orders', 'Confirmation', 'Backflush / Goods Movement', 'Capacity Planning',
        'Demand Management / PIR', 'Batch Determination', 'Co / By-product', 'Reports'],
    QM: ['Inspection Lot', 'Results Recording', 'Usage Decision', 'Quality Info Record', 'Certificate / COA', 'Quality Notification', 'Sampling Procedure',
        'Shelf Life / Batch Classification', 'Stability Study', 'Reports'],
    FI: ['General Ledger', 'Accounts Payable', 'Accounts Receivable', 'Asset Accounting', 'Payment Run (F110)', 'Bank Reconciliation / EBS', 'GST / TDS / Tax',
        'Period-end Closing', 'Posting Error', 'Intercompany', 'Financial Statements / Reports'],
    CO: ['Cost Center Accounting', 'Profit Center Accounting', 'Internal Orders', 'Product Costing', 'CO-PA', 'Material Ledger / Actual Costing', 'Settlement',
        'Assessment / Distribution', 'Month-end Closing', 'Reports'],
    'HR / HCM': ['Organisational Management', 'Personnel Administration', 'Time Management', 'Payroll (India)', 'Income Tax / Form 16', 'Reimbursements / Benefits',
        'ESS / MSS', 'Recruitment', 'Travel', 'Reports'],
    Basis: ['System Down', 'Performance', 'Background Job Failure', 'Transport Management (STMS)', 'System Refresh / Client Copy', 'Printer / Spool', 'RFC / Connectivity',
        'Kernel / Patch / Support Package', 'HANA Database', 'Short Dump (ST22)', 'Licence', 'Backup / Restore'],
    'Security & GRC': ['User Creation', 'Lock / Unlock', 'Password Reset', 'Role Assignment', 'New / Changed Role', 'SoD Conflict', 'Firefighter Access',
        'Authorization Error (SU53)', 'Audit / Compliance'],
    'ABAP / RICEFW': ['Report', 'Interface', 'Conversion', 'Enhancement / BAdI / Exit', 'Form (Smart / Adobe)', 'Workflow', 'Custom Code Dump', 'Custom Program Performance'],
    'Fiori / UI5': ['Launchpad / Tile Missing', 'App Error', 'Catalog / Space / Page', 'Role Mapping', 'Performance', 'Mobile Access'],
    'BTP & Integration': ['CPI iFlow', 'PI / PO Interface', 'IDoc Error', 'OData Service', 'Workflow / Process Automation', 'Destination / Connectivity', 'Event Mesh', 'Custom BTP App'],
    'SolMan / Cloud ALM': ['ChaRM', 'ITSM', 'Monitoring / Alerts', 'Test Suite', 'Documentation'],
    'NetWeaver Portal': ['Login / SSO', 'iView / Page', 'Role / Workset'],
    Analytics: ['Standard Report', 'BW / BI', 'Embedded Analytics / CDS', 'SAC', 'ALV / Excel Export'],
    'Master Data': ['Material', 'Customer / BP', 'Vendor / BP', 'Pricing', 'GL / Cost Center', 'BOM / Recipe'],
    'Other / Not sure': [],
};
// Inactive extras (Admin can switch them on): PM, PS, WM / EWM, TM, GTS, MDG, Ariba, SuccessFactors, Concur, IBP.
const SAP_INACTIVE = ['PM', 'PS', 'WM / EWM', 'TM', 'GTS', 'MDG', 'Ariba', 'SuccessFactors', 'Concur', 'IBP'];
// Sub-processes that are confidential by default (§O: payroll, income tax, personnel administration).
const CONFIDENTIAL_BY_DEFAULT = [['HR / HCM', 'Payroll (India)'], ['HR / HCM', 'Income Tax / Form 16'], ['HR / HCM', 'Personnel Administration']];

const LISTS = {
    landscape: ['ECC 6.0 EHP8 on HANA (current)', 'S/4HANA RISE PCE (target)', 'SAP BTP', 'Fiori Front-end Server', 'SolMan 7.2', 'Cloud ALM', 'NetWeaver Portal', 'PI/PO / CPI', 'BW / BI', 'Other'],
    environment: ['Production', 'Quality / Test', 'Development', 'Sandbox', 'Pre-production', 'Training', 'DR'],
    riseOwner: ['Emami internal', 'SAP ECS', 'AMS partner', 'Shared', 'TBD'],
    externalSystem: ['SAP for Me Case', 'SAP ECS SR', 'AMS Partner Ticket', 'Cloud ALM Event', 'App Vendor (Salescode.AI, Arteria etc.)', 'Microsoft', 'AWS', 'Azure', 'ISP / Telecom', 'Other'],
    sapCasePriority: ['Very High', 'High', 'Medium', 'Low'],
    externalStatus: ['Open', 'In Process', 'Customer Action', 'Solution Provided', 'Confirmed', 'Closed'],
    rootCause: ['Configuration', 'Custom code', 'Standard SAP bug (Note)', 'Master data', 'User / transactional error', 'Authorization', 'Interface', 'Infrastructure / Basis',
        'Network', 'Cloud provider', 'Third-party vendor', 'Training gap', 'Requirement gap', 'Duplicate / not an issue'],
    resolutionCode: ['Fixed – configuration', 'Fixed – code', 'SAP Note applied', 'Data corrected', 'Workaround provided', 'User guided', 'Access granted', 'Hardware replaced',
        'Restarted / restored', 'Vendor fix', 'No fault found', 'Duplicate', 'Cancelled'],
};

// New statuses (§O), offered only in the non-sales desks (Secondary Sales keeps exactly today's list).
const NEW_STATUSES = [
    [100, 'Awaiting Approval', true], [101, 'Pending with SAP', true], [102, 'Pending with Vendor / AMS', true], [103, 'In Development', false],
    [104, 'In Testing (QAS)', false], [105, 'Awaiting PRD Move', false], [106, 'Scheduled', true], [107, 'Pending User Confirmation', true], [108, 'Retest', false],
];

const SAP_GROUPS = ['SAP Service Desk', 'SAP SD', 'SAP MM', 'SAP PP-QM', 'SAP FICO', 'SAP HCM', 'SAP Basis & ECS liaison', 'SAP Security & GRC', 'SAP ABAP', 'SAP Fiori & BTP', 'SAP Integration'];
// Module -> group (automation routing on create; unknown goes to the triage group SAP Service Desk).
const MODULE_GROUP = {
    SD: 'SAP SD', MM: 'SAP MM', PP: 'SAP PP-QM', QM: 'SAP PP-QM', FI: 'SAP FICO', CO: 'SAP FICO', 'HR / HCM': 'SAP HCM', Basis: 'SAP Basis & ECS liaison',
    'Security & GRC': 'SAP Security & GRC', 'ABAP / RICEFW': 'SAP ABAP', 'Fiori / UI5': 'SAP Fiori & BTP', 'BTP & Integration': 'SAP Integration',
};

// §O SLA defaults for SAP / Infra / Digital incidents. A business day = 9 business hours.
const BH_DAY = 9 * 60;
const SLA_TARGETS = [
    // [priority, firstResponseMins, resolutionMins, businessHours]
    [4, 15, 4 * 60, false],
    [3, 30, 8 * 60, true],
    [2, 4 * 60, 3 * BH_DAY, true],
    [1, 8 * 60, 5 * BH_DAY, true],
];
const SLA_WORKSPACES = [['SAP', 'SAP & Primary Sales incidents'], ['INFRA_IT', 'Infra & IT incidents'], ['DIGITAL_APPS', 'Digital Apps incidents']];

const CANNED = [
    ['SAP', 'SAP', 'Need SID / client / T-code', 'sapinfo', 'Dear {{ticket.requester.name}},\n\nTo look into this quickly, please share:\n- SAP system (SID) and client\n- Transaction code (T-code) or Fiori app\n- The exact error message (message class and number)\n- A screenshot of the error\n\nRegards,\n{{ticket.agent.name}}'],
    ['SAP', 'SAP', 'SAP case raised', 'sapcase', 'Dear {{ticket.requester.name}},\n\nWe have raised a case with SAP for this issue and will update you as soon as SAP responds. Your reference stays {{ticket.ref}}.\n\nRegards,\n{{ticket.agent.name}}'],
    ['SAP', 'SAP', 'Transport in PRD - please verify', 'saptr', 'Dear {{ticket.requester.name}},\n\nThe fix has been moved to production. Please verify and confirm so we can close {{ticket.ref}}.\n\nRegards,\n{{ticket.agent.name}}'],
    ['SAP', 'SAP', 'Workaround', 'sapwa', 'Dear {{ticket.requester.name}},\n\nWhile we work on the permanent fix, please use this workaround:\n\n<steps>\n\nRegards,\n{{ticket.agent.name}}'],
    ['SEC_SALES', 'Sales apps', 'App version, device and screenshot', 'appinfo', 'Dear {{ticket.requester.name}},\n\nPlease share the app version, the device model and a screenshot of the issue so we can check it.\n\nRegards,\n{{ticket.agent.name}}'],
    ['INFRA_IT', 'Infra & IT', 'Planned maintenance notice', 'maint', 'Dear {{ticket.requester.name}},\n\nThis is due to a planned maintenance window. Services will be back by <time>. We will confirm once it is complete.\n\nRegards,\n{{ticket.agent.name}}'],
    ['INFRA_IT', 'Infra & IT', 'Password reset steps', 'pwreset', 'Dear {{ticket.requester.name}},\n\nTo reset your password: open the self-service password page, verify with the code sent to your phone, and choose a new password. Reply here if it does not work.\n\nRegards,\n{{ticket.agent.name}}'],
];
// Scenarios (§O): [workspace, name, description, actions] - statuses by name, resolved at insert.
const SCENARIOS = [
    ['SAP', 'Send to SAP (log case)', 'Status Pending with SAP and a private note to add the SAP case number', [{ type: 'setStatus', status: 'Pending with SAP' }, { type: 'note', text: 'SAP case raised - add the case number under External references.' }]],
    ['SAP', 'Move to QAS testing', 'Status In Testing (QAS)', [{ type: 'setStatus', status: 'In Testing (QAS)' }]],
    ['SAP', 'Request user confirmation', 'Status Pending User Confirmation and a reply asking the requester to confirm', [{ type: 'setStatus', status: 'Pending User Confirmation' }, { type: 'reply', text: 'Dear {{ticket.requester.name}},\n\nThe issue has been addressed. Please confirm it works on your side so we can close {{ticket.ref}}.' }]],
    [null, 'Escalate to app vendor', 'Status Pending with Vendor / AMS and a private note', [{ type: 'setStatus', status: 'Pending with Vendor / AMS' }, { type: 'note', text: 'Escalated to the app vendor - add their ticket number under External references.' }]],
];

// Field visibility in the non-sales desks: the distributor / territory fields are Secondary Sales only.
const SALES_ONLY_FIELDS = ['callSubject', 'region', 'distributorCode', 'distributorName', 'salesOrg', 'state', 'depot', 'asmName', 'depotCoordinator', 'mrUid',
    'mobileNo', 'alternateMobileNo', 'callerName', 'callerContactNumber', 'l2Agent'];
const NEW_FIELDS = [
    { key: 'rootCauseCategory', label: 'Root cause', type: 'dropdown', list: 'rootCause' },
    { key: 'resolutionCode', label: 'Resolution code', type: 'dropdown', list: 'resolutionCode' },
];

// Validation (§P): T-codes upper case, transport numbers, SAP Notes numeric, IDoc numbers 16 digits.
const TRANSPORT_RE = /^[A-Z][A-Z0-9]{2}K9\d{5}$/;
const TCODE_RE = /^[A-Z/][A-Z0-9_/]{1,29}$/;
const IDOC_RE = /^\d{16}$/;
const NOTE_RE = /^\d{4,8}$/;

/**
 * Starter reference masters so the typeaheads work on day one. Standard SAP T-codes and Fiori apps are SAP's own;
 * the system / client rows are a sample landscape (edit or import the real one under Admin > SAP & Infra masters).
 * Inserted with ON CONFLICT DO NOTHING - an Admin's own rows are never overwritten.
 */
const STARTER_MASTERS = {
    SAP_SYSTEM: [['ECD', 'ECC development (sample)'], ['ECQ', 'ECC quality (sample)'], ['ECP', 'ECC production (sample)'], ['BWP', 'BW production (sample)'],
        ['S4D', 'S/4HANA development (sample)'], ['S4Q', 'S/4HANA quality (sample)'], ['S4P', 'S/4HANA production (sample)'], ['SMP', 'Solution Manager (sample)']],
    SAP_CLIENT: [['100', 'Development client (sample)', 'ECD'], ['200', 'Unit test client (sample)', 'ECD'], ['300', 'Quality client (sample)', 'ECQ'], ['500', 'Production client (sample)', 'ECP']],
    TCODE: [
        ['VA01', 'Create sales order'], ['VA02', 'Change sales order'], ['VA03', 'Display sales order'], ['VA05', 'List of sales orders'], ['VL01N', 'Create outbound delivery'],
        ['VL02N', 'Change outbound delivery'], ['VF01', 'Create billing document'], ['VF02', 'Change billing document'], ['VF04', 'Billing due list'], ['VK11', 'Create condition (pricing)'],
        ['XD01', 'Create customer'], ['XD02', 'Change customer'], ['ME21N', 'Create purchase order'], ['ME22N', 'Change purchase order'], ['ME23N', 'Display purchase order'],
        ['ME51N', 'Create purchase requisition'], ['MIGO', 'Goods movement'], ['MIRO', 'Enter incoming invoice'], ['MM01', 'Create material'], ['MM02', 'Change material'],
        ['MM03', 'Display material'], ['MMBE', 'Stock overview'], ['MB52', 'Warehouse stocks'], ['XK01', 'Create vendor'], ['FB60', 'Enter vendor invoice'],
        ['FB70', 'Enter customer invoice'], ['F-28', 'Post incoming payment'], ['F110', 'Automatic payment run'], ['FBL1N', 'Vendor line items'], ['FBL3N', 'G/L line items'],
        ['FBL5N', 'Customer line items'], ['FS00', 'G/L account master'], ['KS01', 'Create cost centre'], ['KE30', 'Profitability report'], ['CO01', 'Create production order'],
        ['CO11N', 'Production order confirmation'], ['MD04', 'Stock / requirements list'], ['CS01', 'Create BOM'], ['QA32', 'Inspection lot selection'], ['PA30', 'Maintain HR master data'],
        ['PC00_M40_CALC', 'Payroll run India'], ['SU01', 'User maintenance'], ['PFCG', 'Role maintenance'], ['SM37', 'Job overview'], ['ST22', 'ABAP dump analysis'],
        ['SM21', 'System log'], ['SE38', 'ABAP editor'], ['SE16N', 'Table browser'], ['STMS', 'Transport management'], ['WE02', 'IDoc display'], ['WE19', 'IDoc test tool'],
        ['BD87', 'Reprocess IDocs'], ['SM58', 'Transactional RFC'], ['SPRO', 'Customizing'], ['J1IG', 'Excise / GST invoice'], ['J1INQEFILE', 'TDS e-file'],
    ],
    FIORI_APP: [
        ['F0842A', 'Manage Sales Orders'], ['F1873', 'Display Customer Balances'], ['F0859', 'Manage Purchase Orders'], ['F1060A', 'Manage Supplier Line Items'],
        ['F0711', 'Manage Customer Line Items'], ['F0997', 'Display G/L Account Balances'], ['F1076', 'Stock - Single Material'], ['F2227', 'Manage Billing Documents'],
        ['F1048', 'My Inbox (approvals)'], ['F2101', 'Manage Outbound Deliveries'],
    ],
    INTERFACE: [['SC-SFA', 'Salescode.AI SFA order inbound'], ['SC-DMS', 'Salescode.AI DMS sync'], ['ARTERIA', 'Arteria mSFA interface'], ['GST-EINV', 'GST e-invoice (IRP)'],
        ['EWAY', 'E-way bill'], ['BANK-H2H', 'Bank host-to-host payments']],
    BATCH_JOB: [['Z_SD_BILLING_DUE', 'Nightly billing due list (sample)'], ['Z_MM_MRP_RUN', 'MRP run (sample)'], ['Z_FI_PAYMENT_RUN', 'Payment run (sample)']],
};

module.exports = {
    STARTER_MASTERS,
    SAP_TYPES, SAP_TREE, SAP_INACTIVE, CONFIDENTIAL_BY_DEFAULT, LISTS, NEW_STATUSES, SAP_GROUPS, MODULE_GROUP, SLA_TARGETS, SLA_WORKSPACES, CANNED, SCENARIOS,
    SALES_ONLY_FIELDS, NEW_FIELDS, TRANSPORT_RE, TCODE_RE, IDOC_RE, NOTE_RE, BH_DAY,
};
