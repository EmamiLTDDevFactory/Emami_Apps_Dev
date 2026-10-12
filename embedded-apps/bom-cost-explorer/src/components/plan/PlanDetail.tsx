'use client';
/**
 * /plan/view/?plan=<name> - one plan, with its own tab bar (not the costing tab bar):
 * Entries | Breakup & cost | Requirement | Checks | WIP | Scenarios. Phase 2 scaffold: empty tabs.
 * (A static export cannot have a dynamic /plan/[plan] route for plan names unknown at build time,
 * so the plan name is a query parameter.)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PlanFrame from './PlanFrame';
import { ls } from '@/lib/client/storage';
import { Card, Empty, Tabs } from '../ui';

export type PlanTab = 'entries' | 'breakup' | 'requirement' | 'checks' | 'wip' | 'scenarios';

export const PLAN_TABS: { id: PlanTab; label: string; what: string }[] = [
  { id: 'entries', label: 'Entries', what: 'Editable monthly quantities (April..March) per material, plant and country; save and delete per row.' },
  { id: 'breakup', label: 'Breakup & cost', what: 'CostLineSet Mode P: country > plant > plan material > components, monthly quantity and cost, BOM source, rate sources.' },
  { id: 'requirement', label: 'Requirement', what: 'PlanSummarySet: monthly requirement vs valuated stock, PO, delivered and open PO, shortages.' },
  { id: 'checks', label: 'Checks', what: 'PlanCheckSet: FG and item messages grouped by plant and material.' },
  { id: 'wip', label: 'WIP', what: 'PlanWipSet: WIP requirement per finished good; save as a WIP plan.' },
  { id: 'scenarios', label: 'Scenarios', what: 'SAP and client what-ifs on the plan, baseline vs scenario per month, header and component.' },
];

const TAB_KEY = 'plan:last-tab';

export default function PlanDetail() {
  const [plan, setPlan] = useState<string | null>(null);
  const [tab, setTab] = useState<PlanTab>('entries');
  useEffect(() => {
    setPlan((new URLSearchParams(window.location.search).get('plan') ?? '').trim());
    const t = ls.get<PlanTab>(TAB_KEY, 'entries');
    if (PLAN_TABS.some((x) => x.id === t)) setTab(t);
  }, []);
  const pick = (t: PlanTab) => {
    setTab(t);
    ls.set(TAB_KEY, t);
  };
  const current = PLAN_TABS.find((t) => t.id === tab)!;

  return (
    <PlanFrame active="plans">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/plan/" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><ArrowLeft size={13} /> Plans</Link>
        <h2 className="text-lg font-extrabold">{plan === null ? '' : plan || 'No plan chosen'}</h2>
      </div>
      {plan === '' ? (
        <Card><Empty title="No plan chosen">Open a plan from the Plans list.</Empty></Card>
      ) : plan ? (
        <>
          <Tabs label="Plan views" tabs={PLAN_TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={pick} />
          <Card>
            <Empty title={current.label} icon="▦">{current.what} Comes in a later phase.</Empty>
          </Card>
        </>
      ) : null}
    </PlanFrame>
  );
}
