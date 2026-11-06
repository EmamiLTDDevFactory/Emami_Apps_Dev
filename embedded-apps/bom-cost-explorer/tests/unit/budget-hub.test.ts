import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { budgetNavItems, budgetTabsFor, defaultBudgetTab } from '@/lib/budget/roles';
import { BUDGET_TABS, budgetApprovalsTarget, budgetHash, parseBudgetHash } from '@/lib/budget/tabs';
import { defaultBudgetQuery, selectionSummary, type BudgetQuery } from '@/lib/budget/filter';

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

describe('Budget tabs by role', () => {
  it('Admin sees all four, budget-init the first three, budget-approve Approvals only, anyone else nothing', () => {
    expect(budgetTabsFor('Admin')).toEqual(['run', 'hierarchy', 'checklist', 'approvals']);
    expect(budgetTabsFor('budget-init')).toEqual(['run', 'hierarchy', 'checklist']);
    expect(budgetTabsFor('budget-approve')).toEqual(['approvals']);
    for (const r of ['', 'User', 'Planner', 'admin', 'checking']) expect(budgetTabsFor(r)).toEqual([]);
  });
  it('the default tab is "Run and summary", except for an approver-only person (Approvals); none without a role', () => {
    expect(defaultBudgetTab('Admin')).toBe('run');
    expect(defaultBudgetTab('budget-init')).toBe('run');
    expect(defaultBudgetTab('budget-approve')).toBe('approvals');
    expect(defaultBudgetTab('User')).toBeNull();
  });
});

describe('location.hash deep links', () => {
  it('accepts #run, #checklist and #approvals only', () => {
    for (const t of BUDGET_TABS) expect(parseBudgetHash(budgetHash(t))).toBe(t);
    for (const bad of ['', '#', '#Run', '#run ', '#run/x', '#runs', 'run', '#approvals?x=1', '#__proto__', '#<script>', null, undefined]) expect(parseBudgetHash(bad as string), String(bad)).toBeNull();
  });
});

describe('the old approvals route', () => {
  it('forwards to /budget-cost/#approvals under the base path with location.replace', () => {
    expect(budgetApprovalsTarget('/apps/bom-cost-explorer')).toBe('/apps/bom-cost-explorer/budget-cost/#approvals');
    const page = src('src/app/budget-cost/approvals/page.tsx');
    expect(page).toContain('window.location.replace(budgetApprovalsTarget(BASE_PATH))');
  });
});

describe('side pane: exactly one Budget item', () => {
  it('one item (to /budget-cost/) for every role that sees a tab; none with the flag off or without a role', () => {
    for (const r of ['Admin', 'budget-init', 'budget-approve']) expect(budgetNavItems(true, r)).toEqual([{ label: 'Budget', path: '/budget-cost/' }]);
    for (const r of ['Admin', 'budget-init', 'budget-approve']) expect(budgetNavItems(false, r)).toEqual([]);
    for (const r of ['', 'User', 'Planner']) expect(budgetNavItems(true, r)).toEqual([]);
  });
  it('the Shell has no separate approvals item or PlanNav value any more', () => {
    const shell = src('src/components/Shell.tsx');
    expect(shell).not.toMatch(/budget-approvals|Budget approvals|budget-cost\/approvals/);
    expect(shell).toContain('budgetNavItems(BUDGET_ENABLED, budgetRole)');
  });
});

describe('the page keeps its tabs mounted and loads Approvals only on first open', () => {
  const hub = src('src/components/budget/BudgetHub.tsx');
  it('every tab is a hidden panel (not unmounted) and Approvals mounts only after it was opened', () => {
    expect(hub).toContain('hidden={tab !== id}');
    expect(hub).toContain("opened.has('approvals') && <BudgetApprovals");
    expect(hub).toContain("opened.has('checklist') && <BudgetChecklist");
  });
  it('the tab bodies have no frame of their own and no automatic load besides the hub', () => {
    for (const f of ['BudgetScreen', 'BudgetApprovals', 'BudgetChecklist']) expect(src(`src/components/budget/${f}.tsx`), f).not.toContain('PlanFrame');
    expect(src('src/components/budget/BudgetApprovals.tsx')).not.toContain('abortAll');
  });
});

describe('selection bar after a run', () => {
  const q = (p: Partial<BudgetQuery> = {}): BudgetQuery => ({ ...defaultBudgetQuery(new Date('2026-11-04')), budatFrom: '2026-04-01', budatTo: '2026-09-30', plants: ['1000', '1100'], ...p });
  it('period, plants, FG source, business line and the number of options', () => {
    expect(selectionSummary(q())).toEqual({ period: '2026-04-01 to 2026-09-30', plants: '1000, 1100', source: 'As per latest process order', business: 'CCD (01)', options: 2 });
    expect(selectionSummary(q({ exclDiv: true, source: 'G', inclDirect: true, overrides: [{ matnr: 'RM1', value: '1', pct: '' }] }))).toMatchObject({ business: 'All business lines', options: 5 });
    expect(selectionSummary(q({ budatTo: '' })).period).toBe('2026-04-01 to today');
  });
});
