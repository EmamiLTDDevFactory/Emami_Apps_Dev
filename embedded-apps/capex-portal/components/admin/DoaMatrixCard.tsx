'use client';
import { useMemo, useState } from 'react';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Select, type Column } from '@/components/ui';
import { adminWritesEnabled, ADMIN_WRITES_OFF_NOTE } from '@/lib/admin';
import { fmtInr } from '@/lib/format';
import CapexTypePicker from './CapexTypePicker';
import { DOC_TYPES, docTypeLabel, filterMatrix, formatTotalSla, type MatrixRule } from './doaLogic';

export default function DoaMatrixCard({ rules, capexTypes, loading, error, onRetry }: { rules: MatrixRule[]; capexTypes: { key: string; text: string }[]; loading: boolean; error: string; onRetry: () => void }) {
  const [docType, setDocType] = useState('');
  const [capex, setCapex] = useState('');
  const writes = adminWritesEnabled();
  const rows = useMemo(() => filterMatrix(rules, docType, capex), [rules, docType, capex]);
  const cols: Column<MatrixRule>[] = [
    { key: 'capex', header: 'Capex Type', render: (r) => <span>{r.capexTypeText}<span className="ml-1 text-sap-muted">({r.capexType})</span></span> },
    { key: 'doc', header: 'Document Type', hideBelow: 'md', render: (r) => docTypeLabel(r.docType) },
    { key: 'range', header: 'Amount Range', hideBelow: 'md', render: (r) => r.rangeText || `${fmtInr(r.amountFrom)} - ${r.amountTo === null ? 'no limit' : fmtInr(r.amountTo)}` },
    { key: 'status', header: 'Status', hideBelow: 'lg', render: (r) => <Chip tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Active' : 'Inactive'}</Chip> },
    { key: 'chain', header: 'Approval Chain', render: (r) => (
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {r.chain.map((s, i) => <li key={i} className="flex items-center gap-1"><span className="rounded border border-sap-line px-1.5 py-0.5" title={s.approverName || s.approver}>{s.role}</span>{i < r.chain.length - 1 && <span aria-hidden className="text-sap-muted">{'→'}</span>}</li>)}
        {!r.chain.length && <span className="text-sap-muted">No steps</span>}
      </ol>) },
    { key: 'sla', header: 'Total SLA', align: 'right', hideBelow: 'sm', render: (r) => formatTotalSla(r.chain) },
  ];
  return (
    <Card title="DOA Matrix" hint="Approval chains by capex type, amount range and document type"
      actions={<Button disabled={!writes} title={writes ? '' : ADMIN_WRITES_OFF_NOTE}>Add rule</Button>}>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Document Type" className="w-44"><Select value={docType} onChange={(e) => setDocType(e.target.value)}><option value="">All</option>{DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.text}</option>)}</Select></Field>
        <Field label="Capex Type" className="w-64"><CapexTypePicker options={capexTypes} value={capex} onChange={setCapex} allLabel="All" /></Field>
      </div>
      {error ? <ErrorBox message={error} onRetry={onRetry} /> : <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} loading={loading} empty="No DOA rules match." />}
    </Card>
  );
}
