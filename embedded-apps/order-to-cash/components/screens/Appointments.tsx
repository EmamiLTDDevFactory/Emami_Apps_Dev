'use client';
import { useMemo, useState } from 'react';
import { Button, Chip, ErrorBox, Field, Header, Input, Kpi, Modal, Select, TONE_CHIP, Table, type ScreenProps } from '../ui';
import { FilterBar, useFilters } from '../Filters';
import { errText, listAppointments, sapRead, saveAppointment } from '@/lib/api';
import { alpha, date, fromInput, qty, toInput, ymd } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import type { Appointment, Row } from '@/lib/types';

const STATUS: { value: Appointment['status']; label: string; tone: string }[] = [
  { value: 'requested', label: 'Requested', tone: TONE_CHIP.warn },
  { value: 'confirmed', label: 'Confirmed', tone: TONE_CHIP.good },
  { value: 'rescheduled', label: 'Rescheduled', tone: TONE_CHIP.info },
  { value: 'missed', label: 'Missed', tone: TONE_CHIP.bad },
  { value: 'done', label: 'Delivered', tone: TONE_CHIP.good },
  { value: 'cancelled', label: 'Cancelled', tone: TONE_CHIP.mute },
];

/** Delivery appointments with modern-trade customers (DC slots): one per SAP delivery, kept by the app. */
export default function Appointments({ active, canWrite, notify }: ScreenProps) {
  const { f, setF, payload } = useFilters(30);
  const dl = useLoad(() => sapRead('LIST_DELIVERIES', payload()), active, { rows: [] as Row[], truncated: false });
  const ap = useLoad(() => listAppointments(), active, [] as Appointment[]);
  const [edit, setEdit] = useState<Partial<Appointment> & { delivery: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const byDel = useMemo(() => new Map(ap.data.map((a) => [a.delivery, a])), [ap.data]);
  const rows = useMemo(() => dl.data.rows.map((r): Row => ({ ...r, __ap: byDel.get(String(r.VBELN).padStart(10, '0')) })), [dl.data.rows, byDel]);
  const today = ymd(new Date());
  const k = {
    none: rows.filter((r) => !r.__ap).length,
    today: rows.filter((r) => r.__ap?.slot_date === today).length,
    missed: rows.filter((r) => r.__ap?.status === 'missed').length,
  };

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try { await saveAppointment(edit); notify(`Appointment for delivery ${alpha(edit.delivery)} saved.`, 'success'); setEdit(null); void ap.reload(); }
    catch (e) { notify(errText(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div>
      <Header title="Appointments" hint="Book, confirm and track the customer's delivery slot for each SAP delivery. Missed appointments are the first cause of rejected deliveries." />
      <FilterBar f={f} setF={setF} onLoad={() => { void dl.reload(); void ap.reload(); }} loading={dl.loading} />
      <ErrorBox error={dl.error || ap.error} onRetry={() => { void dl.reload(); void ap.reload(); }} />
      <div className="mb-3 grid grid-cols-3 gap-3">
        <Kpi label="Without appointment" value={k.none} tone="amber" />
        <Kpi label="Slots today" value={k.today} tone="green" />
        <Kpi label="Missed" value={k.missed} tone="red" />
      </div>
      <Table rows={rows} loading={dl.loading} rowKey={(r) => String(r.VBELN)} empty="Load deliveries from SAP."
        cols={[
          { key: 'VBELN', label: 'Delivery', render: (r) => <span className="font-mono font-bold">{alpha(r.VBELN)}</span> },
          { key: 'LFDAT', label: 'Planned', render: (r) => date(r.LFDAT) },
          { key: 'NAME1', label: 'Ship-to', render: (r) => `${alpha(r.KUNNR)} ${r.NAME1 ?? ''}` },
          { key: 'ORT01', label: 'City' },
          { key: "SALES_ORDER", label: "Order", render: (r) => <span className="font-mono">{alpha(r.SALES_ORDER)}</span> },
          { key: 'TOTAL_QTY', label: 'Qty', num: true, render: (r) => qty(r.TOTAL_QTY) },
          { key: 'pgi', label: 'Goods issue', render: (r) => (String(r.WBSTK) === 'C' ? <Chip cls={TONE_CHIP.good}>{date(r.WADAT_IST)}</Chip> : <Chip cls={TONE_CHIP.mute}>not yet</Chip>), value: (r) => r.WBSTK },
          { key: 'slot', label: 'Appointment', render: (r) => (r.__ap ? `${date(r.__ap.slot_date)} ${r.__ap.slot_time}` : '—'), value: (r) => r.__ap?.slot_date ?? '' },
          { key: 'ref', label: 'Ref.', render: (r) => r.__ap?.reference ?? '' },
          { key: 'st', label: 'Status', render: (r) => { const s = STATUS.find((x) => x.value === r.__ap?.status); return s ? <Chip cls={s.tone}>{s.label}</Chip> : ''; }, value: (r) => r.__ap?.status ?? '' },
          { key: 'act', label: '', render: (r) => canWrite ? <Button onClick={() => setEdit(r.__ap ? { ...r.__ap } : { delivery: String(r.VBELN), kunnr: r.KUNNR, name1: r.NAME1, slot_date: r.LFDAT, slot_time: '', location: r.ORT01 ?? '', reference: '', status: 'requested', note: '' })}>{r.__ap ? 'Edit' : 'Book'}</Button> : '' },
        ]} />
      <Modal open={!!edit} title={edit ? `Appointment · delivery ${alpha(edit.delivery)}` : ''} onClose={() => setEdit(null)} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>Save</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={toInput(edit.slot_date ?? '')} onChange={(v) => setEdit({ ...edit, slot_date: fromInput(v) })} className="w-full" /></Field>
            <Field label="Time slot"><Input value={edit.slot_time ?? ''} onChange={(v) => setEdit({ ...edit, slot_time: v })} placeholder="10:00-12:00" className="w-full" /></Field>
            <Field label="DC / location"><Input value={edit.location ?? ''} onChange={(v) => setEdit({ ...edit, location: v })} className="w-full" /></Field>
            <Field label="Customer appointment no."><Input value={edit.reference ?? ''} onChange={(v) => setEdit({ ...edit, reference: v })} className="w-full" /></Field>
            <Field label="Status"><Select value={edit.status ?? 'requested'} onChange={(v) => setEdit({ ...edit, status: v as Appointment['status'] })} options={STATUS} className="w-full" /></Field>
            <Field label="Note"><Input value={edit.note ?? ''} onChange={(v) => setEdit({ ...edit, note: v })} className="w-full" /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
