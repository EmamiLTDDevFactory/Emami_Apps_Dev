'use client';
/**
 * Cost breakup: SAP's actual cost per piece of the period by group (RM, PM, Perfume, Conversion) for the finished goods produced in the chosen plants (WacRowSet).
 * Brand rows are quantity-weighted. A budget split by group and the scheme dimension need SAP objects that do not exist yet.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Spinner, cx, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchWac } from '@/lib/wac/service';
import { breakupByBrand, breakupByFg, type BreakupView } from '@/lib/dash/logic';
import type { WacRow } from '@/lib/wac/types';
import { ls } from '@/lib/client/storage';
import { NeedsSap, fyStart, money, pct, tdCls, thCls, today } from './parts';

export default function BreakupView() {
  const [plants, setPlants] = useState('');
  const [from, setFrom] = useState(fyStart(today()));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<WacRow[] | null>(null);
  const [ran, setRan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setPlants(ls.get<string>('bce:dash-plants', '')); return () => ctl.current?.abort(); }, []);

  async function run() {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setBusy(true); setError('');
    try {
      const list = plants.split(/[\s,;]+/).filter(Boolean).map((p) => p.toUpperCase());
      const r = await fetchWac('ROWS', { plants: list, dateFrom: from, dateTo: to }, { signal: c.signal });
      setRows(r.rows); setRan(`Plants ${list.join(', ')} · ${from} to ${to}`); setBrand('');
      ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }

  const fgs = useMemo(() => (rows ? breakupByFg(rows) : []), [rows]);
  const brands = useMemo(() => breakupByBrand(fgs), [fgs]);
  const shown = useMemo(() => fgs.filter((f) => !brand || f.brand === brand).sort((a, b) => b.qty.cmp(a.qty)), [fgs, brand]);

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">Plants<input className={cx(inputCls, 'w-56 uppercase')} placeholder="UN13, UN08" value={plants} onChange={(e) => setPlants(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">From<input type="date" className={cx(inputCls, 'w-40')} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">To<input type="date" className={cx(inputCls, 'w-40')} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="primary" disabled={busy || !plants.trim() || !from || !to} onClick={() => void run()}>{busy ? <><Spinner className="h-4 w-4" /> Running</> : 'Run'}</Button>
        {busy && <Button onClick={() => { ctl.current?.abort(); setBusy(false); }}>Stop</Button>}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows && !busy && !error && <Card><Empty title="Choose the plants and the period, then press Run">Actual cost per piece by group for the finished goods produced.</Empty></Card>}
      {rows && !fgs.length && <Card><Empty title="No production found">SAP returned no finished-good production for these plants and dates.</Empty></Card>}
      {rows && fgs.length > 0 && (
        <>
          <p className="text-xs text-muted">{ran} · actual cost per piece in INR (SAP): RM, PM, Perfume and Conversion; COGM = their sum. Brand rows are weighted by produced quantity.</p>
          <Table title="By brand" rows={brands} first="Brand" />
          <Card className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-extrabold">By finished good</h3>
              <select aria-label="Filter by brand" className={cx(inputCls, 'ml-auto w-40')} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>{brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand || '(none)'}</option>)}
              </select>
            </div>
            <Table rows={shown} first="SKU" scroll />
          </Card>
        </>
      )}
      <NeedsSap title="Budget split by group and by scheme" object="ZI_ACT_PROC_COST_ITEM extended with a SCHEME dimension; budget cost per group"
        why="The budget table holds no cost split per group that can be checked (every cost value on EDS is zero), and SAP has no scheme dimension on the actual cost yet. Until then this tab shows the actual split only." />
    </>
  );
}

function Table({ rows, first, title, scroll }: { rows: BreakupView[]; first: string; title?: string; scroll?: boolean }) {
  const cell = (v: BreakupView['rm'], p: BreakupView['shareRm']) => (<><td className={tdCls}>{money(v, 4)}</td><td className={cx(tdCls, 'text-muted')}>{pct(p)}</td></>);
  return (
    <div className={cx('overflow-auto rounded-2xl border border-line bg-panel', scroll ? 'max-h-[60vh]' : 'shadow-card')}>
      {title && <div className="border-b border-line px-3 py-2 text-sm font-extrabold">{title}</div>}
      <table className="w-full min-w-[960px] border-collapse">
        <thead className="sticky top-0"><tr>
          <th className={cx(thCls, 'text-left')}>{first}</th><th className={thCls}>Produced qty</th>
          <th className={thCls}>RM / pc</th><th className={thCls}>%</th><th className={thCls}>PM / pc</th><th className={thCls}>%</th><th className={thCls}>Perfume / pc</th><th className={thCls}>%</th><th className={thCls}>Conversion / pc</th><th className={thCls}>%</th><th className={thCls}>COGM / pc</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line/60">
              <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{(r.matnr ? r.matnr.replace(/^0+/, '') : r.brand) || '(none)'}</span> <span className="text-muted" title={r.maktx}>{r.maktx}{r.werks ? ` · ${r.werks}` : ''}</span></td>
              <td className={tdCls}>{r.qty.toNumber().toLocaleString('en-IN')}</td>
              {cell(r.rm, r.shareRm)}{cell(r.pm, r.sharePm)}{cell(r.perf, r.sharePerf)}{cell(r.conv, r.shareConv)}
              <td className={cx(tdCls, 'font-bold')}>{money(r.cogm, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
