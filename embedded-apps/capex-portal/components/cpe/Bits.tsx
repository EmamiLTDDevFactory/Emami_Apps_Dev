'use client';
import type { ReactNode } from 'react';
import { Chip, type Tone } from '@/components/ui';
import { irrTone, npvTone, paybackTone, inLakhs, num, yesNo, fmtDays } from '@/lib/format';
import { fmtIrr, fmtNpv, fmtPayback, type VendorView } from './logic';
import { useList } from '@/lib/useData';
import type { DoaRule } from '@/lib/entities';

/** The Fiori MessageStrip. */
export function Strip({ tone = 'info', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  const c = {
    neutral: 'border-sap-line bg-[#F6F7FD] text-sap-ink', info: 'border-blue-200 bg-blue-50 text-blue-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900', error: 'border-red-200 bg-red-50 text-red-800',
  }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-[12px] ${c} ${className}`}>{children}</div>;
}

/** Live DOA matrix with chains (DoaRuleSet?$expand=DoaRuleToChain), for the Approval Route preview. */
export function useDoaRules() {
  return useList<DoaRule>('DoaRuleSet', { $expand: 'DoaRuleToChain' });
}

const GOOD: Record<string, string> = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', none: 'text-sap-muted' };

export function MetricTiles({ irr, npv, payback }: { irr: number | null; npv: number | null; payback: number | null }) {
  const tiles = [
    { label: 'IRR', value: fmtIrr(irr), tone: irrTone(irr) },
    { label: 'NPV', value: fmtNpv(npv), tone: npvTone(npv) },
    { label: 'Payback', value: fmtPayback(payback), tone: paybackTone(payback) },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-sap-line bg-white/70 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-sap-muted">{t.label}</div>
          <div className={`font-display text-xl font-extrabold ${GOOD[t.tone]}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

export function RankChip({ rank }: { rank: string }) {
  return rank ? <Chip tone={rank === 'L1' ? 'info' : 'neutral'}>{rank}</Chip> : <span className="text-sap-muted">-</span>;
}

/** Read-only vendor comparison table (Evaluation and CPEDetail scorecard). TCO / Quality columns stay hidden (log #138). */
export function VendorScorecard({ vendors, select }: { vendors: VendorView[]; select?: { onPick: (id: string) => void } }) {
  return (
    <div className="scroll-glass overflow-x-auto">
      <table className="glass-table w-full min-w-[520px] border-separate border-spacing-0 text-[12px]">
        <thead>
          <tr>
            {select && <th className="w-10 px-3 py-2 text-center text-[11px] font-bold">Select</th>}
            <th className="w-16 px-3 py-2 text-left text-[11px] font-bold">Rank</th>
            <th className="px-3 py-2 text-left text-[11px] font-bold">Vendor</th>
            <th className="px-3 py-2 text-right text-[11px] font-bold">Quote</th>
            <th className="hidden px-3 py-2 text-right text-[11px] font-bold sm:table-cell">Delivery</th>
            <th className="hidden px-3 py-2 text-left text-[11px] font-bold md:table-cell">Warranty</th>
            {!select && <th className="w-28 px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {vendors.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-sap-muted">No vendor quotes on this CPE.</td></tr>}
          {vendors.map((v) => (
            <tr key={v.id} className={`border-b border-sap-line ${v.selected ? 'bg-emerald-50/60' : ''} ${select ? 'cursor-pointer' : ''}`} onClick={select ? () => select.onPick(v.id) : undefined}>
              {select && <td className="border-b border-sap-line px-3 py-2 text-center"><input type="radio" name="vendorPick" aria-label={`Select ${v.name}`} checked={v.selected} onChange={() => select.onPick(v.id)} /></td>}
              <td className="border-b border-sap-line px-3 py-2"><RankChip rank={v.rank} /></td>
              <td className="border-b border-sap-line px-3 py-2 font-semibold">{v.name}</td>
              <td className="border-b border-sap-line px-3 py-2 text-right tabular-nums">{inLakhs(v.quote)}</td>
              <td className="hidden border-b border-sap-line px-3 py-2 text-right tabular-nums sm:table-cell">{v.deliveryDays} d</td>
              <td className="hidden border-b border-sap-line px-3 py-2 md:table-cell">{v.warrantyMonths} mo</td>
              {!select && <td className="border-b border-sap-line px-3 py-2 text-right">{v.selected && <Chip tone="success">Selected</Chip>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vendor cards of CPEDetail (rank, name, price, delivery, warranty, GST). */
export function VendorCards({ vendors }: { vendors: VendorView[] }) {
  if (!vendors.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {vendors.map((v) => (
        <div key={v.id} className={`rounded-xl border px-4 py-3 ${v.selected ? 'border-emerald-400 bg-emerald-50/60' : v.rank === 'L1' ? 'border-blue-300 bg-blue-50/40' : 'border-sap-line bg-white/70'}`}>
          <div className="text-[11px] font-extrabold text-plum">{v.rank || '-'}</div>
          <div className="text-[13px] font-extrabold text-sap-ink">{v.name}</div>
          <div className="mt-1 font-display text-lg font-extrabold">{inLakhs(v.quote)}</div>
          <div className="text-[11px] text-sap-muted">{v.deliveryDays} days</div>
          <div className="mt-2 flex justify-between text-[11.5px]"><span className="text-sap-muted">Warranty</span><span className="font-semibold">{v.warrantyMonths} months</span></div>
          <div className="flex justify-between text-[11.5px]"><span className="text-sap-muted">GST compliant</span><Chip tone={v.gstCompliant ? 'success' : 'error'}>{yesNo(v.gstCompliant)}</Chip></div>
          {v.selected && <div className="mt-2"><Chip tone="success">Selected</Chip></div>}
        </div>
      ))}
    </div>
  );
}

export { fmtDays, num };
