'use client';
/**
 * Freight analysis: the standard vs actual freight of BOM components (ROH, PKGN, VERP), per plant, for the PO lines of a
 * date range, with the variance highlighted and an alert rule chosen on screen. Read-only; nothing is written to SAP.
 * Data: lib/freight/analysisFetch.ts (RmPmRowSet for the components, FreightRowSet for the PO freight). The rule is applied
 * in the browser (lib/freight/analysis.ts), so changing it never calls SAP again.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, FileSpreadsheet, Play, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { MaterialPicker, PlantPicker } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Button, Card, Empty, Field, Pill, Segmented, Stat, cx, inputCls } from '../ui';
import type { MaterialRow, PlantRow } from '@/lib/sap/fields';
import { api } from '@/lib/client/api';
import { useRun } from '@/lib/client/useRun';
import { exportTable } from '@/lib/client/export';
import { MAX_MATERIALS } from '@/lib/query/schema';
import { fmtMs, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import { toDay } from '@/lib/wac/dates';
import {
  DEFAULT_RULE, FREIGHT_TYPES, FREIGHT_TYPE_LABEL, RULE_OPTIONS, analyseFreight, analysisTotals, breaches, freightAnalysisSheet, poLines, poLinesSheet, ruleText, sortAnalysis, sortPoLines,
  type FreightType, type Rule, type RuleKind,
} from '@/lib/freight/analysis';
import { DEFAULT_FREIGHT_DAYS, defaultInclFrt, freightDaysValue, fetchFreightAnalysis, selectionProblem, type AnalysisData, type AnalysisInput } from '@/lib/freight/analysisFetch';

const th = 'px-3 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-3 py-2 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const inr = (v: Parameters<typeof fmtNum>[0]) => fmtNum(v, 4, 'INR');
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toDay(d); };

type Show = 'all' | 'alerts';
type View = 'component' | 'po';

export default function FreightAnalysis() {
  const [materials, setMaterials] = useState<string[]>([]);
  const known = useRef(new Map<string, MaterialRow>());
  const [plantCodes, setPlantCodes] = useState<string[]>([]);
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const [types, setTypes] = useState<FreightType[]>([...FREIGHT_TYPES]);
  const [from, setFrom] = useState(daysAgo(89));
  const [to, setTo] = useState(daysAgo(0));
  const [freightDays, setFreightDays] = useState(String(DEFAULT_FREIGHT_DAYS));
  const [inclTouched, setInclTouched] = useState(false);
  const [inclPicked, setInclPicked] = useState(true);
  const [touched, setTouched] = useState(false);
  const [ran, setRan] = useState<AnalysisInput | null>(null);
  const [step, setStep] = useState('');
  const [rule, setRule] = useState<Rule>(DEFAULT_RULE);

  const loadPlants = useCallback(() => {
    setPlantsLoading(true);
    setPlantsErr('');
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false));
  }, []);
  useEffect(loadPlants, [loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  const runner = useRun((signal: AbortSignal, input: AnalysisInput): Promise<AnalysisData> => fetchFreightAnalysis(input, signal, setStep));

  // Include freight: checked when both dates are filled, unchecked otherwise, until the person decides.
  const inclFrt = inclTouched ? inclPicked : defaultInclFrt({ from, to });
  const missing = selectionProblem({ materials, plants: plantCodes, types, range: { from, to }, freightDays });
  const start = () => {
    setTouched(true);
    if (missing || runner.status === 'running') return;
    const days = freightDaysValue(freightDays);
    setFreightDays(String(days));
    const info: AnalysisInput['info'] = {};
    for (const m of materials) { const k = known.current.get(m); if (k) info[m] = { text: k.Maktx, mtart: k.Mtart }; }
    const input: AnalysisInput = { materials, info, plants: plantCodes, types, range: { from, to }, inclFrt, freightDays: days };
    setRan(input);
    void runner.run(input);
  };
  const toggleType = (t: FreightType) => setTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const ruleInfo = RULE_OPTIONS.find((o) => o.value === rule.kind)!;

  return (
    <PlanFrame active="freight-analysis">
      <div>
        <h1 className="text-lg font-extrabold">Freight analysis</h1>
        <p className="text-xs text-muted">Standard vs actual freight of the BOM components, plant wise, in INR per unit. Only raw and packing materials (ROH, PKGN, VERP). Variance is highlighted and the alert rule is yours to choose.</p>
      </div>

      <Card title="Selection" bodyClass="flex flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Materials (comma / space separated)" hint={`Optional, up to ${MAX_MATERIALS}. Leave empty to analyse every component of the chosen plant.`} error={touched && !materials.length && !plantCodes.length ? missing : undefined}>
            {(id) => <MaterialPicker id={id} values={materials} onChange={setMaterials} max={MAX_MATERIALS} types={types} known={known} invalid={touched && !materials.length && !plantCodes.length} />}
          </Field>
          <Field label="Plants" hint={materials.length ? 'Optional when materials are entered.' : 'Required unless a material is entered.'}>
            {(id) => <PlantPicker id={id} values={plantCodes} onChange={setPlantCodes} state={plantsState} invalid={touched && !materials.length && !plantCodes.length} />}
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From date">{(id) => <input id={id} type="date" className={inputCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To date">{(id) => <input id={id} type="date" className={inputCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}</Field>
          <Field label="Freight look-back (days)" hint="days back from today, sent to SAP as typed">
            {(id) => <input id={id} inputMode="numeric" className={inputCls} value={freightDays} onChange={(e) => setFreightDays(e.target.value.replace(/\D/g, ''))} onBlur={() => setFreightDays(String(freightDaysValue(freightDays || DEFAULT_FREIGHT_DAYS)))} />}
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={inclFrt} onChange={(e) => { setInclTouched(true); setInclPicked(e.target.checked); }} /> Include freight</label>
          <div className="sm:col-span-2 lg:col-span-4">
            <span className="mb-1 block text-xs font-semibold text-muted">Material types</span>
            <div className="flex flex-wrap gap-3 pt-1">
              {FREIGHT_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} /> {FREIGHT_TYPE_LABEL[t]}</label>
              ))}
            </div>
          </div>
        </div>
        {touched && missing && <p role="alert" className="text-xs font-semibold text-bad">{missing}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={start} disabled={runner.status === 'running'}><Play size={14} /> Execute</Button>
          {runner.status === 'running' && <Button type="button" variant="ghost" onClick={runner.cancel}><Square size={14} /> Cancel ({fmtMs(runner.elapsed)})</Button>}
          <span className="text-xs text-faint">{runner.status === 'running' ? step : 'A plant, or materials, or both. Every PO freight line of the date range is read per plant.'}</span>
        </div>
      </Card>

      <Card title={<span className="inline-flex items-center gap-1.5"><BellRing size={15} /> Alert rule</span>} bodyClass="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Rule" className="min-w-[22rem] flex-1">
            {(id) => (
              <select id={id} className={inputCls} value={rule.kind} onChange={(e) => setRule((r) => ({ ...r, kind: e.target.value as RuleKind }))}>
                {RULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </Field>
          {ruleInfo.needsThreshold && (
            <Field label={`X (${ruleInfo.unit})`} className="w-32">
              {(id) => <input id={id} inputMode="decimal" className={inputCls} value={rule.threshold} onChange={(e) => setRule((r) => ({ ...r, threshold: e.target.value }))} />}
            </Field>
          )}
        </div>
        <p className="text-xs text-muted">{ruleInfo.hint} Applied on screen to the loaded rows; changing it does not call SAP again.</p>
      </Card>

      {runner.status === 'error' && runner.error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" /><span className="min-w-0 break-words">{runner.error.message}</span>
        </div>
      )}
      {runner.status === 'running' && !runner.data && <p className="text-sm text-muted">{step || 'Working…'} {fmtMs(runner.elapsed)}</p>}
      {runner.data && ran && <Results data={runner.data} ran={ran} rule={rule} stale={runner.status === 'running'} />}
      {runner.status === 'idle' && <Empty title="No analysis yet">Pick materials (ROH, PKGN, VERP) or plants, set the PO date range, then choose Execute.</Empty>}
    </PlanFrame>
  );
}

function Results({ data, ran, rule, stale }: { data: AnalysisData; ran: AnalysisInput; rule: Rule; stale: boolean }) {
  const [show, setShow] = useState<Show>('all');
  const [plant, setPlant] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('component');
  const analysed = useMemo(() => analyseFreight(data.components, data.freight, ran.range), [data.components, data.freight, ran.range]);
  const plantList = useMemo(() => Array.from(new Set(analysed.map((r) => r.plant))).sort(), [analysed]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = analysed.filter((r) => (!plant || r.plant === plant) && (show === 'all' || breaches(r, rule)) && (!t || `${r.material} ${r.text}`.toLowerCase().includes(t)));
    return sortAnalysis(list, rule);
  }, [analysed, plant, show, q, rule]);
  const totals = useMemo(() => analysisTotals(analysed, rule), [analysed, rule]);
  // Purchase order wise: one row per PO freight line of the components, same range, same rule, same filters.
  const allPo = useMemo(() => poLines(data.components, data.freight, ran.range), [data.components, data.freight, ran.range]);
  const poRows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = allPo.filter((r) => (!plant || r.plant === plant) && (show === 'all' || breaches(r, rule)) && (!t || `${r.material} ${r.text} ${r.po}`.toLowerCase().includes(t)));
    return sortPoLines(list, rule);
  }, [allPo, plant, show, q, rule]);
  const poFlagged = useMemo(() => allPo.filter((r) => breaches(r, rule)).length, [allPo, rule]);
  /** the PO lines of one component: switches to the PO view filtered to it */
  const openPos = (r: { plant: string; material: string }) => { setPlant(r.plant); setQ(r.material); setShow('all'); setView('po'); };

  const doExport = async (fmt: 'xlsx' | 'csv') => {
    const sheet = view === 'po' ? poLinesSheet(poRows, rule) : freightAnalysisSheet(rows, rule);
    await exportTable({
      fmt, name: view === 'po' ? 'Freight analysis PO wise' : 'Freight analysis', cols: sheet.cols, count: sheet.count,
      extraParams: [
        ['Report', view === 'po' ? 'Purchase order wise freight lines of the components, INR per unit' : 'Component standard vs actual freight, plant wise, INR per unit'],
        ['Materials', ran.materials.length ? ran.materials.join(', ') : 'all components of the chosen plants'], ['Plants', plant || (ran.plants.length ? ran.plants.join(', ') : 'all plants you can use')], ['Material types', ran.types.join(', ')],
        ['PO date range', `${ran.range.from} to ${ran.range.to}`], ['Alert rule', ruleText(rule)],
        ['Rows', String(view === 'po' ? poRows.length : rows.length)], ['Rows in alert', String(view === 'po' ? poFlagged : totals.flagged)],
      ],
      messages: data.messages,
    });
  };

  if (!data.components.length) return <Empty title="No components">{data.basis === 'materials' ? <>SAP returned no {ran.types.join(' / ')} component for the picked materials{ran.plants.length ? ` in plant ${ran.plants.join(', ')}` : ''}.</> : <>SAP returned no {ran.types.join(' / ')} component for plant {ran.plants.join(', ')}.</>}</Empty>;
  return (
    <div className={cx('flex flex-col gap-3', stale && 'opacity-60')}>
      {data.skipped.length > 0 && <p role="status" className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">No {ran.types.join(' / ')} component returned for: {data.skipped.join(', ')}.</p>}
      <div role="status" className={cx('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold', totals.flagged ? 'border-bad/40 bg-bad/[0.06] text-bad' : 'border-good/40 bg-good/[0.06] text-good')}>
        <BellRing size={15} />
        {view === 'po'
          ? (poFlagged ? `${poFlagged} of ${allPo.length} purchase order line(s) breach the rule: ${ruleText(rule)}` : `No purchase order line breaches the rule: ${ruleText(rule)}`)
          : (totals.flagged ? `${totals.flagged} of ${totals.rows} component(s) breach the rule: ${ruleText(rule)}` : `No component breaches the rule: ${ruleText(rule)}`)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Components" value={totals.rows} sub={`${fmtMs(data.ms)} in SAP · ${data.calls} call(s)`} />
        <Stat label="In alert" value={totals.flagged} tone={totals.flagged ? 'bad' : 'good'} sub="by the chosen rule" />
        <Stat label="Actual above standard" value={totals.above} sub="components" />
        <Stat label="Actual below standard" value={totals.below} sub="components" />
        <Stat label="No actual freight" value={totals.noActual} sub="no actual PO delivery in the range" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
<div className="w-72"><Segmented<View> size="sm" label="View" value={view} onChange={setView} options={[{ value: 'component', label: 'By component' }, { value: 'po', label: `By purchase order (${allPo.length})` }]} /></div>
        <div className="w-56"><Segmented<Show> size="sm" label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'alerts', label: 'Alerts only' }]} /></div>
        <select aria-label="Plant" className={cx(inputCls, 'w-44')} value={plant} onChange={(e) => setPlant(e.target.value)}>
          <option value="">All plants ({plantList.length})</option>
          {plantList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input aria-label="Search components" className={cx(inputCls, 'w-64')} placeholder={view === 'po' ? 'Search component, description or PO number…' : 'Search component code or description…'} value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" onClick={() => doExport('xlsx')} disabled={view === 'po' ? !poRows.length : !rows.length}><FileSpreadsheet size={14} /> Excel</Button>
        <Button size="sm" variant="ghost" onClick={() => doExport('csv')} disabled={view === 'po' ? !poRows.length : !rows.length}>CSV</Button>
        <span className="ml-auto text-xs text-faint">Alerts first, then the biggest gap.</span>
      </div>
      {view === 'po' ? (
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Purchase order wise freight lines: standard and actual freight per unit, INR</caption>
          <thead className="bg-sunken/60">
            <tr><th className={th}>Plant</th><th className={th}>Component</th><th className={th}>Purchase order</th><th className={th}>Line</th><th className={th}>PO date</th><th className={th}>Condition</th><th className={thN}>Delivered qty</th><th className={thN}>Actual amount (INR)</th><th className={thN}>Actual / unit</th><th className={thN}>Standard / unit</th><th className={thN}>Variance</th><th className={thN}>Var %</th><th className={th}>SAP used</th><th className={th}>Status</th></tr>
          </thead>
          <tbody>
            {poRows.map((r) => {
              const hit = breaches(r, rule);
              const tone = r.variance?.gt('0.000001') ? 'text-bad' : r.variance?.lt('-0.000001') ? 'text-good' : 'text-muted';
              return (
                <tr key={r.key} className={cx('border-t border-line/60', hit && 'bg-bad/[0.06]')}>
                  <td className={cx(td, 'font-mono')}>{r.plant}</td>
                  <td className={td}><span className="font-mono font-bold text-accent">{r.material}</span> <span className="text-muted">{r.text}</span></td>
                  <td className={cx(td, 'whitespace-nowrap font-mono font-bold')}>{r.po || '—'}</td>
                  <td className={cx(td, 'font-mono')}>{r.line || '—'}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{r.poDate}</td>
                  <td className={cx(td, 'font-mono')}>{r.cond || '—'}</td>
                  <td className={tdN}>{r.actualQty.gt(0) ? <>{fmtNum(r.actualQty, 3)} <span className="text-2xs text-muted">{r.unit}</span></> : <span className="text-faint">—</span>}</td>
                  <td className={tdN}>{r.actualQty.gt(0) ? fmtNum(r.actualAmount, 2, 'INR') : '—'}</td>
                  <td className={tdN}>{r.actual ? inr(r.actual) : <span className="text-faint" title="No actual delivery on this PO line">—</span>}</td>
                  <td className={tdN}>{r.standard ? inr(r.standard) : '—'}</td>
                  <td className={cx(tdN, 'font-bold', tone)}>{r.variance ? fmtSigned(r.variance, 4) : '—'}</td>
                  <td className={cx(tdN, tone)}>{r.variancePct ? fmtPct(r.variancePct) : '—'}</td>
                  <td className={td}>{r.src || '—'}</td>
                  <td className={td}>{hit ? <Pill tone="bad">Alert</Pill> : r.actual ? <Pill tone="good">OK</Pill> : <Pill tone="neutral" title="No actual delivery on this PO line">No actual</Pill>}</td>
                </tr>
              );
            })}
            {!poRows.length && <tr><td colSpan={14} className="px-3 py-6 text-center text-muted">{allPo.length ? 'Nothing matches the filter.' : 'SAP returned no purchase order freight lines for these components in the date range.'}</td></tr>}
          </tbody>
        </table>
      </div>
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-sunken/60">
            <tr><th className={th}>Plant</th><th className={th}>Component</th><th className={th}>Type</th><th className={thN}>Standard / unit</th><th className={thN}>Actual / unit</th><th className={thN}>Variance</th><th className={thN}>%</th><th className={thN}>PO lines</th><th className={th}>Last PO</th><th className={th}>Alert</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const hit = breaches(r, rule);
              const tone = r.variance?.gt('0.000001') ? 'text-bad' : r.variance?.lt('-0.000001') ? 'text-good' : 'text-muted';
              return (
                <tr key={r.key} className={cx('border-t border-line/60', hit && 'bg-bad/[0.06]')}>
                  <td className={cx(td, 'font-mono')}>{r.plant}</td>
                  <td className={td}><span className="font-mono font-bold text-accent">{r.material}</span> <span className="text-muted">{r.text}</span></td>
                  <td className={td}>{r.mtart}</td>
                  <td className={tdN}>{r.standard ? inr(r.standard) : '—'}</td>
                  <td className={tdN}>{r.actual ? inr(r.actual) : <span className="text-faint" title="No actual PO delivery in the date range">—</span>}</td>
                  <td className={cx(tdN, 'font-bold', tone)}>{r.variance ? fmtSigned(r.variance, 4) : '—'}</td>
                  <td className={cx(tdN, tone)}>{r.variancePct ? fmtPct(r.variancePct) : '—'}</td>
                  <td className={tdN}>{r.pos ? <button type="button" className="font-semibold text-accent underline-offset-2 hover:underline" onClick={() => openPos(r)} aria-label={`Show the ${r.pos} purchase order line(s) of ${r.material} in plant ${r.plant}`}>{r.pos}</button> : r.pos}</td>
                  <td className={cx(td, 'whitespace-nowrap')}>{r.lastPo || '—'}</td>
                  <td className={td}>{hit ? <Pill tone="bad">Alert</Pill> : r.actual ? <Pill tone="good">OK</Pill> : <Pill tone="neutral" title="No actual PO delivery in the range">No actual</Pill>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-muted">Nothing matches the filter.</td></tr>}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-muted">INR per base unit, weighted by delivered quantity over the PO lines dated {ran.range.from} to {ran.range.to}; delivery costs are taken as local currency and converted at SAP&apos;s FxInr. A component with no actual delivery in the range has no actual figure and is not flagged. Lines SAP excludes are left out.</p>
    </div>
  );
}
