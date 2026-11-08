'use client';
import { useMemo, useState } from 'react';
import { cx } from '../ui';
import { FlagChips } from './FlagChips';
import { flagHint, isBlockingFlag, blocked, parseFlags, stripZeros, BLOCKING, WARNING } from '@/lib/pkg/rules';
import type { PkgGroup } from '@/lib/pkg/types';

export default function ExceptionsView({ groups }: { groups: PkgGroup[] }) {
  const [only, setOnly] = useState('');
  const withFlags = useMemo(() => groups.filter((g) => parseFlags(g.head.MsgFlags).length > 0), [groups]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const g of withFlags) for (const f of parseFlags(g.head.MsgFlags)) c[f] = (c[f] ?? 0) + 1; return c; }, [withFlags]);
  const flags = [...BLOCKING, ...WARNING, ...Object.keys(counts).filter((f) => !(BLOCKING as readonly string[]).includes(f) && !(WARNING as readonly string[]).includes(f))].filter((f) => counts[f]);
  const shown = flags.filter((f) => !only || f === only);

  if (!withFlags.length) return <p className="rounded-2xl border border-line bg-panel py-10 text-center text-sm text-muted shadow-card">No exceptions: every material is clean.</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by flag">
        <button type="button" aria-pressed={!only} onClick={() => setOnly('')} className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1 ring-line', !only && 'bg-accent text-white')}>All ({withFlags.length})</button>
        {flags.map((f) => (
          <button key={f} type="button" aria-pressed={only === f} onClick={() => setOnly(only === f ? '' : f)}
            className={cx('rounded-full px-3 py-1 text-xs font-bold ring-1', only === f ? 'bg-accent text-white ring-accent' : isBlockingFlag(f) ? 'bg-bad/10 text-bad ring-bad/30' : 'bg-warn/10 text-warn ring-warn/30')}>{f} ({counts[f]})</button>
        ))}
      </div>
      {shown.map((f) => (
        <section key={f} className="overflow-auto rounded-2xl border border-line bg-panel shadow-card">
          <h3 className="border-b border-line px-3 py-2 text-sm font-bold">{f} <span className="font-normal text-muted">({counts[f]})</span></h3>
          <table className="w-full min-w-[800px] border-collapse text-xs">
            <thead><tr className="text-left text-muted"><th className="px-3 py-1.5">Material</th><th className="px-2">Description</th><th className="px-2">Group</th><th className="px-2">Flags</th><th className="px-2">Hint</th></tr></thead>
            <tbody>
              {withFlags.filter((g) => parseFlags(g.head.MsgFlags).includes(f)).map((g) => (
                <tr key={g.head.Matnr} className="border-t border-line/60">
                  <td className="whitespace-nowrap px-3 py-1.5 font-bold">{stripZeros(g.head.Matnr)}</td>
                  <td className="max-w-[260px] truncate px-2" title={g.head.Maktx}>{g.head.Maktx}</td>
                  <td className="px-2">{g.head.Matkl}</td>
                  <td className="px-2"><FlagChips flags={g.head.MsgFlags} /></td>
                  <td className="px-2">{flagHint(f, g)}{blocked(g.head) && <span className="ml-2 font-semibold text-bad">Will be skipped on finalise</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
