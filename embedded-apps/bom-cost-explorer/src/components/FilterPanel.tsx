'use client';
import { useMemo, useState } from 'react';
import type { PlantRow } from '@/lib/sap/fields';
import { costQuerySchema, MAX_MATERIALS, MODE_LABEL, MODES, RATE_SOURCES, usesField, type CostQuery, type Mode, type QueryField } from '@/lib/query/schema';
import { MaterialPicker, PlantPicker, PriorityList } from './Pickers';
import { Button, cx, Field, inputCls, Toggle } from './ui';

export function validate(q: CostQuery): Record<string, string> {
  const r = costQuerySchema.safeParse(q);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

const MODE_SHORT: Record<Mode, string> = { B: 'BOM cost', C: 'Compare', R: 'Rates', F: 'Freight', M: 'RM / PM' };
const MODE_HELP: Record<Mode, string> = {
  B: 'Multi-level BOM costing per plant',
  C: 'One BOM, costed in several plants (INR)',
  R: 'All rate records in the look-back',
  F: 'Freight per PO, actual vs standard',
  M: 'Exploded RM / PM requirement and cost',
};

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div role="radiogroup" aria-label="Mode" className="grid grid-cols-5 gap-1 rounded-lg bg-sunken p-1">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          title={MODE_HELP[m]}
          aria-label={`${m} ${MODE_LABEL[m]}`}
          onClick={() => onChange(m)}
          className={cx('rounded-md px-1 py-1.5 text-center text-xs font-medium leading-tight', mode === m ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink')}
        >
          <span className="block font-mono text-sm">{m}</span>
          <span className="block truncate">{MODE_SHORT[m]}</span>
        </button>
      ))}
    </div>
  );
}

export default function FilterPanel({
  query, onChange, plants, running, onRun, onCancel, compact,
}: {
  query: CostQuery; onChange: (q: CostQuery) => void; plants: PlantRow[]; running: boolean; onRun: () => void; onCancel: () => void; compact?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validate(query), [query]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const u = (f: QueryField) => usesField(query.mode, f);
  const set = <K extends keyof CostQuery>(k: K, v: CostQuery[K]) => onChange({ ...query, [k]: v });
  const int = (v: string, d: number) => (v === '' ? d : Math.max(0, Math.trunc(Number(v)) || 0));
  const valid = Object.keys(errors).length === 0;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (valid && !running) onRun();
      }}
      aria-label="Selection"
    >
      {!compact && <ModeSelector mode={query.mode} onChange={(m) => onChange({ ...query, mode: m })} />}

      <Field label={`Materials (${query.materials.length}/${MAX_MATERIALS})`} error={show('materials')} hint="Header materials as entered; SAP converts them">
        {(id) => <MaterialPicker id={id} values={query.materials} onChange={(v) => set('materials', v)} max={MAX_MATERIALS} invalid={!!show('materials')} />}
      </Field>

      {u('plants') && (
        <Field label="Plants" error={show('plants')}>
          {(id) => <PlantPicker id={id} values={query.plants} onChange={(v) => set('plants', v)} plants={plants} invalid={!!show('plants')} />}
        </Field>
      )}
      {u('bomPlant') && (
        <Field label="BOM plant (one)" error={show('bomPlant')} hint="The BOM is exploded from this plant">
          {(id) => <PlantPicker id={id} single values={query.bomPlant ? [query.bomPlant] : []} onChange={(v) => set('bomPlant', v[0] ?? '')} plants={plants} invalid={!!show('bomPlant')} />}
        </Field>
      )}
      {u('compPlants') && (
        <Field label="Comparison plants" error={show('compPlants')} hint="Costed with each plant's own rates">
          {(id) => <PlantPicker id={id} values={query.compPlants} onChange={(v) => set('compPlants', v)} plants={plants} invalid={!!show('compPlants')} />}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        {u('explQty') && (
          <Field label="Explosion qty" error={show('explQty')}>
            {(id) => <input id={id} className={inputCls} inputMode="decimal" value={query.explQty} onChange={(e) => set('explQty', e.target.value.replace(',', '.'))} />}
          </Field>
        )}
        {u('maxLevel') && (
          <Field label="Max BOM level" hint="0 = all levels">
            {(id) => <input id={id} type="number" min={0} max={99} className={inputCls} value={query.maxLevel} onChange={(e) => set('maxLevel', int(e.target.value, 0))} />}
          </Field>
        )}
        {u('lookback') && (
          <Field label="Rate look-back (days)" error={show('lookback')}>
            {(id) => <input id={id} type="number" min={1} className={inputCls} value={query.lookback} onChange={(e) => set('lookback', int(e.target.value, 365))} />}
          </Field>
        )}
        {u('freightDays') && (
          <Field label="Freight look-back (days)" error={show('freightDays')}>
            {(id) => <input id={id} type="number" min={1} className={inputCls} value={query.freightDays} onChange={(e) => set('freightDays', int(e.target.value, 180))} />}
          </Field>
        )}
        {u('donorPlant') && (
          <Field label="Donor plant" hint="Rates from here when a plant has none">
            {(id) => (
              <select id={id} className={inputCls} value={query.donorPlant} onChange={(e) => set('donorPlant', e.target.value)}>
                <option value="">— none —</option>
                {plants.map((p) => <option key={p.Werks} value={p.Werks}>{p.Werks} {p.Name1}</option>)}
              </select>
            )}
          </Field>
        )}
        {u('capid') && (
          <Field label="BOM application">
            {(id) => <input id={id} className={inputCls} maxLength={4} placeholder="default" value={query.capid} onChange={(e) => set('capid', e.target.value.toUpperCase())} />}
          </Field>
        )}
      </div>

      {u('prio') && (
        <Field label="Rate priority" error={show('prio')} hint="Drag, or Alt+↑/↓">
          {() => <PriorityList value={query.prio} onChange={(v) => set('prio', v as CostQuery['prio'])} all={RATE_SOURCES} />}
        </Field>
      )}

      <div className="flex flex-col gap-2">
        {u('inclFrt') && <Toggle label="Include freight" checked={query.inclFrt} onChange={(v) => set('inclFrt', v)} />}
        {u('stdFrt') && <Toggle label="Use standard freight" checked={query.stdFrt} onChange={(v) => set('stdFrt', v)} />}
        {u('latestOnly') && <Toggle label="Latest PO only" checked={query.latestOnly} onChange={(v) => set('latestOnly', v)} />}
        {u('inclBudget') && <Toggle label="Include budget" checked={query.inclBudget} onChange={(v) => set('inclBudget', v)} />}
        {u('budgetYr') && query.inclBudget && (
          <Field label="Budget year" error={show('budgetYr')}>
            {(id) => <input id={id} type="number" className={inputCls} value={query.budgetYr ?? ''} onChange={(e) => set('budgetYr', e.target.value ? Number(e.target.value) : undefined)} />}
          </Field>
        )}
        {u('inclCover') && <Toggle label="Include coverage" checked={query.inclCover} onChange={(v) => set('inclCover', v)} />}
        {u('horizons') && query.inclCover && (
          <div className="grid grid-cols-3 gap-2">
            {(['hor1', 'hor2', 'hor3'] as const).map((h, i) => (
              <Field key={h} label={`H${i + 1} days`} error={i === 0 ? show('hor1') : undefined}>
                {(id) => <input id={id} type="number" min={1} className={inputCls} value={query[h]} onChange={(e) => set(h, int(e.target.value, 30))} />}
              </Field>
            ))}
          </div>
        )}
      </div>

      {u('budatWindow') && (
        <details className="rounded-md border border-line px-2 py-1.5">
          <summary className="cursor-pointer text-xs font-medium text-muted">Actual quantity window {query.budatFrom || query.budatTo ? '•' : ''}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Posting from" error={show('budatFrom')}>
              {(id) => <input id={id} type="date" className={inputCls} value={query.budatFrom ?? ''} onChange={(e) => set('budatFrom', e.target.value)} />}
            </Field>
            <Field label="Posting to">
              {(id) => <input id={id} type="date" className={inputCls} value={query.budatTo ?? ''} onChange={(e) => set('budatTo', e.target.value)} />}
            </Field>
          </div>
          <p className="mt-1 text-2xs text-faint">When set, SAP uses actual consumption (Qtysrc ACTUAL) instead of BOM quantities.</p>
        </details>
      )}
      {u('asof') && (
        <details className="rounded-md border border-line px-2 py-1.5" open={query.useAsof}>
          <summary className="cursor-pointer text-xs font-medium text-muted">As-of date {query.useAsof ? `• ${query.asofDate}` : ''}</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Toggle label="Cost as of a past date" checked={query.useAsof} onChange={(v) => set('useAsof', v)} />
            {query.useAsof && (
              <Field label="As-of date" error={show('asofDate')}>
                {(id) => <input id={id} type="date" className={inputCls} value={query.asofDate ?? ''} onChange={(e) => set('asofDate', e.target.value)} />}
              </Field>
            )}
          </div>
        </details>
      )}

      <div className="sticky bottom-0 -mx-3 flex gap-2 border-t border-line bg-panel px-3 py-2">
        {running ? (
          <Button variant="danger" className="flex-1" onClick={onCancel}>Cancel run</Button>
        ) : (
          <Button type="submit" variant="primary" className="flex-1" aria-disabled={!valid}>Run in SAP</Button>
        )}
      </div>
      {touched && !valid && <p className="text-2xs text-bad" role="alert">Fix the highlighted fields first.</p>}
    </form>
  );
}
