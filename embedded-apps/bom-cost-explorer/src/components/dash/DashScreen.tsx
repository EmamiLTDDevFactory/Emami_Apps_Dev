'use client';
/**
 * Costing dashboard. MIS is live (DashMisSet: SAP's actual cost of the period against the approved budget cost per piece x actual quantity, by brand,
 * month to date and year to date) with rule-based notes from those numbers. The tabs whose SAP objects do not exist yet say exactly which one they wait for.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Decimal from 'decimal.js';
import { Button, Card, Empty, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import { ErrorBox } from '../budget-mgmt/shared';
import { errorText } from '../budget-mgmt/shared';
import { fetchMis, fetchMisDetail } from '@/lib/dash/service';
import { MisFgTable } from './MisDetail';
import BridgeBlock from './BridgeBlock';
import { brandViews, insights, totals, type BrandView, type Window } from '@/lib/dash/logic';
import { BAND, Link, NeedsSap, lakh, pct, tdCls, thCls, today } from './parts';
import SalesView from './SalesView';
import MarginView from './MarginView';
import BreakupView from './BreakupView';
import type { MisFgRow, MisRow } from '@/lib/dash/types';
import { ls } from '@/lib/client/storage';
import { useHierNames } from '@/lib/client/useHierNames';

type Tab = 'mis' | 'sales' | 'cost' | 'margin' | 'budget' | 'ai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'mis', label: 'MIS' }, { id: 'sales', label: 'Sales view' }, { id: 'cost', label: 'Cost breakup' }, { id: 'margin', label: 'Margin' },
  { id: 'budget', label: 'Budget & rates' }, { id: 'ai', label: 'AI insights' },
];

export default function DashScreen() {
  const hn = useHierNames();
  const [tab, setTab] = useState<Tab>('mis');
  const [plants, setPlants] = useState('');
  const [asOf, setAsOf] = useState(today());
  const [rows, setRows] = useState<MisRow[] | null>(null);
  const [ran, setRan] = useState<{ plants: string; asOf: string } | null>(null);
  const [detail, setDetail] = useState<MisFgRow[] | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailErr, setDetailErr] = useState('');
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
      setRows(r.rows); setRan({ plants: list.join(', ').toUpperCase(), asOf }); setDetail(null); setDetailErr('');
      ls.set('bce:dash-plants', plants);
    } catch (e) { if (!c.signal.aborted) { setRows(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }

  // finished-good rows load on first use (one more SAP read of the same figures)
  async function loadDetail() {
    if (detail || detailBusy || !ran) return;
    setDetailBusy(true); setDetailErr('');
    try { const r = await fetchMisDetail(ran.plants.split(/[\s,;]+/).filter(Boolean), ran.asOf); setDetail(r.rows.filter((x) => x.Matnr)); }
    catch (e) { setDetailErr(errorText(e)); }
    setDetailBusy(false);
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
                {brands.every((b) => b.fgNoBudget >= b.fgCnt) && (
                  <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs">
                    <b>No budget comparison:</b> none of the {brands.reduce((n, b) => n + b.fgCnt, 0)} finished goods produced in these plants has an approved budget (status A) for financial year {fy || '(this year)'} in ZMM_FBUDCOST_SUM (same plant, CRSSKU, business, scheme and material type), so budget and variance show 0.
                    The actual COGM below is real (₹{lakh(tot.ytm.actual, 0)} L year to date). Approve the budget for this year, or tell us which table now holds it.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="YTM budget COGM" value={`₹${lakh(tot.ytm.budget, 0)} L`} sub="Approved budget cost per piece x actual quantity" title="Sum over the finished goods that have an approved budget in the financial year" />
                  <Stat label="YTM actual COGM" value={`₹${lakh(tot.ytm.actualCmp, 0)} L`} sub="Same finished goods as the budget" title={`All finished goods: ₹${lakh(tot.ytm.actual, 0)} L`} />
                  <Stat label="Variance" value={`₹${lakh(tot.ytm.variance, 0)} L (${pct(tot.ytm.variancePct)})`} tone={tot.ytm.variance.gt(0) ? 'bad' : 'good'} sub="Actual minus budget" />
                  <Stat label="Actual COGM, all finished goods" value={`₹${lakh(tot.ytm.actual, 0)} L`} sub={`Month to date ₹${lakh(tot.ftm.actual, 0)} L`} title="Including finished goods without a budget" />
                </div>
                <p className="text-xs text-muted">
                  Plants {ran?.plants} · as of {ran?.asOf} · month to date and financial year to date{fy ? ` (FY ${fy}` : ''}{fy && version ? `, latest approved budget version ${version}` : ''}{fy ? ')' : ''}. Actual = RM + PM + perfume + conversion of the period (SAP, INR).
                  Budget = approved budget cost per piece x actual quantity (ZMM_FBUDCOST_SUM, matched on plant, CRSSKU, business, scheme and material type, as in Margin). Amounts in ₹ lakh.
                </p>
                <MisTable brands={brands} tot={tot} bn={hn.brand} detail={detail} busy={detailBusy} err={detailErr} onNeed={loadDetail} />
              </>
            )}
            {rows && ran && <BridgeBlock plants={ran.plants} asOf={ran.asOf} bn={hn.brand} />}
          </>
        )}

        {tab === 'sales' && <SalesView />}
        {tab === 'cost' && <BreakupView />}
        {tab === 'margin' && (
          <>
            <MarginView />
            <Card className="p-4 text-sm">
              <h3 className="text-base font-extrabold">More margin reports</h3>
              <p className="mt-1 text-muted">This is already built as the Cost and margin report (cost per piece against the latest MRP and selling price, ratios, margin %, simulation at a rate type) and the Margin module (board, alerts E1-E9, portfolio, history). Open them from here; nothing is duplicated in the dashboard.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/cost-report/">Cost and margin report</Link><Link href="/margin/">Margin board</Link><Link href="/margin/alerts/">Margin alerts</Link><Link href="/margin/portfolio/">Portfolio</Link>
              </div>
            </Card>
            <Card className="p-4 text-sm">
              <h3 className="text-base font-extrabold">Alert bands by SKU category</h3>
              <p className="mt-1 text-muted">The Sales view colours each SKU's gross margin % with the bands in SAP table ZMIS_ALERT_THR (metric GM, one row per material group; a blank group is the default, now red below 18 %, amber below 22 %). Change the rows there; no release is needed.</p>
            </Card>
          </>
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

const th = thCls;
const td = tdCls;
function MisTable({ brands, tot, bn, detail, busy, err, onNeed }: { brands: BrandView[]; tot: { ftm: Window; ytm: Window }; bn: (c: string) => string; detail: MisFgRow[] | null; busy: boolean; err: string; onNeed: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [warn, setWarn] = useState(false);
  const toggle = (b: string) => { onNeed(); setOpen((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; }); };
  const noBud = detail?.filter((x) => x.FgNobud > 0) ?? [];
  const noBudCount = brands.reduce((s, b) => s + b.fgNoBudget, 0);
  const cell = (w: Window) => (<><td className={td}>{lakh(w.budget)}</td><td className={td}>{lakh(w.actualCmp)}</td></>);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">Click a brand to see its finished goods with the actual, the budget and the budget key SAP used.</span>
        {noBudCount > 0 && <button type="button" className="rounded-full border border-warn/40 bg-warn/10 px-3 py-1 font-semibold text-warn hover:bg-warn/20" onClick={() => { onNeed(); setWarn(!warn); }}>{warn ? 'Hide' : 'Show'} the {noBudCount} finished good{noBudCount === 1 ? '' : 's'} without approved budget</button>}
        {busy && <span className="text-muted">Loading finished goods…</span>}
        {err && <span className="text-bad">{err}</span>}
      </div>
      {warn && (
        <div className="rounded-2xl border border-warn/40 bg-warn/[0.05] p-3">
          <p className="mb-2 text-xs font-bold text-warn">Finished goods with actual cost but no approved budget (left out of the budget comparison). The last column says which budget key was looked for in ZMM_FBUDCOST_SUM.</p>
          {detail ? <MisFgTable rows={noBud} showBrand bn={bn} /> : <p className="text-xs text-muted">{busy ? 'Loading…' : 'Not loaded.'}</p>}
        </div>
      )}
    <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr>
            <th className={cx(th, '!text-left')}>Brand</th><th className={th}>FG</th>
            <th className={th}>FTM budget (L)</th><th className={th}>FTM actual (L)</th>
            <th className={th}>YTM budget (L)</th><th className={th}>YTM actual (L)</th><th className={th}>Variance (L)</th><th className={th}>Variance %</th><th className={cx(th, '!text-left')}>Note</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <Fragment key={b.brand || '-'}>
              <tr className="cursor-pointer border-t border-line/60 hover:bg-sunken" onClick={() => toggle(b.brand)} aria-expanded={open.has(b.brand)}>
                <td className="px-2.5 py-1.5 text-left text-xs font-bold"><span className="mr-1 inline-block w-3 text-faint">{open.has(b.brand) ? '▾' : '▸'}</span>{bn(b.brand) || '(none)'}</td>
                <td className={td}>{b.fgCnt}</td>
                {cell(b.ftm)}{cell(b.ytm)}
                <td className={td}>{lakh(b.ytm.variance)}</td>
                <td className={cx(td, 'font-bold', BAND[b.band])}>{pct(b.ytm.variancePct)}</td>
                <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{b.msg}</td>
              </tr>
              {open.has(b.brand) && (
                <tr><td colSpan={9} className="bg-sunken/40 p-2.5">
                  {detail ? <MisFgTable rows={detail.filter((x) => x.Zbrand === b.brand)} /> : <p className="text-xs text-muted">{busy ? 'Loading finished goods…' : err || 'Not loaded.'}</p>}
                </td></tr>
              )}
            </Fragment>
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
    </div>
  );
}
