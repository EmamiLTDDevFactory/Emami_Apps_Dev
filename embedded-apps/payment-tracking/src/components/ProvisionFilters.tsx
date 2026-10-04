'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal, X, XCircle } from 'lucide-react';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';
import { cx } from './ui';

type DimensionKey = 'status' | 'costCenter' | 'vendor' | 'glAccount' | 'poCreator' | 'country';

export interface ProvisionFilterState {
  search: string;
  status: string[];
  costCenter: string[];
  vendor: string[];
  glAccount: string[];
  poCreator: string[];
  /** Land1 — client-side only, never sent to SAP (see paymentTrackingApi.ts's header comment on
   * why: the ABAP doesn't honor a Land1 $filter yet, unlike the other dimensions here). */
  country: string[];
}

export const EMPTY_PROVISION_FILTERS: ProvisionFilterState = {
  search: '',
  status: [],
  costCenter: [],
  vendor: [],
  glAccount: [],
  poCreator: [],
  country: [],
};

export function countActiveProvisionFilters(f: ProvisionFilterState): number {
  return (
    f.status.length +
    f.costCenter.length +
    f.vendor.length +
    f.glAccount.length +
    f.poCreator.length +
    f.country.length +
    (f.search.trim() ? 1 : 0)
  );
}

/** Applied everywhere Dashboard/Provision Details feed rows into their KPIs, charts, and tile
 * groupings — a filtered-out row disappears from every one of those consistently, since they all
 * read from the same filtered array rather than filtering independently. */
export function applyProvisionFilters(rows: PaymentTrackingRow[], f: ProvisionFilterState): PaymentTrackingRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status.length && !f.status.includes(r.status)) return false;
    if (f.costCenter.length && !f.costCenter.includes(r.costCenter)) return false;
    if (f.vendor.length && !f.vendor.includes(r.vendor)) return false;
    if (f.glAccount.length && !f.glAccount.includes(r.glAccount)) return false;
    if (f.poCreator.length && !f.poCreator.includes(r.poCreator)) return false;
    if (f.country.length && !f.country.includes(r.country)) return false;
    if (q) {
      const haystack = `${r.poNumber} ${r.vendor} ${r.vendorName} ${r.serviceText} ${r.costCenter} ${r.costCenterText} ${r.country}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

interface Option {
  value: string;
  label: string;
  count: number;
}

function optionsFor(rows: PaymentTrackingRow[], keyOf: (r: PaymentTrackingRow) => string, labelOf: (r: PaymentTrackingRow) => string): Option[] {
  const byKey = new Map<string, Option>();
  for (const r of rows) {
    const value = keyOf(r);
    if (!value) continue;
    const cur = byKey.get(value) ?? { value, label: labelOf(r) || value, count: 0 };
    cur.count += 1;
    byKey.set(value, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

// The standard KPI dimensions this data supports — same fields the Dashboard breaks pending value
// down by and Provision Details groups tiles by, so "filter by a standard KPI" means exactly these.
const FILTER_DIMENSIONS: { key: DimensionKey; title: string; keyOf: (r: PaymentTrackingRow) => string; labelOf: (r: PaymentTrackingRow) => string }[] = [
  { key: 'status', title: 'Status', keyOf: (r) => r.status, labelOf: (r) => r.statusText || r.status },
  { key: 'costCenter', title: 'Cost Center', keyOf: (r) => r.costCenter, labelOf: (r) => [r.costCenter, r.costCenterText].filter(Boolean).join(' · ') },
  { key: 'vendor', title: 'Vendor', keyOf: (r) => r.vendor, labelOf: (r) => [r.vendor, r.vendorName].filter(Boolean).join(' · ') },
  { key: 'glAccount', title: 'GL Code', keyOf: (r) => r.glAccount, labelOf: (r) => [r.glAccount, r.glAccountText].filter(Boolean).join(' · ') },
  { key: 'poCreator', title: 'PO Creator', keyOf: (r) => r.poCreator, labelOf: (r) => r.poCreator },
  { key: 'country', title: 'Country', keyOf: (r) => r.country, labelOf: (r) => r.country },
];

/** One dimension's option list (multi-select, with per-value row counts) — the body of that
 * dimension's dropdown in the toolbar. */
function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-2">
        <span className="text-2xs font-bold uppercase tracking-[0.06em] text-inkSoft">{title}</span>
        {selected.length > 0 ? <span className="text-2xs font-bold text-rust">{selected.length} selected</span> : null}
      </div>

      {options.length === 0 ? (
        <p className="px-2.5 pb-2.5 text-xs text-inkSoft">No values in the current data.</p>
      ) : (
        <>
          {options.length > 8 ? (
            <div className="px-2 pb-1.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}…`}
                className="input h-[26px] text-xs"
              />
            </div>
          ) : null}
          <div className="max-h-[280px] overflow-y-auto px-1 pb-1">
            {filtered.map((o) => {
              const active = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  aria-label={o.label}
                  aria-pressed={active}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors',
                    active ? 'bg-rust/10 font-bold text-rust' : 'text-ink hover:bg-cream'
                  )}
                >
                  <span className={cx('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', active ? 'border-rust bg-rust text-white' : 'border-border bg-white')}>
                    {active ? <Check size={10} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{o.label}</span>
                  <span className={cx('num shrink-0 rounded-full px-1.5 text-2xs font-bold', active ? 'bg-rust/15' : 'bg-appBg text-inkSoft')}>{o.count}</span>
                </button>
              );
            })}
            {filtered.length === 0 ? <p className="px-1.5 py-1 text-xs text-inkSoft">No matches for &quot;{query}&quot;.</p> : null}
          </div>
        </>
      )}
    </div>
  );
}

interface ProvisionFilterBarProps {
  /** Unfiltered rows — option lists and their counts are computed from this, not from the already
   * filtered result, so a value doesn't disappear from the picker just because selecting it (or
   * another filter) narrowed the list to zero rows containing it. */
  rows: PaymentTrackingRow[];
  value: ProvisionFilterState;
  onChange: (next: ProvisionFilterState) => void;
  /** Row count after filtering, for the "Showing X of Y" line. */
  resultCount: number;
}

/** Filter toolbar shared by Dashboard and Provision Details ("the report") — free-text search plus
 * one dropdown per standard KPI dimension (Status, Cost Center, Vendor, GL Code, PO Creator,
 * Country) as multi-select lists with counts. Active filters also render as a removable chip row
 * right under the bar so what's narrowing the view is always visible, not hidden inside a closed
 * dropdown. */
export function ProvisionFilterBar({ rows, value, onChange, resultCount }: ProvisionFilterBarProps) {
  // Which dimension's dropdown is open (null = none). Replaces the original's single open/closed
  // "Filters" sheet; the same toggle/clear handlers drive it.
  const [open, setOpen] = useState<DimensionKey | null>(null);
  const activeCount = countActiveProvisionFilters(value);
  const rootRef = useRef<HTMLDivElement>(null);

  const dimensionOptions = useMemo(
    () => FILTER_DIMENSIONS.map((d) => ({ ...d, options: optionsFor(rows, d.keyOf, d.labelOf) })),
    [rows]
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (dimKey: DimensionKey, optValue: string) => {
    const current = value[dimKey];
    const next = current.includes(optValue) ? current.filter((v) => v !== optValue) : [...current, optValue];
    onChange({ ...value, [dimKey]: next });
  };

  const removeChip = (dimKey: DimensionKey, optValue: string) => {
    onChange({ ...value, [dimKey]: value[dimKey].filter((v) => v !== optValue) });
  };

  const clearAllDimensions = () => {
    onChange({ ...value, status: [], costCenter: [], vendor: [], glAccount: [], poCreator: [], country: [] });
  };

  const activeChips: { dimKey: DimensionKey; value: string; label: string }[] = [];
  for (const dim of dimensionOptions) {
    for (const selectedValue of value[dim.key]) {
      const opt = dim.options.find((o) => o.value === selectedValue);
      activeChips.push({ dimKey: dim.key, value: selectedValue, label: opt ? opt.label : selectedValue });
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[180px] flex-1 basis-[240px]">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
          <input
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            placeholder="Search PO number, vendor, service text, cost center…"
            className="input pl-7 pr-7"
          />
          {value.search ? (
            <button
              type="button"
              onClick={() => onChange({ ...value, search: '' })}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-inkFaint hover:text-ink"
            >
              <XCircle size={14} />
            </button>
          ) : null}
        </div>

        <span className="hidden items-center gap-1 pl-1 text-inkFaint sm:inline-flex" aria-hidden>
          <SlidersHorizontal size={13} />
        </span>

        {dimensionOptions.map((dim) => {
          const n = value[dim.key].length;
          const isOpen = open === dim.key;
          return (
            <div key={dim.key} className="relative">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : dim.key)}
                aria-expanded={isOpen}
                aria-label={`Filter by ${dim.title}`}
                className={cx(
                  'inline-flex h-[30px] items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold transition-colors',
                  n > 0 ? 'border-rust/40 bg-rust/10 text-rust' : 'border-border bg-white text-ink hover:border-rust/40 hover:bg-cream',
                  isOpen && 'ring-2 ring-rust/15'
                )}
              >
                {dim.title}
                {n > 0 ? <span className="num rounded-full bg-rust px-1.5 text-2xs font-bold text-white">{n}</span> : null}
                <ChevronDown size={12} className={cx('transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen ? (
                <div className="absolute left-0 top-[34px] z-30 w-[min(300px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border bg-white shadow-pop animate-slideUp">
                  <FilterSection
                    title={dim.title}
                    options={dim.options}
                    selected={value[dim.key]}
                    onToggle={(v) => toggle(dim.key, v)}
                  />
                  <div className="flex items-center justify-between border-t border-line bg-cream/50 px-2.5 py-1.5">
                    <button type="button" onClick={clearAllDimensions} aria-label="Clear all filters" className="text-xs font-semibold text-inkSoft underline hover:text-ink">
                      Clear all
                    </button>
                    <button type="button" onClick={() => setOpen(null)} aria-label="Done" className="btn-primary btn-sm">Done</button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-inkSoft">
          Showing <span className="num font-bold text-ink">{resultCount}</span> of <span className="num">{rows.length}</span> line item{rows.length === 1 ? '' : 's'}
          {activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : ''}
        </span>
        {activeChips.length > 0 ? (
          <>
            {activeChips.map((c) => (
              <button
                key={`${c.dimKey}-${c.value}`}
                type="button"
                onClick={() => removeChip(c.dimKey, c.value)}
                aria-label={`Remove filter ${c.label}`}
                className="inline-flex max-w-[240px] items-center gap-1 rounded-full bg-rust/10 px-2 py-[2px] text-2xs font-bold text-rust transition-colors hover:bg-rust/20"
              >
                <span className="truncate">{c.label}</span>
                <X size={10} className="shrink-0" />
              </button>
            ))}
            <button type="button" onClick={clearAllDimensions} aria-label="Clear all filters" className="text-2xs font-bold text-inkSoft underline hover:text-ink">
              Clear all
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
