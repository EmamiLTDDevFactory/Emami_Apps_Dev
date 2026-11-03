'use client';
import { useId } from 'react';
import type { FieldMeta } from '@/lib/form';
import type { UnitRef } from '@/lib/refs';
import type { Message, Scalar } from '@/lib/types';
import { useT } from '@/i18n';
import { Combobox } from './Combobox';
import { useValueHelpState } from './useValueHelp';

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
  /** 0-based grid row (data-row, so a message can focus this cell) */
  row?: number;
  /** unit or currency of a quantity or amount, looked up from its reference field (lib/refs.ts) */
  unit?: UnitRef;
  /** accessible name for compact (label-less) cells, for example 'Unit, row 2' */
  ariaLabel?: string;
}

export function FieldInput({ meta, value, onChange, readOnly, required, message, compact, row, unit, ariaLabel }: Props) {
  const t = useT();
  const id = useId();
  const helpName = meta.fixed.length === 0 && (HELP_FIELDS.has(meta.name) || meta.check) ? meta.name : undefined;
  const help = useValueHelpState(helpName);
  const v = value ?? '';
  const common = { id, 'aria-label': compact ? ariaLabel ?? meta.label : undefined, 'aria-invalid': message ? true : undefined, 'aria-describedby': message ? `${id}-m` : undefined } as const;

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
    const locked = !!unit?.locked;
    control = (
      <span className="withunit">
        <input {...common} inputMode="decimal" value={String(v)} readOnly={readOnly || locked} aria-describedby={[message ? `${id}-m` : '', unit?.value ? `${id}-u` : '', locked ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined}
          onChange={(e) => onChange(e.target.value)} />
        {unit?.value && <span className="unit" id={`${id}-u`} title={unit.kind === 'currency' ? t('field.currency') : t('field.unit')}><span className="sr-only">{unit.kind === 'currency' ? t('field.currency') : t('field.unit')} </span>{unit.value}</span>}
        {locked && <span className="hint" id={`${id}-h`}>{unit ? t('field.unitFillFirst', { label: unit.label }) : ''}</span>}
      </span>
    );
  } else {
    control = helpName
      ? <Combobox id={id} ariaLabel={compact ? ariaLabel ?? meta.label : undefined} value={String(v)} readOnly={readOnly} maxLength={meta.len || undefined} items={help.items} loading={help.loading} error={help.error} inputMode={meta.type === 'NUMC' ? 'numeric' : undefined}
          invalid={!!message} describedBy={message ? `${id}-m` : undefined} upper={meta.type === 'UNIT'} onChange={(x) => onChange(x)} />
      : <input {...common} maxLength={meta.len || undefined} value={String(v)} readOnly={readOnly} inputMode={meta.type === 'NUMC' ? 'numeric' : undefined}
          onChange={(e) => onChange(meta.type === 'UNIT' ? e.target.value.toUpperCase() : e.target.value)} />;
  }
  return (
    <div className={`field${message ? ' err' : ''}`} data-field={`${meta.entity}.${meta.name}`} data-row={row}>
      {!compact && <label className="lbl" htmlFor={id}>{meta.label}{required && <span className="req" aria-hidden="true">*</span>}</label>}
      {control}
      {message && <div id={`${id}-m`} className={`msg${message.severity === 'W' ? ' w' : ''}`} role="alert">{message.message}</div>}
    </div>
  );
}
