'use client';

import { KeyFieldDef } from '@/lib/keyFields';
import { helpOf } from '@/lib/keyFields';
import { useValueHelp } from '@/lib/mmValueHelp';
import { MaterialData } from '@/lib/types';
import { ValueHelpField } from '../ValueHelp';

const PARENT_TEXT: Record<string, string> = { plant: 'Choose a plant first', salesOrg: 'Choose a sales org first', warehouseNo: 'Choose a warehouse first' };

/**
 * One key-data field with its live SAP value help. The list is loaded when the field first shows (and again when the field it depends on
 * changes); while it loads the field is disabled, and when SAP cannot deliver it the error is shown with a retry. A "soft" list
 * (name not confirmed against SAP) that SAP does not have falls back to free entry.
 */
export default function KeyField({ def, data, onChange, error, disabled, readOnlyValue }: {
  def: KeyFieldDef;
  data: Partial<MaterialData>;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
  /** Show the value as plain text (display only) */
  readOnlyValue?: boolean;
}) {
  const spec = def.help!;
  const params = helpOf(spec, data);
  const parentKey = spec.params ? Object.values(spec.params).find((p) => !data[p]) : undefined;
  const vh = useValueHelp(spec.name, params ?? {}, !!params, spec.source);
  const id = `k-${def.key}`;
  const value = (data[def.key] as string | undefined) ?? '';

  if (readOnlyValue) {
    const text = vh.options.find((o) => o.value === value)?.label;
    return (
      <div className="field field-display">
        <span className="field-label">{def.label}<span className="tech">{def.tech}</span></span>
        <div id={id} className="display-value" tabIndex={-1}>{value ? (text ? `${value} – ${text}` : value) : <span className="muted">—</span>}</div>
      </div>
    );
  }

  // A soft list SAP does not have: let the user type the code
  if (spec.soft && params && !vh.loading && (vh.error || vh.options.length === 0)) {
    return (
      <div className={`field ${error ? 'field-error' : ''}`}>
        <label htmlFor={id} className="field-label">{def.label}{def.required && <span className="req">*</span>}<span className="tech">{def.tech}</span></label>
        <input id={id} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} disabled={disabled} spellCheck={false} autoComplete="off" />
        <small className="muted">SAP gave no list for this field – enter the code.</small>
        {error && <small className="err">{error}</small>}
      </div>
    );
  }

  const parentMissing = !params;
  const hint = parentMissing ? PARENT_TEXT[parentKey ?? ''] ?? 'Fill the field before first'
    : vh.loading ? 'Loading the list from SAP…'
    : vh.error ? `${vh.error}`
    : vh.options.length === 0 ? 'SAP returned no values for this selection' : undefined;
  return (
    <>
      <ValueHelpField
        id={id}
        label={def.label}
        tech={def.tech}
        required={def.required}
        value={value}
        options={vh.options}
        onChange={onChange}
        disabled={disabled || parentMissing || vh.loading || !!vh.error || vh.options.length === 0}
        disabledHint={hint}
        error={error}
      />
      {vh.error && <button type="button" className="btn btn-ghost btn-sm vh-retry" onClick={() => void vh.retry()}>Try again</button>}
    </>
  );
}
