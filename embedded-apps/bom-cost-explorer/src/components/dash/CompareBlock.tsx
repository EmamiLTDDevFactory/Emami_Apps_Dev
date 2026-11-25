'use client';
/**
 * Component wise side by side: actual consumption, approved budget (ZMM_FBUDCOST_DET) and the cost at a chosen rate type, with the variance to budget highlighted.
 * The rate type cost needs live BOM costing of the finished good in a plant, so it is loaded on request.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type Decimal from 'decimal.js';
import { Button, Segmented, SourceBadge, Spinner, cx, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { CAT_LABEL, type BudGroup, type Cat, type Cdrill } from '@/lib/dash/cdrill';
import { atRateType, buildCompare, costRun, varTone, type CmpRow, type CmpTotals, type RateRun } from '@/lib/dash/compare';
import { COGM_RATE_LABEL, COGM_RATE_TYPES } from '@/lib/psum/rateCogm';
import type { RateType } from '@/lib/cost/rateSummary';
import { tdCls, thCls } from './parts';

const num = (v: Decimal | null, dp = 4) => (v ? v.toNumber().toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '-');
const sgn = (v: Decimal | null, dp = 4) => (v ? `${v.gt(0) ? '+' : ''}${num(v, dp)}` : '-');
const pc = (v: Decimal | null) => (v ? `${v.gt(0) ? '+' : ''}${v.toFixed(1)} %` : '');
const TONE = { bad: 'bg-bad/10 text-bad', good: 'bg-good/10 text-good', '': '' } as const;

export default function CompareBlock({ matnr, data, defaultPlant }: { matnr: string; data: Cdrill; defaultPlant: string }) {
  const groups = data.budget;
  const [bwtar, setBwtar] = useState(groups.find((g) => g.flag !== 'NBC')?.bwtar ?? groups[0]?.bwtar ?? '');
  const [type, setType] = useState<RateType>('SELECTED');
  const [plant, setPlant] = useState(defaultPlant);
  const [run, setRun] = useState<RateRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cat, setCat] = useState<Cat | 'ALL'>('ALL');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);
  const bud: BudGroup | null = groups.find((g) => g.bwtar === bwtar) ?? null;
  // a valuation type that looks like a plant is the natural plant to cost in
  useEffect(() => { if (/^[A-Z0-9]{4}$/.test(bwtar) && !defaultPlant) setPlant(bwtar); }, [bwtar, defaultPlant]);

  async function load() {
    ctl.current?.abort(); const c = new AbortController(); ctl.current = c;
    const p = plant.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(p)) { setError('Enter the 4 character production plant to cost the finished good in.'); return; }
    setBusy(true); setError('');
    try { const r = await costRun(p, matnr, c.signal); if (!c.signal.aborted) setRun(r); }
    catch (e) { if (!c.signal.aborted) { setRun(null); setError(errorText(e)); } }
    if (!c.signal.aborted) setBusy(false);
  }
  // the loaded figures belong to one rate type: choosing another one asks for a new load
  const rate = useMemo(() => (run ? atRateType(run, type) : null), [run, type]);
  const shownRate = rate && rate.priced > 0 ? rate : null;
  const emptyRate = rate && rate.priced === 0 ? rate : null;
  // cost automatically once, in the plant the valuation type points to
  const auto = useRef(false);
  useEffect(() => { if (!auto.current && /^[A-Z0-9]{4}$/.test(plant.trim().toUpperCase())) { auto.current = true; void load(); } }, [plant]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmp = useMemo(() => buildCompare(data, bud, shownRate), [data, bud, shownRate]);
  const rows = cmp.rows.filter((r) => cat === 'ALL' || r.cat === cat);
  const label = COGM_RATE_LABEL(type);

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">Component comparison: actual vs budget vs {label} rate</h4>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-panel p-3 shadow-card">
        {groups.length > 1 && (
          <label className="text-xs font-bold">Budget valuation type
            <select className={cx(inputCls, 'mt-1 block w-36')} value={bwtar} onChange={(e) => setBwtar(e.target.value)}>
              {groups.map((g) => <option key={g.bwtar || '-'} value={g.bwtar}>{g.bwtar || '(blank)'}{g.flag === 'NBC' ? ' - NBC' : ''}</option>)}
            </select>
          </label>
        )}
        <label className="text-xs font-bold">Rate type
          <select className={cx(inputCls, 'mt-1 block w-44')} value={type} onChange={(e) => setType(e.target.value as RateType)}>
            {COGM_RATE_TYPES.map((t) => <option key={t} value={t}>{COGM_RATE_LABEL(t)}</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">Costing plant
          <input className={cx(inputCls, 'mt-1 block w-24 uppercase')} maxLength={4} value={plant} onChange={(e) => setPlant(e.target.value)} placeholder="UN13" />
        </label>
        <Button onClick={load} disabled={busy}>{busy ? 'Costing…' : shownRate ? 'Refresh rate cost' : 'Cost at rate type'}</Button>
        {busy && <Spinner className="h-4 w-4" />}
        <p className="basis-full text-2xs text-muted">
          Rate type = which rate is used to price each component of the BOM (quantity per piece x rate): Selected = the rate SAP picked by its priority, Consumption = consumption based rate,
          C-MAP = moving average (MBEW), Budget = budget landed rate. The finished good is costed live in the plant above (it must be a production plant). Variance = actual minus budget: red costs more, green costs less (within 0.5 % not coloured).
        </p>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {emptyRate && <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs">BOM costing of this finished good in plant {emptyRate.werks} returned {emptyRate.leaves} component(s) and none has a {label} rate. Check the plant (it must be where the BOM is costed) or choose another rate type.</p>}
      {shownRate && shownRate.notes.map((n) => <p key={n} className="text-2xs text-muted">{n}</p>)}
      {shownRate && <p className="text-2xs text-muted">{shownRate.priced} of {shownRate.leaves} components have a {label} rate in plant {shownRate.werks}; the others count as 0 in the {label} column.</p>}
      {bud?.flag === 'NBC' && <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-xs">{bud.msg}. The budget column is empty, so variances show the full cost.</p>}
      <Segmented label="Category" size="sm" value={cat} onChange={setCat} options={[{ value: 'ALL' as const, label: 'All' }, ...(['R', 'P', 'F', 'O'] as Cat[]).map((k) => ({ value: k, label: CAT_LABEL[k] }))]} />
      <div className="max-h-[48vh] overflow-auto rounded-xl border border-line">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="sticky top-0">
            <tr>
              <th className={cx(thCls, '!text-left')} rowSpan={2}>Component</th>
              <th className={thCls} colSpan={2}>Actual (process orders)</th><th className={thCls} colSpan={2}>Budget (approved)</th><th className={thCls} colSpan={4}>{label} rate</th>
              <th className={thCls} colSpan={2}>Actual - budget</th>
            </tr>
            <tr>
              {['Qty / pc', '₹ / pc', 'Qty / pc', '₹ / pc', 'Qty / pc', 'Rate', 'Source', '₹ / pc', '₹', '%'].map((h, i) => <th key={i} className={thCls}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <Row key={r.key} r={r} hasRate={!!shownRate} />)}
            {rows.length === 0 && <tr><td colSpan={11} className="p-3 text-center text-xs text-muted">No components.</td></tr>}
          </tbody>
          <tfoot>
            {(['R', 'P', 'F', 'O'] as Cat[]).filter((k) => cat === 'ALL' || k === cat).map((k) => <Tot key={k} label={CAT_LABEL[k]} t={cmp.byCat[k]} hasRate={!!shownRate} />)}
            <Tot label="Total per piece" t={cmp.total} hasRate={!!shownRate} bold />
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Row({ r, hasRate }: { r: CmpRow; hasRate: boolean }) {
  const a = TONE[varTone(r.actVar, r.actVarPct)];
  const note = r.budCost === null ? 'not in budget' : r.actCost === null ? 'not consumed' : '';
  return (
    <tr className="border-t border-line/60">
      <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{r.key}</span> <span className="text-muted" title={r.maktx}>{r.maktx}</span>{note && <span className="ml-1 rounded-full bg-warn/15 px-1.5 py-0.5 text-2xs font-bold text-warn">{note}</span>}</td>
      <td className={tdCls}>{num(r.actQty, 5)}</td><td className={tdCls}>{num(r.actCost)}</td>
      <td className={tdCls}>{num(r.budQty, 5)}</td><td className={tdCls}>{num(r.budCost)}</td>
      <td className={tdCls}>{hasRate ? num(r.rateQty, 5) : '-'}</td><td className={tdCls}>{hasRate ? num(r.rate) : '-'}</td><td className={cx(tdCls, '!text-left')}>{hasRate && r.rateSrc ? <SourceBadge source={r.rateSrc} /> : hasRate && r.rateQty ? <span className="text-2xs font-semibold text-bad">NO RATE</span> : ''}</td><td className={tdCls}>{hasRate ? num(r.rateCost) : '-'}</td>
      <td className={cx(tdCls, a)}>{sgn(r.actVar)}</td><td className={cx(tdCls, a)}>{pc(r.actVarPct)}</td>
    </tr>
  );
}

function Tot({ label, t, hasRate, bold }: { label: string; t: CmpTotals; hasRate: boolean; bold?: boolean }) {
  const a = TONE[varTone(t.actVar, null)];
  const p = (v: Decimal) => (t.budget.gt(0) ? pc(v.div(t.budget).times(100)) : '');
  return (
    <tr className={cx('border-t border-line bg-line/20', bold ? 'font-extrabold' : 'font-bold')}>
      <td className="px-2.5 py-1.5 text-left text-xs">{label}</td>
      <td className={tdCls} /><td className={tdCls}>{num(t.actual)}</td><td className={tdCls} /><td className={tdCls}>{num(t.budget)}</td>
      <td className={tdCls} /><td className={tdCls} /><td className={tdCls} /><td className={tdCls}>{hasRate ? num(t.rate) : '-'}</td>
      <td className={cx(tdCls, a)}>{sgn(t.actVar)}</td><td className={cx(tdCls, a)}>{p(t.actVar)}</td>
    </tr>
  );
}
