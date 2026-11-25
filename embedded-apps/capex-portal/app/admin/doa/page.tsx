'use client';
import { useMemo } from 'react';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { adminWritesEnabled, ADMIN_WRITES_OFF_NOTE } from '@/lib/admin';
import { useSession } from '@/lib/session';
import { useList } from '@/lib/useData';
import type { ValueHelp } from '@/lib/entities';
import DoaMatrixCard from '@/components/admin/DoaMatrixCard';
import SimulatorCard from '@/components/admin/SimulatorCard';
import UsersCard from '@/components/admin/UsersCard';
import { QuotaCard, SapSyncCard, SlaCard } from '@/components/admin/SettingsCards';
import { capexTypeOptions, mapDoaRule, type RawDoaRule } from '@/components/admin/doaLogic';

/** Admin Console (Fiori DOAMatrix + Admin scope): stacked sections. Writes stay disabled until lib/admin.ts enables them. */
export default function Page() {
  const s = useSession();
  const rules = useList<RawDoaRule>(s.isAdmin ? 'DoaRuleSet' : null, { $expand: 'DoaRuleToChain' });
  const vh = useList<ValueHelp>(s.isAdmin ? 'ValueHelpSet' : null);
  const matrix = useMemo(() => rules.rows.map(mapDoaRule), [rules.rows]);
  const types = useMemo(() => capexTypeOptions(vh.rows, matrix), [vh.rows, matrix]);

  if (s.loading) return <Spinner />;
  if (!s.isAdmin) return (<><PageHeader title="Admin Console" /><Card><p className="text-[12px] text-sap-muted">You are not allowed to view this page. It is for CAPEX administrators only.</p></Card></>);
  return (
    <div className="space-y-4">
      <PageHeader title="Admin Console" subtitle={adminWritesEnabled() ? 'Users, DOA rules and settings' : `Read-only. ${ADMIN_WRITES_OFF_NOTE}`} />
      <UsersCard />
      <DoaMatrixCard rules={matrix} capexTypes={types} loading={rules.loading} error={rules.error} onRetry={rules.reload} />
      <SimulatorCard rawRules={rules.rows} capexTypes={types} />
      <SlaCard config={s.config} />
      <QuotaCard config={s.config} />
      <SapSyncCard />
    </div>
  );
}
