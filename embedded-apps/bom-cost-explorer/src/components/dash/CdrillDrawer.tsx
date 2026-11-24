'use client';
/**
 * Item level breakup of one material (Margin report, group by Material, "Breakup"): the components behind RM / PM / Perfume, averaged over the sold batches
 * (process orders from ZMB31_POUTILITY, ZCL_AUFM_UTILITY3). Compared with the cost conditions of the invoices (per piece).
 */
import { useEffect, useMemo, useState } from 'react';
import type Decimal from 'decimal.js';
import { Card, Drawer, Segmented, Spinner, cx } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchCdrill, type MarginSel } from '@/lib/dash/service';
import { CAT_LABEL, parseCdrill, type BudGroup, type Cat, type Cdrill } from '@/lib/dash/cdrill';
import { money, tdCls, thCls } from './parts';
import CompareBlock from './CompareBlock';

export interface DrillTarget { matnr: string; label: string; invoice: { rm: Decimal; pm: Decimal; pf: Decimal; oh: Decimal } | null; sel: MarginSel; from: string; to: string }

const num = (v: Decimal, dp = 4) => v.toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default function CdrillDrawer({ target, onClose }: { target: DrillTarget | null; onClose: () => void }) {
  const [data, setData] = useState<Cdrill | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cat, setCat] = useState<Cat>('R');
  useEffect(() => {
    if (!target) return;
    const c = new AbortController();
    setBusy(true); setError(''); setData(null);
    fetchCdrill(target.matnr, target.sel, target.from, target.to, c.signal)
      .then((r) => { setData(parseCdrill(r.rows)); })
      .catch((e) => { if (!c.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [target]);
  const s = data?.summary;
  const rows = data ? data.comps[cat] : [];
  const inv = target?.invoice;
  const cmp = useMemo(() => (s && inv ? [
    { label: 'Raw material', drill: s.rm, inv: inv.rm }, { label: 'Packing material', drill: s.pm, inv: inv.pm }, { label: 'Perfume', drill: s.pf, inv: inv.pf },
  ] : []), [s, inv]);
  return (
    <Drawer open={!!target} onClose={onClose} title={target ? `Cost breakup: ${target.label}` : ''} width={1180}>
      {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading process orders and component consumption (can take a minute for many batches)</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {data && !s && <p className="text-sm text-muted">No sold batches found for this material and selection.</p>}
      {data && s && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">{s.msg}. Average cost per piece, weighted by the sold quantity of the costed batches ({num(s.soldQty, 0)} pcs). WIP cost is ignored; its own components are included.</p>
          {s.flag === 'NBC' && <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs">No Budgeted Cost / Trading Goods: none of the sold batches has a process order (post type 01), so there is no component breakup.</p>}
          {data.notCosted > 0 && s.flag !== 'NBC' && <p className="text-xs text-muted">{data.notCosted} batch(es) are not costed (no process order for the batch): see the batch list.</p>}
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[520px] border-collapse">
              <thead><tr><th className={cx(thCls, '!text-left')}>Per piece (₹)</th><th className={thCls}>Component breakup (avg)</th><th className={thCls}>Invoice condition</th><th className={thCls}>Difference</th></tr></thead>
              <tbody>
                {cmp.map((x) => <tr key={x.label} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">{x.label}</td><td className={tdCls}>{num(x.drill)}</td><td className={tdCls}>{num(x.inv)}</td><td className={cx(tdCls, 'font-bold', x.drill.gt(x.inv) ? 'text-bad' : 'text-good')}>{num(x.drill.minus(x.inv))}</td></tr>)}
                <tr className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs font-bold">Other (not RM / PM / perfume)</td><td className={tdCls}>{num(s.oth)}</td><td className={tdCls}>-</td><td className={tdCls}>-</td></tr>
              </tbody>
            </table>
          </Card>
          <Segmented label="Category" size="sm" value={cat} onChange={setCat} options={(['R', 'P', 'F', 'O'] as Cat[]).map((k) => ({ value: k, label: `${CAT_LABEL[k]} (${data.comps[k].length})` }))} />
          {rows.length === 0 ? <p className="text-sm text-muted">No components in this category.</p> : (
            <div className="max-h-[40vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Type</th><th className={thCls}>Qty / pc</th><th className={thCls}>Avg cost / pc (₹)</th><th className={thCls}>Share %</th><th className={thCls}>Qty (sold vol.)</th><th className={thCls}>Value (₹)</th></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.matnr} className="border-t border-line/60">
                      <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{c.matnr.replace(/^0+/, '')}</span> <span className="text-muted" title={c.maktx}>{c.maktx}</span></td>
                      <td className="px-2.5 py-1.5 text-left text-xs">{c.mtart}{c.matkl ? ` / ${c.matkl}` : ''}</td>
                      <td className={tdCls}>{num(c.qtyPc, 5)} {c.meins}</td><td className={tdCls}>{num(c.costPc)}</td><td className={tdCls}>{c.share ? `${c.share.toFixed(1)} %` : '-'}</td>
                      <td className={tdCls}>{money(c.qty, 1)}</td><td className={tdCls}>{money(c.val, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {target && <CompareBlock matnr={target.matnr} data={data} defaultPlant={target.sel.plants.find((x) => data.budget.some((g) => g.bwtar === x)) ?? ''} />}
          <BudgetBlock groups={data.budget} />
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Sold batches</h4>
          <div className="max-h-[32vh] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Batch</th><th className={thCls}>Sold qty</th><th className={thCls}>Produced</th><th className={thCls}>Orders</th><th className={thCls}>RM / pc</th><th className={thCls}>PM / pc</th><th className={thCls}>Perfume / pc</th><th className={cx(thCls, '!text-left')}>Status</th></tr></thead>
              <tbody>
                {data.batches.map((b) => (
                  <tr key={b.charg || '-'} className="border-t border-line/60">
                    <td className="px-2.5 py-1.5 text-left text-xs font-bold">{b.charg || '(no batch)'}</td><td className={tdCls}>{money(b.sold, 0)}</td><td className={tdCls}>{b.flag === 'OK' ? money(b.prod, 0) : '-'}</td><td className={tdCls}>{b.orders || '-'}</td>
                    <td className={tdCls}>{b.flag === 'OK' ? num(b.rm) : '-'}</td><td className={tdCls}>{b.flag === 'OK' ? num(b.pm) : '-'}</td><td className={tdCls}>{b.flag === 'OK' ? num(b.pf) : '-'}</td>
                    <td className="px-2.5 py-1.5 text-left text-2xs">{b.flag === 'OK' ? 'Costed' : <span className="rounded-full bg-warn/15 px-2 py-0.5 font-bold text-warn" title={b.msg}>{b.flag === 'NBC' ? 'NBC / Trading goods' : 'Not costed (limit)'}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/** Budget item level: ZMM_FBUDCOST_SUM matched on valuation type + CRSSKU + business + scheme + material type, items from ZMM_FBUDCOST_DET. */
function BudgetBlock({ groups }: { groups: BudGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Budget cost items (approved budget, per valuation type of the sold items)</h4>
      {groups.map((g) => (
        <div key={g.bwtar || '-'} className="rounded-xl border border-line">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line/60 px-2.5 py-1.5 text-xs">
            <span className="font-bold">Valuation type {g.bwtar || '(blank)'}</span>
            {g.flag === 'NBC' ? <span className="rounded-full bg-warn/15 px-2 py-0.5 font-bold text-warn">NBC</span> : <span className="text-muted">version {g.version} · RM {num(g.rm)} · PM {num(g.pm)} · perfume {num(g.pf)} · other {num(g.oth)} · total {num(g.total)} per pc</span>}
          </div>
          {g.flag === 'NBC' ? <p className="p-2.5 text-xs text-muted">{g.msg}</p> : (
            <div className="max-h-[30vh] overflow-auto">
              <table className="w-full min-w-[640px] border-collapse">
                <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Type</th><th className={thCls}>Category</th><th className={thCls}>Qty</th><th className={thCls}>Budget cost / pc (₹)</th></tr></thead>
                <tbody>
                  {g.items.map((c, i) => (
                    <tr key={`${c.matnr}-${i}`} className="border-t border-line/60">
                      <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{c.matnr.replace(/^0+/, '')}</span> <span className="text-muted" title={c.maktx}>{c.maktx}</span></td>
                      <td className="px-2.5 py-1.5 text-left text-xs">{c.mtart}{c.matkl ? ` / ${c.matkl}` : ''}</td>
                      <td className={tdCls}>{CAT_LABEL[c.cat]}</td><td className={tdCls}>{num(c.qty, 5)} {c.meins}</td><td className={tdCls}>{num(c.costPc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
