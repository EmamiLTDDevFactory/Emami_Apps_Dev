'use client';
import { useEffect, useState } from 'react';
import { Button, Chip, Header, Modal, Notice, TONE_CHIP, Table, Toolbar, type ScreenProps } from '../ui';
import { createSo, errText, listPos } from '@/lib/api';
import { alpha, date, dateTime, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { STATUS_INFO, type Po, type SoResult } from '@/lib/types';

function Messages({ r }: { r: SoResult }) {
  return (
    <ul className="space-y-1 text-xs">
      {r.messages.map((m, i) => <li key={i} className={m.TYPE === 'E' || m.TYPE === 'A' ? 'text-red-700' : m.TYPE === 'W' ? 'text-amber-800' : 'text-sap-ink'}><b>{m.TYPE}</b> {m.MESSAGE}</li>)}
      {!r.messages.length && <li className="text-sap-muted">SAP returned no messages.</li>}
    </ul>
  );
}

/** Step 3: ready POs become SAP sales orders. Simulate first (SAP pricing, ATP and credit without saving), then create. */
export default function SalesOrders({ active, canWrite, notify, arg }: ScreenProps) {
  const list = useLoad(() => listPos(['ready', 'creating', 'so_unknown', 'so_created']), active, [] as Po[]);
  const [sim, setSim] = useState<{ po: Po; result: SoResult } | null>(null);
  const [confirm, setConfirm] = useState<Po | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  useEffect(() => { if (active && arg !== undefined) void list.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [arg, active]);

  const simulate = async (po: Po) => {
    setBusyId(po.id);
    try { setSim(await createSo(po.id, true)); } catch (e) { notify(errText(e), 'error'); } finally { setBusyId(null); }
  };
  const create = async (po: Po) => {
    setConfirm(null);
    setBusyId(po.id);
    try {
      const r = await createSo(po.id, false);
      if (r.result.vbeln) notify(`Sales order ${alpha(r.result.vbeln)} created for PO ${po.header.BSTKD}.`, 'success');
      else notify(`SAP did not create the order for PO ${po.header.BSTKD}: ${r.result.messages.filter((m) => m.TYPE === 'E' || m.TYPE === 'A').map((m) => m.MESSAGE).join(' ') || 'see the messages.'}`, 'error');
      if (!r.result.vbeln) setSim(r);
    } catch (e) { notify(errText(e), 'error'); } finally { setBusyId(null); void list.reload(); }
  };

  const ready = list.data.filter((p) => p.status !== 'so_created');
  const done = list.data.filter((p) => p.status === 'so_created');
  const soRes = (p: Po) => (p.soResult && 'vbeln' in p.soResult ? p.soResult : null);

  return (
    <div>
      <Header title="Sales Order Creation" hint="Ready POs go to SAP as sales orders (BAPI_SALESORDER_CREATEFROMDAT2). SAP refuses a second order for the same customer and PO number." />
      {!canWrite && <Notice tone="warn">Your role is read only: you cannot create sales orders.</Notice>}
      {list.data.some((p) => p.status === 'so_unknown') && <Notice tone="warn">SAP did not confirm one or more orders (timeout). Look the PO number up in Order Tracker before retrying; a retry for the same PO is refused by SAP if the order exists.</Notice>}
      <Toolbar>
        <h3 className="flex-1 font-display text-sm font-bold">Ready for SAP · {ready.length}</h3>
        <Button onClick={() => void list.reload()} disabled={list.loading}>Refresh</Button>
      </Toolbar>
      {list.error && <p className="mb-2 text-xs text-red-700">{list.error}</p>}
      <Table rows={ready} loading={list.loading} rowKey={(r) => String(r.id)} empty="No PO is ready. Validate POs first." search={false}
        cols={[
          { key: 'bstkd', label: 'Customer PO', render: (r) => <span className="font-mono font-bold">{r.header.BSTKD}</span>, value: (r) => r.header.BSTKD },
          { key: 'cust', label: 'Customer', render: (r) => `${alpha(r.header.KUNNR)} ${r.header.NAME1 || r.header.CUSTOMER_NAME}` },
          { key: 'area', label: 'Sales area', render: (r) => `${r.header.VKORG}/${r.header.VTWEG}/${r.header.SPART}` },
          { key: 'deliv', label: 'Delivery', render: (r) => date(r.header.DELIVERY_DATE) },
          { key: 'lineCount', label: 'Lines', num: true },
          { key: 'status', label: 'Status', render: (r) => <Chip cls={STATUS_INFO[r.status as Po['status']].cls}>{STATUS_INFO[r.status as Po['status']].label}</Chip> },
          { key: 'act', label: '', render: (r) => (
            <div className="flex gap-1.5">
              <Button onClick={() => void simulate(r as Po)} disabled={busyId !== null || r.status !== 'ready'}>{busyId === r.id ? 'Working…' : 'Simulate'}</Button>
              {canWrite && <Button variant="success" onClick={() => setConfirm(r as Po)} disabled={busyId !== null || r.status !== 'ready'}>Create SO</Button>}
            </div>
          ) },
        ]} />

      <h3 className="mb-2 mt-5 font-display text-sm font-bold">Created sales orders · {done.length}</h3>
      <Table rows={done} rowKey={(r) => String(r.id)} empty="None yet."
        cols={[
          { key: 'soNumber', label: 'Sales order', render: (r) => <span className="font-mono font-bold text-plum">{alpha(r.soNumber)}</span>, value: (r) => r.soNumber },
          { key: 'bstkd', label: 'Customer PO', render: (r) => <span className="font-mono">{r.header.BSTKD}</span>, value: (r) => r.header.BSTKD },
          { key: 'cust', label: 'Customer', render: (r) => r.header.NAME1 || r.header.CUSTOMER_NAME },
          { key: 'net', label: 'Net value', num: true, render: (r) => money(soRes(r as Po)?.netValue), value: (r) => soRes(r as Po)?.netValue ?? 0 },
          { key: 'touched', label: 'Touchless', render: (r) => (r.touched ? <Chip cls={TONE_CHIP.mute}>edited</Chip> : <Chip cls={TONE_CHIP.good}>yes</Chip>) },
          { key: 'warn', label: 'SAP notes', render: (r) => { const w = soRes(r as Po)?.messages.filter((m) => m.TYPE === 'W').length ?? 0; return w ? <Chip cls={TONE_CHIP.warn}>{w} warning(s)</Chip> : ''; } },
          { key: 'updatedAt', label: 'Created', render: (r) => dateTime(r.updatedAt), value: (r) => r.updatedAt },
        ]} />

      <Modal open={!!sim} title={sim ? `${sim.result.testrun ? 'Simulation' : 'SAP answer'} · PO ${sim.po.header.BSTKD}` : ''} onClose={() => setSim(null)} wide
        footer={sim && sim.result.testrun && canWrite && sim.po.status === 'ready' ? <><Button onClick={() => setSim(null)}>Close</Button><Button variant="success" onClick={() => { const p = sim.po; setSim(null); setConfirm(p); }}>Create SO</Button></> : undefined}>
        {sim && (
          <>
            <p className="mb-2 text-sm">Net value <b>{money(sim.result.netValue)} {sim.result.currency}</b> · {sim.result.items.length} item(s)</p>
            {sim.result.items.length > 0 && (
              <table className="glass-table mb-3 min-w-full border-separate border-spacing-0 text-xs">
                <thead><tr>{['Item', 'Material', 'Qty', 'Net price', 'Net value', 'Confirmed'].map((h) => <th key={h} className="px-2 py-1.5 text-left text-2xs uppercase">{h}</th>)}</tr></thead>
                <tbody>{sim.result.items.map((it, i) => <tr key={i}><td className="border-b px-2 py-1">{alpha(it.POSNR)}</td><td className="border-b px-2 py-1 font-mono">{alpha(it.MATNR)}</td><td className="border-b px-2 py-1 text-right">{it.QTY}</td><td className="border-b px-2 py-1 text-right">{money(it.NETPR)}</td><td className="border-b px-2 py-1 text-right">{money(it.NETWR)}</td><td className="border-b px-2 py-1 text-right">{it.CONF_QTY}</td></tr>)}</tbody>
              </table>
            )}
            <Messages r={sim.result} />
          </>
        )}
      </Modal>
      <Modal open={!!confirm} title="Create the sales order in SAP?" onClose={() => setConfirm(null)} footer={<><Button onClick={() => setConfirm(null)}>No</Button><Button variant="success" onClick={() => confirm && void create(confirm)}>Yes, create</Button></>}>
        {confirm && <p className="text-sm">PO <b>{confirm.header.BSTKD}</b> for {confirm.header.NAME1 || confirm.header.CUSTOMER_NAME} ({confirm.lineCount} lines) becomes a sales order in SAP. This cannot be undone here.</p>}
      </Modal>
    </div>
  );
}
