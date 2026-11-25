'use client';
import { useMemo, useState } from 'react';
import { Button, Chip, ErrorBox, Header, Notice, TONE_CHIP, Table, useSelection, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { errText, listFlags, sapRead, setFlags } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, date, dateTime, qty } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Row } from '@/lib/types';

const ASN_COLS = [
  { key: 'BSTKD', label: 'Customer PO' }, { key: 'VBELN', label: 'Delivery' }, { key: 'INVOICE', label: 'Invoice' }, { key: 'WADAT_IST', label: 'Dispatch date' },
  { key: 'POSNR', label: 'Item' }, { key: 'KDMAT', label: 'Customer article' }, { key: 'EAN11', label: 'EAN' }, { key: 'MATNR', label: 'Material' }, { key: 'MAKTX', label: 'Description' },
  { key: 'LFIMG', label: 'Quantity' }, { key: 'VRKME', label: 'UoM' }, { key: 'CHARG', label: 'Batch' }, { key: 'HSDAT', label: 'Mfg date' }, { key: 'VFDAT', label: 'Expiry date' },
  { key: 'MRP', label: 'MRP' }, { key: 'TRUCK', label: 'Vehicle' }, { key: 'LR_NO', label: 'LR no.' },
];

/** ASN: after goods issue, the customer gets the shipment notice (PO, invoice, items, batches, expiry). Excel per the usual
 *  modern-trade portal upload; the app records that it was sent. */
export default function Asn({ active, canWrite, notify }: ScreenProps) {
  const { f, setF, payload } = useFilters(15);
  const dl = useLoad(() => sapRead('LIST_DELIVERIES', { ...payload(), PGI_DONE: 'X' }), active, { rows: [] as Row[], truncated: false });
  const flags = useLoad(() => listFlags('asn'), active, [] as { ref: string; by_user: string; at: string }[]);
  const sel = useSelection();
  const [busy, setBusy] = useState(false);
  const sent = useMemo(() => new Map(flags.data.map((x) => [x.ref, x])), [flags.data]);
  const rows = dl.data.rows.map((r): Row => ({ ...r, __sent: sent.get(String(r.VBELN).padStart(10, '0')) }));

  const build = async (markSent: boolean) => {
    const chosen = rows.filter((r) => sel.selected.has(String(r.VBELN)));
    if (!chosen.length) return;
    setBusy(true);
    try {
      const items = (await sapRead('DELIVERY_ITEMS', { VBELNS: chosen.map((c) => String(c.VBELN).padStart(10, '0')) })).rows;
      const head = new Map(chosen.map((c) => [String(c.VBELN).padStart(10, '0'), c]));
      const out = items.map((it) => { const h: Row = head.get(String(it.VBELN).padStart(10, "0")) ?? {}; return { ...it, BSTKD: h.BSTKD, INVOICE: alpha(h.INVOICE), WADAT_IST: date(h.WADAT_IST), VBELN: alpha(it.VBELN), MATNR: alpha(it.MATNR), HSDAT: date(it.HSDAT), VFDAT: date(it.VFDAT), TRUCK: h.TRUCK ?? '', LR_NO: h.LR_NO ?? '' }; });
      if (!out.length) { notify('SAP returned no items for these deliveries.', 'error'); return; }
      await downloadXlsx(`ASN-${chosen.length === 1 ? alpha(chosen[0].VBELN) : new Date().toISOString().slice(0, 10)}.xlsx`, out, ASN_COLS);
      if (markSent && canWrite) { await setFlags('asn', chosen.map((c) => String(c.VBELN)), { lines: out.length }); void flags.reload(); }
      notify(`ASN for ${chosen.length} delivery(ies), ${out.length} line(s)${markSent ? ' — marked as sent' : ''}.`, 'success');
      sel.clear();
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title="Advance Shipping Note" hint="Deliveries with goods issue done. Build the ASN (customer article, EAN, batch, expiry, quantity) and record that it was sent before the truck arrives." />
      <FilterBar f={f} setF={setF} onLoad={() => { void dl.reload(); void flags.reload(); }} loading={dl.loading}>
        <Button onClick={() => void build(false)} disabled={!sel.selected.size || busy}>Download ASN</Button>
        {canWrite && <Button variant="primary" onClick={() => void build(true)} disabled={!sel.selected.size || busy}>{busy ? 'Building…' : 'Download and mark sent'}</Button>}
      </FilterBar>
      <ErrorBox error={dl.error} onRetry={() => void dl.reload()} />
      {rows.some((r) => !r.__sent) && <Notice>{rows.filter((r) => !r.__sent).length} dispatched delivery(ies) without an ASN sent.</Notice>}
      <Table rows={rows} loading={dl.loading} rowKey={(r) => String(r.VBELN)} selected={sel.selected} onToggle={sel.toggle} onToggleAll={sel.toggleAll} empty="No dispatched deliveries in this period."
        cols={[
          { key: 'VBELN', label: 'Delivery', render: (r) => <span className="font-mono font-bold">{alpha(r.VBELN)}</span> },
          { key: 'WADAT_IST', label: 'Goods issue', render: (r) => date(r.WADAT_IST) },
          { key: 'NAME1', label: 'Ship-to', render: (r) => `${alpha(r.KUNNR)} ${r.NAME1 ?? ''}` },
          { key: 'BSTKD', label: 'Customer PO', render: (r) => <span className="font-mono">{r.BSTKD}</span> },
          { key: 'INVOICE', label: 'Invoice', render: (r) => <span className="font-mono">{alpha(r.INVOICE)}</span> },
          { key: 'ITEMS', label: 'Items', num: true },
          { key: 'TOTAL_QTY', label: 'Qty', num: true, render: (r) => qty(r.TOTAL_QTY) },
          { key: 'sent', label: 'ASN', render: (r) => (r.__sent ? <Chip cls={TONE_CHIP.good} title={r.__sent.by_user}>sent {dateTime(r.__sent.at)}</Chip> : <Chip cls={TONE_CHIP.warn}>not sent</Chip>), value: (r) => (r.__sent ? 1 : 0) },
        ]} />
    </div>
  );
}
