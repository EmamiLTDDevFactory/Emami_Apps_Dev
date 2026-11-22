'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../DataTable';
import ExportButton from '../ExportButton';
import { Button, LoadError, TabPanelHeader, Toolbar, type TabProps } from '../ui';
import { ApiError, getCascadeDetails } from '@/lib/api';
import { DETAIL_COLS } from '@/lib/columns';
import { priceKey, rowKey, type Row } from '@/lib/types';

const flag = (v: unknown) => String(v ?? '').trim().toUpperCase() === 'X';
const ver = (r: Row) => Number(String(r.ZVERSION ?? '').trim() || '1') || 0;

/** Where a stored version stands, told from ZMM_CASCADE's flags (furthest step wins). */
export function detailStatus(r: Row): string {
  if (flag(r.ZCOND_STAT)) return 'Condition created';
  if (flag(r.ZAPPROVE)) return 'Approved';
  if (flag(r.ZREJECTED)) return 'Rejected';
  if (flag(r.ZINITIATOR)) return 'Pending approval';
  return 'Saved';
}

const STATUSES = ['Saved', 'Pending approval', 'Rejected', 'Approved', 'Condition created'];

/** Cascade Details (admin): all rows of ZMM_CASCADE, version by version. Price points are grouped, newest version first. */
export default function CascadeDetails({ active, busy }: TabProps) {
  const [raw, setRaw] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const loaded = useRef(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [latestOnly, setLatestOnly] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRaw(await getCascadeDetails());
      setError(null);
      loaded.current = true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : 'Could not load the data.', 0));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (active && !loaded.current) void reload(); }, [active, reload]);

  // Newest version first inside each price point; DETAIL_STATUS is app-side only.
  const rows = useMemo(() => {
    const withStatus: Row[] = raw.map((r) => ({ ...r, DETAIL_STATUS: detailStatus(r) }));
    return withStatus.sort((a, b) => priceKey(a).localeCompare(priceKey(b)) || ver(b) - ver(a) || String(b.VALIDFROM ?? '').localeCompare(String(a.VALIDFROM ?? '')));
  }, [raw]);
  const latestIdx = useMemo(() => new Set(rows.map((r, i) => (i === 0 || priceKey(rows[i - 1]) !== priceKey(r) ? i : -1)).filter((i) => i >= 0)), [rows]);
  const countries = useMemo(() => [...new Set(raw.map((r) => String(r.S_LAND1 ?? '')).filter(Boolean))].sort(), [raw]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r, i) => {
      if (latestOnly && !latestIdx.has(i)) return false;
      if (status && r.DETAIL_STATUS !== status) return false;
      if (country && r.S_LAND1 !== country) return false;
      return !s || DETAIL_COLS.some((c) => String(r[c.key] ?? '').toLowerCase().includes(s));
    });
  }, [rows, latestIdx, q, status, country, latestOnly]);
  // The green shading (latest version of each price point) follows the rows that are shown.
  const shownLatest = useMemo(() => {
    const first = new Set<string>();
    const idx = new Set<number>();
    shown.forEach((r, i) => { const k = priceKey(r); if (!first.has(k)) { first.add(k); idx.add(i); } });
    return idx;
  }, [shown]);
  const pricePoints = useMemo(() => new Set(rows.map(priceKey)).size, [rows]);

  return (
    <>
      <TabPanelHeader title="Cascade Details" hint="Every version stored in ZMM_CASCADE. The latest version of each price point is shaded green." count={shown.length} />
      <Toolbar>
        <Button onClick={() => void reload()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer, material, version..." aria-label="Search cascade details" className="field h-7 w-52" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field h-7" aria-label="Filter by status">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="field h-7" aria-label="Filter by selling country">
            <option value="">All</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-sap-muted">
          <input type="checkbox" className="h-3.5 w-3.5 accent-plum" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} /> Latest version only
        </label>
        {!!rows.length && <span className="text-xs text-sap-muted">{rows.length.toLocaleString('en-IN')} version row(s) · {pricePoints.toLocaleString('en-IN')} price point(s)</span>}
        <div className="ml-auto"><ExportButton rows={shown} columns={DETAIL_COLS} tab="Cascade_Details" disabled={busy} /></div>
      </Toolbar>
      <div className="p-4">
        <LoadError error={error} onRetry={() => void reload()} busy={loading} />
        <DataTable label="Cascade details" columns={DETAIL_COLS} rows={shown} rowKeyOf={(r) => rowKey(r)} loading={loading}
          highlight={(_, i) => shownLatest.has(i)} emptyText={error ? 'Nothing to show: SAP did not return the details (see above).' : raw.length ? 'No row matches the filters.' : 'ZMM_CASCADE holds no rows.'} />
      </div>
    </>
  );
}
