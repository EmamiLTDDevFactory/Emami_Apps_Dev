'use strict';
/*
   ITSM support model (migration 7.11-itsm): who is the client, who runs the service desk (the ITSM support vendor), and
   where the servers are hosted (the hyperscaler). All three are lists an Admin can extend (Admin > Support model); the
   seeded values are the likely candidates in the Indian market so a future change of vendor or cloud is one pick away.
   Today: Emami Limited (client), Allied Digital Services (vendor, Infra & IT and Digital Apps desks), Microsoft Azure.
*/

const PARTNER_KINDS = ['CLIENT', 'ITSM_VENDOR', 'HYPERSCALER'];
const PARTNER_KIND_LABEL = { CLIENT: 'Client / customer', ITSM_VENDOR: 'ITSM support vendor', HYPERSCALER: 'Hyperscaler / hosting' };

// [name, shortName]. The first of each kind is today's choice.
const CLIENTS = [['Emami Limited', 'Emami']];
const ITSM_VENDORS = [
    ['Allied Digital Services', 'Allied Digital'],
    ['HCLTech', 'HCLTech'], ['Tata Consultancy Services', 'TCS'], ['Infosys', 'Infosys'], ['Wipro', 'Wipro'],
    ['Tech Mahindra', 'Tech Mahindra'], ['LTIMindtree', 'LTIMindtree'], ['Accenture', 'Accenture'], ['IBM Consulting', 'IBM'],
    ['Capgemini', 'Capgemini'], ['Cognizant', 'Cognizant'], ['NTT DATA', 'NTT DATA'], ['Kyndryl', 'Kyndryl'], ['DXC Technology', 'DXC'],
    ['Microland', 'Microland'], ['Sify Technologies', 'Sify'], ['Mphasis', 'Mphasis'], ['Hexaware', 'Hexaware'], ['Coforge', 'Coforge'],
    ['Birlasoft', 'Birlasoft'], ['Zensar Technologies', 'Zensar'], ['In-house IT team', 'In-house'],
];
const HYPERSCALERS = [
    ['Microsoft Azure', 'Azure'],
    ['Amazon Web Services (AWS)', 'AWS'], ['Google Cloud (GCP)', 'GCP'], ['Oracle Cloud Infrastructure (OCI)', 'OCI'], ['IBM Cloud', 'IBM Cloud'],
    ['SAP RISE / SAP Enterprise Cloud Services', 'SAP RISE / ECS'], ['Alibaba Cloud', 'Alibaba Cloud'], ['Tata Communications Cloud', 'Tata Comm'],
    ['Sify CloudInfinit', 'Sify Cloud'], ['CtrlS Datacenters', 'CtrlS'], ['Yotta Infrastructure', 'Yotta'], ['NxtGen Cloud', 'NxtGen'],
    ['ESDS Software Solution', 'ESDS'], ['Jio Cloud', 'Jio Cloud'], ['On-premise data centre', 'On-premise'],
];
// Desks the current ITSM vendor supports (infra + software applications). SAP, Secondary Sales and the S/4 programme
// keep their own teams until an Admin ticks them in Admin > Support model.
const VENDOR_DESKS = ['INFRA_IT', 'DIGITAL_APPS'];

// Infra & IT categories for the other hyperscalers (the tree had AWS and Azure only). Appended, never replacing.
const CLOUD_SUBS = ['Virtual Machine', 'Storage / Backup', 'Network / VPN', 'Identity / IAM', 'Database service', 'Disaster recovery', 'Cost / Billing'];
const EXTRA_CLOUD_CATEGORIES = ['Cloud – Google Cloud', 'Cloud – Oracle Cloud (OCI)', 'Cloud – Other hyperscaler / data centre'];

// Hierarchical escalation (ITIL): the levels a ticket climbs once its resolution is overdue. Names / emails are the
// Admin's to fill; these are only the suggested roles shown on an empty matrix.
const ESCALATION_SUGGESTIONS = [
    { level: 1, party: 'VENDOR', designation: 'Service desk lead (vendor)', afterHours: 0 },
    { level: 2, party: 'VENDOR', designation: 'Service delivery manager (vendor)', afterHours: 4 },
    { level: 3, party: 'CLIENT', designation: 'IT manager (client)', afterHours: 8 },
    { level: 4, party: 'CLIENT', designation: 'Head of IT / CIO (client)', afterHours: 24 },
];

const ESCALATION_TEMPLATE = {
    key: 'agent.escalation_level',
    audience: 'agent',
    subject: 'Escalation level {{escalation.level}}: {{ticket.subject}} [{{ticket.ref}}] [#{{ticket.id}}]',
    body: 'Dear {{escalation.name}},<br><br>Ticket <b>{{ticket.ref}}</b> has reached <b>escalation level {{escalation.level}}</b> ({{escalation.designation}}).'
        + '<br><br><b>{{ticket.subject}}</b><br>Status: {{ticket.status}}<br>Group: {{ticket.group.name}}<br>Agent: {{ticket.agent.name}}'
        + '<br>Support vendor: {{escalation.vendor}}<br>Resolution was due: {{ticket.resolution_due}}<br>Reason: {{escalation.reason}}'
        + '<br><br>Open ticket: {{ticket.url}}<br><br>{{helpdesk_name}}',
};

module.exports = { CLIENTS, CLOUD_SUBS, ESCALATION_SUGGESTIONS, ESCALATION_TEMPLATE, EXTRA_CLOUD_CATEGORIES, HYPERSCALERS, ITSM_VENDORS, PARTNER_KINDS, PARTNER_KIND_LABEL, VENDOR_DESKS };
