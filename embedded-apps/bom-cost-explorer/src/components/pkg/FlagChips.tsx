import { cx } from '../ui';
import { isBlockingFlag, parseFlags } from '@/lib/pkg/rules';

/** Text chips (never colour only): NOBOM / PCT100 / NORATE block the material, NOZBUD / DUP only warn. */
export function FlagChips({ flags }: { flags: string }) {
  const list = parseFlags(flags);
  if (!list.length) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((f) => {
        const hard = isBlockingFlag(f);
        return <span key={f} title={hard ? 'Blocking: skipped on finalise' : 'Warning'} className={cx('rounded-md px-1.5 py-0.5 text-2xs font-bold', hard ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn')}>{f}</span>;
      })}
    </span>
  );
}
