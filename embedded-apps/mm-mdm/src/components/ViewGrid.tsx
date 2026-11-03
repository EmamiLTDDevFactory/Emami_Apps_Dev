'use client';
import { FORM } from '@/lib/form';
import { resolveUnit } from '@/lib/refs';
import type { FieldFlags, Message, RequestData, Row, Scalar } from '@/lib/types';
import { FieldInput } from './FieldInput';

type Ctl = Array<{ field: string } & FieldFlags>;

export function ViewGrid({ controls, rows, data, readOnly, messages, onChange }: {
  controls: Ctl; rows: Row[]; data: RequestData; readOnly: boolean; messages: Record<string, Message>; onChange: (rows: Row[]) => void;
}) {
  const cols = controls.filter((c) => c.shown && FORM.fields[c.field]);
  const set = (i: number, name: string, v: Scalar) => onChange(rows.map((r, j) => (j === i ? { ...r, [name]: v } : r)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>{cols.map((c) => <th key={c.field}>{FORM.fields[c.field].label}{c.required ? ' *' : ''}</th>)}<th /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => {
                const meta = FORM.fields[c.field];
                return (
                  <td key={c.field}>
                    <FieldInput compact row={i} meta={meta} value={r[meta.name]} required={c.required} readOnly={readOnly || c.displayOnly} unit={resolveUnit(meta, r, data, FORM.fields)} message={messages[`${c.field}#${i}`]} onChange={(v) => set(i, meta.name, v)} />
                  </td>
                );
              })}
              <td>{!readOnly && <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`}>Remove</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={cols.length + 1} className="muted">No rows.</td></tr>}
        </tbody>
      </table>
      {!readOnly && <p><button type="button" onClick={() => onChange([...rows, {}])}>Add row</button></p>}
    </div>
  );
}
