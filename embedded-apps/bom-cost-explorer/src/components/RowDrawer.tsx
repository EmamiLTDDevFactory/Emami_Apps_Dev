'use client';
import { useEffect, useState } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { selectedOptionIndex, type SimRow } from '@/lib/cost/simulate';
import { D } from '@/lib/cost/decimal';
import { minCover } from '@/lib/cost/analytics';
import { rowKey } from '@/lib/cost/tree';
import { fmtDate, fmtNum, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { Button, cx, Drawer, inputBase, inputCls, Pill, SimTag, SourceBadge } from './ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}
function KV({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-2xs text-faint">{k}</dt>
          <dd className="num truncate">{v || <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function RowDrawer({
  row, sim, onClose, override, onOverride,
}: {
  row: CostLine | null; sim: SimRow | null; onClose: () => void; override?: string; onOverride: (key: string, v: string | null) => void;
}) {
  const [ov, setOv] = useState(override ?? '');
  useEffect(() => setOv(override ?? ''), [override, row]);
  if (!row || !sim) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const r = row;
  const opts = r.RateOptions ?? [];
  const sel = selectedOptionIndex(r);
  const priced = opts.filter((o) => D(o.RatePcInr).gt(0));
  const best = priced.length ? priced.reduce((b, o) => (D(o.RatePcInr).lt(D(b.RatePcInr)) ? o : b)) : null;
  const bestIdx = best ? opts.indexOf(best) : -1;
  const saving = best && r.SelSource ? D(r.SelRatePcInr).minus(D(best.RatePcInr)).times(D(r.ProdQty)) : null;
  const key = rowKey(r);
  const cov = minCover(r);

  const optRows: [string, (i: number) => React.ReactNode][] = [
    ['Plant', (i) => <span className="font-mono">{opts[i].Plant}{r.Donor && opts[i].Plant === r.Donor && <Pill tone="warn">donor</Pill>}</span>],
    ['Condition', (i) => opts[i].Cond],
    ['Valid from', (i) => fmtDate(opts[i].ValidFrom)],
    ['Rate', (i) => `${fmtRate(opts[i].Rate, opts[i].Curr)} ${opts[i].Curr}`],
    ['UoM', (i) => opts[i].Uom],
    ['Rate / pc', (i) => `${fmtRate(opts[i].RatePc, opts[i].Curr)} ${opts[i].Curr}`],
    ['FX → local', (i) => fmtNum(opts[i].Fx, 5, 'X')],
    ['Rate / pc local', (i) => `${fmtRate(opts[i].RatePcLoc, opts[i].LocCurr)} ${opts[i].LocCurr}`],
    ['FX → INR', (i) => fmtNum(opts[i].FxInr, 5, 'X')],
    ['Rate / pc INR', (i) => <strong>{fmtRate(opts[i].RatePcInr)} INR</strong>],
    ['Cost INR (qty)', (i) => `${fmtNum(opts[i].CostInr, 2)} INR`],
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      width={860}
      title={
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{r.Idnrk}</span>
            <span className="text-sm">{r.Maktx}</span>
            <SourceBadge source={sim.source} sim={sim.repicked || sim.overridden} />
            {r.Donor && <Pill tone="warn" title="Rate taken from the donor plant">Donor plant {r.Donor}</Pill>}
            {sim.changed && <SimTag />}
          </div>
          <div className="mt-0.5 text-2xs text-muted">
            {r.Headmat} {r.Headtxt} · plant {r.Werks}{r.Hwerks !== r.Werks ? ` (BOM ${r.Hwerks})` : ''} · level {r.Level} · {r.Mtart} · {r.Matkl}
          </div>
        </div>
      }
    >
      <Section title="Quantity & cost (SAP)">
        <KV
          items={[
            ['Production qty', `${fmtQty(r.ProdQty)} ${r.Meins}`],
            ['Component qty / base', `${fmtQty(r.Menge)} per ${fmtQty(r.Bmeng)} ${r.Bmein}`],
            ['Qty source', r.Qtysrc + (r.Qtysrc === 'ACTUAL' ? ` (used ${fmtQty(r.Usedqty)})` : '')],
            ['Total / pc local', `${fmtRate(r.TotCostPcLoc, r.LocCurr)} ${r.LocCurr}`],
            ['Total local', `${fmtNum(r.TotCostLoc, 2, r.LocCurr)} ${r.LocCurr}`],
            ['Total INR', <strong key="t">{fmtNum(r.TotCostInr, 2)} INR</strong>],
          ]}
        />
        {sim.changed && (
          <div className="mt-2 rounded-md border border-sim/40 bg-sim/[0.06] px-3 py-2 text-sm">
            <SimTag /> rate/pc <span className="sim-val">{fmtRate(sim.ratePcInr)}</span> + freight/pc <span className="sim-val">{fmtRate(sim.frtPcInr)}</span> × qty {fmtQty(sim.qty)} = <strong className="sim-val">{fmtNum(sim.total, 2)} INR</strong>{' '}
            <span className={cx('text-xs', sim.total.gt(D(r.TotCostInr)) ? 'text-bad' : 'text-good')}>({fmtSigned(sim.total.minus(D(r.TotCostInr)))} vs SAP)</span>
          </div>
        )}
      </Section>

      <Section title={`Rate options (${opts.length})`}>
        {opts.length === 0 ? (
          <p className="text-sm text-muted">SAP found no rate option for this component{r.Donor ? '' : ' in this plant'}. {r.SelSource ? '' : 'The line is costed with freight only.'}</p>
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-panel p-1.5 text-left font-medium text-faint" />
                    {opts.map((o, i) => (
                      <th key={i} className={cx('min-w-[120px] border-b-2 p-1.5 text-left', i === sel ? 'border-accent bg-accent/[0.07]' : 'border-line', sim.optionIdx === i && 'bg-sim/[0.08]')}>
                        <SourceBadge source={o.Source} />
                        <div className="mt-1 flex gap-1">
                          {i === sel && <Pill tone="accent">SAP selected</Pill>}
                          {i === bestIdx && <Pill tone="good">cheapest</Pill>}
                          {sim.optionIdx === i && <Pill tone="sim">simulated</Pill>}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {optRows.map(([label, f]) => (
                    <tr key={label} className="border-b border-line/60">
                      <th scope="row" className="sticky left-0 whitespace-nowrap bg-panel p-1.5 text-left font-normal text-faint">{label}</th>
                      {opts.map((_, i) => <td key={i} className={cx('num whitespace-nowrap p-1.5', i === sel && 'bg-accent/[0.07]')}>{f(i)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {saving && (
              <p className="mt-2 text-sm">
                {saving.isZero() ? (
                  <span className="text-good">SAP's selection is already the cheapest option.</span>
                ) : (
                  <>
                    Choosing <strong>{best!.Source}</strong> ({best!.Plant}) instead would save{' '}
                    <strong className="text-good">{fmtNum(saving, 2)} INR</strong> on this line ({fmtRate(D(r.SelRatePcInr).minus(D(best!.RatePcInr)))} INR/pc).
                  </>
                )}
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Manual override (simulation)">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Rate / pc in INR
            <input className={cx(inputBase, 'h-8 w-44')} inputMode="decimal" value={ov} placeholder={fmtRate(r.SelRatePcInr)} onChange={(e) => setOv(e.target.value.replace(',', '.'))} />
          </label>
          <Button variant="primary" disabled={!/^\d+(\.\d+)?$/.test(ov)} onClick={() => onOverride(key, ov)}>Apply override</Button>
          {override !== undefined && <Button onClick={() => onOverride(key, null)}>Clear</Button>}
        </div>
        <p className="mt-1 text-2xs text-faint">Overrides are part of the current scenario, are marked "OVERRIDE" in the tree, and never change SAP data. Source % and FX shocks do not apply to an overridden rate.</p>
      </Section>

      <Section title="Freight">
        {r.FrtSrc ? (
          <KV
            items={[
              ['Source', <Pill key="s" tone={r.FrtSrc === 'ACTUAL' ? 'good' : 'neutral'}>{r.FrtSrc}</Pill>],
              ['Currency', r.FrtCurr],
              ['FX', fmtNum(r.FrtFx, 5, 'X')],
              ['Freight / pc local', `${fmtRate(r.FrtPcLoc, r.LocCurr)} ${r.LocCurr}`],
              ['Freight / pc INR', `${fmtRate(r.FrtPcInr)} INR`],
              ['Delivery as of', fmtDate(r.DelvAsof)],
              ['Actual delivered qty', fmtQty(r.TotActDelv)],
              ['Standard delivered qty', fmtQty(r.TotStdDelv)],
            ]}
          />
        ) : (
          <p className="text-sm text-muted">No freight on this line (freight excluded or none found).</p>
        )}
      </Section>

      {!D(r.BudLanded).isZero() && (
        <Section title={`Budget ${r.BudGjahr}`}>
          <KV
            items={[
              ['Budget source', r.BudSource],
              ['Source amount', `${fmtRate(r.BudSrcamt, r.BudSrccurr)} ${r.BudSrccurr}`],
              ['Exchange rate', fmtNum(r.BudExchrate, 5, 'X')],
              ['Budget landed / pc', `${fmtRate(r.BudLanded)} INR`],
              ['Actual landed / pc', `${fmtRate(r.TotCostPcInr)} INR`],
              ['Variance', <span key="v" className={D(r.TotCostPcInr).gt(D(r.BudLanded)) ? 'text-bad' : 'text-good'}>{fmtSigned(D(r.TotCostPcInr).minus(D(r.BudLanded)), 4)} INR/pc</span>],
            ]}
          />
        </Section>
      )}

      {[r.CovH1, r.CovH2, r.CovH3].some((v) => !D(v).isZero()) && (
        <Section title="Coverage">
          <KV
            items={[
              ['Stock', fmtQty(r.StockQty)],
              ['Safety stock', fmtQty(r.Eisbe)],
              ['Open PO', fmtQty(r.OpenpoQty)],
              ['Open PR', fmtQty(r.OpenprQty)],
              ['Total available', fmtQty(r.TotalAvail)],
              ['Lowest cover', cov === null ? 'unlimited' : `${cov} days`],
            ]}
          />
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-faint"><th className="text-left font-normal">Horizon</th><th className="text-right font-normal">Requirement</th><th className="text-right font-normal">Cover (days)</th></tr>
            </thead>
            <tbody>
              {([['H1', r.ReqH1, r.CovH1], ['H2', r.ReqH2, r.CovH2], ['H3', r.ReqH3, r.CovH3]] as const).map(([h, req, c]) => (
                <tr key={h} className="border-t border-line/60">
                  <td>{h}</td>
                  <td className="num text-right">{fmtQty(req)}</td>
                  <td className="num text-right">{Number(c) === 999 ? <span className="text-muted">unlimited</span> : c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </Drawer>
  );
}
