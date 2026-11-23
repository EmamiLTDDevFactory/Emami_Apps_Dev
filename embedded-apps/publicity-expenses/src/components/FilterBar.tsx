'use client';
import { useMemo, useState } from 'react';
import { FilterX, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/lib/context';
import { defaultPeriod, fyLabel, periodLabel, UNIT_LABEL, ytdLabel, type Unit } from '@/lib/format';
import { categoryOf, rangeOf } from '@/lib/model';
import { Button, MultiSelect, Select, cx } from './ui';

/** One row of filters above every screen: period, company, site, report header, category, brand family, unit. */
export default function FilterBar() {
  const { filters, setFilters, all, config, companies, unit, setUnit, reload } = useApp();
  const [more, setMore] = useState(false); // phones: the dimension filters fold away behind one button
  const cur = Number(defaultPeriod().fy);
  const years = [cur + 1, cur, cur - 1, cur - 2, cur - 3].map(String);
  if (!years.includes(filters.fy)) years.push(filters.fy);

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    const known = new Set(config.groups.map((g) => g.id));
    const extraGroups = [...new Set(all.map((r) => r.HeaderGroup))].filter((g) => !known.has(g));
    return {
      groups: [...config.groups.map((g) => ({ value: g.id, label: g.label })), ...extraGroups.map((g) => ({ value: g, label: g }))],
      categories: uniq(all.map(categoryOf)),
      brands: uniq((filters.categories.length ? all.filter((r) => filters.categories.includes(categoryOf(r))) : all).map(rangeOf)),
    };
  }, [all, config, filters.categories]);

  const active = filters.site.length + filters.groups.length + filters.categories.length + filters.brands.length;
  return (
    <div className="rounded-2xl border border-line bg-panel p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Fiscal year" value={filters.fy} onChange={(v) => setFilters({ fy: v })} options={years.map((y) => ({ value: y, label: fyLabel(y) }))} className="w-[6.5rem]" />
        <Select label="YTD up to period" value={String(filters.period)} onChange={(v) => setFilters({ period: Number(v) })}
          options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `P${String(i + 1).padStart(2, '0')} · ${periodLabel(filters.fy, i + 1)}` }))} className="w-[9.75rem]" />
        <Select label="Amounts in" value={unit} onChange={(v) => setUnit(v as Unit)} options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} className="w-[7rem]" />
        <Button size="sm" className="sm:hidden" variant={active ? 'primary' : 'secondary'} onClick={() => setMore((m) => !m)} aria-expanded={more}><SlidersHorizontal size={14} /> Filters{active ? ` (${active})` : ''}</Button>
        <div className={cx('w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center', more ? 'grid' : 'hidden')}>
          {companies.length > 1 && (
            <Select label="Company code" value={filters.company} onChange={(v) => setFilters({ company: v })} options={[{ value: '', label: 'All companies' }, ...companies.map((c) => ({ value: c, label: c }))]} className="w-full sm:w-[9rem]" />
          )}
          <MultiSelect label="Site" values={filters.site} onChange={(v) => setFilters({ site: v })} options={[{ value: 'HO', label: 'HO' }, { value: 'UN', label: 'Units' }]} className="sm:w-[8.5rem]" />
          <MultiSelect label="Header" values={filters.groups} onChange={(v) => setFilters({ groups: v })} options={opts.groups} className="sm:w-[11rem]" align="right" />
          <MultiSelect label="Category" values={filters.categories} onChange={(v) => setFilters({ categories: v, brands: [] })} options={opts.categories} className="sm:w-[12rem]" />
          <MultiSelect label="Brand" values={filters.brands} onChange={(v) => setFilters({ brands: v })} options={opts.brands} className="sm:w-[12rem]" align="right" />
        </div>
        <div className="hidden flex-1 sm:block" />
        {active > 0 && <Button size="sm" variant="ghost" onClick={() => setFilters({ site: [], groups: [], categories: [], brands: [] })}><FilterX size={14} /> Clear</Button>}
        <Button size="sm" onClick={reload} title="Read SAP again (skips the 10-minute server cache)" aria-label="Refresh"><RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span></Button>
      </div>
      <p className="mt-2 text-2xs text-muted">
        <span className="font-bold text-ink">{ytdLabel(filters.fy, filters.period)}</span> vs {ytdLabel(Number(filters.fy) - 1, filters.period)} · budget {fyLabel(filters.fy)} · amounts in {UNIT_LABEL[unit]}
      </p>
    </div>
  );
}
