'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Headset, LifeBuoy, Search, Send } from 'lucide-react';
import { portalConfig, portalCreate, portalStatus, type PortalTicketStatus } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { fmtDateTime } from '@/lib/format';
import { Button, Field, Notice, Pill, Spinner, Tabs, cx, inputBase, inputCls, textareaCls } from './ui';

const EMPTY = { name: '', email: '', phone: '', distributorCode: '', category: '', subject: '', description: '', website: '' };
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

/**
 * Requester portal: distributors and field staff raise a ticket or check its status without an Emami Apps login.
 * Replies come by email, like for tickets raised by email.
 */
export default function Portal() {
  const [tab, setTab] = useState<'new' | 'status'>('new');
  const [config, setConfig] = useState<{ enabled: boolean; categories?: string[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    portalConfig().then(setConfig).catch((e) => setError(e instanceof Error ? e.message : 'The helpdesk could not be reached.'));
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-plum text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami" width={56} height={46} className="rounded-lg bg-white p-1" />
          <div>
            <h1 className="text-lg font-extrabold leading-tight">Emami Secondary Helpdesk</h1>
            <p className="text-xs text-white/75">Support for mSecSales, SalesCode DMS / SFA and distributor systems</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {error && <Notice>{error}</Notice>}
        {!config && !error && <div className="grid h-40 place-items-center"><Spinner /></div>}
        {config && !config.enabled && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card">
            <LifeBuoy size={28} className="mx-auto text-accent" />
            <h2 className="mt-2 text-base font-bold">The support portal is closed right now</h2>
            <p className="mt-1 text-sm text-muted">Please email <a className="font-semibold text-accent" href="mailto:emami.helpdesk@emamigroup.com">emami.helpdesk@emamigroup.com</a> instead.</p>
          </div>
        )}
        {config?.enabled && (
          <>
            <Tabs label="Portal" value={tab} onChange={setTab} tabs={[{ id: 'new', label: 'Raise a ticket' }, { id: 'status', label: 'Check a ticket' }]} />
            {tab === 'new' ? <NewRequest categories={config.categories ?? []} /> : <StatusCheck />}
          </>
        )}
        <p className="pt-2 text-center text-2xs text-faint">You can also email <a className="text-accent" href="mailto:emami.helpdesk@emamigroup.com">emami.helpdesk@emamigroup.com</a>. Please do not share passwords or OTPs in a ticket.</p>
      </main>
    </div>
  );
}

function NewRequest({ categories }: { categories: string[] }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: number; email: string } | null>(null);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const ready = f.name.trim() && EMAIL_RE.test(f.email.trim()) && f.subject.trim() && f.description.trim();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const t = await portalCreate(f);
      setDone({ id: t.id, email: f.email.trim() });
      setF(EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-good/30 bg-panel p-6 text-center shadow-card">
        <CheckCircle2 size={32} className="mx-auto text-good" />
        <h2 className="mt-2 text-lg font-extrabold">Ticket {done.id > 0 ? `#${done.id}` : ''} raised</h2>
        <p className="mt-1 text-sm text-muted">We have emailed a confirmation to {done.email}. The helpdesk team will reply there; keep the ticket number in the subject when you write again.</p>
        <Button className="mt-4" onClick={() => setDone(null)}>Raise another ticket</Button>
      </div>
    );
  }
  return (
    <form className="space-y-3 rounded-2xl border border-line bg-panel p-5 shadow-card" onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name" required><input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" maxLength={200} /></Field>
        <Field label="Email" required hint="Replies are sent here"><input className={inputCls} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" maxLength={320} /></Field>
        <Field label="Mobile number"><input className={inputCls} type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" maxLength={20} /></Field>
        <Field label="Distributor (DB) code"><input className={inputCls} value={f.distributorCode} onChange={(e) => set({ distributorCode: e.target.value })} maxLength={50} /></Field>
      </div>
      {categories.length > 0 && (
        <Field label="What is it about?">
          <select className={cx('h-9 w-full', inputBase)} value={f.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">Not sure</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      )}
      <Field label="Subject" required><input className={inputCls} value={f.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={300} /></Field>
      <Field label="Describe the issue" required hint="What happened, on which app / screen, and any error message">
        <textarea rows={6} className={textareaCls} value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={10000} />
      </Field>
      {/* Left empty by people; bots that fill every field are turned away quietly. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" value={f.website} onChange={(e) => set({ website: e.target.value })} />
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <Button type="submit" variant="primary" disabled={busy || !ready}>{busy ? <Spinner /> : <Send size={14} />} Submit ticket</Button>
    </form>
  );
}

function StatusCheck() {
  const [id, setId] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [t, setT] = useState<PortalTicketStatus | null>(null);
  const check = async () => {
    setBusy(true);
    setError('');
    setT(null);
    try {
      setT(await portalStatus(Number(id.replace(/\D/g, '')), email.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the ticket.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <form className="grid gap-3 rounded-2xl border border-line bg-panel p-5 shadow-card sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Field label="Ticket number"><input className={inputCls} inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} placeholder="100123" /></Field>
        <Field label="Email you used"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={busy || !/\d/.test(id) || !EMAIL_RE.test(email.trim())}>{busy ? <Spinner /> : <Search size={14} />} Check</Button>
      </form>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {t && (
        <div className="rounded-2xl border border-line bg-panel p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Headset size={16} className="text-accent" />
            <span className="num text-sm font-bold text-muted">#{t.id}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{t.subject}</span>
            <Pill tone={t.isClosed ? 'neutral' : t.isResolved ? 'good' : 'accent'}>{t.status}</Pill>
          </div>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div><dt className="font-bold uppercase tracking-wide text-muted">Raised</dt><dd className="num">{fmtDateTime(t.createdAt)}</dd></div>
            <div><dt className="font-bold uppercase tracking-wide text-muted">Last update</dt><dd className="num">{fmtDateTime(t.lastActivityAt)}</dd></div>
            {t.resolvedAt && <div><dt className="font-bold uppercase tracking-wide text-muted">Resolved</dt><dd className="num">{fmtDateTime(t.resolvedAt)}</dd></div>}
          </dl>
          <p className="mt-3 text-2xs text-muted">The helpdesk&apos;s replies are in your email. To add information, reply to that email.</p>
        </div>
      )}
    </div>
  );
}
