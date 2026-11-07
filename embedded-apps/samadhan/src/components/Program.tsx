'use client';
import { Fragment, useEffect, useState } from 'react';
import { CheckCircle2, Pencil, RefreshCw, Rocket, Save, XCircle } from 'lucide-react';
import { programOverview, saveProgram } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, relative } from '@/lib/format';
import type { ProgramDetails, ProgramOverview } from '@/lib/types';
import { BarList } from './charts';
import { PriorityPill } from './badges';
import { Button, Card, Field, Notice, Pill, Select, Skeleton, Spinner, cx, inputBase, inputCls } from './ui';

/*
   v7 Phase 8 (master prompt §I ticket_program_details, §N 3, 5, 7, 9): programme details (form + ticket card with the
   retest buttons) and the Programme screen: defect burn-down, KPIs (open by severity, density by process area, leakage,
   retest pass %) and hypercare today.
*/
const sel = cx('h-9 w-full', inputBase);
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Could not save.');
type Key = keyof ProgramDetails;
const FIELDS: { key: Key; label: string; list?: 'activatePhase' | 'testCycle' | 'defectSeverity' | 'retestStatus' | 'mockCycle'; defectOnly?: boolean }[] = [
  { key: 'testCycle', label: 'Test cycle', list: 'testCycle' }, { key: 'defectSeverity', label: 'Defect severity', list: 'defectSeverity' },
  { key: 'activatePhase', label: 'Activate phase', list: 'activatePhase' }, { key: 'testCaseId', label: 'Test case id' }, { key: 'testScenario', label: 'Test scenario' },
  { key: 'releaseWave', label: 'Release / wave' }, { key: 'migrationObject', label: 'Migration object' }, { key: 'mockCycle', label: 'Mock cycle', list: 'mockCycle' },
  { key: 'cutoverStepId', label: 'Cutover step' }, { key: 'ricefwId', label: 'RICEFW id' }, { key: 'fitGapId', label: 'Fit-gap id' },
  { key: 'simplificationItem', label: 'Simplification item' }, { key: 'atcFinding', label: 'ATC finding' },
];
const SEV_TONE: Record<string, 'bad' | 'warn' | 'neutral' | 'good'> = { 'S1 Critical': 'bad', 'S2 High': 'warn', 'S3 Medium': 'neutral', 'S4 Low': 'good' };

export function ProgramFields({ value, onChange, compact = false }: { value: Partial<ProgramDetails>; onChange: (v: Partial<ProgramDetails>) => void; compact?: boolean }) {
  const { meta } = useSamadhan();
  const L = meta.programLists;
  const [more, setMore] = useState(false);
  const s = (k: Key) => (value[k] as string | null | undefined) ?? '';
  const shown = more ? FIELDS : FIELDS.slice(0, 5);
  return (
    <div className="space-y-2" data-testid="program-fields">
      <div className={cx('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-3')}>
        {shown.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.list ? <select className={sel} value={s(f.key)} onChange={(e) => onChange({ ...value, [f.key]: e.target.value || null })}><option value="">—</option>{(L?.[f.list] ?? []).map((x) => <option key={x}>{x}</option>)}</select>
              : <input className={inputCls} value={s(f.key)} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} aria-label={f.label} />}
          </Field>
        ))}
      </div>
      <button type="button" className="text-2xs font-bold text-accent hover:underline" onClick={() => setMore((m) => !m)}>{more ? 'Fewer fields' : 'More (migration object, cutover step, RICEFW, fit-gap, ATC ...)'}</button>
    </div>
  );
}

export function ProgramCard({ ticketId, program, isDefect, reload }: { ticketId: number; program: ProgramDetails | null | undefined; isDefect: boolean; reload: () => Promise<void> }) {
  const { can } = useSamadhan();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProgramDetails>>(program ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setForm(program ?? {}), [program]);
  const run = async (b: Partial<ProgramDetails>) => {
    setBusy(true);
    setError('');
    try { await saveProgram(ticketId, b); setEditing(false); await reload(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };
  const rows = program ? FIELDS.map((f) => [f.label, program[f.key] as string | null] as const).filter(([, v]) => v) : [];
  return (
    <Card title="Programme" sub={program?.defectSeverity ? program.defectSeverity : 'Test cycle, severity, work-stream ids'}
      actions={can('ticket.edit') && !editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}>
      <div className="space-y-2" data-testid="program-card">
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        {editing ? (
          <div className="space-y-3">
            <ProgramFields value={form} onChange={setForm} compact />
            <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={() => run(form)}>{busy ? <Spinner /> : <Save size={13} />} Save</Button><Button onClick={() => { setEditing(false); setForm(program ?? {}); }}>Cancel</Button></div>
          </div>
        ) : rows.length === 0 ? <p className="text-2xs text-muted">No programme details yet.</p> : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {rows.map(([k, v]) => <Fragment key={k}><dt className="text-muted">{k}</dt><dd className="min-w-0 break-words font-semibold">{k === 'Defect severity' ? <Pill tone={SEV_TONE[v ?? ''] ?? 'neutral'}>{v}</Pill> : v}</dd></Fragment>)}
          </dl>
        )}
        {isDefect && (
          <div className="rounded-lg border border-line p-2.5 text-xs" data-testid="retest">
            <div className="flex flex-wrap items-center gap-1.5">
              <b>Retest</b>
              <Pill tone={program?.retestStatus === 'Passed' ? 'good' : program?.retestStatus === 'Failed' ? 'bad' : 'neutral'}>{program?.retestStatus ?? 'Not started'}</Pill>
              {program?.retestBy && <span className="text-2xs text-muted">by {program.retestBy}{program.retestAt ? ` · ${relative(program.retestAt)}` : ''}</span>}
            </div>
            {can('ticket.edit') && (
              <div className="mt-1.5 flex gap-1.5">
                <Button size="sm" disabled={busy} onClick={() => run({ retestStatus: 'Passed' })}><CheckCircle2 size={13} /> Passed</Button>
                <Button size="sm" disabled={busy} onClick={() => run({ retestStatus: 'Failed' })}><XCircle size={13} /> Failed</Button>
              </div>
            )}
            <p className="mt-1 text-2xs text-faint">A defect is resolved only after its retest has passed. Failed sends it back to Retest.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Defect burn-down: open defects (and S1 / S2) per day, with found / fixed bars. */
function Burndown({ rows }: { rows: ProgramOverview['burndown'] }) {
  const W = 720;
  const H = 200;
  const pad = 28;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.open, r.found, r.fixed)));
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, rows.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const line = (k: 'open' | 'openS1S2') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
  const bw = Math.max(2, (W - pad * 2) / rows.length / 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img" aria-label="Defect burn-down">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} className="stroke-line" strokeDasharray="3 3" /><text x={4} y={y(max * f) + 3} className="fill-faint text-[9px]">{Math.round(max * f)}</text></g>)}
      {rows.map((r, i) => (
        <g key={r.day}>
          <rect x={x(i) - bw} y={y(r.found)} width={bw} height={H - pad - y(r.found)} className="fill-warn/50"><title>{`${r.day}: ${r.found} found`}</title></rect>
          <rect x={x(i)} y={y(r.fixed)} width={bw} height={H - pad - y(r.fixed)} className="fill-good/60"><title>{`${r.day}: ${r.fixed} fixed`}</title></rect>
        </g>
      ))}
      <path d={line('open')} className="fill-none stroke-accent" strokeWidth={2.5} />
      <path d={line('openS1S2')} className="fill-none stroke-bad" strokeWidth={2} strokeDasharray="5 3" />
      {rows.filter((_, i) => i % Math.ceil(rows.length / 7) === 0 || i === rows.length - 1).map((r) => <text key={r.day} x={x(rows.indexOf(r))} y={H - 8} textAnchor="middle" className="fill-faint text-[9px]">{r.day.slice(5)}</text>)}
    </svg>
  );
}

export default function Programme() {
  const { meta, openTicket, openList } = useSamadhan();
  const [days, setDays] = useState('30');
  const [cycle, setCycle] = useState('');
  const [data, setData] = useState<ProgramOverview | null>(null);
  const [error, setError] = useState('');
  const load = () => { setData(null); programOverview(Number(days), cycle || undefined).then(setData).catch((e) => setError(errText(e))); };
  useEffect(load, [days, cycle]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = data?.kpis;
  const tiles = k ? [
    { label: 'Open defects', value: k.open, tone: '' }, { label: 'Overdue', value: k.overdue, tone: k.overdue ? 'text-bad' : '' },
    { label: 'Retest pass rate', value: k.retestPassPct === null ? '—' : `${k.retestPassPct}%`, tone: 'text-good' },
    { label: 'Leakage (found in UAT and later)', value: k.leakagePct === null ? '—' : `${k.leakagePct}%`, tone: (k.leakagePct ?? 0) > 30 ? 'text-warn' : '' },
    { label: 'Defects logged', value: k.total, tone: '' },
  ] : [];
  return (
    <div className="space-y-4" data-testid="programme">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight"><Rocket size={20} className="text-warn" /> S/4HANA Programme</h2>
          <p className="text-sm text-muted">Defect burn-down, quality KPIs and hypercare. Severity sets the SLA: S1 1 · S2 2 · S3 5 · S4 10 business days.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40"><Select label="Period" value={days} onChange={setDays} options={[{ value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }, { value: '60', label: 'Last 60 days' }, { value: '90', label: 'Last 90 days' }]} /></div>
          <div className="w-44"><Select label="Test cycle" value={cycle} onChange={setCycle} options={[{ value: '', label: 'All test cycles' }, ...(meta.programLists?.testCycle ?? []).map((c) => ({ value: c, label: c }))]} /></div>
          <Button onClick={load} aria-label="Refresh"><RefreshCw size={14} /></Button>
        </div>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {!data ? <Skeleton rows={6} /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => <Card key={t.label} bodyClass="p-3"><div className={cx('num text-2xl font-extrabold', t.tone)}>{t.value}</div><div className="text-2xs text-muted">{t.label}</div></Card>)}
          </div>
          <Card title="Defect burn-down" sub="Line: open defects (dashed: S1 / S2). Bars: found (amber) and fixed (green) per day.">
            <Burndown rows={data.burndown} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Open by severity"><BarList unit="defects" rows={data.kpis.bySeverity.map((r) => ({ key: r.k, label: r.k, value: r.n }))} onPick={(sv) => openList({ defectSeverity: sv })} /></Card>
            <Card title="Defect density by process area" sub="All defects (open)"><BarList unit="defects" rows={data.kpis.byArea.map((r) => ({ key: r.k, label: r.k, value: r.n, detail: `${r.open} open` }))} /></Card>
            <Card title="By test cycle"><BarList unit="defects" rows={data.kpis.byCycle.map((r) => ({ key: r.k, label: r.k, value: r.n }))} onPick={(c) => openList({ testCycle: c })} /></Card>
          </div>
          <Card title="Hypercare today" sub={`${data.hypercare.length} raised today`}>
            {data.hypercare.length === 0 ? <p className="text-sm text-muted">Nothing raised in hypercare today.</p> : (
              <ul className="space-y-1 text-xs">
                {data.hypercare.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">
                    <button type="button" className="num font-bold text-accent hover:underline" onClick={() => openTicket(h.id)}>{h.ref}</button>
                    <span className="min-w-0 flex-1 truncate">{h.subject}</span>
                    <PriorityPill priority={h.priority} />
                    <Pill tone={h.isResolved ? 'good' : 'neutral'}>{h.statusName}</Pill>
                    <span className="text-muted">{fmtDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
