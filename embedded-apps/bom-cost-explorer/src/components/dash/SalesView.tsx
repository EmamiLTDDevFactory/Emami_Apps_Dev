'use client';
/**
 * Sales view: invoiced sales of finished goods (DashSalesSet): GSV -> NSV -> COGM -> gross margin by brand and by SKU x channel.
 * SAP does the sums (GSV = condition ZSAL, NSV = billing net value, COGM = actual cost per piece of the period x sold quantity);
 * the margin is computed here only over the lines that have an actual cost. The budget-to-actual margin bridge (price, volume, mix, cost) comes from SAP
 * (DashPvmSet, from the sales budget ZSALES_BUD_TGT); alert bands per SKU category come from ZMIS_ALERT_THR.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Spinner, Stat, cx, inputBase, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchPvm, fetchSales, fetchThresholds } from '@/lib/dash/service';
import { brandSales, gmBands, pvmSteps, salesTotals, salesViews, skuSales, type GmBands, type PvmStep, type SalesView as Row } from '@/lib/dash/logic';
import type { PvmRow, SalesRow, ThreshRow } from '@/lib/dash/types';
import { ls } from '@/lib/client/storage';
import { useHierNames } from '@/lib/client/useHierNames';
import { BAND, NeedsSap, fyStart, lakh, money, pct, tdCls, thCls, today } from './parts';

const ALERT: Record<string, string> = { good: 'Green', amber: 'Amber', red: 'Red', none: '-' };
const PILL: Record<string, string> = { good: 'bg-good/15 text-good', amber: 'bg-warn/15 text-warn', red: 'bg-bad/15 text-bad', none: 'text-muted' };

export default function SalesView() {
  const hn = useHierNames();
  const [plants, setPlants] = useState('');
  const [from, setFrom] = useState(fyStart(today()));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<SalesRow[] | null>(null);
  const [pvm, setPvm] = useState<PvmRow[] | null>(null);
  const [pvmErr, setPvmErr] = useState('');
  const [thr, setThr] = useState<ThreshRow[]>([]);
  const [ran, setRan] = useState<{ plants: string; from: string; to: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('');
  const [channel, setChannel] = useState('');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setPlants(ls.get<string>('bce:dash-plants', '')); return () => ctl.current?.abort(); }, []);

  async function run() {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setBusy(true); setError('');
    try {
      const list = plants.split(/[\s,;]+/).filter(Boolean);
      const [r, pv, th] = await Promise.all([
        fetchSales(list, from, to, c.signal),
        fetchPvm(list, from, to, c.signal).then((x) => ({ rows: x.rows, err: '' })).catch((e) => ({ rows: null as PvmRow[] | null, err: c.signal.aborted ? '' : errorText(e) })),
        fetchThresholds(c.signal).then((x) => x.rows).catch(() => [] as ThreshRow[]),   // no bands: the defaults apply
      ]);
      setPvm(pv.rows); setPvmErr(pv.err); setThr(th);
      setRows(r.rows); setRan({ plants: list.join(', ').toUpperCase(), from, to }); setBrand(''); setChannel('');
      ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }

  const bands: GmBands = useMemo(() => gmBands(thr), [thr]);
  const all = useMemo(() => (rows ? salesViews(rows, bands) : []), [rows, bands]);
  const steps = useMemo(() => (pvm ? pvmSteps(pvm) : []), [pvm]);
  const brands = useMemo(() => brandSales(all), [all]);
  const skus = useMemo(() => skuSales(all).sort((a, b) => b.nsv.comparedTo(a.nsv)), [all]);
  const tot = useMemo(() => salesTotals(brands), [brands]);
  const channels = useMemo(() => Array.from(new Set(skus.map((s) => s.channel))).sort(), [skus]);
  const shownSkus = useMemo(() => skus.filter((s) => (!brand || s.brand === brand) && (!channel || s.channel === channel)), [skus, brand, channel]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">Plants
          <input className={cx(inputCls, 'w-56 uppercase')} placeholder="EM02, UN13" value={plants} onChange={(e) => setPlants(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">From<input type="date" className={cx(inputCls, 'w-40')} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">To<input type="date" className={cx(inputCls, 'w-40')} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="primary" disabled={busy || !plants.trim() || !from || !to} onClick={() => void run()}>{busy ? <><Spinner className="h-4 w-4" /> Running</> : 'Run'}</Button>
        {busy && <Button onClick={() => { ctl.current?.abort(); setBusy(false); }}>Stop</Button>}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows && !busy && !error && <Card><Empty title="Choose the plants and the period, then press Run">Invoiced sales of finished goods against SAP's actual cost of the same period.</Empty></Card>}
      {rows && !all.length && <Card><Empty title="No invoiced sales found">SAP returned no finished-good billing for these plants and dates.</Empty></Card>}
      {rows && all.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="GSV" value={`₹${lakh(tot.gsv, 0)} L`} sub="Gross sales value (condition ZSAL)" title="Condition ZSAL of the billing items; an item without ZSAL counts its net value" />
            <Stat label="NSV" value={`₹${lakh(tot.nsv, 0)} L`} sub={`Deductions ₹${lakh(tot.deductions, 0)} L`} title="Billing net value before GST. Deductions = GSV - NSV" />
            <Stat label="COGM (sold volume)" value={`₹${lakh(tot.cogm, 0)} L`} sub="Actual cost per piece x sold quantity" title="Only SKUs that have an actual cost in the period" />
            <Stat label="Gross margin" value={`₹${lakh(tot.gm, 0)} L (${pct(tot.gmPct)})`} tone={tot.gmPct === null ? undefined : tot.gmPct.lt(18) ? 'bad' : tot.gmPct.lt(22) ? 'warn' : 'good'} sub="NSV - COGM, SKUs with a cost" title="Margin basis: NSV of the SKUs that have an actual cost" />
          </div>
          <p className="text-xs text-muted">
            Plants {ran?.plants} · {ran?.from} to {ran?.to} · finished goods (FERT), INR invoices; invoices and debit memos add, cancellations and credit memos subtract.
            COGM = SAP's actual cost per piece of the same period x sold quantity. GM % bands per SKU category come from SAP ({thr.length ? `${thr.length} band rows` : 'none set: red below 18 %, amber below 22 %'}).
          </p>
          <BrandTable rows={brands} tot={tot} bn={hn.brand} />
          <Card className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold">Net realization vs COGM by SKU and channel</h3>
              <select aria-label="Filter by brand" className={cx(inputBase, 'h-9 ml-auto w-56')} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>{brands.map((b) => <option key={b.brand} value={b.brand}>{hn.brand(b.brand) || '(none)'}</option>)}
              </select>
              <select aria-label="Filter by channel" className={cx(inputBase, 'h-9 w-48')} value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="">All channels</option>{channels.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <SkuTable rows={shownSkus} bn={hn.brand} />
          </Card>
        </>
      )}
      {rows && <PvmBridge steps={steps} pvm={pvm} err={pvmErr} />}
    </>
  );
}

function BrandTable({ rows, tot, bn }: { rows: Row[]; tot: ReturnType<typeof salesTotals>; bn: (c: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[960px] border-collapse">
        <thead><tr>
          <th className={cx(thCls, '!text-left')}>Brand</th><th className={thCls}>Sold qty (pc)</th><th className={thCls}>GSV (L)</th><th className={thCls}>Deductions (L)</th><th className={thCls}>NSV (L)</th>
          <th className={thCls}>COGM (L)</th><th className={thCls}>Gross margin (L)</th><th className={thCls}>GM %</th><th className={cx(thCls, '!text-left')}>Note</th>
        </tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.brand || '-'} className="border-t border-line/60">
              <td className="px-2.5 py-1.5 text-left text-xs font-bold">{bn(b.brand) || '(none)'}</td>
              <td className={tdCls}>{money(b.soldQty, 0)}</td><td className={tdCls}>{lakh(b.gsv)}</td><td className={tdCls}>{lakh(b.deductions)}</td><td className={tdCls}>{lakh(b.nsv)}</td>
              <td className={tdCls}>{lakh(b.cogm)}</td><td className={tdCls}>{lakh(b.gm)}</td><td className={cx(tdCls, 'font-bold', BAND[b.band])}>{pct(b.gmPct)}</td>
              <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{b.msg}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t border-line font-extrabold">
          <td className="px-2.5 py-1.5 text-left text-xs">All brands</td><td className={tdCls}>{money(tot.soldQty, 0)}</td><td className={tdCls}>{lakh(tot.gsv)}</td><td className={tdCls}>{lakh(tot.deductions)}</td><td className={tdCls}>{lakh(tot.nsv)}</td>
          <td className={tdCls}>{lakh(tot.cogm)}</td><td className={tdCls}>{lakh(tot.gm)}</td><td className={tdCls}>{pct(tot.gmPct)}</td><td />
        </tr></tfoot>
      </table>
    </div>
  );
}

function SkuTable({ rows, bn }: { rows: Row[]; bn: (c: string) => string }) {
  if (!rows.length) return <p className="text-sm text-muted">No SKU lines for this choice.</p>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[980px] border-collapse">
        <thead className="sticky top-0"><tr>
          <th className={cx(thCls, '!text-left')}>SKU</th><th className={cx(thCls, '!text-left')}>Brand</th><th className={cx(thCls, '!text-left')}>Channel</th><th className={thCls}>Sold qty (pc)</th>
          <th className={thCls}>Net realization / pc</th><th className={thCls}>COGM / pc</th><th className={thCls}>GM / pc</th><th className={thCls}>GM %</th><th className={thCls}>Alert</th>
        </tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={`${s.matnr}|${s.vtweg}`} className="border-t border-line/60">
              <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{s.matnr.replace(/^0+/, '')}</span> <span className="text-muted" title={s.maktx}>{s.maktx}</span></td>
              <td className="px-2.5 py-1.5 text-left text-xs">{bn(s.brand) || '(none)'}</td><td className="px-2.5 py-1.5 text-left text-xs">{s.channel}</td>
              <td className={tdCls}>{money(s.soldQty, 0)}</td><td className={tdCls}>{money(s.netRealPc)}</td><td className={tdCls}>{money(s.cogmPc)}</td><td className={tdCls}>{money(s.gmPc)}</td>
              <td className={cx(tdCls, 'font-bold', BAND[s.band])}>{pct(s.gmPct)}</td>
              <td className={tdCls}><span className={cx('rounded-full px-2 py-0.5 text-2xs font-bold', PILL[s.band])}>{ALERT[s.band]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PvmBridge({ steps, pvm, err }: { steps: PvmStep[]; pvm: PvmRow[] | null; err: string }) {
  const note = pvm?.find((r) => r.SortNo === 0)?.Msg || pvm?.find((r) => r.SortNo === 1)?.Msg || '';
  if (err) return <NeedsSap title="Price-volume-mix-cost bridge" object="DashPvmSet" why={err} />;
  if (!pvm) return null;
  if (!steps.length) return (
    <Card className="p-4 text-sm">
      <h3 className="text-base font-extrabold">Price-volume-mix-cost bridge: budget to actual gross margin</h3>
      <p className="mt-2 text-muted">{note || 'No sales budget found.'}</p>
      <p className="mt-1 text-xs text-muted">The bridge compares actual with the approved sales budget (ZSALES_BUD_TGT: quantity, net realisation and COGM per piece by SKU and channel, per financial year and version, status A).</p>
    </Card>
  );
  const max = steps.reduce((m, s) => (s.value.abs().gt(m) ? s.value.abs() : m), steps[0].value.abs());
  return (
    <Card className="p-4">
      <h3 className="text-base font-extrabold">Price-volume-mix-cost bridge: budget to actual gross margin (₹ lakh)</h3>
      {note && <p className="mb-2 mt-1 text-xs text-muted">{note}</p>}
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <div key={s.effect} className="flex items-center gap-2 text-xs">
            <div className="w-44 shrink-0 text-muted">{s.effect}</div>
            <div className="relative h-4 flex-1 rounded bg-line/60">
              <div className={cx('h-4 rounded', s.total ? 'bg-accent' : s.value.gte(0) ? 'bg-good' : 'bg-bad')} style={{ width: `${max.isZero() ? 0 : Math.min(100, s.value.abs().div(max).times(100).toNumber())}%` }} />
            </div>
            <div className="w-24 shrink-0 text-right font-semibold tabular-nums">₹{lakh(s.value)} L</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-2xs text-muted">Price = (actual - budget net realisation) x actual qty · Volume = change in total qty x average budget margin · Mix = shift of the qty mix between SKUs, at budget margin · Cost = (budget - actual COGM per piece) x actual qty. The four add up to the margin change.</p>
    </Card>
  );
}
