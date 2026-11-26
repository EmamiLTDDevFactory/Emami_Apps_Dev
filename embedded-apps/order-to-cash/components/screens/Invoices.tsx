'use client';
import { useMemo, useState } from 'react';
import { Button, Chip, ErrorBox, Header, Kpi, TONE_CHIP, Table, useSelection, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { errText, listFlags, sapRead, setFlags } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, date, dateTime, daysBetween, money, short, ymd } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Row } from '@/lib/types';

export function bucket(days: number | null): string {
  if (days === null || days <= 0) return 'Not due';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/** Invoices from SAP with delivery to the customer recorded, due date, ageing and payment (clearing) status. */
export default function Invoices({ active, canWrite, notify }: ScreenProps) {
  const { f, setF, payload } = useFilters(60);
  const q = useLoad(() => sapRead('LIST_INVOICES', payload()), active, { rows: [] as Row[], truncated: false });
  const flags = useLoad(() => listFlags('invoice_sent'), active, [] as { ref: string; by_user: string; at: string }[]);
  const sel = useSelection();
  const [busy, setBusy] = useState(false);
  const today = ymd(new Date());
  const sent = useMemo(() => new Map(flags.data.map((x) => [x.ref, x])), [flags.data]);
  const rows = useMemo(() => q.data.rows.map((r): Row => {
    const open = Number(r.OPEN_AMOUNT) || 0;
    const overdue = open > 0 ? daysBetween(r.DUE_DATE, today) : null;
    return { ...r, __sent: sent.get(String(r.VBELN).padStart(10, '0')), __overdue: overdue, __bucket: open > 0 ? bucket(overdue) : 'Paid' };
  }), [q.data.rows, sent, today]);
  const k = useMemo(() => {
    const total = rows.reduce((s, r) => s + (Number(r.NETWR) || 0) + (Number(r.MWSBK) || 0), 0);
    const open = rows.reduce((s, r) => s + (Number(r.OPEN_AMOUNT) || 0), 0);
    const overdue = rows.filter((r) => (r.__overdue ?? 0) > 0).reduce((s, r) => s + (Number(r.OPEN_AMOUNT) || 0), 0);
    return { total, open, overdue, notSent: rows.filter((r) => !r.__sent).length };
  }, [rows]);
  const buckets = ['Not due', '1-30', '31-60', '61-90', '90+'].map((b) => ({ b, v: rows.filter((r) => r.__bucket === b).reduce((s, r) => s + (Number(r.OPEN_AMOUNT) || 0), 0) }));
  const maxB = Math.max(1, ...buckets.map((x) => x.v));

  const markSent = async () => {
    setBusy(true);
    try { const r = await setFlags('invoice_sent', [...sel.selected]); notify(`${r.count} invoice(s) marked as delivered to the customer.`, 'success'); sel.clear(); void flags.reload(); }
    catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title="Invoices" hint="Billing documents from SAP: has the customer got the invoice, when is it due, is it paid." />
      <FilterBar f={f} setF={setF} onLoad={() => { void q.reload(); void flags.reload(); }} loading={q.loading}>
        <Button onClick={() => void downloadXlsx('invoices.xlsx', rows.map((r) => ({ ...r, VBELN: alpha(r.VBELN), BUCKET: r.__bucket, SENT: r.__sent ? 'yes' : '' })), [{ key: 'VBELN', label: 'Invoice' }, { key: 'FKDAT', label: 'Date' }, { key: 'XBLNR', label: 'Reference' }, { key: 'BSTKD', label: 'Customer PO' }, { key: 'KUNRG', label: 'Payer' }, { key: 'NAME1', label: 'Name' }, { key: 'NETWR', label: 'Net' }, { key: 'MWSBK', label: 'Tax' }, { key: 'DUE_DATE', label: 'Due' }, { key: 'OPEN_AMOUNT', label: 'Open' }, { key: 'BUCKET', label: 'Ageing' }, { key: 'SENT', label: 'Delivered to customer' }])} disabled={!rows.length}>Excel</Button>
        {canWrite && <Button variant="primary" onClick={() => void markSent()} disabled={!sel.selected.size || busy}>Mark delivered to customer ({sel.selected.size})</Button>}
      </FilterBar>
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Invoiced (gross)" value={`₹ ${short(k.total)}`} sub={`${rows.length} invoices`} />
        <Kpi label="Still open" value={`₹ ${short(k.open)}`} tone="amber" />
        <Kpi label="Overdue" value={`₹ ${short(k.overdue)}`} tone="red" />
        <Kpi label="Not confirmed delivered" value={k.notSent} sub="invoice copy to customer" tone="slate" />
      </div>
      {rows.length > 0 && (
        <div className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-sap-line">
          <p className="mb-2 text-2xs font-bold uppercase tracking-wider text-sap-muted">Open amount by days overdue</p>
          <div className="grid grid-cols-5 gap-3">
            {buckets.map((x) => (
              <div key={x.b} className="flex flex-col gap-1">
                <div className="flex h-20 items-end rounded bg-sap-head"><div className={`w-full rounded ${x.b === '90+' || x.b === '61-90' ? 'bg-red-400' : x.b === 'Not due' ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ height: `${(x.v / maxB) * 100}%` }} /></div>
                <p className="text-center text-2xs font-bold">{x.b}</p>
                <p className="text-center text-2xs tabular-nums text-sap-muted">₹ {short(x.v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <Table rows={rows} loading={q.loading} rowKey={(r) => String(r.VBELN)} selected={canWrite ? sel.selected : undefined} onToggle={sel.toggle} onToggleAll={sel.toggleAll} selectable={(r) => !r.__sent} empty="Load invoices from SAP."
        cols={[
          { key: 'VBELN', label: 'Invoice', render: (r) => <span className="font-mono font-bold">{alpha(r.VBELN)}</span> },
          { key: 'FKDAT', label: 'Date', render: (r) => date(r.FKDAT) },
          { key: 'XBLNR', label: 'Reference' },
          { key: 'BSTKD', label: 'Customer PO' },
          { key: 'NAME1', label: 'Payer', render: (r) => `${alpha(r.KUNRG)} ${r.NAME1 ?? ''}` },
          { key: 'NETWR', label: 'Net', num: true, render: (r) => money(r.NETWR) },
          { key: 'DUE_DATE', label: 'Due', render: (r) => date(r.DUE_DATE) },
          { key: 'OPEN_AMOUNT', label: 'Open', num: true, render: (r) => money(r.OPEN_AMOUNT) },
          { key: 'age', label: 'Ageing', render: (r) => <Chip cls={r.__bucket === 'Paid' ? TONE_CHIP.good : r.__bucket === 'Not due' ? TONE_CHIP.info : r.__bucket === '1-30' ? TONE_CHIP.warn : TONE_CHIP.bad}>{r.__bucket === 'Paid' ? `paid ${date(r.AUGDT)}` : r.__bucket}</Chip>, value: (r) => r.__overdue ?? -999 },
          { key: 'sent', label: 'Delivered', render: (r) => (r.__sent ? <Chip cls={TONE_CHIP.good} title={r.__sent.by_user}>{dateTime(r.__sent.at)}</Chip> : ''), value: (r) => (r.__sent ? 1 : 0) },
        ]} />
    </div>
  );
}
