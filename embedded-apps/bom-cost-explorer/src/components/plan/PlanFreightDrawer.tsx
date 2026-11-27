'use client';
/**
 * Production Plan > breakup > click Freight/pc: everything about the freight of that component in that plant.
 *  1. How the plan's freight was calculated: SAP's freight per component unit and source, the PO freight rows it came from by condition type
 *     (FreightBreakupPanel, reconciled to the plan line), then per FG piece (x component qty per FG piece) and the plan value (x plan quantity).
 *  2. Freight analysis of the component in the plant (same request and maths as the Freight analysis screen): weighted actual vs standard per unit,
 *     every PO line with vendor, origin, transporter, actual and standard quantity / value / per unit and the variance; a PO line opens every posting.
 * Read-only; the analysis loads when the drawer opens (range: last 12 months, changeable).
 */
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button, Drawer, Pill, Segmented, Spinner, Stat, cx } from '../ui';
import type { CostLine } from '@/lib/sap/fields';
import type { PlanCostLine } from '@/lib/plan/fields';
import type { PlanCostQuery } from '@/lib/plan/requests';
import { FREIGHT_BREAKUP_ENABLED, freightKeyOf, selectedRows } from '@/lib/freight/breakup';
import { useFreightBreakup } from '@/lib/freight/useFreightBreakup';
import { DEFAULT_RULE, poLinesSheet } from '@/lib/freight/analysis';
import type { PoLineKey } from '@/lib/freight/poBreakup';
import { exportTable } from '@/lib/client/export';
import { RANGE_PRESETS, fetchCompFreight, planFreightCalc, rangeOf, type CompFreight, type RangePreset } from '@/lib/plan/freightDetail';
import { fmtDate, fmtNum, fmtPct, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { sourceLabel } from '@/lib/rates/sourceLabel';
import type { FreightTagged } from '@/lib/cost/freightIncluded';

const Panel = dynamic(() => import('../freight/FreightBreakup').then((m) => m.FreightBreakupPanel), { ssr: false, loading: () => <p className="text-xs text-muted">Loading…</p> });
const PoBreakupDrawer = dynamic(() => import('../freight/PoBreakupDrawer'), { ssr: false });

const th = 'px-2.5 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const thN = `${th} text-right`;
const td = 'px-2.5 py-1.5 align-top';
const tdN = `${td} num whitespace-nowrap text-right`;
const inr = (v: Parameters<typeof fmtNum>[0]) => fmtNum(v, 4, 'INR');
const strip = (v: string) => String(v ?? '').trim().replace(/^0+(?=\d)/, '');

type Load = { status: 'loading' } | { status: 'done'; data: CompFreight } | { status: 'error'; error: string };

export default function PlanFreightDrawer({ line, ranQuery, onClose }: { line: PlanCostLine | null; ranQuery: PlanCostQuery | null; onClose: () => void }) {
  return (
    <Drawer open={!!line} onClose={onClose} width={1320} title={line ? <div><div className="text-base font-bold">Freight · <span className="font-mono">{line.Idnrk}</span> {line.Maktx}</div><div className="text-xs text-muted">Component plant {line.Werks || line.Hwerks} · plan material {line.Headmat} {line.Headtxt} · plant {line.Hwerks}</div></div> : 'Freight'}>
      {line && <Body key={`${line.Hwerks}|${line.Headmat}|${line.Seqnr}`} line={line} ranQuery={ranQuery} />}
    </Drawer>
  );
}

function Body({ line, ranQuery }: { line: PlanCostLine; ranQuery: PlanCostQuery | null }) {
  const werks = line.Werks || line.Hwerks;
  const run = useMemo(() => ({ freightDays: ranQuery?.freightDays ?? 0, stdFrt: !!ranQuery?.stdFrt }), [ranQuery]);
  const calc = useMemo(() => planFreightCalc(line), [line]);
  const used = useFreightBreakup(FREIGHT_BREAKUP_ENABLED ? freightKeyOf(line as unknown as CostLine, run) : null, true);
  const usedPos = useMemo(() => new Set((used.status === 'ready' ? selectedRows(used.rows) : []).map((r) => `${strip(r.Purchasedocument)}|${strip(r.Purchaseline)}`)), [used]);

  const [months, setMonths] = useState<RangePreset>(12);
  const range = useMemo(() => rangeOf(months), [months]);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [openLine, setOpenLine] = useState<PoLineKey | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setLoad({ status: 'loading' });
    fetchCompFreight({ material: line.Idnrk, plant: werks, text: line.Maktx, mtart: line.Mtart }, range, { signal: c.signal })
      .then((data) => { if (!c.signal.aborted) setLoad({ status: 'done', data }); })
      .catch((e: Error) => { if (!c.signal.aborted) setLoad({ status: 'error', error: e.message || 'SAP did not answer.' }); });
    return () => c.abort();
  }, [line.Idnrk, line.Maktx, line.Mtart, werks, range, attempt]);

  const data = load.status === 'done' ? load.data : null;
  const s = data?.summary ?? null;
  const vtone = s?.variance?.gt('0.000001') ? 'bad' : s?.variance?.lt('-0.000001') ? 'good' : undefined;
  const doExport = (fmt: 'xlsx' | 'csv') => {
    if (!data) return;
    const sheet = poLinesSheet(data.lines, DEFAULT_RULE);
    void exportTable({
      fmt, name: `Freight ${line.Idnrk} ${werks}`, cols: sheet.cols, count: sheet.count,
      extraParams: [['Report', 'Freight of a plan component: every PO line, actual vs standard (as Freight analysis)'], ['Component', `${line.Idnrk} ${line.Maktx}`], ['Plant', werks],
        ['Plan material', `${line.Headmat} ${line.Headtxt}`], ['PO dates', `${range.from} to ${range.to}`], ['Freight / unit on the plan line (INR)', calc.perUnit.toFixed(4)], ['Source', line.FrtSrc || '']],
    });
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* ---------- 1. how the plan's freight was calculated ---------- */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">1 · How the plan&apos;s freight was calculated</h3>
        {(line as FreightTagged).FrtIncluded && <p className="rounded-lg border border-line bg-sunken/40 px-3 py-2 text-xs text-muted">The line is priced on {sourceLabel(line.SelSource)}, which already includes freight: the freight below is information only and is not added to the plan cost.</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Freight / unit (SAP)" value={<>₹ {fmtRate(calc.perUnit)}</>} sub={`per ${calc.unit || 'unit'} · ${line.FrtSrc || 'no source'}`} />
          <Stat label="Component qty / FG pc" value={calc.qtyPerFg ? fmtNum(calc.qtyPerFg, 6, 'X') : 'n/a'} sub={`${fmtQty(line.QtyTot)} ${line.Meins} ÷ ${fmtQty(line.PlanQty)} FG`} />
          <Stat label="Freight / FG piece" value={calc.perFg ? <>₹ {fmtRate(calc.perFg)}</> : 'n/a'} sub="freight / unit × qty per FG pc" />
          <Stat label="Plan quantity" value={fmtQty(calc.planQty)} sub={line.Meins} />
          <Stat label="Freight in the plan" value={<>₹ {fmtNum(calc.planValue, 0, 'INR')}</>} sub="freight / unit × plan quantity" />
        </div>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted">
          <li>SAP takes the freight of the {line.FrtSrc === 'STANDARD' ? 'standard (planned delivery cost)' : 'latest purchase order with an actual delivery'} of {line.Idnrk} in plant {werks}, by condition type (table below).</li>
          <li>Each condition: amount ÷ quantity = rate per unit, converted to the cost line&apos;s unit and to INR → per piece; the used rows add up to ₹ {fmtRate(calc.perUnit)} per {calc.unit}.</li>
          <li>× {calc.qtyPerFg ? fmtNum(calc.qtyPerFg, 6, 'X') : '—'} {calc.unit} per FG piece = ₹ {calc.perFg ? fmtRate(calc.perFg) : '—'} per FG piece; × {fmtQty(calc.planQty)} {calc.unit} planned = ₹ {fmtNum(calc.planValue, 2, 'INR')} in the plan.</li>
        </ol>
        {FREIGHT_BREAKUP_ENABLED
          ? <div className="rounded-2xl border border-line bg-panel p-3 shadow-card"><Panel line={line as unknown as CostLine} run={run} compactTitle /></div>
          : <p className="text-xs text-muted">The freight break-up by condition type is switched off in this build.</p>}
      </section>

      {/* ---------- 2. freight analysis of the component in the plant ---------- */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">2 · Freight analysis · {line.Idnrk} in plant {werks}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" label="PO dates" value={months} onChange={setMonths} options={RANGE_PRESETS.map((m) => ({ value: m, label: m === 60 ? '5 years' : `${m} months` }))} />
            <Button size="sm" variant="ghost" onClick={() => setAttempt((a) => a + 1)} title="Read again from SAP"><RefreshCw size={13} /></Button>
            <Button size="sm" onClick={() => doExport('xlsx')} disabled={!data?.lines.length}><FileSpreadsheet size={14} /> Excel</Button>
          </div>
        </div>
        {load.status === 'loading' && <p className="flex items-center gap-2 text-muted"><Spinner className="h-4 w-4" /> Reading every PO freight line of {range.from} to {range.to} from SAP…</p>}
        {load.status === 'error' && <p role="alert" className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/[0.06] px-3 py-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />{load.error}</p>}
        {data && (
          <>
            {data.messages.map((m) => <p key={m.message} className="rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs">{m.message}</p>)}
            {data.truncated && <p className="text-xs text-warn">Only the first 50,000 postings were read; choose a shorter period.</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Actual / unit (weighted)" value={s?.actual ? <>₹ {inr(s.actual)}</> : '—'} sub={s ? `${fmtQty(s.actualQty)} ${s.unit} delivered` : 'no delivery'} />
              <Stat label="Standard / unit (weighted)" value={s?.standard ? <>₹ {inr(s.standard)}</> : '—'} sub={s ? `${fmtQty(s.standardQty)} ${s.unit}` : '—'} />
              <Stat label="Variance / unit" value={s?.variance ? fmtSigned(s.variance, 4) : '—'} tone={vtone} sub="actual − standard" />
              <Stat label="Variance %" value={s?.variancePct ? fmtPct(s.variancePct) : '—'} tone={vtone} />
              <Stat label="PO lines" value={data.lines.length} sub={s?.lastPo ? `latest PO ${fmtDate(s.lastPo)}` : `${range.from} → ${range.to}`} />
            </div>
            <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-sunken/60"><tr>
                  <th className={th}>Purchase order</th><th className={th}>Line</th><th className={th}>PO date</th><th className={th}>Condition</th><th className={th}>Vendor</th><th className={th}>Origin</th><th className={th}>Transport</th>
                  <th className={thN}>Std qty</th><th className={thN}>Std value</th><th className={thN}>Actual qty</th><th className={thN}>Actual value</th>
                  <th className={thN}>Std / unit</th><th className={thN}>Actual / unit</th><th className={thN}>Var / unit</th><th className={thN}>Var %</th><th className={th}>SAP used</th>{data.postings && <th className={th}>Postings</th>}
                </tr></thead>
                <tbody>
                  {data.lines.map((r) => {
                    const inPlan = usedPos.has(`${strip(r.po)}|${strip(r.line)}`);
                    const vt = r.variance?.gt('0.000001') ? 'text-bad' : r.variance?.lt('-0.000001') ? 'text-good' : '';
                    return (
                      <tr key={r.key} className={cx('border-t border-line/60', inPlan && 'bg-accent/[0.07] font-semibold')}>
                        <td className={cx(td, 'font-mono')}>{r.po || '—'}{inPlan && <div><Pill tone="accent" title="The freight row the plan's costing used">Used in the plan</Pill></div>}</td>
                        <td className={cx(td, 'font-mono')}>{r.line}</td><td className={cx(td, 'whitespace-nowrap')}>{fmtDate(r.poDate)}</td><td className={cx(td, 'font-mono')}>{r.cond || '—'}</td>
                        <td className={td}>{r.vendor || r.vendorName ? <><span className="font-mono">{r.vendor}</span> <span className="text-muted">{r.vendorName}</span></> : '—'}</td>
                        <td className={td}>{r.placeOfSupply || '—'}</td><td className={td}>{r.transportMode || '—'}</td>
                        <td className={tdN}>{fmtQty(r.standardQty)}</td><td className={tdN}>{fmtNum(r.standardAmount, 2, 'INR')}</td>
                        <td className={tdN}>{fmtQty(r.actualQty)}</td><td className={tdN}>{fmtNum(r.actualAmount, 2, 'INR')}</td>
                        <td className={tdN}>{r.standard ? inr(r.standard) : '—'}</td><td className={tdN}>{r.actual ? inr(r.actual) : '—'}</td>
                        <td className={cx(tdN, vt)}>{r.variance ? fmtSigned(r.variance, 4) : '—'}</td><td className={cx(tdN, vt)}>{r.variancePct ? fmtPct(r.variancePct) : '—'}</td>
                        <td className={td}>{r.src ? <Pill tone={r.src === 'ACTUAL' ? 'good' : 'neutral'}>{r.src}</Pill> : '—'}</td>
                        {data.postings && <td className={td}><Button size="sm" variant="ghost" onClick={() => setOpenLine({ plant: r.plant, material: r.material, po: r.po, line: r.line, cond: r.cond })}>Breakup</Button></td>}
                      </tr>
                    );
                  })}
                  {!data.lines.length && <tr><td colSpan={17} className="px-3 py-6 text-center text-muted">SAP returned no purchase order freight lines for {line.Idnrk} in plant {werks} between {range.from} and {range.to}. Try a longer period.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-faint">Same request and figures as the Freight analysis screen: INR = document amount × FX rate; per unit = value ÷ delivered quantity (base unit); Standard Dr and Actual Cr postings count minus. The highlighted line is the PO freight the plan&apos;s costing used.</p>
            {data.postings && <PoBreakupDrawer rows={data.rows} target={openLine} text={line.Maktx} onClose={() => setOpenLine(null)} />}
          </>
        )}
      </section>
    </div>
  );
}
