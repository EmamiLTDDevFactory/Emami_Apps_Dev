'use client';
/**
 * Margin analysis: invoiced sales with the invoice conditions (MRP, channel margins, selling price, GST, cost conditions) per brand, product category, SKU and customer,
 * Gross margin = Revenue - COGS, plus a what-if panel (price, promo, volume, RM / PM / perfume / overhead / scheme cost) and the budget comparison.
 * "As per current COGM" comes from a file the business supplies (per piece by SKU); until it is loaded the column shows the invoice cost.
 */
import type Decimal from 'decimal.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Segmented, Spinner, Stat, cx, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchMargin, type MarginSel } from '@/lib/dash/service';
import CdrillDrawer, { type DrillTarget } from './CdrillDrawer';
import { NO_DRIVERS, cogmDrivers, groupBy, marginNotes, parseCurrentCogm, parseMargin, promoBreakeven, sensitivity, totalOf, type Basis, type Cur, type Drivers, type Group, type MLine, type Result } from '@/lib/dash/margin';
import type { MarginRow } from '@/lib/dash/types';
import { ls } from '@/lib/client/storage';
import { fyStart, lakh, money, pct, tdCls, thCls, today } from './parts';

type By = 'brand' | 'cat' | 'sku' | 'cust';
const SLIDERS: { k: keyof Drivers; label: string; min: number; max: number }[] = [
  { k: 'price', label: 'Selling price', min: -20, max: 20 }, { k: 'promo', label: 'Promo discount', min: 0, max: 30 }, { k: 'volume', label: 'Volume', min: -50, max: 100 },
  { k: 'rm', label: 'Raw material cost', min: -30, max: 30 }, { k: 'pm', label: 'Packing material cost', min: -30, max: 30 }, { k: 'pf', label: 'Perfume cost', min: -30, max: 30 },
  { k: 'oh', label: 'Overhead', min: -30, max: 30 }, { k: 'scheme', label: 'Scheme cost', min: -50, max: 100 },
];
const gmTone = (p: Result['gmPct']) => (p === null ? 'text-muted' : p.lt(0) ? 'text-bad' : p.lt(18) ? 'text-warn' : 'text-good');

export default function MarginView() {
  const [plants, setPlants] = useState('');
  const [vkorg, setVkorg] = useState('');
  const [vtweg, setVtweg] = useState('');
  const [crssku, setCrssku] = useState('');
  const [vbeln, setVbeln] = useState('');
  const [from, setFrom] = useState(fyStart(today()));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [basis, setBasis] = useState<Basis>('gross');
  const [dr, setDr] = useState<Drivers>(NO_DRIVERS);
  const [by, setBy] = useState<By>('brand');
  const [curText, setCurText] = useState('');
  const [useCur, setUseCur] = useState(true);
  const [fileMsg, setFileMsg] = useState('');
  const [brand, setBrand] = useState('');
  const [ran, setRan] = useState<{ sel: MarginSel; from: string; to: string } | null>(null);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setPlants(ls.get<string>('bce:dash-plants', '')); setCurText(ls.get<string>('bce:dash-curcogm', '')); return () => ctl.current?.abort(); }, []);

  async function run() {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setBusy(true); setError('');
    try {
      const sp = (x: string) => x.split(/[\s,;]+/).filter(Boolean);
      const sel = { plants: sp(plants), vkorg: sp(vkorg), vtweg: sp(vtweg), crssku: sp(crssku), vbeln: sp(vbeln) };
      const r = await fetchMargin(sel, from, to, c.signal);
      setRows(r.rows); setRan({ sel, from, to }); setBrand(''); ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const t = await f.text();
    const p = parseCurrentCogm(t);
    if (p.error) { setFileMsg(p.error); return; }
    setCurText(t); setFileMsg(`${p.rows} SKUs loaded from ${f.name}`);
    try { ls.set('bce:dash-curcogm', t.length < 900_000 ? t : ''); } catch { /* too large to keep */ }
  }

  const parsed = useMemo(() => (rows ? parseMargin(rows) : { sku: [], customers: [] }), [rows]);
  const cp = useMemo(() => (curText ? parseCurrentCogm(curText) : null), [curText]);
  const hasCur = !!cp && !cp.error && cp.rows > 0;
  const cur: Cur | undefined = hasCur ? { map: cp!.map, total: cp!.total, on: useCur } : undefined;
  const skus = useMemo(() => parsed.sku.filter((s) => !brand || s.brand === brand), [parsed.sku, brand]);
  const brands = useMemo(() => Array.from(new Set(parsed.sku.map((s) => s.brand))).sort(), [parsed.sku]);
  const base = useMemo(() => totalOf(skus, NO_DRIVERS, basis, cur), [skus, basis, cur]);
  const scen = useMemo(() => totalOf(skus, dr, basis, cur), [skus, dr, basis, cur]);
  const groups = useMemo<Group[]>(() => {
    if (by === 'cust') return groupBy(parsed.customers, (l) => l.kunag, (l) => l.label, dr, basis);
    const key = by === 'brand' ? (l: MLine) => l.brand : by === 'cat' ? (l: MLine) => l.matkl : (l: MLine) => l.matnr;
    const lab = by === 'sku' ? (l: MLine) => `${l.matnr.replace(/^0+/, '')} ${l.label}` : key;
    return groupBy(skus, key, lab, dr, basis, cur);
  }, [by, skus, parsed.customers, dr, basis, cur]);
  const sens = useMemo(() => sensitivity(skus, dr, basis, cur), [skus, dr, basis, cur]);
  const brk = useMemo(() => promoBreakeven(skus, dr.promo, basis, cur), [skus, dr.promo, basis, cur]);
  const drivers = useMemo(() => (cur ? cogmDrivers(skus, cur) : []), [skus, cur]);
  const nbc = skus.filter((s) => !s.bud).length;
  const notes = useMemo(() => marginNotes(base, scen, groups, nbc), [base, scen, groups, nbc]);
  const changed = JSON.stringify(dr) !== JSON.stringify(NO_DRIVERS);
  const budGap = scen.budQty.gt(0) ? scen.cogs.minus(scen.budCogs) : null;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold">Plant
          <input className={cx(inputCls, 'w-36 uppercase')} placeholder="DP01, DP03" value={plants} onChange={(e) => setPlants(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Sales org
          <input className={cx(inputCls, 'w-28 uppercase')} placeholder="EM01" value={vkorg} onChange={(e) => setVkorg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Channel
          <input className={cx(inputCls, 'w-24 uppercase')} placeholder="10, 20" value={vtweg} onChange={(e) => setVtweg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">CRSSKU
          <input className={cx(inputCls, 'w-40 uppercase')} placeholder="CRSSKU code" value={crssku} onChange={(e) => setCrssku(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">Invoice no.
          <input className={cx(inputCls, 'w-36')} placeholder="7880120981" inputMode="numeric" value={vbeln} onChange={(e) => setVbeln(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} title="One or more invoice numbers; the dates still apply" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">From<input type="date" className={cx(inputCls, 'w-40')} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="flex flex-col gap-1 text-xs font-semibold">To<input type="date" className={cx(inputCls, 'w-40')} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="primary" disabled={busy || !(plants.trim() || vkorg.trim() || crssku.trim() || vbeln.trim()) || !from || !to} onClick={() => void run()}>{busy ? <><Spinner className="h-4 w-4" /> Running</> : 'Run'}</Button>
        {busy && <Button onClick={() => { ctl.current?.abort(); setBusy(false); }}>Stop</Button>}
        <Segmented label="Revenue basis" size="sm" value={basis} onChange={setBasis} options={[{ value: 'gross', label: 'Gross sales (with GST)', hint: 'Selling price + GST, as in the Gross Margin Analysis report' }, { value: 'sp', label: 'Selling price' }]} />
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!rows && !busy && !error && <Card><Empty title="Choose a plant, sales organisation, CRSSKU or invoice number and the period, then press Run">Invoice conditions of finished goods: MRP, channel margins, selling price, GST, cost per component and schemes.</Empty></Card>}
      {rows && !parsed.sku.length && <Card><Empty title="No invoiced sales found">SAP returned no finished-good billing for these plants and dates.</Empty></Card>}
      {rows && parsed.sku.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Revenue" value={`₹${lakh(scen.revenue, 0)} L`} sub={basis === 'gross' ? 'Gross sales (selling price + GST)' : 'Selling price (ZP12)'} />
            <Stat label="COGS" value={`₹${lakh(scen.cogs, 0)} L`} sub="RM + PM + perfume + overhead + schemes" title="Invoice cost conditions, or the current COGM data set when loaded" />
            <Stat label="Gross margin" value={`₹${lakh(scen.gm, 0)} L`} sub={`As invoiced ₹${lakh(base.gm, 0)} L`} tone={scen.gm.gte(base.gm) ? 'good' : 'bad'} />
            <Stat label="GM %" value={pct(scen.gmPct)} sub={`As invoiced ${pct(base.gmPct)}`} tone={scen.gmPct === null ? undefined : scen.gmPct.lt(0) ? 'bad' : scen.gmPct.lt(18) ? 'warn' : 'good'} />
          </div>
          <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
            <Card className="p-4">
              <div className="flex items-center"><h3 className="text-sm font-extrabold">What if</h3>{changed && <Button size="sm" className="ml-auto" onClick={() => setDr(NO_DRIVERS)}>Reset</Button>}</div>
              <div className="mt-2 flex flex-col gap-2.5">
                {SLIDERS.map((s) => (
                  <label key={s.k} className="flex flex-col gap-0.5 text-xs">
                    <span className="flex justify-between font-semibold"><span>{s.label}</span><span className="tabular-nums">{dr[s.k] > 0 ? '+' : ''}{dr[s.k]} %</span></span>
                    <input type="range" min={s.min} max={s.max} step={1} value={dr[s.k]} onChange={(e) => setDr({ ...dr, [s.k]: Number(e.target.value) })} aria-label={s.label} />
                  </label>
                ))}
              </div>
              {dr.promo > 0 && <p className="mt-3 rounded-lg bg-sunken p-2 text-xs">{brk === null ? 'A promo of this size cannot be recovered by volume: the margin per piece is gone.' : `A ${dr.promo} % promo needs ${brk.toFixed(1)} % more volume to keep today's gross margin.`}</p>}
              <h4 className="mt-4 text-xs font-extrabold uppercase tracking-wide text-muted">Which driver moves the margin most (+5 %)</h4>
              <ul className="mt-1 text-xs">
                {sens.map((s) => <li key={s.driver} className="flex justify-between border-t border-line/60 py-1"><span>{s.label}</span><span className={cx('tabular-nums font-semibold', s.delta.gte(0) ? 'text-good' : 'text-bad')}>{s.delta.gte(0) ? '+' : ''}₹{lakh(s.delta, 2)} L</span></li>)}
              </ul>
            </Card>
            <div className="flex flex-col gap-3">
              <Waterfall base={base} scen={scen} changed={changed} budGap={budGap} />
              <Card className="p-4 text-sm">
                <h3 className="text-sm font-extrabold">As per current COGM</h3>
                <p className="mt-1 text-xs text-muted">Load the data set (CSV with a header: Matnr and Cogm per piece, or Matnr, Rm, Pm, Pf, Oh per piece). It replaces the invoice RM, PM, perfume and overhead of each SKU it contains; scheme cost stays from the invoice.</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input type="file" accept=".csv,.txt,.tsv" aria-label="Current COGM file" onChange={(e) => void onFile(e.target.files?.[0])} className="text-xs" />
                  {hasCur && <label className="flex items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={useCur} onChange={(e) => setUseCur(e.target.checked)} />Use it ({cp!.rows} SKUs)</label>}
                  {hasCur && <Button size="sm" onClick={() => { setCurText(''); setFileMsg(''); try { ls.set('bce:dash-curcogm', ''); } catch { /* ignore */ } }}>Remove</Button>}
                </div>
                {(fileMsg || cp?.error) && <p className="mt-1 text-xs text-muted">{cp?.error || fileMsg}</p>}
                {hasCur && drivers.some((x) => !x.invoice.isZero() || !x.current.isZero()) && (
                  <table className="mt-3 w-full border-collapse text-xs">
                    <thead><tr><th className="text-left text-2xs uppercase text-muted">Cost driver</th><th className={thCls}>Invoice (L)</th><th className={thCls}>Current (L)</th><th className={thCls}>Difference (L)</th></tr></thead>
                    <tbody>{drivers.map((x) => <tr key={x.comp} className="border-t border-line/60"><td className="py-1">{x.label}</td><td className={tdCls}>{lakh(x.invoice, 2)}</td><td className={tdCls}>{lakh(x.current, 2)}</td><td className={cx(tdCls, 'font-bold', x.delta.gt(0) ? 'text-bad' : 'text-good')}>{lakh(x.delta, 2)}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
            </div>
          </div>
          <Card className="p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Segmented label="Group by" size="sm" value={by} onChange={setBy} options={[{ value: 'brand', label: 'Brand' }, { value: 'cat', label: 'Product category' }, { value: 'sku', label: 'Material' }, { value: 'cust', label: 'Customer' }]} />
              {by !== 'cust' && <select aria-label="Filter by brand" className={cx(inputCls, 'ml-auto w-40')} value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">All brands</option>{brands.map((b) => <option key={b} value={b}>{b || '(none)'}</option>)}</select>}
            </div>
            <GroupTable groups={groups} material={by === 'sku'} onBreakup={ran ? (g) => {
              const q = g.base.qty;
              setDrill({ matnr: g.lines[0].matnr, label: g.label, sel: ran.sel, from: ran.from, to: ran.to, invoice: q.isZero() ? null : { rm: g.base.rm.div(q), pm: g.base.pm.div(q), pf: g.base.pf.div(q), oh: g.base.oh.div(q) } });
            } : undefined} />
            {by === 'cust' && <p className="mt-2 text-2xs text-muted">Customer lines use the invoice cost (the current COGM data set is by SKU).</p>}
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-extrabold">Reading</h3>
            <ul className="mt-1 list-disc pl-5 text-xs">{notes.map((n, i) => <li key={i} className={n.tone === 'bad' ? 'text-bad' : n.tone === 'warn' ? 'text-warn' : n.tone === 'good' ? 'text-good' : ''}>{n.text}</li>)}</ul>
            <p className="mt-2 text-2xs text-muted">Gross margin = revenue - COGS; GM % = gross margin / revenue x 100. Channel margins: retailer = ZREM + ZTDP, distributor = ZDIM + ZTDM, super stockist = ZSSM + ZTSM. GST = JOIG + JOCG + JOSG. Budget cost is the latest approved version of the financial year, matched on CRSSKU + business vertical + scheme; SKUs without one are flagged NBC. Finished goods (FERT), INR invoices; invoices and debit memos add, cancellations and credit memos subtract.</p>
          </Card>
        </>
      )}
      <CdrillDrawer target={drill} onClose={() => setDrill(null)} />
    </>
  );
}

function Waterfall({ base, scen, changed, budGap }: { base: Result; scen: Result; changed: boolean; budGap: Decimal | null }) {
  const L: { label: string; get: (r: Result) => Decimal; bold?: boolean }[] = [
    { label: 'MRP', get: (r) => r.mrp }, { label: 'Channel margins (retailer + distributor + super stockist)', get: (r) => r.chan }, { label: 'Selling price (ZP12)', get: (r) => r.sp, bold: true },
    { label: 'GST', get: (r) => r.gst }, { label: 'Gross sales', get: (r) => r.gross, bold: true },
    { label: 'Raw material', get: (r) => r.rm }, { label: 'Packing material', get: (r) => r.pm }, { label: 'Perfume', get: (r) => r.pf }, { label: 'Overhead', get: (r) => r.oh }, { label: 'Scheme cost (consumer + trade)', get: (r) => r.scheme },
    { label: 'COGS', get: (r) => r.cogs, bold: true }, { label: 'Gross margin', get: (r) => r.gm, bold: true },
  ];
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[520px] border-collapse">
        <thead><tr><th className={cx(thCls, 'text-left')}>₹ lakh</th><th className={thCls}>As invoiced</th>{changed && <th className={thCls}>Scenario</th>}</tr></thead>
        <tbody>
          {L.map((x) => <tr key={x.label} className={cx('border-t border-line/60', x.bold && 'font-extrabold')}><td className="px-2.5 py-1.5 text-left text-xs">{x.label}</td><td className={tdCls}>{lakh(x.get(base), 2)}</td>{changed && <td className={tdCls}>{lakh(x.get(scen), 2)}</td>}</tr>)}
          <tr className="border-t border-line font-extrabold"><td className="px-2.5 py-1.5 text-left text-xs">GM %</td><td className={cx(tdCls, gmTone(base.gmPct))}>{pct(base.gmPct)}</td>{changed && <td className={cx(tdCls, gmTone(scen.gmPct))}>{pct(scen.gmPct)}</td>}</tr>
          {budGap && <tr className="border-t border-line/60"><td className="px-2.5 py-1.5 text-left text-xs">COGS above (+) / below (-) budget cost, SKUs with a budget</td><td className={cx(tdCls, budGap.gt(0) ? 'text-bad' : 'text-good')} colSpan={changed ? 2 : 1}>{lakh(budGap, 2)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({ groups, material, onBreakup }: { groups: Group[]; material: boolean; onBreakup?: (g: Group) => void }) {
  const qty = (v: Decimal) => (material ? money(v, 0) : lakh(v, 2));
  const val = (v: Decimal) => (material ? money(v, 0) : lakh(v));
  if (!groups.length) return <p className="text-sm text-muted">No lines for this choice.</p>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-line">
      <table className="w-full min-w-[1100px] border-collapse">
        <thead className="sticky top-0"><tr>
          <th className={cx(thCls, 'text-left')}>{material ? 'Material' : 'Group'}</th><th className={thCls}>{material ? 'Qty (pc)' : 'Qty (L pc)'}</th><th className={thCls}>{material ? 'Selling price (₹)' : 'Selling price (L)'}</th><th className={thCls}>{material ? 'Gross sales (₹)' : 'Gross sales (L)'}</th><th className={thCls}>{material ? 'Revenue (₹)' : 'Revenue (L)'}</th><th className={thCls}>{material ? 'COGS (₹)' : 'COGS (L)'}</th><th className={thCls}>{material ? 'Gross margin (₹)' : 'Gross margin (L)'}</th><th className={thCls}>GM %</th><th className={thCls}>GM / pc</th><th className={thCls}>vs invoiced (L)</th>{material && onBreakup && <th className={thCls}>Cost breakup</th>}<th className={thCls}>Budget flag</th>
        </tr></thead>
        <tbody>
          {groups.map((g) => {
            const nbc = g.lines.filter((l) => !l.bud && l.grain === 'S').length;
            return (
              <tr key={g.key} className="border-t border-line/60">
                <td className="px-2.5 py-1.5 text-left text-xs font-bold" title={g.label}>{g.label}</td>
                <td className={tdCls}>{qty(g.scen.qty)}</td><td className={tdCls}>{val(g.scen.sp)}</td><td className={tdCls}>{val(g.scen.gross)}</td><td className={tdCls}>{val(g.scen.revenue)}</td><td className={tdCls}>{val(g.scen.cogs)}</td><td className={tdCls}>{val(g.scen.gm)}</td>
                <td className={cx(tdCls, 'font-bold', gmTone(g.scen.gmPct))}>{pct(g.scen.gmPct)}</td>
                <td className={tdCls}>{g.scen.qty.isZero() ? '-' : money(g.scen.gm.div(g.scen.qty))}</td>
                <td className={cx(tdCls, g.scen.gm.gte(g.base.gm) ? 'text-good' : 'text-bad')}>{lakh(g.scen.gm.minus(g.base.gm), 2)}</td>
                {material && onBreakup && <td className={tdCls}><button type="button" className="rounded-lg border border-line px-2 py-0.5 text-2xs font-bold text-accent hover:bg-sunken" onClick={() => onBreakup(g)}>Breakup</button></td>}
                <td className={tdCls}>{g.lines[0]?.grain === 'C' ? '-' : nbc ? <span className="rounded-full bg-warn/15 px-2 py-0.5 text-2xs font-bold text-warn" title="No Budgeted Cost / trading goods">NBC {nbc}</span> : 'OK'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
