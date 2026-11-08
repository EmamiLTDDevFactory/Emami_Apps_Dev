import { Stat } from '../ui';
import { fmtInt, fmtVar2, type Kpis } from '@/lib/pkg/rules';

export default function KpiCards({ k }: { k: Kpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Stat label="Materials" value={fmtInt(k.materials)} />
      <Stat label="Blocked" value={fmtInt(k.blocked)} tone={k.blocked ? 'bad' : undefined} />
      <Stat label="Warnings" value={fmtInt(k.warnings)} tone={k.warnings ? 'warn' : undefined} />
      <Stat label="Avg variance %" value={k.avgVarPct === null ? '—' : fmtVar2(k.avgVarPct)} />
      <Stat label="Overridden" value={fmtInt(k.overridden)} />
    </div>
  );
}
