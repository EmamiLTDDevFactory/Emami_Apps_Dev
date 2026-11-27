'use client';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, BookOpen, Boxes, Building2, CalendarRange, ClipboardCheck, Cloud, GitBranch, Headset, Inbox, LifeBuoy, Radar, Rocket, ShieldAlert, Siren,
  Timer, Workflow, type LucideIcon,
} from 'lucide-react';
import { itsmOverview, type TicketQuery } from '@/lib/api';
import { useSamadhan, type Screen } from '@/lib/context';
import { PRACTICES, type Practice } from '@/lib/itsmPractices';
import type { ItsmOverviewData } from '@/lib/types';
import { Button, Card, Notice, Skeleton, cx } from './ui';
import { ItsmTag } from './Itsm';

/*
   ITSM overview: one screen that shows how Samadhan implements the ITIL 4 practices - who is who (client, support
   vendor, hyperscaler), each practice in plain words with live numbers and a button to where it lives, and the
   standard workflows (incident, request, problem, change, configuration) step by step.
*/
type Tile = { p: Practice; icon: LucideIcon; stats: [string, ReactNode][]; open?: { label: string; screen?: Screen; list?: TicketQuery } };

const FLOWS: { p: Practice; title: string; steps: string[] }[] = [
  { p: 'incident', title: 'Incident', steps: ['Detect & log (mail, phone, portal, monitoring)', 'Categorise', 'Prioritise (impact × urgency)', 'Assign (L1 service desk)', 'Diagnose', 'Escalate (L2 / L3, vendor, management)', 'Resolve & recover', 'Close (user confirms or auto-close)', 'Learn (knowledge / problem)'] },
  { p: 'request', title: 'Service request', steps: ['Pick from the catalogue', 'Answer its questions', 'Approve (manager → owner → security)', 'Fulfil', 'Confirm with the user', 'Close (revoke access on expiry)'] },
  { p: 'problem', title: 'Problem', steps: ['Detect (3+ similar incidents)', 'Log & categorise', 'Investigate (root cause)', 'Workaround', 'Known error (KEDB)', 'Permanent fix (via change)', 'Close & notify incidents'] },
  { p: 'change', title: 'Change', steps: ['Request', 'Review', 'Plan (risk, back-out, tests)', 'CAB approval', 'Schedule (no freeze window)', 'Implement (transports DEV → QAS → PRD)', 'Review (success / failed)', 'Close'] },
  { p: 'config', title: 'Configuration', steps: ['Identify (tag, class, owner)', 'Control (every change recorded)', 'Status accounting (stock → in use → repair → retired → disposed)', 'Relationships (depends on, runs on)', 'Verify & audit'] },
];

export default function ItsmOverview() {
  const { meta, go, openList, can } = useSamadhan();
  const [d, setD] = useState<ItsmOverviewData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { itsmOverview().then(setD).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.')); }, []);
  const it = meta.itsm;
  const nameOf = (list: { id: number; name: string }[] | undefined, id: number | null | undefined) => list?.find((x) => x.id === id)?.name ?? '—';
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v);
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
  const tiles: Tile[] = d ? [
    { p: 'incident', icon: Inbox, stats: [['Open incidents', n(d.tickets?.incidents)], ['Past resolution due', n(d.tickets?.incidentsOverdue)]], open: { label: 'Open incidents', list: { view: 'open', recordClass: 'INCIDENT' } } },
    { p: 'major', icon: Siren, stats: [['Major incidents open', n(d.tickets?.major)]], open: { label: 'Major incidents', list: { view: 'open', majorIncident: '1' } } },
    { p: 'request', icon: ClipboardCheck, stats: [['Open requests', n(d.tickets?.requests)]], open: { label: 'Open requests', list: { view: 'open', recordClass: 'SERVICE_REQUEST,ACCESS_REQUEST' } } },
    { p: 'problem', icon: GitBranch, stats: [['Open problems', n(d.problems?.open)], ['Known errors (KEDB)', n(d.problems?.knownErrors)]], open: { label: 'Problems', list: { view: 'open', recordClass: 'PROBLEM' } } },
    { p: 'change', icon: CalendarRange, stats: [['Open changes', n(d.tickets?.changes)], ['Planned next 7 days', n(d.changes?.next7)], ['Awaiting approval', n(d.changes?.awaitingApproval)]], open: can('screen.changeCalendar') ? { label: 'Change calendar', screen: 'calendar' } : undefined },
    { p: 'config', icon: Boxes, stats: [['Configuration items', n(d.cis?.total)], ['In use', n(d.cis?.inUse)], ['Not verified 180 days', n(d.cis?.unverified)]], open: { label: 'CMDB', screen: 'cmdb' } },
    { p: 'knowledge', icon: BookOpen, stats: [['Published articles', n(d.kb?.published)], ['Drafts to review', n(d.kb?.drafts)]], open: { label: 'Solutions', screen: 'solutions' } },
    { p: 'slm', icon: Timer, stats: [['Resolution SLA (30 days)', pct(d.sla?.resolutionPct)], ['Response SLA (30 days)', pct(d.sla?.responsePct)]], open: can('screen.analytics') ? { label: 'Analytics', screen: 'analytics' } : undefined },
    { p: 'supplier', icon: Building2, stats: [['Current vendor', nameOf(it?.vendors, it?.vendorId)], ['Vendors in the list', n(d.supplier?.vendors)]], open: can('screen.analytics') ? { label: 'Vendor scorecard', screen: 'analytics' } : undefined },
    { p: 'escalation', icon: ShieldAlert, stats: [['Tickets escalated (open)', n(d.tickets?.escalated)], ['People in the matrix', n(d.supplier?.escalationContacts)]], open: { label: 'Open tickets', list: { view: 'open' } } },
    { p: 'workflow', icon: Workflow, stats: [['Routing, approval chains, automations', 'Admin']], open: can('admin.general') ? { label: 'Admin', screen: 'admin' } : undefined },
    { p: 'event', icon: Radar, stats: [['Monitoring integrations on', n(d.events?.enabled)]], open: can('admin.general') ? { label: 'Integrations', screen: 'admin' } : undefined },
    { p: 'release', icon: Rocket, stats: [['SAP transports tracked per change', 'DEV → QAS → PRD']], open: can('screen.reports') ? { label: 'Registers', screen: 'registers' } : undefined },
    { p: 'servicedesk', icon: Headset, stats: [['Channels', 'Email · Phone · Portal · WhatsApp · Chat']], open: { label: 'Dashboard', screen: 'dashboard' } },
  ] : [];
  const run = (o: NonNullable<Tile['open']>) => (o.screen ? go(o.screen) : openList(o.list ?? {}));
  return (
    <div className="space-y-4" data-testid="itsm-overview">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight">ITSM overview <ItsmTag practice="servicedesk" /></h2>
        <p className="text-sm text-muted">How Samadhan runs IT service management (ITIL 4): every practice below, what it means, the live numbers and where to find it.</p>
      </div>
      <Card title="Who is who" sub="Changeable in Admin > Support model - the history of every ticket stays as it was.">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: LifeBuoy, label: 'Client / customer', value: nameOf(it?.clients, it?.clientId), sub: 'Raises tickets; owns the services and assets' },
            { icon: Building2, label: 'ITSM support vendor', value: nameOf(it?.vendors, it?.vendorId), sub: `Works the tickets of ${it?.vendorDesks?.length ? (meta.workspaces ?? []).filter((w) => it.vendorDesks.includes(w.key)).map((w) => w.name).join(', ') || it.vendorDesks.join(', ') : 'no desk yet'}` },
            { icon: Cloud, label: 'Hyperscaler / hosting', value: nameOf(it?.hyperscalers, it?.hyperscalerId), sub: 'Hosts the servers, SAP and BW' },
          ].map((x) => (
            <div key={x.label} className="flex items-start gap-3 rounded-xl border border-line p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><x.icon size={17} /></span>
              <div className="min-w-0"><div className="text-2xs font-bold uppercase tracking-wide text-muted">{x.label}</div><div className="font-bold">{x.value}</div><div className="text-2xs text-muted">{x.sub}</div></div>
            </div>
          ))}
        </div>
      </Card>
      {error && <Notice>{error}</Notice>}
      {!d && !error ? <Card><Skeleton rows={6} /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tiles.map((t) => (
            <section key={t.p} className="flex flex-col rounded-2xl border border-line bg-panel p-4 shadow-card" data-testid={`itsm-tile-${t.p}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><t.icon size={17} /></span>
                <div className="min-w-0"><h3 className="text-sm font-extrabold">{PRACTICES[t.p].label}</h3><p className="text-2xs text-muted">{PRACTICES[t.p].plain}</p></div>
              </div>
              <dl className="mt-3 grid flex-1 grid-cols-1 gap-1 text-[13px]">
                {t.stats.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1 last:border-0"><dt className="text-muted">{k}</dt><dd className="num text-right font-bold">{v}</dd></div>)}
              </dl>
              {t.open && <Button size="sm" className="mt-3 self-start" onClick={() => run(t.open!)}>{t.open.label} <ArrowRight size={13} /></Button>}
            </section>
          ))}
        </div>
      )}
      <Card title="Workflows" sub="The standard ITSM flow of each practice, as Samadhan runs it.">
        <div className="space-y-4">
          {FLOWS.map((f) => (
            <div key={f.title}>
              <div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{f.title}</span><ItsmTag practice={f.p} /></div>
              <ol className="flex flex-wrap items-center gap-1">
                {f.steps.map((s, i) => (
                  <li key={s} className="inline-flex items-center gap-1">
                    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold', i === 0 ? 'bg-accent/15 text-accent' : 'bg-sunken text-ink')}><span className="num text-faint">{i + 1}</span> {s}</span>
                    {i < f.steps.length - 1 && <ArrowRight size={12} className="text-faint" aria-hidden />}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <p className="flex items-start gap-1.5 text-2xs text-muted"><AlertTriangle size={13} className="mt-px shrink-0" /> Every step is recorded in the ticket&apos;s activity log and the CI history, so audits can follow who did what and when.</p>
        </div>
      </Card>
    </div>
  );
}
