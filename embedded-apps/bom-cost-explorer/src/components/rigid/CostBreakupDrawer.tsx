'use client';
/** Cost breakup of a BOM line: the approved budget rate of the material (ZCOMPONENT) and the packing budget build-up (ZPKG_BUD_ITEM) beside the rate used in this costing. Read-only. */
import { useEffect, useMemo, useState } from 'react';
import type Decimal from 'decimal.js';
import { Drawer, Spinner, cx } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchRigid } from '@/lib/rigid/service';
import { budgetPerPiece, parseBudget, type BudgetBreakup } from '@/lib/rigid/analysis';
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
  const bpc = useMemo(() => (data ? budgetPerPiece(data) : null), [data]);
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
          {data.d.length > 0 && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Budget landed / pc</div><div className="num text-lg font-extrabold">{f(bpc)}</div><div className="text-2xs text-muted">year {data.d[0].gjahr}, price unit {data.d[0].priceUnit.toString()} {data.d[0].uom}</div></div>
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Rate in this costing / pc</div><div className="num text-lg font-extrabold">{f(cockpit.ratePc)}</div><div className="text-2xs text-muted">{cockpit.sourceLabel || 'selected rate'}</div></div>
                <div className="rounded-xl border border-line p-3"><div className="text-2xs font-bold uppercase text-muted">Costing minus budget</div>
                  <div className={cx('num text-lg font-extrabold', !diff ? '' : diff.gt(0) ? 'text-bad' : diff.lt(0) ? 'text-good' : '')}>{diff ? `${diff.gt(0) ? '+' : ''}${f(diff)}` : '-'}</div><div className="text-2xs text-muted">{pct ? `${pct.gt(0) ? '+' : ''}${pct.toFixed(1)} % of budget` : ''}</div></div>
              </div>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Year</th><th className={thCls}>Basic</th><th className={thCls}>Discount</th><th className={thCls}>Tax</th><th className={thCls}>Freight</th><th className={thCls}>Landed</th><th className={thCls}>Price unit</th><th className={thCls}>Budget qty</th><th className={cx(thCls, '!text-left')}>Valid</th></tr></thead>
                  <tbody>{data.d.map((r) => (
                    <tr key={r.gjahr} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">{r.gjahr}</td><td className={tdCls}>{f(r.basic)}</td><td className={tdCls}>{f(r.discount)}</td><td className={tdCls}>{f(r.tax)}</td><td className={tdCls}>{f(r.freight)}</td><td className={cx(tdCls, 'font-bold')}>{f(r.landed)}</td><td className={tdCls}>{r.priceUnit.toString()} {r.uom}</td><td className={tdCls}>{f(r.budqty, 0)}</td><td className="px-2.5 py-1.5 text-left text-xs">{r.validFrom ?? ''} to {r.validTo ?? ''}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          {data.p.length > 0 && (
            <>
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Packing budget build-up (scenario {data.p[0].scenario.replace(/^0+/, '')})</h4>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Origin</th><th className={thCls}>SAP rate</th><th className={thCls}>Used rate</th><th className={thCls}>Freight</th><th className={thCls}>Landed rate</th><th className={thCls}>Budget rate</th><th className={thCls}>Variance %</th><th className={cx(thCls, '!text-left')}>Flag</th></tr></thead>
                  <tbody>{data.p.map((r, i) => (
                    <tr key={`${r.comp}-${i}`} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{r.comp}</span> <span className="text-muted">{r.compTxt}</span></td><td className="px-2.5 py-1.5 text-left text-xs">{r.origin}</td>
                      <td className={tdCls}>{f(r.rSap)}</td><td className={tdCls}>{f(r.rUsed)}</td><td className={tdCls}>{f(r.fUsed)}</td><td className={cx(tdCls, 'font-bold')}>{f(r.landedRate)}</td><td className={tdCls}>{f(r.br)}</td>
                      <td className={cx(tdCls, r.varPct.gt(0) ? 'text-bad' : r.varPct.lt(0) ? 'text-good' : '')}>{r.varPct.toFixed(1)} %</td><td className="px-2.5 py-1.5 text-left text-2xs">{r.flag === 'OK' ? '' : <span className="rounded-full bg-warn/15 px-1.5 py-0.5 font-bold text-warn">{r.flag}</span>}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-2xs text-muted">Read-only. The budget comes from the approved packing budget (ZCOMPONENT, written by the packing budget rate run) and its build-up (ZPKG_BUD_ITEM). Nothing is changed in SAP.</p>
        </div>
      )}
    </Drawer>
  );
}
