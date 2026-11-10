'use client';
/**
 * Edit panel of one rate row (Rates & Edit): the rate options by category (spec 7), the adjustment (8), freight (9) and the override (10),
 * with the budgeted basic and landed rate shown as you type. The preview is the client's; SAP recalculates on save and stays the source of truth.
 */
import { useEffect, useMemo, useState } from 'react';
import { Field, Spinner, cx, inputCls } from '../ui';
import { ErrorBox, SourceChip, errorText } from './shared';
import { fetchRateSources } from '@/lib/budgetMgmt/api';
import type { AdjType, BudRateRow, BudRateSrcRow, RateEdit } from '@/lib/budgetMgmt/types';
import { budgetedBasic, freightApplies, landedRate, marketRate, pickByPriority, srcCode, type Errors } from '@/lib/budgetMgmt/rules';
import { sourceLabel } from '@/lib/rates/sourceLabel';
import { fmtNum } from '@/lib/format';

const ADJ: { v: AdjType; label: string }[] = [{ v: 'N', label: 'None' }, { v: 'P', label: 'Percent (%)' }, { v: 'A', label: 'Amount' }];
/** Category A: one way to finalize the basic rate at a time (spec 7.1 and 8.3). Selected = SAP's own selection, Manual = a direct rate (the override). */
type AMode = 'S' | 'M' | 'P' | 'A';
const A_MODES: { v: AMode; label: string }[] = [{ v: 'S', label: 'Selected rate' }, { v: 'M', label: 'Manual rate' }, { v: 'P', label: 'Percentage adjustment' }, { v: 'A', label: 'Absolute adjustment' }];
const modeOf = (f: RateEdit): AMode => (f.overrideRate.trim() !== '' ? 'M' : f.adjType === 'P' ? 'P' : f.adjType === 'A' ? 'A' : 'S');

const Line = ({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4 text-xs"><span className="text-muted">{k}</span><span className={cx('num', strong && 'text-sm font-extrabold')}>{v}</span></div>
);

export default function RateEditPanel({ r, form, setForm, errs, prio, onEnter }: { r: BudRateRow; form: RateEdit; setForm: (f: RateEdit) => void; errs: Errors<keyof RateEdit>; prio: readonly string[]; onEnter?: () => void }) {
  const [src, setSrc] = useState<{ rows?: BudRateSrcRow[]; error?: string }>({});
  // Rate sources of the material (market rate, priority pick): the same BudRateSrcSet read as the History drill-down.
  useEffect(() => {
    let live = true;
    setSrc({});
    fetchRateSources(r.Matnr, r.Bukrs, r.Werks, r.Land1).then((rows) => live && setSrc({ rows }), (x) => live && setSrc({ error: errorText(x) }));
    return () => { live = false; };
  }, [r.Matnr, r.Bukrs, r.Werks, r.Land1]);

  const cat = r.Matcat;
  const base = r.SrcRate;
  const basic = budgetedBasic(base, form);
  const overriding = form.overrideRate.trim() !== '';
  // Freight follows the source: none for C-Map; a manual or overriding rate is a rate that carries freight.
  const frtOn = overriding || freightApplies(r.RateSrc);
  const frt = frtOn ? r.FrtTotal : 0;
  const landed = landedRate(basic, frt, frtOn);
  const mkt = useMemo(() => (src.rows ? marketRate(src.rows) : null), [src.rows]);
  const pick = useMemo(() => (src.rows && cat === 'B' ? pickByPriority(src.rows, prio) : null), [src.rows, cat, prio]);
  const reasonMissing = overriding && !form.overrideRsn.trim();
  const aMode = modeOf(form);
  const setMode = (m: AMode) => setForm(m === 'S' ? { adjType: 'N', adjValue: '', overrideRate: '', overrideRsn: '' } : m === 'M' ? { adjType: 'N', adjValue: '', overrideRate: form.overrideRate, overrideRsn: form.overrideRsn } : { adjType: m, adjValue: '', overrideRate: '', overrideRsn: '' });

  const overrideFields = (
    <>
      <Field label={cat === 'A' ? 'Manual rate' : 'Override rate'} error={errs.overrideRate}>{(id) => <input id={id} className={cx(inputCls, errs.overrideRate && 'border-bad')} inputMode="decimal" value={form.overrideRate} onChange={(e) => setForm({ ...form, overrideRate: e.target.value })} />}</Field>
      <Field label={cat === 'A' ? 'Manual rate reason' : 'Override reason'} error={errs.overrideRsn}>{(id) => <input id={id} className={cx(inputCls, (errs.overrideRsn || reasonMissing) && 'border-bad')} value={form.overrideRsn} onChange={(e) => setForm({ ...form, overrideRsn: e.target.value })} />}</Field>
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]" onKeyDown={(e) => { if (e.key === 'Enter' && onEnter && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'radio') { e.preventDefault(); onEnter(); } }}>
      <div>
        {cat === 'A' ? (
          <>
            <fieldset className="mb-3">
              <legend className="mb-1 text-xs font-bold text-muted">Basic rate — Category A (one way at a time)</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">{A_MODES.map((m) => <label key={m.v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="amode" checked={aMode === m.v} onChange={() => setMode(m.v)} />{m.label}</label>)}</div>
            </fieldset>
            <div className="grid gap-3 md:grid-cols-3">
              {(aMode === 'P' || aMode === 'A') && <Field label={aMode === 'P' ? 'Adjustment (%, + or −)' : 'Adjustment (amount, + or −)'} error={errs.adjValue}>{(id) => <input id={id} className={cx(inputCls, errs.adjValue && 'border-bad')} inputMode="decimal" value={form.adjValue} onChange={(e) => setForm({ ...form, adjValue: e.target.value })} />}</Field>}
              {aMode === 'M' && overrideFields}
            </div>
          </>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Adj type">{(id) => <select id={id} className={inputCls} value={form.adjType} onChange={(e) => setForm({ ...form, adjType: e.target.value as AdjType, adjValue: '' })}>{ADJ.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select>}</Field>
            {form.adjType !== 'N' && <Field label={form.adjType === 'P' ? 'Adj value (%, + or −)' : 'Adj value (+ or −)'} error={errs.adjValue}>{(id) => <input id={id} className={cx(inputCls, errs.adjValue && 'border-bad')} inputMode="decimal" value={form.adjValue} onChange={(e) => setForm({ ...form, adjValue: e.target.value })} />}</Field>}
            {overrideFields}
          </div>
        )}
        {cat === 'A' && aMode !== 'M' && errs.overrideRate && <p className="mt-1 text-2xs text-bad">{errs.overrideRate}</p>}

        {cat === 'B' && (
          <div className="mt-3 rounded-xl border border-line bg-panel px-3 py-2 text-xs">
            <p className="font-bold">Rate source priority: {prio.map(sourceLabel).join(' › ')}</p>
            {!src.rows && !src.error ? <Spinner /> : src.error ? <p className="text-muted">Rate sources could not be read ({src.error})</p> : pick ? (
              <p className="mt-1">First valid source: <SourceChip src={sourceLabel(pick.source)} /> <span className="num font-bold">{fmtNum(pick.rate, 3)}</span>
                {srcCode(r.RateSrc) !== pick.source && <span className="text-warn"> — SAP selected {sourceLabel(r.RateSrc)} ({fmtNum(base, 3)}).</span>}
                {' '}<button type="button" className="font-semibold text-accent underline" onClick={() => setForm({ adjType: 'N', adjValue: '', overrideRate: String(pick.rate), overrideRsn: `Rate source priority: ${sourceLabel(pick.source)}` })}>Use as override rate</button></p>
            ) : <p className="mt-1 text-muted">No source in the priority list has a rate.</p>}
          </div>
        )}
        {cat === 'C' && <p className="mt-3 text-xs text-muted">Category C: the latest Info record first, then C-Map; percent or amount adjustment, or an override rate. No freight or delivery conditions on a C-Map rate.</p>}
        {src.error && cat === 'A' && <div className="mt-3"><ErrorBox>Market rate unavailable: {src.error}</ErrorBox></div>}
      </div>

      <div className="rounded-xl border border-line bg-panel px-3 py-2">
        <p className="mb-1 text-xs font-bold">Budgeted rate preview</p>
        <div className="flex flex-col gap-0.5">
          <Line k={`Source rate (${sourceLabel(r.RateSrc) || '—'})`} v={fmtNum(base, 3)} />
          {cat === 'A' && <Line k="Market rate" v={!src.rows && !src.error ? '…' : mkt ? fmtNum(mkt.RatePc, 3) : '—'} />}
          <Line k="Budgeted basic rate" v={fmtNum(basic, 3)} strong />
          <Line k={frtOn ? 'Freight / delivery' : 'Freight / delivery (not applicable)'} v={frtOn ? fmtNum(frt, 3) : '—'} />
          <Line k={`Landed rate ${r.LandedCurr}`} v={fmtNum(landed, 3)} strong />
        </div>
        {onEnter && <p className="mt-1.5 text-2xs text-accent">Press Enter in a field to simulate this rate in the table.</p>}
        <p className="mt-1.5 text-2xs text-faint">Preview only — SAP recalculates when you save. The original source rate is kept.</p>
      </div>
    </div>
  );
}
