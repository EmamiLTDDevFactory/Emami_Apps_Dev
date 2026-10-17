'use client';
import { useEffect, useState } from 'react';
import { admin } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { fmtDateTime } from '@/lib/format';
import type { AutomationRule } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, Table, cx, inputBase, inputCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

export function SettingsTab() {
  const { meta } = useSetu();
  const { data, error, reload } = useLoad(admin.settings);
  const [groupId, setGroupId] = useState('0');
  const [emails, setEmails] = useState('');
  const [mins, setMins] = useState('30');
  const act = useAction();
  useEffect(() => {
    if (!data) return;
    setGroupId(String(data['escalation.groupId'] ?? 0));
    setEmails(Array.isArray(data['escalation.notifyEmails']) ? (data['escalation.notifyEmails'] as string[]).join(', ') : '');
    setMins(String(data['sla.reminderMinutes'] ?? 30));
  }, [data]);
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  return (
    <Card title="Routing and SLA settings" className="max-w-2xl">
      <div className="space-y-4">
        <Field label="Escalation group" hint="Open tickets more than 2 hours past their resolution due time move here (once). Not set = the rule logs and skips.">
          <select className={cx('h-9 w-full', inputBase)} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="0">Not set</option>
            {meta.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="Notify on escalation to L3" hint="Comma separated emails, notified when a ticket moves to Escalation to L3 Support.">
          <input className={inputCls} value={emails} onChange={(e) => setEmails(e.target.value)} />
        </Field>
        <Field label="SLA reminder lead time (minutes)" hint="Agents are reminded this long before a first response or resolution falls due.">
          <input type="number" min={5} max={1440} className={cx(inputCls, 'w-32')} value={mins} onChange={(e) => setMins(e.target.value)} />
        </Field>
        {act.msg && <Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice>}
        <Button variant="primary" disabled={act.busy} onClick={async () => { if (await act.run(() => admin.saveSettings({ 'escalation.groupId': Number(groupId), 'escalation.notifyEmails': emails, 'sla.reminderMinutes': Number(mins) }), 'Routing and SLA settings saved.')) reload(); }}>Save settings</Button>
      </div>
    </Card>
  );
}

const TRIGGER_LABEL = { ON_CREATE: 'When a ticket is created', ON_UPDATE: 'When a ticket is updated', TIME: 'Time-based (checked every few minutes)' };
const OP: Record<string, string> = { eq: 'is', ne: 'is not', in: 'is one of', not_in: 'is not one of', gt: '>', gte: '≥', lt: '<', is_empty: 'is empty', not_empty: 'is set' };

function RuleText({ r }: { r: AutomationRule }) {
  const { meta } = useSetu();
  const val = (field: string, v: unknown): string => {
    const one = (x: unknown) => (field === 'statusId' ? meta.statuses.find((s) => s.id === x)?.name ?? String(x) : field === 'groupId' ? meta.groups.find((g) => g.id === x)?.name ?? String(x) : String(x));
    return Array.isArray(v) ? v.map(one).join(', ') : v === undefined ? '' : one(v);
  };
  const conds = [...(r.conditions.all ?? []), ...(r.conditions.any ?? [])];
  const action = (a: AutomationRule['actions'][number]): string => {
    switch (a.type) {
      case 'setStatus': return `set status to ${val('statusId', a.value)}`;
      case 'setPriority': return `set priority to ${meta.priorities[String(a.value)] ?? a.value}`;
      case 'setGroup': return a.setting ? `move to the group in setting ${String(a.setting)}` : `move to ${val('groupId', a.value)}`;
      case 'setField': return `set ${String(a.field)} to ${String(a.value ?? '—')}`;
      case 'sendReplyTemplate': return `email the requester (${String(a.template)})`;
      case 'notifyAgents': return `notify ${a.to === 'setting' ? `the people in ${String(a.setting)}` : String(a.to)} (${String(a.template)})`;
      case 'markEscalated': return 'mark as escalated';
      default: return a.type;
    }
  };
  return (
    <div className="text-xs text-muted">
      <span className="font-semibold text-ink">If </span>
      {conds.length ? conds.map((c, i) => <span key={i}>{i > 0 && ' and '}<code className="rounded bg-sunken px-1">{c.field}</code> {OP[c.op] ?? c.op} {val(c.field, c.value)}</span>) : 'always'}
      <span className="font-semibold text-ink"> then </span>{r.actions.map(action).join(', then ')}.
    </div>
  );
}

export function AutomationsTab() {
  const { data, error, reload } = useLoad(admin.automations);
  const act = useAction();
  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  return (
    <div className="space-y-4">
      {act.msg && <Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice>}
      {(['ON_CREATE', 'ON_UPDATE', 'TIME'] as const).map((trig) => (
        <Card key={trig} title={TRIGGER_LABEL[trig]} bodyClass="p-0">
          <ul className="divide-y divide-line">
            {data.filter((r) => r.trigger === trig).map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <input type="checkbox" className={cx(checkboxCls, 'mt-0.5')} checked={r.active} aria-label={`${r.name} active`} onChange={async (e) => { await act.run(() => admin.toggleAutomation(r.id, e.target.checked), `${r.name}: ${e.target.checked ? 'on' : 'off'}.`); reload(); }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">{r.name}{!r.active && <Pill>Off</Pill>}</div>
                  <RuleText r={r} />
                </div>
              </li>
            ))}
            {data.filter((r) => r.trigger === trig).length === 0 && <li className="px-4 py-3 text-sm text-muted">None.</li>}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function ContactsTab() {
  const [email, setEmail] = useState('');
  const act = useAction();
  return (
    <Card title="Remove a contact's personal data" sub="On a data-removal request: name, email and phone numbers are replaced. Tickets stay for reporting." className="max-w-xl">
      <div className="flex gap-2">
        <input className={inputCls} type="email" placeholder="requester@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Contact email" />
        <Button variant="primary" disabled={!email.trim() || act.busy} onClick={async () => { if (confirm(`Remove all personal details of ${email}? This cannot be undone.`) && (await act.run(() => admin.anonymize(email.trim()), 'Personal details removed from that contact.'))) setEmail(''); }}>Remove</Button>
      </div>
      {act.msg && <div className="mt-3"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
    </Card>
  );
}

export function AuditTab() {
  const { data, error } = useLoad(admin.audit);
  if (error) return <Notice>{error}</Notice>;
  return (
    <Card title="Audit log" sub="Sensitive actions: settings, agents, imports, report downloads, data removal (latest 200)" bodyClass="p-0">
      {!data ? <div className="p-4"><Skeleton /></div> : data.length === 0 ? <p className="p-4 text-sm text-muted">Nothing recorded yet.</p> : (
        <Table head={['When', 'Who', 'Action', 'Details']}>
          {data.map((e) => (
            <tr key={e.id}>
              <td className="num whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(e.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{e.actorEmail ?? 'System'}</td>
              <td className="px-3 py-2"><Pill tone="accent">{e.action.replace(/_/g, ' ')}</Pill></td>
              <td className="max-w-lg truncate px-3 py-2 font-mono text-2xs text-muted" title={JSON.stringify(e.details)}>{JSON.stringify(e.details)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

const REASON: Record<string, string> = { auto_reply: 'Auto reply', notification_loop: 'Notification loop', out_of_office: 'Out of office', sender_flood: 'Sender flood (20+/hour)' };

export function ParkedTab() {
  const { data, error } = useLoad(admin.parkedMail);
  if (error) return <Notice>{error}</Notice>;
  return (
    <Card title="Parked mail" sub="Mailbox messages that did not become tickets (auto replies, our own notifications, floods). Latest 200." bodyClass="p-0">
      {!data ? <div className="p-4"><Skeleton /></div> : data.length === 0 ? <p className="p-4 text-sm text-muted">No parked mail.</p> : (
        <Table head={['Received', 'From', 'Subject', 'Reason']}>
          {data.map((m) => (
            <tr key={m.id}>
              <td className="num whitespace-nowrap px-3 py-2 text-xs">{fmtDateTime(m.receivedAt)}</td>
              <td className="px-3 py-2 text-xs">{m.fromEmail}</td>
              <td className="max-w-md truncate px-3 py-2">{m.subject}</td>
              <td className="px-3 py-2"><Pill tone="warn">{REASON[m.reason] ?? m.reason}</Pill></td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
