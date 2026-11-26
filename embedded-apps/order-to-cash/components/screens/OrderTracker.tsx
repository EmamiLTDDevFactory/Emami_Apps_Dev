'use client';
import { useMemo } from 'react';
import { Button, Chip, ErrorBox, Header, Kpi, TONE_CHIP, Table, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { sapRead } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, date, money, short } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Row } from '@/lib/types';

/** SAP overall / delivery status (GBSTK, LFSTK, WBSTK): A not yet, B partly, C complete. */
export function stageOf(r: Row): { label: string; tone: string; step: number } {
  // CMGST (overall credit status): B = not released, C = partly released
  if (['B', 'C'].includes(String(r.CMGST || '').toUpperCase())) return { label: 'Credit block', tone: TONE_CHIP.bad, step: 0 };
  if (r.INVOICE) return { label: String(r.GBSTK) === 'C' ? 'Invoiced' : 'Part invoiced', tone: TONE_CHIP.good, step: 4 };
  if (String(r.WBSTK) === 'C') return { label: 'Goods issued', tone: TONE_CHIP.info, step: 3 };
  if (r.DELIVERY) return { label: String(r.LFSTK) === 'C' ? 'Delivery created' : 'Part delivered', tone: TONE_CHIP.info, step: 2 };
  if (r.DELIV_BLOCK) return { label: 'Delivery block', tone: TONE_CHIP.bad, step: 1 };
  return { label: 'Open', tone: TONE_CHIP.warn, step: 1 };
}

const STEPS = ['Order', 'Delivery', 'Goods issue', 'Invoice'];
function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Stage ${step} of 4`}>
      {STEPS.map((s, i) => <span key={s} title={s} className={`h-1.5 w-6 rounded-full ${i < step ? 'bg-plum' : 'bg-sap-line'}`} />)}
    </div>
  );
}

/** Real-time order truth: every SAP sales order with its delivery, goods issue and invoice, and where it is stuck. */
export default function OrderTracker({ active }: ScreenProps) {
  const { f, setF, payload } = useFilters(30);
  const q = useLoad(() => sapRead('LIST_ORDERS', payload()), active, { rows: [] as Row[], truncated: false });
  const rows = useMemo(() => q.data.rows.map((r): Row => ({ ...r, __stage: stageOf(r) })), [q.data.rows]);
  const k = useMemo(() => {
    const n = rows.length;
    const val = rows.reduce((s, r) => s + (Number(r.NETWR) || 0), 0);
    const stuck = rows.filter((r) => r.__stage.step <= 1);
    const blocked = rows.filter((r) => /block/i.test(r.__stage.label));
    const inv = rows.filter((r) => r.__stage.step === 4).length;
    return { n, val, stuck: stuck.length, stuckVal: stuck.reduce((s, r) => s + (Number(r.NETWR) || 0), 0), blocked: blocked.length, invPct: n ? Math.round((inv / n) * 100) : 0 };
  }, [rows]);

  return (
    <div>
      <Header title="Order Tracker" hint="Every sales order from SAP with its document flow: delivery, goods issue, invoice. Orders still open are revenue at risk." />
      <FilterBar f={f} setF={setF} onLoad={() => void q.reload()} loading={q.loading}>
        <Button onClick={() => void downloadXlsx('orders.xlsx', rows.map((r) => ({ ...r, STAGE: r.__stage.label })), [
          { key: 'VBELN', label: 'Sales order' }, { key: 'ERDAT', label: 'Created' }, { key: 'BSTKD', label: 'Customer PO' }, { key: 'KUNNR', label: 'Customer' }, { key: 'NAME1', label: 'Name' },
          { key: 'NETWR', label: 'Net value' }, { key: 'STAGE', label: 'Stage' }, { key: 'DELIVERY', label: 'Delivery' }, { key: 'INVOICE', label: 'Invoice' }])} disabled={!rows.length}>Excel</Button>
      </FilterBar>
      <ErrorBox error={q.error} onRetry={() => void q.reload()} />
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Orders" value={k.n.toLocaleString('en-IN')} sub={`₹ ${short(k.val)} net`} />
        <Kpi label="Not yet delivered" value={k.stuck.toLocaleString('en-IN')} sub={`₹ ${short(k.stuckVal)} waiting`} tone="amber" />
        <Kpi label="Blocked" value={k.blocked.toLocaleString('en-IN')} sub="credit or delivery block" tone="red" />
        <Kpi label="Invoiced" value={`${k.invPct}%`} sub="of orders in the period" tone="green" />
      </div>
      {q.data.truncated && <p className="mb-2 text-xs text-amber-800">SAP returned the first rows only; narrow the dates or customer.</p>}
      <Table rows={rows} loading={q.loading} rowKey={(r) => String(r.VBELN)} empty="Load orders from SAP."
        cols={[
          { key: 'VBELN', label: 'Sales order', render: (r) => <span className="font-mono font-bold">{alpha(r.VBELN)}</span> },
          { key: 'ERDAT', label: 'Created', render: (r) => date(r.ERDAT) },
          { key: 'BSTKD', label: 'Customer PO', render: (r) => <span className="font-mono">{r.BSTKD}</span> },
          { key: 'NAME1', label: 'Customer', render: (r) => `${alpha(r.KUNNR)} ${r.NAME1 ?? ''}` },
          { key: 'NETWR', label: 'Net value', num: true, render: (r) => money(r.NETWR) },
          { key: 'stage', label: 'Stage', render: (r) => <div className="flex items-center gap-2"><Steps step={r.__stage.step} /><Chip cls={r.__stage.tone}>{r.__stage.label}</Chip></div>, value: (r) => r.__stage.step },
          { key: 'DELIVERY', label: 'Delivery', render: (r) => <span className="font-mono">{alpha(r.DELIVERY)}</span> },
          { key: 'INVOICE', label: 'Invoice', render: (r) => <span className="font-mono">{alpha(r.INVOICE)}</span> },
          { key: 'INV_DATE', label: 'Invoiced on', render: (r) => date(r.INV_DATE) },
        ]} />
    </div>
  );
}
