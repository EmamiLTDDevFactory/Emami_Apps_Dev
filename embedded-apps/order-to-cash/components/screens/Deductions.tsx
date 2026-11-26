'use client';
import { useMemo } from 'react';
import { Button, Chip, ErrorBox, Header, Kpi, TONE_CHIP, Table, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { errText, openDispute, sapRead } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, date, money, short } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Row } from '@/lib/types';

/** Reason from the customer's text (debit note / payment narration). Rules only, so the same text always gives the same reason. */
const REASONS: [string, RegExp][] = [
  ['Damage / expiry', /damag|breakage|leak|expir|near expiry|shelf life/i],
  ['Short supply', /short|shortage|less (qty|quantity)|not received/i],
  ['Price difference', /price|rate diff|mrp|cost diff/i],
  ['Scheme / promotion', /scheme|promo|display|listing|visibility|claim|discount|margin/i],
  ['Late delivery / penalty', /late|delay|penalt|fill rate|lead time/i],
  ['Tax / TDS', /tds|tcs|gst|tax/i],
];
export const reasonOf = (text: string) => REASONS.find(([, re]) => re.test(text))?.[0] ?? 'Unclassified';

/** Deductions: short payments left open after clearing and customer debit notes (credit memos), with a reason and a path to dispute. */
export default function Deductions({ active, canWrite, notify }: ScreenProps) {
  const { f, setF, payload } = useFilters(90);
  const q = useLoad(() => sapRead('LIST_DEDUCTIONS', payload()), active, { rows: [] as Row[], truncated: false });
  const rows = useMemo(() => q.data.rows.map((r): Row => ({ ...r, __reason: reasonOf(`${r.SGTXT ?? ''} ${r.REASON ?? ''}`) })), [q.data.rows]);
  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.__reason, (m.get(r.__reason) ?? 0) + Math.abs(Number(r.DMBTR) || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const total = byReason.reduce((s, [, v]) => s + v, 0);

  const dispute = async (r: Row) => {
    try {
      await openDispute({ ref_type: 'deduction', ref_no: alpha(r.BELNR), kunnr: r.KUNNR, name1: r.NAME1, amount: Math.abs(Number(r.DMBTR) || 0), reason: `${r.__reason}: ${r.SGTXT || r.KIND}${r.REBZG ? ` (invoice ${alpha(r.REBZG)})` : ''}` });
      notify(`Dispute opened for ${alpha(r.BELNR)}.`, 'success');
    } catch (e) { notify(errText(e), 'error'); }
  };

  return (
    <div>
      <Header title="Deductions" hint="Money the customer kept: residual items from short payment and debit notes booked as credit memos. Grouped by reason so the cause can be fixed upstream." />
      <FilterBar f={f} setF={setF} onLoad={() => void q.reload()} loading={q.loading}>
        <Button onClick={() => void downloadXlsx('deductions.xlsx', rows.map((r) => ({ ...r, REASON_GROUP: r.__reason })), [{ key: 'BELNR', label: 'Document' }, { key: 'KIND', label: 'Kind' }, { key: 'BLDAT', label: 'Date' }, { key: 'KUNNR', label: 'Customer' }, { key: 'NAME1', label: 'Name' }, { key: 'REBZG', label: 'Invoice' }, { key: 'DMBTR', label: 'Amount' }, { key: 'SGTXT', label: 'Text' }, { key: 'REASON_GROUP', label: 'Reason' }])} disabled={!rows.length}>Excel</Button>
      </FilterBar>
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      {rows.length > 0 && (
        <div className="mb-3 grid gap-3 lg:grid-cols-[220px_1fr]">
          <Kpi label="Deductions" value={`₹ ${short(total)}`} sub={`${rows.length} documents`} tone="red" />
          <div className="rounded-2xl bg-white p-3 ring-1 ring-sap-line">
            {byReason.map(([k, v]) => (
              <div key={k} className="mb-1 flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 font-semibold">{k}</span>
                <div className="h-3 flex-1 rounded bg-sap-head"><div className="h-3 rounded bg-gradient-to-r from-rose-400 to-red-500" style={{ width: `${(v / (byReason[0]?.[1] || 1)) * 100}%` }} /></div>
                <span className="w-24 text-right tabular-nums">₹ {short(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Table rows={rows} loading={q.loading} rowKey={(r) => `${r.BELNR}/${r.GJAHR}/${r.BUZEI ?? ''}`} empty="Load deductions from SAP."
        cols={[
          { key: 'BELNR', label: 'Document', render: (r) => <span className="font-mono">{alpha(r.BELNR)}</span> },
          { key: 'KIND', label: 'Kind', render: (r) => <Chip cls={r.KIND === 'CREDIT_MEMO' ? TONE_CHIP.warn : TONE_CHIP.bad}>{r.KIND === 'CREDIT_MEMO' ? 'debit note' : 'short payment'}</Chip> },
          { key: 'BLDAT', label: 'Date', render: (r) => date(r.BLDAT) },
          { key: 'NAME1', label: 'Customer', render: (r) => `${alpha(r.KUNNR)} ${r.NAME1 ?? ''}` },
          { key: 'REBZG', label: 'Invoice', render: (r) => <span className="font-mono">{alpha(r.REBZG)}</span> },
          { key: 'DMBTR', label: 'Amount', num: true, render: (r) => money(Math.abs(Number(r.DMBTR) || 0)) },
          { key: 'SGTXT', label: 'Customer text' },
          { key: '__reason', label: 'Reason' },
          { key: 'act', label: '', render: (r) => (canWrite ? <Button onClick={() => void dispute(r)}>Dispute</Button> : '') },
        ]} />
    </div>
  );
}
