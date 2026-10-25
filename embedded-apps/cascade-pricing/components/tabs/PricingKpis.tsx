'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, TabPanelHeader, Toolbar, type TabProps } from '../ui';
import { getCascade, parseDataArray, runAction } from '@/lib/api';
import { exportFileName } from '@/lib/export';
import { fmt2, fmtDate, fmtPct } from '@/lib/format';
import { GUARDRAILS, computeKpis } from '@/lib/kpis';
import { SECTIONS, STATUS_LABEL, STEP_MEANING, kpiItems, kpiReportSheets, kpiReportWorkbook, waterfallSentence, waterfallWithRest, type KpiItem, type KpiStatus, type SectionId } from '@/lib/kpiReport';
import type { Row } from '@/lib/types';

const ymdToday = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const STEP_COLOR: Record<string, string> = {
  'Retailer margin': 'from-sky-400 to-sky-500', 'Distributor margin': 'from-indigo-400 to-violet-500', 'A&P (trade + CIF)': 'from-amber-400 to-orange-400',
  'Damage / expiry': 'from-rose-300 to-fuchsia-400', 'Duty, C&F, LC charge': 'from-slate-300 to-slate-400', 'Other / not explained': 'from-gray-200 to-gray-300', 'Net realisation': 'from-emerald-500 to-teal-400',
};
const short = (m: unknown) => String(m ?? '').replace(/^0+/, '');

const TONE: Record<KpiStatus, { bar: string; value: string; badge: string }> = {
  ok: { bar: 'from-emerald-500 to-teal-400', value: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  watch: { bar: 'from-amber-500 to-orange-400', value: 'text-amber-600', badge: 'bg-amber-50 text-amber-700 ring-amber-200' },
  bad: { bar: 'from-red-500 to-rose-400', value: 'text-red-600', badge: 'bg-red-50 text-red-700 ring-red-200' },
  info: { bar: 'from-plum via-violet-500 to-teal-400', value: 'text-sap-ink', badge: 'bg-violet-50 text-plum ring-violet-200' },
};

function Badge({ status, children }: { status: KpiStatus; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold leading-tight ring-1 ${TONE[status].badge}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{children}</span>;
}

/** One KPI: value, status against its target, what it means and how it is calculated - all visible, no hover needed. */
function KpiCard({ item }: { item: KpiItem }) {
  const t = TONE[item.status];
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-white/75 px-4 pb-3 pt-3.5 shadow-[0_8px_24px_-14px_rgba(36,30,61,0.4)] ring-1 ring-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/90">
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.bar}`} aria-hidden="true" />
      <div className="text-2xs font-bold uppercase tracking-wider text-plum/60">{item.label}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-display text-2xl font-bold tabular-nums ${t.value}`}>{item.value}</span>
        <Badge status={item.status}>{item.statusText}</Badge>
      </div>
      <div className="text-2xs text-sap-muted">{item.sub}</div>
      <p className="mt-2 text-xs leading-snug text-sap-ink">{item.meaning}</p>
      <div className="mt-auto space-y-0.5 border-t border-plum/10 pt-2 text-2xs leading-snug text-sap-muted">
        <p><span className="font-semibold text-plum/70">How:</span> {item.formula}</p>
        {item.target !== '—' && <p><span className="font-semibold text-plum/70">Target:</span> {item.target}</p>}
      </div>
    </div>
  );
}

function Section({ n, id, children }: { n: number; id: SectionId; children: ReactNode }) {
  return (
    <section aria-labelledby={`kpi-${id}`} className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-plum via-violet-500 to-teal-400 font-display text-xs font-bold text-white shadow-[0_6px_16px_-6px_rgba(139,92,246,0.7)]">{n}</span>
        <div>
          <h3 id={`kpi-${id}`} className="font-display text-[15px] font-bold text-sap-ink">{SECTIONS[id].title}</h3>
          <p className="text-xs text-sap-muted">{SECTIONS[id].hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white/75 shadow-[0_8px_30px_-16px_rgba(36,30,61,0.35)] ring-1 ring-white">
      <div className="border-b border-plum/10 bg-gradient-to-r from-violet-50/90 via-white/60 to-teal-50/70 px-4 py-2.5"><h4 className="font-display text-[13px] font-bold text-sap-ink">{title}</h4>{hint && <p className="text-2xs text-sap-muted">{hint}</p>}</div>
      <div className="scroll-glass overflow-x-auto p-4">{children}</div>
    </section>
  );
}

const th = 'whitespace-nowrap border-b border-plum/10 px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wider text-plum/60';
const td = 'whitespace-nowrap border-b border-plum/[0.06] px-2 py-1.5';
const tdWrap = 'border-b border-plum/[0.06] px-2 py-1.5';
const sub = (t: string) => <span className="block text-[9.5px] font-semibold normal-case tracking-normal text-sap-muted">{t}</span>;

/** Pricing KPIs: the report in three sections (pipeline, profitability, risks), each KPI explained, plus an Excel report. */
export default function PricingKpis({ active, busy, showMessage, system = '' }: TabProps) {
  const [data, setData] = useState<{ review: Row[]; pending: Row[]; history: Row[]; materials: Row[]; at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState('');
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // A set SAP cannot serve right now counts as empty here (its own tab shows the error).
      const safe = (p: Promise<Row[]>) => p.catch(() => [] as Row[]);
      const [review, pending, materials] = await Promise.all([safe(getCascade('ApprovalSet')), safe(getCascade('ConditionPendingSet')), safe(getCascade('CascadeMapSet'))]);
      const all = [...review, ...pending.filter((p) => !review.some((r) => r.MATNR === p.MATNR && r.KUNNR === p.KUNNR && r.ZVERSION === p.ZVERSION))];
      const history = all.length ? parseDataArray(await runAction('COMPARE', { ROWS: all }).catch(() => ({ processed: 0, failed: 0, message: '', data: '' }))) : [];
      setData({ review, pending, history, materials, at: new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) });
      loaded.current = true;
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Could not load the KPIs.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => { if (active && !loaded.current) void load(); }, [active, load]);
  // Fresh numbers each time the tab is opened again after other tabs changed data.
  useEffect(() => { if (active && loaded.current) void load(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const markets = useMemo(() => [...new Set((data?.review ?? []).map((r) => String(r.S_LAND1)))].sort(), [data]);
  const k = useMemo(() => {
    if (!data) return null;
    const f = (rs: Row[]) => (market ? rs.filter((r) => r.S_LAND1 === market) : rs);
    return computeKpis(f(data.review), f(data.pending), data.history, data.materials, ymdToday());
  }, [data, market]);
  const items = useMemo(() => (k ? kpiItems(k) : []), [k]);
  const steps = useMemo(() => (k ? waterfallWithRest(k.waterfall) : []), [k]);
  const currencies = useMemo(() => [...new Set((k?.byMarket ?? []).map((m) => m.currency))], [k]);
  const attention = items.filter((i) => i.status === 'bad' || i.status === 'watch');

  const download = async () => {
    if (!k || !data) return;
    try {
      await kpiReportWorkbook(kpiReportSheets(k, { system, market, loadedAt: data.at, points: k.points }, currencies), exportFileName(`Cascade_KPI_report${market ? `_${market}` : ''}`));
      showMessage('KPI report downloaded.', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Could not create the report.', 'error');
    }
  };

  return (
    <>
      <TabPanelHeader title="Pricing KPIs" hint="A report on the price points in Review / Approval: where they stand, where the consumer price goes, and what needs attention." />
      <Toolbar>
        <Button onClick={() => void load()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Selling country</span>
          <select value={market} onChange={(e) => setMarket(e.target.value)} className="field h-7" aria-label="Filter KPIs by selling country">
            <option value="">All markets</option>
            {markets.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {data && <span className="hidden text-2xs text-sap-muted md:inline">SAP {system || '—'} · loaded {data.at}</span>}
          <Button variant="primary" onClick={() => void download()} disabled={!k || !k.points || busy}>Download report (Excel)</Button>
        </div>
      </Toolbar>
      {!k ? (
        <p className="p-6 text-center text-sm text-sap-muted">{loading ? 'Working...' : 'No data yet. Use Refresh.'}</p>
      ) : !k.points ? (
        <p className="p-6 text-center text-sm text-sap-muted">No price points in Review / Approval for this selection, so there is nothing to report yet.</p>
      ) : (
        <div className="space-y-6 p-4">
          {/* the report at a glance */}
          <div className="rounded-2xl bg-gradient-to-r from-violet-50/90 via-white/70 to-teal-50/80 px-4 py-3 ring-1 ring-white">
            <p className="text-sm text-sap-ink">
              <span className="font-semibold">{k.points} price point(s)</span> for {k.skus} SKU(s) in {k.markets} market(s){market ? ` (${market} only)` : ''}, from SAP {system || '—'}.{' '}
              Net realisation averages <span className="font-semibold">{fmtPct(k.realisationPct)}</span> of the consumer price excl. VAT (target ≥ {GUARDRAILS.realisationMin}%).
            </p>
            <p className="mt-1 text-xs text-sap-muted">
              {attention.length ? <>Needs attention: {attention.map((i) => `${i.label.toLowerCase()} (${i.value})`).join(' · ')}.</> : 'Every KPI is on target.'}
            </p>
          </div>

          <Section n={1} id="pipeline">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{items.filter((i) => i.section === 'pipeline').map((i) => <KpiCard key={i.id} item={i} />)}</div>
          </Section>

          <Section n={2} id="profit">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">{items.filter((i) => i.section === 'profit').map((i) => <KpiCard key={i.id} item={i} />)}</div>
            <Panel title="Price waterfall: where the consumer price goes" hint="Average of the price points, each step as % of RRP excl. VAT. Read it left to right: from the consumer price down to what the company realises.">
              <p className="mb-3 text-sm text-sap-ink">{waterfallSentence(steps, currencies)}</p>
              <div className="flex h-10 w-full min-w-[520px] gap-0.5 overflow-hidden rounded-xl" role="img" aria-label={steps.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(', ')}>
                {steps.map((s) => <div key={s.label} className={`flex items-center justify-center bg-gradient-to-r ${STEP_COLOR[s.label] ?? 'from-gray-300 to-gray-400'} text-2xs font-semibold text-white`} style={{ width: `${Math.max(0, s.pct)}%` }} title={`${s.label}: ${fmtPct(s.pct)}`}>{s.pct >= 6 ? fmtPct(s.pct) : ''}</div>)}
              </div>
              <table className="mt-3 min-w-full text-xs">
                <thead><tr><th className={th}>Step</th><th className={`${th} text-right`}>% of RRP excl. VAT</th><th className={th}>What it is</th></tr></thead>
                <tbody>
                  {steps.map((s) => (
                    <tr key={s.label} className={s.kind === 'net' ? 'font-semibold' : ''}>
                      <td className={td}><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-r align-middle ${STEP_COLOR[s.label] ?? 'from-gray-300 to-gray-400'}`} aria-hidden="true" />{s.label}</td>
                      <td className={`${td} text-right tabular-nums`}>{fmtPct(s.pct)}</td>
                      <td className={`${tdWrap} text-sap-muted`}>{STEP_MEANING[s.label] ?? ''}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold"><td className={td}>Total</td><td className={`${td} text-right tabular-nums`}>{fmtPct(steps.reduce((a, s) => a + s.pct, 0))}</td><td className={td} /></tr>
                </tbody>
              </table>
            </Panel>
            <Panel title="By selling country" hint={`Sorted by net realisation. Red = below the ${GUARDRAILS.realisationMin}% realisation target.`}>
              <table className="min-w-full text-xs">
                <thead><tr>
                  <th className={th}>Country</th><th className={th}>Curr.</th><th className={`${th} text-right`}>Price points</th>
                  <th className={`${th} text-right`}>Net realisation{sub('% of RRP excl. VAT')}</th><th className={`${th} text-right`}>Channel margin{sub('% of RRP excl. VAT')}</th>
                  <th className={`${th} text-right`}>Landing cost{sub('% of CIF')}</th><th className={`${th} text-right`}>Net billing / pc{sub('billing currency')}</th><th className={th}>Status</th>
                </tr></thead>
                <tbody>{k.byMarket.map((m) => {
                  const low = m.realisationPct < GUARDRAILS.realisationMin;
                  return (
                    <tr key={m.country}><td className={`${td} font-semibold`}>{m.country}</td><td className={td}>{m.currency}</td><td className={`${td} text-right tabular-nums`}>{m.points}</td>
                      <td className={`${td} text-right font-semibold tabular-nums ${low ? 'text-red-600' : 'text-emerald-700'}`}>{fmtPct(m.realisationPct)}</td><td className={`${td} text-right tabular-nums`}>{fmtPct(m.channelPct)}</td>
                      <td className={`${td} text-right tabular-nums`}>{fmtPct(m.landingOnCifPct)}</td><td className={`${td} text-right tabular-nums`}>{fmt2(m.netBilling)}</td>
                      <td className={td}><Badge status={low ? 'bad' : 'ok'}>{low ? `Below ${GUARDRAILS.realisationMin}%` : STATUS_LABEL.ok}</Badge></td></tr>
                  );
                })}</tbody>
              </table>
            </Panel>
          </Section>

          <Section n={3} id="risk">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{items.filter((i) => i.section === 'risk').map((i) => <KpiCard key={i.id} item={i} />)}</div>
            <div className="grid gap-3 xl:grid-cols-2">
              <Panel title="Guardrail exceptions" hint="Each price point outside a guardrail, with its value and the allowed range.">
                {k.exceptions.length ? (
                  <table className="min-w-full text-xs">
                    <thead><tr><th className={th}>Market</th><th className={th}>Material</th><th className={th}>Version</th><th className={th}>What is out of range</th></tr></thead>
                    <tbody>{k.exceptions.slice(0, 15).map((x, i) => (
                      <tr key={i}><td className={`${td} align-top`}>{x.row.S_LAND1}</td><td className={`${td} align-top`}><span className="font-mono">{short(x.row.MATNR)}</span><span className="block max-w-[220px] truncate text-sap-muted">{x.row.MAKTX}</span></td><td className={`${td} align-top`}>{String(x.row.ZVERSION ?? '').trim() || '01'}</td>
                        <td className={tdWrap}><div className="flex flex-wrap gap-1">{x.reasons.map((r) => <Badge key={r} status="bad">{r}</Badge>)}</div></td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-xs text-emerald-700">All price points are within the guardrails.</p>}
                {k.exceptions.length > 15 && <p className="mt-1 text-2xs text-sap-muted">… and {k.exceptions.length - 15} more in the Excel report.</p>}
              </Panel>
              <Panel title="Price corridor by SKU" hint={`Latest net billing price of each SKU across markets. Above ${GUARDRAILS.corridorMax}% spread is flagged.`}>
                {k.corridor.length ? (
                  <table className="min-w-full text-xs">
                    <thead><tr><th className={th}>Material</th><th className={`${th} text-right`}>Markets</th><th className={`${th} text-right`}>Lowest</th><th className={`${th} text-right`}>Highest</th><th className={`${th} text-right`}>Spread{sub('(high − low) ÷ low')}</th></tr></thead>
                    <tbody>{k.corridor.slice(0, 12).map((c) => (
                      <tr key={c.matnr + c.currency}><td className={td}><span className="font-mono">{short(c.matnr)}</span> <span className="text-sap-muted">{c.maktx}</span></td><td className={`${td} text-right tabular-nums`}>{c.markets}</td>
                        <td className={`${td} text-right tabular-nums`}>{fmt2(c.min)} {c.currency} <span className="text-sap-muted">{c.minMarket}</span></td><td className={`${td} text-right tabular-nums`}>{fmt2(c.max)} {c.currency} <span className="text-sap-muted">{c.maxMarket}</span></td>
                        <td className={`${td} text-right`}><Badge status={c.spreadPct > GUARDRAILS.corridorMax ? 'watch' : 'ok'}>{fmtPct(c.spreadPct)}</Badge></td></tr>
                    ))}</tbody>
                  </table>
                ) : <p className="text-xs text-sap-muted">No SKU is priced in more than one market here, so there is no corridor to check.</p>}
              </Panel>
            </div>
            <Panel title="Largest changes vs previous version" hint="Net billing price and RRP against the previous version of the same price point (customer, material, market).">
              {k.changes.length ? (
                <table className="min-w-full text-xs">
                  <thead><tr><th className={th}>Market</th><th className={th}>Material</th><th className={th}>Version</th><th className={`${th} text-right`}>Net billing{sub('change %')}</th><th className={`${th} text-right`}>RRP incl. VAT{sub('change %')}</th><th className={th}>Valid from</th></tr></thead>
                  <tbody>{k.changes.slice(0, 12).map((c, i) => (
                    <tr key={i}><td className={td}>{c.row.S_LAND1}</td><td className={td}><span className="font-mono">{short(c.row.MATNR)}</span> <span className="text-sap-muted">{c.row.MAKTX}</span></td><td className={td}>{String(c.prev.ZVERSION ?? '').trim() || '01'} → {String(c.row.ZVERSION ?? '').trim() || '01'}</td>
                      <td className={`${td} text-right font-semibold tabular-nums ${c.billingPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{c.billingPct > 0 ? '+' : ''}{fmtPct(c.billingPct)}</td><td className={`${td} text-right tabular-nums`}>{c.rrpPct > 0 ? '+' : ''}{fmtPct(c.rrpPct)}</td><td className={td}>{fmtDate(String(c.row.VALIDFROM ?? ''))}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-xs text-sap-muted">These price points have no earlier version yet, so there is nothing to compare.</p>}
            </Panel>
          </Section>

          <details className="rounded-2xl bg-white/60 px-4 py-3 text-xs ring-1 ring-white">
            <summary className="cursor-pointer font-semibold text-plum">How to read this report</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sap-ink">
              <li><b>RRP</b> is the consumer price. Shares are % of <b>RRP excl. VAT</b>, the part the trade and the company split.</li>
              <li><b>PTT</b> is the price to trade (what the retailer pays). <b>DLC</b> is the distributor&apos;s landed cost. <b>CIF</b> is the billing price; it is converted to local currency with the rate implied by each row.</li>
              <li><b>Net realisation</b> = billing price after A&amp;P ÷ RRP excl. VAT: what the company keeps.</li>
              <li>Averages are simple (SAP gives no volumes). The Excel report has every KPI with its formula and target, and the full lists.</li>
              <li>Guardrails: retailer {GUARDRAILS.retailMin}-{GUARDRAILS.retailMax}% of RRP, distributor {GUARDRAILS.distMin}-{GUARDRAILS.distMax}% of PTT, realisation ≥ {GUARDRAILS.realisationMin}%, A&amp;P ≤ {GUARDRAILS.apMax}%, price corridor ≤ {GUARDRAILS.corridorMax}%.</li>
            </ul>
          </details>
        </div>
      )}
    </>
  );
}
