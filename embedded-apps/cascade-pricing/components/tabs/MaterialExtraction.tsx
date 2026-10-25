'use client';
import { useMemo, useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import { Button, TabPanelHeader, Toolbar, type TabProps, LoadError } from '../ui';
import { MAP_COLS } from '@/lib/columns';
import { rowKey } from '@/lib/types';
import { useSetData } from '@/lib/useSetData';

/** Cascade Material Extraction: the materials mapped for cascade pricing (CascadeMapSet). Read only. */
export default function MaterialExtraction({ active, busy, showMessage }: TabProps) {
  const { rows, loading, reload, error } = useSetData('CascadeMapSet', active, showMessage);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => MAP_COLS.some((c) => String(r[c.key] ?? '').toLowerCase().includes(s)));
  }, [rows, q]);
  const unmapped = rows.filter((r) => !String(r.CASCADE_DESC ?? '').trim()).length;

  return (
    <>
      <TabPanelHeader title="Cascade Material Extraction" hint="Materials maintained for cascade pricing, with their cascade description and business." count={rows.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Material, description, business" aria-label="Search materials" className="h-7 w-56 rounded border border-sap-line px-2 text-xs focus:border-plum focus:outline-none" />
        </label>
        {unmapped > 0 && <span className="text-xs text-amber-700">{unmapped.toLocaleString('en-IN')} material(s) without a cascade description</span>}
        <div className="ml-auto"><ExportButton rows={shown} columns={MAP_COLS} tab="Cascade_Material_Extraction" disabled={busy} /></div>
      </Toolbar>
      <div className="p-3">
        <LoadError error={error} onRetry={() => void reload()} busy={loading} />
        <DataTable label="Cascade materials" columns={MAP_COLS} rows={shown} rowKeyOf={(r) => rowKey(r, 'material')} loading={loading} emptyText={error ? 'Nothing to show: SAP did not return the list (see above).' : q ? 'No material matches the search.' : undefined} />
      </div>
    </>
  );
}
