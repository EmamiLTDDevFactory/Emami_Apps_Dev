'use client';
/**
 * Cost breakup > finished good: the process orders behind its actual cost (WacDocSet: goods receipt documents of the period with order, batch, quantity and RM / PM / perfume /
 * conversion) and, on request, the item level (WacCompSet: every component with its quantity per piece, the rate SAP selected and the cost per piece). All from SAP, nothing is summed here
 * except the document totals per process order.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Button, Card, Drawer, Segmented, SourceBadge, Spinner, cx } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchWac } from '@/lib/wac/service';
import type { WacCompRow, WacDocRow } from '@/lib/wac/types';
import { money, tdCls, thCls } from './parts';

export interface FgTarget { matnr: string; maktx: string; werks: string; brand: string; from: string; to: string }
const D = (v: string | null | undefined) => { try { return new Decimal(v && v !== '' ? v : 0); } catch { return new Decimal(0); } };
const GRP: Record<string, string> = { RM: 'Raw material', PM: 'Packing material', PERF: 'Perfume' };

interface Order { aufnr: string; docs: WacDocRow[]; qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; landed: Decimal; batches: string[]; first: string; uom: string }

function byOrder(rows: WacDocRow[]): Order[] {
  const m = new Map<string, Order>();
  for (const r of rows) {
    const k = r.Aufnr || '(no order)';
    const o = m.get(k) ?? { aufnr: k, docs: [], qty: new Decimal(0), rm: new Decimal(0), pm: new Decimal(0), perf: new Decimal(0), conv: new Decimal(0), landed: new Decimal(0), batches: [], first: '', uom: r.Uom };
    o.docs.push(r); o.qty = o.qty.plus(D(r.Qty)); o.rm = o.rm.plus(D(r.Rm)); o.pm = o.pm.plus(D(r.Pm)); o.perf = o.perf.plus(D(r.Perf)); o.conv = o.conv.plus(D(r.Conv)); o.landed = o.landed.plus(D(r.Landed));
    if (r.Charg && !o.batches.includes(r.Charg)) o.batches.push(r.Charg);
    if (r.Budat && (!o.first || r.Budat < o.first)) o.first = r.Budat;
    m.set(k, o);
  }
  return [...m.values()].sort((a, b) => (b.first || '').localeCompare(a.first || ''));
}
const day = (s: string) => (s ? String(s).slice(0, 10) : '-');

export default function FgOrdersDrawer({ target, onClose }: { target: FgTarget | null; onClose: () => void }) {
  const [docs, setDocs] = useState<WacDocRow[] | null>(null);
  const [comps, setComps] = useState<WacCompRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [grp, setGrp] = useState<'ALL' | 'RM' | 'PM' | 'PERF'>('ALL');
  const q = useMemo(() => (target ? { plants: [target.werks], materials: [target.matnr.replace(/^0+/, '')], dateFrom: target.from, dateTo: target.to } : null), [target]);
  useEffect(() => {
    setDocs(null); setComps(null); setError(''); setOpen('');
    if (!q) return;
    const c = new AbortController(); setBusy(true);
    fetchWac('DOCS', q, { signal: c.signal }).then((r) => setDocs(r.rows)).catch((e) => { if (!c.signal.aborted) setError(errorText(e)); }).finally(() => { if (!c.signal.aborted) setBusy(false); });
    return () => c.abort();
  }, [q]);
  async function loadItems() {
    if (!q) return;
    setBusyC(true); setError('');
    try { setComps((await fetchWac('COMP', q)).rows); } catch (e) { setError(errorText(e)); }
    setBusyC(false);
  }
  const orders = useMemo(() => (docs ? byOrder(docs) : []), [docs]);
  const tot = useMemo(() => orders.reduce((t, o) => ({ qty: t.qty.plus(o.qty), landed: t.landed.plus(o.landed) }), { qty: new Decimal(0), landed: new Decimal(0) }), [orders]);
  const items = (comps ?? []).filter((c) => grp === 'ALL' || c.Grp === grp);
  const itemTotal = items.reduce((s, c) => s.plus(D(c.CostSel)), new Decimal(0));
  return (
    <Drawer open={!!target} onClose={onClose} title={target ? `Process orders: ${target.matnr.replace(/^0+/, '')} ${target.maktx}` : ''} width={1180}>
      {busy && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading the process orders of the period</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {target && docs && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">Plant {target.werks} · {target.from} to {target.to} · {orders.length} process order(s), {docs.length} goods receipt document(s), produced {tot.qty.toNumber().toLocaleString('en-IN')} · landed cost ₹{money(tot.landed, 0)}. Click an order to see its documents.</p>
          {orders.length === 0 && <Card className="p-3 text-sm text-muted">SAP returned no goods receipt documents for this finished good and period.</Card>}
          {orders.length > 0 && (
            <div className="max-h-[42vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Process order</th><th className={cx(thCls, '!text-left')}>First posting</th><th className={cx(thCls, '!text-left')}>Batches</th><th className={thCls}>Qty</th><th className={thCls}>RM ₹</th><th className={thCls}>PM ₹</th><th className={thCls}>Perfume ₹</th><th className={thCls}>Conversion ₹</th><th className={thCls}>Landed ₹</th><th className={thCls}>Per piece ₹</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <Fragment key={o.aufnr}>
                      <tr className={cx('cursor-pointer border-t border-line/60 hover:bg-sunken', open === o.aufnr && 'bg-sunken')} onClick={() => setOpen(open === o.aufnr ? '' : o.aufnr)} tabIndex={0} role="button" onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(open === o.aufnr ? '' : o.aufnr)}>
                        <td className="px-2.5 py-1.5 text-left text-xs font-bold">{o.aufnr.replace(/^0+/, '')}</td><td className="px-2.5 py-1.5 text-left text-xs">{day(o.first)}</td><td className="px-2.5 py-1.5 text-left text-xs">{o.batches.join(', ') || '-'}</td>
                        <td className={tdCls}>{o.qty.toNumber().toLocaleString('en-IN')} {o.uom}</td><td className={tdCls}>{money(o.rm, 0)}</td><td className={tdCls}>{money(o.pm, 0)}</td><td className={tdCls}>{money(o.perf, 0)}</td><td className={tdCls}>{money(o.conv, 0)}</td>
                        <td className={cx(tdCls, 'font-bold')}>{money(o.landed, 0)}</td><td className={cx(tdCls, 'font-bold')}>{o.qty.gt(0) ? money(o.landed.div(o.qty), 4) : '-'}</td>
                      </tr>
                      {open === o.aufnr && o.docs.map((d) => (
                        <tr key={`${o.aufnr}-${d.Mblnr}-${d.Rowid}`} className="border-t border-line/40 bg-line/10 text-2xs">
                          <td className="px-2.5 py-1 text-left" colSpan={2}>Document {d.Mblnr}/{d.Mjahr} · {day(d.Budat ?? '')}</td><td className="px-2.5 py-1 text-left">{d.Charg || '-'} · {d.Via}</td>
                          <td className={tdCls}>{D(d.Qty).toNumber().toLocaleString('en-IN')} {d.Uom}</td><td className={tdCls}>{money(D(d.Rm), 0)}</td><td className={tdCls}>{money(D(d.Pm), 0)}</td><td className={tdCls}>{money(D(d.Perf), 0)}</td><td className={tdCls}>{money(D(d.Conv), 0)}</td><td className={tdCls}>{money(D(d.Landed), 0)}</td><td className={tdCls} />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Item level: components per piece</h4>
            <Button onClick={() => void loadItems()} disabled={busyC}>{busyC ? 'Costing…' : comps ? 'Refresh items' : 'Load items (live costing)'}</Button>
            {busyC && <Spinner className="h-4 w-4" />}
          </div>
          <p className="text-2xs text-muted">The items come from SAP&apos;s BOM costing of this finished good in plant {target.werks}: quantity per piece, the rate SAP selected (and where it came from) and the cost per piece. They apply to every process order above.</p>
          {comps && (
            <>
              <Segmented label="Group" size="sm" value={grp} onChange={setGrp} options={[{ value: 'ALL' as const, label: 'All' }, { value: 'RM' as const, label: 'Raw material' }, { value: 'PM' as const, label: 'Packing' }, { value: 'PERF' as const, label: 'Perfume' }]} />
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Group</th><th className={thCls}>Qty / pc</th><th className={cx(thCls, '!text-left')}>Source</th><th className={thCls}>Rate ₹</th><th className={thCls}>Cost / pc ₹</th></tr></thead>
                  <tbody>
                    {items.map((c) => (
                      <tr key={`${c.Rowid}-${c.Idnrk}`} className="border-t border-line/60">
                        <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{c.Idnrk.replace(/^0+/, '')}</span> <span className="text-muted" title={c.CompTxt}>{c.CompTxt}</span></td>
                        <td className="px-2.5 py-1.5 text-left text-xs">{GRP[c.Grp] ?? c.Grp}</td><td className={tdCls}>{D(c.QtyPu).toNumber().toLocaleString('en-IN', { maximumFractionDigits: 5 })} {c.Uom}</td>
                        <td className="px-2.5 py-1.5 text-left text-xs">{c.SrcSel ? <SourceBadge source={c.SrcSel} /> : '-'}</td><td className={tdCls}>{money(D(c.RateSel), 4)}</td><td className={cx(tdCls, 'font-bold')}>{money(D(c.CostSel), 4)}</td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-xs text-muted">No components.</td></tr>}
                  </tbody>
                  <tfoot><tr className="border-t border-line bg-line/20 font-extrabold"><td className="px-2.5 py-1.5 text-left text-xs" colSpan={5}>Total per piece{grp === 'ALL' ? '' : ` (${GRP[grp]})`}</td><td className={tdCls}>{money(itemTotal, 4)}</td></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
