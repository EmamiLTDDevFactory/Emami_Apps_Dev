'use client';
/**
 * Breakup & cost > "FG per pc": cost per FG piece on four rate bases (As per Budget, As per MBEW, As per
 * Consumption, Current selected), one row per plan material, segregated by country, with a line chart and an
 * Excel download. MBEW / Consumption need the lazy rate options (requested when this view opens).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet, Info } from 'lucide-react';
import { tdCls, tdNum, thCls, thNum } from './common';
import { Button, Card, Empty, Pill, cx } from '../ui';
import { PriceCells, PriceHeads, PriceScope } from '../price-context/slots';
import { useChartTheme } from '../charts';
import { PLAN_SOURCES, PLAN_SOURCE_COLOR, PLAN_SOURCE_LABEL, byCountry, componentRate, type FgSources, type PlanLineWithOptions, type PlanSource } from '@/lib/plan/sources';
import { exportTable, type XCol } from '@/lib/client/export';
import { planParams } from '@/lib/plan/export';
import type { PlanCostQuery } from '@/lib/plan/requests';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { isLeafRow } from '@/lib/cost/tree';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';

const num = (d: { toFixed: (n: number) => string } | null | undefined, dp = 4) => (d ? Number(d.toFixed(dp)) : null);
const NEEDS_OPTIONS: PlanSource[] = ['MBEW', 'CONSUMP'];

export default function FgPerPiece({ rows, rates, query, lines }: { rows: FgSources[]; rates: RatesState; query: PlanCostQuery; lines: PlanLineWithOptions[] }) {
  const t = useChartTheme();
  const { request } = rates;
  useEffect(() => { request(); }, [request]);
  const countries = useMemo(() => byCountry(rows), [rows]);
  const [country, setCountry] = useState<string>('');
  const shownCountries = country ? countries.filter((c) => c.land1 === country) : countries;
  const shown = shownCountries.flatMap((c) => c.rows);
  const optionsReady = rates.status === 'ready';
  const hidden = (s: PlanSource) => NEEDS_OPTIONS.includes(s) && !optionsReady;
  const noBudget = rows.length > 0 && rows.every((r) => !r.sources.BUDGET.perPc);

  const chart = useMemo(() => shown.map((r) => ({
    name: `${r.headmat} @${r.hwerks}`,
    ...Object.fromEntries(PLAN_SOURCES.filter((s) => !hidden(s)).map((s) => [s, num(r.sources[s].perPc)])),
  })), [shown, optionsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const doExport = () => {
    const fgCols: XCol[] = [
      { header: 'Country', get: (i) => shown[i].land1 },
      { header: 'Country name', get: (i) => shown[i].landx },
      { header: 'Plant', get: (i) => shown[i].hwerks },
      { header: 'FG', get: (i) => shown[i].headmat },
      { header: 'FG text', width: 30, get: (i) => shown[i].headtxt },
      { header: 'Alt BOM', get: (i) => shown[i].stlal },
      { header: 'BOM source', get: (i) => (shown[i].bomSrc === 'LASTPROD' ? `From plant ${shown[i].bomPlant}` : 'OWN') },
      { header: 'Plan qty (FG)', dp: 3, get: (i) => num(shown[i].planQty, 3) },
      ...PLAN_SOURCES.flatMap((s): XCol[] => [
        { header: `${PLAN_SOURCE_LABEL[s]} / pc INR`, dp: 4, curr: 'INR', get: (i) => (hidden(s) ? null : num(shown[i].sources[s].perPc)) },
        { header: `${PLAN_SOURCE_LABEL[s]} priced`, get: (i) => (hidden(s) ? 'not loaded' : `${shown[i].sources[s].priced}/${shown[i].sources[s].leaves}`) },
      ]),
      { header: 'Selected incl. freight / pc INR', dp: 4, curr: 'INR', get: (i) => num(shown[i].selectedInclFrt) },
      { header: 'Lowest complete source', get: (i) => (shown[i].lowest ? PLAN_SOURCE_LABEL[shown[i].lowest!] : '') },
    ];
    const keys = new Set(shown.map((r) => r.key));
    const comp = lines.filter((l) => isLeafRow(l) && keys.has(`${l.Land1}|${l.Hwerks}|${l.Headmat}`));
    const compCols: XCol[] = [
      { header: 'Country', get: (i) => comp[i].Land1 },
      { header: 'Plant', get: (i) => comp[i].Hwerks },
      { header: 'FG', get: (i) => comp[i].Headmat },
      { header: 'Alt BOM', get: (i) => comp[i].Stlal },
      { header: 'Component', get: (i) => comp[i].Idnrk },
      { header: 'Description', width: 30, get: (i) => comp[i].Maktx },
      { header: 'Item alt BOM', get: (i) => comp[i].ItemStlal },
      { header: 'Unit', get: (i) => comp[i].Meins },
      { header: 'Total qty', dp: 3, get: (i) => Number(comp[i].QtyTot) },
      ...PLAN_SOURCES.map((s): XCol => ({ header: `${PLAN_SOURCE_LABEL[s]} rate INR`, dp: 4, curr: 'INR', get: (i) => (hidden(s) ? null : num(componentRate(comp[i], s))) })),
      { header: 'Selected source', get: (i) => comp[i].SelSource || 'NO RATE' },
    ];
    void exportTable({
      fmt: 'xlsx', name: 'FG per pc', cols: fgCols, count: shown.length,
      extraSheets: [{ name: 'Component rates', cols: compCols, count: comp.length }],
      extraParams: [
        ...planParams(query),
        ['Country', country || 'all'],
        ['Cost per FG piece', 'Sum over leaf components of rate x total qty / plan qty (material rate; freight only in "Selected incl. freight")'],
        ['As per Budget', 'SAP budget landed rate (BudLanded)' + (query.inclBudget ? `, budget year ${query.budgetYr}` : ' - budget not requested')],
        ['As per C-MAP / Consumption', optionsReady ? 'SAP rate options of source MBEW (C-MAP) / CONSUMP (component plant first)' : `not loaded: ${rates.note || rates.status}`],
        ['Priced', 'components with a rate on that source / leaf components (an unpriced component is not counted as 0)'],
      ],
    });
  };

  if (!rows.length) return <Card><Empty title="No plan materials in this run" /></Card>;
  return (
    <div className="flex flex-col gap-3">
      <Card
        title="Cost per FG piece - four rate bases"
        actions={<Button size="sm" onClick={doExport} title="Excel: FG per pc + component rates + parameters"><FileSpreadsheet size={14} /> Excel</Button>}
      >
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Country">
          <span className="mr-1 text-xs font-bold text-muted">Country</span>
          <button type="button" aria-pressed={!country} onClick={() => setCountry('')} className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold', !country ? 'border-accent bg-accent text-white' : 'border-line bg-panel')}>All</button>
          {countries.map((c) => (
            <button key={c.land1} type="button" aria-pressed={country === c.land1} onClick={() => setCountry(c.land1)} className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold', country === c.land1 ? 'border-accent bg-accent text-white' : 'border-line bg-panel')}>
              {c.land1} {c.landx && <span className="font-normal opacity-80">{c.landx}</span>} <span className="font-normal opacity-70">({c.rows.length})</span>
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
          <span className="inline-flex items-center gap-1"><Info size={12} /> Material rate per FG piece, INR. * = not every component has a rate on that source (hover for the count).</span>
          {!optionsReady && <span className="text-warn">C-MAP / Consumption: {rates.status === 'loading' || rates.status === 'idle' ? 'loading rate options…' : <>{rates.note || 'not available'} <button type="button" className="font-semibold text-accent underline" onClick={rates.retest}>Test again</button></>}</span>}
          {noBudget && <span className="text-warn">No budget rates in this run{query.inclBudget ? ` for ${query.budgetYr}` : ' (turn on Budget rates and run again)'}.</span>}
        </div>
        <PriceScope materials={shownCountries.flatMap((c) => c.rows.map((r) => r.headmat))}>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={thCls}>Plant</th><th className={thCls}>FG</th><th className={thCls}>Alt BOM</th><th className={thNum}>Plan qty</th>
                {PLAN_SOURCES.map((s) => <th key={s} className={thNum}><span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: PLAN_SOURCE_COLOR[s] }} />{PLAN_SOURCE_LABEL[s]}</th>)}
                <th className={thNum} title="Sum of leaf TotCostInr / plan qty">Selected incl. freight</th>
                <th className={thCls}>Lowest</th>
                <PriceHeads className={thNum} />
              </tr>
            </thead>
            <tbody>
              {shownCountries.map((c) => (
                <Fragment key={c.land1}>
                  <tr className="border-t border-line bg-sunken font-semibold"><td className={tdCls} colSpan={4 + PLAN_SOURCES.length + 2}>{c.land1} {c.landx} <span className="font-normal text-muted">· {c.rows.length} plan material{c.rows.length === 1 ? '' : 's'}</span></td></tr>
                  {c.rows.map((r) => (
                    <tr key={r.key} className="border-t border-line/50">
                      <td className={cx(tdCls, 'font-mono')}>{r.hwerks}</td>
                      <td className={cx(tdCls, 'max-w-[260px] truncate')} title={`${r.headmat} ${r.headtxt}`}><span className="font-mono font-semibold">{r.headmat}</span> <span className="text-muted">{r.headtxt}</span>{r.bomSrc === 'LASTPROD' && <span className="ml-1"><Pill tone="warn">BOM {r.bomPlant}</Pill></span>}</td>
                      <td className={tdCls}>{r.stlal || '—'}</td>
                      <td className={tdNum}>{fmtQty(r.planQty)}</td>
                      {PLAN_SOURCES.map((s) => {
                        const f = r.sources[s];
                        if (hidden(s)) return <td key={s} className={cx(tdNum, 'text-faint')}>…</td>;
                        return (
                          <td key={s} className={cx(tdNum, r.lowest === s && 'font-bold text-good', f.priced < f.leaves && 'text-warn')} title={`${f.priced} of ${f.leaves} components priced`}>
                            {f.perPc ? <>{fmtRate(f.perPc)}{f.priced < f.leaves ? '*' : ''}</> : '—'}
                          </td>
                        );
                      })}
                      <td className={tdNum}>{r.selectedInclFrt ? fmtRate(r.selectedInclFrt) : '—'}</td>
                      <td className={tdCls}>{r.lowest ? PLAN_SOURCE_LABEL[r.lowest].replace('As per ', '') : '—'}</td>
                      <PriceCells matnr={r.headmat} plant={r.hwerks} className={tdNum} costCurr="INR" />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        </PriceScope>
      </Card>
      <Card title="Per pc by source (INR per FG piece)">
        <div className="h-80">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ left: 8, right: 16, top: 8, bottom: 40 }}>
              <CartesianGrid stroke={t.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: t.axis, fontSize: 11 }} angle={-25} textAnchor="end" interval={0} height={50} />
              <YAxis tick={{ fill: t.axis, fontSize: 11 }} tickFormatter={(v: number) => fmtNum(String(v), 2)} />
              <Tooltip formatter={(v: unknown, k: unknown) => [`${fmtNum(String(v), 4)} INR / pc`, PLAN_SOURCE_LABEL[k as PlanSource] ?? String(k)]} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Legend formatter={(k: string) => PLAN_SOURCE_LABEL[k as PlanSource] ?? k} wrapperStyle={{ fontSize: 11 }} />
              {PLAN_SOURCES.filter((s) => !hidden(s)).map((s) => <Line key={s} type="linear" dataKey={s} stroke={PLAN_SOURCE_COLOR[s]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-2xs text-muted">One point per plan material (FG @ plant){country ? ` in ${country}` : ''}. A missing point = no rate on that source.</p>
      </Card>
    </div>
  );
}
