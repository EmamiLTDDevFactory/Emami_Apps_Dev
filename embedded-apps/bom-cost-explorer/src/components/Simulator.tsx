'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, RotateCcw, Search } from 'lucide-react';
import { componentRates, perPiece, type ComponentRate } from '@/lib/cost/perPiece';
import { CATEGORIES, CATEGORY_LABEL, type CostCategory } from '@/lib/cost/categories';
import { AcrossPlants, BreakupTable, CategoryBadge, PerPieceImpact } from './Breakup';
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
  rows, sim, settings, onChange, explQty, groupCurr, onOpenRow, onSapQtyScenarios, pending, rateOptions = true, plantNames = {},
  rateOptionsUnavailable = false, onNeedRateOptions,
}: {
  rows: CostLine[]; sim: SimRow[]; settings: SimSettings; onChange: (s: SimSettings) => void; explQty: string; groupCurr: string;
  onOpenRow: (i: number) => void; onSapQtyScenarios: (mults: number[]) => void; pending: boolean;
  /** false when SAP could not $expand RateOptions: re-pick / cheapest / latest need them */
  rateOptions?: boolean;
  plantNames?: Record<string, string>;
  /** SAP has no rate options on this system: the re-pick choices are hidden (default false = previous behaviour) */
  rateOptionsUnavailable?: boolean;
  /** asks for the lazily loaded rate options when a re-pick needs them (BOM costing) */
  onNeedRateOptions?: () => void;
}) {
  const [more, setMore] = useState(false);
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

  const pieces = useMemo(() => perPiece(rows, sim, explQty, settings.qtyMult || 1), [rows, sim, explQty, settings.qtyMult]);

  const torn = useMemo(() => tornado(rows, sim, { pct: 10, topN: 8, groupCurr }), [rows, sim, groupCurr]);
  const breaks = useMemo(() => quantityBreaks(rows, sim, explQty), [rows, sim, explQty]);
  const overrides = Object.entries(settings.overrides);
  const keyIndex = useMemo(() => new Map(rows.map((r, i) => [rowKey(r), i])), [rows]);
  const active = !isIdentity(settings);
  const delta = summary.after.minus(summary.base);

  return (
    <div className="scroll-thin grid h-full grid-cols-1 gap-3 overflow-auto bg-bg/60 p-3 xl:grid-cols-[480px_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">Instant what-ifs on SAP's returned figures — no SAP call. Every simulated number is marked <SimTag />.</p>
          <Button size="sm" disabled={!active} onClick={() => onChange({ ...EMPTY_SIM, prio: settings.prio })}><RotateCcw size={13} /> Reset all</Button>
        </div>

        <ComponentRates rows={rows} settings={settings} onChange={onChange} plantNames={plantNames} />

        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex w-full items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3 text-sm font-bold shadow-card hover:bg-sunken">
          More what-ifs: rate source, % by source, freight, FX, quantity, overrides
          <ChevronDown size={16} className={cx('transition-transform', more && 'rotate-180')} />
        </button>
        {more && (
        <>
        <Card title="Rate source pick">
          <div role="radiogroup" aria-label="Rate pick" className="grid grid-cols-2 gap-1">
            {([['sap', 'SAP selection'], ['priority', 'Priority order'], ['cheapest', 'Cheapest option'], ['latest', 'Latest valid-from']] as [PickMode, string][]).filter(([m]) => !(rateOptionsUnavailable && m !== 'sap')).map(([m, l]) => {
              const lazy = !rateOptions && !!onNeedRateOptions && !rateOptionsUnavailable;
              const off = !rateOptions && m !== 'sap' && !lazy;
              const on = (rateOptions || lazy ? settings.pick : 'sap') === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={off}
                  title={off ? 'Needs rate options from SAP' : undefined}
                  onClick={() => { if (m !== 'sap' && !rateOptions) onNeedRateOptions?.(); set({ pick: m }); }}
                  className={cx('rounded-lg border px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40', on ? 'border-sim bg-sim/10 font-semibold text-sim' : 'border-line text-muted hover:text-ink')}
                >
                  {l}
                </button>
              );
            })}
          </div>
          {!rateOptions && (rateOptionsUnavailable || !onNeedRateOptions) && (
            <p className="mt-2 rounded-lg bg-sunken px-2.5 py-2 text-2xs text-ink" role="note">
              Rate options are not available from SAP for this system, so re-picking the source is off. Component rates, % changes, FX, quantity and manual overrides still work.
            </p>
          )}
          {!rateOptions && !rateOptionsUnavailable && onNeedRateOptions && settings.pick !== 'sap' && (
            <p className="mt-2 text-2xs text-muted">Loading rate options from SAP…</p>
          )}
          {rateOptions && settings.pick === 'priority' && (
            <div className="mt-2">
              <PriorityList value={settings.prio} onChange={(v) => set({ prio: v as SimSettings['prio'] })} all={RATE_SOURCES} />
            </div>
          )}
          {rateOptions && settings.pick !== 'sap' && <p className="mt-2 text-2xs text-muted">{summary.repicked.toLocaleString('en-IN')} lines re-picked from their RateOptions.</p>}
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
        </>
        )}
      </div>

      <div className={cx('space-y-3', pending && 'opacity-70 transition-opacity')}>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Stat label={`SAP total ${groupCurr}`} value={fmtNum(summary.base, 2)} sub="authoritative" />
          <Stat label={`Simulated ${groupCurr}`} sim value={fmtNum(summary.after, 2)} sub={`${summary.changed.toLocaleString('en-IN')} lines changed`} />
          <Stat label="Delta" sim value={fmtSigned(delta)} tone={delta.gt(0) ? 'bad' : delta.lt(0) ? 'good' : undefined} sub={fmtPct(pctChange(summary.base, summary.after))} />
          <Stat label={delta.lt(0) ? 'Saving' : 'Extra cost'} sim value={fmtNum(delta.abs(), 2)} sub="vs current SAP selection" />
        </div>

        <Card title={<>Impact on cost per 1 PC {active && <SimTag />}</>} bodyClass="p-0">
          <div className="scroll-thin max-h-80 overflow-auto"><PerPieceImpact items={pieces} plantNames={plantNames} simOn={active} /></div>
        </Card>

        <Card title={<>Cost per 1 PC across plants · {groupCurr} {active && <SimTag />}</>} bodyClass="p-0">
          <AcrossPlants items={pieces} plantNames={plantNames} simOn={active} />
        </Card>

        <Card title={<>Material cost breakup per 1 PC · RM / Perfume / PM {active && <SimTag />}</>} bodyClass="pt-3 px-0 pb-1">
          <BreakupTable items={pieces} plantNames={plantNames} simOn={active} />
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

/**
 * Component-rate simulation: one line per plant x component (rates differ by plant). Change the
 * rate with the slider, a % or a new rate per piece in INR (converted to the same %). Applies to
 * the component's material rate everywhere it is used in that plant; freight is not changed.
 */
function ComponentRates({ rows, settings, onChange, plantNames }: { rows: CostLine[]; settings: SimSettings; onChange: (s: SimSettings) => void; plantNames: Record<string, string> }) {
  const all = useMemo(() => componentRates(rows), [rows]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CostCategory | 'ALL'>('ALL');
  const [plant, setPlant] = useState('ALL');
  const [limit, setLimit] = useState(40);
  const [bulk, setBulk] = useState('');
  const plants = useMemo(() => Array.from(new Set(all.map((c) => c.plant))), [all]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of all) m[c.category] = (m[c.category] ?? 0) + 1;
    return m;
  }, [all]);
  const t = q.trim().toLowerCase();
  const shown = all.filter((c) => (cat === 'ALL' || c.category === cat) && (plant === 'ALL' || c.plant === plant) && (!t || c.comp.toLowerCase().includes(t) || c.text.toLowerCase().includes(t)));
  const pct = settings.compPct ?? {};
  const changed = Object.values(pct).filter((v) => v).length;
  const setPct = (keys: string[], v: number) => {
    const next = { ...pct };
    for (const k of keys) {
      if (!v) delete next[k];
      else next[k] = Math.round(v * 100) / 100;
    }
    onChange({ ...settings, compPct: next });
  };

  return (
    <Card
      title={<>Component rates {changed > 0 && <span className="ml-1 rounded-full bg-sim/10 px-2 py-0.5 text-[11px] font-bold text-sim">{changed} changed</span>}</>}
      actions={changed > 0 && <Button size="sm" onClick={() => onChange({ ...settings, compPct: {} })}><RotateCcw size={12} /> Reset</Button>}
      bodyClass="p-0"
    >
      <div className="space-y-2 border-b border-line px-4 py-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className={cx(inputCls, 'pl-8')} placeholder="Find component…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find component" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['ALL', ...CATEGORIES] as const).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cx('rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition', cat === c ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-muted hover:text-ink')}>
              {c === 'ALL' ? `All ${all.length}` : `${CATEGORY_LABEL[c]} ${counts[c] ?? 0}`}
            </button>
          ))}
          {plants.length > 1 && (
            <select className={cx(inputBase, 'ml-auto h-7 text-xs')} value={plant} onChange={(e) => setPlant(e.target.value)} aria-label="Plant">
              <option value="ALL">All plants</option>
              {plants.map((p) => <option key={p} value={p}>{p} {plantNames[p] ?? ''}</option>)}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-muted">Apply to the {shown.length} listed:</span>
          <input className={cx(inputBase, 'h-7 w-20 text-right text-xs')} inputMode="decimal" placeholder="±%" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Percent for all listed components" />
          <span className="text-faint">%</span>
          <Button size="sm" disabled={bulk === '' || isNaN(Number(bulk))} onClick={() => setPct(shown.map((c) => c.key), Number(bulk))}>Apply</Button>
        </div>
      </div>
      <ul className="scroll-thin max-h-[560px] divide-y divide-line/70 overflow-auto">
        {shown.slice(0, limit).map((c) => <CompRow key={c.key} c={c} value={pct[c.key] ?? 0} onPct={(v) => setPct([c.key], v)} plantName={plantNames[c.plant]} />)}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No component matches.</li>}
      </ul>
      {shown.length > limit && (
        <div className="border-t border-line px-4 py-2 text-center">
          <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 60)}>Show more ({shown.length - limit} more, sorted by cost)</Button>
        </div>
      )}
    </Card>
  );
}

function CompRow({ c, value, onPct, plantName }: { c: ComponentRate; value: number; onPct: (v: number) => void; plantName?: string }) {
  const base = c.ratePcInr;
  const newRate = base.times(1 + value / 100);
  const [rateText, setRateText] = useState<string | null>(null);
  const clamp = (v: number) => Math.max(-100, Math.min(1000, v));
  return (
    <li className={cx('px-4 py-2.5', value !== 0 && 'bg-sim/[0.04]')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-bold">{c.comp}</span>
            <CategoryBadge c={c.category} />
            <span className="rounded bg-sunken px-1.5 text-[10px] font-bold text-muted" title={plantName}>{c.plant}</span>
          </div>
          <p className="truncate text-xs text-muted" title={c.text}>{c.text}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-xs text-muted">SAP {c.noRate ? <span className="font-bold text-bad">no rate</span> : <>{fmtRate(base)} <span className="text-faint">INR/{c.uom}</span></>}</p>
          {value !== 0 && <p className="num text-xs font-bold text-sim">→ {fmtRate(newRate)}</p>}
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-2">
        <input
          type="range"
          min={-50}
          max={50}
          step={0.5}
          value={Math.max(-50, Math.min(50, value))}
          disabled={c.noRate}
          onChange={(e) => onPct(Number(e.target.value))}
          aria-label={`${c.comp} in ${c.plant} rate change percent`}
          aria-valuetext={`${value}%`}
          className="accent-[rgb(var(--sim))] disabled:opacity-40"
        />
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            step={0.5}
            disabled={c.noRate}
            className={cx(inputBase, 'h-7 w-[68px] px-1.5 text-right text-xs', value !== 0 && 'text-sim')}
            value={value}
            onChange={(e) => onPct(clamp(Number(e.target.value) || 0))}
            aria-label={`${c.comp} in ${c.plant} percent`}
          />
          <span className="text-xs text-faint">%</span>
        </div>
        <input
          inputMode="decimal"
          disabled={c.noRate || base.isZero()}
          className={cx(inputBase, 'h-7 w-[92px] px-1.5 text-right text-xs')}
          placeholder="new rate"
          title="New rate per piece in INR"
          value={rateText ?? (value !== 0 ? newRate.toFixed(4) : '')}
          onFocus={() => setRateText(value !== 0 ? newRate.toFixed(4) : '')}
          onChange={(e) => {
            const t = e.target.value.replace(',', '.');
            setRateText(t);
            const n = Number(t);
            if (t !== '' && Number.isFinite(n) && n >= 0 && !base.isZero()) onPct(clamp(Number(D(n).div(base).minus(1).times(100).toFixed(4))));
          }}
          onBlur={() => setRateText(null)}
          aria-label={`${c.comp} in ${c.plant} new rate per piece INR`}
        />
      </div>
    </li>
  );
}
