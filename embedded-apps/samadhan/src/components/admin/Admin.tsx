'use client';
import { useState } from 'react';
import { Play } from 'lucide-react';
import { runJobs } from '@/lib/api';
import { Button, Notice, Spinner, Tabs } from '../ui';
import { AgentsTab, GroupsTab } from './People';
import { BusinessHoursTab, SlaTab } from './Sla';
import { FieldsTab, SeverityTab } from './Fields';
import { CannedTab, TemplatesTab } from './Content';
import { DistributorsTab } from './Distributors';
import { AuditTab, AutomationsTab, ContactsTab, ParkedTab, SettingsTab } from './System';
import { ChannelsTab } from './Channels';
import ScenariosTab from './Scenarios';
import { GeneralTab } from './General';
import { AccessTab } from './Access';
import { StatusesTab } from './Statuses';
import { AuthzTab } from './Authz';
import { ApplicationsTab, MailClassificationTab, WorkspacesTab } from './Workspaces';
import { RefMastersTab } from './RefMasters';
import { ApprovalChainsTab, CatalogTab, ChangeWindowsTab } from './ChangeAdmin';
import { IntegrationsTab } from './Integrations';
import { SupportModelTab } from './SupportModel';
import { MigrationTab } from './Migration';
import { ItsmTag } from '../Itsm';
import type { Practice } from '@/lib/itsmPractices';

// The ITSM practice each Admin section configures (shown above the section).
const TAB_PRACTICE: Partial<Record<TabId, { p: Practice[]; text: string }>> = {
  support: { p: ['supplier', 'escalation'], text: 'Client, ITSM support vendor, hyperscaler; hierarchical escalation matrix.' },
  migration: { p: ['incident', 'request'], text: 'Bring open tickets over from the old tool.' },
  workspaces: { p: ['servicedesk'], text: 'Service desks (SAP, Infra & IT, Digital Apps, Secondary Sales ...).' },
  applications: { p: ['config'], text: 'The applications (services) tickets are logged against.' },
  refmasters: { p: ['config', 'asset'], text: 'Reference lists: SAP systems, servers, sites, IT assets.' },
  catalog: { p: ['request'], text: 'The service catalogue: what can be requested and what each item asks.' },
  chains: { p: ['workflow', 'change'], text: 'Approval workflows: manager, role owner, CAB, security.' },
  windows: { p: ['change'], text: 'Freeze and maintenance windows for changes.' },
  integrations: { p: ['event'], text: 'Monitoring alerts and SAP Cloud ALM create tickets automatically.' },
  groups: { p: ['servicedesk', 'escalation'], text: 'Resolver teams (L1 / L2 / L3) and round-robin assignment.' },
  sla: { p: ['slm'], text: 'Response and resolution targets per priority and desk.' },
  hours: { p: ['slm'], text: 'Business hours and holidays the SLA clock follows.' },
  severity: { p: ['incident'], text: 'Category → severity / priority rules.' },
  statuses: { p: ['workflow'], text: 'Ticket statuses and which ones pause the SLA.' },
  automations: { p: ['workflow'], text: 'Routing, reminders, auto-close and escalation rules.' },
  scenarios: { p: ['workflow'], text: 'One-click sets of actions for common cases.' },
  canned: { p: ['knowledge'], text: 'Standard replies.' },
  templates: { p: ['servicedesk'], text: 'Emails to requesters and agents.' },
  mailclass: { p: ['servicedesk'], text: 'Which desk / application an incoming mail belongs to.' },
  authz: { p: ['workflow'], text: 'Who may do what (segregation of duties).' },
};

type TabId = 'general' | 'support' | 'migration' | 'authz' | 'workspaces' | 'applications' | 'mailclass' | 'refmasters' | 'catalog' | 'chains' | 'windows' | 'integrations' | 'access' | 'statuses' | 'agents' | 'groups' | 'sla' | 'hours' | 'severity' | 'fields' | 'templates' | 'canned' | 'scenarios' | 'distributors' | 'settings' | 'channels' | 'automations' | 'contacts' | 'audit' | 'parked';
const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'agents', label: 'Agents' },
  { id: 'access', label: 'Roles & access' },
  { id: 'authz', label: 'Authorization cockpit' },
  // v7 Phase 3
  { id: 'workspaces', label: 'Service desks' },
  { id: 'applications', label: 'Applications' },
  { id: 'mailclass', label: 'Mail classification' },
  { id: 'refmasters', label: 'SAP & Infra masters' },
  { id: 'catalog', label: 'Service catalog' },
  { id: 'chains', label: 'Approval chains' },
  { id: 'windows', label: 'Change windows' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'support', label: 'Support model' },
  { id: 'migration', label: 'Ticket migration' },
  { id: 'groups', label: 'Groups' },
  { id: 'sla', label: 'SLA' },
  { id: 'hours', label: 'Business hours' },
  { id: 'severity', label: 'Severity matrix' },
  { id: 'statuses', label: 'Statuses' },
  { id: 'fields', label: 'Fields' },
  { id: 'templates', label: 'Email templates' },
  { id: 'canned', label: 'Canned responses' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'distributors', label: 'Distributor master' },
  { id: 'settings', label: 'Settings' },
  { id: 'channels', label: 'Channels & bell' },
  { id: 'automations', label: 'Automations' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'audit', label: 'Audit log' },
  { id: 'parked', label: 'Parked mail' },
];

export default function Admin() {
  const [tab, setTab] = useState<TabId>('general');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runJobs();
      const mail = r.mail as { skipped?: string; created?: number; threaded?: number; parked?: number; error?: string } | undefined;
      const mailText = mail?.skipped ? `mail ${mail.skipped}` : mail?.error ? `mail error: ${mail.error}` : `mail: ${mail?.created ?? 0} new, ${mail?.threaded ?? 0} replies, ${mail?.parked ?? 0} parked`;
      setMsg({ tone: 'good', text: `Scheduled checks done - ${mailText}; SLA reminders ${typeof r.sla === 'string' ? r.sla : 'error'}; ${typeof r.timeRules === 'number' ? r.timeRules : 0} time-based automation(s) fired.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not run the checks.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Admin</h2>
          <p className="text-sm text-muted">Samadhan configuration. Who can open Samadhan, and as Agent, Supervisor or Admin, is set under Roles &amp; access (the same as Emami Apps Manage Access).</p>
        </div>
        <Button onClick={run} disabled={busy} title="Mail ingest, SLA reminders and violations, time-based automations (they also run every few minutes on their own)">
          {busy ? <Spinner /> : <Play size={14} />} Run scheduled checks now
        </Button>
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <Tabs label="Admin sections" tabs={TABS} value={tab} onChange={setTab} />
      {TAB_PRACTICE[tab] && <div className="flex flex-wrap items-center gap-2 text-2xs text-muted" data-testid="admin-itsm"><ItsmTag practice={TAB_PRACTICE[tab]!.p} /> <span>{TAB_PRACTICE[tab]!.text}</span></div>}
      <div>
        {tab === 'general' && <GeneralTab />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'access' && <AccessTab />}
        {tab === 'authz' && <AuthzTab onOpenTab={setTab} />}
        {tab === 'workspaces' && <WorkspacesTab />}
        {tab === 'applications' && <ApplicationsTab />}
        {tab === 'mailclass' && <MailClassificationTab />}
        {tab === 'refmasters' && <RefMastersTab />}
        {tab === 'catalog' && <CatalogTab />}
        {tab === 'chains' && <ApprovalChainsTab />}
        {tab === 'windows' && <ChangeWindowsTab />}
        {tab === 'integrations' && <IntegrationsTab />}
        {tab === 'support' && <SupportModelTab />}
        {tab === 'migration' && <MigrationTab />}
        {tab === 'statuses' && <StatusesTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'sla' && <SlaTab />}
        {tab === 'hours' && <BusinessHoursTab />}
        {tab === 'severity' && <SeverityTab />}
        {tab === 'fields' && <FieldsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'canned' && <CannedTab />}
        {tab === 'scenarios' && <ScenariosTab />}
        {tab === 'distributors' && <DistributorsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'channels' && <ChannelsTab />}
        {tab === 'automations' && <AutomationsTab />}
        {tab === 'contacts' && <ContactsTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'parked' && <ParkedTab />}
      </div>
    </div>
  );
}
