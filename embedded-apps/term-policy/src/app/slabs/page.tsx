'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import AdminGuard from '../../components/AdminGuard';
import MasterGrid from '../../components/MasterGrid';
import YearBar from '../../components/YearBar';
import { maintApi, type MaintRow } from '../../lib/maint';

const pad2 = (n: number) => String(n).padStart(2, '0');

function Slabs() {
  const { profile } = useApp();
  const [year, setYear] = useState('');
  useEffect(() => {
    if (!year && profile?.activeYear) setYear(profile.activeYear);
  }, [profile?.activeYear, year]);

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Sum assured &amp; premium</h1>
      <YearBar year={year} onChange={setYear} />
      <MasterGrid
        table="SLAB"
        title="Sum assured slabs"
        note="Sum assured with its premium and GST per policy year (SAP table ZLIFE_AMT). An employee is offered the slabs up to their limit. Saving replaces the whole year."
        year={year}
        onYearChange={setYear}
        api={maintApi}
        mode="replace"
        canCopy
        cols={[
          { field: 'val1', label: 'Sum assured (Rs)', type: 'number', required: true },
          { field: 'val2', label: 'Text', placeholder: 'auto, e.g. 5 LAKHS', maxLength: 15 },
          { field: 'val3', label: 'Premium (Rs)', type: 'number', required: true },
          { field: 'val4', label: 'GST (Rs)', type: 'number', required: true },
          { field: 'val5', label: 'Total (Rs)', type: 'number', placeholder: 'auto' },
        ]}
        validate={(rows) => {
          const n = (v: string) => Number(v.replace(/,/g, ''));
          for (const r of rows) {
            if (n(r.val1) <= 0 || !Number.isInteger(n(r.val1))) return `Sum assured ${r.val1} must be a whole rupee amount.`;
            if (r.val5.trim() && n(r.val5) !== n(r.val3) + n(r.val4)) return `Total of ${r.val1} must be premium + GST (${n(r.val3) + n(r.val4)}).`;
            if (!r.val2.trim() && n(r.val1) % 100000 !== 0) return `Enter the text for sum assured ${r.val1} (for example 7.5 LAKHS).`;
          }
          const sums = rows.map((r) => n(r.val1));
          return new Set(sums).size !== sums.length ? 'The same sum assured appears twice.' : null;
        }}
        // slab numbers follow the sum assured, smallest first
        prepare={(rows: MaintRow[]) =>
          [...rows].sort((a, b) => Number(a.val1) - Number(b.val1)).map((r, i) => ({ ...r, key1: pad2(i + 1) }))
        }
        emptyText="No slabs for this year. Add rows, or copy another year here."
      />
    </div>
  );
}

export default function SlabsPage() {
  return (
    <AdminGuard maint>
      <Slabs />
    </AdminGuard>
  );
}
