'use client';
import { useState } from 'react';
import { Spinner, Button, cx, inputCls } from '../ui';
import { LEVEL_LABEL, RULE_LABEL, parseValue, resolveScope, ruleToApi, validateValue, type RuleKey, type ScopeCtx, type ScopeKind } from '@/lib/pkg/rules';
import type { EditLevel, PkgActionBody } from '@/lib/pkg/types';

/** Mass edit (amber, only for status D / C; grey and disabled otherwise). Apply -> EDIT, then the screen recalculates. */
export default function GlobalEditBar({ editable, busy, pending, scope, matkls, onApply, onRevertSelected, onRevertScenario }: {
  editable: boolean; busy: boolean; pending: string; scope: Omit<ScopeCtx, 'matkl' | 'idnrk'>; matkls: string[];
  onApply: (p: PkgActionBody) => void; onRevertSelected: () => void; onRevertScenario: () => void;
}) {
  const [level, setLevel] = useState<EditLevel>('R');
  const [rule, setRule] = useState<RuleKey>('set');
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<ScopeKind>('filter');
  const [matkl, setMatkl] = useState('');
  const [idnrk, setIdnrk] = useState('');
  const [err, setErr] = useState('');
  const off = !editable || busy;
  const k: ScopeKind = kind === 'component' && level === 'R' ? 'filter' : kind;

  function apply() {
    const e = validateValue(value, level, rule) || (k === 'matkl' && !matkl.trim() ? 'Enter a material group' : k === 'component' && !idnrk.trim() ? 'Enter a component' : k === 'selected' && !scope.selected.length ? 'Select rows first' : '');
    setErr(e);
    if (e) return;
    const r = ruleToApi(rule, parseValue(value));
    onApply({ action: 'EDIT', level, ...r, ...resolveScope(k, { ...scope, matkl, idnrk }) });
  }
  const sel = 'h-8 rounded-lg border border-line bg-panel px-2 text-xs disabled:opacity-60';
  return (
    <div className={cx('flex flex-col gap-2 rounded-2xl border px-3 py-2', editable ? 'border-warn/40 bg-warn/10' : 'border-line bg-sunken/50')} aria-label="Global edit">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-xs font-semibold">
        <label className="flex flex-col gap-0.5">Change
          <select className={sel} disabled={off} value={level} onChange={(e) => setLevel(e.target.value as EditLevel)}>{(Object.keys(LEVEL_LABEL) as EditLevel[]).map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}</select>
        </label>
        <label className="flex flex-col gap-0.5">Rule
          <select className={sel} disabled={off} value={rule} onChange={(e) => setRule(e.target.value as RuleKey)}>{(Object.keys(RULE_LABEL) as RuleKey[]).map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}</select>
        </label>
        <label className="flex flex-col gap-0.5">Value
          <input className={cx(sel, 'w-24 text-right', err && 'border-bad')} disabled={off} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        </label>
        <label className="flex flex-col gap-0.5">Scope
          <select className={sel} disabled={off} value={k} onChange={(e) => setKind(e.target.value as ScopeKind)}>
            <option value="filter">All rows in filter</option><option value="selected">Selected rows</option><option value="matkl">Material group</option>
            {level !== 'R' && <option value="component">Component</option>}
          </select>
        </label>
        {k === 'matkl' && <input aria-label="Material group" list="pkg-matkls" className={cx(sel, 'w-24')} disabled={off} placeholder="e.g. PK01" value={matkl} onChange={(e) => setMatkl(e.target.value)} />}
        {k === 'component' && <input aria-label="Component" className={cx(sel, 'w-32')} disabled={off} placeholder="Component no." value={idnrk} onChange={(e) => setIdnrk(e.target.value)} />}
        <datalist id="pkg-matkls">{matkls.map((m) => <option key={m} value={m} />)}</datalist>
        <Button size="sm" variant="primary" disabled={off} onClick={apply}>{pending === 'EDIT' && <Spinner />} Apply</Button>
        <Button size="sm" disabled={off || !scope.selected.length} onClick={onRevertSelected}>Revert selected</Button>
        <Button size="sm" variant="danger" disabled={off} onClick={onRevertScenario}>Revert scenario</Button>
        {!editable && <span className="pb-1 text-muted">Read-only: only Draft and Calculated scenarios can be edited</span>}
      </div>
      {err && <p role="alert" className="text-xs text-bad">{err}</p>}
      {editable && k === 'filter' && !scope.filterActive && <p className="text-2xs text-muted">No filter is active: this applies to every material of the scenario.</p>}
    </div>
  );
}
