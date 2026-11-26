'use client';
import { useState } from 'react';
import { Button, Card, Field, Input, Kpi, Modal, useAction } from '@/components/ui';
import { saveConfig } from '@/lib/admin';
import { fmtInr } from '@/lib/format';
import { DEFAULT_QUOTA_SINGLE_CAP, DEFAULT_QUOTA_YEAR_CAP } from '@/lib/rules';
import { cfgFlagOrNull, cfgNumOrNull, plantCaps } from './doaLogic';

/** One dialog that edits a few ConfigSet values (saved one by one through SAP's allow-list), then reloads the profile. */
function SettingsDialog({ title, fields, config, onSaved }: { title: string; fields: { param: string; label: string; flag?: boolean; hint?: string }[]; config: Record<string, string>; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState('');
  const { busy, run } = useAction();
  const start = () => { setVals(Object.fromEntries(fields.map((f) => [f.param, config[f.param] ?? '']))); setProblem(''); setOpen(true); };
  const save = async () => {
    for (const f of fields) {
      if (!f.flag && (vals[f.param] ?? '').trim() !== '' && !/^\d+(\.\d+)?$/.test(vals[f.param].trim())) { setProblem(`${f.label} must be a number.`); return; }
    }
    const changed = fields.filter((f) => (vals[f.param] ?? '').trim() !== (config[f.param] ?? '') && !(f.flag === undefined && (vals[f.param] ?? '').trim() === ''));
    if (!changed.length) { setOpen(false); return; }
    const ok = await run(async () => { for (const f of changed) await saveConfig(f.param, vals[f.param].trim()); return true; }, `${title} saved.`);
    if (ok) { setOpen(false); onSaved(); }
  };
  return (
    <>
      <Button onClick={start}>Edit</Button>
      <Modal open={open} title={`Edit ${title}`} onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          {fields.map((f) => f.flag
            ? <label key={f.param} className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={vals[f.param] === 'X'} onChange={(e) => setVals((v) => ({ ...v, [f.param]: e.target.checked ? 'X' : '' }))} />{f.label}</label>
            : <Field key={f.param} label={f.label} hint={f.hint}><Input inputMode="decimal" value={vals[f.param] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [f.param]: e.target.value }))} /></Field>)}
          {problem && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">{problem}</p>}
        </div>
      </Modal>
    </>
  );
}
const days = (n: number | null) => (n === null ? '-' : `${n} days`);

/** SLA Configuration, read live from ConfigSet; '-' when the param is absent (#5/#95). */
export function SlaCard({ config, onSaved }: { config: Record<string, string>; onSaved: () => void }) {
  const warn = cfgNumOrNull(config, 'SLA_WARN_DAYS'), breach = cfgNumOrNull(config, 'SLA_BREACH_DAYS'), esc = cfgFlagOrNull(config, 'SLA_AUTO_ESCALATE');
  return (
    <Card title="SLA Configuration" hint="Days a step may wait before it is flagged, and what happens on a breach"
      actions={<SettingsDialog title="SLA settings" config={config} onSaved={onSaved} fields={[
        { param: 'SLA_WARN_DAYS', label: 'Warn after (days)' }, { param: 'SLA_BREACH_DAYS', label: 'Breach after (days)' }, { param: 'SLA_AUTO_ESCALATE', label: 'Auto-escalate on breach (notify next level)', flag: true }]} />}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Warn After" value={days(warn)} tone="warning" />
        <Kpi label="Breach After" value={days(breach)} tone="error" />
        <Kpi label="Auto-Escalate" value={esc === null ? '-' : esc ? 'Yes' : 'No'} foot="On breach, notify next level" />
      </div>
    </Card>
  );
}

/** Unit Quota caps (#6/#10): load-bearing, so they fall back to the documented defaults, never blank. */
export function QuotaCard({ config, onSaved }: { config: Record<string, string>; onSaved: () => void }) {
  const year = cfgNumOrNull(config, 'QUOTA_YEAR_CAP') || DEFAULT_QUOTA_YEAR_CAP;
  const single = cfgNumOrNull(config, 'QUOTA_SINGLE_CAP') || DEFAULT_QUOTA_SINGLE_CAP;
  const per = plantCaps(config);
  return (
    <Card title="Unit Quota Caps" hint="Yearly and single-item spending caps for unit quota"
      actions={<SettingsDialog title="quota caps" config={config} onSaved={onSaved} fields={[
        { param: 'QUOTA_YEAR_CAP', label: 'Yearly cap per unit (INR)' }, { param: 'QUOTA_SINGLE_CAP', label: 'Single item cap (INR)' },
        ...per.map((p) => ({ param: `QUOTA_YEAR_CAP_${p.werks}`, label: `Yearly cap, plant ${p.werks} (INR)` }))]} />}>
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
