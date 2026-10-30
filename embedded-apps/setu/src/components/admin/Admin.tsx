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

type TabId = 'agents' | 'groups' | 'sla' | 'hours' | 'severity' | 'fields' | 'templates' | 'canned' | 'distributors' | 'settings' | 'channels' | 'automations' | 'contacts' | 'audit' | 'parked';
const TABS: { id: TabId; label: string }[] = [
  { id: 'agents', label: 'Agents' },
  { id: 'groups', label: 'Groups' },
  { id: 'sla', label: 'SLA' },
  { id: 'hours', label: 'Business hours' },
  { id: 'severity', label: 'Severity matrix' },
  { id: 'fields', label: 'Fields' },
  { id: 'templates', label: 'Email templates' },
  { id: 'canned', label: 'Canned responses' },
  { id: 'distributors', label: 'Distributor master' },
  { id: 'settings', label: 'Settings' },
  { id: 'channels', label: 'Channels & bell' },
  { id: 'automations', label: 'Automations' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'audit', label: 'Audit log' },
  { id: 'parked', label: 'Parked mail' },
];

export default function Admin() {
  const [tab, setTab] = useState<TabId>('agents');
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
          <p className="text-sm text-muted">Setu configuration. Who can open Setu, and as Agent, Supervisor or Admin, is set in Emami Apps Manage Access.</p>
        </div>
        <Button onClick={run} disabled={busy} title="Mail ingest, SLA reminders and violations, time-based automations (they also run every few minutes on their own)">
          {busy ? <Spinner /> : <Play size={14} />} Run scheduled checks now
        </Button>
      </div>
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      <Tabs label="Admin sections" tabs={TABS} value={tab} onChange={setTab} />
      <div>
        {tab === 'agents' && <AgentsTab />}
        {tab === 'groups' && <GroupsTab />}
        {tab === 'sla' && <SlaTab />}
        {tab === 'hours' && <BusinessHoursTab />}
        {tab === 'severity' && <SeverityTab />}
        {tab === 'fields' && <FieldsTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'canned' && <CannedTab />}
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
