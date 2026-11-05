'use client';
/** Split of one finished good (the report's drill-down): BOM components with budget / projected / actual / last cost per piece and the conversion cost. SAP computes; this lists. */
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Button, Drawer, Empty, Pill, Skeleton, Stat, Tabs, cx } from '../ui';
import WacMessages from '../wac/WacMessages';
import { fmtNum } from '@/lib/format';
import { D } from '@/lib/cost/decimal';
import { downloadBudget, paramsOf, splitSheet } from '@/lib/budget/export';
import type { BudgetQuery } from '@/lib/budget/filter';
import { splitKey, startSplit, useEntry } from '@/lib/budget/useBudget';
import { BUCKET_COLOR, BUCKET_HINT, BUCKET_LABEL, SPLIT_BUCKETS, bucketOf, groupedSplitRows, issuesOf, splitTotals } from '@/lib/budget/view';
import type { BudgetSplitRow, BudgetSummaryRow } from '@/lib/budget/types';

type Tab = 'components' | 'conversion';
const n = (v: string, dp = 4) => (D(v).isZero() ? <span className="text-faint">0</span> : fmtNum(v, dp, 'X'));

export default function SplitDrawer({ q, row, appUser, ctx, onClose }: { q: BudgetQuery; row: BudgetSummaryRow | null; appUser: string; ctx: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('components');
  const key = row ? splitKey(q, row.Matnr, row.Werks, appUser) : null;
  const entry = useEntry<BudgetSplitRow>(key);
  useEffect(() => { if (row) void startSplit(q, row.Matnr, row.Werks, ctx, appUser); }, [row, q, ctx, appUser]);
  const rows = entry?.status === 'done' ? entry.data ?? [] : [];
  const tot = useMemo(() => splitTotals(rows), [rows]);
  const ordered = useMemo(() => groupedSplitRows(rows), [rows]);
  const diff = row ? tot.budget.minus(D(row.CostPerpc1)).abs() : null;
  const issues = useMemo(() => Array.from(new Set(rows.flatMap((r) => issuesOf(r)))), [rows]);
  return (
    <Drawer open={!!row} onClose={onClose} width={1100} title={row && (
      <div>
        <div className="font-mono text-xs font-bold text-accent">{row.Matnr} · {row.Werks}</div>
        <div className="truncate text-sm font-extrabold">{row.Maktx}</div>
      </div>
    )}>
      {row && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Budget / pc" value={fmtNum(row.CostPerpc1, 4, 'X')} sub="from SAP summary" />
            <Stat label="Projected / pc" value={fmtNum(row.PCostPerpc1, 4, 'X')} />
            <Stat label="Actual / pc" value={D(row.ACostPerpc1).isZero() ? 'n/a' : fmtNum(row.ACostPerpc1, 4, 'X')} />
            <Stat label="Info-record rate / pc" value={D(row.LastRate).isZero() ? 'n/a' : fmtNum(row.LastRate, 4, 'X')} sub="information only" />
          </div>
          {entry?.status === 'loading' && <Skeleton rows={6} />}
          <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />
          {entry?.status === 'done' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs<Tab> label="Split view" value={tab} onChange={setTab} tabs={[{ id: 'components', label: 'Components', badge: <Pill>{rows.length}</Pill> }, { id: 'conversion', label: 'Conversion and activity' }]} />
                {diff && diff.gt('0.001') && <Pill tone="warn" title="The sum of the split rows differs from the summary line SAP sent">Split total differs by {fmtNum(diff, 4, 'X')}</Pill>}
                {issues.map((i) => <Pill key={i} tone="warn">{i}</Pill>)}
                <span className="flex-1" />
                <Button size="sm" onClick={() => void startSplit(q, row.Matnr, row.Werks, ctx, appUser, true)}><RefreshCw size={13} /> Refresh</Button>
                <Button size="sm" onClick={() => void downloadBudget([splitSheet(rows)], paramsOf(q, [['Finished good', `${row.Matnr} (${row.Werks})`]]), `budget-split-${row.Matnr}`)}><FileSpreadsheet size={13} /> Excel</Button>
              </div>
              {rows.length > 0 && tab === 'components' && (
                <div className="flex flex-wrap items-center gap-3 text-2xs text-muted">
                  {SPLIT_BUCKETS.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1" title={BUCKET_HINT[b]}><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BUCKET_COLOR[b] }} /><b className="text-ink">{BUCKET_LABEL[b]}</b> {rows.filter((r) => bucketOf(r) === b).length}</span>
                  ))}
                </div>
              )}
              {!rows.length ? <Empty title="No components">SAP returned no BOM rows for this finished good.</Empty> : (
                <div className="scroll-thin max-h-[58vh] overflow-auto rounded-2xl border border-line">
                  <table className="w-full border-separate border-spacing-0 text-[13px]">
                    <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">
                      {(tab === 'components'
                        ? ['Group', 'Component', 'Description', 'Type', 'Origin', 'C/T', 'Qty (incl. scrap)', 'Unit', 'B-Net landed', 'Act net landed', 'B-Cost / pc', 'Proj / pc', 'Act / pc', 'Info-record rate (info only)', 'Vendor']
                        : ['Component', 'Machine', 'Labour', 'Power', 'Steam', '3P conv.', 'Machine hrs', 'Labour hrs', 'Power', 'Steam', 'Activity base qty']).map((h, i) => (
                        <th key={h + i} className={cx('sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2', i > 6 && tab === 'components' && 'text-right')}>{h}</th>))}
                    </tr></thead>
                    <tbody>
                      {ordered.map((r) => { const b = bucketOf(r); return (
                        <tr key={r.Rowid} style={tab === 'components' ? { backgroundColor: `${BUCKET_COLOR[b]}14`, boxShadow: `inset 3px 0 0 ${BUCKET_COLOR[b]}` } : undefined} className={tab === 'components' ? undefined : 'odd:bg-panel even:bg-sunken/40'}>
                          {tab === 'components' ? (<>
                            <td className="border-b border-line/60 px-2.5 py-1.5"><span className="rounded-full px-2 py-0.5 text-2xs font-bold text-white" style={{ background: BUCKET_COLOR[b] }} title={BUCKET_HINT[b]}>{BUCKET_LABEL[b]}</span></td>
                            <td className="whitespace-nowrap border-b border-line/60 px-2.5 py-1.5 font-mono text-xs" style={{ paddingLeft: 10 + Math.max(0, r.Stufe - 1) * 16 }}>{r.ItemCode}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.ItemDesc}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.Mtart}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.Hrkft}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.Erskz}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.Menge, 6)}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.Meins}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.Total)}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.ATotal)}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right font-semibold">{n(r.CostPerpc1)}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.PCostPerpc1)}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.ACostPerpc1)}</td>
                            <td className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(r.LastRate)}</td>
                            <td className="border-b border-line/60 px-2.5 py-1.5">{r.Name1}</td>
                          </>) : (<>
                            <td className="whitespace-nowrap border-b border-line/60 px-2.5 py-1.5 font-mono text-xs">{r.ItemCode}</td>
                            {[r.Machine, r.Labour, r.Power, r.Steam, r.Labour3p, r.MachrsQty, r.LabhrsQty, r.PowerQty, r.SteamQty, r.Bmsch].map((v, i) => <td key={i} className="num border-b border-line/60 px-2.5 py-1.5 text-right">{n(v)}</td>)}
                          </>)}
                        </tr>
                      ); })}
                    </tbody>
                    {tab === 'components' && (
                      <tfoot><tr className="font-bold">
                        <td colSpan={10} className="sticky bottom-0 border-t border-line bg-sunken px-2.5 py-2 text-right">Total of the split (budget from zcomponent rates)</td>
                        <td className="num sticky bottom-0 border-t border-line bg-sunken px-2.5 py-2 text-right">{fmtNum(tot.budget, 4, 'X')}</td>
                        <td className="num sticky bottom-0 border-t border-line bg-sunken px-2.5 py-2 text-right">{fmtNum(tot.projected, 4, 'X')}</td>
                        <td className="num sticky bottom-0 border-t border-line bg-sunken px-2.5 py-2 text-right">{fmtNum(tot.actual, 4, 'X')}</td>
                        <td className="num sticky bottom-0 border-t border-line bg-sunken px-2.5 py-2 text-right">{fmtNum(tot.last, 4, 'X')}</td>
                        <td className="sticky bottom-0 border-t border-line bg-sunken" />
                      </tr></tfoot>
                    )}
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
