'use client';
import { useState } from 'react';
import { Button, Chip, Field, Input, Modal, TONE_CHIP } from './ui';
import { errText, sapRead } from '@/lib/api';
import { alpha, fromInput, money, num, qty, toInput } from '@/lib/format';
import { EXCEPTION_INFO, type PoHeader, type PoLine, type Row } from '@/lib/types';

export const EMPTY_HEADER: PoHeader = { CUSTOMER_NAME: '', KUNNR: '', BSTKD: '', PO_DATE: '', DELIVERY_DATE: '', SHIP_TO: '', GSTIN: '', CURRENCY: 'INR', VKORG: '', VTWEG: '', SPART: '', AUART: '', TOTAL: null };
export const emptyLine = (n: number): PoLine => ({ LINE: n * 10, CUST_MAT: '', EAN: '', DESCRIPTION: '', QTY: null, UOM: '', PRICE: null, MRP: null, AMOUNT: null, MATNR: '' });

function SearchModal({ open, title, action, extra, cols, onPick, onClose, initial }: { open: boolean; title: string; action: 'CUSTOMER_SEARCH' | 'MATERIAL_SEARCH'; extra?: Row; cols: { key: string; label: string }[]; onPick: (r: Row) => void; onClose: () => void; initial: string }) {
  const [term, setTerm] = useState(initial);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    if (term.trim().length < 2) { setErr('Type at least 2 characters.'); return; }
    setBusy(true); setErr('');
    try { setRows((await sapRead(action, { TERM: term.trim(), MAX_ROWS: 50, ...extra })).rows); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={title} onClose={onClose} wide>
      <div className="mb-3 flex gap-2">
        <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(); }} className="field flex-1" placeholder="Name, code, EAN, customer article…" aria-label="Search term" />
        <Button variant="primary" onClick={() => void run()} disabled={busy}>{busy ? 'Searching…' : 'Search SAP'}</Button>
      </div>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
      {rows.length > 0 && (
        <table className="glass-table min-w-full border-separate border-spacing-0 text-xs">
          <thead><tr>{cols.map((c) => <th key={c.key} className="px-2 py-1.5 text-left text-2xs uppercase">{c.label}</th>)}<th className="px-2 py-1.5" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-sap-row' : ''}>
                {cols.map((c) => <td key={c.key} className="border-b border-sap-line px-2 py-1">{c.key === 'KUNNR' || c.key === 'MATNR' ? alpha(r[c.key]) : String(r[c.key] ?? '')}</td>)}
                <td className="border-b border-sap-line px-2 py-1 text-right"><Button onClick={() => { onPick(r); onClose(); }}>Choose</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!busy && !rows.length && !err && <p className="text-xs text-sap-muted">Search SAP, then choose a row.</p>}
    </Modal>
  );
}

export function HeaderForm({ header, onChange, editable }: { header: PoHeader; onChange: (h: PoHeader) => void; editable: boolean }) {
  const [pick, setPick] = useState(false);
  const set = (k: keyof PoHeader, v: string) => onChange({ ...header, [k]: v });
  const ex = header.EXCEPTIONS ?? [];
  return (
    <div className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-sap-line">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Field label="Customer on PO"><Input value={header.CUSTOMER_NAME} onChange={(v) => set('CUSTOMER_NAME', v)} disabled={!editable} className="w-full" /></Field>
        <Field label="SAP sold-to" hint={header.NAME1 ? header.NAME1 : undefined}>
          <div className="flex gap-1">
            <Input value={alpha(header.KUNNR)} onChange={(v) => set('KUNNR', v.replace(/\D/g, ''))} disabled={!editable} className="w-full font-mono" aria-label="SAP sold-to" />
            {editable && <Button onClick={() => setPick(true)} title="Find the customer in SAP">Find</Button>}
          </div>
        </Field>
        <Field label="Customer PO no."><Input value={header.BSTKD} onChange={(v) => set('BSTKD', v)} disabled={!editable} className="w-full font-mono" /></Field>
        <Field label="PO date"><Input type="date" value={toInput(header.PO_DATE)} onChange={(v) => set('PO_DATE', fromInput(v))} disabled={!editable} className="w-full" /></Field>
        <Field label="Delivery / expiry"><Input type="date" value={toInput(header.DELIVERY_DATE)} onChange={(v) => set('DELIVERY_DATE', fromInput(v))} disabled={!editable} className="w-full" /></Field>
        <Field label="Order type"><Input value={header.AUART} onChange={(v) => set('AUART', v.toUpperCase())} disabled={!editable} className="w-full font-mono" placeholder="SAP default" /></Field>
        <Field label="Sales org."><Input value={header.VKORG} onChange={(v) => set('VKORG', v.toUpperCase())} disabled={!editable} className="w-full font-mono" /></Field>
        <Field label="Channel"><Input value={header.VTWEG} onChange={(v) => set('VTWEG', v.toUpperCase())} disabled={!editable} className="w-full font-mono" /></Field>
        <Field label="Division"><Input value={header.SPART} onChange={(v) => set('SPART', v.toUpperCase())} disabled={!editable} className="w-full font-mono" /></Field>
        <Field label="Ship-to (SAP)"><Input value={alpha(header.KUNWE ?? '')} onChange={(v) => set('KUNWE', v.replace(/\D/g, ''))} disabled={!editable} className="w-full font-mono" placeholder="= sold-to" /></Field>
        <Field label="Buyer GSTIN"><Input value={header.GSTIN} onChange={(v) => set('GSTIN', v.toUpperCase())} disabled={!editable} className="w-full font-mono" /></Field>
        <Field label="Ship-to address on PO"><Input value={header.SHIP_TO} onChange={(v) => set('SHIP_TO', v)} disabled={!editable} className="w-full" /></Field>
      </div>
      {ex.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ex.map((c) => <Chip key={c} cls={EXCEPTION_INFO[c]?.blocking ? TONE_CHIP.bad : TONE_CHIP.warn} title={EXCEPTION_INFO[c]?.text}>{EXCEPTION_INFO[c]?.text ?? c}{c === 'DUPLICATE_PO' && header.EXISTING_SO ? ` (SO ${alpha(header.EXISTING_SO)})` : ''}</Chip>)}
        </div>
      )}
      <SearchModal open={pick} title="Find the customer in SAP" action="CUSTOMER_SEARCH" initial={header.CUSTOMER_NAME} onClose={() => setPick(false)}
        cols={[{ key: 'KUNNR', label: 'Customer' }, { key: 'NAME1', label: 'Name' }, { key: 'ORT01', label: 'City' }, { key: 'STCD3', label: 'GSTIN' }, { key: 'VKORG', label: 'S.Org' }, { key: 'VTWEG', label: 'Ch' }, { key: 'SPART', label: 'Dv' }]}
        onPick={(r) => onChange({ ...header, KUNNR: String(r.KUNNR ?? ''), NAME1: String(r.NAME1 ?? ''), VKORG: String(r.VKORG ?? header.VKORG), VTWEG: String(r.VTWEG ?? header.VTWEG), SPART: String(r.SPART ?? header.SPART) })} />
    </div>
  );
}

/** Editable PO lines with SAP check results, exceptions, amendments, drop / restore and warning overrides. */
export function LinesTable({ lines, onChange, editable, header, showChecks }: { lines: PoLine[]; onChange: (l: PoLine[]) => void; editable: boolean; header: PoHeader; showChecks: boolean }) {
  const [pickFor, setPickFor] = useState<number | null>(null);
  const upd = (i: number, patch: Partial<PoLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const cell = 'border-b border-sap-line px-1.5 py-1 align-top';
  const inp = (i: number, k: keyof PoLine, w: string, numeric = false) => (
    <input value={lines[i][k] === null || lines[i][k] === undefined ? '' : String(lines[i][k])} disabled={!editable || lines[i].DROPPED}
      onChange={(e) => upd(i, { [k]: numeric ? (e.target.value === '' ? null : num(e.target.value) ?? (lines[i][k] as number | null)) : e.target.value, ...(k === 'QTY' || k === 'PRICE' ? { AMENDED: (lines[i].AMENDED ?? []).filter((a) => a.field !== k) } : {}) } as Partial<PoLine>)}
      className={`field !h-7 ${w} ${numeric ? 'text-right font-mono' : ''}`} aria-label={`${k} line ${lines[i].LINE}`} />
  );
  return (
    <div className="scroll-glass overflow-auto rounded-2xl bg-white ring-1 ring-sap-line" style={{ maxHeight: '58vh' }}>
      <table className="glass-table min-w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>{['Line', 'Customer article', 'EAN', 'Description', 'Qty', 'UoM', 'PO price', 'MRP', 'SAP material', ...(showChecks ? ['SAP price', 'Stock', 'Checks'] : []), ''].map((h) => <th key={h} className="sticky top-0 z-10 whitespace-nowrap px-2 py-2 text-left text-2xs font-bold uppercase">{h}</th>)}</tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.LINE} className={l.DROPPED ? 'bg-gray-50 opacity-50' : (l.EXCEPTIONS ?? []).some((c) => EXCEPTION_INFO[c]?.blocking) ? 'bg-red-50/60' : ''}>
              <td className={`${cell} font-mono`}>{l.LINE}</td>
              <td className={cell}>{inp(i, 'CUST_MAT', 'w-28')}</td>
              <td className={cell}>{inp(i, 'EAN', 'w-32')}</td>
              <td className={cell}>{inp(i, 'DESCRIPTION', 'w-52')}</td>
              <td className={cell}>{inp(i, 'QTY', 'w-20', true)}</td>
              <td className={cell}>{inp(i, 'UOM', 'w-14')}</td>
              <td className={cell}>{inp(i, 'PRICE', 'w-24', true)}</td>
              <td className={cell}>{inp(i, 'MRP', 'w-20', true)}</td>
              <td className={cell}>
                <div className="flex items-center gap-1">
                  <span className="font-mono">{alpha(l.MATNR) || '—'}</span>
                  {editable && !l.DROPPED && <button type="button" className="rounded bg-plum-soft px-1.5 text-2xs font-bold text-plum" onClick={() => setPickFor(i)}>{l.MATNR ? 'Change' : 'Pick'}</button>}
                </div>
                {l.MAKTX && <div className="max-w-[200px] truncate text-2xs text-sap-muted" title={l.MAKTX}>{l.MAKTX}{l.MAPPED_BY ? ` · by ${l.MAPPED_BY}` : ''}</div>}
              </td>
              {showChecks && <td className={`${cell} text-right font-mono`}>{money(l.SAP_PRICE)}</td>}
              {showChecks && <td className={`${cell} text-right font-mono`}>{qty(l.ATP_QTY)}</td>}
              {showChecks && (
                <td className={cell}>
                  <div className="flex max-w-[280px] flex-wrap gap-1">
                    {(l.EXCEPTIONS ?? []).map((c) => {
                      const info = EXCEPTION_INFO[c];
                      return (
                        <span key={c} className="inline-flex items-center gap-1">
                          <Chip cls={info?.blocking ? TONE_CHIP.bad : TONE_CHIP.warn} title={info?.text}>{info?.short ?? c}</Chip>
                          {editable && info && !info.blocking && <button type="button" title="Accept this warning" className="text-2xs font-bold text-plum underline" onClick={() => upd(i, { OVERRIDE: [...new Set([...(l.OVERRIDE ?? []), c])] })}>accept</button>}
                        </span>
                      );
                    })}
                    {(l.AMENDED ?? []).map((a) => <Chip key={a.field} cls={TONE_CHIP.info} title={a.reason}>{a.field === 'QTY' ? 'Qty' : 'Price'} {a.field === 'PRICE' ? money(a.from) : qty(a.from)} → {a.field === 'PRICE' ? money(a.to) : qty(a.to)}</Chip>)}
                    {!(l.EXCEPTIONS ?? []).length && !(l.AMENDED ?? []).length && !l.DROPPED && <Chip cls={TONE_CHIP.good}>OK</Chip>}
                  </div>
                  {l.SAP_MESSAGE && <p className="mt-0.5 max-w-[280px] text-2xs text-sap-muted">{l.SAP_MESSAGE}</p>}
                </td>
              )}
              <td className={cell}>
                {editable && (l.DROPPED
                  ? <button type="button" className="text-2xs font-bold text-plum underline" onClick={() => upd(i, { DROPPED: false })}>Restore</button>
                  : <button type="button" className="text-2xs font-bold text-red-700 underline" onClick={() => upd(i, { DROPPED: true })}>Drop</button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && <div className="p-2"><Button onClick={() => onChange([...lines, emptyLine(Math.max(0, ...lines.map((l) => l.LINE)) / 10 + 1)])}>+ Add line</Button></div>}
      <SearchModal open={pickFor !== null} title="Find the SAP material" action="MATERIAL_SEARCH" extra={{ KUNNR: header.KUNNR, VKORG: header.VKORG, VTWEG: header.VTWEG }}
        initial={pickFor !== null ? lines[pickFor]?.EAN || lines[pickFor]?.CUST_MAT || lines[pickFor]?.DESCRIPTION || '' : ''} onClose={() => setPickFor(null)}
        cols={[{ key: 'MATNR', label: 'Material' }, { key: 'MAKTX', label: 'Description' }, { key: 'EAN11', label: 'EAN' }, { key: 'KDMAT', label: 'Customer article' }, { key: 'MEINS', label: 'UoM' }]}
        onPick={(r) => { if (pickFor !== null) upd(pickFor, { MATNR: String(r.MATNR ?? ''), MAKTX: String(r.MAKTX ?? ''), MAPPED_BY: 'user', EXCEPTIONS: (lines[pickFor].EXCEPTIONS ?? []).filter((c) => c !== 'MATERIAL_NOT_FOUND') }); }} />
    </div>
  );
}
