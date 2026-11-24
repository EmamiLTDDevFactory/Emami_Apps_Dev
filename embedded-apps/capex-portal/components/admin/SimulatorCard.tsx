'use client';
import { useMemo, useState } from 'react';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { fmtInr } from '@/lib/format';
import { resolveDOA, type DocType, type DoaRuleLike } from '@/lib/rules';
import CapexTypePicker from './CapexTypePicker';
import { DOC_TYPES, totalSlaDays } from './doaLogic';

/** Routing simulator: same resolveDOA the CPE/Budget screens use, live as you type (Fiori onSimulate). */
export default function SimulatorCard({ rawRules, capexTypes }: { rawRules: DoaRuleLike[]; capexTypes: { key: string; text: string }[] }) {
  const [docType, setDocType] = useState<DocType>('CPE');
  const [capex, setCapex] = useState('');
  const [amount, setAmount] = useState('1500000');
  const type = capex || capexTypes[0]?.key || '';
  const amt = Number(amount) || 0;
  const { chain } = useMemo(() => resolveDOA(rawRules, type, amt, docType), [rawRules, type, amt, docType]);
  const sla = totalSlaDays(chain);
  return (
    <Card title="Routing Simulator" hint="Try a capex type, amount and document type to see who would approve">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Document Type" className="w-44"><Select value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>{DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.text}</option>)}</Select></Field>
        <Field label="Capex Type" className="w-64"><CapexTypePicker options={capexTypes} value={type} onChange={setCapex} /></Field>
        <Field label="Amount (INR)" className="w-48"><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Button variant="primary" onClick={() => setAmount((a) => a)}>Simulate</Button>
      </div>
      <ol className="mt-4 space-y-2">
        {chain.map((s) => (
          <li key={s.level} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-sap-line px-3 py-2 text-[12px]">
            <div><div className="font-bold text-sap-ink">Level {s.level} {'—'} {s.role}</div><div className="text-sap-muted">{s.approverName || s.approver}</div></div>
            <div className="text-sap-muted">{s.slaDays} {s.slaDays === 1 ? 'day' : 'days'} SLA</div>
          </li>
        ))}
      </ol>
      <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${chain.length ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
        {chain.length
          ? `${fmtInr(amt)} routes through ${chain.length} approval level${chain.length > 1 ? 's' : ''}, ending at ${chain[chain.length - 1].role}. Total SLA ${sla} days.`
          : `No DOA rule matches ${fmtInr(amt)} for this capex type. The CPE would be blocked until the matrix is extended.`}
      </p>
    </Card>
  );
}
