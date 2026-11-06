'use client';
/**
 * The ONE "Budget" page: three tabs kept mounted, so a run and its results survive tab switches.
 *   Run and summary  form, KPIs, table, split drawer, Initiate   (Admin, budget-init)
 *   BOM checklist    the checklist of the last run's selection    (Admin, budget-init)
 *   Approvals        pending versions to approve                  (Admin, budget-approve; the default tab of an approver-only person)
 * The tab is in location.hash (#run, #checklist, #approvals); a selected tab updates it, and it is read on load and on hashchange.
 * Approvals (and the checklist) mount, and so load, only on first open - never on page load. Leaving the page aborts what is running.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { Card, Empty, Spinner, Tabs } from '../ui';
import BudgetScreen from './BudgetScreen';
import BudgetChecklist from './BudgetChecklist';
import BudgetHierarchy from './BudgetHierarchy';
import BudgetApprovals from './BudgetApprovals';
import { useHubSession } from '@/lib/client/session';
import { abortAll } from '@/lib/wac/cache';
import type { BudgetQuery } from '@/lib/budget/filter';
import { budgetTabsFor, defaultBudgetTab, useBudgetRole } from '@/lib/budget/roles';
import { BUDGET_TAB_LABEL, budgetHash, parseBudgetHash, type BudgetTab } from '@/lib/budget/tabs';

function Hub() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const role = useBudgetRole(email);
  const tabs = useMemo(() => (role === 'checking' ? [] : budgetTabsFor(role)), [role]);
  const [tab, setTab] = useState<BudgetTab | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<BudgetTab>>(new Set());
  const [runQ, setRunQ] = useState<BudgetQuery | null>(null);
  useEffect(() => () => abortAll(), []); // leaving the page ends every running request

  // The tab from the hash (only one the role may see), else the role's default; again whenever the hash changes.
  useEffect(() => {
    if (!tabs.length) return;
    const fromHash = () => { const h = parseBudgetHash(window.location.hash); setTab(h && tabs.includes(h) ? h : defaultBudgetTab(role as string)); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [tabs, role]);
  useEffect(() => { if (tab) setOpened((s) => (s.has(tab) ? s : new Set(s).add(tab))); }, [tab]);

  const select = useCallback((t: BudgetTab) => { setTab(t); if (window.location.hash !== budgetHash(t)) window.location.hash = budgetHash(t); }, []);
  const openApprovals = useCallback(() => select('approvals'), [select]);

  if (hub === 'checking' || role === 'checking') return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!tabs.length || !tab) return <Card><Empty title="Budget is not open to you" icon={<Lock size={28} />}>Ask an admin to give you the budget-init or budget-approve role for Costing Cockpit in Manage Access.</Empty></Card>;
  const panel = (id: BudgetTab, node: React.ReactNode) => tabs.includes(id) && (
    <div role="tabpanel" id={`budget-panel-${id}`} aria-label={BUDGET_TAB_LABEL[id]} hidden={tab !== id} className="flex flex-col gap-3">{node}</div>
  );
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-extrabold">Budget</h1>
        <Tabs<BudgetTab> label="Budget" value={tab} onChange={select} tabs={tabs.map((id) => ({ id, label: BUDGET_TAB_LABEL[id] }))} />
      </div>
      {panel('run', <BudgetScreen email={email} role={role} onRun={setRunQ} onOpenApprovals={tabs.includes('approvals') ? openApprovals : undefined} />)}
      {panel('hierarchy', opened.has('hierarchy') && <BudgetHierarchy runQ={runQ} email={email} />)}
      {panel('checklist', opened.has('checklist') && <BudgetChecklist runQ={runQ} email={email} />)}
      {panel('approvals', opened.has('approvals') && <BudgetApprovals email={email} role={role} />)}
    </>
  );
}

export default function BudgetHub() {
  return <PlanFrame active="budget"><Hub /></PlanFrame>;
}
