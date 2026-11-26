'use client';
import { useEffect, useState } from 'react';
import type { CostLine } from '@/lib/sap/fields';
import { selectedOptionIndex, type SimRow } from '@/lib/cost/simulate';
import { D } from '@/lib/cost/decimal';
import { minCover } from '@/lib/cost/analytics';
import { rowKey } from '@/lib/cost/tree';
import { fmtDate, fmtNum, fmtQty, fmtRate, fmtSigned } from '@/lib/format';
import { Button, cx, Drawer, inputBase, inputCls, Pill, SimTag, SourceBadge } from './ui';
import { FreightBreakupSection } from './freight/FreightValue';
import type { FreightRun } from '@/lib/freight/breakup';
import { hasFreightColumns, rateWithFreight, vendorOf, vendorText } from '@/lib/rates/withFreight';
import { type FreightTagged } from '@/lib/cost/freightIncluded';
import { componentFreightInr, componentFreightLoc } from '@/lib/cost/freightIncluded';
import { sourceLabel } from '@/lib/rates/sourceLabel';
import RigidIcons, { type RigidPanel } from './rigid/RigidIcons';
import DocButtons from './matdocs/DocButtons';
import CostBreakupDrawer from './rigid/CostBreakupDrawer';
import MouldDrawer from './rigid/MouldDrawer';

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
  row, sim, onClose, override, onOverride, rateOptions = true, rateOptionsState, freightRun,
}: {
  row: CostLine | null; sim: SimRow | null; onClose: () => void; override?: string; onOverride: (key: string, v: string | null) => void;
  /** false while the rate options are not loaded (or not available) for this run */
  rateOptions?: boolean;
  /** lazy rate-options state (BOM costing); omitted = the previous behaviour */
  rateOptionsState?: { status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'; note: string; onRetest: () => void };
  /** FreightDays / StdFrt of the run: adds the collapsed "Freight break-up" section (omitted = as before) */
  freightRun?: FreightRun | null;
}) {
  const [ov, setOv] = useState(override ?? '');
  useEffect(() => setOv(override ?? ''), [override, row]);
  const [panel, setPanel] = useState<RigidPanel>(null);
  useEffect(() => setPanel(null), [row?.Idnrk, row?.Hwerks]);
  if (!row || !sim) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const r = row;
  const opts = r.RateOptions ?? [];
  const sel = selectedOptionIndex(r);
  const priced = opts.filter((o) => D(o.RatePcInr).gt(0));
  /** Contract / Info record rows get "rate + freight" in local and INR (lib/rates/withFreight). */
  const withFrt = opts.some((o) => hasFreightColumns(o.Source));
  /** Vendor column only when SAP names at least one vendor for these options. */
  const withVendor = opts.some((o) => !!vendorText(vendorOf(o, r)));
  const best = priced.length ? priced.reduce((b, o) => (D(o.RatePcInr).lt(D(b.RatePcInr)) ? o : b)) : null;
  const bestIdx = best ? opts.indexOf(best) : -1;
  const saving = best && r.SelSource ? D(r.SelRatePcInr).minus(D(best.RatePcInr)).times(D(r.ProdQty)) : null;
  const key = rowKey(r);
  const cov = minCover(r);


  const rigidItem = { matnr: r.Idnrk, maktx: r.Maktx, werks: r.Werks || r.Hwerks };
  const rigidRate = { ratePc: r.SelSource ? D(r.SelRatePcInr) : null, sourceLabel: r.SelSource ? sourceLabel(r.SelSource) : '' };
  return (
    <>
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
            <RigidIcons matnr={r.Idnrk} active={panel} onOpen={setPanel} />
            <DocButtons matnr={r.Idnrk} />
          </div>
          <div className="mt-0.5 text-2xs text-muted">
            {r.Headmat} {r.Headtxt} · plant {r.Hwerks}{r.Werks && r.Werks !== r.Hwerks ? ` (component plant ${r.Werks})` : ''} · level {r.Level} · {r.Mtart} · {r.Matkl}
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

      {!rateOptions ? (
        <Section title="Rate options">
          {rateOptionsState && (rateOptionsState.status === 'idle' || rateOptionsState.status === 'loading') ? (
            <p className="text-sm text-muted">Loading rate options from SAP…</p>
          ) : (
            <div className="rounded-xl border border-line bg-sunken/60 px-3 py-2.5 text-sm text-ink" role="note">
              {rateOptionsState?.status === 'error'
                ? <>Rate options could not be loaded right now ({rateOptionsState.note}). </>
                : <>Rate options are not available from SAP for this system. SAP&apos;s selected rate is shown above{r.SrcCount > 1 ? ` (SAP reports ${r.SrcCount} sources for this component)` : ''}. </>}
              {rateOptionsState && <button type="button" onClick={rateOptionsState.onRetest} className="font-bold text-accent hover:underline">Re-test</button>}
            </div>
          )}
        </Section>
      ) : (
      <Section title={`Rate options (${opts.length})`}>
        {opts.length === 0 ? (
          <p className="text-sm text-muted">SAP found no rate option for this component{r.Donor ? '' : ' in this plant'}. {r.SelSource ? '' : 'The line is costed with freight only.'}</p>
        ) : (
          <>
            <div className="scroll-thin overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-sunken text-[11px] font-bold uppercase tracking-wide text-faint">
                  <tr>
                    <th className="px-2.5 py-2 text-left">Source</th>
                    {withVendor && <th className="px-2 py-2 text-left">Vendor</th>}
                    <th className="px-2 py-2 text-left">Cond</th>
                    <th className="px-2 py-2 text-left">Curr</th>
                    <th className="px-2 py-2 text-right">Rate / pc</th>
                    <th className="px-2 py-2 text-right">Rate / pc INR</th>
                    {withFrt && <th className="px-2 py-2 text-right" title="Contract and Info record: rate + this line's freight per piece">Rate + freight / pc local</th>}
                    {withFrt && <th className="px-2 py-2 text-right" title="Contract and Info record: rate + this line's freight per piece">Rate + freight / pc INR</th>}
                    <th className="px-2 py-2 text-left">Valid from</th>
                    <th className="px-2.5 py-2 text-left">Plant</th>
                  </tr>
                </thead>
                <tbody>
                  {opts.map((o, i) => (
                    <tr
                      key={i}
                      aria-current={i === sel ? 'true' : undefined}
                      className={cx('border-t border-line/70', i === sel && 'bg-accent/[0.08] font-semibold', sim.optionIdx === i && 'bg-sim/[0.08]')}
                    >
                      <td className={cx('px-2.5 py-1.5', i === sel && 'border-l-[3px] border-accent')}>
                        <div className="flex flex-wrap items-center gap-1">
                          <SourceBadge source={o.Source} />
                          {i === sel && <Pill tone="accent">selected</Pill>}
                          {i === bestIdx && <Pill tone="good">cheapest</Pill>}
                          {sim.optionIdx === i && <Pill tone="sim">simulated</Pill>}
                        </div>
                      </td>
                      {withVendor && <td className="max-w-[200px] truncate px-2 py-1.5" title={vendorText(vendorOf(o, r))}>{vendorText(vendorOf(o, r)) || '—'}</td>}
                      <td className="px-2 py-1.5 font-mono">{o.Cond}</td>
                      <td className="px-2 py-1.5">{o.Curr}</td>
                      <td className="num px-2 py-1.5 text-right">{fmtRate(o.RatePc, o.Curr)} <span className="text-faint">{o.Curr}</span></td>
                      <td className="num px-2 py-1.5 text-right">{fmtRate(o.RatePcInr)} <span className="text-faint">INR</span></td>
                      {withFrt && (() => { const w = rateWithFreight(o, r); return (<>
                        <td className="num px-2 py-1.5 text-right">{w?.loc ? <>{fmtRate(w.loc)} <span className="text-faint">{w.locCurr}</span></> : '—'}</td>
                        <td className="num px-2 py-1.5 text-right">{w ? <>{fmtRate(w.inr)} <span className="text-faint">INR</span></> : '—'}</td>
                      </>); })()}
                      <td className="px-2 py-1.5">{fmtDate(o.ValidFrom)}</td>
                      <td className="px-2.5 py-1.5 font-mono">
                        {o.Plant}
                        {r.Donor && o.Plant === r.Donor && <Pill tone="warn">donor</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {opts.length !== r.SrcCount && (
              <p className="mt-2 text-xs text-warn" role="note">SAP reports {r.SrcCount} rate source(s) for this line but returned {opts.length} option(s) - listed under Data quality.</p>
            )}
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
      )}

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
              ['Freight / pc local', `${fmtRate(String(componentFreightLoc(r)), r.LocCurr)} ${r.LocCurr}`],
              ['Freight / pc INR', `${fmtRate(String(componentFreightInr(r)))} INR`],
              ...((r as FreightTagged).FrtIncluded ? [['Added to the cost', `No - the ${sourceLabel(r.SelSource)} rate already includes freight`] as [string, string]] : []),
              ['Delivery as of', fmtDate(r.DelvAsof)],
              ['Actual delivered qty', fmtQty(r.TotActDelv)],
              ['Standard delivered qty', fmtQty(r.TotStdDelv)],
            ]}
          />
        ) : (
          <p className="text-sm text-muted">No freight on this line (freight excluded or none found).</p>
        )}
      </Section>

      <FreightBreakupSection key={rowKey(r)} line={r} run={freightRun} />

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
    {panel === 'cost' && <CostBreakupDrawer item={rigidItem} cockpit={rigidRate} onClose={() => setPanel(null)} />}
    {panel === 'mould' && <MouldDrawer item={rigidItem} cockpit={rigidRate} onApply={(v) => { onOverride(key, v); setPanel(null); }} onClose={() => setPanel(null)} />}
    </>
  );
}
