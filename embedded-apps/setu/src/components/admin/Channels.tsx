'use client';
import { useEffect, useState } from 'react';
import { Bell, Copy, Globe, MessageCircle, PhoneCall, Smile } from 'lucide-react';
import { admin, setuApiUrl } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { useSetu } from '@/lib/context';
import { BELL_EVENT_LABEL } from '@/lib/format';
import type { BellEvent, CallMode } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, cx, inputCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

const EVENTS: BellEvent[] = ['requester_reply', 'new_ticket', 'assigned', 'note'];
const SCOPES = [
  { id: 'assignee', label: "The ticket's agent", hint: 'Everyone in its group while it is unassigned' },
  { id: 'group', label: "The ticket's whole group", hint: 'The agent plus every member of the group' },
  { id: 'all', label: 'Every agent', hint: 'Busy helpdesks: use with "requester replies" only' },
];

function CopyLine({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly className={cx(inputCls, 'font-mono text-xs')} value={value} onFocus={(e) => e.target.select()} />
      <Button onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
        <Copy size={13} /> {done ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}

/** Admin > Channels & bell: the in-app bell, the requester portal, calling, WhatsApp. */
export function ChannelsTab() {
  const { whatsappEnabled, reloadMeta } = useSetu();
  const { data, error, reload } = useLoad(admin.settings);
  const [events, setEvents] = useState<BellEvent[]>(['requester_reply']);
  const [scope, setScope] = useState('assignee');
  const [portal, setPortal] = useState(true);
  const [csat, setCsat] = useState(true);
  const [callMode, setCallMode] = useState<CallMode>('tel');
  const [threadDays, setThreadDays] = useState('7');
  const [portalUrl, setPortalUrl] = useState('');
  const act = useAction();
  useEffect(() => {
    if (!data) return;
    setEvents(Array.isArray(data['bell.events']) ? (data['bell.events'] as BellEvent[]) : ['requester_reply']);
    setScope(String(data['bell.scope'] ?? 'assignee'));
    setPortal(data['portal.enabled'] !== false);
    setCsat(data['csat.enabled'] !== false);
    setCallMode(data['call.mode'] === 'teams' ? 'teams' : 'tel');
    setThreadDays(String(data['whatsapp.threadDays'] ?? 7));
  }, [data]);
  useEffect(() => { setPortalUrl(`${window.location.origin}${BASE_PATH}/portal/`); }, []);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  const save = async () => {
    const ok = await act.run(
      () => admin.saveSettings({ 'bell.events': events, 'bell.scope': scope, 'portal.enabled': portal, 'csat.enabled': csat, 'call.mode': callMode, 'whatsapp.threadDays': Number(threadDays) }),
      'Channel and bell settings saved.',
    );
    if (ok) { reload(); reloadMeta(); }
  };

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-2"><Bell size={15} className="text-accent" /> Notification bell</span>} sub="The bell in the Samadhan header. Agents can switch any of these off for themselves.">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">What reaches the bell</div>
            {EVENTS.map((e) => (
              <label key={e} className="flex items-center gap-2 py-1 text-[13px]">
                <input type="checkbox" className={checkboxCls} checked={events.includes(e)} onChange={(x) => setEvents(x.target.checked ? [...events, e] : events.filter((y) => y !== e))} />
                {BELL_EVENT_LABEL[e]}
                {e === 'requester_reply' && <Pill tone="accent">Default</Pill>}
              </label>
            ))}
            {events.length === 0 && <p className="mt-1 text-2xs text-warn">Nothing selected: the bell stays empty for everyone.</p>}
          </div>
          <div>
            <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Who sees requester replies and new tickets</div>
            {SCOPES.map((s) => (
              <label key={s.id} className="flex items-start gap-2 py-1 text-[13px]">
                <input type="radio" name="bell-scope" className={cx(checkboxCls, 'mt-0.5')} checked={scope === s.id} onChange={() => setScope(s.id)} />
                <span>{s.label}<span className="block text-2xs text-muted">{s.hint}</span></span>
              </label>
            ))}
            <p className="mt-1 text-2xs text-faint">Assignments and notes always go to the ticket&apos;s agent only.</p>
          </div>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Globe size={15} className="text-accent" /> Requester portal</span>} sub="Distributors and field staff raise tickets and check their status without an Emami Apps login.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" className={checkboxCls} checked={portal} onChange={(e) => setPortal(e.target.checked)} /> Portal open
          </label>
          <Field label="Portal link" hint="Share it in emails, WhatsApp groups or on the distributor app.">
            <CopyLine value={portalUrl} />
          </Field>
          <p className="text-2xs text-muted">Each request needs a name and email; the requester gets the usual acknowledgement email. Limits: 5 tickets per 10 minutes per network, 10 per email a day.</p>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><Smile size={15} className="text-accent" /> Customer satisfaction survey</span>} sub="Ask requesters to rate the support once their ticket is closed.">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-[13px] font-medium">
            <input type="checkbox" className={checkboxCls} checked={csat} onChange={(e) => setCsat(e.target.checked)} /> Send the survey
          </label>
          <p className="text-2xs text-muted">When a ticket is closed, the requester gets one email with a link to rate the support (Extremely satisfied / Neither / Extremely dissatisfied, with an optional comment). No sign-in needed. The email wording is the &apos;requester.csat&apos; template in Content. Ratings show on the ticket, the dashboard and Analytics.</p>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><PhoneCall size={15} className="text-accent" /> Calling the requester</span>} sub="The Call button on a ticket">
        <div className="space-y-2">
          {([['tel', 'Phone app on the PC or phone (tel: link)', 'Works with a softphone, the Phone Link app, or a mobile browser.'], ['teams', 'Microsoft Teams calling', 'Needs a Teams Phone (PSTN) licence for the agent.']] as const).map(([id, label, hint]) => (
            <label key={id} className="flex items-start gap-2 text-[13px]">
              <input type="radio" name="call-mode" className={cx(checkboxCls, 'mt-0.5')} checked={callMode === id} onChange={() => setCallMode(id)} />
              <span>{label}<span className="block text-2xs text-muted">{hint}</span></span>
            </label>
          ))}
          <p className="text-2xs text-faint">Every call is logged on the ticket with its outcome, length and notes.</p>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-2"><MessageCircle size={15} className="text-good" /> WhatsApp</span>} sub="Meta WhatsApp Business (Cloud API)" actions={whatsappEnabled ? <Pill tone="good">Connected</Pill> : <Pill tone="warn">Not connected</Pill>}>
        <div className="space-y-3">
          <Field label="Keep a conversation on one ticket for (days)" hint="A message joins the sender's open WhatsApp ticket updated within this time; otherwise it starts a new ticket.">
            <input type="number" min={1} max={60} className={cx(inputCls, 'w-28')} value={threadDays} onChange={(e) => setThreadDays(e.target.value)} />
          </Field>
          <Field label="Webhook URL (give this to Meta)"><CopyLine value={setuApiUrl('/whatsapp/webhook')} /></Field>
          {!whatsappEnabled && (
            <ol className="list-decimal space-y-1 pl-4 text-2xs text-muted">
              <li>In Meta Business Manager, create a WhatsApp Business app and register the helpdesk number.</li>
              <li>On the backend server set <code>SETU_WHATSAPP_ENABLED=true</code>, <code>SETU_WHATSAPP_TOKEN</code>, <code>SETU_WHATSAPP_PHONE_NUMBER_ID</code>, <code>SETU_WHATSAPP_APP_SECRET</code> and a <code>SETU_WHATSAPP_VERIFY_TOKEN</code> of your choice, then restart it.</li>
              <li>In the Meta app, add the webhook URL above with the same verify token and subscribe to <em>messages</em>.</li>
            </ol>
          )}
        </div>
      </Card>

      <div className="lg:col-span-2">
        {act.msg && <div className="mb-2"><Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice></div>}
        <Button variant="primary" disabled={act.busy} onClick={save}>Save channel settings</Button>
      </div>
    </div>
  );
}
