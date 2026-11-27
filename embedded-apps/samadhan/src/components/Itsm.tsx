'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowUpCircle, BookPlus, Boxes, Building2, Check, Clock, Download, Gauge, History, Link2, PhoneCall, ShieldAlert, Timer, Users, X } from 'lucide-react';
import { cmdbApi, escalateTicket, getEscalations, saveArticle, setSupportVendor, vendorScorecard } from '@/lib/api';
import { PRACTICES, type Practice } from '@/lib/itsmPractices';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, htmlToText, relative } from '@/lib/format';
import type { CiRef, Ticket, TicketEscalation, VendorScore } from '@/lib/types';
import { Button, Card, Empty, Field, Kpi, Notice, Pill, Skeleton, Spinner, Table, cx, inputBase, textareaCls } from './ui';

/*
   ITSM support model (migration 7.11) on the ticket and in Analytics:
     - IncidentLifecycle: where the ticket is in the ITIL lifecycle (logged -> categorised -> prioritised -> assigned ->
       responded -> resolved -> closed), so anyone can see the next step at a glance;
     - SupportCard: the support vendor working the ticket (Allied Digital today), the escalation level reached, the
       escalation history and "Escalate" (hierarchical escalation to the next level of the matrix, with a reason);
     - VendorScorecard: SLA, MTTR, backlog, escalations and CSAT per support vendor (Analytics > Support vendors).
*/
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');

/** Small "ITSM · <practice>" tag: shows which ITIL practice a screen or card belongs to (hover for the meaning). */
export function ItsmTag({ practice, className }: { practice: Practice | Practice[]; className?: string }) {
  const list = Array.isArray(practice) ? practice : [practice];
  return (
    <span className={cx('inline-flex flex-wrap items-center gap-1 align-middle', className)}>
      {list.map((p) => (
        <span key={p} title={`${PRACTICES[p].label}: ${PRACTICES[p].plain}`} data-itsm={p}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-accent/25 bg-accent/5 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-accent">
          ITSM · {PRACTICES[p].short}
        </span>
      ))}
    </span>
  );
}

/** One line under a screen's top: the ITSM practices it serves, in plain words. */
export function ItsmBanner({ practice, children }: { practice: Practice | Practice[]; children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 text-2xs text-muted" data-testid="itsm-banner"><ItsmTag practice={practice} /> <span>{children}</span></div>;
}

/** Practice of a ticket from its record class (Incident / Service request / Problem / Change ...). */
export const ticketPractice = (rc?: string | null): Practice =>
  rc === 'PROBLEM' ? 'problem' : rc === 'CHANGE' ? 'change' : rc === 'SERVICE_REQUEST' || rc === 'ACCESS_REQUEST' || rc === 'QUERY' ? 'request' : 'incident';

const STEPS = [
  { key: 'logged', label: 'Logged' },
  { key: 'categorised', label: 'Categorised' },
  { key: 'prioritised', label: 'Prioritised' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'responded', label: 'Diagnosing' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
] as const;

/** ITIL incident lifecycle strip. Done steps are ticked; the first open step is "next". */
export function IncidentLifecycle({ ticket: t }: { ticket: Ticket }) {
  const done: Record<(typeof STEPS)[number]['key'], boolean> = {
    logged: true,
    categorised: !!t.category,
    prioritised: !!t.priority,
    assigned: !!t.agentId,
    responded: !!t.firstRespondedAt,
    resolved: !!t.resolvedAt || t.isResolved,
    closed: !!t.closedAt || t.isClosed,
  };
  const next = STEPS.find((s) => !done[s.key])?.key;
  const hint: Record<string, string> = {
    categorised: 'Pick the category so the ticket routes to the right team.',
    prioritised: 'Set the priority (impact × urgency).',
    assigned: 'Assign an agent - the SLA clock is running.',
    responded: 'Respond to the requester and start the diagnosis.',
    resolved: 'Resolve: restore the service, then record the resolution.',
    closed: 'Waiting for the requester to confirm - closes on its own after the waiting time.',
  };
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="incident-lifecycle">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Lifecycle <ItsmTag practice={ticketPractice(t.recordClass)} /></span>
        {next && <span className="text-2xs text-muted">Next: {hint[next]}</span>}
      </div>
      <ol className="flex flex-wrap gap-1">
        {STEPS.map((s, i) => (
          <li key={s.key} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold',
            done[s.key] ? 'bg-good/15 text-good' : s.key === next ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/30' : 'bg-sunken text-faint')}>
            {done[s.key] ? <Check size={11} /> : <span className="num">{i + 1}</span>} {s.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Support vendor, escalation level, history and the Escalate action. */
export function SupportCard({ ticket: t, reload }: { ticket: Ticket; reload: () => Promise<void> }) {
  const { meta, can } = useSamadhan();
  const itsm = meta.itsm;
  const [history, setHistory] = useState<TicketEscalation[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const load = useCallback(() => { getEscalations(t.id).then(setHistory).catch(() => setHistory([])); }, [t.id]);
  useEffect(() => { load(); }, [load, t.escalationLevel]);
  if (!itsm) return null;
  const level = t.escalationLevel ?? 0;
  const maxLevel = Math.max(0, ...itsm.escalationLevels);
  const vendor = itsm.vendors.find((v) => v.id === t.supportPartnerId);
  const closed = t.isResolved || t.isClosed;
  const changeVendor = async (v: string) => {
    setMsg(null);
    try { await setSupportVendor(t.id, v ? Number(v) : null); await reload(); setMsg({ tone: 'good', text: 'Support vendor saved.' }); } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); }
  };
  const escalate = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await escalateTicket(t.id, reason);
      setMsg({ tone: 'good', text: `Escalated to level ${r.level}; ${r.notified.join(', ')} informed.` });
      setReason('');
      setOpen(false);
      await reload();
      load();
    } catch (e) { setMsg({ tone: 'bad', text: errText(e) }); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="inline-flex flex-wrap items-center gap-1.5"><Building2 size={15} className="text-accent" /> Support &amp; escalation <ItsmTag practice={['supplier', 'escalation']} /></span>}
      actions={level > 0 ? <Pill tone="bad">Level {level}</Pill> : <Pill>Not escalated</Pill>}>
      <div className="space-y-3 text-[13px]" data-testid="support-card">
        <Field label="Support vendor" hint={vendor ? undefined : 'In-house team (no vendor)'}>
          <select className={cx('h-9 w-full', inputBase)} value={t.supportPartnerId ?? ''} disabled={!can('ticket.edit')} onChange={(e) => changeVendor(e.target.value)} data-testid="support-vendor">
            <option value="">In-house / not set</option>
            {itsm.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
        {t.legacyRef && <div className="text-2xs"><span className="font-bold uppercase tracking-wide text-muted">Old tool number</span> <span className="num ml-1 font-semibold">{t.legacyRef}</span></div>}
        {maxLevel > 0 && (
          <div>
            <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Escalation ladder</div>
            <div className="flex flex-wrap gap-1">
              {itsm.escalationLevels.map((l) => <span key={l} className={cx('rounded-md px-1.5 py-0.5 text-2xs font-semibold', l <= level ? 'bg-bad/15 text-bad' : 'bg-sunken text-faint')}>L{l}</span>)}
            </div>
            <p className="mt-1 text-2xs text-muted">{itsm.autoEscalate ? 'Climbs by itself once the resolution is overdue (Admin > Support model).' : 'Automatic escalation is off; escalate by hand.'}</p>
          </div>
        )}
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {!closed && can('ticket.edit') && (open ? (
          <div className="space-y-2">
            <Field label="Why escalate?" required><textarea rows={2} className={textareaCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Plant users blocked for 3 hours, vendor engineer not reachable" /></Field>
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy || reason.trim().length < 5} onClick={escalate}>{busy ? <Spinner /> : <ArrowUpCircle size={14} />} Escalate to level {level + 1 > maxLevel ? maxLevel || 1 : level + 1}</Button>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setOpen(true)} disabled={maxLevel === 0 || level >= maxLevel} title={maxLevel === 0 ? 'No escalation matrix yet - Admin > Support model' : level >= maxLevel ? 'Already at the highest level' : undefined} data-testid="escalate-open">
            <ShieldAlert size={14} /> {maxLevel === 0 ? 'Escalation matrix not set up' : level >= maxLevel ? 'Highest level reached' : 'Escalate'}
          </Button>
        ))}
        {closed && can('article.edit') && <KnowledgeButton ticket={t} />}
        {history && history.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-muted"><History size={12} /> History</div>
            <ul className="space-y-1.5">
              {history.map((h) => (
                <li key={h.id} className="rounded-lg bg-sunken px-2 py-1.5 text-2xs">
                  <div className="flex flex-wrap items-center gap-1.5"><Pill tone="bad">L{h.level}</Pill> <span className="font-semibold">{h.manual ? `by ${h.byName ?? 'an agent'}` : 'automatic'}</span> <span className="text-muted" title={fmtDateTime(h.createdAt)}>{relative(h.createdAt)}</span></div>
                  {h.reason && <div className="mt-0.5 text-muted">{h.reason}</div>}
                  {h.notified.length > 0 && <div className="mt-0.5 text-faint">Informed: {h.notified.join(', ')}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Analytics > Support vendors: one row per vendor (and in-house), tickets logged in the period. */
export function VendorScorecard({ days }: { days: number }) {
  const [rows, setRows] = useState<VendorScore[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setRows(null); setError(''); vendorScorecard(days).then(setRows).catch((e) => setError(errText(e))); }, [days]);
  if (error) return <Notice>{error}</Notice>;
  if (!rows) return <Card><Skeleton rows={5} /></Card>;
  if (!rows.length) return <Empty title="No tickets in this period" />;
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
  const tone = (v: number | null, good = 90, warn = 75) => (v === null ? 'neutral' : v >= good ? 'good' : v >= warn ? 'warn' : 'bad') as 'neutral' | 'good' | 'warn' | 'bad';
  const kpiTone = (v: number | null) => (v === null ? 'accent' : tone(v)) as 'accent' | 'good' | 'warn' | 'bad';
  const main = rows.find((r) => r.id !== null) ?? rows[0];
  const soon = (d: string | null) => !!d && (new Date(d).getTime() - Date.now()) / 86400000 < 60;
  return (
    <div className="space-y-4" data-testid="vendor-scorecard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label={`${main.name} - resolution SLA`} value={pct(main.resPct)} sub={`${main.resolved} resolved of ${main.total}`} icon={Timer} tone={kpiTone(main.resPct)} />
        <Kpi label="Response SLA" value={pct(main.frPct)} sub="first response in time" icon={Clock} tone={kpiTone(main.frPct)} />
        <Kpi label="First contact resolution" value={pct(main.fcrPct)} sub="resolved without escalation or transfer" icon={PhoneCall} tone={main.fcrPct === null ? 'accent' : main.fcrPct >= 75 ? 'good' : main.fcrPct >= 60 ? 'warn' : 'bad'} />
        <Kpi label="Mean time to resolve" value={main.mttrHours === null ? '—' : `${main.mttrHours} h`} sub="logged to resolved, wall clock" icon={Gauge} />
        <Kpi label="Open past due" value={main.openBreached} sub={`${main.open} open · ${main.escalated} escalated`} icon={Users} tone={main.openBreached ? 'bad' : 'good'} />
      </div>
      <Card title={<span className="inline-flex flex-wrap items-center gap-1.5">Support vendor scorecard <ItsmTag practice={['supplier', 'slm']} /></span>} sub="The vendor's report card for the period: tickets logged, by the vendor working them. SLA % counts only tickets with a target."
        actions={<Button size="sm" onClick={() => downloadReportCard(rows, days)}><Download size={13} /> Report card (Excel)</Button>} bodyClass="p-0">
        <Table head={['Vendor', 'Tickets', 'Open', 'Open past due', 'Response SLA', 'Resolution SLA', 'Contract target', 'First contact', 'MTTR', 'Escalated', 'Major', 'CSAT happy', 'Contract ends']}>
          {rows.map((r) => (
            <tr key={r.id ?? 'none'} className="border-b border-line last:border-0">
              <td className="px-3 py-2 font-semibold">{r.name}</td>
              <td className="num px-3 py-2">{r.total}</td>
              <td className="num px-3 py-2">{r.open}</td>
              <td className="num px-3 py-2">{r.openBreached ? <Pill tone="bad">{r.openBreached}</Pill> : 0}</td>
              <td className="px-3 py-2"><Pill tone={tone(r.frPct)}>{pct(r.frPct)}</Pill></td>
              <td className="px-3 py-2"><Pill tone={tone(r.resPct)}>{pct(r.resPct)}</Pill></td>
              <td className="px-3 py-2">{r.slaTargetPct === null ? <span className="text-faint">—</span> : <Pill tone={r.targetMet === null ? 'neutral' : r.targetMet ? 'good' : 'bad'}>{r.slaTargetPct}% · {r.targetMet === null ? 'no data' : r.targetMet ? 'met' : 'missed'}</Pill>}</td>
              <td className="px-3 py-2">{pct(r.fcrPct)}</td>
              <td className="num px-3 py-2">{r.mttrHours === null ? '—' : `${r.mttrHours} h`}</td>
              <td className="num px-3 py-2">{r.escalated}{r.escalatedPct !== null ? <span className="text-faint"> ({r.escalatedPct}%)</span> : null}</td>
              <td className="num px-3 py-2">{r.major}</td>
              <td className="px-3 py-2">{r.csatCount ? <Pill tone={tone(r.csatPct, 80, 60)}>{pct(r.csatPct)}</Pill> : <span className="text-faint">—</span>}</td>
              <td className="num px-3 py-2">{r.contractEnd ? <span className={cx(soon(r.contractEnd) && 'font-semibold text-warn')}>{r.contractEnd}{soon(r.contractEnd) ? ' · renew soon' : ''}</span> : '—'}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/** The scorecard as an Excel "report card" (one sheet, the period in the title) - the monthly review with the vendor. */
async function downloadReportCard(rows: VendorScore[], days: number) {
  const XLSX = await import('xlsx');
  const safe = (v: unknown) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
  const data = rows.map((r) => ({
    Vendor: safe(r.name), Tickets: r.total, Open: r.open, 'Open past due': r.openBreached, Resolved: r.resolved,
    'Response SLA %': r.frPct, 'Resolution SLA %': r.resPct, 'Contract target %': r.slaTargetPct, 'Target met': r.targetMet === null ? '' : r.targetMet ? 'Yes' : 'No',
    'First contact resolution %': r.fcrPct, 'MTTR (hours)': r.mttrHours, Escalated: r.escalated, 'Major incidents': r.major, 'CSAT happy %': r.csatPct, 'Contract ends': r.contractEnd ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report card');
  XLSX.writeFile(wb, `Samadhan_Vendor_Report_Card_${days}d_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const escHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
/** Knowledge capture: the resolved ticket becomes a draft article (symptom, cause, fix), reviewed later in Solutions. */
function KnowledgeButton({ ticket: t }: { ticket: Ticket }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | string>('idle');
  const save = async () => {
    setState('busy');
    const part = (label: string, v: string | null | undefined) => (v && v.trim() ? `<h3>${label}</h3><p>${escHtml(v.trim()).replace(/\n/g, '<br>')}</p>` : '');
    const body = [
      part('Symptom', htmlToText(t.description || '').slice(0, 4000) || t.subject),
      part('Category', [t.category, t.function].filter(Boolean).join(' > ')),
      part('Analysis', t.helpdeskAnalysis),
      part('Root cause', t.rootCauseCategory),
      part('Resolution', [t.resolutionCode, t.rcaSolution].filter(Boolean).join(' - ')),
      `<p><i>From ticket ${escHtml(t.legacyRef ? `${t.id} (old no. ${t.legacyRef})` : String(t.id))}.</i></p>`,
    ].join('');
    try {
      await saveArticle({ category: t.category || 'General', folder: t.applicationName || 'General', title: t.subject.slice(0, 300), body, status: 'draft', tags: 'from-ticket' });
      setState('done');
    } catch (e) { setState(errText(e)); }
  };
  if (state === 'done') return <Notice tone="good">Saved as a draft article - review and publish it in Solutions.</Notice>;
  return (
    <div className="space-y-1">
      <Button className="w-full" onClick={save} disabled={state === 'busy'} data-testid="ticket-to-article">{state === 'busy' ? <Spinner /> : <BookPlus size={14} />} Save the fix as a knowledge article</Button>
      {state !== 'idle' && state !== 'busy' && <Notice onClose={() => setState('idle')}>{state}</Notice>}
    </div>
  );
}

/** Configuration items the ticket affects (CMDB): linked CIs, suggestions from the asset tag / server / application, search to link. */
export function CiCard({ ticketId }: { ticketId: number }) {
  const { can, go } = useSamadhan();
  const [data, setData] = useState<{ linked: CiRef[]; suggestions: CiRef[]; ready: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CiRef[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => { cmdbApi.forTicket(ticketId).then(setData).catch(() => setData({ linked: [], suggestions: [], ready: false })); }, [ticketId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const h = setTimeout(() => { cmdbApi.search(q).then(setHits).catch(() => setHits([])); }, 250);
    return () => clearTimeout(h);
  }, [q]);
  if (!data?.ready) return null;
  const edit = can('ticket.edit');
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); setQ(''); load(); } catch (e) { setError(errText(e)); } };
  const row = (c: CiRef, action?: React.ReactNode) => (
    <li key={c.id} className="flex items-start gap-2 rounded-lg bg-sunken px-2 py-1.5 text-2xs">
      <div className="min-w-0 flex-1"><div className="font-semibold"><span className="num">{c.code}</span> · {c.name}</div><div className="text-muted">{c.ciClass} · {c.status}{c.assignedName ? ` · ${c.assignedName}` : ''}</div></div>
      {action}
    </li>
  );
  const linkBtn = (c: CiRef) => <Button size="sm" onClick={() => act(() => cmdbApi.link(ticketId, c.id))}><Link2 size={12} /> Link</Button>;
  return (
    <Card title={<span className="inline-flex flex-wrap items-center gap-1.5"><Boxes size={15} className="text-accent" /> Configuration items <ItsmTag practice="config" /></span>}
      actions={<button type="button" className="text-2xs font-bold text-accent hover:underline" onClick={() => go('cmdb')}>CMDB</button>}>
      <div className="space-y-2 text-[13px]" data-testid="ci-card">
        {data.linked.length === 0 && <p className="text-2xs text-muted">No configuration item linked. Link the laptop, server or application this ticket is about - repeat issues on one item point to a problem.</p>}
        {data.linked.length > 0 && <ul className="space-y-1">{data.linked.map((c) => row(c, edit && <button type="button" aria-label={`Unlink ${c.code}`} className="text-faint hover:text-bad" onClick={() => act(() => cmdbApi.unlink(ticketId, c.id))}><X size={13} /></button>))}</ul>}
        {edit && data.suggestions.length > 0 && (
          <div><div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">Suggested</div>
            <ul className="space-y-1">{data.suggestions.map((c) => row(c, linkBtn(c)))}</ul></div>
        )}
        {edit && (
          <div>
            <input className={cx('h-9 w-full', inputBase)} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by asset tag, name, user, serial" aria-label="Find a configuration item" />
            {hits.length > 0 && <ul className="mt-1 space-y-1">{hits.filter((h) => !data.linked.some((l) => l.id === h.id)).map((c) => row(c, linkBtn(c)))}</ul>}
          </div>
        )}
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      </div>
    </Card>
  );
}
