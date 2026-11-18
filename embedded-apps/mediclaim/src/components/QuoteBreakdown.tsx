'use client';

import { fmtRs } from '../lib/format';
import type { QuoteResult } from '../lib/types';
import { Section } from './ui';

/** Premium split from the live QuoteSet answer. Display only: SAP recomputes everything on submit. */
export default function QuoteBreakdown({ quote, busy, error }: { quote: QuoteResult | null; busy: boolean; error: string }) {
  const rows: [string, number | undefined, boolean?][] = [
    ['Base policy premium', quote?.PreBase],
    ['Top up policy premium', quote?.TopUpPre],
    ['Total premium', quote?.TotalPre, true],
    ["Employee's share", quote?.EmpShare, true],
    ["Employer's share", quote?.EmployerShare],
  ];
  return (
    <Section title="Premium" note="Calculated by SAP after every change" right={busy ? <span className="text-[11px] font-semibold text-inkSoft">Calculating...</span> : undefined}>
      {error && (
        <p className="mb-2 rounded-lg border border-red/30 bg-redBg px-2.5 py-1.5 text-[12.5px] font-semibold text-red" role="alert">{error}</p>
      )}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map(([label, v, strong]) => (
          <div key={label} className="rounded-lg bg-cream px-3 py-2">
            <dt className="field-label">{label}</dt>
            <dd className={`mt-0.5 tabular-nums ${strong ? 'text-[15px] font-extrabold text-ink' : 'text-[13.5px] font-semibold text-ink'}`}>
              {v === undefined || error ? '-' : fmtRs(v)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
