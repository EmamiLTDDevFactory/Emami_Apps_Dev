'use strict';
const { SYSTEM_PROFILES } = require('./permissions');

/*
   The eight custom profiles seeded by migration 7.1-auth (master prompt §K 9.4.2). An Admin can edit, copy or
   deactivate them in the Authorization cockpit; nobody is assigned to them until an Admin does so.

   mode 'add'      : the profile's keys are ADDED to the person's base role (Agent / Supervisor).
   mode 'restrict' : the person's keys are CAPPED to the profile's keys (read-only roles such as Auditor), whatever
                     their base role gives them. admin.* keys never come from a profile.
   scopePreset     : suggested data scope, applied when the profile is assigned (workspace codes take effect in
                     Phase 3, when workspaces exist; until then only `visibility` is used).
*/

const AGENT = SYSTEM_PROFILES.AGENT.keys;
const SUPERVISOR_EXTRA = SYSTEM_PROFILES.SUPERVISOR.keys.filter((k) => !AGENT.includes(k));

const SEED_PROFILES = [
    { code: 'SALES_APPS_AGENT', name: 'Sales Apps Agent', mode: 'add', keys: [], scopePreset: { workspaces: ['SEC_SALES'] },
        description: 'Agent for the secondary-sales applications (mSFA, DMS, SalesCode ...). Same rights as an Agent, scoped to the Sales workspace.' },
    { code: 'SAP_FUNCTIONAL_AGENT', name: 'SAP Functional Agent', mode: 'add', keys: [], scopePreset: { workspaces: ['SAP'] },
        description: 'SAP functional consultant (SD / MM / FI ...). Agent rights, scoped to the SAP workspace.' },
    { code: 'SAP_BASIS_SECURITY_AGENT', name: 'SAP Basis / Security Agent', mode: 'add', keys: [], scopePreset: { workspaces: ['SAP'] },
        description: 'SAP Basis and security team. Agent rights, scoped to the SAP workspace (transports, user / role requests).' },
    { code: 'INFRA_AGENT', name: 'Infra Agent', mode: 'add', keys: [], scopePreset: { workspaces: ['INFRA_IT'] },
        description: 'Infrastructure & IT support. Agent rights, scoped to the Infra & IT workspace.' },
    { code: 'DIGITAL_APPS_AGENT', name: 'Digital Apps Agent', mode: 'add', keys: [], scopePreset: { workspaces: ['DIGITAL'] },
        description: 'Digital applications support. Agent rights, scoped to the Digital Apps workspace.' },
    { code: 'WORKSPACE_LEAD', name: 'Workspace Lead', mode: 'add', keys: SUPERVISOR_EXTRA, scopePreset: {},
        description: 'Supervisor-like rights (reports, analytics, export, knowledge publishing) inside the person\'s scope.' },
    { code: 'APPROVER_CAB', name: 'Approver / CAB', mode: 'add', keys: ['approval.decide', 'approval.override', 'change.freezeOverride', 'screen.approvals', 'screen.changeCalendar'],
        scopePreset: {}, description: 'Decides approvals and change requests (CAB). Check the SoD warnings before giving it to someone who also raises changes.' },
    { code: 'AUDITOR', name: 'Auditor (read-only)', mode: 'restrict',
        keys: ['screen.dashboard', 'screen.helpdesk', 'screen.tickets', 'screen.board', 'screen.contacts', 'screen.solutions', 'screen.analytics',
            'screen.reports', 'screen.changeCalendar', 'screen.approvals', 'ticket.view', 'ticket.export', 'attachment.download', 'insights.dashboard', 'insights.ticket'],
        scopePreset: {}, description: 'Read-only: sees screens, tickets, reports and analytics; cannot create, edit, reply or change anything.' },
];

module.exports = { SEED_PROFILES };
