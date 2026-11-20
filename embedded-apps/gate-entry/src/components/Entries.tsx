'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronRight, Clock, LogOut as OutIcon, Printer, RefreshCw, Search, ShieldAlert, Trash2 } from 'lucide-react';
import { cancelEntry, deleteLine, getEntry, recordOutTime, searchEntries, zeroLine } from '@/lib/gate';
import { fmtDate, fmtQty, fmtTime, isoWeekNo, monthKey, monthLabel, weekRange, weekStart } from '@/lib/format';
import type { EntryDetail, EntryItem, EntrySummary } from '@/lib/types';
import { Button, Card, cx, Drawer, Empty, Field, inputCls, Modal, Pill, Skeleton, Spinner } from './ui';
import { openPdf } from './print';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

interface Filters { year: string; reqNo: string; poNo: string; asnNo: string; truckNo: string; reqFrom: string; reqTo: string; inFrom: string; inTo: string }
type GroupBy = 'reqDate' | 'truckDate';

const blank = (): Filters => ({ year: String(new Date().getFullYear()), reqNo: '', poNo: '', asnNo: '', truckNo: '', reqFrom: '', reqTo: '', inFrom: '', inTo: '' });

/** SAP is searched per year, so a date range makes us read every year it touches (capped at 5). */
function yearsFor(q: Filters): string[] {
  const now = new Date().getFullYear();
  const ys: number[] = [];
  for (const [from, to] of [[q.reqFrom, q.reqTo], [q.inFrom, q.inTo]]) {
    if (from) ys.push(Number(from.slice(0, 4)), to ? Number(to.slice(0, 4)) : now);
    else if (to) ys.push(Number(to.slice(0, 4)));
  }
  if (!ys.length) return [q.year];
  const hi = Math.max(...ys);
  const lo = Math.max(Math.min(...ys), hi - 4);
  return Array.from({ length: hi - lo + 1 }, (_, i) => String(hi - i));
}

const inRange = (d: string | null, from: string, to: string) => (!from && !to) || (!!d && (!from || d >= from) && (!to || d <= to));

interface Week { key: string; label: string; rows: EntrySummary[] }
interface Month { key: string; label: string; count: number; weeks: Week[] }

/** Newest first; rows without the grouping date go to a trailing "No date" month. */
function group(rows: EntrySummary[], by: GroupBy): Month[] {
  const months = new Map<string, Map<string, EntrySummary[]>>();
  for (const r of rows) {
    const d = r[by];
    const m = d ? monthKey(d) : 'none';
    const w = d ? weekStart(d) : 'none';
    if (!months.has(m)) months.set(m, new Map());
    const wk = months.get(m)!;
    wk.set(w, [...(wk.get(w) ?? []), r]);
  }
  return [...months.entries()]
    .sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)))
    .map(([key, wk]) => {
      const weeks = [...wk.entries()]
        .sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : b.localeCompare(a)))
        .map(([w, rs]) => ({ key: `${key}|${w}`, label: w === 'none' ? 'No date' : `Week ${isoWeekNo(w)} · ${weekRange(w)}`, rows: rs }));
      return { key, label: key === 'none' ? 'No date' : monthLabel(key), count: weeks.reduce((n, w) => n + w.rows.length, 0), weeks };
    });
}

export default function Entries({ mode, openReq, onCloseReq }: { mode: 'all' | 'out'; openReq: string | null; onCloseReq: () => void }) {
  const [f, setF] = useState<Filters>({ ...blank(), reqNo: openReq ?? '' });
  const [applied, setApplied] = useState<Filters>(f);
  const [rows, setRows] = useState<EntrySummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<EntrySummary | { reqNo: string } | null>(openReq ? { reqNo: openReq } : null);
  const [by, setBy] = useState<GroupBy>('reqDate');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<boolean | null>(null);

  const load = useCallback(async (q: Filters) => {
    setBusy(true);
    setErr('');
    try {
      const base = { reqNo: q.reqNo.trim() || undefined, poNo: q.poNo.trim() || undefined, asnNo: q.asnNo.trim() || undefined, truckNo: q.truckNo.trim() || undefined };
      const all = (await Promise.all(yearsFor(q).map((year) => searchEntries({ year: year || undefined, ...base })))).flat();
      const seen = new Set<string>();
      setRows(all.filter((r) => !seen.has(r.reqNo) && !!seen.add(r.reqNo)));
      setApplied(q);
      setToggled({});
      setBulk(null);
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

  const shown = useMemo(
    () => (rows ?? []).filter((r) => (mode === 'out' ? !r.truckOutDat : true) && inRange(r.reqDate, applied.reqFrom, applied.reqTo) && inRange(r.truckDate, applied.inFrom, applied.inTo)),
    [rows, mode, applied],
  );
  const months = useMemo(() => group(shown, by), [shown, by]);
  // Default: the newest month is open (everything when the list is short); the user's clicks override it.
  const isOpen = (m: Month, i: number) => toggled[m.key] ?? bulk ?? (i === 0 || shown.length <= 25);
  const closeDetail = () => {
    setSel(null);
    onCloseReq();
  };
  const dateInput = (label: string, key: 'reqFrom' | 'reqTo' | 'inFrom' | 'inTo') => (
    <Field label={label}>{(id) => <input id={id} type="date" className={inputCls} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />}</Field>
  );

  return (
    <div className="flex flex-col gap-3">
      <Card title={mode === 'out' ? 'Trucks inside - record the out time' : 'Gate entries'}>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(e) => { e.preventDefault(); void load(f); }}>
          <Field label="Year" hint={f.reqFrom || f.reqTo || f.inFrom || f.inTo ? 'Taken from the dates' : undefined}>{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={4} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Request number">{(id) => <input id={id} className={cx(inputCls, 'uppercase')} maxLength={12} value={f.reqNo} onChange={(e) => setF({ ...f, reqNo: e.target.value.toUpperCase() })} />}</Field>
          <Field label="PO number">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={10} value={f.poNo} onChange={(e) => setF({ ...f, poNo: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="ASN number">{(id) => <input id={id} className={inputCls} inputMode="numeric" value={f.asnNo} onChange={(e) => setF({ ...f, asnNo: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Vehicle number">{(id) => <input id={id} className={cx(inputCls, 'uppercase')} maxLength={20} placeholder="MH12* or *5521" value={f.truckNo} onChange={(e) => setF({ ...f, truckNo: e.target.value.toUpperCase() })} />}</Field>
          <div className="hidden lg:block" />
          {dateInput('Requested from', 'reqFrom')}
          {dateInput('Requested to', 'reqTo')}
          {dateInput('In date from', 'inFrom')}
          {dateInput('In date to', 'inTo')}
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={busy}>{busy ? <Spinner /> : <Search size={14} />} Search</Button>
            <Button aria-label="Clear filters" onClick={() => { const c = blank(); setF(c); void load(c); }}><RefreshCw size={14} /></Button>
          </div>
        </form>
      </Card>

      {err && <p className="rounded-xl border border-bad/30 bg-bad/[0.05] px-4 py-3 text-sm text-bad" role="alert">{err}</p>}
      {busy && !rows && <Card><Skeleton rows={6} /></Card>}
      {rows && !shown.length && (
        <Empty title={mode === 'out' ? 'No trucks inside' : 'No gate entries'} icon="🚚">{mode === 'out' ? 'Every entry found already has its out time.' : 'Nothing matches these filters.'}</Empty>
      )}
      {shown.length > 0 && (
        <Card
          title={`${shown.length} ${mode === 'out' ? 'truck(s) inside' : 'entr' + (shown.length === 1 ? 'y' : 'ies')}`}
          actions={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 font-semibold text-muted">
                Group by
                <select className="h-8 rounded-lg border border-line bg-panel px-2 text-xs font-semibold text-ink" value={by} onChange={(e) => { setBy(e.target.value as GroupBy); setToggled({}); }}>
                  <option value="reqDate">Requested date</option>
                  <option value="truckDate">In date</option>
                </select>
              </label>
              <Button size="sm" onClick={() => { setToggled({}); setBulk(true); }}>Expand all</Button>
              <Button size="sm" onClick={() => { setToggled({}); setBulk(false); }}>Collapse all</Button>
            </div>
          }
          bodyClass="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Request</th><th>Requested</th><th>Truck</th><th>In</th><th>ASN</th><th>By</th><th className="px-4">Out</th></tr>
              </thead>
              <tbody>
                {months.map((m, i) => {
                  const open = isOpen(m, i);
                  return (
                    <Fragment key={m.key}>
                      <tr className="cursor-pointer border-t border-line bg-accent/[0.06] hover:bg-accent/10" onClick={() => setToggled({ ...toggled, [m.key]: !open })}>
                        <td colSpan={7} className="px-4 py-2 text-sm font-extrabold">
                          <button type="button" className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
                            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            {m.label}
                            <span className="rounded-full bg-panel px-2 py-0.5 text-2xs font-bold text-muted">{m.count} {m.count === 1 ? 'entry' : 'entries'}</span>
                          </button>
                        </td>
                      </tr>
                      {open && m.weeks.map((w) => (
                        <Fragment key={w.key}>
                          <tr className="border-t border-line bg-sunken/70"><td colSpan={7} className="px-4 py-1.5 text-xs font-bold text-muted">{w.label} <span className="font-normal">· {w.rows.length}</span></td></tr>
                          {w.rows.map((r) => (
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
                        </Fragment>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Detail summary={sel} onClose={closeDetail} onChanged={() => void load(applied)} />
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
