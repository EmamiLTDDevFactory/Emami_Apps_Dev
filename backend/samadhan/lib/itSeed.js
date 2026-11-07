'use strict';
/*
   v7 Phase 5 seeds (master prompt §O): Digital Apps and Infra & IT - types, Category -> Sub-category trees, groups and
   routing, IT detail lists - plus the two generic Sales-app sub-categories that had no equivalent (DISCOVERY §9.1).
   Append-only; migration 7.5-it records every row it adds so its down step removes exactly those.
*/

// Types (with record class) for the two IT desks.
const IT_TYPES = [
    ['Incident', 'INCIDENT'], ['Service Request', 'SERVICE_REQUEST'], ['Access Request', 'ACCESS_REQUEST'], ['Change Request', 'CHANGE'],
    ['Problem', 'PROBLEM'], ['Query / How-to', 'QUERY'],
];
const DIGITAL_TYPES = [...IT_TYPES.slice(0, 4), ['Defect / Bug', 'DEFECT'], ['Enhancement', 'ENHANCEMENT'], ...IT_TYPES.slice(4)];

const DIGITAL_TREE = {
    'Frontend (Next.js)': ['UI / Layout', 'Login / Session', 'Performance', 'Mobile / Responsive', 'PWA'],
    'API / Backend': ['5xx Error', 'Timeout', 'Validation', 'Auth / Token'],
    'OData Service': ['Metadata', 'Read', 'Create / Update', '$batch'],
    'DB – SAP HANA': ['Query / Performance', 'Data Issue', 'Connection'],
    'DB – PostgreSQL': ['Query / Performance', 'Data Issue', 'Connection', 'Migration'],
    'Integration (SAP ↔ App)': [], 'Release / Deployment': [], 'Security / Vulnerability': [], 'Payment / Order (B2B / B2C)': [], Other: [],
};

const INFRA_TREE = {
    'Servers & Storage': ['Windows Server', 'Linux Server', 'Virtual Machine', 'Storage / NAS / SAN', 'Backup & Restore', 'Disaster Recovery', 'Patching'],
    'Cloud – AWS': ['EC2', 'S3', 'RDS', 'IAM', 'VPC / Network', 'Load Balancer', 'Cost / Billing'],
    'Cloud – Azure': ['Virtual Machine', 'App Service', 'Blob Storage', 'Entra ID', 'VNet', 'Cost / Billing'],
    Network: ['LAN', 'WAN / MPLS / SD-WAN', 'Wi-Fi', 'Firewall', 'VPN', 'Internet / ISP', 'DNS', 'SSL Certificate'],
    'Database Admin': ['HANA', 'PostgreSQL', 'Backup', 'Performance', 'Access'],
    'Cyber Security': ['Phishing', 'Malware', 'Vulnerability', 'Suspicious Login', 'Data Leak / DLP'],
    'Monitoring & Alerts': [], 'Data Centre / Power / UPS': [],
    'End-user IT': ['Laptop / Desktop', 'Printer / Scanner', 'Mobile', 'Software Install / Licence'],
    'Email & M365': ['Outlook', 'Teams', 'OneDrive / SharePoint', 'Licence'],
    Identity: ['AD / Entra ID', 'MFA', 'Password'],
    Telephony: [], 'CCTV / Biometric': [], Other: [],
};

// Secondary Sales: only the two sub-categories with no equivalent in the live tree, under one new category.
const SALES_APP_CATEGORY = 'Sales App (any)';
const SALES_APP_SUBS = ['Attendance / GPS', 'App Crash / Performance'];

const DIGITAL_GROUPS = ['Apps Support', 'Frontend', 'Backend / API', 'Data'];
const INFRA_GROUPS = ['IT Service Desk', 'Server & Storage', 'Cloud Ops (AWS / Azure)', 'Network & Security', 'M365', 'End-user Support'];
const DEFAULT_GROUP = { DIGITAL_APPS: 'Apps Support', INFRA_IT: 'IT Service Desk' };

// Routing: category -> group (unknown stays with the desk's triage group).
const CATEGORY_GROUP = {
    DIGITAL_APPS: {
        'Frontend (Next.js)': 'Frontend', 'API / Backend': 'Backend / API', 'OData Service': 'Backend / API', 'Integration (SAP ↔ App)': 'Backend / API',
        'DB – SAP HANA': 'Data', 'DB – PostgreSQL': 'Data',
    },
    INFRA_IT: {
        'Servers & Storage': 'Server & Storage', 'Database Admin': 'Server & Storage', 'Data Centre / Power / UPS': 'Server & Storage', 'Monitoring & Alerts': 'Server & Storage',
        'Cloud – AWS': 'Cloud Ops (AWS / Azure)', 'Cloud – Azure': 'Cloud Ops (AWS / Azure)',
        Network: 'Network & Security', 'Cyber Security': 'Network & Security',
        'Email & M365': 'M365', 'End-user IT': 'End-user Support', Identity: 'End-user Support', Telephony: 'End-user Support', 'CCTV / Biometric': 'End-user Support',
    },
};

// IT details (ticket_it_details) - dropdown lists.
const IT_LISTS = {
    layer: ['Frontend', 'API', 'OData', 'HANA DB', 'PostgreSQL DB', 'Auth / SSO', 'AWS', 'Azure', 'BTP'],
    platform: ['Desktop browser', 'Android', 'iOS', 'PWA'],
    browser: ['Chrome', 'Edge', 'Safari', 'Firefox', 'Other'],
    environment: ['Production', 'Quality / Test', 'Development', 'Sandbox', 'Pre-production', 'Training', 'DR'],
    database: ['SAP HANA', 'PostgreSQL', 'Other'],
    hosting: ['AWS', 'Azure', 'SAP BTP', 'On-premise data centre', 'Vendor hosted', 'Other'],
    os: ['Windows 11', 'Windows 10', 'Windows Server', 'macOS', 'Linux', 'Android', 'iOS', 'Other'],
};

// Canned responses for the new desks: [workspace, folder, title, shortCode, body]
const CANNED = [
    ['DIGITAL_APPS', 'Digital Apps', 'URL, browser and screenshot', 'webinfo', 'Dear {{ticket.requester.name}},\n\nTo check this quickly, please share:\n- the page URL\n- your browser and device\n- the time it happened\n- a screenshot (with the browser console, if you can)\n\nRegards,\n{{ticket.agent.name}}'],
    ['DIGITAL_APPS', 'Digital Apps', 'Fix deployed - please verify', 'webfix', 'Dear {{ticket.requester.name}},\n\nA fix has been deployed. Please refresh the page (Ctrl+F5) and confirm it works so we can close {{ticket.ref}}.\n\nRegards,\n{{ticket.agent.name}}'],
    ['INFRA_IT', 'Infra & IT', 'Phishing - do not click', 'phish', 'Dear {{ticket.requester.name}},\n\nThank you for reporting this. Please do not click any link or open any attachment in that email, and delete it. If you already clicked, change your password now and tell us.\n\nRegards,\n{{ticket.agent.name}}'],
    ['INFRA_IT', 'Infra & IT', 'Asset tag and location', 'asset', 'Dear {{ticket.requester.name}},\n\nPlease share the asset tag (sticker on the device), your location / desk and a phone number so our engineer can reach you.\n\nRegards,\n{{ticket.agent.name}}'],
];

module.exports = {
    IT_TYPES, DIGITAL_TYPES, DIGITAL_TREE, INFRA_TREE, SALES_APP_CATEGORY, SALES_APP_SUBS, DIGITAL_GROUPS, INFRA_GROUPS, DEFAULT_GROUP, CATEGORY_GROUP,
    IT_LISTS, CANNED,
};
