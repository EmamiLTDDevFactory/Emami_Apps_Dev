'use client';
/**
 * /plan - the plans in SAP. PlanHeadSet answers one row per plan AND plant; rows are grouped by plan here
 * (collapsed by default: plants, rows, total quantity summed client side with decimal.js). Expanding a plan
 * lists its plants with "Open" (that plant only); "Open all plants" opens the plan without a plant.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Download, Info, RefreshCw, Search, Upload } from 'lucide-react';
import PlanFrame from './PlanFrame';
import { ErrorNote, tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Skeleton, inputBase, cx } from '../ui';
import { fetchPlanHeads } from '@/lib/plan/client';
import { downloadTemplate } from '@/lib/plan/upload';
import { filterPlanGroups, groupPlanHeads, planHref, plantLabel } from '@/lib/plan/plants';
import type { PlanHead } from '@/lib/plan/fields';
import { fmtNum } from '@/lib/format';

export default function PlansPage() {
  const [rows, setRows] = useState<PlanHead[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [plantFilter, setPlantFilter] = useState<string[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    fetchPlanHeads({}, { signal })
      .then((r) => setRows(r.rows))
      .catch((e) => { if (!signal?.aborted) setError((e as Error).message); })
      .finally(() => { if (!signal?.aborted) setLoading(false); });
  }, []);
  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  const groups = useMemo(() => groupPlanHeads(rows ?? []), [rows]);
  const allPlants = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows ?? []) if (!m.has(r.Werks)) m.set(r.Werks, r.WerksTxt);
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([werks, name]) => ({ werks, name }));
  }, [rows]);
  const shown = useMemo(() => filterPlanGroups(groups, q, plantFilter), [groups, q, plantFilter]);
  const filtering = !!q.trim() || plantFilter.length > 0;
  const toggle = (plan: string) => setOpen((s) => { const n = new Set(s); if (n.has(plan)) n.delete(plan); else n.add(plan); return n; });
  const togglePlant = (w: string) => setPlantFilter((s) => (s.includes(w) ? s.filter((x) => x !== w) : [...s, w]));

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
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input aria-label="Search plans and plants" className={cx(inputBase, 'h-9 w-full pl-8')} placeholder="Plan name, plant code or name…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading} title="Reload from SAP"><RefreshCw size={14} className={cx(loading && 'animate-spin')} /></Button>
          {rows && <span className="ml-auto text-xs text-muted">{shown.length} of {groups.length} plans</span>}
        </div>
        {allPlants.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Plant filter">
            <span className="mr-1 text-xs font-bold text-muted">Plants</span>
            {allPlants.map((p) => {
              const on = plantFilter.includes(p.werks);
              return (
                <button key={p.werks} type="button" aria-pressed={on} onClick={() => togglePlant(p.werks)} title={p.name}
                  className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold transition', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel hover:border-accent/60')}>
                  <span className="font-mono">{p.werks}</span>
                </button>
              );
            })}
            {plantFilter.length > 0 && <button type="button" className="ml-1 text-xs font-semibold text-accent hover:underline" onClick={() => setPlantFilter([])}>Clear</button>}
          </div>
        )}
        <ErrorNote error={error} />
        {!rows && loading ? (
          <Skeleton rows={5} />
        ) : rows && !shown.length ? (
          <Empty title={groups.length ? 'No plan matches the search or plant filter' : 'No plans in SAP yet'}>{groups.length ? null : <>Download the template, fill it and <Link className="text-accent underline" href="/plan/upload/">upload</Link> it.</>}</Empty>
        ) : rows ? (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className={thCls}>Plan / plant</th>
                    <th className={thNum}>Plants</th>
                    <th className={thNum}>Rows</th>
                    <th className={thNum}>Total quantity</th>
                    <th className={thCls} />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => {
                    const isOpen = open.has(g.plan) || filtering;
                    return [
                      <tr key={g.plan} className="border-t border-line hover:bg-sunken/50">
                        <td className={cx(tdCls, 'font-semibold')}>
                          <button type="button" className="inline-flex items-center gap-1" aria-expanded={isOpen} onClick={() => toggle(g.plan)}>
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {g.plan}
                          </button>
                        </td>
                        <td className={tdNum}>{g.plants.length}</td>
                        <td className={tdNum}>{g.rows.toLocaleString('en-IN')}</td>
                        <td className={tdNum}>{fmtNum(g.total, 3, 'X')}</td>
                        <td className={cx(tdCls, 'text-right')}><Link href={planHref(g.plan)} className="text-xs font-bold text-accent hover:underline">Open all plants →</Link></td>
                      </tr>,
                      ...(isOpen ? g.plants.map((p) => (
                        <tr key={`${g.plan}|${p.werks}`} className="border-t border-line/40 bg-sunken/30">
                          <td className={cx(tdCls, 'pl-9')}><span className="font-mono">{p.werks}</span>{p.name && <span className="text-muted"> - {p.name}</span>}</td>
                          <td />
                          <td className={tdNum}>{p.rows.toLocaleString('en-IN')}</td>
                          <td className={tdNum}>{fmtNum(p.total, 3, 'X')}</td>
                          <td className={cx(tdCls, 'text-right')}>
                            <Link href={planHref(g.plan, [p.werks])} aria-label={`Open ${g.plan} ${plantLabel(p)}`} className="inline-flex h-7 items-center rounded-lg border border-line bg-panel px-2.5 text-xs font-bold text-accent hover:bg-sunken">Open</Link>
                          </td>
                        </tr>
                      )) : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-2xs text-muted"><Info size={12} className="mt-px shrink-0" /> Quantities are summed across materials and can mix units (pieces, kg), so the totals are indicative only.</p>
          </>
        ) : null}
      </Card>
    </PlanFrame>
  );
}
