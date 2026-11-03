'use client';
import { FORM } from '@/lib/form';
import { resolveUnit } from '@/lib/refs';
import type { FieldFlags, Message, RequestData, Row, Scalar } from '@/lib/types';
import { FieldInput } from './FieldInput';

type Ctl = Array<{ field: string } & FieldFlags>;

export function ViewForm({ controls, row, data, readOnly, messages, onChange }: {
  controls: Ctl; row: Row; data: RequestData; readOnly: boolean; messages: Record<string, Message>; onChange: (name: string, v: Scalar) => void;
}) {
  const shown = controls.filter((c) => c.shown && FORM.fields[c.field]);
  const positioned = shown.some((c) => c.column === 'L' || c.column === 'R');
  const left = positioned ? shown.filter((c) => c.column !== 'R') : shown.filter((_, i) => i % 2 === 0);
  const right = positioned ? shown.filter((c) => c.column === 'R') : shown.filter((_, i) => i % 2 === 1);
  const render = (list: Ctl) => list.map((c) => {
    const meta = FORM.fields[c.field];
    return (
      <FieldInput key={c.field} meta={meta} value={row[meta.name]} required={c.required} readOnly={readOnly || c.displayOnly}
        unit={resolveUnit(meta, row, data, FORM.fields)} message={messages[c.field]} onChange={(v) => onChange(meta.name, v)} />
    );
  });
  if (!shown.length) return <p className="muted">No fields are shown on this tab for this material type.</p>;
  return <div className="grid2"><div>{render(left)}</div><div>{render(right)}</div></div>;
}
