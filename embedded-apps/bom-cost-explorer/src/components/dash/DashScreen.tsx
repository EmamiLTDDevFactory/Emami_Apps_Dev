'use client';
/**
 * Costing dashboard. MIS is live (DashMisSet: SAP's actual cost of the period against the approved budget cost per piece x actual quantity, by brand,
 * month to date and year to date) with rule-based notes from those numbers. The tabs whose SAP objects do not exist yet say exactly which one they wait for.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Button, Card, Empty, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import { ErrorBox } from '../budget-mgmt/shared';
import { BASE_PATH } from '@/lib/client/session';
import { errorText } from '../budget-mgmt/shared';
import { fetchMis } from '@/lib/dash/service';
import { brandViews, insights, toLakh, totals, type Band, type BrandView, type Window } from '@/lib/dash/logic';
import type { MisRow } from '@/lib/dash/types';
import { ls } from '@/lib/client/storage';

type Tab = 'mis' | 'sales' | 'cost' | 'margin' | 'proj' | 'budget' | 'ai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mis', label: 'MIS' }, { id: 'sales', label: 'Sales view' }, { id: 'cost', label: 'Cost breakup' }, { id: 'margin', label: 'Margin' },
  { id: 'proj', label: 'Projection' }, { id: 'budget', label: 'Budget & rates' }, { id: 'ai', label: 'AI insights' },
];
const today = () => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const lakh = (v: Decimal, dp = 1) => toLakh(v).toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const pct = (v: Decimal | null) => (v === null ? '-' : `${v.toFixed(1)} %`);
const BAND: Record<Band, string> = { good: 'text-good', amber: 'text-warn', red: 'text-bad', none: 'text-muted' };

export default function DashScreen() {
  const [tab, setTab] = useState<Tab>('mis');
  const [plants, setPlants] = useState('');
  const [asOf, setAsOf] = useState(today());
  const [rows, setRows] = useState<MisRow[] | null>(null);
  const [ran, setRan] = useState<{ plants: string; asOf: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { setPlants(ls.get<string>('bce:dash-plants', '')); return () => ctl.current?.abort(); }, []);

  async function run() {
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setBusy(true); setError('');
    try {
      const list = plants.split(/[\s,;]+/).filter(Boolean);
      const r = await fetchMis(list, asOf, c.signal);
      setRows(r.rows); setRan({ plants: list.join(', ').toUpperCase(), asOf });
      ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }

  const brands = useMemo(() => (rows ? brandViews(rows) : []), [rows]);
  const tot = useMemo(() => totals(brands), [brands]);
  const notes = useMemo(() => insights(brands), [brands]);
  const fy = brands.find((b) => b.gjahr)?.gjahr ?? '';
  const version = brands.reduce((v, b) => (b.version > v ? b.version : v), '');

  return (
    <PlanFrame active="dash">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
        <h2 className="text-lg font-extrabold">Costing dashboard</h2>
        <Tabs label="Costing dashboard" tabs={TABS} value={tab} onChange={setTab} />

        {tab === 'mis' && (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">Plants
                <input className={cx(inputCls, 'w-56 uppercase')} placeholder="UN13, UN08" value={plants} onChange={(e) => setPlants(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">As of
                <input type="date" className={cx(inputCls, 'w-40')} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </label>
              <Button variant="primary" disabled={busy || !plants.trim() || !asOf} onClick={() => void run()}>{busy ? <><Spinner className="h-4 w-4" /> Running</> : 'Run'}</Button>
              {busy && <Button onClick={() => { ctl.current?.abort(); setBusy(false); }}>Stop</Button>}
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
            {!rows && !busy && !error && <Card><Empty title="Choose the plants and press Run">Month to date and year to date COGM of the finished goods produced in those plants, against the approved budget.</Empty></Card>}
            {rows && !brands.length && <Card><Empty title="No production found">SAP returned no finished-good production for these plants up to {ran?.asOf}.</Empty></Card>}
            {rows && brands.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="YTM budget COGM" value={`₹${lakh(tot.ytm.budget, 0)} L`} sub="Approved budget cost per piece x actual quantity" title="Sum over the finished goods that have an approved budget in the financial year" />
                  <Stat label="YTM actual COGM" value={`₹${lakh(tot.ytm.actualCmp, 0)} L`} sub="Same finished goods as the budget" title={`All finished goods: ₹${lakh(tot.ytm.actual, 0)} L`} />
                  <Stat label="Variance" value={`₹${lakh(tot.ytm.variance, 0)} L (${pct(tot.ytm.variancePct)})`} tone={tot.ytm.variance.gt(0) ? 'bad' : 'good'} sub="Actual minus budget" />
                  <Stat label="Actual COGM, all finished goods" value={`₹${lakh(tot.ytm.actual, 0)} L`} sub={`Month to date ₹${lakh(tot.ftm.actual, 0)} L`} title="Including finished goods without a budget" />
                </div>
                <p className="text-xs text-muted">
                  Plants {ran?.plants} · as of {ran?.asOf} · month to date and financial year to date{fy ? ` (FY ${fy}` : ''}{fy && version ? `, latest approved budget version ${version}` : ''}{fy ? ')' : ''}. Actual = RM + PM + perfume + conversion of the period (SAP, INR).
                  Budget = approved budget cost per piece (COST_PC) x actual quantity. Amounts in ₹ lakh.
                </p>
                <MisTable brands={brands} tot={tot} />
              </>
            )}
            <NeedsSap title="Variance bridge (rate, usage, mix, overheads, currency)" object="ZCL_MM_COGM_BRIDGE" why="Nothing in SAP splits the COGM variance into these five effects yet. The bridge appears here when that class exists." />
          </>
        )}

        {tab === 'sales' && (
          <NeedsSap title="Sales view: GSV to NSV to COGM to gross margin, price-volume-mix-cost bridge, SKU x channel" object="ZI_SALES_MARGIN, ZCL_SALES_PVM_BRIDGE (and a sales budget source ZSALES_BUD_TGT, to confirm)"
            why="Nothing built reads the billing side (VBRK / VBRP / KONV). The bridge also needs a budgeted price, quantity and mix per SKU."
            links={[{ href: '/sales-price/', label: 'Sales price (MRP and selling price)' }, { href: '/cost-report/', label: 'Cost and margin report' }]} />
        )}
        {tab === 'cost' && (
          <NeedsSap title="Cost breakup by component group and scheme" object="ZI_ACT_PROC_COST_ITEM extended with a SCHEME dimension"
            why="The RM / PM / Perfume / overhead split per SKU exists in the actual-cost screens; the scheme dimension does not exist in SAP yet."
            links={[{ href: '/cost-report/', label: 'Cost and margin report (RM, PM, Perfume, overheads per piece)' }, { href: '/plant-summary/', label: 'Plant production summary' }]} />
        )}
        {tab === 'margin' && (
          <NeedsSap title="Margin board: COGM as % of MRP, budget vs actual" object="ZMIS_ALERT_THRESH (category-specific bands)"
            why="Cost against MRP and selling price, with alert rules E1-E9, already exists as the Margin module. Category-specific Green / Amber / Red bands need the new threshold table."
            links={[{ href: '/margin/', label: 'Margin board' }, { href: '/margin/alerts/', label: 'Margin alerts' }, { href: '/margin/portfolio/', label: 'Portfolio' }]} />
        )}
        {tab === 'proj' && (
          <NeedsSap title="3-month projection on three rate bases (CPD rate, latest actual, open PO)" object="ZCL_COGM_PROJECTION" why="The forward-looking COGM and margin engine does not exist in SAP yet." links={[{ href: '/plan/', label: 'Production plans (breakup and cost)' }]} />
        )}
        {tab === 'budget' && (
          <Card className="p-4 text-sm">
            <h3 className="mb-1 text-base font-extrabold">Budget and rates</h3>
            <p className="text-muted">Budget versions, approval and the rate preparation screens already exist; open them here.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/budget-cost/">Budget cost of finished goods</Link><Link href="/budget-rates/">Component rates</Link><Link href="/budget-rate-management/">Raw material budget rates</Link><Link href="/pkg/">Packing budget rate</Link>
            </div>
            {fy && <p className="mt-3 text-xs text-muted">The MIS tab used the latest approved version{version ? ` (${version})` : ''} of financial year {fy}.</p>}
          </Card>
        )}
        {tab === 'ai' && (
          <Card className="p-4">
            <h3 className="mb-1 text-base font-extrabold">Notes from the numbers</h3>
            <p className="mb-3 text-xs text-muted">Rule-based: each note only states what the MIS figures show (brand red above 3 % over budget, amber above 2 %). No language model is used.</p>
            {!rows ? <p className="text-sm text-muted">Run the MIS tab first; the notes are made from its result.</p>
              : !notes.length ? <p className="text-sm text-muted">Nothing to flag: no brand is above the amber threshold and every finished good has a budget.</p>
              : <ul className="flex flex-col gap-2">{notes.map((n, i) => (
                <li key={i} className="rounded-xl border border-line bg-panel px-3 py-2 text-sm">
                  <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wide text-accent"><span>{n.type}</span><span className="text-muted">{n.role}</span></div>
                  <div className="mt-1">{n.text}</div>
                </li>))}</ul>}
          </Card>
        )}
      </div>
    </PlanFrame>
  );
}

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={`${BASE_PATH}${href}`} className="inline-flex rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-accent hover:bg-sunken">{children}</a>;
}

function NeedsSap({ title, object, why, links }: { title: string; object: string; why: string; links?: { href: string; label: string }[] }) {
  return (
    <Card className="p-4 text-sm">
      <h3 className="text-base font-extrabold">{title}</h3>
      <p className="mt-1 inline-flex rounded-full bg-warn/15 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-warn">Needs SAP: {object}</p>
      <p className="mt-2 text-muted">{why}</p>
      {links && <div className="mt-3 flex flex-wrap gap-2">{links.map((l) => <Link key={l.href} href={l.href}>{l.label}</Link>)}</div>}
    </Card>
  );
}

const th = 'whitespace-nowrap border-b border-line bg-sunken px-2.5 py-1.5 text-right text-2xs font-bold uppercase tracking-wide text-muted';
const td = 'whitespace-nowrap px-2.5 py-1.5 text-right text-xs tabular-nums';
function MisTable({ brands, tot }: { brands: BrandView[]; tot: { ftm: Window; ytm: Window } }) {
  const cell = (w: Window) => (<><td className={td}>{lakh(w.budget)}</td><td className={td}>{lakh(w.actualCmp)}</td></>);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr>
            <th className={cx(th, 'text-left')}>Brand</th><th className={th}>FG</th>
            <th className={th}>FTM budget (L)</th><th className={th}>FTM actual (L)</th>
            <th className={th}>YTM budget (L)</th><th className={th}>YTM actual (L)</th><th className={th}>Variance (L)</th><th className={th}>Variance %</th><th className={cx(th, 'text-left')}>Note</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <tr key={b.brand || '-'} className="border-t border-line/60">
              <td className="px-2.5 py-1.5 text-left text-xs font-bold">{b.brand || '(none)'}</td>
              <td className={td}>{b.fgCnt}</td>
              {cell(b.ftm)}{cell(b.ytm)}
              <td className={td}>{lakh(b.ytm.variance)}</td>
              <td className={cx(td, 'font-bold', BAND[b.band])}>{pct(b.ytm.variancePct)}</td>
              <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{b.msg}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-extrabold">
            <td className="px-2.5 py-1.5 text-left text-xs">All brands</td><td className={td}>{brands.reduce((s, b) => s + b.fgCnt, 0)}</td>
            {cell(tot.ftm)}{cell(tot.ytm)}
            <td className={td}>{lakh(tot.ytm.variance)}</td><td className={td}>{pct(tot.ytm.variancePct)}</td><td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
