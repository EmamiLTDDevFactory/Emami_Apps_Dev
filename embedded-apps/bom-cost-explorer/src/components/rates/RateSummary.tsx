'use client';
/**
 * BOM costing > "Rate summary": every rate type side by side for the FGs (cost per piece) and their RM and PM
 * components (rate per unit), on one page, with an Excel download (lib/cost/rateSummary.ts). Contract / Info record
 * / Market / Consumption / MBEW / Cheapest need SAP's rate options (requested when the tab opens).
 */
import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, RefreshCw } from 'lucide-react';
import type { CostLine } from '@/lib/sap/fields';
import type { CostQuery } from '@/lib/query/schema';
import type { RatesState } from '@/lib/rates/useRateOptions';
import { NEEDS_OPTIONS, RATE_TYPES, RATE_TYPE_LABEL, rateSummary, type ComponentRow, type FgRow, type RateType } from '@/lib/cost/rateSummary';
import { CATEGORY_LABEL } from '@/lib/cost/categories';
import { exportTable, type XCol } from '@/lib/client/export';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';
import { Button, Card, cx, inputBase, sourceColorVar } from '../ui';
import { WITH_FREIGHT_LABEL, WITH_FREIGHT_SOURCES } from '@/lib/rates/withFreight';
import type { Decimal } from '@/lib/cost/decimal';

const th = 'sticky top-0 z-10 bg-panel px-2 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted shadow-[0_1px_0_rgb(var(--line))]';
const thN = `${th} text-right`;
const td = 'px-2 py-1.5 align-top';
const tdN = `${td} num text-right whitespace-nowrap`;
const n = (d: { toFixed: (x: number) => string } | null | undefined, dp = 4) => (d ? Number(d.toFixed(dp)) : null);
const Swatch = ({ t }: { t: RateType }) => (['SELECTED', 'BUDGET', 'CHEAPEST'].includes(t) ? null : <span className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: sourceColorVar(t) }} />);

export default function RateSummary({ rows, rates, query }: { rows: CostLine[]; rates: RatesState; query: CostQuery }) {
  const { request } = rates;
  useEffect(() => { request(); }, [request]);
  const optionsReady = rates.status === 'ready';
  const types = RATE_TYPES.filter((t) => optionsReady || !NEEDS_OPTIONS.includes(t));
  const s = useMemo(() => rateSummary(rows, query.explQty), [rows, query.explQty]);
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const match = (txt: string) => !t || txt.toLowerCase().includes(t);
  const fgs = s.fgs.filter((f) => match(`${f.headmat} ${f.headtxt} ${f.hwerks}`));
  const rm = s.rm.filter((c) => match(`${c.idnrk} ${c.maktx}`));
  const pm = s.pm.filter((c) => match(`${c.idnrk} ${c.maktx}`));

  const exportXlsx = () => {
    const fgCols: XCol[] = [
      { header: 'Country', get: (i) => s.fgs[i].land1 }, { header: 'Plant', get: (i) => s.fgs[i].hwerks }, { header: 'FG', get: (i) => s.fgs[i].headmat },
      { header: 'Description', width: 30, get: (i) => s.fgs[i].headtxt },
      ...RATE_TYPES.map((rt): XCol => ({ header: `${RATE_TYPE_LABEL[rt]} / pc INR`, dp: 4, curr: 'INR', get: (i) => n(s.fgs[i].perPc[rt].value) })),
      ...RATE_TYPES.map((rt): XCol => ({ header: `${RATE_TYPE_LABEL[rt]} priced`, get: (i) => `${s.fgs[i].perPc[rt].priced}/${s.fgs[i].leaves}` })),
      ...WITH_FREIGHT_SOURCES.flatMap((src): XCol[] => [
        { header: `${WITH_FREIGHT_LABEL[src]} / pc local`, dp: 4, get: (i) => n(s.fgs[i].withFrt[src].loc) },
        { header: `${WITH_FREIGHT_LABEL[src]} local curr`, get: (i) => s.fgs[i].withFrt[src].locCurr },
        { header: `${WITH_FREIGHT_LABEL[src]} / pc INR`, dp: 4, curr: 'INR', get: (i) => n(s.fgs[i].withFrt[src].inr.value) },
      ]),
      { header: 'Freight / pc INR', dp: 4, curr: 'INR', get: (i) => n(s.fgs[i].freightPc) },
      { header: 'Landed / pc INR (BOM total)', dp: 4, curr: 'INR', get: (i) => n(s.fgs[i].landedPc) },
      { header: 'Lowest complete type', get: (i) => (s.fgs[i].cheapestType ? RATE_TYPE_LABEL[s.fgs[i].cheapestType!] : '') },
    ];
    const compCols = (list: ComponentRow[]): XCol[] => [
      { header: 'Component plant', get: (i) => list[i].werks }, { header: 'Component', get: (i) => list[i].idnrk }, { header: 'Description', width: 30, get: (i) => list[i].maktx },
      { header: 'Category', get: (i) => CATEGORY_LABEL[list[i].cat] }, { header: 'Unit', get: (i) => list[i].meins }, { header: 'Used in FGs', get: (i) => list[i].fgs },
      { header: 'Qty', dp: 3, get: (i) => n(list[i].qty, 3) }, { header: 'Selected source', get: (i) => list[i].selectedSource },
      ...RATE_TYPES.map((rt): XCol => ({ header: `${RATE_TYPE_LABEL[rt]} INR / unit`, dp: 4, curr: 'INR', get: (i) => n(list[i].rates[rt]) })),
      ...WITH_FREIGHT_SOURCES.flatMap((src): XCol[] => [
        { header: `${WITH_FREIGHT_LABEL[src]} local / unit`, dp: 4, get: (i) => n(list[i].withFrt[src].loc) },
        { header: `${WITH_FREIGHT_LABEL[src]} local curr`, get: (i) => list[i].withFrt[src].locCurr },
        { header: `${WITH_FREIGHT_LABEL[src]} INR / unit`, dp: 4, curr: 'INR', get: (i) => n(list[i].withFrt[src].inr) },
        { header: `${src === 'CONTRACT' ? 'Contract' : 'Info record'} vendor`, width: 28, get: (i) => list[i].withFrt[src].vendor },
      ]),
      { header: 'Spread %', dp: 1, get: (i) => n(list[i].spreadPct, 1) }, { header: 'Lowest type', get: (i) => (list[i].lowestType ? RATE_TYPE_LABEL[list[i].lowestType!] : '') },
    ];
    void exportTable({
      fmt: 'xlsx', name: 'Rate summary', query, cols: fgCols, count: s.fgs.length,
      extraSheets: [{ name: 'RM rates', cols: compCols(s.rm), count: s.rm.length }, { name: 'PM rates', cols: compCols(s.pm), count: s.pm.length }, ...(s.other.length ? [{ name: 'Other rates', cols: compCols(s.other), count: s.other.length }] : [])],
      extraParams: [['FG cost per piece', 'Sum over leaf components of rate x qty / explosion qty (material only; freight and landed shown separately)'], ['Contract / Info record + freight', 'That source\'s rate plus the line\'s freight per unit (BOM tree freight), local and INR'], ['Rate options', optionsReady ? 'loaded' : `not loaded: ${rates.note || rates.status}`]],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input aria-label="Filter the rate summary" className={cx(inputBase, 'h-8 w-60 text-xs')} placeholder="Filter FG / component…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-muted">{s.fgs.length} FG · {s.rm.length} RM · {s.pm.length} PM · rates in INR</span>
        {!optionsReady && (
          <span className="text-muted">
            Contract, Info record, Market, Consumption, MBEW and Cheapest need SAP&apos;s rate options. {rates.status === 'loading' || rates.status === 'idle' ? 'Loading…' : <>{rates.note} <button type="button" className="inline-flex items-center gap-1 font-semibold text-accent underline" onClick={rates.retest}><RefreshCw size={11} /> Test again</button></>}
          </span>
        )}
        <Button size="sm" className="ml-auto" onClick={exportXlsx}><FileSpreadsheet size={14} /> Excel</Button>
      </div>

      <Card title={`FG cost per piece by rate type (${fgs.length})`} bodyClass="p-0">
        <div className="scroll-thin max-h-[45vh] overflow-auto">
          <table className="w-full text-xs">
            <thead><tr>
              <th className={th}>FG</th>
              {types.map((rt) => <th key={rt} className={thN}><Swatch t={rt} />{RATE_TYPE_LABEL[rt]}</th>)}
              {optionsReady && <FrtHeads />}
              <th className={thN}>Freight</th><th className={thN}>Landed (BOM)</th>
            </tr></thead>
            <tbody>{fgs.map((f) => <FgLine key={f.key} f={f} types={types} frt={optionsReady} />)}</tbody>
          </table>
          {!fgs.length && <p className="px-3 py-3 text-xs text-muted">No FG matches.</p>}
        </div>
      </Card>

      <ComponentCard title="RM rates (incl. perfume) · INR per unit" list={rm} types={types} frt={optionsReady} />
      <ComponentCard title="PM rates · INR per unit" list={pm} types={types} frt={optionsReady} />
      <p className="text-2xs text-muted">Bold = lowest of the row. FG figures are material cost per piece on each rate type; a grey figure is incomplete (some components have no rate of that type — hover for the count). Freight and landed are the BOM tree&apos;s values. Contract + freight and Info record + freight add the line&apos;s freight per unit to that source&apos;s rate, in local currency and INR.</p>
    </div>
  );
}

/** Contract + freight and Info record + freight, local then INR. */
function FrtHeads() {
  return <>{WITH_FREIGHT_SOURCES.flatMap((src) => [
    <th key={`${src}l`} className={thN} title="Rate + the line's freight per unit, local currency"><Swatch t={src} />{WITH_FREIGHT_LABEL[src]} (local)</th>,
    <th key={`${src}i`} className={thN} title="Rate + the line's freight per unit, INR"><Swatch t={src} />{WITH_FREIGHT_LABEL[src]} (INR)</th>,
  ])}</>;
}
const locCell = (v: Decimal | null, curr: string) => (v ? <>{fmtRate(v)} <span className="text-2xs text-faint">{curr}</span></> : '—');

function FgLine({ f, types, frt }: { f: FgRow; types: RateType[]; frt: boolean }) {
  const complete = types.filter((t) => f.perPc[t].value && f.perPc[t].priced === f.leaves);
  const low = complete.length ? complete.reduce((a, t) => (f.perPc[t].value!.lt(f.perPc[a].value!) ? t : a)) : null;
  return (
    <tr className="border-t border-line/60">
      <td className={td}><span className="font-mono font-semibold">{f.headmat}</span> <span className="text-muted">{f.headtxt}</span><div className="text-2xs text-faint">{f.land1} · {f.hwerks} · {f.leaves} components</div></td>
      {types.map((t) => {
        const x = f.perPc[t];
        const incomplete = x.value && x.priced < f.leaves;
        return <td key={t} className={cx(tdN, low === t && 'font-bold text-good', incomplete && 'text-faint')} title={`${x.priced} of ${f.leaves} components priced`}>{x.value ? fmtRate(x.value) : '—'}</td>;
      })}
      {frt && WITH_FREIGHT_SOURCES.flatMap((src) => {
        const w = f.withFrt[src];
        const part = w.inr.value && w.inr.priced < f.leaves;
        const tip = `${w.inr.priced} of ${f.leaves} components priced by ${src}`;
        return [
          <td key={`${src}l`} className={cx(tdN, part && 'text-faint')} title={tip}>{locCell(w.loc, w.locCurr)}</td>,
          <td key={`${src}i`} className={cx(tdN, part && 'text-faint')} title={tip}>{w.inr.value ? fmtRate(w.inr.value) : '—'}</td>,
        ];
      })}
      <td className={tdN}>{f.freightPc ? fmtRate(f.freightPc) : '—'}</td>
      <td className={cx(tdN, 'font-semibold')}>{f.landedPc ? fmtRate(f.landedPc) : '—'}</td>
    </tr>
  );
}

function ComponentCard({ title, list, types, frt }: { title: string; list: ComponentRow[]; types: RateType[]; frt: boolean }) {
  return (
    <Card title={`${title} (${list.length})`} bodyClass="p-0">
      <div className="scroll-thin max-h-[45vh] overflow-auto">
        <table className="w-full text-xs">
          <thead><tr>
            <th className={th}>Component</th><th className={thN}>FGs</th><th className={thN}>Qty</th>
            {types.map((rt) => <th key={rt} className={thN}><Swatch t={rt} />{RATE_TYPE_LABEL[rt]}</th>)}
            {frt && <FrtHeads />}
            <th className={thN} title="Highest vs lowest rate type, % of the lowest">Spread</th>
          </tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.key} className="border-t border-line/60">
                <td className={td}><span className="font-mono font-semibold">{c.idnrk}</span> <span className="text-muted">{c.maktx}</span><div className="text-2xs text-faint">{c.werks} · {CATEGORY_LABEL[c.cat]} · selected {c.selectedSource || 'no rate'}</div></td>
                <td className={tdN}>{c.fgs}</td>
                <td className={tdN}>{fmtQty(c.qty)} <span className="text-2xs text-faint">{c.meins}</span></td>
                {types.map((t) => (
                  <td key={t} className={cx(tdN, c.rates[t] && c.min && c.rates[t]!.eq(c.min) && t !== 'CHEAPEST' && 'font-bold text-good', t === 'SELECTED' && 'bg-accent/[0.05]')}>{c.rates[t] ? fmtRate(c.rates[t]) : '—'}</td>
                ))}
                {frt && WITH_FREIGHT_SOURCES.flatMap((src) => [
                  <td key={`${src}l`} className={tdN}>{locCell(c.withFrt[src].loc, c.withFrt[src].locCurr)}</td>,
                  <td key={`${src}i`} className={tdN}>{c.withFrt[src].inr ? fmtRate(c.withFrt[src].inr) : '—'}{c.withFrt[src].vendor && <div className="max-w-[180px] truncate text-2xs font-normal text-muted" title={c.withFrt[src].vendor}>{c.withFrt[src].vendor}</div>}</td>,
                ])}
                <td className={cx(tdN, c.spreadPct && c.spreadPct.gt(20) && 'font-semibold text-warn')}>{c.spreadPct ? `${fmtNum(c.spreadPct, 1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="px-3 py-3 text-xs text-muted">No component of this kind.</p>}
      </div>
    </Card>
  );
}
