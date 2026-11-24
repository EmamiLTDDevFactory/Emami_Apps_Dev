'use client';
/**
 * "Explain change": why did an FG's cost per piece change? Baselines: (a) a previous snapshot of the same FG and plant
 * (this browser), (b) a second SAP run as of a date (rate and source effects only: SAP uses today's FX and BOM),
 * (c) budget (rate effect only), (d) a saved scenario. Engine lib/ai/variance.ts; narrative lib/ai/explain.ts under the
 * numbers rule (template when there is no key or validation fails twice).
 */
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ClipboardCopy, Mail, Sparkles } from 'lucide-react';
import { Button, Drawer, Pill, cx, inputBase } from '../ui';
import { useChartTheme } from '../charts';
import type { CostLine } from '@/lib/sap/fields';
import type { CostQuery } from '@/lib/query/schema';
import type { Scenario } from '@/lib/client/scenarios';
import { scenarioResults } from '@/lib/client/scenarios';
import { api } from '@/lib/client/api';
import { prioLabel } from '@/lib/rates/priority';
import { buildSnapshots, listSnapshots, loadSnapshot, type Snapshot } from '@/lib/snapshots/snapshot';
import { budgetBaseline, explainChange, type ExplainResult } from '@/lib/ai/variance';
import { explainWithModel, type ExplainFacts } from '@/lib/ai/explain';
import { getApiKey, getModels, hasAiAccess } from '@/lib/ai/config';
import { makeClient } from '@/lib/ai/gateway';
import type { AiAnswer } from '@/lib/ai/validate';
import type { Fact } from '@/lib/ai/facts';
import { fmtNum, fmtRate } from '@/lib/format';

type BaselineKind = 'snapshot' | 'asof' | 'budget' | 'scenario';

export default function ExplainDrawer({ open, onClose, rows, query, system, user, scenarios, onSelectComponent }: {
  open: boolean; onClose: () => void; rows: CostLine[]; query: CostQuery; system: string; user: string; scenarios: Scenario[];
  onSelectComponent?: (headmat: string, hwerks: string, idnrk: string) => void;
}) {
  const t = useChartTheme();
  const current = useMemo(() => buildSnapshots(rows, query, system, user, 'current run'), [rows, query, system, user]);
  const [head, setHead] = useState(current[0] ? `${current[0].plant}|${current[0].sku}` : '');
  const cur = current.find((s) => `${s.plant}|${s.sku}` === head) ?? current[0];
  const history = useMemo(() => (cur ? listSnapshots(cur.sku, cur.plant).filter((s) => s.total_per_unit !== cur.total_per_unit || s.line_count !== cur.line_count) : []), [cur]);
  const [kind, setKind] = useState<BaselineKind>(history.length ? 'snapshot' : 'budget');
  const [snapId, setSnapId] = useState(history[0]?.run_id ?? '');
  const [asof, setAsof] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10); });
  const [scenId, setScenId] = useState(scenarios[0]?.id ?? '');
  const [state, setState] = useState<{ busy: boolean; error: string; result: ExplainResult | null; answer: AiAnswer | null; facts: ExplainFacts | null; template: boolean; note: string; baseLabel: string; at: string }>({ busy: false, error: '', result: null, answer: null, facts: null, template: false, note: '', baseLabel: '', at: '' });
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { if (!snapId && history[0]) setSnapId(history[0].run_id); }, [history, snapId]);

  async function baseline(): Promise<{ lines: Snapshot['lines']; params?: Snapshot['params']; label: string; note: string }> {
    if (!cur) throw new Error('No FG in this run.');
    if (kind === 'budget') return { lines: budgetBaseline(cur.lines), params: cur.params, label: 'budget', note: 'Budget baseline: budget landed rate per component, quantities unchanged (rate effect only).' };
    if (kind === 'snapshot') {
      const s = await loadSnapshot(snapId);
      if (!s) throw new Error('That snapshot is no longer stored in this browser.');
      return { lines: s.lines, params: s.params, label: `run of ${new Date(s.ts).toLocaleString('en-IN')}`, note: '' };
    }
    if (kind === 'asof') {
      const r = await api.cost({ ...query, materials: [cur.sku], plants: [cur.plant], useAsof: true, asofDate: asof });
      const s = buildSnapshots(r.rows, { ...query, useAsof: true, asofDate: asof }, system, user).find((x) => x.sku === cur.sku && x.plant === cur.plant);
      if (!s) throw new Error('SAP returned no lines for that date.');
      return { lines: s.lines, params: { ...s.params, useAsof: false, asofDate: '' }, label: `SAP as of ${asof}`, note: 'As-of baseline: SAP uses today’s FX and BOM, so only rate and source effects are meaningful.' };
    }
    const sc = scenarios.find((s) => s.id === scenId);
    const res = sc ? await scenarioResults.get(sc.id) : null;
    if (!sc || !res) throw new Error('Run the scenario first (Scenarios tab) so its result is stored.');
    const s = buildSnapshots(res.rows, sc.query, system, user).find((x) => x.sku === cur.sku && x.plant === cur.plant);
    if (!s) throw new Error(`Scenario "${sc.name}" has no result for ${cur.sku} in plant ${cur.plant}.`);
    return { lines: s.lines, params: s.params, label: `scenario ${sc.name}`, note: '' };
  }

  async function run() {
    if (!cur) return;
    setState((x) => ({ ...x, busy: true, error: '' }));
    try {
      const b = await baseline();
      const r = explainChange(b.lines, cur.lines, b.params, cur.params);
      const key = getApiKey();
      const res = await explainWithModel(hasAiAccess() ? makeClient(key) : null, getModels().main, r, { sku: cur.sku, headtxt: cur.headtxt, plant: cur.plant, baselineLabel: b.label, currentLabel: 'the current run', system }, user);
      setState({ busy: false, error: res.error ?? '', result: r, answer: res.answer, facts: res.facts, template: res.template, note: b.note, baseLabel: b.label, at: new Date().toLocaleString('en-IN') });
    } catch (e) {
      setState((x) => ({ ...x, busy: false, error: (e as Error).message }));
    }
  }

  const facts = state.facts?.book.list() ?? [];
  const byId = new Map(facts.map((f) => [f.id, f]));
  const r = state.result;
  const water = useMemo(() => {
    if (!r) return [];
    let run = Number(r.total0.toFixed(4));
    const out = [{ name: 'Baseline', base: 0, value: run, kind: 'total' }];
    for (const [k, v] of Object.entries(r.effects)) {
      const n = Number(v.toFixed(4));
      if (!n) continue;
      out.push({ name: k, base: n >= 0 ? run : run + n, value: Math.abs(n), kind: n >= 0 ? 'up' : 'down' });
      run += n;
    }
    if (r.unexplained.abs().gt('0.01')) { const n = Number(r.unexplained.toFixed(4)); out.push({ name: 'unexplained', base: n >= 0 ? run : run + n, value: Math.abs(n), kind: 'other' }); }
    out.push({ name: 'Current', base: 0, value: Number(r.total1.toFixed(4)), kind: 'total' });
    return out;
  }, [r]);

  const plainText = () => (state.answer ? [...state.answer.paragraphs, ...(state.answer.checks ?? [])].map((p) => p.text.replace(/\s*\[F\d+\]/g, '')).join('\n\n') : '');
  const settings = `SAP ${system} · priority ${prioLabel(query.prio)} · look-back ${query.lookback} days · donor ${query.donorPlant || 'none'} · freight ${query.inclFrt ? (query.stdFrt ? 'standard' : 'actual') : 'excluded'}`;

  return (
    <Drawer open={open} onClose={onClose} width={900} title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-accent" /> Explain cost change</span>}>
      <div className="flex flex-col gap-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">FG
            <select aria-label="FG to explain" className={cx(inputBase, 'h-9 text-sm')} value={head} onChange={(e) => setHead(e.target.value)}>
              {current.map((s) => <option key={`${s.plant}|${s.sku}`} value={`${s.plant}|${s.sku}`}>{s.sku} {s.headtxt} · plant {s.plant}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Compare with
            <select aria-label="Baseline" className={cx(inputBase, 'h-9 text-sm')} value={kind} onChange={(e) => setKind(e.target.value as BaselineKind)}>
              <option value="snapshot" disabled={!history.length}>A previous run{history.length ? ` (${history.length})` : ' (none stored yet)'}</option>
              <option value="asof">SAP as of a date</option>
              <option value="budget">Budget</option>
              <option value="scenario" disabled={!scenarios.length}>A saved scenario</option>
            </select>
          </label>
        </div>
        {kind === 'snapshot' && history.length > 0 && (
          <select aria-label="Previous run" className={cx(inputBase, 'h-9 text-sm')} value={snapId} onChange={(e) => setSnapId(e.target.value)}>
            {history.map((s) => <option key={s.run_id} value={s.run_id}>{new Date(s.ts).toLocaleString('en-IN')} · {fmtRate(s.total_per_unit)} INR/pc · {s.line_count} lines{s.suspect ? ' · suspect' : ''}</option>)}
          </select>
        )}
        {kind === 'asof' && <input type="date" aria-label="As-of date" className={cx(inputBase, 'h-9 w-48 text-sm')} value={asof} onChange={(e) => setAsof(e.target.value)} />}
        {kind === 'scenario' && (
          <select aria-label="Scenario" className={cx(inputBase, 'h-9 text-sm')} value={scenId} onChange={(e) => setScenId(e.target.value)}>
            {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={state.busy || !cur} onClick={run}><Sparkles size={14} /> {state.busy ? 'Explaining…' : 'Explain'}</Button>
          {!hasAiAccess() && <span className="text-xs text-muted">No API key: you get the plain template. Add one in AI settings for a written explanation.</span>}
        </div>
        {state.error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />{state.error}</div>}

        {r && state.answer && (
          <>
            <div className="text-2xs text-muted">{settings} · data as of {state.at} · baseline: {state.baseLabel}{state.template && <> · <Pill tone="neutral">template</Pill></>}</div>
            {state.note && <p className="text-xs text-muted">{state.note}</p>}
            <div className="grid grid-cols-3 gap-2">
              <Box label="Baseline / pc" v={fmtRate(r.total0)} />
              <Box label="Current / pc" v={fmtRate(r.total1)} />
              <Box label="Change / pc" v={`${r.delta.gt(0) ? '+' : ''}${fmtRate(r.delta)}${r.deltaPct ? ` (${r.deltaPct.toFixed(2)}%)` : ''}`} tone={r.delta.gt(0) ? 'text-bad' : r.delta.lt(0) ? 'text-good' : ''} />
            </div>
            <div className="h-56 rounded-xl border border-line p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={water} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: t.axis }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: t.axis }} width={56} />
                  <Tooltip formatter={(v) => fmtNum(String(v), 4)} />
                  <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="value" stackId="w" isAnimationActive={false}>
                    {water.map((d, i) => <Cell key={i} fill={d.kind === 'total' ? t.series : d.kind === 'up' ? t.up : d.kind === 'down' ? t.down : t.neutral} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-sunken/30 p-3 leading-relaxed">
              {state.answer.paragraphs.map((p, i) => <p key={i}><FactText text={p.text} byId={byId} onHover={setHover} /></p>)}
              {(state.answer.checks ?? []).length > 0 && (
                <div><div className="text-2xs font-bold uppercase tracking-wide text-muted">What to check</div>
                  <ul className="ml-4 list-disc">{state.answer.checks!.map((p, i) => <li key={i}><FactText text={p.text} byId={byId} onHover={setHover} /></li>)}</ul></div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(plainText())}><ClipboardCopy size={13} /> Copy as text</Button>
              <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-sunken" href={`mailto:?subject=${encodeURIComponent(`Cost change ${cur?.sku} plant ${cur?.plant}`)}&body=${encodeURIComponent(`${plainText()}\n\n${settings}`)}`}><Mail size={13} /> Copy as email</a>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="bg-sunken/60"><tr><th className="px-2 py-1.5 text-left">Top drivers</th><th className="px-2 py-1.5 text-left">Effect</th><th className="px-2 py-1.5 text-right">Qty / pc</th><th className="px-2 py-1.5 text-right">INR / unit</th><th className="px-2 py-1.5 text-right">Change / pc</th></tr></thead>
                <tbody>
                  {r.topDrivers.map((d) => {
                    const fid = state.facts?.ids.drivers.find((x) => x.idnrk === d.idnrk)?.id;
                    return (
                      <tr key={d.key} className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', hover && hover === fid && 'bg-accent/10')} onClick={() => cur && onSelectComponent?.(cur.sku, cur.plant, d.idnrk)}>
                        <td className="px-2 py-1.5"><span className="font-mono font-semibold">{d.idnrk}</span>{fid && <span className="ml-1 text-2xs text-faint">[{fid}]</span>}</td>
                        <td className="px-2 py-1.5">{d.kind === 'changed' ? d.label : d.kind}{d.source0 !== d.source1 && d.kind === 'changed' ? ` (${d.source0 || '—'} → ${d.source1 || '—'})` : ''}</td>
                        <td className="num px-2 py-1.5 text-right">{fmtNum(d.q0, 4, 'X')} → {fmtNum(d.q1, 4, 'X')}</td>
                        <td className="num px-2 py-1.5 text-right">{fmtRate(d.p0)} → {fmtRate(d.p1)}</td>
                        <td className={cx('num px-2 py-1.5 text-right font-semibold', d.delta.gt(0) ? 'text-bad' : 'text-good')}>{d.delta.gt(0) ? '+' : ''}{fmtRate(d.delta)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}

function Box({ label, v, tone = '' }: { label: string; v: string; tone?: string }) {
  return <div className="rounded-xl border border-line bg-panel px-3 py-2"><div className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</div><div className={cx('num text-lg font-bold', tone)}>{v}</div></div>;
}

/** Text with [F#] ids turned into chips that show the fact on hover. */
export function FactText({ text, byId, onHover }: { text: string; byId: Map<string, Fact>; onHover?: (id: string | null) => void }) {
  const parts = text.split(/(\[F\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[(F\d+)\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const f = byId.get(m[1]);
        return (
          <span key={i} tabIndex={0} title={f ? `${f.label}: ${f.display} ${f.unit} (${f.source})` : 'unknown fact'}
            onMouseEnter={() => onHover?.(m[1])} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(m[1])} onBlur={() => onHover?.(null)}
            className="mx-0.5 inline-flex cursor-help items-center rounded bg-accent/10 px-1 align-baseline text-[10px] font-bold text-accent">{m[1]}</span>
        );
      })}
    </>
  );
}
