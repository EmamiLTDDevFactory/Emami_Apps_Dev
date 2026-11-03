'use client';
import { useId } from 'react';
import type { FieldMeta } from '@/lib/form';
import type { Message, Scalar } from '@/lib/types';
import { useValueHelp } from './useValueHelp';

const HELP_FIELDS = new Set(['MTART', 'MBRSH', 'WERKS', 'LGORT', 'VKORG', 'VTWEG', 'MEINS', 'GEWEI', 'VOLEH', 'MATKL']);

export function isFlag(meta: FieldMeta) {
  return meta.type === 'CHAR' && meta.len === 1 && meta.fixed.length === 1 && meta.fixed[0].v === 'X';
}

interface Props {
  meta: FieldMeta;
  value: Scalar | undefined;
  onChange: (v: Scalar) => void;
  readOnly: boolean;
  required: boolean;
  message?: Message;
  compact?: boolean;
}

export function FieldInput({ meta, value, onChange, readOnly, required, message, compact }: Props) {
  const id = useId();
  const helpName = meta.fixed.length === 0 && (HELP_FIELDS.has(meta.name) || meta.check) ? meta.name : undefined;
  const help = useValueHelp(helpName);
  const v = value ?? '';
  const common = { id, 'aria-invalid': message ? true : undefined, 'aria-describedby': message ? `${id}-m` : undefined } as const;

  let control: React.ReactNode;
  if (isFlag(meta)) {
    control = <input {...common} type="checkbox" checked={value === true || value === 'X'} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />;
  } else if (meta.fixed.length > 0) {
    control = (
      <select {...common} value={String(v)} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        <option value=""></option>
        {meta.fixed.map((o) => <option key={o.v} value={o.v}>{o.v} {o.t}</option>)}
      </select>
    );
  } else if (meta.type === 'DATS') {
    control = <input {...common} type="date" value={String(v)} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />;
  } else if (meta.type === 'STRG') {
    control = <textarea {...common} rows={4} value={String(v)} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />;
  } else if (['QUAN', 'DEC', 'CURR'].includes(meta.type)) {
    control = <input {...common} inputMode="decimal" value={String(v)} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const listId = help.length ? `${id}-l` : undefined;
    control = (
      <>
        <input {...common} list={listId} maxLength={meta.len || undefined} value={String(v)} readOnly={readOnly} inputMode={meta.type === 'NUMC' ? 'numeric' : undefined}
          onChange={(e) => onChange(meta.type === 'UNIT' ? e.target.value.toUpperCase() : e.target.value)} />
        {listId && <datalist id={listId}>{help.map((h) => <option key={h.key} value={h.key}>{h.text}</option>)}</datalist>}
      </>
    );
  }
  return (
    <div className={`field${message ? ' err' : ''}`} data-field={`${meta.entity}.${meta.name}`}>
      {!compact && <label className="lbl" htmlFor={id}>{meta.label}{required && <span className="req" aria-hidden="true">*</span>}</label>}
      {control}
      {message && <div id={`${id}-m`} className={`msg${message.severity === 'W' ? ' w' : ''}`} role="alert">{message.message}</div>}
    </div>
  );
}
