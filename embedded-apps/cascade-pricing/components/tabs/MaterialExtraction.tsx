'use client';
import { useMemo, useState } from 'react';
import DataTable from '../DataTable';
import { Button, TabPanelHeader, Toolbar, type TabProps } from '../ui';
import { MATERIAL_COLUMNS } from '@/lib/columns';
import { rowKey } from '@/lib/types';
import { useSetData } from '@/lib/useSetData';

/** Cascade Material Extraction: the materials mapped for cascade pricing (CascadeMapSet). Read-only. */
export default function MaterialExtraction({ active, busy, setStatus }: TabProps) {
  const { rows, loading, reload } = useSetData('CascadeMapSet', active, setStatus);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => MATERIAL_COLUMNS.some((c) => String(r[c.key] ?? '').toLowerCase().includes(s)));
  }, [rows, q]);
  const unmapped = rows.filter((r) => !String(r.CASCADE_DESC ?? '').trim()).length;

  return (
    <>
      <TabPanelHeader title="Cascade Material Extraction" hint="Materials maintained for cascade pricing, with their cascade description and business." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Load'}</Button>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Material, description, business" aria-label="Search materials" className="h-7 w-56 rounded border border-sap-line px-2 text-xs focus:border-plum focus:outline-none" />
        </label>
        {unmapped > 0 && <span className="text-xs text-amber-700">{unmapped} material(s) without a cascade description</span>}
      </Toolbar>
      <div className="p-3">
        <DataTable label="Cascade materials" columns={MATERIAL_COLUMNS} rows={shown} rowKeyOf={(r) => rowKey(r, 'CascadeMapSet')} loading={loading} emptyText={q ? 'No material matches the search.' : undefined} />
      </div>
    </>
  );
}
