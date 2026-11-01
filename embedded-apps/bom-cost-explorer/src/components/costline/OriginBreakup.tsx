'use client';
/** Cost breakup by origin group: value, share and a bar per group. SAP's figures added up, nothing re-costed. */
import type { OriginSlice } from '@/lib/cost/originBreakup';
import { NO_ORIGIN } from '@/lib/cost/originBreakup';
import type { Decimal } from '@/lib/cost/decimal';
import { fmtNum } from '@/lib/format';

export default function OriginBreakup({ slices, total, curr, unit, title = 'Cost breakup by origin group', note }: { slices: OriginSlice[]; total: Decimal; curr: string; unit?: string; title?: string; note?: string }) {
  if (!slices.length) return null;
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-panel p-3">
      <h3 className="text-sm font-extrabold">{title}{unit ? <span className="ml-1 text-xs font-normal text-muted">({unit})</span> : null}</h3>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-2xs font-bold uppercase tracking-wide text-muted"><th className="py-1 text-left">Origin group</th><th className="py-1 text-right">Lines</th><th className="py-1 text-right">Value ({curr})</th><th className="py-1 text-right">Share</th><th className="w-1/4 py-1"><span className="sr-only">Bar</span></th></tr></thead>
        <tbody>
          {slices.map((s) => (
            <tr key={s.origin} className="border-t border-line/60">
              <td className={s.origin === NO_ORIGIN ? 'py-1 text-muted' : 'py-1 font-semibold'}>{s.origin}</td>
              <td className="num py-1 text-right">{s.lines}</td>
              <td className="num py-1 text-right">{fmtNum(s.value, 2, curr)}</td>
              <td className="num py-1 text-right">{s.share ? `${s.share.toFixed(1)} %` : 'n/a'}</td>
              <td className="py-1"><div className="h-2 rounded bg-sunken" aria-hidden><div className="h-2 rounded bg-accent" style={{ width: `${Math.max(0, Math.min(100, s.share ? s.share.toNumber() : 0))}%` }} /></div></td>
            </tr>
          ))}
          <tr className="border-t-2 border-line font-bold"><td className="py-1">Total</td><td /><td className="num py-1 text-right">{fmtNum(total, 2, curr)}</td><td className="num py-1 text-right">100 %</td><td /></tr>
        </tbody>
      </table>
    </section>
  );
}
