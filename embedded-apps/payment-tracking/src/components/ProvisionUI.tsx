'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, type LucideIcon } from 'lucide-react';
import { formatValue, type Breakdown } from '../lib/provisionMetrics';
import PaymentTrackingTable from './PaymentTrackingTable';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';
import { Modal, cx } from './ui';

/** Hex values of the Tailwind palette (tailwind.config.ts), for props that take a colour string
 * (`accent`), mirroring the original's `colors.*` tokens so call sites can pass e.g. PT_COLORS.red. */
export const PT_COLORS = {
  rust: '#4F3FD6',
  plum: '#241E3D',
  ink: '#1F1B33',
  inkSoft: '#6B7280',
  red: '#C0392B',
  amber: '#B45309',
  green: '#1F7A4D',
  blue: '#1D6FA5',
  teal: '#0F766E',
  ledger: '#0F766E',
} as const;

/** Window width, starting wide (1200) so the first render matches desktop. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/** Compact page header shared by every Provision Tracking screen (Home, Dashboard, Provision
 * Details…): the eyebrow names where you are, the title is the section, and subtitle is a
 * plain-language description that is never truncated, per instruction that all wording stay
 * clearly visible. Same look as the kit's PageHeader, with the original's `left`/`right` slots. */
export function ProvisionHero({
  eyebrow,
  title,
  subtitle,
  left,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {left}
        <span className="hidden h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-rust to-ledger sm:block" aria-hidden />
        <div className="min-w-0">
          <p className="text-2xs font-bold uppercase tracking-[0.12em] text-rust">{eyebrow}</p>
          <h1 className="text-[17px] font-extrabold leading-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-xs text-inkSoft">{subtitle}</p> : null}
        </div>
      </div>
      {right ? <div className="flex flex-wrap items-center gap-1.5">{right}</div> : null}
    </div>
  );
}

/** Square icon button meant to sit inside ProvisionHero's `left`/`right` slots (e.g. Back). */
export function HeroIconButton({
  icon: Icon,
  onPress,
  label,
}: {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      title={label}
      className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-border bg-white text-ink transition-colors hover:border-rust/40 hover:bg-cream hover:text-rust"
    >
      <Icon size={15} />
    </button>
  );
}

/** Solid action meant to sit inside ProvisionHero's `right` slot (e.g. "Provision Details" from
 * the Dashboard). */
export function HeroActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} aria-label={label} className="btn-primary btn-sm">
      <span className="truncate">{label}</span>
      <ArrowRight size={12} />
    </button>
  );
}

/** One dense stat tile — used on Home and Dashboard so both "command center" screens share the
 * exact same KPI look. Label is a full description, never clipped, so what the number means is
 * always legible. Pass `onPress` to make it clickable (Dashboard opens the underlying rows in a
 * pop-up) — a small chevron signals it's interactive; without `onPress` it renders as a plain,
 * inert tile (Home's KPIs are informational only). `accent` is a colour string (hex). */
export function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: string;
  onPress?: () => void;
}) {
  const color = accent || PT_COLORS.rust;
  const body = (
    <>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <Icon size={12} style={{ color }} className="shrink-0" />
          <p className="text-2xs font-bold uppercase leading-tight tracking-[0.06em] text-inkSoft">{label}</p>
        </div>
        <p className="num mt-1 text-[18px] font-extrabold leading-none text-ink">{value}</p>
      </div>
      {onPress ? <ChevronRight size={14} className="shrink-0 text-inkFaint transition-transform group-hover:translate-x-0.5 group-hover:text-rust" /> : null}
    </>
  );
  const base = 'group relative flex min-w-[160px] flex-1 items-center gap-2 overflow-hidden rounded-xl border border-border bg-white py-2.5 pl-3.5 pr-2.5 text-left shadow-card';
  if (onPress) {
    return (
      <button type="button" onClick={onPress} aria-label={`${label}: ${value}`} className={cx(base, 'transition-all hover:-translate-y-[1px] hover:border-rust/40 hover:shadow-lift')}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** Horizontal bar breakdown (pending value by status / cost center / vendor, etc.) — labels wrap
 * onto a second line instead of being clipped, since cost center and status descriptions can run
 * long and every word needs to stay readable. Pass `onSelect` to make each row clickable
 * (Dashboard opens the rows behind that slice in a pop-up) — a chevron signals it's interactive,
 * same affordance as the clickable KpiCard. */
export function HorizontalBarBreakdown({
  data,
  emptyMessage,
  onSelect,
}: {
  data: Breakdown[];
  emptyMessage: string;
  onSelect?: (item: Breakdown) => void;
}) {
  // Below ~480px, a fixed label column leaves almost nothing for the bar itself — stack the label
  // above the bar+value instead of squashing them into one row.
  const width = useWindowWidth();
  const isNarrow = width < 480;

  if (data.length === 0) {
    return <p className="mt-2 text-sm text-inkSoft">{emptyMessage}</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex flex-col gap-1">
      {data.map((d) => {
        const inner = (
          <>
            <div className={cx('min-w-0 text-xs leading-4 text-ink', isNarrow ? 'w-full' : 'w-[170px] shrink-0')}>
              {d.label}{d.sublabel ? <span className="text-inkSoft">{` · ${d.sublabel}`}</span> : ''}
            </div>
            <div className={cx('flex items-center gap-2', !isNarrow && 'min-w-0 flex-1')}>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-appBg">
                <div className="h-full rounded-full bg-gradient-to-r from-rust to-rustLight" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <span className="w-[22px] shrink-0 text-right text-2xs font-semibold text-inkFaint num" title={`${d.count} line item${d.count === 1 ? '' : 's'}`}>{d.count}</span>
              <span className="num w-[74px] shrink-0 truncate text-right text-xs font-bold text-ink">{formatValue(d.value)}</span>
              {onSelect ? <ChevronRight size={13} className="shrink-0 text-inkFaint group-hover:text-rust" /> : null}
            </div>
          </>
        );
        const rowCls = cx('group flex w-full gap-2 rounded-md px-1.5 py-1 text-left', isNarrow ? 'flex-col items-stretch gap-1' : 'items-center');
        return onSelect ? (
          <button
            key={d.key}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={`${d.label}: ${formatValue(d.value)}`}
            className={cx(rowCls, 'transition-colors hover:bg-cream')}
          >
            {inner}
          </button>
        ) : (
          <div key={d.key} className={rowCls}>{inner}</div>
        );
      })}
    </div>
  );
}

/** Clickable section-chooser card (Home's quick links, Provision Details' "how to browse" choice)
 * — subtitle always wraps in full since it's the explanatory copy that says what the section does.
 * `accent` (hex) colours the icon box, top stripe, and CTA so each choice reads as visually
 * distinct instead of every card looking identical. */
export function OptionCard({
  icon: Icon,
  title,
  subtitle,
  onPress,
  accent = PT_COLORS.rust,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onPress: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={title}
      className="group relative flex min-w-[220px] flex-1 basis-[220px] items-start gap-2.5 overflow-hidden rounded-xl2 border border-border bg-white p-3 text-left shadow-card transition-all hover:-translate-y-[1px] hover:shadow-lift"
      style={{ borderTopColor: accent, borderTopWidth: 3 }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${accent}18`, color: accent }}>
        <Icon size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-extrabold text-ink">{title}</span>
        <span className="mt-0.5 text-xs text-inkSoft">{subtitle}</span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold" style={{ color: accent }}>
          Open <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  );
}

/** Generic "here are the rows behind that number" pop-up — used by Dashboard's clickable KpiCards
 * so every stat can answer "which POs/lines is this counting?" with the same shared line-item table
 * Upcoming/Missed/Provision Details already use, instead of a bespoke view per stat. */
export function ProvisionDetailModal({
  title,
  subtitle,
  rows,
  onClose,
}: {
  title: string;
  subtitle?: string;
  rows: PaymentTrackingRow[];
  onClose: () => void;
}) {
  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose} size="xl">
      <PaymentTrackingTable rows={rows} emptyMessage="No items match this stat right now." />
    </Modal>
  );
}
