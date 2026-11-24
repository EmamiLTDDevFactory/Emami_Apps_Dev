'use client';
/** MIS: COGM variance bridge (rate, usage, overheads; mix and currency say why they are not available). Loads on request: SAP reads the consumption of the largest variances. */
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Button, Spinner, cx, inputCls } from '../ui';
import { ErrorBox, errorText } from '../budget-mgmt/shared';
import { fetchBridge } from '@/lib/dash/service';
import type { BridgeRow } from '@/lib/dash/types';
import { lakh, tdCls, thCls } from './parts';
import AiNarrateSlot from '../ai/AiNarrateSlot';
import { bridgeSpec } from '@/lib/ai/builders/screens';

const LABEL: Record<string, string> = {
  BUDGET: 'Budget (flexed to actual quantity)', RATE_R: 'Raw material: rate', USAGE_R: 'Raw material: usage', RATE_P: 'Packing material: rate', USAGE_P: 'Packing material: usage',
  RATE_F: 'Perfume: rate', USAGE_F: 'Perfume: usage', NOSPLIT: 'Material variance, finished goods not analysed', OVERHEAD: 'Overheads (machine, labour, power, steam)',
  MIX: 'Mix', CURRENCY: 'Currency', UNEXPL: 'Unexplained', ACTUAL: 'Actual (same finished goods)',
};
const NA = new Set(['MIX', 'CURRENCY']);
const D = (v: string) => { try { return new Decimal(v || 0); } catch { return new Decimal(0); } };

export default function BridgeBlock({ plants, asOf, bn }: { plants: string; asOf: string; bn: (c: string) => string }) {
  const [rows, setRows] = useState<BridgeRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('ALL');

  async function run() {
    setBusy(true); setError('');
    try { const r = await fetchBridge(plants.split(/[\s,;]+/).filter(Boolean), asOf); setRows(r.rows); setBrand('ALL'); }
    catch (e) { setRows(null); setError(errorText(e)); }
    setBusy(false);
  }
  const brands = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.Zbrand))).sort(), [rows]);
  const lines = useMemo(() => {
    const m = new Map<string, { effect: string; sort: number; value: Decimal; msg: string }>();
    for (const r of rows ?? []) {
      if (brand !== 'ALL' && r.Zbrand !== brand) continue;
      const x = m.get(r.Effect) ?? { effect: r.Effect, sort: r.SortNo, value: new Decimal(0), msg: r.Msg };
      x.value = x.value.plus(D(r.Value));
      if (!x.msg && r.Msg) x.msg = r.Msg;
      m.set(r.Effect, x);
    }
    return Array.from(m.values()).sort((a, b) => a.sort - b.sort);
  }, [rows, brand]);
  const budget = lines.find((l) => l.effect === 'BUDGET')?.value ?? new Decimal(0);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-extrabold">Variance bridge: budget to actual (year to date)</h3>
        <Button size="sm" onClick={run} disabled={busy || !plants.trim()}>{busy ? 'Reading from SAP…' : rows ? 'Run again' : 'Run the bridge'}</Button>
        {busy && <Spinner className="h-4 w-4" />}
        {rows && (
          <select className={cx(inputCls, 'h-8 w-56 text-xs')} value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
            <option value="ALL">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{bn(b) || b}</option>)}
          </select>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">
        Material rate and usage are worked out from the consumption of the process orders against the budget items, for the finished goods with the largest material variance; the rest shows as &quot;not analysed&quot;.
        Overheads compare the actual conversion with the budget machine, labour, power and steam. Mix and currency need data SAP does not hold yet. Rate and usage are split per component: usage = (actual qty - budget qty) x budget rate; rate = actual value - actual qty x budget rate.
      </p>
      {error && <div className="mt-2"><ErrorBox>{error}</ErrorBox></div>}
      {rows && rows.length > 0 && <AiNarrateSlot className="mt-2" label="Explain the bridge with AI" build={() => bridgeSpec(brand === 'ALL' ? rows : rows.filter((r) => r.Zbrand === brand), brand === 'ALL' ? '' : bn(brand) || brand, plants, asOf)} />}
      {rows && !rows.length && <p className="mt-2 text-xs text-muted">SAP returned no rows (no production in the period, or no approved budget).</p>}
      {rows && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[720px] border-collapse">
            <thead><tr><th className={cx(thCls, '!text-left')}>Effect</th><th className={thCls}>₹ lakh</th><th className={thCls}>% of budget</th><th className={cx(thCls, '!text-left')}>Note</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const na = NA.has(l.effect);
                const edge = l.effect === 'BUDGET' || l.effect === 'ACTUAL';
                return (
                  <tr key={l.effect} className={cx('border-t border-line/60', edge && 'bg-sunken/50 font-bold')}>
                    <td className="px-2.5 py-1.5 text-left text-xs">{LABEL[l.effect] ?? l.effect}</td>
                    <td className={cx(tdCls, !edge && !na && (l.value.gt(0) ? 'text-bad' : l.value.lt(0) ? 'text-good' : ''))}>{na ? 'n/a' : lakh(l.value, 2)}</td>
                    <td className={tdCls}>{na || edge || budget.isZero() ? '' : `${l.value.gt(0) ? '+' : ''}${l.value.div(budget).times(100).toFixed(2)} %`}</td>
                    <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{l.msg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
