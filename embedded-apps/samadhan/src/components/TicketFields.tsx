'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { lookupDistributor } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import type { FieldDef } from '@/lib/types';
import { fieldsFor, labelsFor, workspaceByKey } from '@/lib/workspaces';
import { Button, Field, Spinner, cx, inputBase, inputCls, textareaCls } from './ui';

export type Values = Record<string, string>;

/** A select whose current value stays visible even when it is not (or no longer) one of the choices. */
function ChoiceSelect({ value, choices, onChange, label, placeholder = 'Select', disabled }: { value: string; choices: string[]; onChange: (v: string) => void; label: string; placeholder?: string; disabled?: boolean }) {
  const list = value && !choices.includes(value) ? [value, ...choices] : choices;
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={cx('h-9 w-full pr-8', inputBase)}>
      <option value="">{placeholder}</option>
      {list.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

/**
 * Ticket detail fields, driven by the field definitions in Admin > Fields: dropdowns, text, paragraphs and the
 * nested Category -> Function pair. A Distributor Code lookup fills the distributor fields from the DB master.
 */
export default function TicketFields({ values, onChange, required = true, compact = false, workspaceKey }: { values: Values; onChange: (patch: Values) => void; required?: boolean; compact?: boolean; workspaceKey?: string | null }) {
  const { meta } = useSamadhan();
  // v7 Phase 3: the fields, choices and Category / Function labels of the ticket's workspace (Secondary Sales = as before).
  const { fields, tree } = fieldsFor(meta, workspaceKey);
  const labels = labelsFor(meta, workspaceByKey(meta, workspaceKey)?.id);
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState('');

  const lookup = async () => {
    const code = (values.distributorCode || '').trim();
    if (!code) return;
    setLooking(true);
    setLookupMsg('');
    try {
      const d = await lookupDistributor(code);
      if (!d) {
        setLookupMsg('Not in the distributor master.');
        return;
      }
      onChange({
        distributorCode: d.code,
        distributorName: d.name,
        ...(d.region ? { region: d.region } : {}),
        ...(d.state ? { state: d.state } : {}),
        ...(d.depot ? { depot: d.depot } : {}),
        ...(d.asmName ? { asmName: d.asmName } : {}),
        ...(d.depotCoordinator ? { depotCoordinator: d.depotCoordinator } : {}),
      });
      setLookupMsg(d.active ? `Filled from the master (${d.name}).` : `Filled from the master - note ${d.name} is inactive.`);
    } catch (e) {
      setLookupMsg(e instanceof Error ? e.message : 'Lookup failed.');
    } finally {
      setLooking(false);
    }
  };

  const render = (f: FieldDef) => {
    const v = values[f.key] ?? '';
    const req = required && f.required;
    if (f.type === 'nested') {
      const node = tree.find((c) => c.value === values.category);
      return (
        <div key={f.key} className={cx('grid gap-3', compact ? 'grid-cols-1' : 'sm:col-span-2 sm:grid-cols-2')}>
          <Field label={workspaceKey && workspaceKey !== 'SEC_SALES' ? labels.category : f.label} required={req}>
            {tree.length ? (
              <ChoiceSelect label={workspaceKey && workspaceKey !== 'SEC_SALES' ? labels.category : f.label} value={values.category ?? ''} choices={tree.map((c) => c.value)} onChange={(c) => onChange({ category: c, function: '' })} />
            ) : (
              <input className={inputCls} value={values.category ?? ''} onChange={(e) => onChange({ category: e.target.value })} />
            )}
          </Field>
          <Field label={labels.function} required={req}>
            {node && node.children.length ? (
              <ChoiceSelect label={labels.function} value={values.function ?? ''} choices={node.children} onChange={(fn) => onChange({ function: fn })} />
            ) : (
              <input className={inputCls} value={values.function ?? ''} onChange={(e) => onChange({ function: e.target.value })} placeholder={values.category ? 'No functions listed - type one' : 'Pick a category first'} />
            )}
          </Field>
        </div>
      );
    }
    if (f.type === 'paragraph') {
      return (
        <Field key={f.key} label={f.label} required={req} className={compact ? '' : 'sm:col-span-2'}>
          <textarea rows={3} className={textareaCls} value={v} onChange={(e) => onChange({ [f.key]: e.target.value })} />
        </Field>
      );
    }
    if (f.key === 'distributorCode') {
      return (
        <Field key={f.key} label={f.label} required={req} hint={lookupMsg || 'Look up to fill name, region, state, depot, ASM and co-ordinator.'}>
          <div className="flex gap-1.5">
            <input
              className={inputCls}
              value={v}
              onChange={(e) => onChange({ distributorCode: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
            />
            <Button size="md" onClick={lookup} disabled={looking || !v.trim()} aria-label="Look up distributor">{looking ? <Spinner /> : <Search size={14} />}</Button>
          </div>
        </Field>
      );
    }
    if (f.type === 'dropdown' && f.choices.length) {
      return (
        <Field key={f.key} label={f.label} required={req}>
          <ChoiceSelect label={f.label} value={v} choices={f.choices} onChange={(x) => onChange({ [f.key]: x })} />
        </Field>
      );
    }
    return (
      <Field key={f.key} label={f.label} required={req}>
        <input className={inputCls} type={f.type === 'number' ? 'number' : 'text'} value={v} onChange={(e) => onChange({ [f.key]: e.target.value })} />
      </Field>
    );
  };

  return <div className={cx('grid gap-3', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>{fields.filter((f) => f.visible !== false).map(render)}</div>;
}
