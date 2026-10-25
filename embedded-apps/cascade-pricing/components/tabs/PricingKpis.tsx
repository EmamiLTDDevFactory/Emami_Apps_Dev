'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, TabPanelHeader, Toolbar, type TabProps } from '../ui';
import { getCascade, parseDataArray, runAction } from '@/lib/api';
import { fmt2, fmtDate, fmtPct } from '@/lib/format';
import { GUARDRAILS, computeKpis } from '@/lib/kpis';
import type { Row } from '@/lib/types';

const ymdToday = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
const STEP_COLOR = ['bg-gradient-to-r from-sky-400 to-sky-500', 'bg-gradient-to-r from-indigo-400 to-violet-500', 'bg-gradient-to-r from-amber-400 to-orange-400', 'bg-gradient-to-r from-rose-300 to-fuchsia-400', 'bg-gradient-to-r from-slate-300 to-slate-400', 'bg-gradient-to-r from-emerald-500 to-teal-400'];
const short = (m: unknown) => String(m ?? '').replace(/^0+/, '');

function Card({ label, value, sub, tone, help }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad'; help: string }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-700' : 'text-sap-ink';
  const bar = tone === 'bad' ? 'from-red-500 to-rose-400' : tone === 'warn' ? 'from-amber-500 to-orange-400' : tone === 'good' ? 'from-emerald-500 to-teal-400' : 'from-plum via-violet-500 to-teal-400';
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white/70 px-4 py-3 shadow-[0_8px_24px_-14px_rgba(36,30,61,0.4)] ring-1 ring-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/85" title={help}>
      <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${bar}`} aria-hidden="true" />
      <div className="text-2xs font-bold uppercase tracking-wider text-plum/60">{label}</div>
      <div className={`mt-1 font-display text-xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-2xs text-sap-muted">{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white/75 shadow-[0_8px_30px_-16px_rgba(36,30,61,0.35)] ring-1 ring-white">
      <div className="border-b border-plum/10 bg-gradient-to-r from-violet-50/90 via-white/60 to-teal-50/70 px-4 py-2.5"><h3 className="font-display text-[13px] font-bold text-sap-ink">{title}</h3>{hint && <p className="text-2xs text-sap-muted">{hint}</p>}</div>
      <div className="scroll-glass overflow-x-auto p-4">{children}</div>
    </section>
  );
}

const th = 'whitespace-nowrap border-b border-plum/10 px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wider text-plum/60';
const td = 'whitespace-nowrap border-b border-plum/[0.06] px-2 py-1.5';

/** Pricing KPIs: price waterfall, realisation and margins by market, price corridor, guardrails and version changes. */
export default function PricingKpis({ active, busy, showMessage }: TabProps) {
  const [data, setData] = useState<{ review: Row[]; pending: Row[]; history: Row[]; materials: Row[] } | null>(null);
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
      setData({ review, pending, history, materials });
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

  return (
    <>
      <TabPanelHeader title="Pricing KPIs" hint="Standard cascade pricing measures on the price points in review. Shares are % of RRP excl. VAT; simple averages (no volumes)." />
      <Toolbar>
        <Button onClick={() => void load()} disabled={busy || loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
        <label className="flex items-center gap-1.5 text-xs text-sap-muted">
          <span className="font-semibold">Selling country</span>
          <select value={market} onChange={(e) => setMarket(e.target.value)} className="field h-7" aria-label="Filter KPIs by selling country">
            <option value="">All markets</option>
            {markets.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </Toolbar>
      {!k ? (
        <p className="p-6 text-center text-sm text-sap-muted">{loading ? 'Working...' : 'No data yet. Use Refresh.'}</p>
      ) : !k.points ? (
        <p className="p-6 text-center text-sm text-sap-muted">No price points in review for this selection.</p>
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Card label="Price points in review" value={String(k.points)} sub={`${k.skus} SKUs · ${k.markets} market(s)`} help="Rows in Review / Approval (all versions shown there)." />
            <Card label="Awaiting approval" value={String(k.red)} sub={`${k.green} approved in review`} tone={k.red ? 'warn' : 'good'} help="Red rows: pending or rejected." />
            <Card label="Condition pending" value={String(k.conditionPending)} sub="approved, no SAP condition yet" tone={k.conditionPending ? 'warn' : undefined} help="Rows in Condition Creation." />
            <Card label="Net realisation" value={fmtPct(k.realisationPct)} sub="billing price after A&P / RRP excl VAT" tone={k.realisationPct < GUARDRAILS.realisationMin ? 'bad' : 'good'} help="What the company bills net, as a share of the consumer price excl. VAT." />
            <Card label="Channel margin" value={fmtPct(k.channelPct)} sub={`retailer ${fmtPct(k.retailPct)} · distributor ${fmtPct(k.distOnPttPct)} of PTT`} help="Retailer + distributor margin as a share of RRP excl. VAT." />
            <Card label="A&P investment" value={fmtPct(k.apPct)} sub="trade A&P + A&P on CIF" tone={k.apPct > GUARDRAILS.apMax ? 'bad' : undefined} help="A&P on PTT plus A&P on the billing price, as a share of RRP excl. VAT." />
            <Card label="Landing cost on CIF" value={fmtPct(k.landingOnCifPct)} sub="duty + C&F + LC charge" help="Import duty, C&F and LC charge as a % of CIF." />
            <Card label="Net price / dozen" value={k.netPerDz.map((x) => `${fmt2(x.value)} ${x.currency}`).join(' · ') || '—'} sub="average billing after A&P x 12" help="Average net billing price per dozen." />
            <Card label="Change vs previous version" value={k.changes.length ? fmtPct(k.avgBillingChangePct) : '—'} sub={`${k.increases} up · ${k.decreases} down`} tone={k.avgBillingChangePct < 0 ? 'bad' : undefined} help="Average change in net billing price against the previous version of the same price point." />
            <Card label="Price corridor breaches" value={String(k.corridorBreaches)} sub={`SKUs with > ${GUARDRAILS.corridorMax}% spread across markets`} tone={k.corridorBreaches ? 'warn' : 'good'} help="Large differences in net billing price for the same SKU across markets invite parallel trade." />
            <Card label="Guardrail exceptions" value={String(k.exceptions.length)} sub="margins, realisation or A&P out of range" tone={k.exceptions.length ? 'warn' : 'good'} help={`Retailer ${GUARDRAILS.retailMin}-${GUARDRAILS.retailMax}%, distributor ${GUARDRAILS.distMin}-${GUARDRAILS.distMax}% of PTT, realisation >= ${GUARDRAILS.realisationMin}%, A&P <= ${GUARDRAILS.apMax}%.`} />
            <Card label="Cascade coverage" value={fmtPct(k.coveragePct)} sub={`${k.mapped} of ${k.materials} materials mapped · ${k.expiringSoon} expiring in ${GUARDRAILS.expiryDays} days`} tone={k.coveragePct < 100 ? 'warn' : 'good'} help="Materials with a cascade description in Cascade Material Extraction; validity ending soon." />
          </div>

          <Panel title="Price waterfall (average, % of RRP excl. VAT)" hint="Where the consumer price goes: trade margins, A&P and damage, import landing cost, and what the company realises.">
            <div className="flex h-9 w-full min-w-[480px] gap-0.5 overflow-hidden rounded-xl" role="img" aria-label={k.waterfall.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(', ')}>
              {k.waterfall.map((s, i) => <div key={s.label} className={`${STEP_COLOR[i % STEP_COLOR.length]} flex items-center justify-center text-2xs font-semibold text-white`} style={{ width: `${Math.max(0, s.pct)}%` }}>{s.pct >= 6 ? fmtPct(s.pct) : ''}</div>)}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-3">
              {k.waterfall.map((s, i) => <li key={s.label} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${STEP_COLOR[i % STEP_COLOR.length]}`} aria-hidden="true" /><span className="flex-1">{s.label}</span><span className="tabular-nums font-semibold">{fmtPct(s.pct)}</span></li>)}
            </ul>
          </Panel>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="By selling country" hint="Sorted by net realisation.">
              <table className="min-w-full text-xs">
                <thead><tr><th className={th}>Country</th><th className={th}>Curr.</th><th className={`${th} text-right`}>Points</th><th className={`${th} text-right`}>Realisation</th><th className={`${th} text-right`}>Channel</th><th className={`${th} text-right`}>Landing / CIF</th><th className={`${th} text-right`}>Net / pc</th></tr></thead>
                <tbody>{k.byMarket.map((m) => (
                  <tr key={m.country}><td className={`${td} font-semibold`}>{m.country}</td><td className={td}>{m.currency}</td><td className={`${td} text-right tabular-nums`}>{m.points}</td>
                    <td className={`${td} text-right tabular-nums ${m.realisationPct < GUARDRAILS.realisationMin ? 'text-red-600' : ''}`}>{fmtPct(m.realisationPct)}</td><td className={`${td} text-right tabular-nums`}>{fmtPct(m.channelPct)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmtPct(m.landingOnCifPct)}</td><td className={`${td} text-right tabular-nums`}>{fmt2(m.netBilling)}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
            <Panel title="Price corridor by SKU" hint={`Spread of the latest net billing price across markets; above ${GUARDRAILS.corridorMax}% is flagged.`}>
              <table className="min-w-full text-xs">
                <thead><tr><th className={th}>Material</th><th className={`${th} text-right`}>Markets</th><th className={`${th} text-right`}>Lowest</th><th className={`${th} text-right`}>Highest</th><th className={`${th} text-right`}>Spread</th></tr></thead>
                <tbody>{k.corridor.slice(0, 12).map((c) => (
                  <tr key={c.matnr + c.currency}><td className={td}><span className="font-mono">{short(c.matnr)}</span> <span className="text-sap-muted">{c.maktx}</span></td><td className={`${td} text-right tabular-nums`}>{c.markets}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt2(c.min)} {c.currency} <span className="text-sap-muted">{c.minMarket}</span></td><td className={`${td} text-right tabular-nums`}>{fmt2(c.max)} {c.currency} <span className="text-sap-muted">{c.maxMarket}</span></td>
                    <td className={`${td} text-right font-semibold tabular-nums ${c.spreadPct > GUARDRAILS.corridorMax ? 'text-amber-700' : ''}`}>{fmtPct(c.spreadPct)}</td></tr>
                ))}</tbody>
              </table>
              {!k.corridor.length && <p className="text-xs text-sap-muted">No SKU is priced in more than one market here.</p>}
            </Panel>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Guardrail exceptions" hint="Price points whose margins, realisation or A&P fall outside the guardrails.">
              {k.exceptions.length ? (
                <table className="min-w-full text-xs">
                  <thead><tr><th className={th}>Market</th><th className={th}>Material</th><th className={th}>Version</th><th className={th}>Why</th></tr></thead>
                  <tbody>{k.exceptions.slice(0, 15).map((x, i) => (
                    <tr key={i}><td className={td}>{x.row.S_LAND1}</td><td className={td}><span className="font-mono">{short(x.row.MATNR)}</span> <span className="text-sap-muted">{x.row.MAKTX}</span></td><td className={td}>{x.row.ZVERSION}</td><td className={`${td} text-amber-800`}>{x.reasons.join('; ')}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-xs text-emerald-700">All price points are within the guardrails.</p>}
              {k.exceptions.length > 15 && <p className="mt-1 text-2xs text-sap-muted">… and {k.exceptions.length - 15} more.</p>}
            </Panel>
            <Panel title="Largest changes vs previous version" hint="Net billing price and RRP against the previous version of the same price point.">
              {k.changes.length ? (
                <table className="min-w-full text-xs">
                  <thead><tr><th className={th}>Market</th><th className={th}>Material</th><th className={th}>Version</th><th className={`${th} text-right`}>Net billing</th><th className={`${th} text-right`}>RRP incl VAT</th><th className={th}>Valid from</th></tr></thead>
                  <tbody>{k.changes.slice(0, 12).map((c, i) => (
                    <tr key={i}><td className={td}>{c.row.S_LAND1}</td><td className={td}><span className="font-mono">{short(c.row.MATNR)}</span> <span className="text-sap-muted">{c.row.MAKTX}</span></td><td className={td}>{c.prev.ZVERSION} → {c.row.ZVERSION}</td>
                      <td className={`${td} text-right tabular-nums ${c.billingPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{c.billingPct > 0 ? '+' : ''}{fmtPct(c.billingPct)}</td><td className={`${td} text-right tabular-nums`}>{c.rrpPct > 0 ? '+' : ''}{fmtPct(c.rrpPct)}</td><td className={td}>{fmtDate(String(c.row.VALIDFROM ?? ''))}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="text-xs text-sap-muted">No earlier versions to compare.</p>}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
