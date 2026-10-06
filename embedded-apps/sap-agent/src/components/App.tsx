'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Bot, Calendar, History, Menu, Play, Rocket, ScrollText, ShieldCheck, Stethoscope, User, X, type LucideIcon,
} from 'lucide-react';
import { ACTIVE, api, ApiError, BASE_PATH, signIn, type AuditEntry, type Capability, type EngineConfig, type ManifestInfo, type RunSummary } from '@/lib/api';
import RunView, { StatusPill } from './RunView';
import { Button, Card, cx, Empty, inputBase, inputCls, Pill, Toggle } from './ui';

type View = 'agent' | 'deploy' | 'runs' | 'health' | 'audit';
const NAV: { id: View; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'agent', label: 'Agent', hint: 'Describe a task in words', icon: Bot },
  { id: 'deploy', label: 'Deploy', hint: 'Run a project manifest', icon: Rocket },
  { id: 'runs', label: 'Runs', hint: 'History and live runs', icon: History },
  { id: 'health', label: 'Health', hint: 'Connection, doctor, capabilities', icon: Stethoscope },
  { id: 'audit', label: 'Audit log', hint: 'Every tool call', icon: ScrollText },
];

const EXAMPLES = [
  'Add a method get_open_rfq_count to ZCL_SRC_RFQ_SRV that counts RFQs with status open, with an ABAP Unit test',
  'Create report ZSRC_RFQ_AGING that lists open RFQs older than 30 days, with a selection screen for plant and text elements',
  'ST22 shows a dump in ZCL_SRC_AUC_SRV->place_bid when two vendors bid in the same millisecond. Find and fix it',
];

const nameFromEmail = (e: string) => (e.split('@')[0] || e).split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

export default function App() {
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>('agent');
  const [runId, setRunId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<{ engine: EngineConfig; anthropicKeySet: boolean; active: RunSummary | null } | null>(null);
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');

  const loadCfg = useCallback(() => api.config().then((c) => setCfg(c)).catch(() => undefined), []);
  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }));
    signIn()
      .then((s) => {
        setEmail(s.email);
        setState('ready');
        void loadCfg();
      })
      .catch((e: ApiError) => {
        setError({ msg: e.message, status: e.status });
        setState('error');
      });
  }, [loadCfg]);

  const openRun = (id: string) => {
    setRunId(id);
    setView('runs');
  };

  if (state === 'checking') return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  if (state === 'error' && error) {
    return (
      <div className="flex min-h-screen flex-col bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <div className="grid flex-1 place-items-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={140} height={116} className="mx-auto" />
            <AlertTriangle size={26} className="mx-auto mt-4 text-warn" />
            <h1 className="mt-2 text-lg font-extrabold">{error.status === 403 ? 'Admins only' : "Can't open SAP Agent"}</h1>
            <p className="mt-1 text-sm text-muted">{error.msg}</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
          </div>
        </div>
      </div>
    );
  }

  const e = cfg?.engine;
  return (
    <div className="flex h-screen overflow-clip bg-plum">
      {menu && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm lg:hidden" onClick={() => setMenu(false)} />}
      <aside className={cx('z-40 flex w-64 shrink-0 flex-col border-r border-line bg-panel transition-transform', 'fixed inset-y-0 left-0 lg:static', menu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}>
        <div className="flex items-center justify-center border-b border-line px-4 pb-5 pt-5">
          <button type="button" className="absolute right-3 top-3 p-1 text-muted lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X size={18} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Sections">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={view === n.id ? 'page' : undefined}
              onClick={() => { setView(n.id); setMenu(false); if (n.id !== 'runs') setRunId(null); }}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', view === n.id ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
            >
              <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', view === n.id ? 'bg-gradient-to-br from-accent to-accent-deep text-white' : 'bg-sunken text-accent')}><n.icon size={16} /></span>
              <span><span className="block text-sm font-bold">{n.label}</span><span className="block text-[11px] text-muted">{n.hint}</span></span>
            </button>
          ))}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Writes to the SAP <strong>development</strong> system only. The guard, not the model, decides what is allowed; every call is audited under your name.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to Emami Apps</a>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5">
          <button type="button" className="p-1 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className="text-[15px] font-extrabold">SAP Agent</h1>
          {e && (
            <span className="hidden items-center gap-1 rounded-full bg-good/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-good ring-1 ring-good/30 sm:inline-flex" title={`${e.host} client ${e.client}`}>
              <ShieldCheck size={11} /> DEV {e.allowedSids.join('/') || '?'} · {e.readOnly ? 'read-only' : 'write'}
            </span>
          )}
          {cfg?.active && (
            <button type="button" onClick={() => openRun(cfg.active!.id)} className="hidden items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold text-accent md:inline-flex">
              <Activity size={12} /> run active
            </button>
          )}
          <div className="flex-1" />
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={email}><User size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{nameFromEmail(email)}</span></div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className="mx-auto max-w-6xl">
            {view === 'agent' && <AgentView cfg={cfg} onStarted={openRun} />}
            {view === 'deploy' && <DeployView onStarted={openRun} />}
            {view === 'runs' && (runId ? <RunPage runId={runId} onBack={() => setRunId(null)} onFinished={loadCfg} /> : <RunsList onOpen={openRun} />)}
            {view === 'health' && <HealthView cfg={cfg} onStarted={openRun} />}
            {view === 'audit' && <AuditView />}
          </div>
        </main>
      </div>
    </div>
  );
}

function Banner({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'bad' }) {
  return <div className={cx('mb-3 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm', tone === 'bad' ? 'border-bad/30 bg-bad/[0.05] text-bad' : 'border-warn/30 bg-warn/[0.06]')}><AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /><div>{children}</div></div>;
}

function useStart(onStarted: (id: string) => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const start = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.start(body);
      onStarted(r.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, start };
}

function AgentView({ cfg, onStarted }: { cfg: { engine: EngineConfig; anthropicKeySet: boolean; active: RunSummary | null } | null; onStarted: (id: string) => void }) {
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [showCtx, setShowCtx] = useState(false);
  const { busy, err, start } = useStart(onStarted);
  const e = cfg?.engine;
  return (
    <>
      {cfg && !cfg.anthropicKeySet && <Banner tone="bad">The server has no ANTHROPIC_API_KEY, so agent tasks cannot run yet. Deploy (without repair) and Health still work.</Banner>}
      {e && !e.passwordSet && <Banner tone="bad">The server has no SAP password for {e.user || 'the agent user'}; nothing can reach SAP yet.</Banner>}
      <Card title="What should the agent build or fix?">
        <textarea
          className={cx(inputBase, 'h-36 w-full resize-y py-2 leading-relaxed')}
          placeholder="e.g. Create class ZCL_SRC_PRICE_UTIL in package ZSRC with a method that converts a price per 1000 to a price per piece, and an ABAP Unit test"
          value={task}
          onChange={(ev) => setTask(ev.target.value)}
          aria-label="Task"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" onClick={() => setTask(x)} className="max-w-full truncate rounded-full border border-line bg-panel px-3 py-1 text-[11.5px] font-semibold text-muted hover:border-accent/50 hover:text-accent" title={x}>{x.slice(0, 70)}…</button>
          ))}
        </div>
        <button type="button" className="mt-3 text-xs font-bold text-accent hover:underline" onClick={() => setShowCtx(!showCtx)}>{showCtx ? 'Hide' : 'Add'} project context (optional)</button>
        {showCtx && <textarea className={cx(inputBase, 'mt-2 h-28 w-full resize-y py-2 text-xs')} placeholder="Background the agent should know: design notes, naming, the tables involved…" value={context} onChange={(ev) => setContext(ev.target.value)} aria-label="Project context" />}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Button variant="primary" className="px-5" disabled={busy || task.trim().length < 10} onClick={() => start({ kind: 'task', task, context })}><Play size={14} /> Run agent</Button>
          {e && <span className="text-xs text-muted">On <span className="font-mono">{e.host}</span> client {e.client} as {e.user} · packages {e.allowedPackages.join(', ')} · max {e.maxSteps} steps · approvals: {e.approval}</span>}
          {err && <span className="text-sm text-bad" role="alert">{err}</span>}
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">
        The agent searches, reads the source, writes the change, syntax-checks, activates and runs ABAP Unit, fixing errors as it goes. It stops after the same failing call three times
        or at the step limit. It never releases transports; risky actions wait for your typed approval.
      </p>
    </>
  );
}

function DeployView({ onStarted }: { onStarted: (id: string) => void }) {
  const [list, setList] = useState<ManifestInfo[]>([]);
  const [sel, setSel] = useState('');
  const [opts, setOpts] = useState({ dryRun: true, keepGoing: false, repair: false, agent: false, only: '' });
  const [err, setErr] = useState('');
  const { busy, err: startErr, start } = useStart(onStarted);
  useEffect(() => {
    api.manifests().then((m) => {
      setList(m.manifests);
      setSel(m.manifests[0]?.path ?? '');
    }).catch((e) => setErr(e.message));
  }, []);
  const m = list.find((x) => x.path === sel);
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <Card title="Project manifest">
        {err && <p className="text-sm text-bad">{err}</p>}
        {list.length === 0 && !err && <Empty title="No manifests on the server">Add one under server/projects/ (see the README).</Empty>}
        {list.length > 0 && (
          <>
            <select className={inputCls} value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Manifest">
              {list.map((x) => <option key={x.path} value={x.path}>{x.name} · {x.path}</option>)}
            </select>
            {m && (
              <ol className="mt-3 divide-y divide-line/70 rounded-xl border border-line">
                {m.steps.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                    <span className="w-6 text-right text-xs text-faint">{i + 1}</span>
                    <span className="font-mono text-xs font-bold">{s.id}</span>
                    <Pill>{s.type}</Pill>
                    <span className="truncate text-xs text-muted">{s.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Card>
      <Card title="Run">
        <div className="flex flex-col gap-3">
          <Toggle label="Dry run (shows the plan, touches nothing)" checked={opts.dryRun} onChange={(v) => setOpts({ ...opts, dryRun: v })} />
          <Toggle label="Keep going after a failed step" checked={opts.keepGoing} onChange={(v) => setOpts({ ...opts, keepGoing: v })} />
          <Toggle label="Let the agent repair failing steps" checked={opts.repair} onChange={(v) => setOpts({ ...opts, repair: v })} />
          <Toggle label="Let the agent run 'agent' steps" checked={opts.agent} onChange={(v) => setOpts({ ...opts, agent: v })} />
          <label className="text-xs font-bold text-muted">Only one step
            <select className={cx(inputCls, 'mt-1')} value={opts.only} onChange={(e) => setOpts({ ...opts, only: e.target.value })}>
              <option value="">All steps</option>
              {m?.steps.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
          </label>
          <Button variant="primary" disabled={busy || !sel} onClick={() => start({ kind: 'deploy', manifest: sel, ...opts })}><Rocket size={14} /> {opts.dryRun ? 'Show the plan' : 'Deploy to SAP DEV'}</Button>
          {!opts.dryRun && <p className="text-xs text-warn">This creates and activates objects on the SAP development system.</p>}
          {startErr && <p className="text-sm text-bad" role="alert">{startErr}</p>}
        </div>
      </Card>
    </div>
  );
}

function RunsList({ onOpen }: { onOpen: (id: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => api.runs().then((r) => setRuns(r.runs)).catch((e) => setErr(e.message));
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (err) return <p className="text-sm text-bad">{err}</p>;
  if (!runs) return <p className="text-sm text-muted">Loading…</p>;
  if (!runs.length) return <Empty title="No runs yet" icon="▶">Start one from Agent, Deploy or Health.</Empty>;
  return (
    <Card title={`Runs (${runs.length})`} bodyClass="p-0">
      <table className="w-full text-[13px]">
        <thead className="text-[11px] font-bold uppercase tracking-wide text-faint"><tr><th className="px-4 py-2 text-left">Started</th><th className="text-left">Kind</th><th className="text-left">Task / manifest</th><th className="text-left">By</th><th className="px-4 text-left">Status</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="cursor-pointer border-t border-line/70 hover:bg-accent/[0.04]" onClick={() => onOpen(r.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.id)}>
              <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{new Date(r.created).toLocaleString('en-IN')}</td>
              <td><Pill>{r.kind}</Pill></td>
              <td className="max-w-[420px] truncate" title={r.title}>{r.title}</td>
              <td className="text-xs text-muted">{r.owner}</td>
              <td className="px-4"><StatusPill s={r.status} />{r.pendingApproval && <span className="ml-1 text-xs text-warn">approval</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RunPage({ runId, onBack, onFinished }: { runId: string; onBack: () => void; onFinished: () => void }) {
  return (
    <>
      <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><ArrowLeft size={13} /> All runs</button>
      <RunView runId={runId} onFinished={onFinished} />
    </>
  );
}

function HealthView({ cfg, onStarted }: { cfg: { engine: EngineConfig; anthropicKeySet: boolean; active: RunSummary | null } | null; onStarted: (id: string) => void }) {
  const [caps, setCaps] = useState<Capability[]>([]);
  const { busy, err, start } = useStart(onStarted);
  useEffect(() => {
    api.capabilities().then((c) => setCaps(c.capabilities)).catch(() => undefined);
  }, []);
  const e = cfg?.engine;
  const row = (k: string, v: ReactNode) => (
    <div key={k}><dt className="text-[10px] font-extrabold uppercase tracking-wide text-faint">{k}</dt><dd className="text-sm">{v}</dd></div>
  );
  return (
    <div className="grid gap-3">
      <Card title="Connection" actions={<Button variant="primary" disabled={busy} onClick={() => start({ kind: 'doctor' })}><Stethoscope size={14} /> Run doctor</Button>}>
        {err && <p className="mb-2 text-sm text-bad">{err}</p>}
        {e ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {row('SAP host', <span className="break-all font-mono text-xs">{e.host || '—'}</span>)}
            {row('Client / user', `${e.client} / ${e.user || '—'}`)}
            {row('Password on server', e.passwordSet ? <Pill tone="good">set</Pill> : <Pill tone="bad">missing</Pill>)}
            {row('Anthropic key', cfg?.anthropicKeySet ? <Pill tone="good">set</Pill> : <Pill tone="bad">missing</Pill>)}
            {row('Allowed systems', e.allowedSids.join(', ') || <span className="text-bad">none set</span>)}
            {row('Allowed packages', e.allowedPackages.join(', '))}
            {row('Mode', e.readOnly ? 'read-only' : 'read and write')}
            {row('Transport release', e.allowRelease ? 'allowed with approval' : 'off (a human releases)')}
            {row('Approvals', e.approval)}
            {row('Model', <span className="font-mono text-xs">{e.model}</span>)}
            {row('Step limit', e.maxSteps)}
            {row('Task handler', <span className="font-mono text-xs">{e.handlerPath}</span>)}
          </dl>
        ) : <p className="text-sm text-muted">Loading…</p>}
      </Card>
      <Card title="What the agent can build" bodyClass="p-0">
        <table className="w-full text-[13px]">
          <thead className="text-[11px] font-bold uppercase tracking-wide text-faint"><tr><th className="px-4 py-2 text-left">Capability</th><th className="text-left">Tier</th><th className="text-left">Level</th><th className="px-4 text-left">How</th></tr></thead>
          <tbody>
            {caps.map((c) => (
              <tr key={c.key} className="border-t border-line/70 align-top">
                <td className="px-4 py-1.5 font-mono text-xs font-bold">{c.key}</td>
                <td className="text-xs">{c.tier}</td>
                <td><Pill tone={c.maturity === 'automated' ? 'good' : c.maturity === 'assisted' ? 'accent' : 'warn'}>{c.maturity}</Pill></td>
                <td className="px-4 py-1.5 text-xs text-muted">{c.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AuditView() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.audit(300).then((r) => setRows(r.entries)).catch((e) => setErr(e.message));
  }, []);
  if (err) return <p className="text-sm text-bad">{err}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading…</p>;
  if (!rows.length) return <Empty title="The audit log is empty" icon="≡">Every tool call, approval and deploy step is written here (secrets masked).</Empty>;
  return (
    <Card title={`Audit log · latest ${rows.length}`} bodyClass="p-0">
      <div className="scroll-thin max-h-[75vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel text-[11px] font-bold uppercase tracking-wide text-faint"><tr><th className="px-4 py-2 text-left">Time</th><th className="text-left">Actor</th><th className="text-left">Event</th><th className="px-4 text-left">Detail</th></tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const { ts, actor, event, ...rest } = r;
              return (
                <tr key={i} className="border-t border-line/70 align-top">
                  <td className="whitespace-nowrap px-4 py-1.5 font-mono">{ts}</td>
                  <td className="max-w-[220px] truncate" title={actor}>{actor}</td>
                  <td><Pill>{event}</Pill></td>
                  <td className="px-4 py-1.5 font-mono text-[11px] text-muted"><span className="line-clamp-2 break-all">{JSON.stringify(rest)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export { ACTIVE };
