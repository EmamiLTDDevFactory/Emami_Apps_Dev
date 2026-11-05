import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORIGINS, BUDGET_SUMMARY, BUDGET_PENDING } from '@/lib/budget/fields';
import { SUMMARY_COLS } from '@/lib/budget/view';
import { canApproveBudget, canDisplayBudget, canInitiateBudget } from '@/lib/budget/roles';

describe('budget module switches and contract', () => {
  it('the flag is off unless the build sets it', async () => {
    delete process.env.NEXT_PUBLIC_BUDGET_ENABLED;
    const { BUDGET_ENABLED } = await import('@/lib/budget/flag');
    expect(BUDGET_ENABLED).toBe(false);
  });
  it('the Budget route imports its page only behind the literal flag check (so the build drops it); the old approvals route is a plain redirect with no budget code', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/budget-cost/page.tsx'), 'utf8');
    expect(page).toContain("process.env.NEXT_PUBLIC_BUDGET_ENABLED === 'true' ? dynamic(() => import('@/components/budget/BudgetHub')");
    const old = readFileSync(join(process.cwd(), 'src/app/budget-cost/approvals/page.tsx'), 'utf8');
    expect(old).not.toMatch(/components\/budget|BudgetSumSet|startPending/);
  });
  it('the deployed build has the module switched on', () => {
    const cfg = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');
    expect(cfg).toContain("const DEPLOYED_BUDGET_ENABLED = 'true'");
  });
  it('every column of the table is a property of the contract (a typo would show an empty column)', () => {
    for (const c of SUMMARY_COLS) expect(Object.keys(BUDGET_SUMMARY), c.key).toContain(c.key);
  });
  it('17 origin groups x budget / actual / last, in the summary and in the saved lines', () => {
    expect(ORIGINS.length).toBe(17);
    for (const [, , n] of ORIGINS) for (const k of [n, `A${n}`, `L${n}`]) { expect(BUDGET_SUMMARY).toHaveProperty(k); expect(BUDGET_PENDING).toHaveProperty(k); }
  });
  it('roles: Admin does everything; initiator and approver stay apart; nobody else sees it (fails closed)', () => {
    expect([canDisplayBudget('Admin'), canInitiateBudget('Admin'), canApproveBudget('Admin')]).toEqual([true, true, true]);
    expect([canDisplayBudget('budget-init'), canInitiateBudget('budget-init'), canApproveBudget('budget-init')]).toEqual([true, true, false]);
    expect([canDisplayBudget('budget-approve'), canInitiateBudget('budget-approve'), canApproveBudget('budget-approve')]).toEqual([true, false, true]);
    expect([canDisplayBudget(''), canDisplayBudget('User'), canDisplayBudget('Planner')]).toEqual([false, false, false]);
  });
});
