'use client';
/**
 * Rate sources > "Compare": one row per leaf component, one column per source (rate per piece INR, the
 * cheapest in green, "none" in grey when the source is in the priority but has no rate), and two client-side
 * what-ifs - cheapest source per component and re-pick by a priority you set here. Simulated totals are
 * marked and SAP's total stays next to them.
 */
import { useMemo, useState } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { cheapestWhatIf, repickByPriority, sourceMatrix } from '@/lib/rates/whatif';
import { ALL_RATE_SOURCES, prioLabel } from '@/lib/rates/priority';
import { fmtNum, fmtRate, fmtSigned } from '@/lib/format';
import { SimTag, SourceBadge, cx } from '../ui';
import type { Decimal } from '@/lib/cost/decimal';
import SourcePriorityEditor from './SourcePriorityEditor';

export default function RateCompare({ rows, prio, onOpenRow }: { rows: CostLine[]; prio: string[]; onOpenRow?: (i: number) => void }) {
  const [whatPrio, setWhatPrio] = useState<string[]>(prio);
  const matrix = useMemo(() => sourceMatrix(rows, ALL_RATE_SOURCES), [rows]);
  const cheap = useMemo(() => cheapestWhatIf(rows), [rows]);
  const repick = useMemo(() => repickByPriority(rows, whatPrio), [rows, whatPrio]);
  const repickBy = useMemo(() => new Map(repick.lines.map((l) => [l.idx, l])), [repick]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-3 border-b border-line p-3 lg:grid-cols-[1fr_1fr_280px]">
        <WhatIfCard title="Cheapest source per component" sap={cheap.sapTotal} sim={cheap.simTotal} changed={cheap.changed} />
        <WhatIfCard title={`Re-pick by priority: ${prioLabel(whatPrio)}`} sap={repick.sapTotal} sim={repick.simTotal} changed={repick.changed} />
        <div>
          <p className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">What-if priority (not sent to SAP)</p>
          <SourcePriorityEditor value={whatPrio} onChange={setWhatPrio} compact />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-panel text-[11px] font-bold uppercase tracking-wide text-faint">
            <tr>
              <th className="px-2 py-1.5 text-left">Component</th>
              <th className="px-2 py-1.5 text-left">Header · plant</th>
              <th className="px-2 py-1.5 text-left">SAP used</th>
              {ALL_RATE_SOURCES.map((s) => <th key={s} className="px-2 py-1.5 text-right"><SourceBadge source={s} /></th>)}
              <th className="px-2 py-1.5 text-left">Re-pick <SimTag /></th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((m) => {
              const vals = Object.values(m.cells).filter((v): v is NonNullable<typeof v> => !!v);
              const min = vals.length ? vals.reduce((a, b) => (b.lt(a) ? b : a)) : null;
              const rp = repickBy.get(m.idx);
              return (
                <tr key={m.idx} className="cursor-pointer border-t border-line/50 hover:bg-sunken" onClick={() => onOpenRow?.(m.idx)}>
                  <td className="whitespace-nowrap px-2 py-1"><span className="font-mono font-semibold">{m.line.Idnrk}</span> <span className="text-muted">{m.line.Maktx}</span></td>
                  <td className="whitespace-nowrap px-2 py-1">{m.line.Headmat} · {m.line.Hwerks}</td>
                  <td className="px-2 py-1"><SourceBadge source={m.line.SelSource} /></td>
                  {ALL_RATE_SOURCES.map((s) => {
                    const v = m.cells[s];
                    return (
                      <td key={s} className={cx('num whitespace-nowrap px-2 py-1 text-right', v && min && v.eq(min) && 'font-bold text-good', s === m.line.SelSource && 'underline decoration-dotted')}>
                        {v ? fmtRate(v) : prio.includes(s) ? <span className="rounded bg-sunken px-1.5 text-faint">none</span> : <span className="text-faint">—</span>}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-2 py-1">{rp && rp.changed ? <span className="sim-val"><SourceBadge source={rp.simSource} sim /> <span className="num">{fmtSigned(rp.simTotal.minus(rp.sapTotal), 2)}</span></span> : <span className="text-faint">same</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!matrix.length && <p className="p-4 text-sm text-muted">No leaf components.</p>}
      </div>
    </div>
  );
}

function WhatIfCard({ title, sap: a, sim: s, changed }: { title: string; sap: Decimal; sim: Decimal; changed: number }) {
  const d = s.minus(a);
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint" title={title}>{title}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="text-xs text-muted">SAP <b className="num text-ink">{fmtNum(a, 2)}</b></span>
        <span className="flex items-center gap-1 text-xs"><SimTag /> <b className="num sim-val text-sm">{fmtNum(s, 2)}</b></span>
        <span className={cx('num text-xs font-bold', d.lt(0) ? 'text-good' : d.gt(0) ? 'text-bad' : 'text-muted')}>{fmtSigned(d, 2)} INR</span>
      </div>
      <p className="mt-0.5 text-2xs text-faint">{changed} component{changed === 1 ? '' : 's'} would change source · leaf rows only</p>
    </div>
  );
}
