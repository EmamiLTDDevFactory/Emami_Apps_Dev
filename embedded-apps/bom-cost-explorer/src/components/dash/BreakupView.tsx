'use client';
/**
 * Cost breakup: SAP's actual cost per piece of the period by group (RM, PM, Perfume, Conversion) for the finished goods produced in the chosen plants (WacRowSet).
 * Brand rows are quantity-weighted. A budget split by group and the scheme dimension need SAP objects that do not exist yet.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type Decimal from 'decimal.js';
import { Button, Card, Empty, Spinner, cx, inputBase, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchWac } from '@/lib/wac/service';
import { breakupByBrand, breakupByFg, breakupByProduct, budgetSplit, splitTotal, type BreakupView, type SplitRow } from '@/lib/dash/logic';
import { fetchMisDetail } from '@/lib/dash/service';
import type { MisFgRow } from '@/lib/dash/types';
import type { WacRow } from '@/lib/wac/types';
import { ls } from '@/lib/client/storage';
import { useHierNames } from '@/lib/client/useHierNames';
import FgOrdersDrawer, { type FgTarget } from './FgOrdersDrawer';
import { fyStart, money, pct, tdCls, thCls, today } from './parts';

export default function BreakupView() {
  const hn = useHierNames();
  const [plants, setPlants] = useState('');
  const [from, setFrom] = useState(fyStart(today()));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<WacRow[] | null>(null);
  const [ran, setRan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('');
  const [fg, setFg] = useState<FgTarget | null>(null);
  const [bud, setBud] = useState<MisFgRow[] | null>(null);
  const [budErr, setBudErr] = useState('');
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
      // approved budget per piece by group and the scheme of each finished good (SAP MIS finished-good rows, financial year of the "to" date)
      setBud(null); setBudErr('');
      fetchMisDetail(list, to, c.signal).then((x) => { if (!c.signal.aborted) setBud(x.rows.filter((y) => y.Matnr)); })
        .catch((e) => { if (!c.signal.aborted) setBudErr(errorText(e)); });
      ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }

  const fgs = useMemo(() => (rows ? breakupByFg(rows) : []), [rows]);
  const brands = useMemo(() => breakupByBrand(fgs), [fgs]);
  const prods = useMemo(() => breakupByProduct(fgs), [fgs]);
  const splitBrand = useMemo(() => (bud ? budgetSplit(fgs, bud, (f) => ({ key: f.brand, label: hn.brand(f.brand) || '(none)' })) : []), [fgs, bud, hn]);
  const splitScheme = useMemo(() => (bud ? budgetSplit(fgs, bud, (_f, b) => ({ key: b?.Zscheme ?? '', label: b?.Zscheme ? `Scheme ${b.Zscheme}` : '(no scheme)' })) : []), [fgs, bud]);
  const hasSplit = !!bud && bud.some((b) => b.BudRm !== undefined && b.BudRm !== '');
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
          <Table title="By brand" rows={brands} first="Brand" bn={hn.brand} />
          <Table title="By product" rows={prods.filter((p) => !brand || p.brand === brand)} first="Brand · product" bn={hn.brand} label={(r) => `${hn.brand(r.brand) || '(none)'} · ${hn.product(r.prodha ?? '') || r.prodha || '(no product)'}`} />
          <Card className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-extrabold">By finished good</h3>
              <select aria-label="Filter by brand" className={cx(inputBase, 'h-9 ml-auto w-56')} value={brand} onChange={(e) => setBrand(e.target.value)}>
                <option value="">All brands</option>{brands.map((b) => <option key={b.brand} value={b.brand}>{hn.brand(b.brand) || '(none)'}</option>)}
              </select>
            </div>
            <Table rows={shown} first="SKU" scroll bn={hn.brand} onOpen={(r) => setFg({ matnr: r.matnr, maktx: r.maktx, werks: r.werks, brand: r.brand, from, to })} />
          </Card>
        </>
      )}
      <FgOrdersDrawer target={fg} onClose={() => setFg(null)} />
      {rows && fgs.length > 0 && (
        <>
          {budErr && <ErrorBox>{`Budget split not available: ${budErr}`}</ErrorBox>}
          {!bud && !budErr && <p className="text-xs text-muted">Loading the approved budget by group…</p>}
          {bud && !hasSplit && <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs">SAP did not send the budget by group (the MIS finished-good rows lack the budget fields: import the latest transport EDSK9B0EP0).</p>}
          {hasSplit && <SplitTable title="Budget vs actual by group, by brand (₹ per piece)" first="Brand" rows={splitBrand} />}
          {hasSplit && <SplitTable title="Budget vs actual by group, by scheme (₹ per piece)" first="Scheme" rows={splitScheme} />}
        </>
      )}
    </>
  );
}

function Table({ rows, first, title, scroll, bn, label, onOpen }: { rows: BreakupView[]; first: string; title?: string; scroll?: boolean; bn: (c: string) => string; label?: (r: BreakupView) => string; onOpen?: (r: BreakupView) => void }) {
  const cell = (v: BreakupView['rm'], p: BreakupView['shareRm']) => (<><td className={tdCls}>{money(v, 4)}</td><td className={cx(tdCls, 'text-muted')}>{pct(p)}</td></>);
  return (
    <div className={cx('overflow-auto rounded-2xl border border-line bg-panel', scroll ? 'max-h-[60vh]' : 'shadow-card')}>
      {title && <div className="border-b border-line px-3 py-2 text-sm font-extrabold">{title}</div>}
      <table className="w-full min-w-[960px] border-collapse">
        <thead className="sticky top-0"><tr>
          <th className={cx(thCls, '!text-left')}>{first}</th><th className={thCls}>Produced qty</th>
          <th className={thCls}>RM / pc</th><th className={thCls}>%</th><th className={thCls}>PM / pc</th><th className={thCls}>%</th><th className={thCls}>Perfume / pc</th><th className={thCls}>%</th><th className={thCls}>Conversion / pc</th><th className={thCls}>%</th><th className={thCls}>COGM / pc</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={cx('border-t border-line/60', onOpen && r.matnr && 'cursor-pointer hover:bg-sunken')} onClick={onOpen && r.matnr ? () => onOpen(r) : undefined} title={onOpen && r.matnr ? 'Open the process orders and items' : undefined}>
              <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{(r.matnr ? r.matnr.replace(/^0+/, '') : label ? label(r) : bn(r.brand)) || '(none)'}</span> <span className="text-muted" title={r.maktx}>{r.maktx}{r.werks ? ` · ${r.werks}` : ''}</span></td>
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

const dv = (a: Decimal, b: Decimal) => (b.gt(0) ? a.minus(b).div(b).times(100) : null);
function SplitTable({ title, first, rows }: { title: string; first: string; rows: SplitRow[] }) {
  const grp = (a: Decimal, b: Decimal) => { const v = dv(a, b); return (<><td className={tdCls}>{money(b, 4)}</td><td className={tdCls}>{money(a, 4)}</td><td className={cx(tdCls, 'font-semibold', v && v.gt(0.5) ? 'text-bad' : v && v.lt(-0.5) ? 'text-good' : 'text-muted')}>{v ? `${v.gt(0) ? '+' : ''}${v.toFixed(1)} %` : '-'}</td></>); };
  return (
    <div className="overflow-auto rounded-2xl border border-line bg-panel shadow-card">
      <div className="border-b border-line px-3 py-2 text-sm font-extrabold">{title}</div>
      <p className="px-3 pt-2 text-2xs text-muted">Budget = approved budget per piece of the financial year (ZMM_FBUDCOST_SUM, latest version); conversion = machine, labour, power, steam, labour 3P. Both sides are quantity-weighted over the finished goods that have a budget; the others are counted in "no budget". Variance % = actual vs budget (red = costs more).</p>
      <table className="w-full min-w-[1180px] border-collapse">
        <thead>
          <tr><th className={cx(thCls, '!text-left')} rowSpan={2}>{first}</th><th className={thCls} rowSpan={2}>FG (no budget)</th><th className={thCls} rowSpan={2}>Produced qty</th>
            {['RM', 'PM', 'Perfume', 'Conversion', 'Total'].map((h) => <th key={h} className={thCls} colSpan={3}>{h}</th>)}</tr>
          <tr>{Array.from({ length: 5 }).flatMap((_, i) => ['Budget', 'Actual', 'Var %'].map((h) => <th key={`${i}-${h}`} className={thCls}>{h}</th>))}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key || '-'} className="border-t border-line/60">
              <td className="px-2.5 py-1.5 text-left text-xs font-bold">{r.label}</td><td className={tdCls}>{r.fgCnt} ({r.fgNoBudget})</td><td className={tdCls}>{r.qty.toNumber().toLocaleString('en-IN')}</td>
              {grp(r.act.rm, r.bud.rm)}{grp(r.act.pm, r.bud.pm)}{grp(r.act.pf, r.bud.pf)}{grp(r.act.conv, r.bud.conv)}{grp(splitTotal(r.act), splitTotal(r.bud))}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={18} className="p-3 text-center text-xs text-muted">No finished goods with an approved budget.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
