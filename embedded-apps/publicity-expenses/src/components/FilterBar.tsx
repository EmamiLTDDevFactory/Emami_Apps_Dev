'use client';
import { useMemo, useState } from 'react';
import { FilterX, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/lib/context';
import { defaultPeriod, fyLabel, range, UNIT_LABEL, ytdLabel, type Unit } from '@/lib/format';
import { categoryOf, rangeOf } from '@/lib/model';
import PeriodPicker from './PeriodPicker';
import { Button, MultiSelect, Select, cx } from './ui';

/**
 * One row of filters above every screen. Fiscal year and unit pick one value; everything else picks any number:
 * periods (added up; P01..Pn = YTD), company codes (empty = all), site, report header, category, brand family, G/L.
 */
export default function FilterBar() {
  const { filters, setFilters, all, config, companies, unit, setUnit, reload, sel } = useApp();
  const [more, setMore] = useState(false); // phones: the dimension filters fold away behind one button
  const cur = Number(defaultPeriod().fy);
  const years = [cur + 1, cur, cur - 1, cur - 2, cur - 3].map(String);
  if (!years.includes(filters.fy)) years.push(filters.fy);

  const opts = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    const known = new Set(config.groups.map((g) => g.id));
    const extraGroups = [...new Set(all.map((r) => r.HeaderGroup))].filter((g) => !known.has(g));
    const gls = new Map<string, string>();
    for (const r of all) if (r.GLAccount && !gls.has(r.GLAccount)) gls.set(r.GLAccount, r.GLAccountName);
    return {
      groups: [...config.groups.map((g) => ({ value: g.id, label: g.label })), ...extraGroups.map((g) => ({ value: g, label: g }))],
      categories: uniq(all.map(categoryOf)),
      brands: uniq((filters.categories.length ? all.filter((r) => filters.categories.includes(categoryOf(r))) : all).map(rangeOf)),
      // Keep picked G/L accounts in the list even when the selection has no postings on them.
      gls: [...new Set([...gls.keys(), ...filters.gls])].sort().map((g) => ({ value: g, label: `${g.replace(/^0+/, '')} · ${gls.get(g) ?? 'no postings in this selection'}` })),
    };
  }, [all, config, filters.categories, filters.gls]);

  const active = filters.site.length + filters.groups.length + filters.categories.length + filters.brands.length + filters.gls.length;
  // One period other than P01 picked: offer the MIS year-to-date up to it in one click.
  const ytdNudge = sel.n === 1 && sel.latest > 1;
  return (
    <div className="rounded-2xl border border-line bg-panel p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Fiscal year" value={filters.fy} onChange={(v) => setFilters({ fy: v })} options={years.map((y) => ({ value: y, label: fyLabel(y) }))} className="w-[6.5rem]" />
        <PeriodPicker fy={filters.fy} value={filters.periods} onChange={(v) => setFilters({ periods: v })} className="w-[11.5rem] sm:w-[12.5rem]" />
        <Select label="Amounts in" value={unit} onChange={(v) => setUnit(v as Unit)} options={(Object.keys(UNIT_LABEL) as Unit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} className="w-[7rem]" />
        <Button size="sm" className="sm:hidden" variant={active ? 'primary' : 'secondary'} onClick={() => setMore((m) => !m)} aria-expanded={more}><SlidersHorizontal size={14} /> Filters{active ? ` (${active})` : ''}</Button>
        {/* Phones: a 2-column grid behind the Filters button; wider screens: the filters flow in the same row (display: contents). */}
        <div className={cx('w-full grid-cols-2 gap-2 sm:contents', more ? 'grid' : 'hidden')}>
          <MultiSelect label="Company" values={filters.companies} onChange={(v) => setFilters({ companies: [...v].sort() })} options={companies.map((c) => ({ value: c, label: c }))} anyLabel="All" className="sm:w-[11rem]" />
          <MultiSelect label="Site" values={filters.site} onChange={(v) => setFilters({ site: v })} options={[{ value: 'HO', label: 'HO' }, { value: 'UN', label: 'Units' }]} className="sm:w-[8.5rem]" />
          <MultiSelect label="Header" values={filters.groups} onChange={(v) => setFilters({ groups: v })} options={opts.groups} className="sm:w-[10.5rem]" align="right" />
          <MultiSelect label="Category" values={filters.categories} onChange={(v) => setFilters({ categories: v, brands: [] })} options={opts.categories} className="sm:w-[11rem]" />
          <MultiSelect label="Brand" values={filters.brands} onChange={(v) => setFilters({ brands: v })} options={opts.brands} className="sm:w-[11rem]" align="right" />
          <MultiSelect label="G/L" values={filters.gls} onChange={(v) => setFilters({ gls: v })} options={opts.gls} className="sm:w-[10rem]" align="right" />
        </div>
        <div className="hidden flex-1 sm:block" />
        {active > 0 && <Button size="sm" variant="ghost" onClick={() => setFilters({ site: [], groups: [], categories: [], brands: [], gls: [] })}><FilterX size={14} /> Clear</Button>}
        <Button size="sm" onClick={reload} title="Read SAP again (skips the 10-minute server cache)" aria-label="Refresh"><RefreshCw size={14} /> <span className="hidden sm:inline">Refresh</span></Button>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-2xs text-muted" data-testid="selection-line">
        <span><span className="font-bold text-ink">{sel.cy}</span> vs {sel.py}{sel.n > 1 && !sel.ytd ? ` (${sel.n} periods added up)` : ''}</span>
        <span>· {filters.companies.length ? `company ${filters.companies.join(', ')}` : 'all companies'}</span>
        <span>· budget {fyLabel(filters.fy)} · amounts in {UNIT_LABEL[unit]}</span>
        {filters.gls.length > 0 && <span className="text-warn">· G/L filter on: budget-only lines are left out</span>}
        {ytdNudge && (
          <button type="button" onClick={() => setFilters({ periods: range(1, sel.latest) })} className="font-bold text-accent hover:underline">
            Show {ytdLabel(filters.fy, sel.latest)} (YTD)
          </button>
        )}
      </p>
    </div>
  );
}
