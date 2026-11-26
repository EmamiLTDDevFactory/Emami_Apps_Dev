'use client';
import { useMemo, useRef, useState } from 'react';
import { Button, Chip, Header, Kpi, Notice, TONE_CHIP, Table, Toolbar, type ScreenProps } from '../ui';
import { errText, grnRecon, openDispute } from '@/lib/api';
import { downloadXlsx, pick, sheetRows } from '@/lib/files';
import { alpha, money, qty, short } from '@/lib/format';
import type { Row } from '@/lib/types';

const TONE: Record<string, string> = { OK: TONE_CHIP.good, SHORT: TONE_CHIP.bad, REJECTED: TONE_CHIP.bad, EXCESS: TONE_CHIP.warn, NO_GRN: TONE_CHIP.mute, NOT_INVOICED: TONE_CHIP.warn };

/** Goods reconciliation: the customer's GRN (received / rejected per invoice line) against what SAP invoiced. Gaps are
 *  future deductions; raise the dispute now, while the proof (POD, LR) is fresh. */
export default function GrnRecon({ canWrite, notify }: ScreenProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (file: File) => {
    setBusy(true);
    try {
      const raw = await sheetRows(file);
      const grn = raw.map((r) => ({
        INVOICE: pick(r, ['Invoice', 'Invoice No', 'Invoice Number', 'Bill No', 'Vendor Invoice']),
        MATNR: pick(r, ['Material', 'SAP Material', 'Vendor Article']),
        EAN: pick(r, ['EAN', 'Barcode', 'EAN Code']),
        CUST_MAT: pick(r, ['Article', 'Article Code', 'Item Code', 'SKU']),
        RECEIVED: pick(r, ['Received', 'Received Qty', 'GRN Qty', 'Accepted Qty', 'Qty Received']),
        REJECTED: pick(r, ['Rejected', 'Rejected Qty', 'Damaged', 'Short Expiry']),
      })).filter((g) => g.INVOICE && (g.MATNR || g.EAN || g.CUST_MAT));
      if (!grn.length) { notify('No usable rows. The file needs columns Invoice, EAN or Article (or Material), Received Qty and optionally Rejected Qty.', 'error'); return; }
      const r = await grnRecon(grn);
      setRows(r.rows);
      setInfo(`${file.name}: ${grn.length} GRN line(s), ${r.found} of ${r.invoices} invoice(s) found in SAP.`);
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const k = useMemo(() => ({
    risk: rows.reduce((s, r) => s + (Number(r.VALUE_AT_RISK) || 0), 0),
    gaps: rows.filter((r) => ['SHORT', 'REJECTED', 'EXCESS', 'NOT_INVOICED'].includes(r.STATUS)).length,
    ok: rows.filter((r) => r.STATUS === 'OK').length,
  }), [rows]);

  const dispute = async (r: Row) => {
    try {
      await openDispute({ ref_type: 'grn', ref_no: alpha(r.INVOICE), amount: r.VALUE_AT_RISK, reason: `GRN ${r.STATUS.toLowerCase()}: material ${alpha(r.MATNR)}, invoiced ${r.INVOICED}, received ${r.RECEIVED}, rejected ${r.REJECTED}` });
      notify(`Dispute opened for invoice ${alpha(r.INVOICE)}.`, 'success');
    } catch (e) { notify(errText(e), 'error'); }
  };

  return (
    <div>
      <Header title="GRN Reconciliation" hint="Upload the customer's GRN (portal download or email). Each line is matched to the SAP invoice line by EAN, customer article or material." />
      <Toolbar>
        <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Matching…' : 'Upload GRN file'}</Button>
        <span className="flex-1 text-xs text-sap-muted">{info || 'Columns: Invoice, EAN / Article / Material, Received Qty, Rejected Qty'}</span>
        <Button onClick={() => void downloadXlsx('grn-reconciliation.xlsx', rows.map((r) => ({ ...r, INVOICE: alpha(r.INVOICE), MATNR: alpha(r.MATNR) })), [{ key: 'INVOICE', label: 'Invoice' }, { key: 'MATNR', label: 'Material' }, { key: 'MAKTX', label: 'Description' }, { key: 'INVOICED', label: 'Invoiced' }, { key: 'RECEIVED', label: 'Received' }, { key: 'REJECTED', label: 'Rejected' }, { key: 'SHORT', label: 'Short' }, { key: 'EXCESS', label: 'Excess' }, { key: 'STATUS', label: 'Status' }, { key: 'VALUE_AT_RISK', label: 'Value at risk' }])} disabled={!rows.length}>Excel</Button>
      </Toolbar>
      {rows.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-3">
          <Kpi label="Value at risk" value={`₹ ${short(k.risk)}`} sub="short + rejected × invoice price" tone="red" />
          <Kpi label="Lines with a gap" value={k.gaps} tone="amber" />
          <Kpi label="Lines matched" value={k.ok} tone="green" />
        </div>
      )}
      {rows.some((r) => r.STATUS === 'NO_GRN') && <Notice>Lines marked No GRN are invoiced but missing from the file — the customer has not received them yet, or the GRN is partial.</Notice>}
      <Table rows={rows} rowKey={(r) => `${r.INVOICE}|${r.MATNR}`} empty="Upload a GRN file to reconcile."
        cols={[
          { key: 'INVOICE', label: 'Invoice', render: (r) => <span className="font-mono">{alpha(r.INVOICE)}</span> },
          { key: 'MATNR', label: 'Material', render: (r) => <span>{alpha(r.MATNR)} <span className="text-sap-muted">{r.MAKTX}</span></span> },
          { key: 'INVOICED', label: 'Invoiced', num: true, render: (r) => qty(r.INVOICED) },
          { key: 'RECEIVED', label: 'Received', num: true, render: (r) => qty(r.RECEIVED) },
          { key: 'REJECTED', label: 'Rejected', num: true, render: (r) => qty(r.REJECTED) },
          { key: 'SHORT', label: 'Short', num: true, render: (r) => qty(r.SHORT) },
          { key: 'STATUS', label: 'Status', render: (r) => <Chip cls={TONE[r.STATUS]}>{String(r.STATUS).replace('_', ' ').toLowerCase()}</Chip> },
          { key: 'VALUE_AT_RISK', label: 'At risk', num: true, render: (r) => money(r.VALUE_AT_RISK) },
          { key: 'act', label: '', render: (r) => (canWrite && ['SHORT', 'REJECTED'].includes(r.STATUS) ? <Button onClick={() => void dispute(r)}>Open dispute</Button> : '') },
        ]} />
    </div>
  );
}
