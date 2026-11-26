'use client';
import { useEffect, useState } from 'react';
import { Button, Chip, Header, Input, Modal, Notice, TONE_CHIP, type ScreenProps } from '../ui';
import { HeaderForm, LinesTable } from '../PoEditor';
import { errText, getPo, listPos, poEvents, rejectPo, updatePo, validatePo } from '@/lib/api';
import { downloadXlsx } from '@/lib/files';
import { alpha, dateTime, money } from '@/lib/format';
import { useLoad } from '@/lib/useLoad';
import { EXCEPTION_INFO, STATUS_INFO, type Po, type Row } from '@/lib/types';

/** Step 2: SAP checks every line (material mapping, listing, price, case lot, stock, duplicate PO, credit); fixes and
 *  automatic amendments before anything is created. */
export default function Exceptions({ active, canWrite, notify, go, arg }: ScreenProps) {
  const list = useLoad(() => listPos(['captured', 'exceptions', 'ready']), active, [] as Po[]);
  const [po, setPo] = useState<Po | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [autoAmend, setAutoAmend] = useState(true);
  const [tol, setTol] = useState('0.5');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [events, setEvents] = useState<Row[] | null>(null);

  const open = async (id: number) => {
    if (dirty && !window.confirm('Discard your unsaved changes to this PO?')) return;
    setBusy('Loading…');
    try { setPo(await getPo(id)); setDirty(false); setEvents(null); } catch (e) { notify(errText(e), 'error'); } finally { setBusy(''); }
  };
  useEffect(() => { if (arg !== undefined && active) void open(Number(arg)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [arg, active]);

  const editable = canWrite && !!po && ['captured', 'exceptions', 'ready'].includes(po.status);
  const save = async (): Promise<Po | null> => {
    if (!po) return null;
    setBusy('Saving…');
    try {
      const saved = await updatePo(po.id, { version: po.version, header: po.header, lines: po.lines });
      setPo(saved); setDirty(false); void list.reload();
      return saved;
    } catch (e) { notify(errText(e), 'error'); return null; } finally { setBusy(''); }
  };
  const validate = async () => {
    if (!po) return;
    const base = dirty ? await save() : po;
    if (!base) return;
    setBusy('SAP is checking the PO…');
    try {
      const v = await validatePo(base.id, { autoAmend, priceTolPct: Number(tol) || 0.5 });
      setPo(v); setDirty(false); void list.reload();
      notify(v.status === 'ready' ? `PO ${v.header.BSTKD} is ready for sales order creation.` : `PO ${v.header.BSTKD}: ${v.openExceptions} exception(s) to clear.`, v.status === 'ready' ? 'success' : 'info');
    } catch (e) { notify(errText(e), 'error'); } finally { setBusy(''); }
  };
  const reject = async () => {
    if (!po || !reason.trim()) return;
    setBusy('Rejecting…');
    try { await rejectPo(po.id, reason.trim()); notify(`PO ${po.header.BSTKD} rejected.`, 'success'); setPo(null); setRejecting(false); setReason(''); void list.reload(); }
    catch (e) { notify(errText(e), 'error'); } finally { setBusy(''); }
  };

  const lines = po?.lines ?? [];
  const blocking = po ? [...(po.header.EXCEPTIONS ?? []), ...lines.flatMap((l) => l.EXCEPTIONS ?? [])].filter((c) => EXCEPTION_INFO[c]?.blocking).length : 0;

  return (
    <div>
      <Header title="Validation & Exceptions" hint="SAP checks customer, material mapping (customer article / EAN), sales listing, price, case lot, MRP, stock, duplicate PO and credit. Mismatches are amended automatically where safe and listed for the customer." />
      <div className="grid gap-3 xl:grid-cols-[300px_1fr]">
        <div className="rounded-2xl bg-white p-2 ring-1 ring-sap-line">
          <div className="mb-1 flex items-center px-1">
            <p className="flex-1 text-2xs font-bold uppercase tracking-wider text-sap-muted">Work queue · {list.data.length}</p>
            <button type="button" className="text-2xs font-bold text-plum" onClick={() => void list.reload()}>Refresh</button>
          </div>
          {list.error && <p className="p-2 text-xs text-red-700">{list.error}</p>}
          <ul className="scroll-glass max-h-[70vh] space-y-1 overflow-auto">
            {list.data.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => void open(p.id)} className={`w-full rounded-xl px-2.5 py-2 text-left ${po?.id === p.id ? 'bg-indigo-50 ring-1 ring-plum/30' : 'hover:bg-sap-head'}`}>
                  <div className="flex items-center gap-2"><span className="flex-1 truncate font-mono text-xs font-bold">{p.header.BSTKD || `#${p.id}`}</span><Chip cls={STATUS_INFO[p.status].cls}>{STATUS_INFO[p.status].label}</Chip></div>
                  <div className="truncate text-2xs text-sap-muted">{p.header.NAME1 || p.header.CUSTOMER_NAME || 'Customer?'} · {p.lineCount} lines{p.openExceptions ? ` · ${p.openExceptions} exc.` : ''}</div>
                </button>
              </li>
            ))}
            {!list.data.length && !list.loading && <li className="p-3 text-xs text-sap-muted">Nothing waiting. Capture POs first.</li>}
          </ul>
        </div>

        <div className="min-w-0">
          {!po && <div className="rounded-2xl border border-dashed border-sap-line bg-white px-4 py-16 text-center text-sm text-sap-muted">{busy || 'Choose a PO from the work queue.'}</div>}
          {po && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base font-bold">PO {po.header.BSTKD || `#${po.id}`}</h3>
                <Chip cls={STATUS_INFO[po.status].cls}>{STATUS_INFO[po.status].label}</Chip>
                {po.validatedAt && <span className="text-2xs text-sap-muted">validated {dateTime(po.validatedAt)}</span>}
                {dirty && <Chip cls={TONE_CHIP.warn}>unsaved changes</Chip>}
                <div className="flex-1" />
                <button type="button" className="text-2xs font-bold text-plum underline" onClick={async () => { try { setEvents(await poEvents(po.id)); } catch (e) { notify(errText(e), 'error'); } }}>History</button>
                {editable && <>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" className="accent-plum" checked={autoAmend} onChange={(e) => setAutoAmend(e.target.checked)} /> Auto amend</label>
                  <label className="flex items-center gap-1 text-xs">Price tolerance % <Input value={tol} onChange={setTol} className="w-14 text-right" aria-label="Price tolerance percent" /></label>
                  <Button variant="danger" onClick={() => setRejecting(true)} disabled={!!busy}>Reject PO</Button>
                  {dirty && <Button onClick={() => void save()} disabled={!!busy}>Save</Button>}
                  <Button variant="primary" onClick={() => void validate()} disabled={!!busy}>{busy || 'Validate in SAP'}</Button>
                </>}
                {po.status === 'ready' && !dirty && <Button variant="success" onClick={() => go('sales-orders', po.id)}>Create sales order →</Button>}
              </div>
              {po.warnings?.length > 0 && <Notice tone="warn">{po.warnings.join(' ')}</Notice>}
              {po.status === 'exceptions' && <Notice tone="warn">{blocking ? `${blocking} blocking exception(s): fix the line (pick the material, correct the quantity) or drop it, then validate again.` : 'Every line was dropped. Restore at least one line.'}</Notice>}
              <HeaderForm header={po.header} onChange={(h) => { setPo({ ...po, header: h }); setDirty(true); }} editable={editable} />
              <LinesTable lines={lines} onChange={(l) => { setPo({ ...po, lines: l }); setDirty(true); }} editable={editable} header={po.header} showChecks={!!po.validatedAt} />
              {po.amendments?.length > 0 && (
                <div className="mt-3 rounded-2xl bg-indigo-50/60 p-3 ring-1 ring-indigo-100">
                  <div className="mb-1 flex items-center gap-2">
                    <p className="flex-1 text-xs font-bold text-indigo-900">Customer amendment: {po.amendments.length} line(s) priced at the SAP price instead of the PO price</p>
                    <Button onClick={() => void downloadXlsx(`PO-amendment-${po.header.BSTKD || po.id}.xlsx`, po.amendments.map((a) => ({ ...a, BSTKD: po.header.BSTKD, MATNR: alpha(a.MATNR) })),
                      [{ key: 'BSTKD', label: 'Customer PO' }, { key: 'LINE', label: 'Line' }, { key: 'MATNR', label: 'Material' }, { key: 'DESCRIPTION', label: 'Description' }, { key: 'PO_PRICE', label: 'PO price' }, { key: 'SAP_PRICE', label: 'Correct price' }, { key: 'DIFF_PCT', label: 'Difference %' }])}>Download for customer</Button>
                  </div>
                  <p className="text-2xs text-indigo-900/80">{po.amendments.map((a) => `line ${a.LINE}: ${money(a.PO_PRICE)} → ${money(a.SAP_PRICE)}`).join(' · ')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={rejecting} title="Reject the PO" onClose={() => setRejecting(false)} footer={<><Button onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" onClick={() => void reject()} disabled={!reason.trim() || !!busy}>Reject</Button></>}>
        <p className="mb-2 text-xs text-sap-muted">The PO stays in the inbox as Rejected, with the reason in its history.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="field !h-auto w-full py-2" placeholder="Reason (e.g. PO expired, wrong supplier, customer cancelled)" aria-label="Reason" />
      </Modal>
      <Modal open={!!events} title="PO history" onClose={() => setEvents(null)}>
        <ul className="space-y-1 text-xs">{(events ?? []).map((e, i) => <li key={i}><span className="font-mono text-sap-muted">{dateTime(e.at)}</span> · <b>{e.action}</b> · {e.actor} <span className="text-sap-muted">{JSON.stringify(e.detail)}</span></li>)}</ul>
      </Modal>
    </div>
  );
}
