'use client';
import { useEffect, useState } from 'react';
import { Bell, Copy, Globe, MessageCircle, PhoneCall, Smile } from 'lucide-react';
import { admin, setuApiUrl } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { useSetu } from '@/lib/context';
import { BELL_EVENT_LABEL } from '@/lib/format';
import type { BellEvent, BellScope, CallMode } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, cx, inputBase, inputCls } from '../ui';
import { checkboxCls, useAction, useLoad } from './shared';

const FALLBACK_EVENTS: BellEvent[] = ['requester_reply', 'new_ticket', 'assigned', 'note'];
const SCOPES: { id: BellScope; label: string; hint: string }[] = [
  { id: 'assignee', label: "Ticket's agent", hint: "The ticket's agent; everyone in its group while it is unassigned" },
  { id: 'group', label: 'Whole group', hint: "The ticket's agent plus every member of its group" },
  { id: 'all', label: 'Everyone', hint: 'Every active agent - busy helpdesks: keep this for rare events' },
];
const isScope = (v: unknown): v is BellScope => v === 'assignee' || v === 'group' || v === 'all';
/** These always go to the specific people involved (the new assignee, the people mentioned, the ticket's watchers). */
const PERSONAL: BellEvent[] = ['assigned', 'mention', 'watching'];
const EVENT_HINT: Record<string, string> = {
  requester_reply: 'Requester replied', new_ticket: 'New ticket from email / portal / WhatsApp', assigned: 'Ticket assigned to me',
  note: 'Private note on my ticket', mention: 'Someone @mentioned me in a note', status_changed: "Someone else changed my ticket's status",
  escalated: 'Ticket escalated to L3', sla_warning: 'First response / resolution due soon', sla_breach: 'SLA breached',
  csat: 'Requester rated the support', watching: 'Updates on tickets I watch',
};
const prettify = (id: string) => id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

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
  const { whatsappEnabled, reloadMeta, meta } = useSetu();
  const eventList = meta.bellEventList?.length ? meta.bellEventList : FALLBACK_EVENTS;
  const { data, error, reload } = useLoad(admin.settings);
  const [events, setEvents] = useState<BellEvent[]>(['requester_reply']);
  const [audience, setAudience] = useState<Partial<Record<BellEvent, BellScope>>>({});
  const [portal, setPortal] = useState(true);
  const [csat, setCsat] = useState(true);
  const [callMode, setCallMode] = useState<CallMode>('tel');
  const [threadDays, setThreadDays] = useState('7');
  const [portalUrl, setPortalUrl] = useState('');
  const act = useAction();
  useEffect(() => {
    if (!data) return;
    setEvents(Array.isArray(data['bell.events']) ? (data['bell.events'] as BellEvent[]) : ['requester_reply']);
    // Per-event audience; an event never set falls back to the older single 'bell.scope' setting.
    const fallback: BellScope = isScope(data['bell.scope']) ? data['bell.scope'] : 'assignee';
    const saved = (data['bell.audience'] && typeof data['bell.audience'] === 'object' ? data['bell.audience'] : {}) as Record<string, unknown>;
    setAudience(Object.fromEntries(eventList.filter((e) => !PERSONAL.includes(e)).map((e) => [e, isScope(saved[e]) ? saved[e] : fallback])));
    setPortal(data['portal.enabled'] !== false);
    setCsat(data['csat.enabled'] !== false);
    setCallMode(data['call.mode'] === 'teams' ? 'teams' : 'tel');
    setThreadDays(String(data['whatsapp.threadDays'] ?? 7));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => { setPortalUrl(`${window.location.origin}${BASE_PATH}/portal/`); }, []);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <Card><Skeleton /></Card>;
  const save = async () => {
    const ok = await act.run(
      () => admin.saveSettings({ 'bell.events': events, 'bell.audience': audience, 'portal.enabled': portal, 'csat.enabled': csat, 'call.mode': callMode, 'whatsapp.threadDays': Number(threadDays) }),
      'Channel and bell settings saved.',
    );
    if (ok) { reload(); reloadMeta(); }
  };

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
      <Card title={<span className="inline-flex items-center gap-2"><Bell size={15} className="text-accent" /> Notification bell</span>} sub="The bell in the Samadhan header. Agents can switch any of these off for themselves." className="lg:col-span-2">
        <div className="space-y-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_10rem] gap-3 text-2xs font-bold uppercase tracking-wide text-muted sm:grid">
            <span>What reaches the bell</span><span>Who gets it</span>
          </div>
          <ul className="divide-y divide-line">
            {eventList.map((e) => {
              const on = events.includes(e);
              return (
                <li key={e} className="grid gap-1.5 py-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center sm:gap-3">
                  <label className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className={cx(checkboxCls, 'mt-0.5')} checked={on} onChange={(x) => setEvents(x.target.checked ? [...events, e] : events.filter((y) => y !== e))} />
                    <span className="min-w-0">
                      <span className="font-medium">{BELL_EVENT_LABEL[e] ?? prettify(e)}</span>
                      {e === 'requester_reply' && <span className="ml-1.5"><Pill tone="accent">Default</Pill></span>}
                      {EVENT_HINT[e] && EVENT_HINT[e] !== BELL_EVENT_LABEL[e] && <span className="block text-2xs text-muted">{EVENT_HINT[e]}</span>}
                    </span>
                  </label>
                  {PERSONAL.includes(e) ? (
                    <span className={cx('pl-6 text-2xs text-muted sm:pl-0', !on && 'opacity-50')}>Specific people</span>
                  ) : (
                    <select
                      aria-label={`Who gets: ${BELL_EVENT_LABEL[e] ?? prettify(e)}`}
                      title={SCOPES.find((x) => x.id === audience[e])?.hint}
                      className={cx('ml-6 h-8 text-xs sm:ml-0', inputBase, !on && 'opacity-50')}
                      value={audience[e] ?? 'assignee'}
                      disabled={!on}
                      onChange={(x) => setAudience({ ...audience, [e]: x.target.value as BellScope })}
                    >
                      {SCOPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          {events.length === 0 && <p className="text-2xs text-warn">Nothing selected: the bell stays empty for everyone.</p>}
          <p className="text-2xs text-faint">Ticket&apos;s agent = the assigned agent, or everyone in the group while it is unassigned. Whole group = the agent plus every group member. Everyone = every active agent. Assignments, @mentions and watched-ticket updates always go to the specific people involved.</p>
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
