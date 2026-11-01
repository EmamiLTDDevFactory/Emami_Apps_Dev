'use client';
/** Frame of every Margin screen: hub session + SAP config (PlanFrame), the Margin role check (display: Admin / cogm / cogm-maint) and the page heading. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import type { PlantsState } from '../FilterPanel';
import { Spinner } from '../ui';
import { api } from '@/lib/client/api';
import { useHubSession } from '@/lib/client/session';
import { canDisplay, canMaintain, useMarginRole } from '@/lib/margin/roles';
import type { PlantRow } from '@/lib/sap/fields';
import type { PlanNav } from '../Shell';

/** Plants of the person (PlantVHSet, cached by the shared api for 10 minutes), loaded once the screen is allowed. */
export function usePlantsState(enabled: boolean): { state: PlantsState; plants: PlantRow[] } {
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = () => { setLoading(true); setError(''); api.plants().then((r) => setPlants(r.plants)).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { if (enabled) load(); }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const state = useMemo(() => ({ plants, loading, error, reload: load }), [plants, loading, error]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, plants };
}

export interface MarginCtx { email: string; role: string; maintain: boolean }

function Gate({ title, subtitle, need, children }: { title: string; subtitle: string; need: 'display' | 'maintain'; children: (c: MarginCtx) => ReactNode }) {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const role = useMarginRole(email);
  if (role === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  const ok = need === 'maintain' ? canMaintain(role) : canDisplay(role);
  if (!ok) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">{title} is not available to you</h1>
        <p className="mt-1 text-sm text-muted">{need === 'maintain' ? 'Uploading needs the Margin maintenance role (cogm-maint) or Admin.' : 'It needs the Margin display role (cogm), the maintenance role (cogm-maint) or Admin.'} Ask a BOM Simulator Admin (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }
  return (
    <>
      <div>
        <h1 className="text-lg font-extrabold">{title}</h1>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
      {children({ email, role, maintain: canMaintain(role) })}
    </>
  );
}

export default function MarginFrame({ active, title, subtitle, need = 'display', children }: { active: PlanNav; title: string; subtitle: string; need?: 'display' | 'maintain'; children: (c: MarginCtx) => ReactNode }) {
  return (
    <PlanFrame active={active}>
      <Gate title={title} subtitle={subtitle} need={need}>{children}</Gate>
    </PlanFrame>
  );
}
