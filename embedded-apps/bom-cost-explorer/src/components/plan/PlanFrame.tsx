'use client';
/**
 * Frame of every Production Plan page: hub session check, SAP connection config, and the shared Shell with
 * the "Production plan" nav section active. The costing nav items lead back to the costing page.
 */
import { useMemo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Shell, { type PlanNav } from '../Shell';
import { loadSapConfig } from '@/lib/sap/config';
import { BASE_PATH, useHubSession } from '@/lib/client/session';
import { leaveApp } from '@/lib/useScreenHistory';

export default function PlanFrame({ active, children, actions }: { active: PlanNav; children: ReactNode; actions?: ReactNode }) {
  const hub = useHubSession();
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  if (hub === 'checking' || !cfg) return <div className="grid h-screen place-items-center bg-bg"><div className="h-9 w-9 animate-spin rounded-full border-[3px] border-accent border-t-transparent" /></div>;
  if (!hub || !cfg.ok) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg p-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
          <AlertTriangle size={26} className="mx-auto text-warn" />
          <h1 className="mt-2 text-lg font-extrabold">{!cfg.ok ? "Costing Cockpit can't start" : 'Please open this app from Emami Apps'}</h1>
          <p className="mt-1 text-sm text-muted">{!cfg.ok ? cfg.error : 'Sign in to the Emami Apps hub first; your session comes from there.'}</p>
          <a href="/" className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Go to Emami Apps</a>
        </div>
      </div>
    );
  }
  return (
    <Shell
      env={{ system: cfg.config.system, appEnv: cfg.config.appEnv }}
      mode="B"
      onMode={() => { window.location.href = `${BASE_PATH}/`; }}
      email={hub.email}
      actions={actions}
      onBack={leaveApp}
      planActive={active}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:p-4 [&>*]:shrink-0">{children}</div>
    </Shell>
  );
}

/** Shown on the plan routes when the module is switched off (no requests, no plan code loaded). */
export function PlanDisabled() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div className="max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <h1 className="text-lg font-extrabold">Production Plan is not enabled</h1>
        <p className="mt-1 text-sm text-muted">This build was made without PLAN_MODULE_ENABLED.</p>
        <a href={`${BASE_PATH}/`} className="mt-5 inline-flex rounded-xl bg-gradient-to-br from-accent to-accent-deep px-5 py-2 text-sm font-bold text-white">Back to BOM costing</a>
      </div>
    </div>
  );
}
