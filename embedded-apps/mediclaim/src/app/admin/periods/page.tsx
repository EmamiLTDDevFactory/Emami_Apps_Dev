'use client';

import { useApp } from '../../../context/AppContext';
import AdminGuard from '../../../components/AdminGuard';
import MasterGrid from '../../../components/MasterGrid';
import { maintApi } from '../../../lib/maint';

function Periods() {
  const { refresh } = useApp();
  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Policy periods</h1>
      <MasterGrid
        table="MPERIOD"
        title="Policy years"
        note="The active year is the one the whole app works on (SAP table ZMEDI_PERIOD). Exactly one year must be active; activating a year deactivates the others."
        api={maintApi}
        mode="diff"
        onSaved={refresh}
        cols={[
          { field: 'key1', label: 'Policy year', type: 'number', keyCol: true, required: true, maxLength: 4, width: '40%' },
          { field: 'val1', label: 'Status', type: 'select', options: [{ value: '', label: 'Inactive' }, { value: 'X', label: 'Active' }] },
        ]}
        validate={(rows) => {
          const bad = rows.find((r) => !/^\d{4}$/.test(r.key1.trim()));
          if (bad) return `"${bad.key1}" is not a valid year.`;
          return rows.filter((r) => r.val1 === 'X').length > 1 ? 'Only one year can be active.' : null;
        }}
      />
    </div>
  );
}

export default function PeriodsPage() {
  return (
    <AdminGuard maint>
      <Periods />
    </AdminGuard>
  );
}
