'use client';
import { useMemo } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { RATE_SOURCES } from '@/lib/query/schema';
import { EMPTY_SIM, isIdentity, QTY_BREAKS, quantityBreaks, tornado, type PickMode, type SimRow, type SimSettings } from '@/lib/cost/simulate';
import { isLeafRow, rowKey } from '@/lib/cost/tree';
import { D, ZERO, pctChange } from '@/lib/cost/decimal';
import { fmtNum, fmtPct, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { PriorityList } from './Pickers';
import { Button, Card, cx, inputBase, inputCls, SimTag, Stat } from './ui';
import { Tornado } from './charts';

function Pct({ label, value, onChange, id }: { label: string; value: number; onChange: (v: number) => void; id: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr_64px] items-center gap-2">
      <label htmlFor={id} className="truncate text-xs font-medium">{label}</label>
      <input id={id} type="range" min={-50} max={50} step={0.5} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={`${value}%`} className="accent-[rgb(var(--sim))]" />
      <div className="flex items-center gap-0.5">
        <input aria-label={`${label} percent`} type="number" step={0.5} className={cx(inputBase, 'h-7 w-full px-1 text-right text-xs', value !== 0 && 'text-sim')} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
        <span className="text-xs text-faint">%</span>
      </div>
    </div>
  );
}

export default function Simulator({
  rows, sim, settings, onChange, explQty, groupCurr, onOpenRow, onSapQtyScenarios, pending,
}: {
  rows: CostLine[]; sim: SimRow[]; settings: SimSettings; onChange: (s: SimSettings) => void; explQty: string; groupCurr: string;
  onOpenRow: (i: number) => void; onSapQtyScenarios: (mults: number[]) => void; pending: boolean;
}) {
  const set = (patch: Partial<SimSettings>) => onChange({ ...settings, ...patch });
  const currencies = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) {
      if (!isLeafRow(r)) continue;
      for (const c of [r.SelCurr, r.FrtCurr, r.LocCurr, ...(r.RateOptions ?? []).map((o) => o.Curr)]) if (c && c !== groupCurr) s.add(c);
    }
    return Array.from(s).sort();
  }, [rows, groupCurr]);

  const summary = useMemo(() => {
    let base = ZERO, after = ZERO, repicked = 0, changed = 0;
    const heads = new Map<string, { label: string; plant: string; base: ReturnType<typeof D>; after: ReturnType<typeof D> }>();
    rows.forEach((r, i) => {
      if (!isLeafRow(r)) return;
      const b = D(r.TotCostInr);
      const a = sim[i].total;
      base = base.plus(b);
      after = after.plus(a);
      if (sim[i].repicked) repicked++;
      if (sim[i].changed) changed++;
      const k = `${r.Hwerks}|${r.Headmat}`;
      const h = heads.get(k) ?? { label: `${r.Headmat} ${r.Headtxt}`, plant: r.Hwerks, base: ZERO, after: ZERO };
      h.base = h.base.plus(b);
      h.after = h.after.plus(a);
      heads.set(k, h);
    });
    return { base, after, repicked, changed, heads: Array.from(heads.values()) };
  }, [rows, sim]);

  const torn = useMemo(() => tornado(rows, sim, { pct: 10, topN: 8, groupCurr }), [rows, sim, groupCurr]);
  const breaks = useMemo(() => quantityBreaks(rows, sim, explQty), [rows, sim, explQty]);
  const overrides = Object.entries(settings.overrides);
  const keyIndex = useMemo(() => new Map(rows.map((r, i) => [rowKey(r), i])), [rows]);
  const active = !isIdentity(settings);
  const delta = summary.after.minus(summary.base);

  return (
    <div className="scroll-thin grid h-full grid-cols-1 gap-3 overflow-auto p-3 lg:grid-cols-[360px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">Instant what-ifs on SAP's returned figures — no SAP call. Every simulated number is marked <SimTag />.</p>
          <Button size="sm" disabled={!active} onClick={() => onChange({ ...EMPTY_SIM, prio: settings.prio })}>Reset</Button>
        </div>

        <Card title="Rate source pick">
          <div role="radiogroup" aria-label="Rate pick" className="grid grid-cols-2 gap-1">
            {([['sap', 'SAP selection'], ['priority', 'Priority order'], ['cheapest', 'Cheapest option'], ['latest', 'Latest valid-from']] as [PickMode, string][]).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={settings.pick === m} onClick={() => set({ pick: m })} className={cx('rounded-md border px-2 py-1.5 text-xs', settings.pick === m ? 'border-sim bg-sim/10 font-semibold text-sim' : 'border-line text-muted hover:text-ink')}>
                {l}
              </button>
            ))}
          </div>
          {settings.pick === 'priority' && (
            <div className="mt-2">
              <PriorityList value={settings.prio} onChange={(v) => set({ prio: v as SimSettings['prio'] })} all={RATE_SOURCES} />
            </div>
          )}
          {settings.pick !== 'sap' && <p className="mt-2 text-2xs text-muted">{summary.repicked.toLocaleString('en-IN')} lines re-picked from their RateOptions.</p>}
        </Card>

        <Card title="Rate change by source">
          <div className="space-y-1.5">
            {RATE_SOURCES.map((s) => <Pct key={s} id={`src-${s}`} label={s} value={settings.ratePct[s] ?? 0} onChange={(v) => set({ ratePct: { ...settings.ratePct, [s]: v } })} />)}
          </div>
        </Card>

        <Card title="Freight, FX and quantity">
          <div className="space-y-1.5">
            <Pct id="frt" label="Freight" value={settings.freightPct} onChange={(v) => set({ freightPct: v })} />
            {currencies.map((c) => <Pct key={c} id={`fx-${c}`} label={`FX ${c}→${groupCurr}`} value={settings.fxPct[c] ?? 0} onChange={(v) => set({ fxPct: { ...settings.fxPct, [c]: v } })} />)}
            {currencies.length === 0 && <p className="text-2xs text-faint">All amounts are already in {groupCurr} — no FX to shock.</p>}
            <div className="grid grid-cols-[96px_1fr] items-center gap-2 pt-1">
              <label htmlFor="qm" className="text-xs font-medium">Qty multiplier</label>
              <div className="flex items-center gap-1">
                <input id="qm" type="number" min={0} step={0.1} className={cx(inputBase, 'h-7 w-20 text-right text-xs', settings.qtyMult !== 1 && 'text-sim')} value={settings.qtyMult} onChange={(e) => set({ qtyMult: Math.max(0, Number(e.target.value) || 0) })} />
                {[0.5, 1, 2, 5].map((m) => <Button key={m} size="sm" variant={settings.qtyMult === m ? 'primary' : 'secondary'} onClick={() => set({ qtyMult: m })}>×{m}</Button>)}
              </div>
            </div>
          </div>
          <p className="mt-2 text-2xs text-faint">FX shocks apply to the currency an amount is priced in (rate: SelCurr / option currency; freight: FrtCurr).</p>
        </Card>

        <Card title={`Manual overrides (${overrides.length})`} actions={overrides.length > 0 && <Button size="sm" onClick={() => set({ overrides: {} })}>Clear all</Button>}>
          {overrides.length === 0 ? (
            <p className="text-xs text-muted">Open a row in the tree and set a rate/pc in INR to override it.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {overrides.map(([k, v]) => {
                const i = keyIndex.get(k);
                const r = i !== undefined ? rows[i] : null;
                return (
                  <li key={k} className="flex items-center gap-2">
                    <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => i !== undefined && onOpenRow(i)}>
                      {r ? <><span className="font-mono">{r.Hwerks} {r.Idnrk}</span> <span className="text-muted">{r.Maktx}</span></> : <span className="text-faint">{k} (not in this result)</span>}
                    </button>
                    {r && <span className="num text-faint line-through">{fmtRate(r.SelRatePcInr)}</span>}
                    <span className="num sim-val">{fmtRate(v)}</span>
                    <button type="button" aria-label="Remove override" className="text-faint hover:text-bad" onClick={() => { const o = { ...settings.overrides }; delete o[k]; set({ overrides: o }); }}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className={cx('space-y-3', pending && 'opacity-70 transition-opacity')}>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Stat label={`SAP total ${groupCurr}`} value={fmtNum(summary.base, 2)} sub="authoritative" />
          <Stat label={`Simulated ${groupCurr}`} sim value={fmtNum(summary.after, 2)} sub={`${summary.changed.toLocaleString('en-IN')} lines changed`} />
          <Stat label="Delta" sim value={fmtSigned(delta)} tone={delta.gt(0) ? 'bad' : delta.lt(0) ? 'good' : undefined} sub={fmtPct(pctChange(summary.base, summary.after))} />
          <Stat label={delta.lt(0) ? 'Saving' : 'Extra cost'} sim value={fmtNum(delta.abs(), 2)} sub="vs current SAP selection" />
        </div>

        <Card title={<>Before / after by header {active && <SimTag />}</>} bodyClass="p-0">
          <div className="scroll-thin max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel text-faint">
                <tr><th className="px-3 py-1.5 text-left font-medium">Plant</th><th className="text-left font-medium">Header</th><th className="text-right font-medium">SAP INR</th><th className="text-right font-medium">Simulated INR</th><th className="px-3 text-right font-medium">Δ</th></tr>
              </thead>
              <tbody>
                {summary.heads.map((h) => {
                  const d = h.after.minus(h.base);
                  return (
                    <tr key={h.plant + h.label} className="border-t border-line/60">
                      <td className="px-3 py-1 font-mono">{h.plant}</td>
                      <td className="truncate">{h.label}</td>
                      <td className="num text-right">{fmtNum(h.base, 2)}</td>
                      <td className="num text-right"><span className={cx(!d.isZero() && 'sim-val')}>{fmtNum(h.after, 2)}</span></td>
                      <td className={cx('num px-3 text-right', d.gt(0) ? 'text-bad' : d.lt(0) ? 'text-good' : 'text-faint')}>{d.isZero() ? '—' : `${fmtSigned(d)} (${fmtPct(pctChange(h.base, h.after))})`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={<>Sensitivity: ±10% on each driver {active && <SimTag />}</>}>
          <p className="mb-2 text-2xs text-muted">Change in total {groupCurr} if the driver moves −10% (blue) or +10% (red). Top components (rate + freight), all freight, and each foreign currency's FX.</p>
          {torn.length ? <Tornado pct={10} data={torn.map((b) => ({ label: b.driver.slice(0, 32), down: Number(b.down.toFixed(2)), up: Number(b.up.toFixed(2)) }))} /> : <p className="text-sm text-muted">Nothing to analyse.</p>}
        </Card>

        <Card
          title={<>Quantity breaks — cost per piece {active && <SimTag />}</>}
          actions={<Button size="sm" onClick={() => onSapQtyScenarios([0.5, 2, 5, 10])} title="Create SAP scenarios with ExplQty ×0.5, ×2, ×5, ×10">Verify in SAP</Button>}
          bodyClass="p-0"
        >
          <p className="px-3 pt-2 text-2xs text-muted">Linear scaling of ProdQty, so the per-piece cost is flat. Lot-size effects, fixed quantities and price scales only show when SAP re-runs at that quantity (Verify in SAP).</p>
          <div className="scroll-thin max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel text-faint">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Plant / header</th>
                  {QTY_BREAKS.map((m) => <th key={m} className="text-right font-medium">×{m} ({fmtQty(D(explQty).times(m))})</th>)}
                </tr>
              </thead>
              <tbody>
                {breaks.map((b) => (
                  <tr key={b.plant + b.head} className="border-t border-line/60">
                    <td className="px-3 py-1"><span className="font-mono">{b.plant} {b.head}</span> <span className="text-muted">{b.text}</span></td>
                    {b.breaks.map((x) => (
                      <td key={x.mult} className="num pr-3 text-right" title={`Total ${fmtNum(x.total, 2)} INR`}>{fmtRate(x.perPc)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
