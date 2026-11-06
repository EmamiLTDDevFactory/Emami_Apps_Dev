'use client';
import { useCallback, useEffect, useState } from 'react';
import { Ban, Clock, LogOut as OutIcon, Printer, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { cancelEntry, deleteLine, getEntry, recordOutTime, searchEntries, zeroLine } from '@/lib/gate';
import { fmtDate, fmtQty, fmtTime } from '@/lib/format';
import type { EntryDetail, EntryItem, EntrySummary } from '@/lib/types';
import { Button, Card, cx, Drawer, Empty, Field, inputCls, Modal, Pill, Skeleton, Spinner } from './ui';
import { openPdf } from './print';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface Filters { year: string; reqNo: string; poNo: string; asnNo: string; truckNo: string }

export default function Entries({ mode, openReq, onCloseReq }: { mode: 'all' | 'out'; openReq: string | null; onCloseReq: () => void }) {
  const [f, setF] = useState<Filters>({ year: String(new Date().getFullYear()), reqNo: openReq ?? '', poNo: '', asnNo: '', truckNo: '' });
  const [rows, setRows] = useState<EntrySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<EntrySummary | { reqNo: string } | null>(openReq ? { reqNo: openReq } : null);

  const load = useCallback(async (q: Filters) => {
    setBusy(true);
    setErr('');
    try {
      setRows(await searchEntries({ year: q.year || undefined, reqNo: q.reqNo.trim() || undefined, poNo: q.poNo.trim() || undefined, asnNo: q.asnNo.trim() || undefined, truckNo: q.truckNo.trim() || undefined }));
    } catch (e) {
      setErr(errText(e));
      setRows(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, mode]);

  const shown = (rows ?? []).filter((r) => (mode === 'out' ? !r.truckOutDat : true));
  const closeDetail = () => {
    setSel(null);
    onCloseReq();
  };

  return (
    <div className="flex flex-col gap-3">
      <Card title={mode === 'out' ? 'Trucks inside - record the out time' : 'Gate entries'}>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void load(f); }}>
          <Field label="Year">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={4} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Request number">{(id) => <input id={id} className={cx(inputCls, 'uppercase')} maxLength={12} value={f.reqNo} onChange={(e) => setF({ ...f, reqNo: e.target.value.toUpperCase() })} />}</Field>
          <Field label="PO number">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={10} value={f.poNo} onChange={(e) => setF({ ...f, poNo: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="ASN number">{(id) => <input id={id} className={inputCls} inputMode="numeric" value={f.asnNo} onChange={(e) => setF({ ...f, asnNo: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Vehicle number">{(id) => <input id={id} className={cx(inputCls, 'uppercase')} maxLength={20} placeholder="MH12* or *5521" value={f.truckNo} onChange={(e) => setF({ ...f, truckNo: e.target.value.toUpperCase() })} />}</Field>
          <div className="flex items-end gap-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={busy}>{busy ? <Spinner /> : <Search size={14} />} Search</Button>
            <Button aria-label="Clear filters" onClick={() => { const c = { year: String(new Date().getFullYear()), reqNo: '', poNo: '', asnNo: '', truckNo: '' }; setF(c); void load(c); }}><RefreshCw size={14} /></Button>
          </div>
        </form>
      </Card>

      {err && <p className="rounded-xl border border-bad/30 bg-bad/[0.05] px-4 py-3 text-sm text-bad" role="alert">{err}</p>}
      {busy && !rows && <Card><Skeleton rows={6} /></Card>}
      {rows && !shown.length && (
        <Empty title={mode === 'out' ? 'No trucks inside' : 'No gate entries'} icon="🚚">{mode === 'out' ? 'Every entry found already has its out time.' : 'Nothing matches these filters.'}</Empty>
      )}
      {shown.length > 0 && (
        <Card title={`${shown.length} ${mode === 'out' ? 'truck(s) inside' : 'entr' + (shown.length === 1 ? 'y' : 'ies')}`} bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Request</th><th>Requested</th><th>Truck</th><th>In</th><th>ASN</th><th>By</th><th className="px-4">Out</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.reqNo} className="cursor-pointer border-t border-line hover:bg-sunken/70" onClick={() => setSel(r)}>
                    <td className="px-4 py-2.5 font-mono font-bold text-accent">{r.reqNo}</td>
                    <td className="num">{fmtDate(r.reqDate)} {fmtTime(r.reqTime)}</td>
                    <td className="font-semibold">{r.truckNo}</td>
                    <td className="num">{fmtDate(r.truckDate)} {fmtTime(r.truckTim)}</td>
                    <td className="font-mono text-xs">{r.asnNo || '-'}</td>
                    <td className="text-xs text-muted">{r.reqBy}</td>
                    <td className="px-4">{r.truckOutDat ? <span className="num text-xs">{fmtDate(r.truckOutDat)} {fmtTime(r.truckOutTim)}</span> : <Pill tone="warn">inside</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Detail summary={sel} onClose={closeDetail} onChanged={() => void load(f)} />
    </div>
  );
}

function Detail({ summary, onClose, onChanged }: { summary: EntrySummary | { reqNo: string } | null; onClose: () => void; onChanged: () => void }) {
  const reqNo = summary?.reqNo ?? null;
  const [d, setD] = useState<EntryDetail | null>(null);
  const [err, setErr] = useState('');
  const [act, setAct] = useState<'' | 'pdf' | 'out' | 'cancel' | 'admin'>('');
  const [actErr, setActErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [adminErr, setAdminErr] = useState('');
  const outDone = summary && 'truckOutDat' in summary && !!summary.truckOutDat;

  useEffect(() => {
    setD(null); setErr(''); setActErr(''); setMsg(''); setReason(''); setAdminReason(''); setAdminErr('');
    if (!reqNo) return;
    getEntry(reqNo).then(setD).catch((e) => setErr(errText(e)));
  }, [reqNo]);

  /** Admin actions: SAP decides who may run them; its message is shown when it refuses. */
  const runAdmin = async (label: string, call: () => Promise<void>) => {
    if (!reqNo) return;
    setAct('admin');
    setAdminErr('');
    setMsg('');
    try {
      await call();
      setMsg(label);
      onChanged();
      setD(await getEntry(reqNo));
    } catch (e) {
      setAdminErr(errText(e));
    } finally {
      setAct('');
    }
  };

  const run = async (kind: 'pdf' | 'out' | 'cancel') => {
    if (!reqNo) return;
    setAct(kind);
    setActErr('');
    setMsg('');
    try {
      if (kind === 'pdf') await openPdf(reqNo);
      if (kind === 'out') { await recordOutTime(reqNo); setMsg('Out time recorded.'); onChanged(); }
      if (kind === 'cancel') { await cancelEntry(reqNo, reason); setCancelOpen(false); setMsg('Gate entry cancelled.'); onChanged(); }
    } catch (e) {
      setActErr(errText(e));
    } finally {
      setAct('');
      setConfirmOut(false);
    }
  };

  const h = d?.entries[0];
  return (
    <Drawer open={!!reqNo} onClose={onClose} width={860} title={<div><div className="text-2xs font-bold uppercase tracking-wide text-muted">Gate entry</div><div className="font-mono text-lg font-extrabold">{reqNo}</div></div>}>
      {err && <p className="text-sm text-bad">{err}</p>}
      {!d && !err && <Skeleton rows={8} />}
      {d && !d.entries.length && <Empty title="Not found">No gate entry {reqNo} for your plants.</Empty>}
      {h && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!!act} onClick={() => void run('pdf')}>{act === 'pdf' ? <Spinner /> : <Printer size={14} />} Print gate pass</Button>
            {!outDone && <Button disabled={!!act} onClick={() => setConfirmOut(true)}><OutIcon size={14} /> Record out time</Button>}
            <Button variant="danger" disabled={!!act} onClick={() => setCancelOpen(true)}><Ban size={14} /> Cancel entry</Button>
            <Button disabled={!!act} onClick={() => { setAdminErr(''); setAdminOpen(true); }}><ShieldAlert size={14} /> Admin</Button>
          </div>
          {msg && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm font-semibold text-good">{msg}</p>}
          {actErr && <p className="rounded-xl bg-bad/[0.06] px-3 py-2 text-sm text-bad" role="alert">{actErr}</p>}

          <div className="grid gap-2 sm:grid-cols-4">
            <Info label="Requested" value={`${fmtDate(h.reqDate)} ${fmtTime(h.reqTime)}`} />
            <Info label="By" value={h.reqBy} />
            <Info label="Truck" value={h.truckNo} />
            <Info label="Truck in" value={`${fmtDate(h.truckDate)} ${fmtTime(h.truckTim)}`} />
            <Info label="LR" value={`${h.lrno}${h.lrdt ? ` · ${fmtDate(h.lrdt)}` : ''}`} />
            <Info label="Freight vendor" value={h.vehVendrName || h.vehVendrNo} />
            <Info label="Invoice" value={`${h.invNo}${h.invDate ? ` · ${fmtDate(h.invDate)}` : ''}`} />
            <Info label={h.asnNo ? 'ASN' : 'Truck out'} value={h.asnNo || (summary && 'truckOutDat' in summary && summary.truckOutDat ? `${fmtDate(summary.truckOutDat)} ${fmtTime(summary.truckOutTim)}` : 'inside')} />
          </div>

          {d.entries.map((e) => (
            <Card key={`${e.slno}-${e.poNo}`} title={<span>PO <span className="font-mono">{e.poNo}</span> <span className="font-normal text-muted">· {e.poVendrName} ({e.poVendr}) · {e.regioDesc || e.regio}</span></span>} bodyClass="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted"><tr><th className="px-3 py-1.5">Item</th><th>Material</th><th>Description</th><th className="text-right">Received</th><th className="px-3">Unit</th></tr></thead>
                  <tbody>
                    {e.items.map((i) => (
                      <tr key={i.ebelp} className="border-t border-line"><td className="px-3 py-1.5 font-mono text-xs">{i.ebelp}</td><td className="font-mono text-xs">{i.matnr}</td><td>{i.txz01}</td><td className="num text-right font-semibold">{fmtQty(i.qntRecievd)}</td><td className="px-3">{i.meins}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={confirmOut} onClose={() => setConfirmOut(false)} title="Record truck out time"
        footer={<><Button onClick={() => setConfirmOut(false)}>Back</Button><Button variant="primary" disabled={!!act} onClick={() => void run('out')}>{act === 'out' ? <Spinner /> : <Clock size={14} />} Record now</Button></>}>
        <p className="text-sm">SAP records the current date and time as the out time of truck <strong>{h?.truckNo}</strong> for gate entry <span className="font-mono">{reqNo}</span>.</p>
      </Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={`Cancel gate entry ${reqNo ?? ''}`}
        footer={<><Button onClick={() => setCancelOpen(false)}>Back</Button><Button variant="danger" disabled={!reason.trim() || !!act} onClick={() => void run('cancel')}>{act === 'cancel' ? <Spinner /> : <Ban size={14} />} Cancel entry</Button></>}>
        <Field label="Reason for cancellation *" hint="SAP refuses it if the GRN is not reversed or you have no cancel authority for the plant.">
          {(id) => <textarea id={id} className={cx(inputCls, 'h-24 py-2')} maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Modal>
      <Modal open={adminOpen} onClose={() => setAdminOpen(false)} title={`Admin - gate entry ${reqNo ?? ''}`}
        footer={<Button onClick={() => setAdminOpen(false)}>Close</Button>}>
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-xs text-muted">Only SAP gate entry admins may do this; SAP refuses anyone else and its message is shown here.</p>
          {adminErr && <p className="rounded-xl bg-bad/[0.06] px-3 py-2 text-sm text-bad" role="alert">{adminErr}</p>}
          {d?.entries.map((e) => (
            <div key={`${e.slno}-${e.poNo}`} className="rounded-xl border border-line">
              <div className="border-b border-line bg-sunken px-3 py-1.5 text-xs font-bold">PO <span className="font-mono">{e.poNo || '-'}</span></div>
              {e.items.map((i: EntryItem) => (
                <div key={i.ebelp} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className="font-mono text-xs">{i.ebelp}</span>
                  <span className="min-w-0 flex-1 truncate">{i.txz01}</span>
                  <span className="num text-xs font-semibold">{fmtQty(i.qntRecievd)} {i.meins}</span>
                  <Button size="sm" disabled={!!act || i.qntRecievd === 0} onClick={() => void runAdmin(`Line ${i.ebelp} of PO ${i.ebeln} set to 0.`, () => zeroLine(i))}>Set to 0</Button>
                  <Button size="sm" variant="danger" disabled={!!act} aria-label={`Delete line ${i.ebelp}`} onClick={() => void runAdmin(`Line ${i.ebelp} of PO ${i.ebeln} deleted.`, () => deleteLine(i))}><Trash2 size={13} /></Button>
                </div>
              ))}
            </div>
          ))}
          <Field label="Admin cancel - reason *">
            {(id) => <textarea id={id} className={cx(inputCls, 'h-20 py-2')} maxLength={255} value={adminReason} onChange={(e) => setAdminReason(e.target.value)} />}
          </Field>
          <div>
            <Button variant="danger" disabled={!adminReason.trim() || !!act} onClick={() => void runAdmin('Gate entry cancelled (admin).', () => cancelEntry(reqNo!, adminReason, true))}>
              {act === 'admin' ? <Spinner /> : <Ban size={14} />} Admin cancel
            </Button>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-sunken/60 px-3 py-2">
      <div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="truncate text-sm font-bold" title={value}>{value?.trim() || '-'}</div>
    </div>
  );
}
