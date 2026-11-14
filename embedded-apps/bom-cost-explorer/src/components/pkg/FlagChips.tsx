import { cx } from '../ui';
import { useNoRateWhy } from './NoRateWhy';
import { isBlockingFlag, parseFlags } from '@/lib/pkg/rules';

/** Text chips (never colour only): NOBOM / PCT100 / NORATE block the material, NOZBUD / DUP only warn. */
export function FlagChips({ flags, matnr, descr = '' }: { flags: string; matnr?: string; descr?: string }) {
  const why = useNoRateWhy();
  const list = parseFlags(flags);
  if (!list.length) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((f) => {
        const hard = isBlockingFlag(f);
        if (f === 'NORATE' && matnr && why) return <button key={f} type="button" title="Blocking: skipped on finalise. Click to see why SAP found no rate" onClick={(e) => { e.stopPropagation(); why(matnr, descr); }} className="rounded-md bg-bad/10 px-1.5 py-0.5 text-2xs font-bold text-bad underline decoration-dotted hover:decoration-solid">{f}</button>;
        return <span key={f} title={hard ? 'Blocking: skipped on finalise' : 'Warning'} className={cx('rounded-md px-1.5 py-0.5 text-2xs font-bold', hard ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn')}>{f}</span>;
      })}
    </span>
  );
}
