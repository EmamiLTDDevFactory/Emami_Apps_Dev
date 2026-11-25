'use client';
import type { ReactNode } from 'react';
import { Card, Chip, type Tone } from '@/components/ui';

/** Hero banner (ApprovalDetail / BudgetApprovalDetail "zcpxHero"). */
export function Hero({ id, title, line, amountLabel, amount, badge }: { id: string; title: string; line: string; amountLabel: string; amount: string; badge: { tone: Tone; text: string } }) {
  return (
    <div className="page-banner mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl px-5 py-4">
      <div className="min-w-0">
        <h1 className="font-display text-lg font-extrabold leading-tight">{id}</h1>
        <p className="text-[13px] text-white/85">{title}</p>
        <p className="mt-1 text-[12px] text-white/75">{line}</p>
      </div>
      <div className="text-right">
        <p className="text-[11px] text-white/75">{amountLabel}</p>
        <p className="font-display text-xl font-extrabold">{amount}</p>
        <div className="mt-1 inline-block rounded-md bg-white/95 px-0.5"><Chip tone={badge.tone}>{badge.text}</Chip></div>
      </div>
    </div>
  );
}

export function Metric({ label, value, foot, tone }: { label: string; value: string; foot?: string; tone?: 'good' | 'warn' | 'bad' | 'none' }) {
  const c = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-700' : 'text-sap-ink';
  return (
    <div className="rounded-lg border border-sap-line bg-white/60 px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-sap-muted">{label}</div>
      <div className={`font-display text-lg font-extrabold ${c}`}>{value}</div>
      {foot && <div className="text-[11px] text-sap-muted">{foot}</div>}
    </div>
  );
}

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return <Card title={title} hint={hint} className="mb-4">{children}</Card>;
}

export const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : '-');
export const irrText = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : Number(v).toFixed(1) + '%');
export const paybackText = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? '—' : Number(v).toFixed(1) + ' yrs');
