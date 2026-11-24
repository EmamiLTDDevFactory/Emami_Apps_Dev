'use client';
/**
 * "Brand · Product · SKU" tab: the budget of the LAST run rolled up by the product hierarchy (simple average of the latest FG of each CRS SKU / plant /
 * type / scheme / year), with an optional comparison against last year's quantity-weighted actual average (WacRowSet = ZMM_PCOST aggregated).
 * Nothing loads by itself except the hierarchy names and FG links; last year loads when the person presses the button.
 */
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, History } from 'lucide-react';
import { Button, Card, Empty, Segmented, Skeleton, cx, inputCls } from '../ui';
import WacMessages from '../wac/WacMessages';
import { fmtNum } from '@/lib/format';
import type { BudgetQuery } from '@/lib/budget/filter';
import { runKey, useEntry } from '@/lib/budget/useBudget';
import { LEVEL_LABEL, lastYearAverages, loadHierNames, loadMaterialHier, previousFiscalYear, rollup, type HierGroup, type HierLevelKey, type HierNames, type LyAvg, type MatHier } from '@/lib/budget/hierarchy';
import { downloadBudget, paramsOf } from '@/lib/budget/export';
import { fetchWac } from '@/lib/wac/service';
import type { XCol } from '@/lib/client/export';
import type { BudgetSummaryRow } from '@/lib/budget/types';
import { type Decimal } from '@/lib/cost/decimal';
import { useMgmt } from '@/lib/client/useHierNames';

const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
const th = 'sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2 text-right text-2xs font-extrabold uppercase text-muted';
const td = 'num border-b border-line/60 px-2.5 py-1.5 text-right';
const v = (d: Decimal | null, dp = 4) => (d ? fmtNum(d, dp, 'X') : <span className="text-faint">—</span>);
const num = (d: Decimal | null, dp = 4) => (d ? Number(d.toFixed(dp)) : null);

export default function BudgetHierarchy({ runQ, email }: { runQ: BudgetQuery | null; email: string }) {
  const entry = useEntry<BudgetSummaryRow>(runQ ? safe(() => runKey(runQ, email)) : null);
  const rows = useMemo(() => (entry?.status === 'done' ? entry.data ?? [] : []), [entry]);
  const [level, setLevel] = useState<HierLevelKey>('brand');
  const [q, setQ] = useState('');
  const [names, setNames] = useState<HierNames | null>(null);
  const [links, setLinks] = useState<Map<string, MatHier> | null>(null);
  const [err, setErr] = useState('');
  const fy = previousFiscalYear(runQ?.budgetYr ?? '');
  const [from, setFrom] = useState(fy?.from ?? '');
  const [to, setTo] = useState(fy?.to ?? '');
  const [ly, setLy] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data?: Map<string, LyAvg>; error?: string }>({ status: 'idle' });
  useEffect(() => { const f = previousFiscalYear(runQ?.budgetYr ?? ''); setFrom(f?.from ?? ''); setTo(f?.to ?? ''); setLy({ status: 'idle' }); }, [runQ?.budgetYr, entry?.status]);

  // hierarchy names + the brand / product / SKU of each FG of the run
  useEffect(() => {
    if (!rows.length) { setLinks(null); return; }
    const c = new AbortController(); setErr(''); setLinks(null);
    Promise.all([loadHierNames({ signal: c.signal }), loadMaterialHier(rows.map((r) => r.Matnr), { signal: c.signal })])
      .then(([n, l]) => { if (!c.signal.aborted) { setNames(n); setLinks(l); } })
      .catch((e) => { if (!c.signal.aborted) setErr(e instanceof Error ? e.message : 'Could not read the product hierarchy from SAP.'); });
    return () => c.abort();
  }, [rows]);

  const loadLy = async () => {
    if (!runQ) return;
    setLy({ status: 'loading' });
    try {
      const all = [];
      for (const p of runQ.plants) all.push(...(await fetchWac('ROWS', { plants: [p], dateFrom: from, dateTo: to })).rows);
      setLy({ status: 'ready', data: lastYearAverages(all) });
    } catch (e) { setLy({ status: 'error', error: e instanceof Error ? e.message : 'Could not read last year from SAP.' }); }
  };

  const mgmt = useMgmt();
  const groups = useMemo(() => (names && links ? rollup(rows, links, names, level, ly.data, mgmt) : []), [rows, names, links, level, ly.data, mgmt]);
  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return t ? groups.filter((g) => `${g.name} ${g.code} ${g.brand} ${g.product}`.toLowerCase().includes(t)) : groups; }, [groups, q]);
  const withLy = ly.status === 'ready';

  if (!runQ) return <Card><Empty title="Run first">Run the budget on the "Run and summary" tab; this tab then rolls that result up by Brand, Product and SKU.</Empty></Card>;
  if (entry?.status === 'loading') return <Card><Skeleton rows={5} /></Card>;
  if (entry?.status !== 'done') return <Card><Empty title="No result yet">The last run has not finished or failed. See "Run and summary".</Empty></Card>;

  const exportXlsx = () => {
    const c: XCol[] = [
      { header: LEVEL_LABEL[level], width: 28, get: (i) => shown[i].name }, { header: 'Code', width: 16, get: (i) => shown[i].code }, { header: 'Brand', width: 22, get: (i) => shown[i].brand }, { header: 'Product', width: 22, get: (i) => shown[i].product },
      { header: 'FGs', get: (i) => shown[i].fgs }, { header: 'Plan qty', dp: 0, get: (i) => num(shown[i].planQty, 0) }, { header: 'Plan cost INR', dp: 0, get: (i) => num(shown[i].planCost, 0) },
      { header: 'Avg budget / pc', dp: 4, get: (i) => num(shown[i].avgBudget) }, { header: 'Avg B-RM / pc', dp: 4, get: (i) => num(shown[i].avgRm) }, { header: 'Avg B-PM / pc', dp: 4, get: (i) => num(shown[i].avgPm) }, { header: 'Avg B-Perfume / pc', dp: 4, get: (i) => num(shown[i].avgPerfume) },
      { header: 'Avg projected / pc', dp: 4, get: (i) => num(shown[i].avgProjected) }, { header: 'Avg actual / pc', dp: 4, get: (i) => num(shown[i].avgActual) },
      ...(withLy ? [
        { header: 'Last yr RM / pc', dp: 4, get: (i: number) => num(shown[i].ly?.rm ?? null) }, { header: 'Last yr PM / pc', dp: 4, get: (i: number) => num(shown[i].ly?.pm ?? null) }, { header: 'Last yr perfume / pc', dp: 4, get: (i: number) => num(shown[i].ly?.perf ?? null) },
        { header: 'Last yr material / pc', dp: 4, get: (i: number) => num(shown[i].ly?.mat ?? null) }, { header: 'Last yr qty', dp: 0, get: (i: number) => num(shown[i].ly?.qty ?? null, 0) },
        { header: 'Budget (matched FGs) / pc', dp: 4, get: (i: number) => num(shown[i].ly?.budgetMat ?? null) }, { header: 'Variance / pc', dp: 4, get: (i: number) => num(shown[i].varAbs) }, { header: 'Variance %', dp: 2, get: (i: number) => num(shown[i].varPct, 2) },
      ] as XCol[] : []),
    ];
    void downloadBudget([{ name: LEVEL_LABEL[level], cols: c, count: shown.length }], paramsOf(runQ, [['Level', LEVEL_LABEL[level]], ['Average', 'simple average of the latest FG per CRS SKU + plant + material type + scheme + year'], ...(withLy ? [['Last year', `${from} to ${to}, weighted by produced quantity (WacRowSet)`] as [string, string]] : [])]), `budget-by-${level}`);
  };

  return (
    <Card title="Budget by Brand, Product and SKU" actions={<Button size="sm" onClick={exportXlsx} disabled={!shown.length}><FileSpreadsheet size={13} /> Excel</Button>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Segmented<HierLevelKey> size="sm" label="Level" value={level} onChange={setLevel} options={(Object.keys(LEVEL_LABEL) as HierLevelKey[]).map((k) => ({ value: k, label: LEVEL_LABEL[k] }))} />
        <input className={cx(inputCls, 'w-56')} placeholder="Search name or code" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flex-1" />
        <label className="text-2xs font-bold text-muted">Last year from <input type="date" className={cx(inputCls, 'ml-1 w-36')} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-2xs font-bold text-muted">to <input type="date" className={cx(inputCls, 'ml-1 w-36')} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button size="sm" variant="primary" disabled={ly.status === 'loading' || !from || !to} onClick={() => void loadLy()}><History size={13} /> {withLy ? 'Reload' : 'Compare with'} last year</Button>
      </div>
      <p className="mb-2 text-2xs text-muted">Averages are simple averages of the latest FG of each CRS SKU, plant, material type, scheme and year (in INR per pc); plan qty and plan cost are totals. Last year = produced-quantity weighted actual average per CRS SKU, plant and material type (the scheme is not in that data); the variance compares budget with last year on the FGs that were produced last year.</p>
      <WacMessages messages={[]} error={err || (ly.status === 'error' ? ly.error ?? null : null)} />
      {!links && !err && <Skeleton rows={5} />}
      {ly.status === 'loading' && <p className="mb-2 text-xs text-muted">Reading last year from SAP, plant by plant…</p>}
      {links && (!shown.length ? <Empty title="Nothing to show">No budget lines match.</Empty> : (
        <div className="scroll-thin max-h-[62vh] overflow-auto rounded-2xl border border-line">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead><tr>
              <th className={cx(th, '!text-left')}>{LEVEL_LABEL[level]}</th>
              {level !== 'brand' && <th className={cx(th, '!text-left')}>Brand</th>}{level === 'sku' && <th className={cx(th, '!text-left')}>Product</th>}
              {['FGs', 'Plan qty', 'Plan cost', 'Budget / pc', 'B-RM', 'B-PM', 'B-Perfume', 'Projected', 'Actual', ...(withLy ? ['LY RM', 'LY PM', 'LY perfume', 'LY material', 'Variance', 'Var %'] : [])].map((h) => <th key={h} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>{shown.map((g: HierGroup) => (
              <tr key={g.key} className="odd:bg-panel even:bg-sunken/40">
                <td className="border-b border-line/60 px-2.5 py-1.5 font-semibold" title={g.code}>{g.name}</td>
                {level !== 'brand' && <td className="border-b border-line/60 px-2.5 py-1.5">{g.brand}</td>}{level === 'sku' && <td className="border-b border-line/60 px-2.5 py-1.5">{g.product}</td>}
                <td className={td}>{g.fgs}</td><td className={td}>{fmtNum(g.planQty, 0, 'X')}</td><td className={td}>{fmtNum(g.planCost, 0, 'X')}</td>
                <td className={cx(td, 'font-semibold')}>{v(g.avgBudget)}</td><td className={td}>{v(g.avgRm)}</td><td className={td}>{v(g.avgPm)}</td><td className={td}>{v(g.avgPerfume)}</td><td className={td}>{v(g.avgProjected)}</td><td className={td} title={`${g.withActual} of ${g.fgs} FGs have an actual`}>{v(g.avgActual)}</td>
                {withLy && <>
                  <td className={td}>{v(g.ly?.rm ?? null)}</td><td className={td}>{v(g.ly?.pm ?? null)}</td><td className={td}>{v(g.ly?.perf ?? null)}</td><td className={td} title={g.ly ? `${g.ly.matched} FG(s) matched` : 'no production last year'}>{v(g.ly?.mat ?? null)}</td>
                  <td className={cx(td, g.varAbs && !g.varAbs.isZero() && (g.varAbs.gt(0) ? 'text-bad' : 'text-good'))}>{v(g.varAbs)}</td><td className={cx(td, g.varPct && !g.varPct.isZero() && (g.varPct.gt(0) ? 'text-bad' : 'text-good'))}>{g.varPct ? `${fmtNum(g.varPct, 2, 'X')} %` : <span className="text-faint">—</span>}</td>
                </>}
              </tr>))}</tbody>
          </table>
        </div>
      ))}
    </Card>
  );
}
