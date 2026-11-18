'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical, Plus, X } from 'lucide-react';
import { Button, Drawer, Field, Spinner, cx, inputCls } from '../ui';
import { PRIO_ALL, SRC_META, createBody, newScenarioDefaults, validateNewScenario } from '@/lib/pkg/rules';
import type { NewScenarioForm, PkgActionBody } from '@/lib/pkg/types';

const MTARTS = ['PKGN', 'VERP'];

export default function NewScenarioDrawer({ open, busy, error, onClose, onCreate }: { open: boolean; busy: boolean; error: string; onClose: () => void; onCreate: (b: PkgActionBody) => void }) {
  const [f, setF] = useState<NewScenarioForm>(newScenarioDefaults());
  const [errs, setErrs] = useState<ReturnType<typeof validateNewScenario>>({});
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => { if (open) { setF(newScenarioDefaults()); setErrs({}); } }, [open]);
  const set = <K extends keyof NewScenarioForm>(k: K, v: NewScenarioForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const move = (from: number, to: number) => setF((p) => {
    if (to < 0 || to >= p.prio.length) return p;
    const a = [...p.prio]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return { ...p, prio: a };
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateNewScenario(f);
    setErrs(v);
    if (Object.keys(v).length === 0) onCreate(createBody(f));
  }

  return (
    <Drawer open={open} onClose={onClose} title="New scenario" width={520} trapFocus>
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <p className="rounded-xl bg-sunken px-3 py-2 text-xs text-muted">Purchasing org <b>CPD</b>. ZBUD materials and BOMs are read in plant <b>HO00</b>.</p>
        <Field label="Plant" hint="Plant whose packing materials are budgeted (default HO00)" error={errs.werks}>{(id) => <input id={id} maxLength={4} className={cx(inputCls, 'uppercase', errs.werks && 'border-bad')} value={f.werks} onChange={(e) => set('werks', e.target.value)} />}</Field>
        <Field label="Description *" error={errs.descr}>{(id) => <input id={id} className={cx(inputCls, errs.descr && 'border-bad')} value={f.descr} onChange={(e) => set('descr', e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Validity from *" error={errs.validFrom}>{(id) => <input id={id} type="date" className={cx(inputCls, errs.validFrom && 'border-bad')} value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} />}</Field>
          <Field label="Validity to *" error={errs.validTo}>{(id) => <input id={id} type="date" min={f.validFrom} className={cx(inputCls, errs.validTo && 'border-bad')} value={f.validTo} onChange={(e) => set('validTo', e.target.value)} />}</Field>
          <Field label="Key date" hint="Blank = validity from">{(id) => <input id={id} type="date" className={inputCls} value={f.keyDate} onChange={(e) => set('keyDate', e.target.value)} />}</Field>
          <Field label="Budget version" hint="Blank = next free" error={errs.budgetVersion}>{(id) => <input id={id} inputMode="numeric" className={cx(inputCls, errs.budgetVersion && 'border-bad')} value={f.budgetVersion} onChange={(e) => set('budgetVersion', e.target.value)} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold">Material types *</legend>
          <div className="flex gap-4">
            {MTARTS.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.mtart.includes(t)} onChange={(e) => set('mtart', e.target.checked ? [...f.mtart, t] : f.mtart.filter((x) => x !== t))} />{t}</label>
            ))}
          </div>
          {errs.mtart && <p role="alert" className="mt-1 text-xs text-bad">{errs.mtart}</p>}
        </fieldset>
        <Field label="Material group(s)" hint="Comma list, * wildcard">{(id) => <input id={id} className={inputCls} placeholder="PK01, PK0*" value={f.matkl} onChange={(e) => set('matkl', e.target.value)} />}</Field>
        <Field label="Material(s)" hint="Comma list, * wildcard">{(id) => <input id={id} className={inputCls} value={f.matnr} onChange={(e) => set('matnr', e.target.value)} />}</Field>
        <div>
          <p className="mb-1 text-xs font-semibold">Rate source priority <span className="font-normal text-muted">(drag, or use the arrows)</span></p>
          <ol className="flex flex-wrap items-center gap-1.5" aria-label="Rate source priority">
            {f.prio.map((p, i) => (
              <li key={p} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}
                className={cx('flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-2xs font-bold ring-1 ring-line', SRC_META[p] ?? 'bg-sunken')}>
                <GripVertical size={12} className="cursor-grab opacity-60" aria-hidden />
                <span>{i + 1}. {p}</span>
                <button type="button" aria-label={`Move ${p} earlier`} disabled={i === 0} className="rounded p-0.5 disabled:opacity-30" onClick={() => move(i, i - 1)}><ArrowLeft size={11} /></button>
                <button type="button" aria-label={`Move ${p} later`} disabled={i === f.prio.length - 1} className="rounded p-0.5 disabled:opacity-30" onClick={() => move(i, i + 1)}><ArrowRight size={11} /></button>
                <button type="button" aria-label={`Remove ${p}`} className="rounded p-0.5" onClick={() => set('prio', f.prio.filter((x) => x !== p))}><X size={11} /></button>
              </li>
            ))}
            {PRIO_ALL.filter((p) => !f.prio.includes(p)).map((p) => (
              <li key={p}><button type="button" className="flex items-center gap-0.5 rounded-lg border border-dashed border-line px-1.5 py-1 text-2xs font-semibold text-muted" onClick={() => set('prio', [...f.prio, p])}><Plus size={11} />{p}</button></li>
            ))}
          </ol>
          {errs.prio && <p role="alert" className="mt-1 text-xs text-bad">{errs.prio}</p>}
        </div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.norm} onChange={(e) => set('norm', e.target.checked)} />
          <span><b>Normalise % to 100</b><span className="block text-xs text-muted">Scales the BOM component percentages of each material to total 100 instead of flagging PCT100.</span></span>
        </label>
        {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy && <Spinner />} Create &amp; calculate</Button>
        </div>
      </form>
    </Drawer>
  );
}
