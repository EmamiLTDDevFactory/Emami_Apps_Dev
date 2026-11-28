'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTms } from '../../lib/store';
import { dShort, downloadExport, newSession, type DpDataset, type DpSession } from '../../lib/dp';
import { liveApi, type PlanningHealth, type PlanningStatus } from '../../lib/liveApi';
import { Card, PageHead, Tabs } from '../ui';
import { Arrivals } from './Arrivals';
import { f0, small } from './common';
import { Diff } from './Diff';
import { Forecast } from './Forecast';
import { Sheet } from './Sheet';
import { Settings } from './Settings';
import { Lines, Summary, Trucks } from './Views';

const BASE = '/apps/smartruck-tms';
const TABS = ['Summary', 'Plan lines', 'Trucks', 'Raam Baan sheet', 'Arrivals', 'Settings', 'Forecast', 'Diff', 'Data'] as const;
type Tab = (typeof TABS)[number];
const SOURCES: [string, string][] = [['stock', 'Stock'], ['batches', 'Batches'], ['pendingsto', 'Pending STO'], ['openorders', 'Open orders'], ['sale', 'Sales'], ['transit', 'Transit'], ['material', 'Material master']];

/** Health may arrive as {key: {ok, rows, error}} or as a list; show the seven sources in a fixed order either way. */
function healthRows(h: unknown): { label: string; h?: PlanningHealth }[] {
  const entries: [string, PlanningHealth][] = Array.isArray(h) ? (h as PlanningHealth[]).map((x, i) => [String(x.name ?? i), x]) : Object.entries((h ?? {}) as Record<string, PlanningHealth>);
  const find = (k: string) => entries.find(([name]) => name.toLowerCase().replace(/[^a-z]/g, '').includes(k.replace(/[^a-z]/g, '')))?.[1];
  const known = SOURCES.map(([k, label]) => ({ label, h: find(k) }));
  const used = new Set(known.map((x) => x.h).filter(Boolean));
  return known.concat(entries.filter(([, v]) => !used.has(v)).map(([k, v]) => ({ label: k, h: v })));
}

export default function DpApp() {
  const t = useTms();
  const live = t.mode === 'live';
  const [tab, setTab] = useState<Tab>('Summary');
  const [, setTick] = useState(0);
  const [sess, setSess] = useState<DpSession | null>(null);
  const [status, setStatus] = useState<PlanningStatus | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [xmenu, setXmenu] = useState(false);
  const [xsrc, setXsrc] = useState('all');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const old = useRef<DpSession | null>(null);

  const bump = useCallback(() => { (globalThis as { __dpBump?: number }).__dpBump = ((globalThis as { __dpBump?: number }).__dpBump || 0) + 1; setTick((x) => x + 1); }, []);
  const canView = t.can('plan.view'), canRun = t.can('plan.run') || t.can('plan.admin'), canAdmin = t.can('plan.admin');

  /** A new dataset (SAP refresh, forecast tried locally): keep the settings, unit and division the planner chose. */
  const adopt = useCallback((D: DpDataset) => {
    const s = newSession(D), p = old.current;
    if (p) { s.ST.opt = p.ST.opt; s.ST.unit = p.ST.unit; s.ST.div = p.ST.div; }
    s.runPlan(); old.current = s; setSess(s); bump();
  }, [bump]);

  const loadDataset = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      if (live) {
        const st = await liveApi.planningStatus(); setStatus(st);
        if (!st.snapshot) { setSess(null); return; }
        adopt((await liveApi.planningDataset()) as DpDataset);
      } else {
        const r = await fetch(`${BASE}/dp-demo.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error('The demo sample could not be loaded.');
        adopt((await r.json()) as DpDataset);
      }
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [live, adopt]);

  useEffect(() => { if (!t.modeKnown || (live && !t.liveState.ready)) return; if (canView) void loadDataset(); }, [t.modeKnown, live, t.liveState.ready, canView]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const poll = useCallback(async () => {
    try {
      const st = await liveApi.planningStatus(); setStatus(st);
      if (st.job?.running) { timer.current = setTimeout(() => void poll(), 2000); return; }
      setRefreshing(false);
      if (st.job?.error) { t.toast('Refresh failed: ' + st.job.error, 'err'); return; }
      t.toast('SAP data refreshed'); await loadDataset();
    } catch (e) { setRefreshing(false); t.toast((e as Error).message, 'err'); }
  }, [loadDataset, t]);
  const refresh = async () => {
    setRefreshing(true);
    try { await liveApi.planningRefresh(); timer.current = setTimeout(() => void poll(), 1500); } catch (e) { setRefreshing(false); t.toast((e as Error).message, 'err'); }
  };
  const replan = () => { if (!sess) return; sess.runPlan(); bump(); t.toast('Plan rebuilt'); };

  const head = <PageHead title="Distribution Planning" sub="Raam Baan (unit → MWH → depot) and Pinaka (inter-depot), planned from live SAP stock, open orders and sales" />;
  if (!t.modeKnown || (live && !t.liveState.ready)) return <div>{head}<Card><p className="text-sm">Loading…</p></Card></div>;
  if (!canView) return <div>{head}<Card><p className="text-sm">You do not have access to Distribution Planning. Ask HO to give you the <b>Distribution Planner</b> role.</p></Card></div>;

  const noSnapshot = live && !loading && !sess && !err;
  const props = { s: sess as DpSession, bump, toast: t.toast };
  const snap = status?.snapshot;
  const sources = healthRows(snap?.health as never);
  const exportItems = sess ? [
    ['Stock transfer', 'All lines in the logistics format, with Trucks and Held sheets', () => sess.stockTransferExport()],
    ['Raam Baan · Leg 1 plan', 'DP.xlsx leg1 layout, one sheet per unit', () => sess.legExport(1)],
    ['Raam Baan · Leg 2 plan', 'DP.xlsx leg2 layout, one sheet per MWH', () => sess.legExport(2)],
    ['Pinaka plan (inter-depot)', 'Only inter-depot transfers, with a By lane sheet', () => sess.pinakaExport()],
  ] as [string, string, () => never][] : [];

  return (
    <div className="space-y-4">
      <PageHead title="Distribution Planning" sub="Raam Baan (unit → MWH → depot) and Pinaka (inter-depot), planned from live SAP stock, open orders and sales"
        right={live && canRun ? <button className="btn-primary" disabled={refreshing} onClick={() => void refresh()} data-testid="refresh-sap">{refreshing ? (status?.job?.step || 'Refreshing…') : 'Refresh from SAP'}</button> : undefined} />
      {err && <div className="card border-red p-3 text-sm text-red">{err}</div>}
      {loading && <div className="hint">Loading the planning dataset…</div>}
      {!live && <div className="card border-amber p-3 text-sm text-amber">Demo sample: {sess?.D.meta.note ?? 'a trimmed copy of the 27 Nov 2026 console data'}. Open with <code>?mode=live</code> on the DEV site for the SAP snapshot.</div>}
      {noSnapshot && <Card><p className="text-sm">There is no planning snapshot yet.{canRun ? ' Press “Refresh from SAP” to build the first one' : ''}{status && !status.config.seeded ? '. The configuration (depots, lanes, MWH split) also has to be seeded once: see the Data tab.' : '.'}</p></Card>}

      {sess && <>
        <div className="card flex flex-wrap items-center gap-2 p-2.5 text-xs font-bold text-inkSoft">
          <span className="rounded-full bg-rust/10 px-3 py-1 text-rust">Plan for {dShort(sess.D.meta.today)}</span>
          <label>Division <select className={small} value={sess.ST.div} onChange={(e) => { sess.ST.div = e.target.value; bump(); }}><option value="">CCD + HCD</option><option value="CCD">CCD</option><option value="HCD">HCD</option></select></label>
          <label>Qty in <select className={small} value={sess.ST.unit} onChange={(e) => { sess.ST.unit = e.target.value; bump(); }}><option value="cases">Cases</option><option value="pcs">Pieces</option></select></label>
          <button className="btn-primary !py-1.5 !text-xs" onClick={replan} data-testid="replan">Re-plan</button>
          <span className="text-amber">{sess.ST.dirty ? 'Inputs changed - press Re-plan' : ''}</span>
          <span className="flex-1" />
          <span className="font-normal">{snap ? `SAP snapshot ${new Date(snap.builtAt).toLocaleString('en-IN')} · ` : ''}{f0(sess.ST.P.lines.length)} lines · {f0(sess.ST.P.trucks.length)} trucks · {sess.ST.P.ms} ms</span>
          <span className="relative">
            <button className="btn-ghost !py-1.5 !text-xs" onClick={() => setXmenu((x) => !x)} data-testid="export-menu">Export Excel ▾</button>
            {xmenu && <div className="absolute right-0 z-30 mt-1 w-80 rounded-xl border border-border bg-white p-2 text-left shadow-pop">
              {exportItems.map(([n, d, fn]) => <button key={n} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-appBg" onClick={() => { setXmenu(false); const x = fn(); downloadExport(x as never); t.toast(`Exported ${n}`); }}><b className="block text-sm text-ink">{n}</b><span className="text-xs font-normal">{d}</span></button>)}
              <div className="border-t border-border p-2"><b className="block text-sm text-ink">Source-wise</b><div className="mt-1 flex gap-2"><select className={small + ' flex-1'} value={xsrc} onChange={(e) => setXsrc(e.target.value)}><option value="all">All sources (sheet per source)</option>
                {sess.sources().map((si: number) => <option key={si} value={si}>{sess.sName(si)}</option>)}<option value="idt">All inter-depot transfers</option></select>
                <button className="btn-primary !px-3 !py-1 !text-xs" onClick={() => { setXmenu(false); downloadExport(sess.sourceExport(xsrc) as never); }}>Download</button></div></div>
            </div>}
          </span>
        </div>
      </>}

      <Tabs tabs={sess ? TABS : (['Forecast', 'Data'] as unknown as readonly Tab[])} value={sess || tab === 'Forecast' || tab === 'Data' ? tab : 'Data'} onChange={setTab} counts={sess ? { 'Plan lines': sess.liveLines().length, Trucks: sess.ST.P.trucks.filter((x: { status: string }) => x.status !== 'held').length, Arrivals: sess.ST.arrived.size ? sess.ticked() : undefined } : undefined} />
      {sess && tab === 'Summary' && <Summary {...props} />}
      {sess && tab === 'Plan lines' && <Lines {...props} />}
      {sess && tab === 'Trucks' && <Trucks {...props} createIndent={(tr) => <button disabled title="Not wired yet: the Indents command needs a Trip Trail lane and a customer, and a planned depot transfer has neither (TODO: map plan lane → Trip Trail lane)" className="rounded-lg border border-border px-2 py-0.5 text-[11px] font-bold text-inkSoft opacity-50" onClick={(e) => e.stopPropagation()} data-truck={tr.no}>Create indent</button>} />}
      {sess && tab === 'Raam Baan sheet' && <Sheet {...props} />}
      {sess && tab === 'Arrivals' && <Arrivals {...props} replan={() => { replan(); }} />}
      {sess && tab === 'Settings' && <Settings {...props} />}
      {sess && tab === 'Diff' && <Diff {...props} />}
      {tab === 'Forecast' && (sess || !live) && sess && <Forecast D={sess.D as DpDataset} live={live} canRun={canRun} status={status} toast={t.toast} onLocal={adopt} onSaved={() => { void liveApi.planningStatus().then(setStatus); }} />}
      {tab === 'Forecast' && !sess && live && <Forecast D={{ meta: { today: '' }, mats: [], sites: [], fc: [], afc: [] } as unknown as DpDataset} live canRun={canRun} status={status} toast={t.toast} onLocal={adopt} onSaved={() => { void liveApi.planningStatus().then(setStatus); }} />}
      {(tab === 'Data' || !sess) && tab !== 'Forecast' && (
        <div className="space-y-4" data-testid="data-tab">
          <Card title="SAP snapshot">
            {live ? <>
              {snap ? <div className="text-sm">Built <b>{new Date(snap.builtAt).toLocaleString('en-IN')}</b> by {snap.by}{snap.ms ? ` in ${(snap.ms / 1000).toFixed(1)} s` : ''}. {status?.sapLive ? '' : <span className="text-amber">SAP is not connected on the server (simulated data).</span>}</div> : <div className="text-sm">No snapshot yet.</div>}
              {status?.job?.running && <div className="mt-2 text-sm text-rust">Refreshing: {status.job.step || 'working'}…</div>}
              {status?.job?.error && !status.job.running && <div className="mt-2 text-sm text-red">Last refresh failed: {status.job.error}</div>}
              <table className="mt-3 w-full border-collapse text-[13px]"><thead><tr>{['Source', 'Status', 'Rows', 'As of / error'].map((h) => <th key={h} className="border-b border-border px-2 py-1 text-left text-[11px] font-bold uppercase text-inkSoft">{h}</th>)}</tr></thead><tbody>
                {sources.map(({ label, h }) => <tr key={label}><td className="px-2 py-1.5 font-bold">{label}</td>
                  <td className="px-2 py-1.5">{h == null ? <span className="text-inkSoft">no data</span> : h.ok === false || h.error ? <span className="font-bold text-red">error</span> : <span className="font-bold text-green">ok</span>}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{h?.rows != null ? f0(h.rows) : ''}</td><td className="px-2 py-1.5 text-inkSoft">{h?.error || h?.asOf || ''}</td></tr>)}
              </tbody></table>
              {(snap?.warnings?.length ?? 0) > 0 && <div className="mt-3"><div className="text-xs font-bold uppercase text-inkSoft">Warnings</div><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-amber" data-testid="warnings">{snap!.warnings!.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
              {snap?.counts && <div className="mt-3 text-xs text-inkSoft">Dataset rows: {Object.entries(snap.counts).map(([k, v]) => `${k} ${f0(v)}`).join(' · ')}</div>}
            </> : <div className="text-sm">The demo sample has no SAP connection. {sess?.D.meta.note}</div>}
          </Card>
          {live && <Card title="Configuration (depots, lanes, MWH split, code folds)">
            <div className="text-sm">{status?.config.seeded ? <>Seeded{status.config.seededAt ? ' ' + new Date(status.config.seededAt).toLocaleString('en-IN') : ''}: <b>{f0(status.config.sites)}</b> sites, <b>{f0(status.config.lanes)}</b> lanes, <b>{f0(status.config.materials)}</b> material keys.</> : <span className="text-amber">Not seeded yet. Seed it once from Sanjoy&apos;s dp_data.json before the first refresh.</span>}</div>
            {canAdmin && <div className="mt-3 text-xs font-bold text-inkSoft">Seed config (admin) - choose his dp_data.json
              <input type="file" accept=".json,application/json" data-testid="seed-file" className="mt-1 block text-sm font-normal" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const r = await liveApi.planningSeed(JSON.parse(await f.text())); t.toast('Configuration seeded' + (r && (r as { sites?: number }).sites ? `: ${(r as { sites?: number }).sites} sites` : '')); setStatus(await liveApi.planningStatus()); } catch (er) { t.toast((er as Error).message, 'err'); } e.target.value = ''; }} /></div>}
          </Card>}
        </div>
      )}
    </div>
  );
}
