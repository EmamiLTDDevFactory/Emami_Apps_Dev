'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Chip, DataTable, ErrorBox, Modal, PageHeader, Spinner, useAction } from '@/components/ui';
import { ApiError, fn, get, isOk, list, odataKey } from '@/lib/api';
import type { GRN, PurchaseOrder } from '@/lib/entities';
import { fmtDate, fmtInr, orDash, statusLabel, statusTone } from '@/lib/format';
import { isFlag, isPoPending } from './procureLogic';
import { KV } from './Bits';

export default function PODetail() {
  const id = useSearchParams().get('id') ?? '';
  const { busy, run } = useAction();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!id) { setError('No purchase order selected.'); setLoading(false); return; }
    try {
      const p = await get<PurchaseOrder>(`PurchaseOrderSet${odataKey(id)}`);
      if (!p) { setError(`Record ${id} was not found.`); return; }
      setPo(p); setError('');
      // the PO's goods receipts: navigation first, flat GRNSet read as the fallback
      const rows = await list<GRN>(`PurchaseOrderSet${odataKey(id)}/PurchaseOrderToGRNs`).then((r) => r.rows)
        .catch(() => list<GRN>('GRNSet').then((r) => r.rows.filter((g) => g.Ebeln === id)));
      setGrns(rows);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load the purchase order.'); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error || !po) return <><PageHeader title="Purchase Order" back={{ href: '/po/', label: 'Purchase Orders' }} /><ErrorBox message={error || 'Not found.'} /></>;

  const doConfirm = async () => {
    setConfirm(false);
    const r = await run(async () => {
      const res = await fn('ConfirmPO', { PoId: po.Ebeln });
      if (!isOk(res)) throw new Error(res.Message || 'Confirmation failed.');
      return res;
    }, 'PO confirmed.');
    if (r) { setNote(r.Message || ''); await load(); } // log #23: re-read, never patch locally
  };
  const posted = isFlag(po.GrnPosted);

  return (
    <>
      <PageHeader title={`PO ${po.Ebeln}`} subtitle={`${po.Title} - ${po.Vendorname} - ${po.PlantName}`} back={{ href: '/po/', label: 'Purchase Orders' }}
        actions={<>
          {isPoPending(po.Status) && <Button variant="primary" disabled={busy} onClick={() => setConfirm(true)}>Confirm PO</Button>}
          {posted && <Link href="/ic/" className="btn btn-secondary">Create Installation Certificate</Link>}
          <Button onClick={() => window.print()}>Print</Button>
        </>} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Chip tone={statusTone(po.Status)}>{statusLabel(po.Status)}</Chip>
        <span className="text-[12px] text-sap-muted">PO Value</span><b className="font-display text-lg">{fmtInr(po.Amount)}</b>
      </div>
      {note && <div role="status" className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-800">{note}</div>}

      <Card title="Details">
        <dl className="grid gap-x-8 gap-y-2.5 md:grid-cols-2">
          <KV k="PO Number">{po.Ebeln}</KV>
          <KV k="CPE ID">{po.Cpeid ? <Link className="font-semibold text-plum underline" href={'/cpe/detail/?id=' + encodeURIComponent(po.Cpeid)}>{po.Cpeid}</Link> : '-'}</KV>
          <KV k="CWIP">{orDash(po.Cwipid)}</KV>
          <KV k="Vendor">{po.Vendorname}</KV>
          <KV k="Vendor Code">{orDash(po.Lifnr)}</KV>
          <KV k="Issued On">{fmtDate(po.IssuedOn)}</KV>
          <KV k="Expected Delivery">{fmtDate(po.ExpDelivery)}</KV>
          <KV k="Incoterm">{[po.Inco1, po.Inco2].filter(Boolean).join(' ') || '-'}</KV>
        </dl>
        <div className="mt-3 text-[11px] font-bold text-sap-muted">Payment Terms</div>
        <p className="whitespace-pre-wrap text-[12px]">{orDash(po.PaymentTerms || po.Zterm)}</p>
      </Card>

      <Card title="Goods Receipts" className="mt-4">
        <DataTable<GRN> rows={grns} rowKey={(r) => `${r.Mblnr}/${r.Mjahr}/${r.Zeile}`} empty="No goods receipt posted yet."
          columns={[
            { key: 'Mblnr', header: 'GRN Number', render: (r) => <b>{r.Mblnr}</b> },
            { key: 'Matnr', header: 'Material', hideBelow: 'md' },
            { key: 'Qty', header: 'Quantity', align: 'right', render: (r) => `${Number(r.Qty) || 0} ${r.Meins || ''}`.trim() },
            { key: 'Value', header: 'GRN Value', align: 'right', render: (r) => fmtInr(r.Value) },
            { key: 'PostedOn', header: 'Posted On', align: 'right', hideBelow: 'md', render: (r) => fmtDate(r.PostedOn) },
          ]} />
      </Card>

      {!posted && <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-800">
        Once the GRN is posted in SAP, the commitment converts to actual spend and the dashboard updates within the hour.
      </div>}

      <Modal open={confirm} title="Confirm PO" onClose={() => setConfirm(false)}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={doConfirm}>Confirm PO</Button></>}>
        <p className="text-[12px]">Confirm PO <b>{po.Ebeln}</b> with {po.Vendorname}?</p>
        <p className="mt-2 text-[12px] text-sap-muted">The commitment of {fmtInr(po.Amount)} will be deducted from the available budget in real time.</p>
      </Modal>
    </>
  );
}
