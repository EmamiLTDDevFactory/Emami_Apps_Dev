'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Frown, Headset, LifeBuoy, Meh, Search, Send, Smile, type LucideIcon } from 'lucide-react';
import type { PortalApplication } from '@/lib/types';
import { portalArticles, portalConfig, portalCreate, portalUpload, portalCsat, portalCsatAnswer, portalStatus, type CsatSurvey, type PortalArticle, type PortalTicketStatus } from '@/lib/api';
import { BASE_PATH } from '@/lib/config';
import { fmtDateTime } from '@/lib/format';
import { Button, Field, Notice, Pill, Spinner, Tabs, cx, inputBase, inputCls, textareaCls } from './ui';
import { FileTray, usePendingFiles } from './Attachments';
import { blobOf, uploadName } from '@/lib/files';

const EMPTY = { name: '', email: '', phone: '', distributorCode: '', category: '', subject: '', description: '', website: '' };
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

/**
 * Requester portal: distributors and field staff raise a ticket or check its status without an Emami Apps login.
 * Replies come by email, like for tickets raised by email.
 */
export default function Portal() {
  const [tab, setTab] = useState<'new' | 'status'>('new');
  const [config, setConfig] = useState<Awaited<ReturnType<typeof portalConfig>> | null>(null);
  const [error, setError] = useState('');
  // A survey link from the ticket-closed email (?csat=<token>) shows the survey instead of the portal.
  const [csat, setCsat] = useState<{ token: string; home: string } | null>(null);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('csat');
    if (token) { setCsat({ token, home: window.location.pathname }); return; }
    portalConfig().then(setConfig).catch((e) => setError(e instanceof Error ? e.message : 'The helpdesk could not be reached.'));
  }, []);

  // Admin > General values when the server sends them; the built-in text otherwise.
  const helpdeskName = config?.helpdeskName?.trim() || 'Emami Service Desk';
  const supportEmail = config?.supportEmail?.trim() || 'emami.helpdesk@emamigroup.com';
  const intro = config?.intro?.trim() || '';

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-plum text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami" width={56} height={46} className="rounded-lg bg-white p-1" />
          <div>
            <h1 className="text-lg font-extrabold leading-tight">{helpdeskName}</h1>
            <p className="text-xs text-white/75">Support for mSecSales, SalesCode DMS / SFA and distributor systems</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {csat && <CsatSurveyCard token={csat.token} home={csat.home} />}
        {error && <Notice>{error}</Notice>}
        {!csat && !config && !error && <div className="grid h-40 place-items-center"><Spinner /></div>}
        {config && !config.enabled && (
          <div className="rounded-2xl border border-line bg-panel p-6 text-center shadow-card">
            <LifeBuoy size={28} className="mx-auto text-accent" />
            <h2 className="mt-2 text-base font-bold">The support portal is closed right now</h2>
            <p className="mt-1 text-sm text-muted">Please email <a className="font-semibold text-accent" href={`mailto:${supportEmail}`}>{supportEmail}</a> instead.</p>
          </div>
        )}
        {!csat && config?.enabled && (
          <>
            {intro && <p className="whitespace-pre-line text-sm text-muted">{intro}</p>}
            <Tabs label="Portal" value={tab} onChange={setTab} tabs={[{ id: 'new', label: 'Raise a ticket' }, { id: 'status', label: 'Check a ticket' }]} />
            {tab === 'new' ? <><ArticleSearch /><NewRequest categories={config.categories ?? []} files={config.files ?? null} applications={config.applications ?? []} categoriesByWorkspace={config.categoriesByWorkspace ?? {}} /></> : <StatusCheck />}
          </>
        )}
        <p className="pt-2 text-center text-2xs text-faint">You can also email <a className="text-accent" href={`mailto:${supportEmail}`}>{supportEmail}</a>. Please do not share passwords or OTPs in a ticket.</p>
      </main>
    </div>
  );
}

/** v7 Phase 5: "Which app or area?" - searchable, grouped by service desk. Shown only when the desks are open to the portal. */
function AppPicker({ apps, value, onChange }: { apps: PortalApplication[]; value: number | null; onChange: (id: number | null) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const shown = apps.filter((a) => !term || `${a.name} ${a.code} ${a.vendor ?? ''} ${a.workspaceName}`.toLowerCase().includes(term));
  const desks = [...new Map(shown.map((a) => [a.workspaceId, a.workspaceName])).entries()];
  return (
    <div className="space-y-2" data-testid="portal-app-picker">
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an app or area (e.g. DMS, VPN, laptop)" aria-label="Search applications" />
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {desks.map(([id, name]) => (
          <div key={id}>
            {desks.length > 1 && <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">{name}</div>}
            <div className="flex flex-wrap gap-1.5">
              {shown.filter((a) => a.workspaceId === id).map((a) => (
                <button key={a.id} type="button" aria-pressed={value === a.id} onClick={() => onChange(value === a.id ? null : a.id)}
                  className={cx('rounded-full border px-3 py-1 text-xs font-semibold transition', value === a.id ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' : 'border-line hover:border-accent/50')}>
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!shown.length && <p className="text-2xs text-muted">Nothing matches - pick &quot;Not sure&quot; and describe the issue.</p>}
      </div>
      <button type="button" onClick={() => onChange(null)} aria-pressed={value === null} className={cx('text-2xs font-bold', value === null ? 'text-accent' : 'text-muted hover:text-ink')}>Not sure - let the helpdesk decide</button>
    </div>
  );
}

function NewRequest({ categories: salesCategories, files, applications, categoriesByWorkspace }: { categories: string[]; files: { limits: { perFileMb: number; filesPerAction: number } } | null; applications: PortalApplication[]; categoriesByWorkspace: Record<string, string[]> }) {
  const [appId, setAppId] = useState<number | null>(null);
  const picked = applications.find((a) => a.id === appId) ?? null;
  const categories = picked ? (categoriesByWorkspace[String(picked.workspaceId)] ?? []) : salesCategories;
  const salesish = !picked || picked.workspaceKey === 'SEC_SALES';
  const tray = usePendingFiles(files?.limits.perFileMb ?? 5, files?.limits.filesPerAction ?? 5);
  const [fileNote, setFileNote] = useState('');
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: number; ref?: string; email: string } | null>(null);
  const set = (p: Partial<typeof EMPTY>) => setF((x) => ({ ...x, ...p }));
  const ready = f.name.trim() && EMAIL_RE.test(f.email.trim()) && f.subject.trim() && f.description.trim();

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const t = await portalCreate({ ...f, ...(picked ? { applicationId: picked.id } : {}) });
      // v7: files go up right after the ticket exists, with the one-ticket upload token from the answer.
      const failed: string[] = [];
      if (t.files && t.id > 0) {
        for (const p of tray.ready) {
          try { await portalUpload(t.id, t.files.uploadToken, blobOf(p), uploadName(p)); } catch (e) { failed.push(`${p.name} (${e instanceof Error ? e.message : 'not sent'})`); }
        }
      }
      setFileNote(failed.length ? `These files could not be added: ${failed.join(', ')}. Reply to the confirmation email to send them.` : '');
      tray.clear();
      setDone({ id: t.id, ref: t.ref, email: f.email.trim() });
      setF(EMPTY);
      setAppId(null);
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
        <h2 className="mt-2 text-lg font-extrabold">Ticket {done.id > 0 ? (done.ref && done.ref.includes('-') ? done.ref : `#${done.id}`) : ''} raised</h2>
        {fileNote && <div className="mt-2 text-left"><Notice tone="warn">{fileNote}</Notice></div>}
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
        {salesish && <Field label="Distributor (DB) code"><input className={inputCls} value={f.distributorCode} onChange={(e) => set({ distributorCode: e.target.value })} maxLength={50} /></Field>}
      </div>
      {applications.length > 1 && <Field label="Which app or area?"><AppPicker apps={applications} value={appId} onChange={(id) => { setAppId(id); set({ category: '' }); }} /></Field>}
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
        <textarea rows={6} className={textareaCls} value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={10000} onPaste={files ? tray.onPaste : undefined} />
      </Field>
      {files && (
        <div>
          <span className="mb-1 block text-2xs font-bold uppercase tracking-wide text-muted">Screenshots or files</span>
          <FileTray files={tray} maxFiles={files.limits.filesPerAction} label="Add files"
            hint={`Optional - up to ${files.limits.filesPerAction} files, ${files.limits.perFileMb} MB each. You can also paste a screenshot into the description box.`} />
        </div>
      )}
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
      // v7 Phase 3: "MSFA-100123" or "100123" (an older backend gets the number only).
      const ref = id.trim().toUpperCase();
      setT(await portalStatus(/^[A-Z0-9]{2,8}-\d+$/.test(ref) ? ref : Number(ref.replace(/\D/g, '')), email.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check the ticket.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <form className="grid gap-3 rounded-2xl border border-line bg-panel p-5 shadow-card sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Field label="Ticket number or reference"><input className={inputCls} value={id} onChange={(e) => setId(e.target.value)} placeholder="MSFA-100123 or 100123" /></Field>
        <Field label="Email you used"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Button type="submit" variant="primary" disabled={busy || !/\d/.test(id) || !EMAIL_RE.test(email.trim())}>{busy ? <Spinner /> : <Search size={14} />} Check</Button>
      </form>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {t && (
        <div className="rounded-2xl border border-line bg-panel p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Headset size={16} className="text-accent" />
            <span className="num text-sm font-bold text-muted">{t.ref && t.ref.includes('-') ? t.ref : `#${t.id}`}</span>
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

const RATINGS: { value: 1 | 2 | 3; label: string; icon: LucideIcon; tone: string }[] = [
  { value: 3, label: 'Extremely satisfied', icon: Smile, tone: 'text-good' },
  { value: 2, label: 'Neither satisfied nor dissatisfied', icon: Meh, tone: 'text-warn' },
  { value: 1, label: 'Extremely dissatisfied', icon: Frown, tone: 'text-bad' },
];

/** Satisfaction survey opened from the link in the ticket-closed email. No sign-in; the token identifies the ticket. */
function CsatSurveyCard({ token, home }: { token: string; home: string }) {
  const [survey, setSurvey] = useState<CsatSurvey | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rating, setRating] = useState<1 | 2 | 3 | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    portalCsat(token).then(setSurvey).catch((e) => setLoadError(e instanceof Error ? e.message : 'This survey link could not be opened.'));
  }, [token]);

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    setError('');
    try {
      await portalCsatAnswer(token, rating, comment.trim());
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your rating.');
    } finally {
      setBusy(false);
    }
  };

  const homeLink = <a href={home} className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft size={14} /> Go to the support portal</a>;
  const box = (children: ReactNode, border = 'border-line') => <div className={cx('rounded-2xl border bg-panel p-6 shadow-card', border)}>{children}</div>;

  if (loadError) {
    return box(
      <div className="text-center">
        <LifeBuoy size={28} className="mx-auto text-accent" />
        <h2 className="mt-2 text-base font-bold">We could not open this survey</h2>
        <p className="mt-1 text-sm text-muted">{loadError}</p>
        <p className="mt-1 text-sm text-muted">The link may have expired or been copied incompletely. Thank you for taking the time all the same.</p>
        <div className="mt-4">{homeLink}</div>
      </div>,
    );
  }
  if (!survey) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (done || survey.answered) {
    return box(
      <div className="text-center">
        <CheckCircle2 size={32} className="mx-auto text-good" />
        <h2 className="mt-2 text-lg font-extrabold">{done ? 'Thank you for your feedback' : 'Thank you - we already have your rating'}</h2>
        <p className="mt-1 text-sm text-muted">Ticket #{survey.ticketId} - {survey.subject}</p>
        <div className="mt-4">{homeLink}</div>
      </div>,
      'border-good/30',
    );
  }
  return box(
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Headset size={16} className="text-accent" />
          <span className="min-w-0 flex-1 font-semibold"><span className="num text-muted">Ticket #{survey.ticketId}</span> - {survey.subject}</span>
        </div>
        {survey.agentName && <p className="mt-1 text-xs text-muted">Handled by {survey.agentName}</p>}
      </div>
      <h2 className="text-base font-bold">{survey.question?.trim() || 'How would you rate your overall satisfaction for the resolution provided by the agent?'}</h2>
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Your rating">
        {RATINGS.map((r) => {
          const Icon = r.icon;
          const on = rating === r.value;
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setRating(r.value)}
              className={cx('flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-center text-sm font-semibold transition-all', on ? 'border-accent bg-accent/10 ring-2 ring-accent/20' : 'border-line hover:bg-sunken')}
            >
              <Icon size={36} className={r.tone} />
              {survey.labels?.[String(r.value) as '1' | '2' | '3']?.trim() || r.label}
            </button>
          );
        })}
      </div>
      <Field label="Comment (optional)" hint={`${comment.length}/1000`}>
        <textarea rows={4} className={textareaCls} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Anything you would like to tell us" />
      </Field>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" variant="primary" disabled={busy || !rating}>{busy ? <Spinner /> : <Send size={14} />} Submit</Button>
        {homeLink}
      </div>
    </form>,
  );
}

/** "Find an answer first": search the published help articles before raising a ticket. Bodies are shown as plain text. */
function ArticleSearch() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PortalArticle[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) { setItems(null); setError(''); setBusy(false); return; }
    let live = true;
    setBusy(true);
    const t = setTimeout(() => {
      portalArticles(term)
        .then((r) => { if (live) { setItems(r.slice(0, 8)); setError(''); } })
        .catch((e) => { if (live) { setItems(null); setError(e instanceof Error ? e.message : 'Could not search the articles.'); } })
        .finally(() => { if (live) setBusy(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  const term = q.trim();
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-panel p-4 shadow-card">
      <label className="relative block">
        <span className="sr-only">Search help articles</span>
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input className={cx(inputCls, 'pl-8 pr-9')} type="search" placeholder="Search help articles" value={q} onChange={(e) => setQ(e.target.value)} maxLength={200} />
        {busy && <Spinner className="absolute right-3 top-2.5 text-faint" />}
      </label>
      {term && error && <p className="text-2xs text-bad">{error}</p>}
      {term && !busy && items && items.length === 0 && <p className="text-xs text-muted">No articles found - raise a ticket below.</p>}
      {term && items && items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((a) => {
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : a.id)} className="flex w-full items-center gap-2 py-2 text-left text-sm font-semibold hover:text-accent">
                  {open ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                  <BookOpen size={14} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">{a.title}</span>
                </button>
                {open && <div className="whitespace-pre-wrap break-words pb-3 pl-6 text-[13px] text-ink">{a.body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
