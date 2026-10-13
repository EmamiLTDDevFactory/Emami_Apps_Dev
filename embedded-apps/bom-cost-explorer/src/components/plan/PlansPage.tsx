'use client';
/** /plan - the plans in SAP (PlanHeadSet: name, rows, plants, total) with search, open, the Excel template and
 * the upload wizard. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, RefreshCw, Search, Upload } from 'lucide-react';
import PlanFrame from './PlanFrame';
import { ErrorNote, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Skeleton, inputBase, cx } from '../ui';
import { fetchPlanHeads } from '@/lib/plan/client';
import { downloadTemplate } from '@/lib/plan/upload';
import type { PlanHead } from '@/lib/plan/fields';
import { fmtNum } from '@/lib/format';

export const planHref = (plan: string) => `/plan/view/?plan=${encodeURIComponent(plan)}`;

export default function PlansPage() {
  const [rows, setRows] = useState<PlanHead[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    fetchPlanHeads({ signal })
      .then((r) => setRows(r.rows.sort((a, b) => a.Plan1.localeCompare(b.Plan1))))
      .catch((e) => { if (!signal?.aborted) setError((e as Error).message); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, []);
  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((r) => !q.trim() || r.Plan1.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  return (
    <PlanFrame active="plans">
      <Card
        title="Production plans"
        actions={
          <>
            <Button size="sm" onClick={() => void downloadTemplate()} title="Excel template: Material, Plant, Plan, Country, Apr..Mar"><Download size={14} /> Template</Button>
            <Link href="/plan/upload/" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-br from-accent to-accent-deep px-2.5 text-xs font-bold text-white"><Upload size={14} /> Upload plan</Link>
          </>
        }
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input aria-label="Search plans" className={cx(inputBase, 'h-9 w-full pl-8')} placeholder="Search plan name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading} title="Reload from SAP"><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></Button>
          {rows && <span className="ml-auto text-xs text-muted">{shown.length} of {rows.length} plans</span>}
        </div>
        <ErrorNote error={error} />
        {!rows && loading ? (
          <Skeleton rows={5} />
        ) : rows && !shown.length ? (
          <Empty title={rows.length ? 'No plan matches the search' : 'No plans in SAP yet'}>{rows.length ? null : <>Download the template, fill it and <Link className="text-accent underline" href="/plan/upload/">upload</Link> it.</>}</Empty>
        ) : rows ? (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className={thCls}>Plan</th>
                  <th className={thNum}>Rows</th>
                  <th className={thNum}>Plants</th>
                  <th className={thNum}>Total quantity</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.Plan1} className="border-t border-line/70 hover:bg-sunken/50">
                    <td className={cx(tdCls, 'font-semibold')}><Link href={planHref(r.Plan1)} className="text-accent hover:underline">{r.Plan1}</Link></td>
                    <td className={tdNum}>{r.RowCnt.toLocaleString('en-IN')}</td>
                    <td className={tdNum}>{r.PlantCnt}</td>
                    <td className={tdNum}>{fmtNum(r.Total, 3, 'X')}</td>
                    <td className={cx(tdCls, 'text-right')}><Link href={planHref(r.Plan1)} className="text-xs font-bold text-accent hover:underline">Open →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </PlanFrame>
  );
}
