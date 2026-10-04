'use client';
import { useMemo, useState } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { dataQuality, DQ_LABEL, type DqKind } from '@/lib/cost/analytics';
import { fmtNum } from '@/lib/format';
import { cx, Empty, Pill } from './ui';

const TONE: Record<DqKind, 'bad' | 'warn' | 'neutral' | 'accent'> = { NO_RATE: 'bad', UOM: 'warn', ZERO_FX: 'bad', DONOR: 'accent' };

export default function DataQuality({ rows, onOpenRow }: { rows: CostLine[]; onOpenRow: (i: number) => void }) {
  const issues = useMemo(() => dataQuality(rows), [rows]);
  const [kind, setKind] = useState<DqKind | 'ALL'>('ALL');
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of issues) c[i.kind] = (c[i.kind] ?? 0) + 1;
    return c;
  }, [issues]);
  const shown = kind === 'ALL' ? issues : issues.filter((i) => i.kind === kind);
  if (issues.length === 0) return <Empty title="No data-quality findings" icon="✓">Every leaf line has a rate, non-zero FX and no UoM conversion hints.</Empty>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2" role="group" aria-label="Filter findings">
        {(['ALL', 'NO_RATE', 'UOM', 'ZERO_FX', 'DONOR'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx('rounded-full border px-2.5 py-0.5 text-xs', kind === k ? 'border-accent bg-accent/10 text-ink' : 'border-line text-muted hover:text-ink')}>
            {k === 'ALL' ? 'All' : DQ_LABEL[k]} <span className="num font-semibold">{k === 'ALL' ? issues.length : counts[k] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-panel text-2xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-1.5 text-left font-semibold">Finding</th>
              <th className="text-left font-semibold">Plant</th>
              <th className="text-left font-semibold">Header</th>
              <th className="text-left font-semibold">Component</th>
              <th className="text-left font-semibold">Detail</th>
              <th className="px-3 text-right font-semibold">Total INR</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 5000).map((d, n) => {
              const r = rows[d.i];
              return (
                <tr key={`${d.key}|${d.kind}|${n}`} className="cursor-pointer border-t border-line/60 hover:bg-accent/[0.04]" onClick={() => onOpenRow(d.i)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpenRow(d.i)}>
                  <td className="px-3 py-1"><Pill tone={TONE[d.kind]}>{DQ_LABEL[d.kind]}</Pill></td>
                  <td className="font-mono text-xs">{r.Hwerks}</td>
                  <td className="text-xs"><span className="font-mono">{r.Headmat}</span></td>
                  <td className="text-xs"><span className="font-mono">{r.Idnrk}</span> <span className="text-muted">{r.Maktx}</span></td>
                  <td className="text-xs text-muted">{d.detail}</td>
                  <td className="num px-3 text-right">{fmtNum(r.TotCostInr, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
