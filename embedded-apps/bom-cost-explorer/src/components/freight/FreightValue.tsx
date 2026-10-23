'use client';
/**
 * Wraps an existing freight value in a button that opens the freight break-up. The value itself is rendered by
 * the caller unchanged (same text, format, cell width and alignment). No wrapper - and no request, no extra code -
 * when the flag is off, when the run's freight settings are not known, or when the value is zero.
 * The panel code is loaded with next/dynamic on the first click; nothing is requested on load or hover.
 */
import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import { FREIGHT_BREAKUP_ENABLED, type FreightRun } from '@/lib/freight/breakup';
import { D } from '@/lib/cost/decimal';

const Popover = dynamic(() => import('./FreightBreakup'), { ssr: false });
const Panel = dynamic(() => import('./FreightBreakup').then((m) => m.FreightBreakupPanel), { ssr: false, loading: () => <p className="text-xs text-muted">Loading…</p> });

const hasFreight = (line: CostLine, value?: string) => !D(value ?? line.FrtPcLoc).isZero() || !D(line.FrtPcInr).isZero();

export function FreightValue({ line, run, value, children }: { line: CostLine; run?: FreightRun | null; value?: string; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  if (!FREIGHT_BREAKUP_ENABLED || !run || !hasFreight(line, value)) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        aria-label="Show freight break-up"
        className="m-0 inline cursor-pointer border-0 bg-transparent p-0 text-inherit [font:inherit] decoration-dotted underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget.getBoundingClientRect()); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      >
        {children}
      </button>
      {anchor && <Popover line={line} run={run} anchor={anchor} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** Collapsed "Freight break-up" section for the row drawer; loads on expand. */
export function FreightBreakupSection({ line, run }: { line: CostLine; run?: FreightRun | null }) {
  const [open, setOpen] = useState(false);
  if (!FREIGHT_BREAKUP_ENABLED || !run || !line.FrtSrc || !hasFreight(line)) return null;
  return (
    <section className="mb-5">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mb-2 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-muted hover:text-ink">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Freight break-up
      </button>
      {open && <Panel line={line} run={run} compactTitle />}
    </section>
  );
}
