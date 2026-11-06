/** Tabs of the one "Budget" page: ids, location.hash deep links and the old approvals route. Pure (no React), so the redirect page stays tiny. */
export type BudgetTab = 'run' | 'hierarchy' | 'checklist' | 'approvals';
export const BUDGET_TABS: readonly BudgetTab[] = ['run', 'hierarchy', 'checklist', 'approvals'];
export const BUDGET_TAB_LABEL: Record<BudgetTab, string> = { run: 'Run and summary', hierarchy: 'Brand · Product · SKU', checklist: 'BOM checklist', approvals: 'Approvals' };

/** '#run' | '#checklist' | '#approvals' (and nothing else, so a hash can never open anything unexpected); null otherwise. */
export function parseBudgetHash(hash: string | null | undefined): BudgetTab | null {
  const h = String(hash ?? '');
  const m = /^#(run|hierarchy|checklist|approvals)$/.exec(h);
  return m ? (m[1] as BudgetTab) : null;
}
export const budgetHash = (tab: BudgetTab): string => `#${tab}`;

/** Where the old /budget-cost/approvals/ page sends people. */
export const budgetApprovalsTarget = (basePath: string): string => `${basePath}/budget-cost/${budgetHash('approvals')}`;
