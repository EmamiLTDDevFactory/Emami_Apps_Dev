'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, CircleDashed, ClipboardList, Hand, Square, Terminal, Wrench, XCircle } from 'lucide-react';
import { ACTIVE, api, followRun, type RunDetail, type RunEvent, type RunStatus } from '@/lib/api';
import { Button, cx, inputCls, Pill } from './ui';

const STATUS: Record<RunStatus, { label: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  running: { label: 'Running', tone: 'accent' },
  waiting_approval: { label: 'Waiting for your approval', tone: 'warn' },
  done: { label: 'Done', tone: 'good' },
  failed: { label: 'Failed', tone: 'bad' },
  stopped: { label: 'Stopped', tone: 'warn' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function StatusPill({ s }: { s: RunStatus }) {
  return <Pill tone={STATUS[s].tone}>{STATUS[s].label}</Pill>;
}

const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const J = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function ToolCard({ call, result }: { call: RunEvent; result?: RunEvent }) {
  const [open, setOpen] = useState(false);
  const ok = result ? (result.ok as boolean) : undefined;
  return (
    <div className={cx('rounded-xl border bg-panel', ok === false ? 'border-bad/40' : 'border-line')}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <ChevronRight size={14} className={cx('shrink-0 text-faint transition-transform', open && 'rotate-90')} />
        <Wrench size={14} className="shrink-0 text-accent" />
        <span className="font-mono text-xs font-bold">{String(call.name)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{J(call.args).replace(/\s+/g, ' ').slice(0, 140)}</span>
        {result === undefined ? <CircleDashed size={15} className="animate-spin text-faint" /> : ok ? <CheckCircle2 size={15} className="text-good" /> : <XCircle size={15} className="text-bad" />}
      </button>
      {open && (
        <div className="grid gap-2 border-t border-line px-3 py-2 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">Arguments</p>
            <pre className="scroll-thin max-h-72 overflow-auto rounded-lg bg-sunken p-2 text-[11px] leading-relaxed">{J(call.args)}</pre>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-faint">Result</p>
            <pre className={cx('scroll-thin max-h-72 overflow-auto rounded-lg p-2 text-[11px] leading-relaxed', ok === false ? 'bg-bad/[0.06]' : 'bg-sunken')}>{result ? J(result.result) : '…'}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ runId, ev, onDone }: { runId: string; ev: RunEvent; onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const decide = async (approve: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await api.decide(runId, String(ev.approvalId), approve, typed);
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="animate-slideUp rounded-2xl border-2 border-warn/60 bg-warn/[0.06] p-4" role="alertdialog" aria-label="Approval needed">
      <div className="flex items-center gap-2 text-sm font-extrabold text-warn"><Hand size={16} /> Approval needed: {String(ev.action)}</div>
      <pre className="scroll-thin mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-panel p-2.5 text-xs text-ink ring-1 ring-line">{String(ev.detail)}</pre>
      <p className="mt-2 text-xs text-muted">The agent is paused. This acts on the SAP development system under your name in the audit log. Type <strong>yes</strong> to approve.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={cx(inputCls, 'w-40')} placeholder="type yes" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type yes to approve" />
        <Button variant="primary" disabled={busy || typed.trim().toLowerCase() !== 'yes'} onClick={() => decide(true)}>Approve</Button>
        <Button variant="danger" disabled={busy} onClick={() => decide(false)}>Deny</Button>
        {err && <span className="text-xs text-bad">{err}</span>}
      </div>
    </div>
  );
}

/** Live (or replayed) run: timeline, approvals, cancel, final result. */
export default function RunView({ runId, onFinished }: { runId: string; onFinished?: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const bottom = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const refresh = async () => {
    try {
      const r = await api.run(runId);
      setRun(r);
      return r;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    }
  };

  useEffect(() => {
    let stop = () => undefined as void;
    let alive = true;
    setEvents([]);
    seq.current = 0;
    (async () => {
      const r = await refresh();
      if (!r || !alive) return;
      setEvents(r.eventList);
      seq.current = r.eventList.length;
      if (!ACTIVE.includes(r.status)) return;
      stop = followRun(
        runId,
        seq.current,
        (e) => {
          if (e.seq <= seq.current) return;
          seq.current = e.seq;
          setEvents((prev) => [...prev, e]);
          if (['approval_requested', 'approval_decided', 'finished', 'cancel_requested'].includes(e.type)) void refresh().then((x) => x && !ACTIVE.includes(x.status) && onFinished?.());
        },
        () => void refresh(),
      );
    })();
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if (!run || !ACTIVE.includes(run.status)) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run]);
  // Braces matter: recent browsers return a Promise from smooth scrollIntoView, and an effect may
  // only return a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [events.length]);

  if (err && !run) return <p className="p-4 text-sm text-bad">{err}</p>;
  if (!run) return <div className="p-6 text-sm text-muted">Loading run…</div>;

  const results = new Map<number, RunEvent>();
  const pairs: { call: RunEvent; result?: RunEvent }[] = [];
  const open: { idx: number; name: string }[] = [];
  const items: (RunEvent | { pair: number })[] = [];
  for (const e of events) {
    if (e.type === 'tool_call') {
      pairs.push({ call: e });
      open.push({ idx: pairs.length - 1, name: String(e.name) });
      items.push({ pair: pairs.length - 1 });
    } else if (e.type === 'tool_result') {
      const o = open.findIndex((x) => x.name === e.name);
      if (o >= 0) {
        pairs[open[o].idx].result = e;
        open.splice(o, 1);
      }
      results.set(e.seq, e);
    } else items.push(e);
  }
  const active = ACTIVE.includes(run.status);
  const pending = run.pendingApproval;
  const elapsed = Math.round(((run.finished ?? now) - run.created) / 1000);
  const result = run.result as { finalText?: string; steps?: unknown; stopped?: string; todo?: string; checks?: { name: string; ok: boolean; detail: string }[] };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
        <StatusPill s={run.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold" title={run.title}>{run.title}</span>
        <span className="text-xs text-muted">{run.kind} · by {run.owner} · {elapsed}s{typeof result.steps === 'number' ? ` · ${result.steps} model steps` : ''}</span>
        {active && <Button size="sm" variant="danger" onClick={() => api.cancel(runId).then(refresh)}><Square size={12} /> Cancel</Button>}
      </div>
      {active && <div className="h-1 overflow-hidden rounded-full bg-sunken"><div className="indeterminate h-full w-1/3 rounded-full bg-accent" /></div>}

      {pending && events.some((e) => e.type === 'approval_requested' && e.approvalId === pending.id) && (
        <ApprovalCard runId={runId} ev={events.filter((e) => e.type === 'approval_requested' && e.approvalId === pending.id).slice(-1)[0]} onDone={() => void refresh()} />
      )}

      <div className="flex flex-col gap-2">
        {items.map((it, i) => {
          if (!('seq' in it)) {
            const p = (it as { pair: number }).pair;
            return <ToolCard key={`p${p}`} call={pairs[p].call} result={pairs[p].result} />;
          }
          const e = it as RunEvent;
          switch (e.type) {
            case 'say':
              return (
                <div key={e.seq} className="flex gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-white"><Bot size={15} /></span>
                  <div className="min-w-0 flex-1 whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-line bg-panel px-3.5 py-2.5 text-[13px] leading-relaxed shadow-card">{String(e.text)}</div>
                </div>
              );
            case 'log':
              return <div key={e.seq} className="flex items-start gap-2 font-mono text-[11.5px] text-muted"><Terminal size={12} className="mt-0.5 shrink-0" />{String(e.text)}</div>;
            case 'step':
              return (
                <div key={e.seq} className="flex items-center gap-2 text-[13px]">
                  {e.status === 'ok' ? <CheckCircle2 size={15} className="text-good" /> : e.status === 'manual' ? <ClipboardList size={15} className="text-warn" /> : <XCircle size={15} className="text-bad" />}
                  <span className="font-mono text-xs font-bold">{String(e.id)}</span>
                  <span className="text-xs text-muted">{String(e.type)}</span>
                  {e.status === 'manual' && <Pill tone="warn">needs a human</Pill>}
                </div>
              );
            case 'check':
              return (
                <div key={e.seq} className="flex items-start gap-2 text-[13px]">
                  {e.ok ? <CheckCircle2 size={15} className="mt-0.5 text-good" /> : <XCircle size={15} className="mt-0.5 text-bad" />}
                  <span className="font-semibold">{String(e.name)}</span>
                  <span className="text-xs text-muted">{String(e.detail)}</span>
                </div>
              );
            case 'approval_requested':
              return <div key={e.seq} className="flex items-center gap-2 text-xs font-semibold text-warn"><Hand size={13} /> Asked for approval: {String(e.action)}</div>;
            case 'approval_decided':
              return <div key={e.seq} className={cx('text-xs font-semibold', e.approved ? 'text-good' : 'text-bad')}>{e.approved ? '✓ Approved' : '✕ Not approved'} by {String(e.by)}</div>;
            case 'error':
              return <div key={e.seq} className="flex items-start gap-2 rounded-xl bg-bad/[0.07] px-3 py-2 text-sm text-bad"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{String(e.message)}</div>;
            case 'started':
            case 'finished':
            case 'cancel_requested':
              return <div key={e.seq} className="text-center text-[11px] text-faint">{fmtTime(e.ts)} · {e.type === 'started' ? 'started' : e.type === 'finished' ? `finished: ${String(e.status)}` : `cancel requested by ${String(e.by)}`}</div>;
            default:
              return <div key={i} />;
          }
        })}
        <div ref={bottom} />
      </div>

      {!active && (result.finalText || result.todo || Array.isArray(result.steps)) && (
        <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
          <h3 className="mb-2 text-sm font-extrabold">Result{result.stopped && result.stopped !== 'end_turn' ? ` (${result.stopped})` : ''}</h3>
          {result.finalText && <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{result.finalText}</div>}
          {Array.isArray(result.steps) && (
            <table className="mt-2 w-full text-xs">
              <thead className="text-faint"><tr><th className="py-1 text-left">Step</th><th className="text-left">Type</th><th className="text-left">Outcome</th></tr></thead>
              <tbody>
                {(result.steps as { id: string; type: string; ok: boolean; skipped: boolean; manual: boolean }[]).map((s) => (
                  <tr key={s.id} className="border-t border-line/70">
                    <td className="py-1 font-mono">{s.id}</td><td>{s.type}</td>
                    <td>{s.skipped ? <Pill>dry run</Pill> : s.manual ? <Pill tone="warn">needs a human</Pill> : s.ok ? <Pill tone="good">ok</Pill> : <Pill tone="bad">failed</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.todo && (
            <>
              <h4 className="mt-3 text-xs font-extrabold uppercase tracking-wide text-warn">Manual to-do (MANUAL_TODO.md)</h4>
              <pre className="scroll-thin mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 text-xs">{result.todo}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
