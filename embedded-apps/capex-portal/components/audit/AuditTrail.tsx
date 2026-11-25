'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Chip, DataTable, ErrorBox, Field, Input, PageHeader, Select, useToast, type Column } from '@/components/ui';
import { useList } from '@/lib/useData';
import { fmtDateTime, parseSapDate } from '@/lib/format';
import type { AuditLog } from '@/lib/entities';
import { auditDocHref, auditTone, filterAudit, type AuditRowView } from '@/components/dashboard/logic';

type Row = AuditLog & AuditRowView;
const PAGE = 30;
const TYPES: [string, string][] = [['BUD', 'Budget'], ['CPE', 'CPE'], ['PO', 'Purchase Order'], ['IC', 'Installation Certificate'], ['QUOTA', 'Unit Quota']];

export default function AuditTrail() {
  const toast = useToast();
  // SAP enforces plant authorization on AuditLogSet (log #96): rows of other plants never come back.
  const { rows, loading, error, reload } = useList<AuditLog>('AuditLogSet', { $orderby: 'LogTs desc', $top: 1000 });
  const [f, setF] = useState({ q: '', docType: '', from: '', to: '' });
  const [shown, setShown] = useState(PAGE);

  const all = useMemo<Row[]>(() => rows.map((r) => ({ ...r, ts: parseSapDate(r.LogTs)?.getTime() ?? 0 })).sort((a, b) => b.ts - a.ts), [rows]);
  const filtered = useMemo(() => filterAudit(all, f), [all, f]);
  const set = (patch: Partial<typeof f>) => { setF((p) => ({ ...p, ...patch })); setShown(PAGE); };

  const cols: Column<Row>[] = [
    { key: 'Doctype', header: 'Type', width: '6rem', render: (r) => <Chip tone={auditTone(r.Doctype)}>{r.Doctype}</Chip> },
    { key: 'Docid', header: 'Document', width: '11rem', render: (r) => { const h = auditDocHref(r.Doctype, r.Docid); return h ? <Link href={h} className="font-bold text-plum hover:underline">{r.Docid}</Link> : <button type="button" className="font-bold text-plum hover:underline" onClick={() => toast('No detail screen for this document type.', 'info')}>{r.Docid}</button>; } },
    { key: 'Action', header: 'Action' },
    { key: 'Comments', header: 'Comments', hideBelow: 'lg', render: (r) => r.Comments || '-' },
    { key: 'Username', header: 'Performed by', hideBelow: 'md', render: (r) => (<div>{r.Username || r.Userid}<div className="text-[11px] text-sap-muted">{r.Role}</div></div>) },
    { key: 'ts', header: 'Timestamp', align: 'right', width: '12rem', hideBelow: 'md', render: (r) => fmtDateTime(r.LogTs) },
  ];

  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Every action taken on a budget, CPE, PO or installation certificate" />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" className="w-56"><Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Document, action or user" /></Field>
          <Field label="Document type" className="w-48">
            <Select value={f.docType} onChange={(e) => set({ docType: e.target.value })}><option value="">All</option>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="From" className="w-40"><Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="To" className="w-40"><Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></Field>
          <Button onClick={() => { setF({ q: '', docType: '', from: '', to: '' }); setShown(PAGE); }}>Clear</Button>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </Card>
      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}
      <Card title={<>Audit trail <span className="font-semibold text-sap-muted">({filtered.length})</span></>}>
        <DataTable columns={cols} rows={filtered.slice(0, shown)} rowKey={(r) => r.Auditid} loading={loading && !rows.length} empty="No audit entries match."
          footer={filtered.length > shown ? <div className="p-2 text-center"><button type="button" className="text-[12px] font-bold text-plum" onClick={() => setShown((n) => n + PAGE)}>Show more ({filtered.length - shown} left)</button></div> : undefined} />
        {rows.length >= 1000 && <p className="mt-2 text-[11px] text-sap-muted">Showing the latest 1,000 entries.</p>}
      </Card>
    </div>
  );
}
