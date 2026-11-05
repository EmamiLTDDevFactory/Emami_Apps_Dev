import { BASE_PATH } from '@/lib/client/session';

/** Shown on the budget routes when the module is switched off (no requests, no budget code loaded). Kept tiny on purpose: it is part of the always-loaded route. */
export function BudgetDisabled() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <h1 className="text-lg font-extrabold">Budget costing is not enabled</h1>
        <p className="mt-1 text-sm text-muted">This build was made without BUDGET_ENABLED.</p>
        <a href={`${BASE_PATH}/`} className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Back to BOM costing</a>
      </div>
    </div>
  );
}
