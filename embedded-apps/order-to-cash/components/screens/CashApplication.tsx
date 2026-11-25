'use client';
import { useMemo, useRef, useState } from 'react';
import { Button, Chip, Header, Kpi, Notice, TONE_CHIP, Table, Toolbar, type ScreenProps } from '../ui';
import { cashMatch, errText, openDispute } from '@/lib/api';
import { downloadXlsx, pick, sheetRows } from '@/lib/files';
import { alpha, money, short } from '@/lib/format';
import type { Row } from '@/lib/types';

const TONE: Record<string, string> = { MATCHED: TONE_CHIP.good, AMOUNT_MATCH: TONE_CHIP.info, SHORT_PAID: TONE_CHIP.bad, OVER_PAID: TONE_CHIP.warn, UNMATCHED: TONE_CHIP.mute };

/** Cash application: the customer's remittance advice (or bank statement lines) matched to open SAP invoices.
 *  The result is a clearing proposal for Finance (F-28 / F-32 upload); nothing is posted from here. */
export default function CashApplication({ canWrite, notify }: ScreenProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (file: File) => {
    setBusy(true);
    try {
      const remits = (await sheetRows(file)).map((r) => ({
        REF: pick(r, ['Invoice', 'Invoice No', 'Bill No', 'Reference', 'Document No', 'Narration']),
        AMOUNT: pick(r, ['Amount', 'Paid Amount', 'Net Amount', 'Payment Amount', 'Credit']),
        KUNNR: pick(r, ['Customer', 'Customer Code', 'Party Code', 'SAP Code']),
        DATE: pick(r, ['Date', 'Payment Date', 'Value Date']),
      })).filter((r) => r.AMOUNT);
      if (!remits.length) { notify('No rows with an amount. The file needs columns Invoice (or Reference), Amount and optionally Customer.', 'error'); return; }
      const r = await cashMatch(remits);
      setRows(r.rows);
      setInfo(`${file.name}: ${remits.length} payment line(s) against ${r.openItems.toLocaleString('en-IN')} open SAP item(s).`);
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const k = useMemo(() => {
    const sum = (st: string[]) => rows.filter((r) => st.includes(r.STATUS)).reduce((s, r) => s + (Number(r.AMOUNT) || 0), 0);
    const total = rows.reduce((s, r) => s + (Number(r.AMOUNT) || 0), 0);
    const auto = sum(['MATCHED', 'AMOUNT_MATCH']);
    return { total, auto, pct: total ? Math.round((auto / total) * 100) : 0, short: rows.filter((r) => r.STATUS === 'SHORT_PAID').reduce((s, r) => s + Math.abs(Number(r.DIFFERENCE) || 0), 0), unmatched: sum(['UNMATCHED']) };
  }, [rows]);

  const deduction = async (r: Row) => {
    try {
      await openDispute({ ref_type: 'payment', ref_no: alpha(r.INVOICE), kunnr: r.KUNNR, amount: Math.abs(Number(r.DIFFERENCE) || 0), reason: `Short payment against invoice ${alpha(r.INVOICE)}: paid ${money(r.AMOUNT)} of ${money(r.OPEN_AMOUNT)}` });
      notify(`Deduction on invoice ${alpha(r.INVOICE)} opened as a dispute.`, 'success');
    } catch (e) { notify(errText(e), 'error'); }
  };

  return (
    <div>
      <Header title="Cash Application" hint="Upload the remittance advice or bank lines. Each payment is matched to an open invoice by reference, else by exact amount for the same customer." />
      <Notice>Proposal only: download it for the clearing posting in SAP (F-28 / F-32). This app does not post payments.</Notice>
      <Toolbar>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Matching…' : 'Upload remittance / bank file'}</Button>
        <span className="flex-1 text-xs text-sap-muted">{info || 'Columns: Invoice (or Reference), Amount, Customer (optional), Date'}</span>
        <Button onClick={() => void downloadXlsx('clearing-proposal.xlsx', rows.map((r) => ({ ...r, INVOICE: alpha(r.INVOICE), KUNNR: alpha(r.KUNNR) })), [{ key: 'ROW', label: 'Row' }, { key: 'DATE', label: 'Payment date' }, { key: 'REF', label: 'Payment reference' }, { key: 'AMOUNT', label: 'Paid' }, { key: 'KUNNR', label: 'Customer' }, { key: 'BELNR', label: 'Open item (FI doc)' }, { key: 'INVOICE', label: 'Invoice' }, { key: 'OPEN_AMOUNT', label: 'Open amount' }, { key: 'DIFFERENCE', label: 'Difference' }, { key: 'STATUS', label: 'Status' }])} disabled={!rows.length}>Download proposal</Button>
      </Toolbar>
      {rows.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Received" value={`₹ ${short(k.total)}`} sub={`${rows.length} lines`} />
          <Kpi label="Auto matched" value={`${k.pct}%`} sub={`₹ ${short(k.auto)}`} tone="green" />
          <Kpi label="Short paid" value={`₹ ${short(k.short)}`} sub="deductions to explain" tone="red" />
          <Kpi label="Unmatched" value={`₹ ${short(k.unmatched)}`} sub="on account / ask customer" tone="amber" />
        </div>
      )}
      <Table rows={rows} rowKey={(r) => String(r.ROW)} empty="Upload a remittance file."
        cols={[
          { key: 'ROW', label: '#', num: true },
          { key: 'REF', label: 'Payment ref.' },
          { key: 'AMOUNT', label: 'Paid', num: true, render: (r) => money(r.AMOUNT) },
          { key: 'STATUS', label: 'Result', render: (r) => <Chip cls={TONE[r.STATUS]}>{String(r.STATUS).replace('_', ' ').toLowerCase()}</Chip> },
          { key: 'INVOICE', label: 'Invoice', render: (r) => <span className="font-mono">{alpha(r.INVOICE)}</span> },
          { key: 'KUNNR', label: 'Customer', render: (r) => alpha(r.KUNNR) },
          { key: 'OPEN_AMOUNT', label: 'Open', num: true, render: (r) => money(r.OPEN_AMOUNT) },
          { key: 'DIFFERENCE', label: 'Difference', num: true, render: (r) => <span className={Number(r.DIFFERENCE) < 0 ? 'font-bold text-red-700' : ''}>{money(r.DIFFERENCE)}</span> },
          { key: 'act', label: '', render: (r) => (canWrite && r.STATUS === 'SHORT_PAID' ? <Button onClick={() => void deduction(r)}>Raise deduction</Button> : '') },
        ]} />
    </div>
  );
}
