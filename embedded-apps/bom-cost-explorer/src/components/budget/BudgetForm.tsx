'use client';
/** Selection card of Budget costing: the SAP selection screen of ZMM_FG_BOMEXPLR_COST, grouped by topic. Same required fields, same checkboxes. */
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { MaterialPicker, PlantPicker, splitList } from '../Pickers';
import type { PlantsState } from '../FilterPanel';
import { Field, Segmented, Toggle, cx, inputCls, Button } from '../ui';
import { BUSINESS_LABEL, COUNTRY_LABEL, COUNTRY_TABLE, MAX_OVERRIDES, SOURCE_HINT, SOURCE_LABEL, type BudgetQuery, type BusinessLine, type CountryCode, type FgSource } from '@/lib/budget/filter';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-b from-sunken/70 to-panel p-3.5">
      <h3 className="mb-3 text-[13px] font-extrabold tracking-tight text-ink">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

export default function BudgetForm({ q, onChange, errors, plants, canInitiate }: { q: BudgetQuery; onChange: (p: Partial<BudgetQuery>) => void; errors: Record<string, string>; plants: PlantsState; canInitiate: boolean }) {
  const [ovOpen, setOvOpen] = useState(q.overrides.length > 0);
  const setOv = (i: number, p: Partial<BudgetQuery['overrides'][number]>) => onChange({ overrides: q.overrides.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Block title="Period and basis">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Posting date from *" error={errors.budatFrom}>{(id) => <input id={id} type="date" className={inputCls} value={q.budatFrom} onChange={(e) => onChange({ budatFrom: e.target.value })} />}</Field>
          <Field label="to" error={errors.budatTo}>{(id) => <input id={id} type="date" className={inputCls} value={q.budatTo} onChange={(e) => onChange({ budatTo: e.target.value })} />}</Field>
          <Field label="Budgeted year *" error={errors.budgetYr}>{(id) => <input id={id} inputMode="numeric" maxLength={4} className={inputCls} value={q.budgetYr} onChange={(e) => onChange({ budgetYr: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Activity rate year *" error={errors.rateYr}>{(id) => <input id={id} inputMode="numeric" maxLength={4} className={inputCls} value={q.rateYr} onChange={(e) => onChange({ rateYr: e.target.value.replace(/\D/g, '') })} />}</Field>
          <Field label="Material type *" error={errors.mtart} hint="e.g. FERT">{(id) => <input id={id} className={inputCls} value={q.mtart.join(', ')} onChange={(e) => onChange({ mtart: splitList(e.target.value) })} />}</Field>
          <Field label="Plan UoM" hint="Unit of the production plan">{(id) => <input id={id} className={inputCls} value={q.uom} onChange={(e) => onChange({ uom: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Plan name(s)" hint="Production plans to read quantities from">{(id) => <input id={id} className={inputCls} value={q.plans.join(', ')} onChange={(e) => onChange({ plans: e.target.value.split(/[,;]+/).map((x) => x.trim()).filter(Boolean) })} />}</Field>
          <Field label="Scheme(s)" hint="Component scheme filter">{(id) => <input id={id} className={inputCls} value={q.schemes.join(', ')} onChange={(e) => onChange({ schemes: splitList(e.target.value) })} />}</Field>
        </div>
      </Block>

      <Block title="Finished goods">
        <Field label="Plants *" error={errors.plants} hint="One SAP request per plant">{(id) => <PlantPicker id={id} values={q.plants} onChange={(v) => onChange({ plants: v })} state={plants} invalid={!!errors.plants} />}</Field>
        <Field label="Materials" hint="Leave empty for every finished good that fits">{(id) => <MaterialPicker id={id} values={q.materials} onChange={(v) => onChange({ materials: v })} max={50} />}</Field>
        <Field label="Finished goods taken">{() => <Segmented<FgSource> label="FG source" size="sm" value={q.source} onChange={(v) => onChange({ source: v, inclDirect: v === 'G' ? q.inclDirect : false })} options={(Object.keys(SOURCE_LABEL) as FgSource[]).map((k) => ({ value: k, label: k === 'P' ? 'Latest process order' : k === 'G' ? 'Latest FG' : 'NPD', hint: SOURCE_LABEL[k] }))} />}</Field>
        <p className="-mt-1.5 text-2xs text-faint">{SOURCE_HINT[q.source]}</p>
        <Field label="Business line">{() => (
          <div className="flex flex-col gap-2">
            <Segmented<BusinessLine> label="Business line" size="sm" value={q.exclDiv ? '' : q.business} onChange={(v) => onChange({ business: v, exclDiv: false })} options={(Object.keys(BUSINESS_LABEL) as Exclude<BusinessLine, ''>[]).map((k) => ({ value: k, label: BUSINESS_LABEL[k] }))} />
            <Toggle checked={q.exclDiv} onChange={(v) => onChange({ exclDiv: v })} label="All business lines (needed to initiate)" />
          </div>
        )}</Field>
        <Field label="Component rates (CPD) of">{() => <Segmented<CountryCode> label="Country" size="sm" value={q.country} onChange={(v) => onChange({ country: v })} options={(Object.keys(COUNTRY_LABEL) as CountryCode[]).map((k) => ({ value: k, label: COUNTRY_LABEL[k], hint: COUNTRY_TABLE[k] }))} />}</Field>
        <p className="-mt-1.5 text-2xs text-faint">The budget cost uses the rate in <b>{COUNTRY_TABLE[q.country]}</b>, maintained by the CPD team. Info-record rates are shown for information only and are never used in the cost.</p>
      </Block>

      <Block title="Options">
        <Toggle checked={q.exclManuf} onChange={(v) => onChange({ exclManuf: v })} label="Remove manufactured WIP / FRT2 lines" />
        <Toggle checked={q.oneSkuPerCrs} onChange={(v) => onChange({ oneSkuPerCrs: v })} label="One finished good per plant + CRS SKU + business line + scheme + type" />
        <Toggle checked={q.onlyOverrides} onChange={(v) => onChange({ onlyOverrides: v })} label="Only finished goods with a cost override" />
        <Toggle checked={q.inclDirect} disabled={q.source !== 'G'} onChange={(v) => onChange({ inclDirect: v })} label="Add directly purchased products (goods receipt)" />
        <Toggle checked={q.bomQtyX10} onChange={(v) => onChange({ bomQtyX10: v })} label="Explode the BOM at 10 x base quantity" />
        <Toggle checked={q.checklist} onChange={(v) => onChange({ checklist: v })} label="Checklist flags (BOM / production versions)" />
        <p className={cx('text-2xs', canInitiate ? 'text-faint' : 'text-warn')}>{canInitiate ? 'Initiate needs "All business lines".' : 'You can view runs but not initiate (role).'}</p>
      </Block>

      <div className="lg:col-span-3">
        <button type="button" aria-expanded={ovOpen} onClick={() => setOvOpen(!ovOpen)} className="flex items-center gap-1.5 text-sm font-bold text-accent">
          {ovOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Component cost overrides{q.overrides.length ? ` (${q.overrides.length})` : ''} <span className="text-2xs font-medium text-faint">value, or % on the net landed cost</span>
        </button>
        {ovOpen && (
          <div className="mt-2 rounded-2xl border border-line bg-panel p-3">
            {errors.overrides && <p className="mb-2 text-2xs text-bad" role="alert">{errors.overrides}</p>}
            <div className="grid max-w-3xl grid-cols-[1fr_8rem_6rem_2rem] items-center gap-2 text-2xs font-bold uppercase text-muted"><span>Component</span><span>Value</span><span>%</span><span /></div>
            {q.overrides.map((o, i) => (
              <div key={i} className="mt-1.5 grid max-w-3xl grid-cols-[1fr_8rem_6rem_2rem] items-center gap-2">
                <input aria-label="Component" className={inputCls} value={o.matnr} onChange={(e) => setOv(i, { matnr: e.target.value.toUpperCase() })} />
                <input aria-label="Value" inputMode="decimal" className={inputCls} value={o.value} onChange={(e) => setOv(i, { value: e.target.value.replace(',', '.') })} />
                <input aria-label="Percent" inputMode="decimal" className={inputCls} value={o.pct} onChange={(e) => setOv(i, { pct: e.target.value.replace(',', '.') })} />
                <button type="button" aria-label="Remove row" className="text-muted hover:text-bad" onClick={() => onChange({ overrides: q.overrides.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
              </div>
            ))}
            <Button size="sm" className="mt-2" disabled={q.overrides.length >= MAX_OVERRIDES} onClick={() => onChange({ overrides: [...q.overrides, { matnr: '', value: '', pct: '' }] })}><Plus size={13} /> Add component</Button>
          </div>
        )}
      </div>
    </div>
  );
}
