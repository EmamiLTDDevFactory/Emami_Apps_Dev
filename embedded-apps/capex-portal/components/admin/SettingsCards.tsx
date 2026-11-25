'use client';
import { Button, Card, Kpi } from '@/components/ui';
import { adminWritesEnabled, ADMIN_WRITES_OFF_NOTE } from '@/lib/admin';
import { fmtInr } from '@/lib/format';
import { DEFAULT_QUOTA_SINGLE_CAP, DEFAULT_QUOTA_YEAR_CAP } from '@/lib/rules';
import { cfgFlagOrNull, cfgNumOrNull, plantCaps } from './doaLogic';

const EditBtn = () => { const w = adminWritesEnabled(); return <Button disabled={!w} title={w ? '' : ADMIN_WRITES_OFF_NOTE}>Edit</Button>; };
const days = (n: number | null) => (n === null ? '-' : `${n} days`);

/** SLA Configuration, read live from ConfigSet; '-' when the param is absent (#5/#95). */
export function SlaCard({ config }: { config: Record<string, string> }) {
  const warn = cfgNumOrNull(config, 'SLA_WARN_DAYS'), breach = cfgNumOrNull(config, 'SLA_BREACH_DAYS'), esc = cfgFlagOrNull(config, 'SLA_AUTO_ESCALATE');
  return (
    <Card title="SLA Configuration" hint="From ConfigSet: SLA_WARN_DAYS, SLA_BREACH_DAYS, SLA_AUTO_ESCALATE" actions={<EditBtn />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Warn After" value={days(warn)} tone="warning" />
        <Kpi label="Breach After" value={days(breach)} tone="error" />
        <Kpi label="Auto-Escalate" value={esc === null ? '-' : esc ? 'Yes' : 'No'} foot="On breach, notify next level" />
      </div>
    </Card>
  );
}

/** Unit Quota caps (#6/#10): load-bearing, so they fall back to the documented defaults, never blank. */
export function QuotaCard({ config }: { config: Record<string, string> }) {
  const year = cfgNumOrNull(config, 'QUOTA_YEAR_CAP') || DEFAULT_QUOTA_YEAR_CAP;
  const single = cfgNumOrNull(config, 'QUOTA_SINGLE_CAP') || DEFAULT_QUOTA_SINGLE_CAP;
  const per = plantCaps(config);
  return (
    <Card title="Unit Quota Caps" hint="From ConfigSet: QUOTA_YEAR_CAP, QUOTA_SINGLE_CAP, QUOTA_YEAR_CAP_<plant>" actions={<EditBtn />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Kpi label="Yearly cap per unit" value={fmtInr(year)} />
        <Kpi label="Single item cap" value={fmtInr(single)} />
      </div>
      {per.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{per.map((p) => <span key={p.werks} className="rounded border border-sap-line px-2 py-1">Plant {p.werks}: {fmtInr(p.cap)}</span>)}</div>}
    </Card>
  );
}

/** Static info: the Fiori table has no backend counterpart (log #5). */
const SYNC = [
  ['Budget Approved', 'Internal Order created in SAP', 'Immediately'],
  ['CPE Final Approved', 'CWIP created in SAP', 'Immediately'],
  ['PO Issued', 'Posted to SAP MM', 'Automatically'],
  ['GRN Received', 'Commitment updated to actual', 'Synced hourly'],
  ['Installation Cert Approved', 'Fixed Asset created + Depreciation starts', 'Automatically'],
];
export function SapSyncCard() {
  return (
    <Card title="SAP Integration Points" hint="Informational. These are SAP-side behaviours, not settings.">
      <div className="scroll-glass overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="text-left text-[11px] font-bold"><th className="px-3 py-2">Portal Action</th><th className="px-3 py-2">SAP Result</th><th className="px-3 py-2 text-right">Timing</th></tr></thead>
        <tbody>{SYNC.map((r) => <tr key={r[0]} className="border-t border-sap-line"><td className="px-3 py-2">{r[0]}</td><td className="px-3 py-2 text-emerald-800">{r[1]}</td><td className="px-3 py-2 text-right">{r[2]}</td></tr>)}</tbody></table></div>
    </Card>
  );
}
