'use client';
import { useMemo, useState } from 'react';
import { Button, Chip, ErrorBox, Header, Kpi, Modal, Notice, TONE_CHIP, Table, useSelection, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { createDeliveries, errText, sapRead } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, date, daysBetween, qty, short, ymd } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Row } from '@/lib/types';

const keyOf = (r: Row) => `${r.VBELN}/${r.POSNR}`;
/** What can ship now: the open quantity up to what is available (ATP). */
const shippable = (r: Row) => Math.max(0, Math.min(Number(r.OPEN_QTY) || 0, Number(r.ATP_QTY) || 0));

/** Auto back order: open order lines, stock to ship them, delivery creation for what is available. */
export default function Backorders({ active, canWrite, notify }: ScreenProps) {
  const { f, setF, payload } = useFilters(90);
  const q = useLoad(() => sapRead('LIST_BACKORDERS', payload()), active, { rows: [] as Row[], truncated: false });
  const sel = useSelection();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ deliveries: Row[]; messages: { TYPE: string; MESSAGE: string }[] } | null>(null);
  const today = ymd(new Date());
  const rows = q.data.rows;
  const k = useMemo(() => {
    const open = rows.reduce((s, r) => s + (Number(r.OPEN_VALUE) || 0), 0);
    const can = rows.filter((r) => shippable(r) > 0);
    const late = rows.filter((r) => r.EDATU && r.EDATU < today);
    const fill = rows.reduce((a, r) => ({ ord: a.ord + (Number(r.ORDER_QTY) || 0), del: a.del + (Number(r.DELIVERED_QTY) || 0) }), { ord: 0, del: 0 });
    return { open, can: can.length, late: late.length, fill: fill.ord ? Math.round((fill.del / fill.ord) * 100) : 0 };
  }, [rows, today]);

  const chosen = rows.filter((r) => sel.selected.has(keyOf(r)) && shippable(r) > 0);
  const run = async () => {
    setConfirm(false); setBusy(true);
    try {
      const r = await createDeliveries(chosen.map((x) => ({ VBELN: x.VBELN, POSNR: x.POSNR, QTY: shippable(x) })));
      setResult(r);
      notify(r.deliveries.length ? `${r.deliveries.length} delivery(ies) created in SAP.` : 'SAP created no delivery; see the messages.', r.deliveries.length ? 'success' : 'error');
      sel.clear(); void q.reload();
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title="Back Orders" hint="Open sales order lines with stock available to promise (ATP). Lines with stock can be delivered now; the rest waits." />
      <FilterBar f={f} setF={setF} onLoad={() => void q.reload()} loading={q.loading}>
        <Button onClick={() => void downloadXlsx('back-orders.xlsx', rows, [{ key: 'VBELN', label: 'Order' }, { key: 'POSNR', label: 'Item' }, { key: 'NAME1', label: 'Customer' }, { key: 'MATNR', label: 'Material' }, { key: 'MAKTX', label: 'Description' }, { key: 'ORDER_QTY', label: 'Ordered' }, { key: 'OPEN_QTY', label: 'Open' }, { key: 'ATP_QTY', label: 'Available' }, { key: 'EDATU', label: 'Requested' }, { key: 'WERKS', label: 'Plant' }])} disabled={!rows.length}>Excel</Button>
        {canWrite && <Button variant="success" onClick={() => setConfirm(true)} disabled={!chosen.length || busy}>{busy ? 'Creating…' : `Create deliveries (${chosen.length})`}</Button>}
      </FilterBar>
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open lines" value={rows.length.toLocaleString('en-IN')} sub={`₹ ${short(k.open)} open value`} />
        <Kpi label="Can ship now" value={k.can.toLocaleString('en-IN')} sub="lines with stock" tone="green" />
        <Kpi label="Past requested date" value={k.late.toLocaleString('en-IN')} tone="red" />
        <Kpi label="Fill rate" value={`${k.fill}%`} sub="delivered / ordered qty" tone="amber" />
      </div>
      <Table rows={rows} loading={q.loading} rowKey={keyOf} empty="No open order lines in this period." selected={sel.selected} onToggle={sel.toggle} onToggleAll={sel.toggleAll} selectable={(r) => shippable(r) > 0}
        cols={[
          { key: 'VBELN', label: 'Order', render: (r) => <span className="font-mono">{alpha(r.VBELN)}/{alpha(r.POSNR)}</span> },
          { key: 'NAME1', label: 'Customer', render: (r) => `${alpha(r.KUNNR)} ${r.NAME1 ?? ''}` },
          { key: 'MATNR', label: 'Material', render: (r) => <span title={r.MAKTX}>{alpha(r.MATNR)} <span className="text-sap-muted">{r.MAKTX}</span></span> },
          { key: 'ORDER_QTY', label: 'Ordered', num: true, render: (r) => qty(r.ORDER_QTY) },
          { key: 'OPEN_QTY', label: 'Open', num: true, render: (r) => qty(r.OPEN_QTY) },
          { key: 'ATP_QTY', label: 'Available', num: true, render: (r) => qty(r.ATP_QTY) },
          { key: 'ship', label: 'Ship now', num: true, render: (r) => (shippable(r) ? <b>{qty(shippable(r))}</b> : ''), value: shippable },
          { key: 'VRKME', label: 'UoM' },
          { key: 'EDATU', label: 'Requested', render: (r) => { const d = daysBetween(r.EDATU, today); return <span className={d !== null && d > 0 ? 'font-bold text-red-700' : ''}>{date(r.EDATU)}{d !== null && d > 0 ? ` (+${d}d)` : ''}</span>; } },
          { key: 'WERKS', label: 'Plant' },
          { key: 'blk', label: '', render: (r) => (r.DELIV_BLOCK ? <Chip cls={TONE_CHIP.bad}>block {r.DELIV_BLOCK}</Chip> : '') },
        ]} />
      <Modal open={confirm} title="Create deliveries in SAP?" onClose={() => setConfirm(false)} footer={<><Button onClick={() => setConfirm(false)}>No</Button><Button variant="success" onClick={() => void run()}>Yes, create</Button></>}>
        <p className="text-sm">{chosen.length} line(s) from {new Set(chosen.map((c) => c.VBELN)).size} order(s), each for the quantity that can ship now. SAP groups lines into deliveries by ship-to, route and date.</p>
      </Modal>
      <Modal open={!!result} title="SAP delivery result" onClose={() => setResult(null)}>
        {result && <>
          {result.deliveries.length > 0 && <Notice>Deliveries: {result.deliveries.map((d) => alpha(d.VBELN ?? d)).join(', ')}</Notice>}
          <ul className="space-y-1 text-xs">{result.messages.map((m, i) => <li key={i} className={m.TYPE === 'E' ? 'text-red-700' : ''}><b>{m.TYPE}</b> {m.MESSAGE}</li>)}</ul>
        </>}
      </Modal>
    </div>
  );
}
