'use client';

import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import AdminGuard from '../../../components/AdminGuard';
import MasterGrid from '../../../components/MasterGrid';
import YearBar from '../../../components/YearBar';
import { maintApi } from '../../../lib/maint';

const age = (v: string) => String(Number(v) || 0);

function Rates() {
  const { ctx } = useApp();
  const [year, setYear] = useState('');
  const [tab, setTab] = useState<'base' | 'topup'>('base');
  useEffect(() => {
    if (!year && ctx?.Year) setYear(ctx.Year);
  }, [ctx?.Year, year]);

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Premium rates</h1>
      <YearBar year={year} onChange={setYear} />
      <div className="mb-3 flex gap-2">
        {([['base', 'Base premium'], ['topup', 'Top-up premium']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${tab === k ? 'bg-glassRust text-rust' : 'text-inkSoft hover:bg-white/50'}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'base' ? (
        <MasterGrid
          key="base"
          table="BASE"
          title="Base premium"
          note="Premium per age band and sum insured (SAP table ZBASE_PREMIUM). Saving replaces the whole year."
          year={year}
          onYearChange={setYear}
          api={maintApi}
          mode="replace"
          canCopy
          cols={[
            { field: 'key1', label: 'From age', type: 'number', required: true, width: '18%', load: age },
            { field: 'key2', label: 'To age', type: 'number', required: true, width: '18%', load: age },
            { field: 'key3', label: 'Sum insured', type: 'number', required: true },
            { field: 'val1', label: 'Premium', type: 'number', required: true },
          ]}
          validate={(rows) => {
            const bad = rows.find((r) => Number(r.key1) > Number(r.key2));
            return bad ? `Age band ${bad.key1}-${bad.key2}: from age is above to age.` : null;
          }}
          emptyText="No base premium for this year. Add rows, or copy another year here."
        />
      ) : (
        <MasterGrid
          key="topup"
          table="TOPUP"
          title="Top-up premium"
          note="Premium per top-up sum insured (SAP table ZTOP_PREMIUM). Saving replaces the whole year."
          year={year}
          onYearChange={setYear}
          api={maintApi}
          mode="replace"
          canCopy
          cols={[
            { field: 'key1', label: 'Top-up amount', type: 'number', required: true },
            { field: 'val1', label: 'Premium', type: 'number', required: true },
          ]}
          emptyText="No top-up premium for this year. Add rows, or copy another year here."
        />
      )}
    </div>
  );
}

export default function RatesPage() {
  return (
    <AdminGuard hrOnly>
      <Rates />
    </AdminGuard>
  );
}
