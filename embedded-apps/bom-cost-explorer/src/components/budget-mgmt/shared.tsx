'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '../ui';
import { SEGMENTS, STATUS_LABEL, type Segment } from '@/lib/budgetMgmt/types';
import { fetchPerfumeMaterials } from '@/lib/budgetMgmt/api';
import { stripZeros } from '@/lib/budgetMgmt/rules';
import { SapError } from '@/lib/sap/client';

const CAT: Record<string, string> = { A: 'bg-good text-white', B: 'bg-warn text-white', C: 'bg-bad text-white' };
export function CatBadge({ cat }: { cat: string }) {
  return cat ? <span className={cx('inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-2xs font-extrabold', CAT[cat] ?? 'bg-sunken text-ink')}>{cat}</span> : <span className="text-faint">—</span>;
}

const STATUS: Record<string, string> = {
  D: 'bg-sunken text-muted ring-line', S: 'bg-accent/10 text-accent ring-accent/30', A: 'bg-good/10 text-good ring-good/30', R: 'bg-bad/10 text-bad ring-bad/30', V: 'bg-warn/10 text-warn ring-warn/30',
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-2xs font-bold ring-1', STATUS[status] ?? STATUS.D)}>{STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? (status || '—')}</span>;
}

export const SourceChip = ({ src }: { src: string }) => (src ? <span className="inline-flex rounded-md bg-sunken px-1.5 py-0.5 text-2xs font-bold tracking-wide text-ink">{src}</span> : <span className="text-faint">—</span>);

/** SAP's own message for a SAP error, a plain retry text for a network failure. */
export const errorText = (e: unknown) => (e instanceof SapError ? (e.kind === 'network' ? 'Could not reach SAP — please retry' : e.message) : (e as Error).message || 'Something went wrong');

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</div>;
}
export function OkBox({ children }: { children: ReactNode }) {
  return <div role="status" className="rounded-xl border border-good/40 bg-good/10 px-3 py-2 text-sm text-good">{children}</div>;
}

export function SkeletonRows({ cols }: { cols: number }) {
  return (
    <tbody aria-busy="true">
      {[0, 1, 2].map((i) => <tr key={i} className="border-b border-line/60">{Array.from({ length: cols }, (_, j) => <td key={j} className="px-2 py-2"><div className="h-3 animate-pulse rounded bg-sunken" /></td>)}</tr>)}
    </tbody>
  );
}

export const NO_RECORDS = 'No records found for the selection';
export const th = 'whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-xs font-bold';
export const td = 'whitespace-nowrap px-2 py-1.5 text-xs';

/** The filter row of a table head: one small input per column (text contains; numbers also > < >= <= = and a..b; `blank`; `a|b` for any). */
export function FilterRow({ cols, filters, setFilters }: { cols: { key: string; className?: string; style?: CSSProperties; off?: boolean }[]; filters: Record<string, string>; setFilters: (f: Record<string, string>) => void }) {
  return (
    <tr>
      {cols.map((c) => (
        <th key={c.key} className={cx('border-b border-line bg-sunken px-1 py-1 font-normal', c.className)} style={c.style}>
          {!c.off && <input aria-label={`Filter ${c.key}`} placeholder="filter" title="Text contains. Numbers: >10  <=5  =3  10..20.  blank / !blank.  a|b = any of" value={filters[c.key] ?? ''}
            onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} className="w-full min-w-12 rounded border border-line bg-panel px-1.5 py-0.5 text-2xs font-normal" />}
        </th>
      ))}
    </tr>
  );
}


/** Segment filter shared by the tabs: All, Raw Material or Perfume (ROH + material group 106), with the counts. */
export type SegmentFilter = 'ALL' | Segment;
export function SegmentChips({ value, onChange, counts }: { value: SegmentFilter; onChange: (v: SegmentFilter) => void; counts?: Partial<Record<SegmentFilter, number>> }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Filter by segment">
      <span className="text-xs font-semibold">Segment</span>
      {(['ALL', ...SEGMENTS] as const).map((s) => (
        <button key={s} type="button" aria-pressed={value === s} onClick={() => onChange(s)}
          className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', value === s ? 'bg-accent text-white ring-accent' : 'bg-panel text-ink ring-line')}>{s === 'ALL' ? 'All' : s}{counts?.[s] !== undefined && ` (${counts[s]})`}</button>
      ))}
    </div>
  );
}
export const SegmentBadge = ({ segment }: { segment: string }) => <span className={cx('inline-flex rounded-full px-2 py-0.5 text-2xs font-bold ring-1', segment === 'Perfume' ? 'bg-accent/10 text-accent ring-accent/30' : 'bg-sunken text-muted ring-line')}>{segment}</span>;

/**
 * Perfume materials of a country and year, for the tabs whose rows carry no material group (Rates, Review): read once per country and year from BudHistSet
 * (ROH rows with their Matkl). `segmentOf(matnr)` is 'Perfume' for those and 'Raw Material' for the rest; `ready` is false until read (or when it failed).
 */
const perfumeCache = new Map<string, Promise<Set<string>>>();
export function usePerfume(land1: string, gjahr: string) {
  const [state, setState] = useState<{ set: Set<string> | null; error: string }>({ set: null, error: '' });
  useEffect(() => {
    if (!land1 || !/^\d{4}$/.test(gjahr)) return;
    let live = true; const k = `${land1}|${gjahr}`;
    setState({ set: null, error: '' });
    let p = perfumeCache.get(k);
    if (!p) { p = fetchPerfumeMaterials(land1, gjahr); perfumeCache.set(k, p); p.catch(() => perfumeCache.delete(k)); }
    p.then((set) => live && setState({ set, error: '' }), (x) => live && setState({ set: null, error: errorText(x) }));
    return () => { live = false; };
  }, [land1, gjahr]);
  return { ready: !!state.set, error: state.error, segmentOf: (matnr: string): Segment => (state.set?.has(stripZeros(matnr)) ? 'Perfume' : 'Raw Material') };
}
