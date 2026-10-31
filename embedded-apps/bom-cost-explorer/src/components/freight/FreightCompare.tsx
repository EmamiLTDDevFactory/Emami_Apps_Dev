'use client';
/**
 * Freight comparison: actual vs standard freight per finished good and plant, with the break-up behind it
 * (cost category, component, and - on click - the condition types of one component). Two ordinary BOM costing runs of
 * the same selection (StdFrt off / on), compared in the browser (lib/freight/compare.ts). Read-only; nothing is
 * written to SAP.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, ChevronDown, ChevronRight, FileSpreadsheet, Play, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { FgStrips } from '../price-context/slots';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Button, Card, Empty, Field, Pill, Segmented, Stat, cx, inputCls } from '../ui';
import type { PlantRow } from '@/lib/sap/fields';
import { api } from '@/lib/client/api';
import { useRun } from '@/lib/client/useRun';
import { MAX_MATERIALS, defaultQuery, type CostQuery } from '@/lib/query/schema';
import { compareFreight, compareTotals, freightCompareSheets, type FreightComponent, type FreightCompareRow } from '@/lib/freight/compare';
import { exportTable } from '@/lib/client/export';
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/cost/categories';
import { fmtMs, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import type { FreightRun } from '@/lib/freight/breakup';

const BreakupDialog = dynamic(() => import('./FreightBreakup'), { ssr: false });

const FREIGHT_DAYS = 180;
const th = 'px-3 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-3 py-2 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const inr = (v: Parameters<typeof fmtNum>[0]) => fmtNum(v, 2, 'INR');
const tone = (d: FreightCompareRow['delta']) => (d.gt('0.005') ? 'text-bad' : d.lt('-0.005') ? 'text-good' : 'text-muted');

type Filter = 'all' | 'over' | 'under';
interface Compared { rows: FreightCompareRow[]; ms: number; messages: number }

export default function FreightCompare() {
  const [materials, setMaterials] = useState<string[]>([]);
  const [plantCodes, setPlantCodes] = useState<string[]>([]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const [touched, setTouched] = useState(false);
  const [ran, setRan] = useState<{ materials: string[]; plants: string[] } | null>(null);

  const loadPlants = useCallback(() => {
    setPlantsLoading(true);
    setPlantsErr('');
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false));
  }, []);
  useEffect(loadPlants, [loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  // Actual first (StdFrt off), then standard (StdFrt on): one SAP costing at a time.
  const runner = useRun(async (signal: AbortSignal, q: { materials: string[]; plants: string[] }): Promise<Compared> => {
    const base = (stdFrt: boolean): CostQuery => ({ ...defaultQuery('B'), materials: q.materials, plants: q.plants, explQty: '1', inclFrt: true, stdFrt, freightDays: FREIGHT_DAYS });
    const actual = await api.cost(base(false), signal);
    const standard = await api.cost(base(true), signal);
    return { rows: compareFreight(actual.rows, standard.rows, '1'), ms: actual.ms + standard.ms, messages: actual.messages.length + standard.messages.length };
  });

  const missing = plantCodes.length === 0 ? 'Pick at least one plant' : '';
  const start = () => {
    setTouched(true);
    if (missing || runner.status === 'running') return;
    const q = { materials, plants: plantCodes };
    setRan(q);
    void runner.run(q);
  };

  return (
    <PlanFrame active="freight">
      <div>
        <h1 className="text-lg font-extrabold">Freight comparison</h1>
        <p className="text-xs text-muted">Actual vs standard freight per finished good and plant, in INR per piece, with the break-up by cost category, component and freight condition.</p>
      </div>

      <Card title="Selection" bodyClass="flex flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Finished goods" hint={`Leave empty to compare every finished good of the plants (up to ${MAX_MATERIALS} per SAP call, batched).`}>
            {(id) => (
              <>
                <MaterialPicker id={id} values={materials} onChange={setMaterials} max={MAX_MATERIALS} />
                <MaterialHierarchyPicker values={materials} onChange={setMaterials} max={MAX_MATERIALS} werks={plantCodes} />
              </>
            )}
          </Field>
          <Field label="Plants" error={touched ? missing : undefined}>
            {(id) => <PlantPicker id={id} values={plantCodes} onChange={setPlantCodes} state={plantsState} invalid={touched && !!missing} />}
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runner.status === 'running' ? (
            <Button type="button" variant="ghost" onClick={runner.cancel}><Square size={14} /> Cancel ({fmtMs(runner.elapsed)})</Button>
          ) : (
            <Button type="button" onClick={start}><Play size={14} /> Compare freight</Button>
          )}
          <span className="text-xs text-faint">Costs the selection twice in SAP, once with actual and once with standard freight.</span>
        </div>
      </Card>

      {runner.status === 'error' && runner.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" /><span className="min-w-0 break-words">{runner.error.message}</span>
        </div>
      )}
      {runner.status === 'running' && !runner.data && <p className="text-sm text-muted">Costing in SAP… {fmtMs(runner.elapsed)}</p>}
      {runner.data && <Results data={runner.data} stale={runner.status === 'running'} ran={ran} />}
      {runner.status === 'idle' && <Empty title="No comparison yet">Pick the plants (and finished goods) and choose Compare freight.</Empty>}
    </PlanFrame>
  );
}

function Results({ data, stale, ran }: { data: Compared; stale: boolean; ran: { materials: string[]; plants: string[] } | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [plant, setPlant] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const plantList = useMemo(() => Array.from(new Set(data.rows.map((r) => r.plant))).sort(), [data.rows]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.rows.filter((r) => (!plant || r.plant === plant)
      && (filter === 'all' || (filter === 'over' ? r.delta.gt('0.005') : r.delta.lt('-0.005')))
      && (!t || r.fg.toLowerCase().includes(t) || r.text.toLowerCase().includes(t)));
  }, [data.rows, filter, plant, q]);
  const totals = useMemo(() => compareTotals(rows), [rows]);
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const doExport = async (fmt: 'xlsx' | 'csv') => {
    const { summary, components } = freightCompareSheets(rows);
    await exportTable({
      fmt, name: 'Freight comparison', cols: summary.cols, count: summary.count,
      extraSheets: fmt === 'xlsx' ? [{ name: 'Components', ...components }] : undefined,
      extraParams: [
        ['Report', 'Actual vs standard freight per FG and plant, INR per piece'],
        ['Plants', plant || (ran?.plants.join(', ') ?? '')],
        ['Finished goods', ran?.materials.length ? ran.materials.join(', ') : 'every finished good of the plants'],
        ['Filter', `${filter === 'all' ? 'all' : filter === 'over' ? 'above standard' : 'below standard'}${q.trim() ? `, search "${q.trim()}"` : ''}`],
        ['Rows (FG x plant)', String(rows.length)],
        ['Freight look-back (days)', String(FREIGHT_DAYS)],
      ],
    });
  };

  if (!data.rows.length) return <Empty title="No freight lines">SAP returned no costed lines for this selection.</Empty>;
  return (
    <div className={cx('flex flex-col gap-3', stale && 'opacity-60')}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="FG × plant" value={totals.rows} sub={`${fmtMs(data.ms)} in SAP`} />
        <Stat label="Actual freight / pc" value={inr(totals.rows ? totals.actual.div(totals.rows) : 0)} sub="average, INR" />
        <Stat label="Standard freight / pc" value={inr(totals.rows ? totals.standard.div(totals.rows) : 0)} sub="average, INR" />
        <Stat label="Actual vs standard" value={fmtSigned(totals.rows ? totals.delta.div(totals.rows) : totals.delta)} tone={totals.delta.gt('0.005') ? 'bad' : totals.delta.lt('-0.005') ? 'good' : undefined} sub="average per FG, INR" />
        <Stat label="Above / below standard" value={`${totals.over} / ${totals.under}`} sub="finished goods" />
      </div>

      <FgStrips fgs={rows.map((r) => ({ matnr: r.fg, plant: r.plant, text: r.text }))} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-64"><Segmented<Filter> size="sm" label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'over', label: 'Above std' }, { value: 'under', label: 'Below std' }]} /></div>
        <select aria-label="Plant" className={cx(inputCls, 'w-44')} value={plant} onChange={(e) => setPlant(e.target.value)}>
          <option value="">All plants ({plantList.length})</option>
          {plantList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input aria-label="Search finished goods" className={cx(inputCls, 'w-64')} placeholder="Search FG code or description…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" onClick={() => doExport('xlsx')} disabled={!rows.length} title="Excel: FG x plant sheet, Components sheet, Parameters"><FileSpreadsheet size={14} /> Excel</Button>
        <Button size="sm" variant="ghost" onClick={() => doExport('csv')} disabled={!rows.length}>CSV</Button>
        <span className="ml-auto text-xs text-faint">Sorted by the biggest gap. Open a row for the break-up.{ran && !ran.materials.length ? ' Every finished good of the plants.' : ''}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-sunken/60">
            <tr><th className={th} /><th className={th}>Plant</th><th className={th}>Finished good</th><th className={thN}>Actual / pc</th><th className={thN}>Standard / pc</th><th className={thN}>Difference</th><th className={thN}>%</th><th className={thN}>Actual % of cost</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <tr className="cursor-pointer border-t border-line/60 hover:bg-accent/5" onClick={() => toggle(r.key)}>
                  <td className={td}><button type="button" aria-expanded={open.has(r.key)} aria-label={`Break-up of ${r.fg}`} className="text-muted">{open.has(r.key) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                  <td className={cx(td, 'font-mono')}>{r.plant}</td>
                  <td className={td}><span className="font-mono font-bold text-accent">{r.fg}</span> <span className="text-muted">{r.text}</span></td>
                  <td className={tdN}>{inr(r.actual)}</td>
                  <td className={tdN}>{inr(r.standard)}</td>
                  <td className={cx(tdN, 'font-bold', tone(r.delta))}>{fmtSigned(r.delta)}</td>
                  <td className={cx(tdN, tone(r.delta))}>{fmtPct(r.deltaPct)}</td>
                  <td className={tdN}>{r.actualPctOfCost ? fmtPct(r.actualPctOfCost) : '—'}</td>
                </tr>
                {open.has(r.key) && <tr className="border-t border-line/60 bg-sunken/30"><td colSpan={8} className="px-4 py-3"><Breakup row={r} /></td></tr>}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">Nothing matches the filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Freight per finished-good piece, INR. For components priced on Consumption or MBEW the freight is already inside the rate; it is shown here as SAP gives it, but the BOM costing does not add it again.{data.messages > 0 ? ` SAP returned ${data.messages} message(s) on the runs.` : ''}</p>
    </div>
  );
}

function Breakup({ row }: { row: FreightCompareRow }) {
  const [dlg, setDlg] = useState<FreightComponent | null>(null);
  const run: FreightRun = { freightDays: FREIGHT_DAYS, stdFrt: false };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">By cost category</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((c) => {
            const v = row.byCategory[c];
            const d = v.actual.minus(v.standard);
            return (
              <div key={c} className="rounded-xl border border-line bg-panel px-3 py-2">
                <div className="text-2xs font-semibold uppercase tracking-wide text-muted">{CATEGORY_LABEL[c]}</div>
                <div className="num text-sm"><span className="font-bold">{inr(v.actual)}</span> <span className="text-faint">actual</span></div>
                <div className="num text-sm"><span className="font-bold">{inr(v.standard)}</span> <span className="text-faint">standard</span></div>
                <div className={cx('num text-xs font-bold', tone(d))}>{fmtSigned(d)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-1 text-2xs font-bold uppercase tracking-wide text-muted">By component <span className="font-normal normal-case text-faint">· click a freight value for its condition-type break-up</span></p>
        {row.components.length ? (
          <div className="overflow-x-auto rounded-xl border border-line bg-panel">
            <table className="w-full text-sm">
              <thead className="bg-sunken/60"><tr><th className={th}>Component</th><th className={th}>Category</th><th className={th}>Plant</th><th className={thN}>Actual / pc</th><th className={thN}>Standard / pc</th><th className={thN}>Difference</th><th className={th}>Actual source</th></tr></thead>
              <tbody>
                {row.components.map((c) => (
                  <tr key={c.key} className="border-t border-line/60">
                    <td className={td}><span className="font-mono font-bold">{c.idnrk}</span> <span className="text-muted">{c.text}</span></td>
                    <td className={td}>{CATEGORY_LABEL[c.category]}</td>
                    <td className={cx(td, 'font-mono')}>{c.werks}</td>
                    <td className={tdN}><button type="button" aria-label={`Freight break-up of ${c.idnrk}`} className="decoration-dotted underline-offset-2 hover:underline" onClick={() => setDlg(c)}>{inr(c.actual)}</button></td>
                    <td className={tdN}>{inr(c.standard)}</td>
                    <td className={cx(tdN, 'font-bold', tone(c.delta))}>{fmtSigned(c.delta)}</td>
                    <td className={td}>{c.actualSrc ? <Pill tone={c.actualSrc === 'ACTUAL' ? 'good' : 'neutral'} title={c.actualSrc === 'STANDARD' ? 'No actual PO freight found: SAP used standard freight' : undefined}>{c.actualSrc}</Pill> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted">No component carries freight for this finished good.</p>}
      </div>
      {dlg && <BreakupDialog line={dlg.line} run={run} onClose={() => setDlg(null)} />}
    </div>
  );
}
