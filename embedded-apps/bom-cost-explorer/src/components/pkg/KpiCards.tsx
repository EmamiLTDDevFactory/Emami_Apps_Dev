import { cx, Stat } from '../ui';
import { fmtInt, fmtVar2, type KpiFilter, type Kpis } from '@/lib/pkg/rules';

/** Dashboard tiles. Each says what it counts; the clickable ones filter the material list below (click again to clear). */
const DEF = {
  materials: 'Packing materials (PKGN / VERP) bought in the last 12 months before the key date, one row per material. Click to show all.',
  blocked: 'Materials that cannot be finalised: NOBOM (no BOM for the origin group), PCT100 (BOM % not 100) or NORATE (no budget rate). Click to list them.',
  warnings: 'Materials with only warnings and no blocker: NOZBUD (no ZBUD %), DUP (duplicate ZBUD) or NOFRT (no freight). They can still be finalised. Click to list them.',
  avg: 'Simple average of Var % (budgeted vs basic rate) over the materials that are not blocked.',
  overridden: 'Materials where the basic rate, a BOM % or a ZBUD % was changed from the SAP value. Click to list them.',
} as const;

const SUB = {
  materials: 'Bought in last 12 months, one row each',
  blocked: 'NOBOM / PCT100 / NORATE: cannot be finalised',
  warnings: 'NOZBUD / DUP / NOFRT: can be finalised',
  avg: 'Budgeted vs basic, unblocked rows only',
  overridden: 'Rate or % changed from the SAP value',
} as const;

export default function KpiCards({ k, active, onPick }: { k: Kpis; active: KpiFilter; onPick: (f: KpiFilter) => void }) {
  const tile = (f: KpiFilter, label: string, value: string, def: string, sub: string, tone?: 'good' | 'warn' | 'bad') => (
    <button type="button" aria-pressed={active === f} onClick={() => onPick(active === f ? 'all' : f)}
      className={cx('rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', active === f && f !== 'all' && 'ring-2 ring-accent')}>
      <Stat label={label} value={value} sub={sub} tone={tone} title={def} />
    </button>
  );
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tile('all', 'Materials', fmtInt(k.materials), DEF.materials, SUB.materials)}
      {tile('blocked', 'Blocked', fmtInt(k.blocked), DEF.blocked, SUB.blocked, k.blocked ? 'bad' : undefined)}
      {tile('warnings', 'Warnings', fmtInt(k.warnings), DEF.warnings, SUB.warnings, k.warnings ? 'warn' : undefined)}
      <Stat label="Avg variance %" value={k.avgVarPct === null ? '—' : fmtVar2(k.avgVarPct)} sub={SUB.avg} title={DEF.avg} />
      {tile('overridden', 'Overridden', fmtInt(k.overridden), DEF.overridden, SUB.overridden)}
    </div>
  );
}
