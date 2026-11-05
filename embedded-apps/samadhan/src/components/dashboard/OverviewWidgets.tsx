'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, CircleDashed, LineChart, ShieldCheck, Table2, type LucideIcon } from 'lucide-react';
import { useSetu } from '@/lib/context';
import { fmtMins, fmtNum, SEVERITY_LABEL } from '@/lib/format';
import type { Overview, Severity } from '@/lib/types';
import { SeverityPill } from '../badges';
import { cx } from '../ui';
import { BacklogChart, BacklogTable } from './Backlog';
import {
  CAT, HEAT, HEALTH_COLOR, HeatKey, Legend, OTHER, RingGauge, SEVERITIES, SEV_COLOR, Tip, TipRow,
  Donut, health, heatStep, pctOrDash, pressable, squarify, useTip, useWidth, type Health, type Slice,
} from './charts2';
import { EmptyLine, WCard } from './frame';

type P = { ov: Overview; stale?: boolean };

// ---------- SLA health ----------

const HEALTH_WORD: Record<Health, { word: string; icon: LucideIcon; cls: string }> = {
  good: { word: 'Healthy', icon: CheckCircle2, cls: 'text-good' },
  warn: { word: 'Watch', icon: AlertTriangle, cls: 'text-warn' },
  bad: { word: 'At risk', icon: AlertTriangle, cls: 'text-bad' },
  none: { word: 'No data', icon: CircleDashed, cls: 'text-faint' },
};

function Gauge({ label, value, sub, action }: { label: string; value: number | null; sub: string; action?: { text: string; onClick: () => void } }) {
  const h = health(value);
  const W = HEALTH_WORD[h];
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center">
      <RingGauge value={value} label={label} />
      <div className="text-xs font-bold leading-tight">{label}</div>
      <div className={cx('inline-flex items-center gap-1 text-2xs font-semibold', W.cls)}><W.icon size={11} aria-hidden /> {W.word}</div>
      <div className="num text-2xs leading-snug text-muted">{sub}</div>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-0.5 rounded text-2xs font-bold text-accent hover:underline">
          {action.text} <ChevronRight size={11} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function SlaWidget({ ov, stale }: P) {
  const { openList } = useSetu();
  const s = ov.sla;
  return (
    <WCard
      title={<span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} className="text-accent" /> SLA health</span>}
      sub={`Last ${ov.days} days · green ≥ 90%, amber ≥ 75%`}
      stale={stale}
    >
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <Gauge label="First response" value={s.firstResponsePct} sub="answered within target" />
        <Gauge label="Resolution" value={s.resolutionPct} sub="resolved within target" />
        <Gauge label="CSAT" value={s.csatPct} sub={s.csatResponses ? `satisfied · ${fmtNum(s.csatResponses)} answers` : 'no survey answers yet'} />
        <Gauge
          label="On track now"
          value={s.onTrackPct}
          sub={`${fmtNum(s.open - s.overdue)} of ${fmtNum(s.open)} open`}
          action={s.overdue ? { text: `${fmtNum(s.overdue)} overdue`, onClick: () => openList({ view: 'overdue' }) } : undefined}
        />
      </div>
    </WCard>
  );
}

// ---------- Backlog ----------

export function BacklogWidget({ ov, stale }: P) {
  const { openList } = useSetu();
  const [table, setTable] = useState(false);
  const rows = ov.backlog;
  const first = rows[0], last = rows[rows.length - 1];
  const net = first && last ? last.open - first.open : 0;
  const created = rows.reduce((s, r) => s + r.created, 0);
  const resolved = rows.reduce((s, r) => s + r.resolved, 0);
  return (
    <WCard
      title={<span className="inline-flex items-center gap-1.5"><LineChart size={15} className="text-accent" /> Backlog trend</span>}
      sub={`Open at the end of each day, last ${ov.days} days · click a day for the tickets created on it`}
      stale={stale}
      actions={
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          title={table ? 'Show chart' : 'Show as table'}
          aria-label={table ? 'Show chart' : 'Show as table'}
          className={cx('grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-sunken', table ? 'text-accent' : 'text-faint hover:text-ink')}
        >
          <Table2 size={13} />
        </button>
      }
    >
      {rows.length === 0 ? <EmptyLine>No data for this period.</EmptyLine> : (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2">
            <Stat label="Open now" value={fmtNum(last.open)} />
            <Stat label={`Net change, ${ov.days} d`} value={`${net > 0 ? '+' : net < 0 ? '−' : ''}${fmtNum(Math.abs(net))}`} hint={net > 0 ? 'backlog growing' : net < 0 ? 'backlog shrinking' : 'flat'} tone={net > 0 ? 'bad' : net < 0 ? 'good' : undefined} />
            <Stat label="Created / resolved" value={`${fmtNum(created)} / ${fmtNum(resolved)}`} />
          </dl>
          {table ? <BacklogTable rows={rows} /> : <BacklogChart rows={rows} onPickDay={(day) => openList({ view: '', from: day, to: day })} />}
        </div>
      )}
    </WCard>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0 rounded-xl bg-sunken/70 px-3 py-2">
      <dt className="truncate text-2xs font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-extrabold tracking-tight">{value}</dd>
      {hint && <dd className={cx('text-2xs font-semibold', tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : 'text-muted')}>{hint}</dd>}
    </div>
  );
}

// ---------- Ageing ----------

const BUCKETS: { id: Overview['ageing'][number]['bucket']; label: string }[] = [
  { id: '0-4h', label: 'Under 4 h' },
  { id: '4-24h', label: '4–24 h' },
  { id: '1-3d', label: '1–3 days' },
  { id: '3-7d', label: '3–7 days' },
  { id: '7d+', label: 'Over 7 days' },
];

type AgeCell = { bucket: string; severity: Severity; n: number };

export function AgeingWidget({ ov, stale }: P) {
  const { openList } = useSetu();
  const t = useTip<AgeCell>();
  const rows = useMemo(() => BUCKETS.map((b) => {
    const by = Object.fromEntries(SEVERITIES.map((s) => [s, ov.ageing.filter((a) => a.bucket === b.id && a.severity === s).reduce((x, a) => x + a.n, 0)])) as Record<Severity, number>;
    return { ...b, by, total: SEVERITIES.reduce((x, s) => x + by[s], 0) };
  }), [ov.ageing]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const total = rows.reduce((s, r) => s + r.total, 0);
  const old = rows.filter((r) => r.id === '3-7d' || r.id === '7d+').reduce((s, r) => s + r.total, 0);
  return (
    <WCard sub="Open tickets by age · click to open, oldest first" stale={stale}>
      {total === 0 ? <EmptyLine icon={<CheckCircle2 size={22} className="text-good" />}>No open tickets.</EmptyLine> : (
        <div className="space-y-3">
          <Legend items={SEVERITIES.map((s) => ({ label: SEVERITY_LABEL[s], color: SEV_COLOR[s] }))} />
          <div ref={t.setBox} className="relative space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2">
                <button type="button" onClick={() => openList({ view: 'open', sort: 'created_asc' })} className="truncate rounded text-left text-xs font-medium text-ink hover:text-accent">
                  {r.label}
                </button>
                <div className="flex h-3.5 gap-[2px]" style={{ width: `${(r.total / max) * 100}%` }}>
                  {SEVERITIES.filter((s) => r.by[s] > 0).map((s, i, arr) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`${r.label}, ${SEVERITY_LABEL[s]}: ${fmtNum(r.by[s])} open`}
                      onClick={() => openList({ view: 'open', severity: s, sort: 'created_asc' })}
                      className={cx('h-full min-w-[3px] motion-safe:transition-opacity', i === arr.length - 1 && 'rounded-r-[4px]', t.tip && (t.tip.item.bucket !== r.id || t.tip.item.severity !== s) && 'opacity-50')}
                      style={{ flexGrow: r.by[s], flexBasis: 0, background: SEV_COLOR[s] }}
                      {...t.bind({ bucket: r.id, severity: s, n: r.by[s] })}
                    />
                  ))}
                </div>
                <span className="num text-right text-xs font-bold">{r.total ? fmtNum(r.total) : <span className="text-faint">0</span>}</span>
              </div>
            ))}
            {t.tip && (
              <Tip x={t.tip.x} y={t.tip.y} box={t.box}>
                <div className="font-bold">{BUCKETS.find((b) => b.id === t.tip?.item.bucket)?.label}</div>
                <TipRow color={SEV_COLOR[t.tip.item.severity]} value={fmtNum(t.tip.item.n)} label={SEVERITY_LABEL[t.tip.item.severity]} />
              </Tip>
            )}
          </div>
          <p className="text-2xs text-muted">
            <span className="num font-bold text-ink">{fmtNum(old)}</span> of {fmtNum(total)} open tickets are older than 3 days.
          </p>
        </div>
      )}
    </WCard>
  );
}

// ---------- At risk ----------

function useNow(every = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

const countdown = (ms: number) => {
  const m = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

export function RiskWidget({ ov, stale }: P) {
  const { openTicket, openList } = useSetu();
  const now = useNow();
  const items = useMemo(() => ov.risk.map((r) => {
    const res = r.resolutionDueAt ? new Date(r.resolutionDueAt).getTime() : Infinity;
    const fr = !r.firstRespondedAt && r.firstResponseDueAt ? new Date(r.firstResponseDueAt).getTime() : Infinity;
    return { ...r, due: Math.min(res, fr), kind: fr < res ? 'First response' : 'Resolution' };
  }).sort((a, b) => a.due - b.due), [ov.risk]);
  const overdue = items.filter((i) => i.due < now).length;
  return (
    <WCard
      title={<span className="inline-flex items-center gap-1.5"><AlertTriangle size={15} className="text-bad" /> At risk</span>}
      sub={items.length ? `${fmtNum(overdue)} overdue · ${fmtNum(items.length - overdue)} due within 2 h` : 'Overdue or due within 2 hours'}
      stale={stale}
      actions={overdue > 0 ? (
        <button type="button" onClick={() => openList({ view: 'overdue' })} className="rounded px-1 text-2xs font-bold text-accent hover:underline">All overdue</button>
      ) : undefined}
    >
      {items.length === 0 ? (
        <EmptyLine icon={<CheckCircle2 size={22} className="text-good" />}>Nothing at risk in the next 2 hours.</EmptyLine>
      ) : (
        <ul className="scroll-thin -mx-1 max-h-[300px] space-y-1 overflow-y-auto px-1">
          {items.map((r) => {
            const left = r.due - now;
            const late = left < 0;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => openTicket(r.id)}
                  className={cx('flex w-full items-start gap-2.5 rounded-xl border border-l-[3px] border-line px-2.5 py-2 text-left transition-colors hover:bg-sunken', late ? 'border-l-bad' : 'border-l-warn')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="num text-2xs font-bold text-muted">#{r.id}</span>
                      <span className="truncate text-xs font-semibold">{r.subject}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
                      <SeverityPill severity={r.severity} />
                      <span className="truncate">{r.agentName ?? <span className="font-semibold text-warn">Unassigned</span>}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{r.statusName}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right" title={Number.isFinite(r.due) ? new Date(r.due).toLocaleString('en-IN') : undefined}>
                    <span className={cx('num block text-xs font-extrabold', late ? 'text-bad' : 'text-warn')}>
                      {Number.isFinite(r.due) ? (late ? `${countdown(left)} late` : `in ${countdown(left)}`) : '—'}
                    </span>
                    <span className="block text-2xs text-muted">{r.kind}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WCard>
  );
}

// ---------- Leaderboard ----------

const AVAIL_DOT: Record<string, string> = { AVAILABLE: 'bg-good', UNAVAILABLE: 'bg-faint' };

export function LeaderboardWidget({ ov, stale }: P) {
  const { openList, meta } = useSetu();
  const rows = ov.leaderboard;
  const max = Math.max(1, ...rows.map((r) => r.resolved));
  return (
    <WCard sub="Resolved in the last 7 days · CSAT over 30 days · click an agent for their open tickets" stale={stale}>
      {rows.length === 0 ? <EmptyLine>No agent activity yet.</EmptyLine> : (
        <div className="scroll-thin -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-muted">
                <th className="w-6 py-1.5 font-bold"><span className="sr-only">Rank</span></th>
                <th className="py-1.5 pr-3 font-bold">Agent</th>
                <th className="w-[38%] px-2 py-1.5 font-bold">Resolved, 7 d</th>
                <th className="px-2 py-1.5 text-right font-bold">Open</th>
                <th className="px-2 py-1.5 text-right font-bold" title="Average time to first response, last 7 days (clock time)">Avg 1st resp.</th>
                <th className="py-1.5 pl-2 text-right font-bold">CSAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a, i) => {
                const h = health(a.csatPct);
                return (
                  <tr key={a.id} className="group">
                    <td className="num py-1.5 text-2xs font-bold text-faint">{i + 1}</td>
                    <td className="py-1.5 pr-3">
                      <button type="button" onClick={() => openList({ view: 'open', agentId: String(a.id) })} className="flex max-w-[12rem] items-center gap-2 rounded text-left font-semibold hover:text-accent">
                        <span
                          className={cx('h-2 w-2 shrink-0 rounded-full', AVAIL_DOT[a.availability] ?? 'bg-[#eda100]')}
                          title={meta.agentStatuses[a.availability] ?? a.availability}
                          aria-label={meta.agentStatuses[a.availability] ?? a.availability}
                          role="img"
                        />
                        <span className="truncate">{a.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 flex-1">
                          <span
                            className="block h-full rounded-r-[4px] bg-accent motion-safe:transition-[width] motion-safe:duration-500"
                            style={{ width: a.resolved ? `${Math.max(2, (a.resolved / max) * 100)}%` : 0 }}
                            title={`${a.name}: ${fmtNum(a.resolved)} resolved`}
                          />
                        </span>
                        <span className="num w-8 text-right font-bold">{fmtNum(a.resolved)}</span>
                      </div>
                    </td>
                    <td className="num px-2 py-1.5 text-right">{fmtNum(a.open)}</td>
                    <td className="num px-2 py-1.5 text-right">{fmtMins(a.avgFirstResponseMins)}</td>
                    <td className="num py-1.5 pl-2 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {a.csatPct !== null && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: HEALTH_COLOR[h] }} />}
                        <span className={a.csatPct === null ? 'text-faint' : 'font-semibold'}>{pctOrDash(a.csatPct)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WCard>
  );
}

// ---------- Region x status ----------

type HeatCell = { region: string; status: string; n: number };

export function RegionStatusWidget({ ov, stale }: P) {
  const { openList, meta } = useSetu();
  const t = useTip<HeatCell>();
  const { regions, statuses, cell, max } = useMemo(() => {
    const order = new Map(meta.statuses.map((s, i) => [s.id, i]));
    const st = [...new Map(ov.regionStatus.map((r) => [r.statusId, { id: r.statusId, name: r.status }])).values()]
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
    const totals = new Map<string, number>();
    const c = new Map<string, number>();
    for (const r of ov.regionStatus) {
      totals.set(r.region, (totals.get(r.region) ?? 0) + r.n);
      c.set(`${r.region}|${r.statusId}`, (c.get(`${r.region}|${r.statusId}`) ?? 0) + r.n);
    }
    const rg = [...totals.entries()].sort((a, b) => (a[0] === 'None' ? 1 : b[0] === 'None' ? -1 : b[1] - a[1])).map(([name, total]) => ({ name, total }));
    return { regions: rg, statuses: st, cell: c, max: Math.max(0, ...c.values()) };
  }, [ov.regionStatus, meta.statuses]);
  const colTotal = (id: number) => regions.reduce((s, r) => s + (cell.get(`${r.name}|${id}`) ?? 0), 0);
  return (
    <WCard sub="Open tickets by region and status · darker = more · click a cell to open those tickets" stale={stale} actions={<span className="hidden sm:block"><HeatKey max={max} /></span>}>
      {regions.length === 0 ? <EmptyLine>No open tickets.</EmptyLine> : (
        <div ref={t.setBox} className="relative">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-muted">
                  <th className="py-1 pr-2 text-left font-bold">Region</th>
                  {statuses.map((s) => <th key={s.id} className="px-1 py-1 text-center font-bold" title={s.name}><span className="mx-auto block max-w-[84px] truncate">{s.name}</span></th>)}
                  <th className="py-1 pl-2 text-right font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => {
                  const blank = r.name === 'None';
                  return (
                    <tr key={r.name}>
                      <td className="max-w-[9rem] truncate py-0.5 pr-2 font-semibold" title={r.name}>{blank ? <span className="text-muted">No region</span> : r.name}</td>
                      {statuses.map((s) => {
                        const n = cell.get(`${r.name}|${s.id}`) ?? 0;
                        const step = heatStep(n, max);
                        const label = `${blank ? 'No region' : r.name}, ${s.name}: ${fmtNum(n)} open`;
                        const pick = n && !blank ? () => openList({ view: 'open', region: r.name, statusId: String(s.id) }) : undefined;
                        return (
                          <td key={s.id} className="p-0">
                            <div
                              className={cx('num grid h-8 min-w-[44px] place-items-center rounded-md text-xs font-bold outline-none motion-safe:transition-transform', n ? '' : 'bg-sunken/60 text-faint', pick && 'cursor-pointer hover:ring-2 hover:ring-accent/50 focus-visible:ring-2 focus-visible:ring-accent', step >= 3 ? 'text-white' : 'text-ink')}
                              style={n ? { background: `rgb(var(--accent) / ${HEAT[step]})` } : undefined}
                              title={blank && n ? `${label} (tickets with no region can't be filtered)` : label}
                              {...pressable(pick, label)}
                              {...(n ? t.bind({ region: blank ? 'No region' : r.name, status: s.name, n }) : {})}
                            >
                              {n ? fmtNum(n) : '·'}
                            </div>
                          </td>
                        );
                      })}
                      <td className="num py-0.5 pl-2 text-right font-extrabold">{fmtNum(r.total)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="pt-1 pr-2 text-2xs font-bold uppercase tracking-wide text-muted">Total</td>
                  {statuses.map((s) => <td key={s.id} className="num pt-1 text-center text-2xs font-bold text-muted">{fmtNum(colTotal(s.id))}</td>)}
                  <td className="num pt-1 pl-2 text-right text-xs font-extrabold">{fmtNum(regions.reduce((x, r) => x + r.total, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 sm:hidden"><HeatKey max={max} /></div>
          {t.tip && (
            <Tip x={t.tip.x} y={t.tip.y} box={t.box}>
              <div className="font-bold">{t.tip.item.region}</div>
              <TipRow value={fmtNum(t.tip.item.n)} label={`open · ${t.tip.item.status}`} />
            </Tip>
          )}
        </div>
      )}
    </WCard>
  );
}

// ---------- Categories ----------

type Cat = { name: string; value: number };

export function CategoriesWidget({ ov, stale }: P) {
  const { openList } = useSetu();
  const [ref, w, el] = useWidth<HTMLDivElement>();
  const t = useTip<Cat>();
  const setBox = t.setBox;
  const boxRef = useCallback((node: HTMLDivElement | null) => { ref(node); setBox(node); }, [ref, setBox]);
  const H = 232;
  const total = ov.categories.reduce((s, c) => s + c.value, 0);
  const tiles = useMemo(() => squarify(ov.categories.map((c) => ({ name: c.name, value: c.value })), w, H), [ov.categories, w]);
  return (
    <WCard sub="Top categories of open tickets · tile size = count · click to open" stale={stale}>
      {ov.categories.length === 0 ? <EmptyLine>No open tickets.</EmptyLine> : (
        <div ref={boxRef} className="relative" style={{ height: H }}>
          {el && tiles.map((c, i) => {
            const blank = c.name === 'Uncategorised';
            const big = c.w > 76 && c.h > 40;
            const mid = !big && c.w > 30 && c.h > 22;
            const share = total ? Math.round((c.value * 100) / total) : 0;
            const label = `${c.name}: ${fmtNum(c.value)} open (${share}%)`;
            return (
              <button
                key={c.name}
                type="button"
                disabled={blank}
                onClick={() => openList({ view: 'open', category: c.name })}
                aria-label={blank ? `${label} - tickets without a category can't be filtered` : label}
                className={cx(
                  'absolute overflow-hidden rounded-lg p-2 text-left outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-accent',
                  i === 0 ? 'bg-accent/[0.22] hover:bg-accent/30' : 'bg-accent/[0.1] hover:bg-accent/20',
                  blank && 'cursor-default bg-sunken hover:bg-sunken',
                )}
                style={{ left: c.x + 1, top: c.y + 1, width: Math.max(0, c.w - 2), height: Math.max(0, c.h - 2) }}
                {...t.bind({ name: c.name, value: c.value })}
              >
                {big && (
                  <>
                    <span className="line-clamp-2 block text-xs font-semibold leading-tight text-ink">{c.name}</span>
                    <span className="num mt-0.5 block text-base font-extrabold tracking-tight text-ink">{fmtNum(c.value)}</span>
                    {c.h > 70 && <span className="block text-2xs text-muted">{share}% of top {ov.categories.length}</span>}
                  </>
                )}
                {mid && <span className="num block text-2xs font-bold text-ink">{fmtNum(c.value)}</span>}
              </button>
            );
          })}
          {t.tip && (
            <Tip x={t.tip.x} y={t.tip.y} box={t.box}>
              <div className="font-bold">{t.tip.item.name}</div>
              <TipRow value={fmtNum(t.tip.item.value)} label={`open · ${total ? Math.round((t.tip.item.value * 100) / total) : 0}%`} />
            </Tip>
          )}
        </div>
      )}
    </WCard>
  );
}

// ---------- Sources ----------

export function SourcesWidget({ ov, stale }: P) {
  const { openList } = useSetu();
  const total = ov.sources.reduce((s, x) => s + x.value, 0);
  // Five named slices at most, the rest folded into "Other" (never a generated sixth hue).
  const slices: Slice[] = useMemo(() => {
    const named = ov.sources.length > 6 ? ov.sources.slice(0, 5) : ov.sources;
    const rest = ov.sources.slice(named.length).reduce((s, x) => s + x.value, 0);
    const out: Slice[] = named.map((s, i) => ({ key: s.name, label: s.name || 'Unknown', value: s.value, color: CAT[i], onPick: s.name ? () => openList({ view: '', source: s.name }) : undefined }));
    if (rest) out.push({ key: '__other', label: `Other (${ov.sources.length - named.length})`, value: rest, color: OTHER });
    return out;
  }, [ov.sources, openList]);
  return (
    <WCard sub={`Tickets created in the last ${ov.days} days · click a source to open`} stale={stale}>
      {total === 0 ? <EmptyLine>No tickets created in this period.</EmptyLine> : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center md:flex-col xl:flex-col 2xl:flex-row">
          <Donut
            slices={slices}
            unit="tickets"
            centre={<div><div className="text-xl font-extrabold tracking-tight">{fmtNum(total)}</div><div className="text-2xs text-muted">created</div></div>}
          />
          <ul className="w-full min-w-0 flex-1 space-y-0.5">
            {slices.map((s) => {
              const pct = Math.round((s.value * 100) / total);
              const Tag = s.onPick ? 'button' : 'div';
              return (
                <li key={s.key}>
                  <Tag
                    {...(s.onPick ? { type: 'button' as const, onClick: s.onPick } : {})}
                    className={cx('grid w-full grid-cols-[auto_1fr_auto_2.5rem] items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs', s.onPick && 'hover:bg-sunken')}
                  >
                    <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                    <span className="truncate font-medium">{s.label}</span>
                    <span className="num font-bold">{fmtNum(s.value)}</span>
                    <span className="num text-right text-muted">{pct}%</span>
                  </Tag>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </WCard>
  );
}
