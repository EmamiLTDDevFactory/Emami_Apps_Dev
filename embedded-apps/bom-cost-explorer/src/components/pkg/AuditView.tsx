'use client';
import { useMemo } from 'react';
import { SkeletonRows } from '../budget-mgmt/shared';
import { LEVEL_NAME, RULE_NAME, showDate, stripZeros } from '@/lib/pkg/rules';
import type { PkgOvr } from '@/lib/pkg/types';

const scope = (o: PkgOvr) => [o.Matnr && `Material ${stripZeros(o.Matnr)}`, o.Matkl && `Group ${o.Matkl}`, o.Idnrk && `Component ${stripZeros(o.Idnrk)}`].filter(Boolean).join(', ') || 'All';

export default function AuditView({ rows, loading }: { rows: PkgOvr[]; loading: boolean }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => `${b.OvrDate}${b.OvrTime}`.localeCompare(`${a.OvrDate}${a.OvrTime}`)), [rows]);
  const th = 'whitespace-nowrap border-b border-line px-2 py-1.5 text-left text-xs font-bold';
  return (
    <div className="max-h-[65vh] overflow-auto rounded-2xl border border-line bg-panel shadow-card">
      <table className="w-full min-w-[900px] border-collapse">
        <thead className="sticky top-0 bg-panel"><tr><th className={th}>Time</th><th className={th}>User</th><th className={th}>Level</th><th className={th}>Scope</th><th className={th}>Rule</th><th className={`${th} text-right`}>Old value</th><th className={`${th} text-right`}>New value</th></tr></thead>
        {loading && !rows.length ? <SkeletonRows cols={7} /> : (
          <tbody>
            {sorted.map((o, i) => (
              <tr key={i} className="border-b border-line/60 text-xs">
                <td className="whitespace-nowrap px-2 py-1.5">{showDate(o.OvrDate)} {o.OvrTime}</td><td className="px-2">{o.OvrUser}</td>
                <td className="px-2">{LEVEL_NAME[o.Level] ?? o.Level}</td><td className="px-2">{scope(o)}</td><td className="px-2">{RULE_NAME[o.Rule] ?? o.Rule}</td>
                <td className="px-2 text-right tabular-nums">{o.OldValue || '—'}</td><td className="px-2 text-right tabular-nums">{o.NewValue || '—'}</td>
              </tr>
            ))}
            {!sorted.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">No overrides recorded for this scenario</td></tr>}
          </tbody>
        )}
      </table>
    </div>
  );
}
