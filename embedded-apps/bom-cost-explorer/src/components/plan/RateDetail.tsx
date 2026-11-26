'use client';
/**
 * Production Plan > Breakup > component drawer: every rate source of the component with the full calculation (lib/plan/rateDetail.ts), per component
 * unit, per FG piece or per 1,000 FG pieces. Opening the drawer reads, in parallel:
 *   - RateRowSet (Mode R) of the component in its plant, same look-back as the plan run: every price record SAP has;
 *   - RateOptionSet with the SAME request that costed this FG in the plan run (so its lines join the cost lines): the options the costing weighed.
 * Read only; the plan's figures never change.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Segmented, SourceBadge, Spinner, cx } from '../ui';
import { tdCls, tdNum, thCls, thNum } from './common';
import { fetchPagedSet } from '@/lib/sap/service';
import { defaultQuery } from '@/lib/query/schema';
import { fetchRateOptionsByFilter } from '@/lib/rates/options';
import { optionKey, type RateOptionRow } from '@/lib/rates/fields';
import { COSTING_TIMEOUT_MS } from '@/lib/sap/client';
import { costFilter, type PlanCostQuery } from '@/lib/plan/requests';
import type { PlanCall } from '@/lib/plan/batchRun';
import { optionCalc, rateCalc, type PlanLine } from '@/lib/plan/rateDetail';
import { sourceLabel } from '@/lib/rates/sourceLabel';
import { fmtDate, fmtNum, fmtQty } from '@/lib/format';
import type { RateRow } from '@/lib/sap/fields';
import { D, type Decimal } from '@/lib/cost/decimal';

type Basis = 'unit' | 'fg' | 'fg1000';
const tx = (v: string | null | undefined) => String(v ?? '').trim();

export default function RateDetail({ line, ranQuery, calls, loadedOptions }: { line: PlanLine; ranQuery: PlanCostQuery | null; calls: PlanCall[]; loadedOptions?: RateOptionRow[] }) {
  const [basis, setBasis] = useState<Basis>('fg1000');
  const [rec, setRec] = useState<{ status: 'loading' | 'done' | 'error'; rows: RateRow[]; error?: string }>({ status: 'loading', rows: [] });
  const [opt, setOpt] = useState<{ status: 'loading' | 'done' | 'error' | 'none'; rows: RateOptionRow[]; note?: string }>({ status: 'loading', rows: [] });
  const werks = tx(line.Werks) || tx(line.Hwerks);

  useEffect(() => {
    const c = new AbortController();
    setRec({ status: 'loading', rows: [] });
    const q = { ...defaultQuery('R'), materials: [tx(line.Idnrk)], plants: [werks], lookback: ranQuery?.lookback || 365 };
    fetchPagedSet<RateRow>(q as never, { signal: c.signal })
      .then((r) => setRec({ status: 'done', rows: r.rows }))
      .catch((e: Error) => { if (!c.signal.aborted) setRec({ status: 'error', rows: [], error: e.message }); });
    return () => c.abort();
  }, [line.Idnrk, werks, ranQuery?.lookback]);

  useEffect(() => {
    if (loadedOptions?.length) { setOpt({ status: 'done', rows: loadedOptions }); return; }
    if (!ranQuery) { setOpt({ status: 'none', rows: [], note: 'Run the plan costing first.' }); return; }
    // shared, cached costing request (the full "Rate sources" load uses the same one): never aborted from here, a stale answer is just ignored
    let live = true;
    setOpt({ status: 'loading', rows: [] });
    // the step that costed this FG (same filter -> same Seqnr), else the whole run's filter
    const call = calls.find((x) => (!x.werks || x.werks === line.Hwerks) && x.materials.includes(line.Headmat));
    const filter = call ? costFilter({ ...ranQuery, plants: call.werks ? [call.werks] : ranQuery.plants, materials: call.materials }) : costFilter(ranQuery);
    fetchRateOptionsByFilter(filter, { costing: true, timeoutMs: COSTING_TIMEOUT_MS })
      .then((r) => {
        if (!live) return;
        if ('unavailable' in r) { setOpt({ status: 'none', rows: [], note: r.reason }); return; }
        const k = optionKey(line);
        setOpt({ status: 'done', rows: r.rows.filter((o) => optionKey(o) === k) });
      })
      .catch((e: Error) => { if (live) setOpt({ status: 'error', rows: [], note: e.message }); });
    return () => { live = false; };
  }, [line, ranQuery, calls, loadedOptions]);

  const calc = useMemo(() => rateCalc(line, rec.rows), [line, rec.rows]);
  const opts = useMemo(() => optionCalc(line, opt.rows), [line, opt.rows]);
  const mult = basis === 'fg1000' ? D(1000) : D(1);
  const shown = (perUnit: Decimal, perFg: Decimal | null): Decimal | null => (basis === 'unit' ? perUnit : perFg ? perFg.times(mult) : null);
  const basisLabel = basis === 'unit' ? `per ${tx(line.Meins) || 'unit'} of component` : basis === 'fg' ? 'per FG piece' : 'per 1,000 FG pieces';
  const money = (v: Decimal | null, dp = 4) => (v === null ? '—' : fmtNum(v.toFixed(6), dp));
  const sel = calc.selected;
  const best = calc.rows.length ? calc.rows.reduce((b, r) => (r.landedInr.lt(b.landedInr) && r.landedInr.gt(0) ? r : b)) : null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">Rate sources and calculation</h4>
        <Segmented label="Basis" size="sm" value={basis} onChange={setBasis} options={[{ value: 'unit' as const, label: `Per ${tx(line.Meins) || 'unit'}` }, { value: 'fg' as const, label: 'Per FG pc' }, { value: 'fg1000' as const, label: 'Per 1,000 FG' }]} />
      </div>
      <p className="text-2xs text-muted">
        Component quantity per FG piece = plan quantity {fmtQty(line.QtyTot)} {line.Meins} ÷ FG planned {fmtQty(line.PlanQty)} = <b className="text-ink">{calc.qtyPerFg ? `${fmtNum(calc.qtyPerFg.toFixed(8), 6)} ${line.Meins}` : 'n/a (no planned quantity)'}</b>
        {calc.qtyPerFg && <> · per 1,000 FG = {fmtNum(calc.qtyPerFg.times(1000).toFixed(6), 4)} {line.Meins}</>}
      </p>

      {sel && (
        <div className="rounded-xl border border-good/40 bg-good/5 p-3 text-xs">
          <p className="mb-1.5 font-bold">How SAP&apos;s selected rate becomes the plan cost ({sourceLabel(sel.source)}{sel.vendorName ? ` · ${sel.vendorName}` : ''})</p>
          <ol className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 num">
            <Step t={`Price in SAP (${sel.cond}${sel.doc ? ` · ${sel.doc}` : ''})`} v={`${money(sel.rate)} ${sel.currency} / ${fmtNum(sel.pricingUnit.toFixed(3), 0, 'X')} ${sel.condUnit}`} />
            <Step t={`÷ pricing unit ${fmtNum(sel.pricingUnit.toFixed(3), 0, 'X')}`} v={`${money(sel.perCondUnit, 6)} ${sel.currency} / ${sel.condUnit}`} />
            <Step t={`× unit conversion ${sel.condUnit} → ${sel.baseUom}${sel.convFactor ? ` (${fmtNum(sel.convFactor.toFixed(8), 6)})` : ''}`} v={`${money(sel.perUnit, 6)} ${sel.currency} / ${sel.baseUom}`} />
            <Step t={`× exchange rate to INR (${fmtNum(sel.fxInr.toFixed(6), 5)})`} v={`${money(sel.perUnitInr, 6)} INR / ${sel.baseUom}`} />
            <Step t={sel.freightIncluded ? `+ freight: not added (${sourceLabel(sel.source)} already includes it)` : `+ freight per ${sel.baseUom} (${line.FrtSrc || 'none'})`} v={`${money(sel.freightInr, 6)} INR`} />
            <Step t={`= landed cost per ${sel.baseUom}`} v={`${money(sel.landedInr, 6)} INR`} strong />
            {calc.qtyPerFg && <Step t={`× ${fmtNum(calc.qtyPerFg.toFixed(8), 6)} ${line.Meins} per FG piece`} v={`${money(sel.perFg, 6)} INR / FG pc · ${money(sel.perFg ? sel.perFg.times(1000) : null, 2)} INR / 1,000 FG`} strong />}
            <Step t={`× plan quantity ${fmtQty(line.QtyTot)} ${line.Meins}`} v={`${money(sel.planCost, 2)} INR on the plan`} strong />
          </ol>
          {calc.check && !calc.check.abs().lt('0.0001') && <p className="mt-1 text-2xs text-warn">The plan line&apos;s cost per unit is {fmtNum(line.TotCostPcInr, 6)} INR ({calc.check.gt(0) ? 'below' : 'above'} this by {fmtNum(calc.check.abs().toFixed(6), 6)}): SAP costed with a rate record that differs slightly from the current one (date or rounding).</p>}
        </div>
      )}
      {!sel && rec.status === 'done' && <p className="text-xs text-muted">{line.SelSource ? `SAP selected ${sourceLabel(line.SelSource)}, but no matching rate record came back for ${line.Idnrk} in ${werks}.` : 'SAP found no rate for this component.'}</p>}

      <div>
        <p className="mb-1 flex items-center gap-2 text-xs font-semibold">Every rate record in SAP ({werks}, look-back {ranQuery?.lookback || 365} days) · {basisLabel}{rec.status === 'loading' && <Spinner className="h-3 w-3" />}</p>
        {rec.status === 'error' && <p className="text-xs text-bad">{rec.error}</p>}
        {rec.status === 'done' && !calc.rows.length && <p className="text-xs text-muted">SAP returned no rate records.</p>}
        {calc.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="bg-sunken"><tr>
                <th className={thCls}>Source</th><th className={thCls}>Vendor / document</th><th className={thCls}>Valid</th><th className={thNum}>Price in SAP</th><th className={thNum}>Per base unit</th><th className={thNum}>FX → INR</th><th className={thNum}>INR / unit</th><th className={thNum}>+ Freight</th><th className={thNum}>Landed / unit</th><th className={thNum}>{basis === 'unit' ? 'Landed / unit' : basisLabel}</th><th className={thNum}>On the plan</th><th className={thNum}>vs selected</th>
              </tr></thead>
              <tbody>
                {calc.rows.map((r) => (
                  <tr key={r.key} className={cx('border-t border-line/50', r.selected && 'bg-good/10 font-semibold')}>
                    <td className={tdCls}><SourceBadge source={r.source} />{r.selected && <span className="ml-1 rounded bg-good/20 px-1 text-[10px] font-bold text-good">selected</span>}{best === r && !r.selected && <span className="ml-1 rounded bg-accent/15 px-1 text-[10px] font-bold text-accent">cheapest</span>}</td>
                    <td className={cx(tdCls, 'max-w-[170px] truncate')} title={`${r.vendor} ${r.vendorName} ${r.doc}`}>{r.vendorName ? `${r.vendorName} (${r.vendor})` : '—'}{r.doc && <span className="text-faint"> · {r.doc}</span>}{r.cond && <span className="text-faint"> · {r.cond}</span>}</td>
                    <td className={cx(tdCls, 'text-2xs')}>{fmtDate(r.validFrom) || '—'}{r.validTo && r.validTo !== r.validFrom ? <><br />to {r.validTo >= '9999' ? 'unlimited' : fmtDate(r.validTo)}</> : ''}</td>
                    <td className={tdNum}>{money(r.rate)} {r.currency} / {fmtNum(r.pricingUnit.toFixed(3), 0, 'X')} {r.condUnit}</td>
                    <td className={tdNum}>{money(r.perUnit, 4)} / {r.baseUom}</td>
                    <td className={tdNum}>{fmtNum(r.fxInr.toFixed(6), 4)}</td>
                    <td className={tdNum}>{money(r.perUnitInr, 4)}</td>
                    <td className={tdNum} title={r.freightIncluded ? 'Not added: this source already includes freight' : undefined}>{r.freightIncluded ? <span className="text-faint">incl.</span> : money(r.freightInr, 4)}</td>
                    <td className={cx(tdNum, 'font-semibold')}>{money(r.landedInr, 4)}</td>
                    <td className={cx(tdNum, 'font-semibold')}>{money(shown(r.landedInr, r.perFg), basis === 'fg1000' ? 2 : 6)}</td>
                    <td className={tdNum}>{money(r.planCost, 0)}</td>
                    <td className={cx(tdNum, r.selected || r.diffPlan.abs().lt('0.5') ? 'text-faint' : r.diffPlan.gt(0) ? 'text-bad' : 'text-good')}>{r.selected ? '—' : `${r.diffPlan.gt(0) ? '+' : ''}${money(r.diffPlan, 0)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 flex items-center gap-2 text-xs font-semibold">Options the costing weighed (SAP rate options of this line) · {basisLabel}{opt.status === 'loading' && <><Spinner className="h-3 w-3" /> <span className="font-normal text-muted">reading with the same request that costed this FG…</span></>}</p>
        {(opt.status === 'error' || opt.status === 'none') && <p className="text-xs text-muted">{opt.note}</p>}
        {opt.status === 'done' && !opts.length && <p className="text-xs text-muted">SAP returned no rate options for this line.</p>}
        {opts.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-sunken"><tr><th className={thCls}>Source</th><th className={thCls}>Plant</th><th className={thCls}>Cond</th><th className={thNum}>Rate</th><th className={thNum}>FX → INR</th><th className={thNum}>INR / unit</th><th className={thNum}>+ Freight</th><th className={thNum}>Landed / unit</th><th className={thNum}>{basis === 'unit' ? 'Landed / unit' : basisLabel}</th><th className={thNum}>On the plan</th><th className={thCls}>Valid from</th></tr></thead>
              <tbody>
                {opts.map((x, i) => (
                  <Fragment key={i}>
                    <tr className={cx('border-t border-line/50', x.selected && 'bg-good/10 font-semibold')}>
                      <td className={tdCls}><SourceBadge source={x.o.Source} />{x.selected && <span className="ml-1 rounded bg-good/20 px-1 text-[10px] font-bold text-good">selected</span>}</td>
                      <td className={tdCls}>{x.o.Plant}</td><td className={tdCls}>{x.o.Cond}</td>
                      <td className={tdNum}>{fmtNum(x.o.Rate, 4)} {x.o.Curr}</td><td className={tdNum}>{fmtNum(x.o.FxInr, 5)}</td>
                      <td className={tdNum}>{money(x.perUnitInr, 6)}</td><td className={tdNum}>{money(x.freightInr, 6)}</td><td className={cx(tdNum, 'font-semibold')}>{money(x.landedInr, 6)}</td>
                      <td className={cx(tdNum, 'font-semibold')}>{money(shown(x.landedInr, x.perFg), basis === 'fg1000' ? 2 : 6)}</td><td className={tdNum}>{money(x.planCost, 0)}</td><td className={tdCls}>{fmtDate(x.o.ValidFrom) || '—'}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-2xs text-faint">Freight is the component&apos;s freight as SAP sends it ({fmtNum(String(line.FrtPcInrSap ?? line.FrtPcInr), 6)} INR / {line.Meins}); it is never added to Consumption or C-MAP rates, which already include it. &quot;On the plan&quot; = landed per unit × plan quantity; &quot;vs selected&quot; = that minus the plan line&apos;s cost.</p>
    </div>
  );
}

function Step({ t, v, strong }: { t: string; v: string; strong?: boolean }) {
  return <><li className={cx('list-none text-muted', strong && 'font-semibold text-ink')}>{t}</li><span className={cx('text-right', strong && 'font-bold')}>{v}</span></>;
}
