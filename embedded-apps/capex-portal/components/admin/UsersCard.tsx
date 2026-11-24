'use client';
import { Button, Card, Chip } from '@/components/ui';
import { adminWritesEnabled, ADMIN_WRITES_OFF_NOTE } from '@/lib/admin';
import { useSession } from '@/lib/session';

/** Users & Roles: SAP has no user-list entity yet, so only the signed-in admin's own record is shown. */
export default function UsersCard() {
  const s = useSession();
  const w = adminWritesEnabled();
  const row = (k: string, v: string) => <div><dt className="text-[11px] font-bold text-sap-muted">{k}</dt><dd className="text-[12px] text-sap-ink">{v || '-'}</dd></div>;
  return (
    <Card title="Users & Roles" hint="Your own record. A list of all CAPEX users is not available from SAP yet."
      actions={<><Button disabled={!w} title={w ? '' : ADMIN_WRITES_OFF_NOTE}>Add user</Button><Button disabled={!w} title={w ? '' : ADMIN_WRITES_OFF_NOTE}>Change role</Button></>}>
      <dl className="grid gap-3 sm:grid-cols-3">
        {row('Name', s.fullName)}{row('User ID', s.userId)}{row('E-mail', s.email)}{row('Role', s.role)}{row('Unit', s.unit)}
        {row('Plants', s.isGlobal ? 'All plants' : s.plants.map((p) => `${p.name} (${p.code})`).join(', '))}
        <div><dt className="text-[11px] font-bold text-sap-muted">Access</dt><dd className="flex gap-1"><Chip tone={s.isAdmin ? 'success' : 'neutral'}>{s.isAdmin ? 'Admin' : 'Not admin'}</Chip><Chip tone={s.active ? 'success' : 'warning'}>{s.active ? 'Active' : 'Inactive'}</Chip></dd></div>
      </dl>
      {!w && <p className="mt-3 text-[11px] text-sap-muted">{ADMIN_WRITES_OFF_NOTE}</p>}
    </Card>
  );
}
