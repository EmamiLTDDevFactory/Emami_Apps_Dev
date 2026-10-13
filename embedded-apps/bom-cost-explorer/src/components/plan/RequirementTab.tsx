'use client';
/** Requirement tab: PlanSummarySet - monthly component requirement vs valuated stock, PO, delivered and open
 * PO. Shortage = requirement - (stock + open PO). Units are SAP's base units and are not converted. */
import { useMemo, useState } from 'react';
import { ErrorNote, PlanQueryBar, tdCls, tdNum, thCls, thNum } from './common';
import { Card, Empty, Skeleton, Stat, cx, inputBase } from '../ui';
import { fetchPlanSummary } from '@/lib/plan/client';
import { shortage, summaryMonths } from '@/lib/plan/maths';
import { FISCAL_MONTHS } from '@/lib/plan/fields';
import type { PlanCostQuery } from '@/lib/plan/requests';
import type { PlanWorkspace } from '@/lib/plan/workspace';
import { ZERO } from '@/lib/cost/decimal';
import { fmtCompactInr, fmtMs, fmtNum } from '@/lib/format';

export default function RequirementTab({ ws }: { ws: PlanWorkspace }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyShort, setOnlyShort] = useState(false);
  const [search, setSearch] = useState('');
  const data = ws.loaded.summary;

  async function load(q: PlanCostQuery) {
    setLoading(true);
    setError('');
    try {
      ws.setLoaded({ summary: await fetchPlanSummary(q) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (data?.rows ?? [])
      .map((r) => ({ r, short: shortage(r) }))
      .filter(({ r, short }) => (!onlyShort || short.gt(0)) && (!t || `${r.Comp} ${r.CompTxt} ${r.Werks}`.toLowerCase().includes(t)))
      .sort((a, b) => b.short.cmp(a.short));
  }, [data, onlyShort, search]);
  const shortCount = useMemo(() => (data?.rows ?? []).filter((r) => shortage(r).gt(0)).length, [data]);
  const stockValue = useMemo(() => (data?.rows ?? []).reduce((a, r) => a.plus(r.Salk3 || '0'), ZERO), [data]);

  return (
    <div className="flex flex-col gap-3">
      <PlanQueryBar query={ws.query} onChange={ws.setQuery} onRun={(q) => void load(q)} running={loading} runLabel={data ? 'Reload requirement' : 'Load requirement'} />
      <ErrorNote error={error} />
      {!data && loading ? <Card><Skeleton rows={8} /></Card> : !data ? (
        <Card><Empty title="Requirement not loaded" icon="▦">Press <b>Load requirement</b>: SAP explodes the plan and compares each component&apos;s requirement with stock and purchase orders.</Empty></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Components" value={data.rows.length.toLocaleString('en-IN')} sub={`SAP answered in ${fmtMs(data.ms)}`} />
            <Stat label="With a shortage" value={shortCount} tone={shortCount ? 'bad' : 'good'} sub="requirement > stock + open PO" />
            <Stat label="Valuated stock value" value={fmtCompactInr(Number(stockValue.toFixed(2)))} sub={`${fmtNum(stockValue, 2)} INR`} />
          </div>
          <Card
            title="Requirement vs stock and PO"
            actions={
              <>
                <input aria-label="Filter components" className={cx(inputBase, 'h-8 w-52 text-xs')} placeholder="Filter component / plant…" value={search} onChange={(e) => setSearch(e.target.value)} />
                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyShort} onChange={(e) => setOnlyShort(e.target.checked)} /> Only shortages</label>
              </>
            }
            bodyClass="p-0"
          >
            <p className="border-b border-line px-3 py-1.5 text-2xs text-muted">Quantities in each component&apos;s SAP base unit (Unit column); units are not converted. Shortage = Requirement − (Valuated stock + Open PO).</p>
            {!rows.length ? <Empty title={onlyShort ? 'No shortages' : 'No rows'} /> : (
              <div className="scroll-thin max-h-[65vh] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-panel">
                    <tr>
                      <th className={thCls}>Plant</th><th className={thCls}>Component</th><th className={thCls}>Type</th><th className={thCls}>Unit</th>
                      {FISCAL_MONTHS.map((m) => <th key={m} className={thNum}>{m}</th>)}
                      <th className={thNum}>Requirement</th><th className={thNum}>Stock</th><th className={thNum}>PO</th><th className={thNum}>Delivered</th><th className={thNum}>Open PO</th><th className={thNum}>Shortage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3000).map(({ r, short }) => (
                      <tr key={`${r.Werks}|${r.Comp}`} className={cx('border-t border-line/50', short.gt(0) && 'bg-bad/[0.04]')}>
                        <td className={cx(tdCls, 'font-mono')}>{r.Werks}</td>
                        <td className={tdCls}><span className="font-mono font-semibold">{r.Comp}</span> <span className="text-muted">{r.CompTxt}</span></td>
                        <td className={tdCls}>{r.Mtart}</td>
                        <td className={tdCls}>{r.Meins}</td>
                        {summaryMonths(r).map((q, i) => <td key={i} className={tdNum}>{fmtNum(q, 0, 'X')}</td>)}
                        <td className={cx(tdNum, 'font-semibold')}>{fmtNum(r.BudQty, 3, 'X')}</td>
                        <td className={tdNum}>{fmtNum(r.Lbkum, 3, 'X')}</td>
                        <td className={tdNum}>{fmtNum(r.PoQty, 3, 'X')}</td>
                        <td className={tdNum}>{fmtNum(r.DelQty, 3, 'X')}</td>
                        <td className={tdNum}>{fmtNum(r.RemQty, 3, 'X')}</td>
                        <td className={cx(tdNum, 'font-bold', short.gt(0) ? 'text-bad' : 'text-good')}>{short.gt(0) ? fmtNum(short, 3, 'X') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
