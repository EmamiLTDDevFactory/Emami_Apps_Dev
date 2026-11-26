'use client';
/** Cost breakup of a BOM line: the approved budget rate of the material (ZCOMPONENT) and the packing budget build-up (ZPKG_BUD_ITEM) beside the rate used in this costing. Read-only. */
import { useEffect, useMemo, useState } from 'react';
import type Decimal from 'decimal.js';
import { Drawer, Spinner, cx } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchRigid } from '@/lib/rigid/service';
import { breakupOfRate, budgetYearOf, currentYearRates, parseBudget, type BudgetBreakup } from '@/lib/rigid/analysis';
import { tdCls, thCls } from '../dash/parts';

export interface RigidItem { matnr: string; maktx: string; werks: string }
export interface CockpitRate { ratePc: Decimal | null; sourceLabel: string }
const f = (d: Decimal | null | undefined, dp = 4) => (d ? d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '-');

export default function CostBreakupDrawer({ item, cockpit, onClose }: { item: RigidItem; cockpit: CockpitRate; onClose: () => void }) {
  const [data, setData] = useState<BudgetBreakup | null>(null);
  const [allPlants, setAllPlants] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController(); setBusy(true); setError(''); setData(null);
    fetchRigid({ matnr: [item.matnr], werks: allPlants ? '' : item.werks, mode: 'B' }, c.signal).then((r) => setData(parseBudget(r.rows))).catch((e) => { if (!c.signal.aborted) setError(errorText(e)); }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [item.matnr, item.werks, allPlants]);
  const year = budgetYearOf();
  const cur = useMemo(() => (data ? currentYearRates(data) : []), [data]);
  const latestYear = data?.d[0]?.gjahr ?? '';
  // budget of the current budget year only (SAP lists the newest validity first)
  const bpc = cur.length && cur[0].landed.gt(0) ? cur[0].landed.div(cur[0].priceUnit) : null;
  const diff = bpc && cockpit.ratePc ? cockpit.ratePc.minus(bpc) : null;
  const pct = diff && bpc && bpc.gt(0) ? diff.div(bpc).times(100) : null;
  return (
    <Drawer open onClose={onClose} width={900} title={<div><div className="text-sm font-bold">Cost breakup (budget): <span className="font-mono">{item.matnr.replace(/^0+/, '')}</span> {item.maktx}</div><div className="text-2xs text-muted">Approved budget rate and the packing budget build-up · plant {allPlants ? 'all' : item.werks}</div></div>}>
      {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the budget of this material from SAP</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {data && (
        <div className="flex flex-col gap-4">
          {!data.d.length && !data.p.length && (
            <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">SAP has no budget rate (ZCOMPONENT) and no packing budget build-up for this material{allPlants ? '' : ` in plant ${item.werks}`}.{' '}
              {!allPlants && <button type="button" className="font-bold underline" onClick={() => setAllPlants(true)}>Look in all plants</button>}</p>
          )}
          {data.d.length > 0 && !cur.length && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">No budget rate (ZCOMPONENT) for the current budget year {year}{latestYear ? `; the latest SAP has is ${latestYear}` : ''}.</p>}
          {cur.length > 0 && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Budget landed / pc</div><div className="num text-lg font-extrabold">{f(bpc)}</div><div className="text-2xs text-muted">budget year {cur[0].gjahr}, price unit {cur[0].priceUnit.toString()} {cur[0].uom}</div></div>
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Rate in this costing / pc</div><div className="num text-lg font-extrabold">{f(cockpit.ratePc)}</div><div className="text-2xs text-muted">{cockpit.sourceLabel || 'selected rate'}, without freight</div></div>
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Costing minus budget</div>
                  <div className={cx('num text-lg font-extrabold', !diff ? '' : diff.gt(0) ? 'text-bad' : diff.lt(0) ? 'text-good' : '')}>{diff ? `${diff.gt(0) ? '+' : ''}${f(diff)}` : '-'}</div><div className="text-2xs text-muted">{pct ? `${pct.gt(0) ? '+' : ''}${pct.toFixed(1)} % of budget` : ''}</div></div>
              </div>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Year</th><th className={thCls}>Basic</th><th className={thCls}>Discount</th><th className={thCls}>Tax</th><th className={thCls}>Freight</th><th className={thCls}>Landed</th><th className={thCls}>Price unit</th><th className={thCls}>Budget qty</th><th className={cx(thCls, '!text-left')}>Valid</th></tr></thead>
                  <tbody>{cur.map((r, i) => (
                    <tr key={`${r.gjahr}-${r.validFrom}-${i}`} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">{r.gjahr}</td><td className={tdCls}>{f(r.basic)}</td><td className={tdCls}>{f(r.discount)}</td><td className={tdCls}>{f(r.tax)}</td><td className={tdCls}>{f(r.freight)}</td><td className={cx(tdCls, 'font-bold')}>{f(r.landed)}</td><td className={tdCls}>{r.priceUnit.toString()} {r.uom}</td><td className={tdCls}>{f(r.budqty, 0)}</td><td className="px-2.5 py-1.5 text-left text-xs">{r.validFrom ?? ''} to {r.validTo ?? ''}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          {data.p.map((h) => (
            <div key={`${h.item}-${h.scenario}`} className="flex flex-col gap-2">
              {cockpit.ratePc && cockpit.ratePc.gt(0) && h.comps.length > 0 && (() => {
                const b = breakupOfRate(h, cockpit.ratePc);
                return (
                  <>
                    <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Cost breakup of the rate in this costing ({cockpit.sourceLabel || 'selected'}, without freight)</h4>
                    <p className="text-2xs text-muted">{f(cockpit.ratePc)} / pc = {f(b.rate, 2)} per {b.priceUnit.toString()} {h.uom}, split by the cost-element % of the packing budget and each element adjusted by its ZBUD %: budgeted = rate × % × (1 + ZBUD %).</p>
                    <div className="overflow-auto rounded-xl border border-line">
                      <table className="w-full min-w-[760px] border-collapse">
                        <thead><tr><th className={cx(thCls, '!text-left')}>Cost element</th><th className={cx(thCls, '!text-left')}>Description</th><th className={thCls}>%</th><th className={thCls}>Rate share / {b.priceUnit.toString()}</th><th className={thCls}>ZBUD %</th><th className={thCls}>Budgeted / {b.priceUnit.toString()}</th><th className={thCls}>Budgeted / pc</th></tr></thead>
                        <tbody>
                          {b.lines.map((l) => (
                            <tr key={l.comp} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">{l.comp}</td><td className="px-2.5 py-1.5 text-left text-xs text-muted">{l.compTxt}</td>
                              <td className={tdCls}>{l.pct.toFixed(3)}</td><td className={tdCls}>{f(l.base, 4)}</td>
                              <td className={cx(tdCls, l.zbud.lt(0) ? 'text-good' : l.zbud.gt(0) ? 'text-bad' : '')}>{l.zbud.toFixed(3)}</td>
                              <td className={cx(tdCls, 'font-bold')}>{f(l.budgeted, 4)}</td><td className={tdCls}>{f(l.budgeted.div(b.priceUnit), 6)}</td></tr>
                          ))}
                          <tr className="border-t border-line bg-sunken/60 font-bold">
                            <td colSpan={2} className="px-2.5 py-1.5 text-right text-xs">Total</td>
                            <td className={cx(tdCls, b.pctTotal.minus(100).abs().lt(0.01) ? 'text-good' : 'text-bad')}>{b.pctTotal.toFixed(3)}</td>
                            <td className={tdCls}>{f(b.base, 4)}</td><td className={tdCls}>{b.changePct ? `${b.changePct.gt(0) ? '+' : ''}${b.changePct.toFixed(3)}` : ''}</td>
                            <td className={tdCls}>{f(b.budgeted, 4)}</td><td className={tdCls}>{f(b.budgetedPc, 6)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    {!b.pctTotal.minus(100).abs().lt(0.01) && <p className="text-2xs text-bad">The cost-element % add up to {b.pctTotal.toFixed(3)}, not 100: the packing budget of this item needs correcting.</p>}
                  </>
                );
              })()}
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Packing budget build-up as stored in SAP (scenario {h.scenario.replace(/^0+/, '')}, on SAP&apos;s basic rate)</h4>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[880px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Origin grp</th><th className={cx(thCls, '!text-left')}>ZBUD material</th><th className={thCls}>Basic (SAP)</th><th className={thCls}>Basic (used)</th><th className={thCls}>Budgeted</th><th className={thCls}>Variance</th><th className={thCls}>Var %</th><th className={thCls}>Freight / unit</th><th className={thCls}>Landed</th><th className={cx(thCls, '!text-left')}>Cur / per / UoM</th><th className={cx(thCls, '!text-left')}>Flag</th></tr></thead>
                  <tbody><tr className="border-t border-line/60">
                    <td className="px-2.5 py-1.5 text-left text-xs">{h.origin}</td><td className="px-2.5 py-1.5 text-left text-xs">{h.zbudMatnr}</td>
                    <td className={tdCls}>{f(h.rSap)}</td><td className={tdCls}>{f(h.rUsed)}</td><td className={cx(tdCls, 'font-bold')}>{f(h.budgeted)}</td>
                    <td className={cx(tdCls, h.variance.gt(0) ? 'text-bad' : h.variance.lt(0) ? 'text-good' : '')}>{f(h.variance)}</td>
                    <td className={cx(tdCls, h.varPct.gt(0) ? 'text-bad' : h.varPct.lt(0) ? 'text-good' : '')}>{h.varPct.toFixed(2)} %</td>
                    <td className={tdCls}>{h.frtTotal.gt(0) ? f(h.frtTotal) : '-'}</td><td className={tdCls}>{f(h.landedRate)}</td>
                    <td className="px-2.5 py-1.5 text-left text-xs">{h.curr} / {h.priceUnit.toString()} / {h.uom}</td>
                    <td className="px-2.5 py-1.5 text-left text-2xs">{h.flag === 'OK' ? '' : <span className="rounded-full bg-warn/15 px-1.5 py-0.5 font-bold text-warn">{h.flag}</span>}</td>
                  </tr></tbody>
                </table>
              </div>
              {h.comps.length > 0 && (
                <div className="overflow-auto rounded-xl border border-line">
                  <table className="w-full min-w-[880px] border-collapse">
                    <thead><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Description</th><th className={thCls}>% SAP</th><th className={thCls}>% used</th><th className={thCls}>ZBUD % SAP</th><th className={thCls}>ZBUD % used</th><th className={thCls}>Base rate</th><th className={thCls}>Budgeted</th><th className={cx(thCls, '!text-left')}>Flags</th></tr></thead>
                    <tbody>
                      {h.comps.map((c) => (
                        <tr key={c.comp} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">{c.comp}</td><td className="px-2.5 py-1.5 text-left text-xs text-muted">{c.compTxt}</td>
                          <td className={tdCls}>{c.pctSap.toFixed(3)}</td><td className={tdCls}>{c.pctUsed.toFixed(3)}</td><td className={tdCls}>{c.zbudSap.toFixed(3)}</td><td className={tdCls}>{c.zbudUsed.toFixed(3)}</td>
                          <td className={tdCls}>{f(c.baseRate)}</td><td className={cx(tdCls, 'font-bold')}>{f(c.budgeted)}</td>
                          <td className="px-2.5 py-1.5 text-left text-2xs">{c.flag === 'OK' ? '-' : <span className="rounded-full bg-warn/15 px-1.5 py-0.5 font-bold text-warn">{c.flag}</span>}</td></tr>
                      ))}
                      <tr className="border-t border-line bg-sunken/60 font-bold">
                        <td colSpan={3} className="px-2.5 py-1.5 text-right text-xs">Total % used</td>
                        <td className={cx(tdCls, h.pctTotal.minus(100).abs().lt(0.01) ? 'text-good' : 'text-bad')}>{h.pctTotal.toFixed(3)} {h.pctTotal.minus(100).abs().lt(0.01) ? '(OK)' : ''}</td>
                        <td colSpan={2} /><td className="px-2.5 py-1.5 text-right text-xs">Sum budgeted</td><td className={tdCls}>{f(h.budSum)}</td><td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          <p className="text-2xs text-muted">Read-only. The budget comes from the approved packing budget (ZCOMPONENT, written by the packing budget rate run) and its build-up (ZPKG_BUD_ITEM). Nothing is changed in SAP.</p>
        </div>
      )}
    </Drawer>
  );
}
