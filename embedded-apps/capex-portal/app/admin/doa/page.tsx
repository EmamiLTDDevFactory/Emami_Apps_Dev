'use client';
import { useMemo } from 'react';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { loadAdmin, normalizeDoa, normalizeUser, toRuleLike, type AdminDoa, type AdminUser } from '@/lib/admin';
import { useSession } from '@/lib/session';
import { useList } from '@/lib/useData';
import { useAdminList } from '@/lib/useAdminList';
import type { ValueHelp } from '@/lib/entities';
import DoaMatrixCard from '@/components/admin/DoaMatrixCard';
import SimulatorCard from '@/components/admin/SimulatorCard';
import UsersCard from '@/components/admin/UsersCard';
import { QuotaCard, SapSyncCard, SlaCard } from '@/components/admin/SettingsCards';
import { capexTypeOptions, type MatrixRule } from '@/components/admin/doaLogic';

/** Maintenance (Fiori DOAMatrix + Admin scope): users, DOA rules, SLA and quota settings. Only for the app's Admins in Emami Apps. */
export default function Page() {
  const s = useSession();
  const users = useAdminList<AdminUser>(s.hubAdmin, () => loadAdmin('USERS', normalizeUser));
  const rules = useAdminList<AdminDoa>(s.hubAdmin, () => loadAdmin('DOA', normalizeDoa));
  const vh = useList<ValueHelp>(s.hubAdmin && s.active ? 'ValueHelpSet' : null);
  const types = useMemo(
    () => capexTypeOptions(vh.rows, rules.rows.map((r) => ({ capexType: r.capextype, capexTypeText: r.capextype }) as MatrixRule)),
    [vh.rows, rules.rows],
  );
  const roles = useMemo(
    () => Array.from(new Set([...users.rows.map((u) => u.role), ...rules.rows.flatMap((r) => r.chain.map((c) => c.role))].filter(Boolean))).sort(),
    [users.rows, rules.rows],
  );
  const ruleLikes = useMemo(() => rules.rows.map(toRuleLike), [rules.rows]);

  if (s.loading) return <Spinner />;
  if (!s.hubAdmin) return (<><PageHeader title="Maintenance" /><Card><p className="text-[12px] text-sap-muted">You are not allowed to view this page. It is for administrators of the CAPEX Portal (Admin role for this app in Emami Apps).</p></Card></>);
  return (
    <div className="space-y-4">
      <PageHeader title="Maintenance" subtitle="Users, DOA rules and settings. Changes are saved in SAP and apply at once." />
      <UsersCard users={users.rows} roles={roles} loading={users.loading} error={users.error} onRetry={users.reload} onSaved={users.reload} />
      <DoaMatrixCard rules={rules.rows} users={users.rows} roles={roles} capexTypes={types} loading={rules.loading} error={rules.error} onRetry={rules.reload} onSaved={rules.reload} />
      <SimulatorCard rawRules={ruleLikes.filter((r) => r.Active === 'X')} capexTypes={types} />
      <SlaCard config={s.config} onSaved={s.reload} />
      <QuotaCard config={s.config} onSaved={s.reload} />
      <SapSyncCard />
    </div>
  );
}
