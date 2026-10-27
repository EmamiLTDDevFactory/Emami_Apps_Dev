'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BVAT_HINT } from '@/lib/freight/breakup';
import type { CostQuery, PageRequest } from '@/lib/query/schema';
import { MODE_LABEL } from '@/lib/query/schema';
import { api, type ApiError, type PagedResult } from '@/lib/client/api';
import { currencyOf, VIEW_COLUMNS, type ColDef } from '@/lib/views';
import { fmtDate, fmtNum } from '@/lib/format';
import { exportRows } from '@/lib/client/export';
import type { SapMessage } from '@/lib/sap/messages';
import { Button, cx, Empty, inputBase, inputCls, Skeleton, SourceBadge } from './ui';

export function Cell({ col, row }: { col: ColDef; row: Record<string, unknown> }) {
  const v = row[col.key];
  if (col.badge === 'source') return <SourceBadge source={String(v ?? '')} />;
  if (col.kind === 't') return <>{fmtDate(v as string)}</>;
  if (col.kind === 'd') {
    const cur = currencyOf(col, row);
    return (
      <span className="num">
        {fmtNum(v as string, col.dp ?? 2, cur || 'X')}
        {cur && <span className="ml-1 text-2xs text-faint">{cur}</span>}
      </span>
    );
  }
  return <>{String(v ?? '')}</>;
}

/**
 * Rates / Freight / RM-PM. The first page triggers the SAP run; paging, sort, search and filters
 * are then served from the BFF's cached copy of the full result (no SAP call).
 */
export default function PagedTable({ query, runKey, onMessages, onRunning }: { query: CostQuery; runKey: number; onMessages: (m: SapMessage[], ms: number) => void; onRunning: (r: boolean, cancel?: () => void) => void }) {
  const mode = query.mode as 'R' | 'F' | 'M';
  const cols = VIEW_COLUMNS[mode];
  const [page, setPage] = useState<Omit<PageRequest, 'all'>>({ top: 100, skip: 0, dir: 'asc', search: '', filters: {}, sort: undefined });
  const [data, setData] = useState<PagedResult | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(
    async (p: Omit<PageRequest, 'all'>) => {
      ctl.current?.abort();
      const c = new AbortController();
      ctl.current = c;
      setLoading(true);
      setErr(null);
      onRunning(true, () => c.abort());
      try {
        const r = await api.paged(query, p, c.signal);
        setData(r);
        if (!r.cached) onMessages(r.messages, r.ms);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setErr(e as ApiError);
      } finally {
        if (ctl.current === c) {
          setLoading(false);
          onRunning(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query],
  );

  // A new run (button press) resets paging; nothing runs on keystrokes in the filter panel.
  useEffect(() => {
    if (!runKey) return;
    const p = { ...page, skip: 0 };
    setPage(p);
    void load(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      if (search !== page.search) {
        const p = { ...page, search, skip: 0 };
        setPage(p);
        void load(p);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const go = (patch: Partial<PageRequest>) => {
    const p = { ...page, ...patch };
    setPage(p);
    void load(p);
  };
  const sortBy = (k: string) => go({ sort: k, dir: page.sort === k && page.dir === 'asc' ? 'desc' : 'asc', skip: 0 });

  const exportAll = async (fmt: 'xlsx' | 'csv') => {
    const all = await api.paged(query, { ...page, all: true });
    await exportRows({ fmt, name: MODE_LABEL[mode], query, cols, rows: all.rows, totals: all.totals });
  };

  if (!data && loading) return <Skeleton rows={14} />;
  if (err && !data) return <Empty title="SAP returned an error" icon="!"><p className="text-bad">{err.message}</p><Button className="mt-3" onClick={() => go({})}>Retry</Button></Empty>;
  if (!data) return <Empty title={`Run ${MODE_LABEL[mode]}`}>Choose materials and plants on the left, then press <strong>Run in SAP</strong>.</Empty>;

  const pages = Math.max(1, Math.ceil(data.total / page.top));
  const cur = Math.floor(page.skip / page.top) + 1;
  // Amounts carry a currency code next to them: give those columns room for it.
  const w = (c: ColDef) => (c.width ?? 120) + (c.curr ? 30 : 0);
  const width = cols.reduce((a, c) => a + w(c), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-1.5 no-print">
        <input className={cx(inputBase, 'h-7 w-60 text-xs')} placeholder="Search text columns…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        {Object.entries(page.filters).filter(([, v]) => v).map(([k, v]) => (
          <button key={k} type="button" className="rounded bg-sunken px-1.5 py-0.5 text-2xs" onClick={() => go({ filters: { ...page.filters, [k]: '' }, skip: 0 })}>
            {k}: {v} ✕
          </button>
        ))}
        {loading && <span className="text-2xs text-muted">Loading…</span>}
        {mode === 'F' && <span className="text-2xs text-muted">{BVAT_HINT}: without one, SAP shows BVAT as EXCLUDED.</span>}
        <span className="ml-auto text-2xs text-muted">{data.total.toLocaleString('en-IN')} rows {data.cached && '· from cache'}</span>
        <Button size="sm" onClick={() => exportAll('xlsx')}>Excel</Button>
        <Button size="sm" onClick={() => exportAll('csv')}>CSV</Button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="border-collapse text-[13px]" style={{ width, minWidth: '100%' }}>
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line">
              {cols.map((c) => (
                <th key={c.key} scope="col" style={{ width: w(c) }} className={cx('px-2 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted', c.kind === 'd' ? 'text-right' : 'text-left')} aria-sort={page.sort === c.key ? (page.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="uppercase tracking-wide hover:text-ink" onClick={() => sortBy(c.key)}>
                    {c.label} {page.sort === c.key ? (page.dir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="border-b border-line">
              {cols.map((c) => (
                <th key={c.key} className="px-1 py-1">
                  {c.filter && (
                    <input
                      aria-label={`Filter ${c.label}`}
                      className={cx(inputBase, 'h-6 w-full px-1 text-2xs')}
                      placeholder="filter"
                      defaultValue={page.filters[c.key] ?? ''}
                      onKeyDown={(e) => e.key === 'Enter' && go({ filters: { ...page.filters, [c.key]: (e.target as HTMLInputElement).value }, skip: 0 })}
                      onBlur={(e) => (e.target.value !== (page.filters[c.key] ?? '')) && go({ filters: { ...page.filters, [c.key]: e.target.value }, skip: 0 })}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cx(loading && 'opacity-60')}>
            {data.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60 hover:bg-accent/[0.04]">
                {cols.map((c) => (
                  <td key={c.key} className={cx('truncate px-2 py-1', c.kind === 'd' && 'text-right')} style={{ maxWidth: w(c) }}>
                    <Cell col={c} row={r} />
                  </td>
                ))}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={cols.length}><Empty title="No rows match">Clear search or filters.</Empty></td></tr>
            )}
          </tbody>
          {Object.keys(data.totals).length > 0 && (
            <tfoot className="sticky bottom-0 bg-sunken text-xs font-semibold">
              <tr>
                {cols.map((c, i) => (
                  <td key={c.key} className={cx('px-2 py-1.5 align-top', c.kind === 'd' && 'text-right')}>
                    {i === 0 ? <span className="whitespace-nowrap">Total (all pages)</span> : data.totals[c.key] ? Object.entries(data.totals[c.key]).map(([cur, v]) => (
                      <div key={cur} className="num whitespace-nowrap">{fmtNum(v, c.dp ?? 2, cur || 'X')} <span className="text-2xs text-faint">{cur}</span></div>
                    )) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5 text-xs no-print">
        <Button size="sm" disabled={cur <= 1} onClick={() => go({ skip: 0 })} aria-label="First page">«</Button>
        <Button size="sm" disabled={cur <= 1} onClick={() => go({ skip: page.skip - page.top })} aria-label="Previous page">‹</Button>
        <span>Page {cur} of {pages}</span>
        <Button size="sm" disabled={cur >= pages} onClick={() => go({ skip: page.skip + page.top })} aria-label="Next page">›</Button>
        <Button size="sm" disabled={cur >= pages} onClick={() => go({ skip: (pages - 1) * page.top })} aria-label="Last page">»</Button>
        <label className="ml-2 flex items-center gap-1">
          Rows
          <select className={cx(inputBase, 'h-7 w-20 text-xs')} value={page.top} onChange={(e) => go({ top: Number(e.target.value), skip: 0 })}>
            {[50, 100, 250, 500].map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
