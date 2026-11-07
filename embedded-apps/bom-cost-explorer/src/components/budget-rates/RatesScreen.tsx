'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Calculator, Upload } from 'lucide-react';
import { Card, Empty, Spinner, Stat, cx } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import { BUDGET_ENABLED } from '@/lib/budget/flag';
import { BASE_PATH, useHubSession } from '@/lib/client/session';
import { canDisplayBudget, useBudgetRole } from '@/lib/budget/roles';
import RatesFilters from './RatesFilters';
import RatesTable from './RatesTable';
import RatesUpload from './RatesUpload';
import { fetchBudget, recalcBudget } from '@/lib/budgetRatesApi';
import { fmtNum } from '@/lib/format';
import type { BudCompDom, BudCompIntl, BudgetSearchParams } from '@/lib/budgetRatesTypes';

type Tab = 'analysis' | 'upload';
const readTab = (): Tab => (new URLSearchParams(window.location.search).get('tab') === 'upload' ? 'upload' : 'analysis');

export default function RatesScreen() {
  // The existing Budget costing module (run, hierarchy, checklist, approvals) keeps its own role gate (Manage Access: Admin / budget-init / budget-approve).
  const hub = useHubSession();
  const budgetRole = useBudgetRole(hub && hub !== 'checking' ? hub.email : '');
  const showCosting = BUDGET_ENABLED && budgetRole !== 'checking' && canDisplayBudget(budgetRole);
  const [tab, setTabState] = useState<Tab>('analysis');
  const [last, setLast] = useState<BudgetSearchParams | null>(null);
  const [rows, setRows] = useState<(BudCompDom | BudCompIntl)[]>([]);
  const [loading, setLoading] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [searched, setSearched] = useState(false);

  // Tab in the URL (?tab=), so the browser Back button moves between the tiles.
  useEffect(() => {
    setTabState(readTab());
    const on = () => setTabState(readTab());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const setTab = (t: Tab) => { history.pushState(null, '', `?tab=${t}`); setTabState(t); };

  const run = useCallback(async (p: BudgetSearchParams) => {
    setLast(p); setLoading(true); setError(''); setSearched(true);
    try { setRows((await fetchBudget(p)).rows); } catch (e) { setRows([]); setError((e as Error).message); }
    setLoading(false);
  }, []);

  async function recalc() {
    if (!last || !window.confirm(`Recalculate the ${rows.length} SAP rows of this selection?`)) return;
    setRecalcBusy(true); setError(''); setNote('');
    try {
      const r = await recalcBudget(last);
      setNote(`Recalculated: ${r.RowsSaved} saved, ${r.RowsFailed} failed. ${r.Message}`.trim());
      await run(last);
    } catch (e) { setError((e as Error).message); }
    setRecalcBusy(false);
  }

  const kpi = useMemo(() => {
    const landed = rows.map((r) => r.Landed).filter((v) => v > 0);
    return { plants: new Set(rows.map((r) => r.Werks)).size, mats: new Set(rows.map((r) => r.Matnr)).size, avg: landed.length ? landed.reduce((a, b) => a + b, 0) / landed.length : 0 };
  }, [rows]);

  const tile = (t: Tab, icon: React.ReactNode, title: string, hint: string) => (
    <button type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
      className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-card transition', tab === t ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:bg-sunken')}>
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-white">{icon}</span>
      <span><span className="block text-sm font-bold">{title}</span><span className="block text-2xs text-muted">{hint}</span></span>
    </button>
  );

  return (
    <PlanFrame active="budget-rates">
      <div className={cx('grid gap-3', showCosting ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
        {showCosting && (
          <a href={`${BASE_PATH}/budget-cost/`} className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-left shadow-card transition hover:bg-sunken">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-white"><Calculator size={18} /></span>
            <span><span className="block text-sm font-bold">Budget costing</span><span className="block text-2xs text-muted">Run, hierarchy, checklist, approvals</span></span>
          </a>
        )}
        {tile('analysis', <BarChart3 size={18} />, 'Analysis', 'Read component rates from SAP')}
        {tile('upload', <Upload size={18} />, 'Upload', 'Write Excel rates to SAP')}
      </div>

      {tab === 'analysis' && (
        <>
          <RatesFilters onSearch={(p) => void run(p)} busy={loading} initial={last ?? undefined} />
          {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
          {note && <div className="rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{note}</div>}
          {loading && <div className="flex justify-center py-8"><Spinner className="h-7 w-7 text-accent" /></div>}
          {!loading && rows.length > 0 && last && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Rows" value={rows.length} />
                <Stat label="Plants · materials" value={`${kpi.plants} · ${kpi.mats}`} />
                <Stat label="Average landed" value={kpi.avg ? fmtNum(kpi.avg, 2) : '—'} />
              </div>
              <RatesTable rows={rows} tableType={last.tableType} gjahr={last.gjahr} onRecalc={() => void recalc()} recalcBusy={recalcBusy} />
            </>
          )}
          {!loading && !rows.length && searched && !error && <Card><Empty title="No rates found">Nothing in SAP for this fiscal year, plants and materials.</Empty></Card>}
        </>
      )}

      {tab === 'upload' && <RatesUpload tableType={last?.tableType ?? 'DOM'} gjahr={last?.gjahr ?? String(new Date().getMonth() + 1 >= 4 ? new Date().getFullYear() : new Date().getFullYear() - 1)} defaultWerks={last?.werks ?? []} />}
    </PlanFrame>
  );
}
