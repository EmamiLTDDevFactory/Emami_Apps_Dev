'use client';
/**
 * /plan/view/?plan=<name> - one plan, with its own tab bar (not the costing tab bar):
 * Entries | Breakup & cost | Requirement | Checks | WIP | Scenarios. The tabs share one workspace (the Mode P
 * run, the filters, what each tab loaded) so switching tabs never re-runs SAP.
 * (A static export cannot have a dynamic /plan/[plan] route for plan names unknown at build time,
 * so the plan name is a query parameter.)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet } from 'lucide-react';
import PlanFrame from './PlanFrame';
import EntriesTab from './EntriesTab';
import BreakupTab from './BreakupTab';
import CostBreakupTab from './CostBreakupTab';
import RequirementTab from './RequirementTab';
import ChecksTab from './ChecksTab';
import WipTab from './WipTab';
import ScenariosTab from './ScenariosTab';
import { ls } from '@/lib/client/storage';
import { readHubSession } from '@/lib/client/session';
import { readPlanUrl } from '@/lib/plan/plants';
import { usePlanWorkspace } from '@/lib/plan/workspace';
import { exportPlanWorkbook } from '@/lib/plan/export';
import { Button, Card, Empty, Pill, Spinner, Tabs } from '../ui';
import { PlantChips, SelectPlants } from './common';

export type PlanTab = 'entries' | 'breakup' | 'costbreakup' | 'requirement' | 'checks' | 'wip' | 'scenarios';

export const PLAN_TABS: { id: PlanTab; label: string; what: string }[] = [
  { id: 'entries', label: 'Entries', what: 'Editable monthly quantities (April..March) per material, plant and country; save and delete per row.' },
  { id: 'breakup', label: 'Breakup & cost', what: 'CostLineSet Mode P: country > plant > plan material > components, monthly quantity and cost, BOM source, rate sources.' },
  { id: 'costbreakup', label: 'Cost breakup', what: 'Each plan material in Raw Material, Perfume, Pack Material, Labour, Power, Machine, Steam and Conversion Charge (quantity and cost), with the process-order actual; click an element for its detail.' },
  { id: 'requirement', label: 'Requirement', what: 'PlanSummarySet: monthly requirement vs valuated stock, PO, delivered and open PO, shortages.' },
  { id: 'checks', label: 'Checks', what: 'PlanCheckSet: FG and item messages grouped by plant and material.' },
  { id: 'wip', label: 'WIP', what: 'PlanWipSet: WIP requirement per finished good; save as a WIP plan.' },
  { id: 'scenarios', label: 'Scenarios', what: 'SAP and client what-ifs on the plan, baseline vs scenario per month, header and component.' },
];

const TAB_KEY = 'plan:last-tab';

export default function PlanDetail() {
  const [plan, setPlan] = useState<string | null>(null);
  const [werks, setWerks] = useState<string[]>([]);
  const [tab, setTab] = useState<PlanTab>('entries');
  const [email, setEmail] = useState('');
  useEffect(() => {
    const u = readPlanUrl(window.location.search);
    setWerks(u.werks);
    setPlan(u.plan);
    setEmail(readHubSession()?.email ?? '');
    const t = ls.get<PlanTab>(TAB_KEY, 'entries');
    if (PLAN_TABS.some((x) => x.id === t)) setTab(t);
  }, []);
  const pick = (t: PlanTab) => {
    setTab(t);
    ls.set(TAB_KEY, t);
  };

  return (
    <PlanFrame active="plans">
      {plan === '' ? (
        <>
          <Link href="/plan/" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><ArrowLeft size={13} /> Plans</Link>
          <Card><Empty title="No plan chosen">Open a plan from the Plans list.</Empty></Card>
        </>
      ) : plan ? (
        <PlanView key={plan} plan={plan} werks={werks} email={email} tab={tab} onTab={pick} />
      ) : null}
    </PlanFrame>
  );
}

function PlanView({ plan, werks, email, tab, onTab }: { plan: string; werks: string[]; email: string; tab: PlanTab; onTab: (t: PlanTab) => void }) {
  const ws = usePlanWorkspace(plan, email, werks);
  const [exporting, setExporting] = useState(false);
  const doExport = async () => {
    setExporting(true);
    try {
      await exportPlanWorkbook({ plants: ws.plants, query: ws.cost.ranQuery ?? ws.query, cost: ws.cost.status === 'done' || ws.cost.rows.length ? ws.cost.rows : null, summary: ws.loaded.summary?.rows ?? null, checks: ws.loaded.checks?.rows ?? null, wip: ws.loaded.wip?.rows ?? null, messages: ws.cost.messages });
    } finally {
      setExporting(false);
    }
  };
  const running = ws.cost.status === 'running';
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/plan/" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"><ArrowLeft size={13} /> Plans</Link>
        <h2 className="text-lg font-extrabold">{plan}</h2>
        {ws.role && <Pill tone={ws.canWrite ? 'accent' : 'neutral'} title="Your Manage Access role for Costing Cockpit">{ws.role}</Pill>}
        {running && <span className="inline-flex items-center gap-1.5 text-xs text-muted"><Spinner className="h-3.5 w-3.5" /> SAP is costing the plan…</span>}
        <Button size="sm" className="ml-auto" disabled={exporting} onClick={() => void doExport()} title="Excel: Breakup, Requirement, Checks, WIP and Parameters (what you have loaded)">
          {exporting ? <Spinner className="h-3.5 w-3.5" /> : <FileSpreadsheet size={14} />} Excel
        </Button>
      </div>
      <PlantChips ws={ws} />
      <Tabs label="Plan views" tabs={PLAN_TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={onTab} />
      {tab === 'entries' && <EntriesTab ws={ws} />}
      {/* Heavy tabs: no SAP call until a plant is chosen when the plan has several plants. */}
      {tab !== 'entries' && ws.needsPlant ? <SelectPlants ws={ws} /> : (
        <>
          {tab === 'breakup' && <BreakupTab ws={ws} />}
          {tab === 'costbreakup' && <CostBreakupTab ws={ws} />}
          {tab === 'requirement' && <RequirementTab ws={ws} />}
          {tab === 'checks' && <ChecksTab ws={ws} />}
          {tab === 'wip' && <WipTab ws={ws} />}
          {tab === 'scenarios' && <ScenariosTab ws={ws} />}
        </>
      )}
    </>
  );
}
