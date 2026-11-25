'use client';
/**
 * Period filter: pick any set of fiscal periods (checkboxes P01..P12) - the figures are the picked periods added up,
 * CY against the same periods of PY. P01..Pn = the MIS year-to-date. Quick picks apply at once; ticks apply on
 * "Apply" or when the panel closes (Esc cancels), so SAP is read once per change, not once per tick.
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { compactPeriods, currentPeriod, isYtd, periodLabel, QUARTERS, range, selLabel, ytdLabel } from '@/lib/format';
import { cx, inputBase } from './ui';

export default function PeriodPicker({ fy, value, onChange, className, align = 'left' }: {
  fy: string;
  value: number[];
  onChange: (periods: number[]) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(value);
  const box = useRef<HTMLDivElement>(null);
  const cur = currentPeriod();
  // Periods after this one have no postings yet (current fiscal year: this month; a past year: all 12; a future year: none).
  const lastOpen = fy === cur.fy ? cur.period : Number(fy) < Number(cur.fy) ? 12 : 0;

  const apply = (ps: number[]) => {
    const s = [...new Set(ps)].sort((a, b) => a - b);
    if (s.length && compactPeriods(s) !== compactPeriods(value)) onChange(s);
    setOpen(false);
  };
  // Latest draft for the outside-click handler.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => { if (open) setDraft(value); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- fresh draft on open
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) applyRef.current(draftRef.current); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);

  const picked = new Set(draft);
  const toggle = (p: number) => setDraft((d) => (d.includes(p) ? d.filter((x) => x !== p) : [...d, p].sort((a, b) => a - b)));
  const ytdTo = lastOpen || 12;
  const quick: { label: string; title: string; ps: number[] }[] = [
    ...(fy === cur.fy ? [{ label: `This period · ${periodLabel(fy, cur.period)}`, title: 'The current period alone (opens fastest)', ps: [cur.period] }] : []),
    { label: ytdLabel(fy, ytdTo), title: `Year to date: P01 to P${String(ytdTo).padStart(2, '0')} (one SAP read)`, ps: range(1, ytdTo) },
    ...(fy === cur.fy && cur.period > 1 ? [{ label: `Last closed · ${periodLabel(fy, cur.period - 1)}`, title: 'The previous period alone', ps: [cur.period - 1] }] : []),
    ...(fy === cur.fy && cur.period > 2 ? [{ label: ytdLabel(fy, cur.period - 1), title: 'Year to date up to the last closed period', ps: range(1, cur.period - 1) }] : []),
    ...QUARTERS.map((qs, i) => ({ label: `Q${i + 1}`, title: `${periodLabel(fy, qs[0])} - ${periodLabel(fy, qs[2])}`, ps: qs })),
    ...(ytdTo < 12 ? [{ label: 'Full year', title: 'P01 to P12', ps: range(1, 12) }] : []),
  ];
  const isOn = (ps: number[]) => compactPeriods(ps) === compactPeriods(value);

  return (
    <div ref={box} className={cx('relative', className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Periods: ${selLabel(fy, value)}`}
        title={`Periods ${value.map((p) => `P${String(p).padStart(2, '0')}`).join(', ')}`}
        onClick={() => (open ? apply(draft) : setOpen(true))}
        className={cx('flex h-9 w-full items-center gap-1.5 text-left', inputBase, value.length > 1 && 'border-accent/50 bg-accent/[0.04]')}
        data-testid="period-picker"
      >
        <CalendarRange size={13} className="shrink-0 text-accent" />
        <span className="shrink-0 text-2xs font-bold uppercase tracking-wide text-muted">Period</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{selLabel(fy, value)}</span>
        <ChevronDown size={14} className="shrink-0 text-faint" />
      </button>
      {open && (
        <div role="dialog" aria-label="Pick periods" className={cx('absolute z-30 mt-1 w-[19.5rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-2.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0', 'max-sm:fixed max-sm:inset-x-4 max-sm:w-auto max-sm:max-w-none')}>
          <div className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted">Quick pick</div>
          <div className="flex flex-wrap gap-1">
            {quick.map((x) => (
              <button key={x.label} type="button" title={x.title} onClick={() => apply(x.ps)}
                className={cx('rounded-lg border px-2 py-1 text-[11.5px] font-semibold transition', isOn(x.ps) ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink hover:bg-sunken')}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="mb-1.5 mt-3 flex items-center justify-between text-2xs font-bold uppercase tracking-wide text-muted">
            <span>Or tick periods</span>
            <span className="flex gap-2 normal-case tracking-normal">
              <button type="button" className="font-bold text-accent hover:underline" onClick={() => setDraft(range(1, ytdTo))}>Up to P{String(ytdTo).padStart(2, '0')}</button>
              <button type="button" className="font-bold text-accent hover:underline" onClick={() => setDraft([])}>None</button>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {range(1, 12).map((p) => {
              const on = picked.has(p);
              const future = p > lastOpen;
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => toggle(p)} title={future ? 'No postings yet in this period' : undefined}
                  className={cx('flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[12px] transition', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-sunken', future && !on && 'opacity-50')}>
                  <span className={cx('grid h-3.5 w-3.5 shrink-0 place-items-center rounded border', on ? 'border-accent bg-accent text-white' : 'border-line bg-panel')}>{on && <Check size={10} strokeWidth={3} />}</span>
                  <span className="min-w-0"><span className="block font-bold leading-tight">P{String(p).padStart(2, '0')}</span><span className="block text-[10.5px] leading-tight text-muted">{periodLabel(fy, p)}</span></span>
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2">
            <span className="min-w-0 flex-1 text-[11.5px] text-muted">
              {draft.length ? <><b className="text-ink">{selLabel(fy, draft)}</b>{isYtd(draft) ? ' · YTD' : ''}</> : <span className="text-bad">Pick at least one period</span>}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-sunken">Cancel</button>
            <button type="button" disabled={!draft.length} onClick={() => apply(draft)} className="rounded-lg bg-gradient-to-br from-accent to-accent-deep px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Apply</button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-faint">Figures = the ticked periods added up, against the same periods last year. Consecutive periods from P01 are one SAP read (YTD).</p>
        </div>
      )}
    </div>
  );
}
