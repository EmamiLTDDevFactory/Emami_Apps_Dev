'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Bot, Calendar, History, KeyRound, LogIn, LogOut, Menu, Play, Rocket, ScrollText, ShieldCheck, Stethoscope, User, X, type LucideIcon,
} from 'lucide-react';
import { ACTIVE, api, ApiError, BASE_PATH, signIn, type AppConfig, type AuditEntry, type HandlerStatus, type Capability, type ManifestInfo, type RunSummary } from '@/lib/api';
import { useScreenHistory } from '@/lib/useScreenHistory';
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
  'Create report ZEMAMI_MAT_STOCK in ZEMAMI that lists material stock by plant from MARD, with a selection screen for plant and material, ALV output and text elements',
  'Create class ZCL_EMAMI_DATE_UTIL in ZEMAMI with a static method that returns the number of working days between two dates for a factory calendar, with ABAP Unit tests',
  'Create function group ZEMAMI_FG and an RFC-enabled function module Z_EMAMI_GET_VENDOR that returns vendor name and city for a vendor number',
  'Create table ZEMAMI_LOG (client, id, created on/by, message) with a data element for the message, a lock object and a number range for the id',
];

const nameFromEmail = (e: string) => (e.split('@')[0] || e).split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');

export default function App() {
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking');
  const [error, setError] = useState<{ msg: string; status: number } | null>(null);
  const [email, setEmail] = useState('');
  const [view, setView] = useState<View>('agent');
  const [runId, setRunId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [menu, setMenu] = useState(false);
  const [today, setToday] = useState('');
  // In-app "Back": the screen is the section plus the open run, if any.
  const { back } = useScreenHistory({ view, runId }, (s) => {
    setView(s.view);
    setRunId(s.runId);
  });

  const loadCfg = useCallback(() => api.config().then((c) => setCfg(c)).catch(() => undefined), []);
  const [handler, setHandler] = useState<HandlerStatus | null>(null);
  const sapKey = cfg?.sap ? `${cfg.sap.user}@${cfg.sap.sid}` : '';
  const loadHandler = useCallback(() => {
    if (!sapKey) return setHandler(null);
    api.handler().then(setHandler).catch(() => setHandler(null));
  }, [sapKey]);
  useEffect(() => {
    if (view === 'agent' || view === 'deploy') loadHandler();
  }, [view, loadHandler]);
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
        <div className="flex bg-plum">
          <button type="button" onClick={back} className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back</button>
          <a href="/" className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep"><ArrowLeft size={14} /> Back to Emami Apps</a>
        </div>
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
          {cfg?.sap ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good/10 px-2.5 py-1 text-[11.5px] font-bold text-good" title={`Signed in to SAP ${cfg.sap.sid} as ${cfg.sap.user}${cfg.anthropicKeySet ? ' · Anthropic key set' : ''}`}>
              <KeyRound size={13} /> {cfg.sap.user} @ {cfg.sap.sid}{cfg.sap.client ? `/${cfg.sap.client}` : ''}
              <button type="button" className="ml-1 text-good/70 hover:text-bad" onClick={() => api.sapLogout().then(loadCfg)} aria-label="Sign out of SAP" title="Sign out of SAP"><LogOut size={13} /></button>
            </span>
          ) : cfg && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11.5px] font-bold text-warn"><KeyRound size={13} /> Not signed in to SAP</span>
          )}
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={email}><User size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{nameFromEmail(email)}</span></div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex"><Calendar size={13} className="text-accent" /><span className="text-[11.5px] font-bold">{today}</span></div>
        </header>
        <main className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3 lg:p-5">
          <div className="mx-auto max-w-6xl">
            {(view === 'agent' || view === 'deploy') && cfg && (!cfg.sap || (view === 'agent' && !cfg.anthropicKeySet)) && <SapLogin cfg={cfg} needKey={view === 'agent'} onDone={loadCfg} />}
            {(view === 'agent' || view === 'deploy') && cfg?.sap && handler && !handler.alive && <HandlerSetup h={handler} pkg={cfg.engine.allowedPackages.join(', ')} onRecheck={loadHandler} onBootstrap={view === 'agent' ? () => setView('deploy') : undefined} />}
            {view === 'agent' && cfg?.sap && cfg.anthropicKeySet && <AgentView cfg={cfg} ready={handler?.alive !== false} onStarted={openRun} />}
            {view === 'deploy' && cfg?.sap && <DeployView ready={handler?.alive !== false} onStarted={openRun} />}
            {view === 'runs' && (runId ? <RunPage runId={runId} onBack={() => setRunId(null)} onFinished={loadCfg} /> : <RunsList onOpen={openRun} />)}
            {view === 'health' && <HealthView cfg={cfg} onStarted={openRun} onSignedIn={loadCfg} />}
            {view === 'audit' && <AuditView />}
          </div>
        </main>
      </div>
    </div>
  );
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

/** Shown while the agent's SAP handler is not installed: tasks and real deploys would stop at sap_ping. */
function HandlerSetup({ h, pkg, onRecheck, onBootstrap }: { h: HandlerStatus; pkg: string; onRecheck: () => void; onBootstrap?: () => void }) {
  return (
    <section className="mb-3 rounded-2xl border border-warn/40 bg-warn/[0.06] p-4 shadow-card" role="alert">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 text-warn" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold">The agent&apos;s SAP handler is not set up on {h.sid} yet</h3>
          <p className="text-xs text-muted">{h.mode === 'http' ? <><span className="font-mono">{h.path}</span> does not answer for {h.user}.</> : <>The runner class ZCL_SRC_AGENT_RUN is not installed (no SICF node is needed).</>} Agent runs and real deploys stay blocked until it is. One-time setup:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>Deploy → <strong>Bootstrap</strong> with <strong>Dry run off</strong> - creates the agent classes in {pkg} (reuse your transport in the Transport box).</li>
            {h.mode === 'http' && <li>SICF: create service <span className="font-mono">{h.path}</span>, handler class ZCL_SRC_AGENT_HTTP, and activate it.</li>}
          </ol>
        </div>
        <div className="flex gap-2">
          {onBootstrap && <Button onClick={onBootstrap}><Rocket size={14} /> Go to Bootstrap</Button>}
          <Button onClick={onRecheck}><Activity size={14} /> Check again</Button>
        </div>
      </div>
    </section>
  );
}

function AgentView({ cfg, ready, onStarted }: { cfg: AppConfig; ready: boolean; onStarted: (id: string) => void }) {
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [showCtx, setShowCtx] = useState(false);
  const { busy, err, start } = useStart(onStarted);
  const e = cfg?.engine;
  return (
    <>
      <Card title="What should the agent build or fix?">
        <textarea
          className={cx(inputBase, 'h-36 w-full resize-y py-2 leading-relaxed')}
          placeholder="Describe any SAP development object: report, class, interface, function module, include, CDS view, table, structure, data element, domain, lock object, number range, message class... e.g. Create class ZCL_EMAMI_PRICE_UTIL in ZEMAMI with a method that converts a price per 1000 to a price per piece, with ABAP Unit tests"
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
          <Button variant="primary" className="px-5" disabled={busy || !ready || task.trim().length < 10} onClick={() => start({ kind: 'task', task, context })}><Play size={14} /> Run agent</Button>
          {e && <span className="text-xs text-muted">On SAP {cfg.sap?.sid} (<span className="font-mono">{e.host}</span>, client {e.client}) as <strong>{cfg.sap?.user}</strong> · package {e.allowedPackages.join(', ')} · max {e.maxSteps} steps · approvals: {e.approval}</span>}
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

function DeployView({ ready, onStarted }: { ready: boolean; onStarted: (id: string) => void }) {
  const [list, setList] = useState<ManifestInfo[]>([]);
  const [sel, setSel] = useState('');
  const [opts, setOpts] = useState({ dryRun: true, keepGoing: false, repair: false, agent: false, only: '', transport: '' });
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
      <BootstrapCard start={start} busy={busy} />
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
          <label className="text-xs font-bold text-muted">Existing transport (optional)
            <input className={cx(inputCls, 'mt-1 font-mono uppercase')} placeholder="e.g. EDSK900123 - blank creates one" value={opts.transport} onChange={(e) => setOpts({ ...opts, transport: e.target.value })} />
          </label>
          <Button variant="primary" disabled={busy || !sel || (!ready && !opts.dryRun) || !/^([A-Za-z0-9]{3}K[A-Za-z0-9]{6})?$/i.test(opts.transport.trim())} onClick={() => start({ kind: 'deploy', manifest: sel, ...opts, transport: opts.transport.trim().toUpperCase() })}><Rocket size={14} /> {opts.dryRun ? 'Show the plan' : 'Deploy to SAP DEV'}</Button>
          {!opts.dryRun && <p className="text-xs text-warn">This creates and activates objects on the SAP development system.</p>}
          {startErr && <p className="text-sm text-bad" role="alert">{startErr}</p>}
        </div>
      </Card>
    </div>
  );
}

/** One-time per system: installs the agent's SAP-side task handler (classes ZCL_SRC_AGENT_TASKS and
 * ZCL_SRC_AGENT_HTTP in the allowed package, on a new transport) through ADT. */
function BootstrapCard({ start, busy }: { start: (b: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const [dry, setDry] = useState(true);
  const [tr, setTr] = useState('');
  const trOk = /^([A-Za-z0-9]{3}K[A-Za-z0-9]{6})?$/i.test(tr.trim());
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent/[0.04] p-4 shadow-card lg:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white"><Rocket size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-extrabold">Bootstrap: install the agent&apos;s handler (once per system)</h3>
          <p className="text-xs text-muted">
            Creates the package if missing, one transport, and classes ZCL_SRC_AGENT_TASKS / ZCL_SRC_AGENT_HTTP / ZCL_SRC_AGENT_RUN, then activates them - under your SAP user. Afterwards a
            nothing else is needed: system and package are built in, and no SICF node is used.
          </p>
        </div>
        <input className={cx(inputBase, 'w-44 font-mono uppercase')} placeholder="Transport (optional)" value={tr} onChange={(e) => setTr(e.target.value)} aria-label="Existing transport request" title="Use an existing workbench request (e.g. EDSK900123) instead of creating a new one" />
        <Toggle label="Dry run" checked={dry} onChange={setDry} />
        <Button variant="primary" disabled={busy || !trOk} onClick={() => start({ kind: 'bootstrap', dryRun: dry, transport: tr.trim().toUpperCase() })}><Play size={14} /> {dry ? 'Show bootstrap plan' : 'Run bootstrap on SAP'}</Button>
      </div>
    </section>
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

function HealthView({ cfg, onStarted, onSignedIn }: { cfg: AppConfig | null; onStarted: (id: string) => void; onSignedIn: () => void }) {
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
      {cfg && !cfg.sap && <SapLogin cfg={cfg} needKey={false} onDone={onSignedIn} />}
      <Card title="Connection" actions={<Button variant="primary" disabled={busy || !cfg?.sap} onClick={() => start({ kind: 'doctor' })}><Stethoscope size={14} /> Run doctor</Button>}>
        {err && <p className="mb-2 text-sm text-bad">{err}</p>}
        {e ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {row('SAP host', <span className="break-all font-mono text-xs">{e.host || '—'}</span>)}
            {row('Client', e.client || '—')}
            {row('Your SAP login', cfg?.sap ? <Pill tone="good">{cfg.sap.user} @ {cfg.sap.sid}</Pill> : <Pill tone="warn">not signed in</Pill>)}
            {row('Your Anthropic key', cfg?.anthropicKeySet ? <Pill tone="good">set for this session</Pill> : <Pill tone="warn">not set</Pill>)}
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

/** SAP user ID + password for the development system, and the Anthropic API key. Sent once to the
 * SAP Agent server, which checks them against SAP and Anthropic and keeps them in memory for this
 * session only (never stored, never sent back). */
function SapLogin({ cfg, needKey, onDone }: { cfg: AppConfig; needKey: boolean; onDone: () => void }) {
  const [user, setUser] = useState(cfg.sap?.user ?? '');
  const [pw, setPw] = useState('');
  const [key, setKey] = useState('');
  const [client, setClient] = useState(cfg.sap?.client || cfg.engine.client || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sid = cfg.engine.allowedSids.join('/') || 'development';
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.sapLogin(user.trim(), pw, key.trim(), client.trim());
      setPw('');
      setKey('');
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-auto mb-4 max-w-xl rounded-2xl border border-line bg-panel p-6 shadow-card">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white"><KeyRound size={18} /></span>
        <div>
          <h2 className="text-[15px] font-extrabold">Sign in to SAP {sid}</h2>
          <p className="text-xs text-muted">{cfg.sap && needKey ? 'Add your Anthropic API key to run the agent (sign in again with your SAP password).' : 'The agent works on SAP with your own user and authorisations.'}</p>
        </div>
      </div>
      <form className="grid gap-3" onSubmit={submit}>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className="text-xs font-bold text-muted">SAP user ID
            <input className={cx(inputCls, 'mt-1 uppercase')} autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} required maxLength={40} />
          </label>
          <label className="text-xs font-bold text-muted">Client
            <input className={cx(inputCls, 'mt-1 font-mono')} inputMode="numeric" placeholder="default" pattern="\d{3}" maxLength={3} value={client} onChange={(e) => setClient(e.target.value.replace(/\D/g, ''))} />
          </label>
        </div>
        <label className="text-xs font-bold text-muted">SAP password
          <input className={cx(inputCls, 'mt-1')} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </label>
        <label className="text-xs font-bold text-muted">Anthropic API key {needKey ? '' : '(needed for agent tasks and repair)'}
          <input className={cx(inputCls, 'mt-1 font-mono')} type="password" autoComplete="off" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} required={needKey} />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !user || !pw || (needKey && !key)}><LogIn size={14} /> {busy ? 'Checking with SAP…' : 'Sign in'}</Button>
        {err && <p className="text-sm text-bad" role="alert">{err}</p>}
        <p className="text-[11px] leading-snug text-faint">
          Checked against SAP {sid} and Anthropic, then kept only in the SAP Agent server&apos;s memory for this session - never stored on disk, never shown again, cleared when you
          sign out of SAP or the session ends. Every change is audited as {cfg.user} (as your SAP user).
        </p>
      </form>
    </section>
  );
}

export { ACTIVE };
