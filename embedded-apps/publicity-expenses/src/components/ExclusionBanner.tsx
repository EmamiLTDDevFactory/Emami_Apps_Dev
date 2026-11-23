'use client';
/** One line under the filters: what the exclusion rules take out of this period, with a switch to see the report without them. */
import { useState } from 'react';
import { EyeOff, Eye, FilterX } from 'lucide-react';
import { useApp } from '@/lib/context';
import { pctPlain, share, short } from '@/lib/format';
import { cx } from './ui';

export default function ExclusionBanner() {
  const { meta, filters, setFilters, all, go, me } = useApp();
  const [open, setOpen] = useState(false);
  const ex = meta?.exclusions;
  if (!filters.excl) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] font-medium text-warn" role="status">
        <Eye size={14} /> Showing the report <b>without</b> the exclusion rules (for checking only).
        <button type="button" onClick={() => setFilters({ excl: true })} className="ml-auto rounded-lg border border-warn/40 bg-panel px-2 py-0.5 text-2xs font-bold hover:bg-warn/10">Apply exclusions</button>
      </div>
    );
  }
  if (!ex || !ex.rules) return null;
  const glTotal = all.reduce((s, r) => s + r.CYYTDAmount, 0) + ex.cy;
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12.5px] shadow-card" data-testid="exclusion-banner">
      <div className="flex flex-wrap items-center gap-2">
        <FilterX size={14} className="text-accent" />
        <span>
          <b>{ex.rules} exclusion rule{ex.rules === 1 ? '' : 's'}</b> in force remove <b className="num">{short(ex.cy)}</b> CY YTD
          <span className="text-muted"> ({pctPlain(share(ex.cy, glTotal))} of the G/L) and {short(ex.py)} PY · {ex.lines} lines</span>
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-2xs font-bold text-accent hover:underline" aria-expanded={open}>{open ? 'Hide rules' : 'Which rules?'}</button>
        <div className="ml-auto flex gap-1.5">
          {me.admin && <button type="button" onClick={() => go('settings')} className="rounded-lg border border-line px-2 py-0.5 text-2xs font-bold text-muted hover:bg-sunken hover:text-ink">Manage</button>}
          <button type="button" onClick={() => setFilters({ excl: false })} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-2xs font-bold text-muted hover:bg-sunken hover:text-ink"><EyeOff size={12} /> Show without</button>
        </div>
      </div>
      {open && (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {ex.byRule.map((r) => (
            <li key={r.id} className={cx('flex flex-wrap items-center gap-2 py-1.5 text-2xs', !r.cy && 'text-muted')}>
              <span className="rounded bg-sunken px-1.5 py-px font-bold">#{r.id}</span>
              <span className="font-semibold">{r.dimension.replace('_', ' ').toLowerCase()}</span>
              <span className="min-w-0 flex-1 truncate" title={r.reason}>{r.reason}</span>
              <span className="num font-bold">{short(r.cy)}</span>
              <span className="num text-muted">{r.lines} lines</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
