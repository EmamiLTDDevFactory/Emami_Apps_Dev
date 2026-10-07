'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, FileText, History, PackagePlus, Printer, RotateCcw, Search, Trash2, Truck } from 'lucide-react';
import { createFromAsn, createFromPos, getAsn, getPo, poHistory, searchAsn } from '@/lib/gate';
import { GateError } from '@/lib/sap';
import { daysBetween, fmtDate, fmtQty, nowHhmm, todayIso } from '@/lib/format';
import { checkHeader, checkLines, type Errors } from '@/lib/validate';
import type { AsnDetail, AsnSummary, Line, PoBlock, PoInfo, SharedHeader } from '@/lib/types';
import { Button, Card, cx, Empty, Field, inputBase, inputCls, Modal, Pill, Segmented, Spinner } from './ui';
import { openPdf } from './print';
import VehiclePhoto from './VehiclePhoto';

type Mode = 'PO' | 'ASN';

const blankHeader = (): SharedHeader => ({
  reqDate: todayIso(), truckNo: '', truckDate: todayIso(), truckTim: nowHhmm(), lrno: '', lrdt: '',
  frVendr: '02', vehVendrNo: '', vehVendrName: '', invNo: '', invDate: '',
});

const toLines = (items: { qntRecievd: number }[], fromAsn: boolean): Line[] =>
  items.map((i) => ({ ...(i as Line), selected: false, qntRecievd: fromAsn ? i.qntRecievd : 0 }));

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export default function NewEntry({ onOpenEntry }: { onOpenEntry: (reqNo: string) => void }) {
  const [mode, setMode] = useState<Mode>('PO');
  const [header, setHeader] = useState<SharedHeader>(blankHeader);
  // PO mode: POs already added to this entry + the one being looked at
  const [pos, setPos] = useState<PoBlock[]>([]);
  const [poNo, setPoNo] = useState('');
  const [current, setCurrent] = useState<PoBlock | null>(null);
  // ASN mode
  const [asnNo, setAsnNo] = useState('');
  const [asn, setAsn] = useState<AsnDetail | null>(null);
  const [asnLines, setAsnLines] = useState<Line[]>([]);
  const [asnPicker, setAsnPicker] = useState(false);

  const [busy, setBusy] = useState<'' | 'po' | 'asn' | 'save'>('');
  const [err, setErr] = useState<{ msg: string; field?: string } | null>(null);
  const [fieldErr, setFieldErr] = useState<Errors>({});
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const started = pos.length > 0 || !!current || !!asn;
  const set = (p: Partial<SharedHeader>) => setHeader((h) => ({ ...h, ...p }));

  const reset = () => {
    setHeader(blankHeader());
    setPos([]); setPoNo(''); setCurrent(null);
    setAsnNo(''); setAsn(null); setAsnLines([]);
    setErr(null); setFieldErr({}); setSaved(null); setConfirmDate(null);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    reset();
    setMode(m);
  };

  /* -------------------------------- PO -------------------------------- */
  const fetchPo = async () => {
    const n = poNo.trim();
    setErr(null);
    if (!/^\d{10}$/.test(n)) return setErr({ msg: 'PO number has 10 digits', field: 'poNo' });
    if (pos.some((p) => p.po.ebeln === n)) return setErr({ msg: 'The PO is already captured under this gate entry.', field: 'poNo' });
    setBusy('po');
    try {
      const { po, items } = await getPo(n);
      if (pos.length && pos[0].po.werks !== po.werks) {
        setErr({ msg: `All POs of one gate entry must belong to the same plant (${pos[0].po.werks}); PO ${n} is for plant ${po.werks}.`, field: 'poNo' });
      } else if (!items.length) {
        setErr({ msg: `PO ${n} has no open items to receive.`, field: 'poNo' });
      } else {
        setCurrent({ po, lines: toLines(items, false) });
      }
    } catch (e) {
      setErr({ msg: errText(e), field: e instanceof GateError ? e.field ?? 'poNo' : 'poNo' });
    } finally {
      setBusy('');
    }
  };

  /** "Add another PO": keeps the truck/invoice data, clears only the PO input. */
  const addCurrent = (): boolean => {
    if (!current) return true;
    const le = checkLines(current.lines);
    setFieldErr(le);
    if (Object.keys(le).length) {
      setErr({ msg: le._ || 'Check the quantities of the ticked lines.' });
      return false;
    }
    setPos((p) => [...p, current]);
    setCurrent(null);
    setPoNo('');
    setErr(null);
    return true;
  };

  /* -------------------------------- ASN ------------------------------- */
  const loadAsn = async (id: string) => {
    const n = id.trim();
    setErr(null);
    if (!/^\d{1,20}$/.test(n)) return setErr({ msg: 'Enter the ASN number', field: 'asnNo' });
    setBusy('asn');
    try {
      const r = await getAsn(n);
      setAsn(r.asn);
      setAsnNo(r.asn.shipId);
      setAsnLines(toLines(r.items, true));
      // header defaults come from the ASN; invoice number/date are fixed by it
      setHeader((h) => ({
        ...h,
        truckNo: r.asn.vehicleNo || h.truckNo,
        lrno: r.asn.lrNo || h.lrno,
        lrdt: r.asn.lrDate || h.lrdt,
        invNo: r.asn.invNum,
        invDate: r.asn.invDate || '',
      }));
    } catch (e) {
      setErr({ msg: errText(e), field: 'asnNo' });
    } finally {
      setBusy('');
    }
  };

  /* ------------------------------- save ------------------------------- */
  const save = async (confirm = false) => {
    setErr(null);
    const he = checkHeader(header, mode === 'ASN');
    let le: Errors = {};
    let blocks = pos;
    if (mode === 'PO') {
      if (current) {
        le = checkLines(current.lines);
        if (!Object.keys(le).length) blocks = [...pos, current];
      }
      if (!blocks.length && !Object.keys(le).length) return setErr({ msg: 'Enter a PO number and tick the received lines.', field: 'poNo' });
    } else {
      if (!asn) return setErr({ msg: 'Pick an ASN first.', field: 'asnNo' });
      le = checkLines(asnLines);
    }
    setFieldErr({ ...he, ...le });
    if (Object.keys(he).length || Object.keys(le).length) {
      return setErr({ msg: le._ || 'Some fields need attention - see the highlighted inputs.' });
    }
    // WD asked YES/NO when the request date is more than 7 days from today; SAP decides, this only warns early
    if (!confirm && Math.abs(daysBetween(todayIso(), header.reqDate)) > 7) {
      return setConfirmDate('The given entry date is more or less than 7 days of actual entry date. If you still want to make entry press YES else NO');
    }
    setBusy('save');
    try {
      const reqNo = mode === 'PO' ? await createFromPos(header, blocks, confirm) : await createFromAsn(header, asn!, asnLines, confirm);
      setSaved(reqNo);
    } catch (e) {
      if (e instanceof GateError && e.code === 'CONFIRM_DATE') setConfirmDate(e.message);
      else setErr({ msg: errText(e), field: e instanceof GateError ? e.field : undefined });
    } finally {
      setBusy('');
    }
  };

  /* ------------------------------ render ------------------------------ */
  if (saved) return <Saved reqNo={saved} onNew={() => { reset(); setMode(mode); }} onOpen={() => onOpenEntry(saved)} />;

  const fe = (k: string) => fieldErr[k] || (err?.field === k ? err.msg : undefined);

  return (
    <div className="flex flex-col gap-3">
      <Card title="New gate entry">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Segmented<Mode> label="Entry against" value={mode} onChange={switchMode} options={[{ value: 'PO', label: 'Against PO', hint: 'One or more purchase orders on the same truck' }, { value: 'ASN', label: 'Against ASN', hint: 'Advance shipping notification from the vendor' }]} />
          </div>
          <p className="flex-1 text-xs text-muted">
            {mode === 'PO' ? 'Enter a PO number, tick the lines on the truck and the received quantity. Add more POs for the same truck before saving.' : 'Pick the ASN, tick the lines that arrived. Quantities, truck, LR and invoice come from the ASN.'}
          </p>
          {started && <Button size="sm" onClick={reset}><RotateCcw size={13} /> Start over</Button>}
        </div>
      </Card>

      {mode === 'PO' ? (
        <Card title="Purchase orders" actions={pos.length ? <Pill tone="accent">{pos.length} added</Pill> : null}>
          {pos.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {pos.map((p) => (
                <li key={p.po.ebeln} className="flex items-center gap-2 rounded-xl border border-line bg-sunken px-3 py-1.5 text-xs">
                  <span className="font-mono font-bold">{p.po.ebeln}</span>
                  <span className="text-muted">{p.po.poVendrName} · {p.lines.filter((l) => l.selected).length} line(s)</span>
                  <button type="button" className="text-muted hover:text-bad" aria-label={`Remove PO ${p.po.ebeln}`} onClick={() => setPos((x) => x.filter((y) => y !== p))}><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          {!current && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void fetchPo(); }}>
              <Field label={pos.length ? 'Another PO for this truck' : 'PO number'} error={fe('poNo')} className="w-full max-w-xs">
                {(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={10} placeholder="45xxxxxxxx" value={poNo} onChange={(e) => setPoNo(e.target.value.replace(/\D/g, ''))} autoFocus />}
              </Field>
              <Button variant="primary" type="submit" disabled={busy === 'po'}>{busy === 'po' ? <Spinner /> : <Search size={14} />} Get PO</Button>
            </form>
          )}
          {current && (
            <PoCard
              block={current}
              errors={fieldErr}
              onChange={(lines) => setCurrent({ ...current, lines })}
              onCancel={() => { setCurrent(null); setErr(null); }}
              onAdd={() => addCurrent()}
            />
          )}
        </Card>
      ) : (
        <Card title="Advance shipping notification">
          {!asn ? (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void loadAsn(asnNo); }}>
              <Field label="ASN number" error={fe('asnNo')} className="w-full max-w-xs">
                {(id) => <input id={id} className={inputCls} inputMode="numeric" value={asnNo} onChange={(e) => setAsnNo(e.target.value.replace(/\D/g, ''))} autoFocus />}
              </Field>
              <Button variant="primary" type="submit" disabled={busy === 'asn'}>{busy === 'asn' ? <Spinner /> : <Search size={14} />} Get ASN</Button>
              <Button onClick={() => setAsnPicker(true)}><FileText size={14} /> Find open ASNs</Button>
            </form>
          ) : (
            <>
              <div className="mb-3 grid gap-2 sm:grid-cols-4">
                <Info label="ASN" value={asn.shipId} mono />
                <Info label="Vendor" value={`${asn.name1} (${asn.lifnr})`} />
                <Info label="Plant" value={asn.werks} mono />
                <Info label="Region" value={asn.rgnDesc || asn.regio} />
              </div>
              <LineTable lines={asnLines} onChange={setAsnLines} errors={fieldErr} selectAll />
            </>
          )}
        </Card>
      )}

      <Card title="Truck, LR and invoice" actions={mode === 'PO' && pos.length > 0 ? <span className="text-2xs text-muted">shared by every PO of this entry</span> : null}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Request date" error={fe('reqDate')}>{(id) => <input id={id} type="date" className={inputCls} value={header.reqDate} onChange={(e) => set({ reqDate: e.target.value })} />}</Field>
          <Field label="Vehicle number *" error={fe('truckNo')}>
            {(id) => (
              <>
                <input id={id} className={cx(inputCls, 'uppercase')} maxLength={20} placeholder="WB02AB1234" value={header.truckNo} onChange={(e) => set({ truckNo: e.target.value.toUpperCase() })} />
                <VehiclePhoto onPlate={(p) => set({ truckNo: p })} />
              </>
            )}
          </Field>
          <Field label="Truck entry date *" error={fe('truckDate')}>{(id) => <input id={id} type="date" className={inputCls} value={header.truckDate} onChange={(e) => set({ truckDate: e.target.value })} />}</Field>
          <Field label="Truck entry time *" error={fe('truckTim')}>{(id) => <input id={id} type="time" className={inputCls} value={header.truckTim} onChange={(e) => set({ truckTim: e.target.value })} />}</Field>
          <Field label="LR number *" error={fe('lrno')}>{(id) => <input id={id} className={inputCls} maxLength={30} value={header.lrno} onChange={(e) => set({ lrno: e.target.value })} />}</Field>
          <Field label="LR date" error={fe('lrdt')}>{(id) => <input id={id} type="date" className={inputCls} value={header.lrdt} onChange={(e) => set({ lrdt: e.target.value })} />}</Field>
          <Field label="Invoice number *" error={fe('invNo')} hint={mode === 'ASN' ? 'from the ASN' : undefined}>
            {(id) => <input id={id} className={inputCls} maxLength={16} value={header.invNo} readOnly={mode === 'ASN'} onChange={(e) => set({ invNo: e.target.value })} />}
          </Field>
          <Field label="Invoice date *" error={fe('invDate')} hint={mode === 'ASN' ? 'from the ASN' : undefined}>
            {(id) => <input id={id} type="date" className={inputCls} value={header.invDate} readOnly={mode === 'ASN'} onChange={(e) => set({ invDate: e.target.value })} />}
          </Field>
          <div className="sm:col-span-2">
            <span className="text-xs font-bold text-muted">Freight vendor *</span>
            <div className="mt-1 flex flex-wrap items-start gap-2">
              <div className="w-56">
                <Segmented<'01' | '02'> size="sm" label="Freight vendor" value={header.frVendr} onChange={(v) => set({ frVendr: v, vehVendrNo: '', vehVendrName: '' })}
                  options={[{ value: '01', label: 'SAP vendor' }, { value: '02', label: 'Other (name)' }]} />
              </div>
              <div className="min-w-[12rem] flex-1">
                {header.frVendr === '01'
                  ? <input aria-label="Freight vendor number" className={inputCls} inputMode="numeric" maxLength={10} placeholder="Vendor number" value={header.vehVendrNo} onChange={(e) => set({ vehVendrNo: e.target.value.replace(/\D/g, '') })} />
                  : <input aria-label="Freight vendor name" className={inputCls} maxLength={40} placeholder="Transporter name" value={header.vehVendrName} onChange={(e) => set({ vehVendrName: e.target.value })} />}
                {(fe('vehVendrNo') || fe('vehVendrName') || fe('frVendr')) && <p className="mt-1 text-2xs text-bad">{fe('vehVendrNo') || fe('vehVendrName') || fe('frVendr')}</p>}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-3 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-3 py-3 backdrop-blur lg:-mx-5 lg:px-5">
        <Button variant="primary" className="h-11 px-6 text-[15px]" disabled={busy === 'save'} onClick={() => void save()}>
          {busy === 'save' ? <Spinner /> : <Truck size={16} />} Save gate entry
        </Button>
        {mode === 'PO' && current && <Button className="h-11" onClick={() => addCurrent()}><PackagePlus size={15} /> Add PO and enter another</Button>}
        {err && !err.field && <p className="text-sm font-semibold text-bad" role="alert">{err.msg}</p>}
      </div>

      <Modal open={!!confirmDate} onClose={() => setConfirmDate(null)} title="Entry date"
        footer={<><Button onClick={() => setConfirmDate(null)}>No</Button><Button variant="primary" onClick={() => { setConfirmDate(null); void save(true); }}>Yes, save</Button></>}>
        <p className="text-sm">{confirmDate}</p>
      </Modal>
      <AsnPicker open={asnPicker} onClose={() => setAsnPicker(false)} onPick={(a) => { setAsnPicker(false); void loadAsn(a.shipId); }} />
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-sunken/60 px-3 py-2">
      <div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('truncate text-sm font-bold', mono && 'font-mono')}>{value || '-'}</div>
    </div>
  );
}

function PoCard({ block, errors, onChange, onCancel, onAdd }: { block: PoBlock; errors: Errors; onChange: (l: Line[]) => void; onCancel: () => void; onAdd: () => void }) {
  const p: PoInfo = block.po;
  const [hist, setHist] = useState<null | 'loading' | Awaited<ReturnType<typeof poHistory>> | string>(null);
  const showHistory = async () => {
    setHist('loading');
    try {
      setHist(await poHistory(p.ebeln));
    } catch (e) {
      setHist(errText(e));
    }
  };
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.03] p-3">
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <Info label="PO" value={p.ebeln} mono />
        <Info label="Vendor" value={`${p.poVendrName} (${p.lifnr})`} />
        <Info label="Plant" value={p.werks} mono />
        <Info label="Region" value={p.rgnDesc || p.regio} />
      </div>
      <LineTable lines={block.lines} onChange={onChange} errors={errors} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onCancel}>Remove this PO</Button>
        <Button size="sm" onClick={() => (hist && hist !== 'loading' ? setHist(null) : void showHistory())}><History size={13} /> {hist && hist !== 'loading' ? 'Hide' : 'Earlier receipts'}</Button>
        <div className="flex-1" />
        <Button size="sm" variant="primary" onClick={onAdd}><PackagePlus size={13} /> Add to entry</Button>
      </div>
      {hist === 'loading' && <p className="mt-2 text-xs text-muted">Loading earlier receipts…</p>}
      {typeof hist === 'string' && hist !== 'loading' && <p className="mt-2 text-xs text-bad">{hist}</p>}
      {Array.isArray(hist) && (
        hist.length ? (
          <div className="mt-2 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead className="bg-sunken text-left text-2xs uppercase text-muted"><tr><th className="px-2 py-1.5">Request</th><th>Item</th><th>Material</th><th className="text-right">Received</th><th className="px-2">Unit</th></tr></thead>
              <tbody>{hist.map((h, i) => <tr key={i} className="border-t border-line"><td className="px-2 py-1 font-mono">{h.reqNo}</td><td>{h.ebelp}</td><td>{h.txz01}</td><td className="num text-right">{fmtQty(h.qntRecievd)}</td><td className="px-2">{h.meins}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="mt-2 text-xs text-muted">No earlier gate entries for this PO.</p>
      )}
    </div>
  );
}

/** Item lines: tick the ones on the truck; the quantity input is enabled only for ticked lines (unticking resets it). */
function LineTable({ lines, onChange, errors, selectAll }: { lines: Line[]; onChange: (l: Line[]) => void; errors: Errors; selectAll?: boolean }) {
  const all = lines.length > 0 && lines.every((l) => l.selected);
  const upd = (i: number, p: Partial<Line>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  if (!lines.length) return <Empty title="No open items">Nothing left to receive on this document.</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted">
          <tr>
            <th className="w-10 px-3 py-2">
              {selectAll ? <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={all} aria-label="Select all lines" onChange={(e) => onChange(lines.map((l) => ({ ...l, selected: e.target.checked })))} /> : null}
            </th>
            <th>PO / item</th><th>Material</th><th>Description</th>
            <th className="text-right">PO qty</th><th className="text-right">Open qty</th><th className="w-36 px-3 text-right">Received</th><th>Unit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const e = errors[`${l.ebeln}/${l.ebelp}`];
            return (
              <tr key={`${l.ebeln}/${l.ebelp}`} className={cx('border-t border-line', l.selected && 'bg-accent/[0.04]')}>
                <td className="px-3 py-2">
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={l.selected} aria-label={`Line ${l.ebelp}`}
                    onChange={(ev) => upd(i, ev.target.checked ? { selected: true } : { selected: false, qntRecievd: selectAll ? l.qntRecievd : 0 })} />
                </td>
                <td className="font-mono text-xs">{l.ebeln}/{l.ebelp}</td>
                <td className="font-mono text-xs">{l.matnr}</td>
                <td className="max-w-[16rem] truncate" title={l.txz01}>{l.txz01}</td>
                <td className="num text-right">{fmtQty(l.poQnty)}</td>
                <td className="num text-right font-semibold">{fmtQty(l.menge)}</td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    aria-label={`Received quantity, line ${l.ebelp}`}
                    className={cx(inputBase, 'num h-9 w-28 text-right', e && 'border-bad')}
                    type="number" inputMode="decimal" min={0} step="any"
                    disabled={!l.selected}
                    value={l.selected || l.qntRecievd ? l.qntRecievd : ''}
                    onChange={(ev) => upd(i, { qntRecievd: ev.target.value === '' ? 0 : Number(ev.target.value) })}
                  />
                  {e && <p className="mt-0.5 text-2xs text-bad">{e}</p>}
                </td>
                <td className="pr-3">{l.meins}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {errors._ && <p className="border-t border-line px-3 py-2 text-xs text-bad">{errors._}</p>}
    </div>
  );
}

function AsnPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (a: AsnSummary) => void }) {
  const [po, setPo] = useState('');
  const [rows, setRows] = useState<AsnSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    setErr('');
    try {
      setRows(await searchAsn(po.trim() || undefined));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const list = useMemo(() => rows ?? [], [rows]);
  return (
    <Modal open={open} onClose={onClose} title="Open ASNs for your plants">
      <form className="mb-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <Field label="PO number (optional)" className="flex-1">{(id) => <input id={id} className={inputCls} inputMode="numeric" maxLength={10} value={po} onChange={(e) => setPo(e.target.value.replace(/\D/g, ''))} />}</Field>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? <Spinner /> : <Search size={14} />} Search</Button>
      </form>
      {err && <p className="text-sm text-bad">{err}</p>}
      {rows && !list.length && !err && <Empty title="No open ASNs">Nothing waiting for your plants{po ? ` on PO ${po}` : ''}.</Empty>}
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {list.map((a) => (
            <li key={a.shipId}>
              <button type="button" onClick={() => onPick(a)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-sunken">
                <span className="font-mono text-sm font-bold">{a.shipId}</span>
                <span className="min-w-0 flex-1 text-xs text-muted"><span className="font-semibold text-ink">{a.name1}</span> · PO {a.ebeln} · plant {a.werks}<br />Truck {a.vehicleNo || '-'} · LR {a.lrNo || '-'} · Inv {a.invNum || '-'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Saved({ reqNo, onNew, onOpen }: { reqNo: string; onNew: () => void; onOpen: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <section className="mx-auto mt-6 max-w-lg rounded-2xl border border-good/30 bg-panel p-7 text-center shadow-card">
      <CheckCircle2 size={40} className="mx-auto text-good" />
      <h2 className="mt-3 text-lg font-extrabold">Gate entry saved</h2>
      <p className="mt-1 text-sm text-muted">Request number</p>
      <p className="mt-1 font-mono text-3xl font-extrabold tracking-wider text-accent">{reqNo}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await openPdf(reqNo); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } }}>
          {busy ? <Spinner /> : <Printer size={14} />} Print gate pass
        </Button>
        <Button onClick={onOpen}><FileText size={14} /> View entry</Button>
        <Button onClick={onNew}><RotateCcw size={14} /> New entry</Button>
      </div>
      {err && <p className="mt-3 text-sm text-bad">{err}</p>}
      <p className="mt-4 text-2xs text-faint">Saved {fmtDate(todayIso())}.</p>
    </section>
  );
}
