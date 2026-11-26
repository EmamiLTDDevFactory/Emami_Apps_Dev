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
import { fetchCk } from '@/lib/ck/service';
import type { CkCompRow, CkHeaderRow } from '@/lib/ck/types';
import { fetchCdrill } from '@/lib/dash/service';
import { readGradually } from '@/lib/dash/cdrillProgressive';
import { CAT_LABEL, parseCdrill, parseOrderItems, type Cat, type CdrillComp, type OrderItem } from '@/lib/dash/cdrill';
import { ckVariance } from '@/lib/dash/ckVariance';
import { ckItemVariance, explodeCk, type ItemVariance, type StdExplosion } from '@/lib/dash/ckItemVariance';
import { loadFgRigid, type FgRigid } from '@/lib/rigid/fgRigid';
import MouldDrawer from '../rigid/MouldDrawer';
import type { WacCompRow, WacDocRow } from '@/lib/wac/types';
import { money, tdCls, thCls } from './parts';
import DocButtons from '../matdocs/DocButtons';

export interface FgTarget { matnr: string; maktx: string; werks: string; brand: string; from: string; to: string }
const D = (v: string | null | undefined) => { try { return new Decimal(v && v !== '' ? v : 0); } catch { return new Decimal(0); } };
const GRP: Record<string, string> = { RM: 'Raw material', PM: 'Packing material', PERF: 'Perfume' };

interface Order { aufnr: string; docs: WacDocRow[]; qty: Decimal; rm: Decimal; pm: Decimal; perf: Decimal; conv: Decimal; landed: Decimal; batches: string[]; first: string; uom: string }

function byOrder(rows: WacDocRow[]): Order[] {
  const m = new Map<string, Order>();
  for (const r of rows) {
    const k = r.Aufnr || '(no order)';
    const o = m.get(k) ?? { aufnr: k, docs: [], qty: new Decimal(0), rm: new Decimal(0), pm: new Decimal(0), perf: new Decimal(0), conv: new Decimal(0), landed: new Decimal(0), batches: [], first: '', uom: r.Uom };
    o.docs.push(r); o.qty = o.qty.plus(D(r.Qty)); o.rm = o.rm.plus(D(r.Rm)); o.pm = o.pm.plus(D(r.Pm)); o.perf = o.perf.plus(D(r.Perf)); o.conv = o.conv.plus(D(r.Conv));
    // SAP's Landed on WacDocSet is PER PIECE (live NWP 26.11.2026: 5.64 on a 3,360 pc document) while Rm / Pm / Perf / Conv are document values: the landed value is their sum
    o.landed = o.landed.plus(D(r.Rm)).plus(D(r.Pm)).plus(D(r.Perf)).plus(D(r.Conv));
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
  const [ck, setCk] = useState<{ head: CkHeaderRow | null; comps: CkCompRow[] } | null>(null);
  const [act, setAct] = useState<{ comps: ReturnType<typeof parseCdrill>['comps']; byOrder: Map<string, OrderItem[]>; covered: number; total: number } | null>(null);
  const [busyA, setBusyA] = useState(false);
  const [errorA, setErrorA] = useState('');
  const [catA, setCatA] = useState<Cat>('R');
  const [rigid, setRigid] = useState<FgRigid | null>(null);
  const [mould, setMould] = useState<{ matnr: string; maktx: string; werks: string } | null>(null);
  const [busyK, setBusyK] = useState(false);
  const [errorK, setErrorK] = useState('');
  const [ckItems, setCkItems] = useState<StdExplosion | null>(null);
  const [busyI, setBusyI] = useState(false);
  const [errorI, setErrorI] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [grp, setGrp] = useState<'ALL' | 'RM' | 'PM' | 'PERF'>('ALL');
  const q = useMemo(() => (target ? { plants: [target.werks], materials: [target.matnr.replace(/^0+/, '')], dateFrom: target.from, dateTo: target.to } : null), [target]);
  useEffect(() => {
    setDocs(null); setComps(null); setCk(null); setErrorK(''); setCkItems(null); setErrorI(''); setAct(null); setErrorA(''); setError(''); setOpen('');
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
  // additive and silent: the rigid packing section appears only when ZRIGID returns saved rates for this finished good
  useEffect(() => {
    setRigid(null); setMould(null);
    if (!target) return;
    const c = new AbortController();
    void loadFgRigid([{ matnr: target.matnr, werks: target.werks }], (m) => { if (!c.signal.aborted) setRigid([...m.values()][0] ?? null); }, c.signal);
    return () => c.abort();
  }, [target]);
  async function loadActual() {
    if (!target) return;
    setBusyA(true); setErrorA('');
    const sel = { plants: [target.werks], vkorg: ['PROD'], vtweg: [], crssku: [], vbeln: [] };
    try {
      const p = await readGradually(target.from, target.to, (w) => fetchCdrill(target.matnr, sel, w.from, w.to).then((r) => r.rows),
        (x) => setAct({ comps: parseCdrill(x.rows).comps, byOrder: parseOrderItems(x.rows), covered: x.coveredDays, total: x.totalDays }), {});
      if (p.error) setErrorA(p.error);
    } catch (e) { setErrorA(errorText(e)); }
    setBusyA(false);
  }
  async function loadCk() {
    if (!target) return;
    setBusyK(true); setErrorK('');
    const k = { matnr: target.matnr.replace(/^0+/, ''), werks: target.werks };
    try {
      const [h, c] = await Promise.all([fetchCk('HEADER', k), fetchCk('COMP', k)]);
      setCk({ head: h.rows[0] ?? null, comps: c.rows });
    } catch (e) { setErrorK(errorText(e)); }
    setBusyK(false);
  }
  /** Item level actual vs CK13N: CK13N items of the finished good (bulk exploded through its own estimate) and, when not read yet, the actual items. */
  async function loadCkItems(withActual = true) {
    if (!target) return;
    setBusyI(true); setErrorI('');
    const werks = target.werks;
    const items = (matnr: string, w: string) => fetchCk('ITEM', { matnr, werks: w }).then((r) => r.rows);
    const unit = (matnr: string, w: string) => fetchCk('HEADER', { matnr, werks: w }).then((r) => r.rows[0]?.Meeht ?? '');
    try {
      const [exp] = await Promise.all([items(target.matnr.replace(/^0+/, ''), werks).then((rows) => explodeCk(rows, werks, items, unit)), act || !withActual ? Promise.resolve() : loadActual()]);
      setCkItems(exp);
    } catch (e) { setErrorI(errorText(e)); }
    setBusyI(false);
  }
  const orders = useMemo(() => (docs ? byOrder(docs) : []), [docs]);
  const tot = useMemo(() => orders.reduce((t, o) => ({ qty: t.qty.plus(o.qty), landed: t.landed.plus(o.landed) }), { qty: new Decimal(0), landed: new Decimal(0) }), [orders]);
  const ckRows = useMemo(() => (ck ? ckVariance({ qty: tot.qty, rm: orders.reduce((t, o) => t.plus(o.rm), new Decimal(0)), pm: orders.reduce((t, o) => t.plus(o.pm), new Decimal(0)), perf: orders.reduce((t, o) => t.plus(o.perf), new Decimal(0)), conv: orders.reduce((t, o) => t.plus(o.conv), new Decimal(0)), landed: tot.landed }, ck.comps) : []), [ck, orders, tot]);
  const itemVar = useMemo(() => (ckItems && act ? ckItemVariance(ckItems, act.comps, tot.qty.gt(0) ? orders.reduce((t, o) => t.plus(o.conv), new Decimal(0)).div(tot.qty) : null) : null), [ckItems, act, orders, tot]);
  /** One order's items against CK13N (per piece of that order); conversion = the order's goods receipt conversion / its quantity. */
  const orderVar = (o: Order, list: OrderItem[]) => (ckItems ? ckItemVariance(ckItems, toComps(list), o.qty.gt(0) ? o.conv.div(o.qty) : null) : null);
  const items = (comps ?? []).filter((c) => grp === 'ALL' || c.Grp === grp);
  const itemTotal = items.reduce((s, c) => s.plus(D(c.CostSel)), new Decimal(0));
  return (
    <>
    <Drawer open={!!target} onClose={onClose} title={target ? <span className="flex flex-wrap items-center gap-2">{`Process orders: ${target.matnr.replace(/^0+/, '')} ${target.maktx}`}<DocButtons matnr={target.matnr} /></span> : ''} width={1180}>
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
                          <td className={tdCls}>{D(d.Qty).toNumber().toLocaleString('en-IN')} {d.Uom}</td><td className={tdCls}>{money(D(d.Rm), 0)}</td><td className={tdCls}>{money(D(d.Pm), 0)}</td><td className={tdCls}>{money(D(d.Perf), 0)}</td><td className={tdCls}>{money(D(d.Conv), 0)}</td><td className={tdCls}>{money(D(d.Rm).plus(D(d.Pm)).plus(D(d.Perf)).plus(D(d.Conv)), 0)}</td><td className={tdCls}>{D(d.Qty).gt(0) ? money(D(d.Rm).plus(D(d.Pm)).plus(D(d.Perf)).plus(D(d.Conv)).div(D(d.Qty)), 4) : ''}</td>
                        </tr>
                      ))}
                      {open === o.aufnr && act && (
                        <tr className="border-t border-line/40 bg-line/10"><td colSpan={10} className="px-2.5 py-2">
                          {(act.byOrder.get(o.aufnr.replace(/^0+/, '')) ?? []).length === 0 ? <span className="text-2xs text-muted">No item level consumption read for this order (not a post type 01 order, or outside the period read).</span> : (() => {
                            const list = act.byOrder.get(o.aufnr.replace(/^0+/, '')) ?? [];
                            const v = orderVar(o, list);
                            if (v) return <><p className="mb-1 text-2xs text-muted">Order {o.aufnr.replace(/^0+/, '')} against the CK13N standard of {target.werks}, per piece of this order. Variance = actual minus CK13N, % on CK13N; red costs more.</p><CkItemTable v={v} onlyDiff={false} small /></>;
                            return (
                              <>
                                <div className="mb-1 flex items-center gap-2"><Button size="sm" onClick={() => void loadCkItems(false)} disabled={busyI}>{busyI ? 'Reading CK13N…' : 'Compare with CK13N'}</Button>{errorI && <span className="text-2xs text-bad">{errorI}</span>}</div>
                                <table className="w-full border-collapse text-2xs"><thead><tr><th className="text-left">Component</th><th className="text-left">Group</th><th className="text-right">Qty / pc</th><th className="text-right">Cost / pc ₹</th><th className="text-right">Qty</th><th className="text-right">Value ₹</th></tr></thead>
                                  <tbody>{list.map((i) => <tr key={i.matnr} className="border-t border-line/30"><td className="text-left"><span className="font-bold">{i.matnr.replace(/^0+/, '')}</span> {i.maktx}</td><td className="text-left">{CAT_LABEL[i.cat]}</td><td className="text-right">{money(i.qtyPc, 5)} {i.meins}</td><td className="text-right">{money(i.costPc, 4)}</td><td className="text-right">{money(i.qty, 2)}</td><td className="text-right">{money(i.val, 2)}</td></tr>)}</tbody></table>
                              </>
                            );
                          })()}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rigid && rigid.list.length > 0 && (
            <>
              <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Rigid packing (last saved ZRIGID rates)</h4>
              <p className="text-2xs text-muted">Rigid packing cost per piece of this finished good: {money(rigid.perPc, 4)} (resin {money(rigid.resin, 4)}, conversion {money(rigid.conv, 4)}, other {money(rigid.other, 4)}). It is part of the PM cost; saved rates are the ones ZRIGID posted for the item, not today&apos;s simulation.</p>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Rigid item</th><th className={thCls}>Qty / pc</th><th className={thCls}>Landed / 1000</th><th className={thCls}>Resin / 1000</th><th className={thCls}>Conv. / 1000</th><th className={thCls}>₹ / pc of FG</th><th className={cx(thCls, '!text-left')}>Saved rate valid</th><th className={thCls} /></tr></thead>
                  <tbody>{rigid.list.map((i) => (
                    <tr key={i.comp} className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{i.comp}</span> <span className="text-muted">{i.compTxt}</span></td><td className={tdCls}>{money(i.qty, 4)}</td>
                      <td className={tdCls}>{i.flag === 'OK' ? money(i.landed1000, 0) : '-'}</td><td className={tdCls}>{i.flag === 'OK' ? money(i.resin1000, 2) : '-'}</td><td className={tdCls}>{i.flag === 'OK' ? money(i.conv1000, 2) : '-'}</td><td className={cx(tdCls, 'font-bold')}>{i.flag === 'OK' ? money(i.qty.times(i.landed1000).div(1000), 4) : '-'}</td>
                      <td className="px-2.5 py-1.5 text-left text-xs">{i.flag === 'OK' ? `${i.validFrom ?? ''} to ${i.validTo ?? ''}` : <span className="text-warn">no saved ZRIGID rate</span>}</td>
                      <td className={tdCls}><button type="button" className="rounded-full border border-line px-2.5 py-0.5 text-2xs font-bold hover:border-accent hover:bg-accent/10" onClick={() => setMould({ matnr: i.comp, maktx: i.compTxt, werks: target.werks })}>Mould details</button></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Item level actual: consumption of the process orders</h4>
            <Button onClick={() => void loadActual()} disabled={busyA}>{busyA ? 'Reading…' : act ? 'Refresh actual items' : 'Load actual items'}</Button>
            {busyA && <Spinner className="h-4 w-4" />}
            {act && <span className="text-2xs text-muted">{act.covered} of {act.total} days read</span>}
          </div>
          <p className="text-2xs text-muted">Actual consumption of every component posted to the process orders of the period (SAP ZCL_AUFM_UTILITY3, WIP cost ignored, its own components kept), per piece produced. Open an order above to see its own items.</p>
          {errorA && <ErrorBox>{errorA}</ErrorBox>}
          {act && (
            <>
              <Segmented label="Category" size="sm" value={catA} onChange={setCatA} options={(['R', 'P', 'F', 'O'] as Cat[]).map((k) => ({ value: k, label: `${CAT_LABEL[k]} (${act.comps[k].length})` }))} />
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[760px] border-collapse">
                  <thead className="sticky top-0"><tr><th className={cx(thCls, '!text-left')}>Component</th><th className={cx(thCls, '!text-left')}>Type</th><th className={thCls}>Qty / pc</th><th className={thCls}>Cost / pc ₹</th><th className={thCls}>Share %</th><th className={thCls}>Qty</th><th className={thCls}>Value ₹</th></tr></thead>
                  <tbody>
                    {act.comps[catA].map((c) => (
                      <tr key={c.matnr} className="border-t border-line/60">
                        <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{c.matnr.replace(/^0+/, '')}</span> <span className="text-muted" title={c.maktx}>{c.maktx}</span></td>
                        <td className="px-2.5 py-1.5 text-left text-xs">{c.mtart}</td><td className={tdCls}>{money(c.qtyPc, 5)} {c.meins}</td><td className={tdCls}>{money(c.costPc, 4)}</td><td className={tdCls}>{c.share ? `${c.share.toFixed(1)} %` : '-'}</td><td className={tdCls}>{money(c.qty, 1)}</td><td className={tdCls}>{money(c.val, 0)}</td>
                      </tr>
                    ))}
                    {act.comps[catA].length === 0 && <tr><td colSpan={7} className="p-3 text-center text-xs text-muted">No components in this category.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">CK13N standard cost and variance</h4>
            <Button onClick={() => void loadCk()} disabled={busyK}>{busyK ? 'Reading…' : ck ? 'Refresh CK13N' : 'Compare with CK13N'}</Button>
            {busyK && <Spinner className="h-4 w-4" />}
          </div>
          {errorK && <ErrorBox>{errorK}</ErrorBox>}
          {ck && !ck.head && <p className="text-xs text-muted">SAP has no standard cost estimate for this finished good in plant {target.werks}.</p>}
          {ck?.head && (
            <>
              <p className="text-2xs text-muted">CK13N estimate {ck.head.Kalnr} · costing variant {ck.head.Klvar || '-'} · version {ck.head.Tvers} · {ck.head.StatusTxt || ck.head.Status} · lot {ck.head.Losgr} {ck.head.Meeht}. Actual = the goods receipts above divided by the quantity produced; variance = actual minus CK13N, red costs more. CK13N has no perfume line, so actual perfume is added to raw material.</p>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead><tr><th className={cx(thCls, '!text-left')}>Per piece (₹)</th><th className={thCls}>Actual (process orders)</th><th className={thCls}>CK13N standard</th><th className={thCls}>Variance ₹</th><th className={thCls}>Variance %</th></tr></thead>
                  <tbody>
                    {ckRows.map((r) => {
                      const tone = !r.variance || (r.pct && r.pct.abs().lt(0.5)) ? '' : r.variance.gt(0) ? 'text-bad' : 'text-good';
                      return (
                        <tr key={r.key} className={cx('border-t border-line/60', r.key === 'TOTAL' && 'bg-line/20 font-extrabold')}>
                          <td className="px-2.5 py-1.5 text-left text-xs">{r.label}{r.note && <span className="ml-1 text-2xs text-muted">({r.note})</span>}</td>
                          <td className={tdCls}>{r.actual ? money(r.actual, 4) : '-'}</td><td className={tdCls}>{money(r.standard, 4)}</td>
                          <td className={cx(tdCls, 'font-bold', tone)}>{r.variance ? `${r.variance.gt(0) ? '+' : ''}${money(r.variance, 4)}` : '-'}</td>
                          <td className={cx(tdCls, tone)}>{r.pct ? `${r.pct.gt(0) ? '+' : ''}${r.pct.toFixed(1)} %` : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Item level: actual vs CK13N</h4>
            <Button onClick={() => void loadCkItems()} disabled={busyI || busyA}>{busyI ? 'Reading…' : ckItems ? 'Refresh item comparison' : 'Compare items with CK13N'}</Button>
            {(busyI || (busyA && !!ckItems)) && <Spinner className="h-4 w-4" />}
            {itemVar && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Only variance over 5 % or one side missing</label>}
          </div>
          <p className="text-2xs text-muted">Every component per piece: actual consumption of the process orders of the period (as in Item level actual above) against the CK13N standard estimate of {target.werks}. The bulk / WIP line of the estimate is exploded through the bulk&apos;s own CK13N estimate, as SAP does for the actual. Variance = actual minus CK13N, % on CK13N; red costs more. Quantity % only when both sides use the same unit.</p>
          {errorI && <ErrorBox>{errorI}</ErrorBox>}
          {ckItems && !act && !busyA && !errorA && <p className="text-xs text-muted">Load the actual items to compare.</p>}
          {ckItems && ckItems.lines.length === 0 && ckItems.convPc.isZero() && <p className="text-xs text-muted">SAP has no CK13N items for this finished good in plant {target.werks}.</p>}
          {itemVar && (ckItems!.bulks.length > 0 || ckItems!.unexploded.length > 0) && (
            <p className="text-2xs text-muted">
              {ckItems!.bulks.map((b) => `Bulk ${b.matnr}: ₹${money(b.ownPc, 4)} / pc in the finished good's estimate, ₹${money(b.explodedPc, 4)} / pc from its own estimate`).join(' · ')}
              {!ckItems!.bulkDiff.isZero() && ` (difference ₹${money(ckItems!.bulkDiff, 4)} / pc: the bulk's own estimate is priced differently; the total below uses the exploded figures).`}
              {ckItems!.unexploded.length > 0 && ` Not exploded (no estimate of its own): ${ckItems!.unexploded.join(', ')}.`}
            </p>
          )}
          {itemVar && <CkItemTable v={itemVar} onlyDiff={onlyDiff} />}
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
    {mould && <MouldDrawer item={mould} cockpit={{ ratePc: null, sourceLabel: '' }} onClose={() => setMould(null)} />}
    </>
  );
}

/** CK13N item comparison table (period or one order): actual vs standard per piece, variance and variance %, with the actual quantity and value consumed. */
function CkItemTable({ v, onlyDiff, small }: { v: ItemVariance; onlyDiff: boolean; small?: boolean }) {
  const td = small ? 'px-1.5 py-1 text-right tabular-nums' : tdCls;
  const tdl = small ? 'px-1.5 py-1 text-left' : 'px-2.5 py-1.5 text-left text-xs';
  const th = small ? 'px-1.5 py-1 text-right' : thCls;
  const sign = (x: Decimal) => (x.gt(0) ? '+' : '');
  const rows = [...v.rows.filter((r) => !onlyDiff || r.status !== 'both' || (r.pct && r.pct.abs().gte(5)) || (r.qtyPct && r.qtyPct.abs().gte(5))), v.conv, v.total];
  return (
    <div className={cx('overflow-auto rounded-xl border border-line', !small && 'max-h-[50vh]')}>
      <table className={cx('w-full border-collapse', small ? 'min-w-[1100px] text-2xs' : 'min-w-[1150px]')}>
        <thead className="sticky top-0"><tr><th className={cx(th, '!text-left')}>Component</th><th className={cx(th, '!text-left')}>Group</th><th className={th}>CK13N qty / pc</th><th className={th}>Actual qty / pc</th><th className={th}>Qty var %</th><th className={th}>CK13N ₹ / pc</th><th className={th}>Actual ₹ / pc</th><th className={th}>Variance ₹ / pc</th><th className={th}>Variance %</th><th className={th}>Actual qty</th><th className={th}>Actual value ₹</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = !r.variance || r.variance.isZero() || (r.pct && r.pct.abs().lt(0.5)) ? '' : r.variance.gt(0) ? 'text-bad' : 'text-good';
            const qtone = !r.qtyPct || r.qtyPct.abs().lt(0.5) ? '' : r.qtyPct.gt(0) ? 'text-bad' : 'text-good';
            const isTot = r === v.total; const isConv = r === v.conv;
            return (
              <tr key={r.matnr || `x${i}`} className={cx('border-t border-line/60', isTot && 'bg-line/20 font-extrabold', isConv && 'bg-line/10')}>
                <td className={tdl}>{r.matnr && <span className="font-bold">{r.matnr} </span>}<span className={r.matnr ? 'text-muted' : ''} title={r.text}>{r.text}</span>
                  {r.status === 'ck-only' && r.matnr && <span className="ml-1 rounded bg-warn/15 px-1 text-2xs text-warn">not consumed</span>}
                  {r.status === 'actual-only' && <span className="ml-1 rounded bg-warn/15 px-1 text-2xs text-warn">not in CK13N</span>}
                  {r.via && <span className="ml-1 text-2xs text-faint">via bulk {r.via}</span>}</td>
                <td className={tdl}>{r.cat}</td>
                <td className={td}>{r.stdQty ? `${money(r.stdQty, 5)} ${r.stdUom}` : '-'}</td><td className={td}>{r.actQty ? `${money(r.actQty, 5)} ${r.actUom}` : '-'}</td>
                <td className={cx(td, qtone)}>{r.qtyPct ? `${sign(r.qtyPct)}${r.qtyPct.toFixed(1)} %` : '-'}</td>
                <td className={td}>{r.stdVal ? money(r.stdVal, 4) : '-'}</td><td className={td}>{r.actVal ? money(r.actVal, 4) : '-'}</td>
                <td className={cx(td, 'font-bold', tone)}>{r.variance ? `${sign(r.variance)}${money(r.variance, 4)}` : '-'}</td>
                <td className={cx(td, tone)}>{r.pct ? `${sign(r.pct)}${r.pct.toFixed(1)} %` : '-'}</td>
                <td className={td}>{r.actTotQty ? money(r.actTotQty, 2) : ''}</td><td className={td}>{r.actTotVal ? money(r.actTotVal, 2) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One order's items in the shape the comparison takes. */
const toComps = (list: OrderItem[]): Record<Cat, CdrillComp[]> => {
  const out: Record<Cat, CdrillComp[]> = { R: [], P: [], F: [], O: [] };
  for (const i of list) out[i.cat].push({ matnr: i.matnr, maktx: i.maktx, mtart: i.mtart, matkl: '', cat: i.cat, meins: i.meins, qty: i.qty, val: i.val, qtyPc: i.qtyPc, costPc: i.costPc, share: null });
  return out;
};
