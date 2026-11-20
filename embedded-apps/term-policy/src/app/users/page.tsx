'use client';

import AdminGuard from '../../components/AdminGuard';
import MasterGrid from '../../components/MasterGrid';
import { maintApi } from '../../lib/maint';

function Users() {
  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Authorised users</h1>
      <MasterGrid
        table="AUTH"
        title="Authorised users"
        note="SAP table ZMEDI_AUTH_USERS, shared with the Mediclaim app. Give a user the id used in SAP (for example sandip.das), in lower case."
        api={maintApi}
        mode="diff"
        identity={['key1']}
        searchable
        cols={[
          { field: 'val1', label: 'User id', required: true, maxLength: 30, placeholder: 'first.last' },
          {
            field: 'val2',
            label: 'Role',
            type: 'select',
            options: [{ value: 'E', label: 'E - Editor (may apply for and change the policy of any employee)' }, { value: 'R', label: 'R - Admin (report, delete, limits, mass upload, mail, maintenance)' }],
          },
        ]}
        newRow={() => ({ val2: 'E' })}
        validate={(rows) => {
          if (!rows.some((r) => r.val2 === 'R')) return 'Keep at least one HR admin (R), otherwise nobody can maintain the app.';
          const seen = new Set<string>();
          for (const r of rows) {
            const k = `${r.val1.trim().toLowerCase()}|${r.val2}`;
            if (seen.has(k)) return `${r.val1} appears twice with the same role.`;
            seen.add(k);
          }
          return null;
        }}
        emptyText="No authorised users."
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <AdminGuard>
      <Users />
    </AdminGuard>
  );
}
