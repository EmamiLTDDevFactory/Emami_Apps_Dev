'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { FORM } from '@/lib/form';
import { addRow, duplicateRow, nextCell, removeRow, type CellKind } from '@/lib/gridRows';
import { resolveUnit } from '@/lib/refs';
import type { FieldFlags, Message, RequestData, Row, Scalar } from '@/lib/types';
import { FieldInput } from './FieldInput';

type Ctl = Array<{ field: string } & FieldFlags>;

const kindOf = (el: HTMLElement): CellKind => {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLInputElement) return el.type === 'checkbox' ? 'checkbox' : el.type === 'date' ? 'date' : el.getAttribute('role') === 'combobox' ? 'combo' : 'text';
  return 'text';
};

/**
 * Grid of an entity with several rows. Rows: add, duplicate (without the key), remove. Keyboard: see lib/gridRows.ts nextCell
 * (Enter and the arrows move between cells, Ctrl+Enter adds a row, Alt+Delete removes the row). Errors show in the cell they
 * point to (targets like UnitOfMeasure[2]/MEINH; row numbers in messages start at 1, the grid keys at 0 - lib/messages.ts).
 */
export function ViewGrid({ title, controls, rows, data, readOnly, messages, onChange }: {
  title: string; controls: Ctl; rows: Row[]; data: RequestData; readOnly: boolean; messages: Record<string, Message>;
  /** structural = rows were added, removed or duplicated (messages that point to row numbers are then out of date) */
  onChange: (rows: Row[], structural?: boolean) => void;
}) {
  const cols = controls.filter((c) => c.shown && FORM.fields[c.field]);
  const keyFields = cols.map((c) => FORM.fields[c.field]).filter((m) => m.key && m.name !== 'TRANSID').map((m) => m.name);
  const help = useId();
  const root = useRef<HTMLDivElement>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const set = (i: number, name: string, v: Scalar) => onChange(rows.map((r, j) => (j === i ? { ...r, [name]: v } : r)));

  const cell = (r: number, c: number) => root.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`)?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? null;
  const focusCell = (r: number, c: number, dr: number, dc: number) => {
    // skip cells without a control (hidden or disabled) in the direction of the move
    for (let i = 0; i < rows.length + cols.length; i++) {
      if (r < 0 || r >= rows.length || c < 0 || c >= cols.length) return;
      const el = cell(r, c);
      if (el) { el.focus(); if (el instanceof HTMLInputElement && el.type === 'text') el.select(); return; }
      r += dr; c += dc;
    }
  };
  useEffect(() => {
    if (focusRow === null) return;
    for (let c = 0; c < cols.length; c++) { const el = cell(focusRow, c); if (el && !(el as HTMLInputElement).readOnly) { el.focus(); break; } }
    setFocusRow(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRow, rows.length]);

  const add = () => { onChange(addRow(rows), true); setFocusRow(rows.length); };
  const dup = (i: number) => { onChange(duplicateRow(rows, i, keyFields), true); setFocusRow(i + 1); };
  const del = (i: number) => { onChange(removeRow(rows, i), true); setFocusRow(Math.max(0, Math.min(i, rows.length - 2))); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return; // the combobox has taken the key (list open)
    const el = e.target as HTMLElement;
    const td = el.closest<HTMLElement>('td[data-r]');
    if (!td) return;
    const pos = { row: Number(td.dataset.r), col: Number(td.dataset.c) };
    const kind = kindOf(el);
    const input = el instanceof HTMLInputElement ? el : null;
    const text = kind === 'text' || kind === 'combo';
    const mv = nextCell({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey }, pos, { rows: rows.length, cols: cols.length },
      { kind, atStart: !text || (input?.selectionStart === 0 && input?.selectionEnd === 0), atEnd: !text || (input?.selectionStart === input?.value.length && input?.selectionEnd === input?.value.length) });
    if (!mv) return;
    e.preventDefault();
    if (mv === 'add') { if (!readOnly) add(); return; }
    if (mv === 'remove') { if (!readOnly) del(pos.row); return; }
    focusCell(mv.row, mv.col, Math.sign(mv.row - pos.row), Math.sign(mv.col - pos.col));
  };

  return (
    <div ref={root} className="gridwrap" onKeyDown={onKeyDown}>
      <table className="grid" aria-describedby={help}>
        <caption>{title}: {rows.length} row{rows.length === 1 ? '' : 's'}</caption>
        <thead>
          <tr>
            <th scope="col" className="rownum">#</th>
            {cols.map((c) => <th key={c.field} scope="col">{FORM.fields[c.field].label}{c.required ? <span className="req" aria-hidden="true"> *</span> : null}{c.required && <span className="sr-only"> (required)</span>}</th>)}
            {!readOnly && <th scope="col"><span className="sr-only">Row actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="rownum">{i + 1}</th>
              {cols.map((c, ci) => {
                const meta = FORM.fields[c.field];
                return (
                  <td key={c.field} data-r={i} data-c={ci}>
                    <FieldInput compact row={i} meta={meta} value={r[meta.name]} required={c.required} readOnly={readOnly || c.displayOnly} unit={resolveUnit(meta, r, data, FORM.fields)}
                      message={messages[`${c.field}#${i}`]} ariaLabel={`${meta.label}, row ${i + 1}`} onChange={(v) => set(i, meta.name, v)} />
                  </td>
                );
              })}
              {!readOnly && (
                <td className="rowactions">
                  <button type="button" onClick={() => dup(i)} aria-label={`Duplicate row ${i + 1}`}>Duplicate</button>{' '}
                  <button type="button" onClick={() => del(i)} aria-label={`Remove row ${i + 1}`}>Remove</button>
                </td>
              )}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length + 2} className="muted">No rows.</td></tr>}
        </tbody>
      </table>
      {!readOnly && <p><button type="button" onClick={add}>Add row</button></p>}
      <p className="muted gridhelp" id={help}>Keyboard: Enter or Arrow Up/Down moves to the next or previous row, Arrow Left/Right moves between cells at the edge of the text, Ctrl+Arrow moves from any cell, Ctrl+Enter adds a row, Alt+Delete removes the row.</p>
    </div>
  );
}
