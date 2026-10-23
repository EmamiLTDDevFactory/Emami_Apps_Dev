'use client';
/**
 * Daily cost watch (backend/costWatch.js): alert inbox, watch items (editor), alert detail, and the admin view.
 * Every morning at 06:00 IST the server costs each watch item in SAP, compares with yesterday / 7 days / 30 days,
 * raises alerts (rules R1-R9) and emails a digest. Planners and Admins edit; everyone with access can read.
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BellOff, Check, Pencil, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import { Button, Card, Drawer, Empty, Pill, Segmented, Stat, cx, inputBase, inputCls } from '../ui';
import { BASE_PATH } from '@/lib/client/session';
import { RATE_SOURCES, defaultQuery, type CostQuery } from '@/lib/query/schema';
import { encodeQuery } from '@/lib/query/url';
import { watchApi, type Alert, type WatchItem } from '@/lib/watch/api';
import { fmtNum, fmtRate } from '@/lib/format';

type Tab = 'alerts' | 'items' | 'admin';
const RULES: Record<string, string> = { R1: 'Cost per piece moved', R2: 'Component rate moved', R3: 'Rate source worse', R4: 'No / MBEW-only rate', R5: 'Freight jump', R6: 'FX moved', R7: 'BOM changed', R8: 'Low cover', R9: 'Plan check' };
const SEV_TONE = { high: 'bad', medium: 'warn', low: 'neutral' } as const;
const th = 'px-2 py-2 text-left text-2xs font-bold uppercase tracking-wide text-muted';
const td = 'px-2 py-1.5 align-top';
const inr = (v: string | number) => fmtNum(String(v ?? 0), 0, 'INR');
/** The same costing the watch ran (SKU, plant, quantity and settings) as an Explorer link. */
function costingLink(a: Alert & { settings?: WatchItem['settings']; qty?: string }): string {
  const st = a.settings;
  const q: CostQuery = { ...defaultQuery('B'), materials: [a.sku], plants: [a.plant], explQty: String(a.qty ?? '1'),
    ...(st ? { prio: st.prio as CostQuery['prio'], donorPlant: st.donor, lookback: st.lookback, freightDays: st.freightDays, stdFrt: st.stdFrt, inclFrt: st.inclFrt, inclCover: st.inclCover } : {}) };
  return encodeQuery(q);
}
const when = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('en-IN') : '—');

export default function WatchPage() {
  const [me, setMe] = useState<{ canEdit: boolean; isAdmin: boolean; enabled: boolean; scheduler: boolean; system: string } | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('alerts');
  const [openAlert, setOpenAlert] = useState<string | null>(null);
  const [rev, setRev] = useState(0); // bumps when the alert drawer closes so the inbox shows acknowledge / snooze
  useEffect(() => {
    watchApi.me().then(setMe).catch((e) => setErr(e.message));
    const a = new URLSearchParams(window.location.search).get('alert');
    if (a) setOpenAlert(a);
  }, []);
  return (
    <PlanFrame active="watch">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-extrabold">Daily cost watch</h1>
          <p className="text-xs text-muted">Every morning at 06:00 the watch items are costed in SAP{me ? ` ${me.system}` : ''}, compared with yesterday, the last 7 days and 30 days ago, and the changes above the thresholds are emailed as a digest.</p>
        </div>
        {me && !me.enabled && <Pill tone="warn">The 06:00 job is switched off on this server (WATCH_ENABLED)</Pill>}
      </div>
      {err && <div role="alert" className="flex items-center gap-2 rounded-xl border border-bad/40 bg-bad/[0.06] px-3 py-2 text-sm"><AlertTriangle size={15} className="text-bad" />{err}</div>}
      {me && (
        <>
          <div className="w-full max-w-md"><Segmented<Tab> size="sm" label="Cost watch views" value={tab} onChange={setTab} options={[{ value: 'alerts', label: 'Alerts' }, { value: 'items', label: 'Watch items' }, ...(me.isAdmin ? [{ value: 'admin' as Tab, label: 'Admin' }] : [])]} /></div>
          {tab === 'alerts' && <Alerts onOpen={setOpenAlert} rev={rev} />}
          {tab === 'items' && <Items canEdit={me.canEdit} canRun={me.canEdit || me.isAdmin} />}
          {tab === 'admin' && me.isAdmin && <Admin />}
        </>
      )}
      {openAlert && <AlertDetail id={openAlert} onClose={() => { setOpenAlert(null); setRev((r) => r + 1); const u = new URL(window.location.href); u.searchParams.delete('alert'); window.history.replaceState(null, '', u); }} />}
    </PlanFrame>
  );
}

/* ======================= alerts inbox ======================= */
function Alerts({ onOpen, rev }: { onOpen: (id: string) => void; rev: number }) {
  const [f, setF] = useState({ status: 'open', plant: '', rule: '', severity: '' });
  const [data, setData] = useState<{ loading: boolean; alerts: Alert[]; error: string }>({ loading: true, alerts: [], error: '' });
  const load = useCallback(() => {
    setData((d) => ({ ...d, loading: true }));
    watchApi.alerts(f).then((r) => setData({ loading: false, alerts: r.alerts, error: '' })).catch((e) => setData({ loading: false, alerts: [], error: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, rev]);
  useEffect(load, [load]);
  const act = async (fn: () => Promise<unknown>) => { await fn().catch(() => {}); load(); };
  const n = (s: string) => data.alerts.filter((a) => a.severity === s).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="High" value={n('high')} tone={n('high') ? 'bad' : undefined} sub="impact ≥ 50,000 INR" />
        <Stat label="Medium" value={n('medium')} tone={n('medium') ? 'warn' : undefined} sub="impact ≥ 5,000 INR" />
        <Stat label="Low" value={n('low')} sub="below 5,000 INR" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(['open', 'acknowledged', 'snoozed', 'closed', 'all'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setF({ ...f, status: s })} className={cx('rounded-full border px-2.5 py-0.5 font-semibold capitalize', f.status === s ? 'border-accent bg-accent text-white' : 'border-line text-muted')}>{s}</button>
        ))}
        <input aria-label="Plant" className={cx(inputBase, 'h-8 w-24 text-xs')} placeholder="Plant" value={f.plant} onChange={(e) => setF({ ...f, plant: e.target.value })} />
        <select aria-label="Rule" className={cx(inputBase, 'h-8 text-xs')} value={f.rule} onChange={(e) => setF({ ...f, rule: e.target.value })}>
          <option value="">All rules</option>{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{k} {v}</option>)}
        </select>
        <select aria-label="Severity" className={cx(inputBase, 'h-8 text-xs')} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}>
          <option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={load}><RefreshCw size={13} /> Refresh</Button>
      </div>
      <Card bodyClass="p-0">
        {data.error ? <p className="px-3 py-3 text-sm text-bad">{data.error}</p> : data.loading ? <p className="px-3 py-3 text-sm text-muted">Loading…</p> : !data.alerts.length ? (
          <Empty title="No alerts" icon="✓">Nothing above the thresholds for this filter.</Empty>
        ) : (
          <div className="scroll-thin max-h-[65vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-panel shadow-[0_1px_0_rgb(var(--line))]"><tr><th className={th}>Severity</th><th className={th}>Rule</th><th className={th}>SKU · plant · material</th><th className={`${th} text-right`}>Impact INR</th><th className={th}>Watch</th><th className={th}>Last seen</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody>
                {data.alerts.map((a) => (
                  <tr key={a.id} className="cursor-pointer border-t border-line/60 hover:bg-sunken" onClick={() => onOpen(a.id)}>
                    <td className={td}><Pill tone={SEV_TONE[a.severity]}>{a.severity}</Pill></td>
                    <td className={td}><b>{a.rule}</b> {RULES[a.rule]}<div className="text-2xs text-muted">{String(a.evidence?.text ?? '')}</div></td>
                    <td className={cx(td, 'font-mono')}>{a.sku} · {a.plant}{a.idnrk && <div className="font-sans text-muted">{a.idnrk} {String(a.evidence?.maktx ?? '')}</div>}</td>
                    <td className={cx(td, 'num text-right font-semibold')}>{inr(a.impact_inr)}</td>
                    <td className={td}>{a.watch_name}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{when(a.last_seen)}</td>
                    <td className={td}>{a.status}{a.snooze_until && a.status === 'snoozed' ? ` until ${new Date(a.snooze_until).toLocaleDateString('en-IN')}` : ''}</td>
                    <td className={cx(td, 'whitespace-nowrap')} onClick={(e) => e.stopPropagation()}>
                      {a.status !== 'closed' && a.status !== 'acknowledged' && <button type="button" title="Acknowledge" className="mr-2 text-accent" onClick={() => act(() => watchApi.ack(a.id))}><Check size={14} /></button>}
                      {a.status !== 'closed' && <button type="button" title="Snooze 7 days" className="text-muted" onClick={() => act(() => watchApi.snooze(a.id, 7))}><BellOff size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AlertDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof watchApi.alert>> | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { watchApi.alert(id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  useEffect(load, [load]);
  const a = d?.alert;
  const ev = (a?.evidence ?? {}) as Record<string, unknown>;
  const rows = (d?.after?.lines ?? []).map((l) => ({ l, b: d?.before?.lines.find((x) => x.idnrk === l.idnrk && x.meins === l.meins) }));
  return (
    <Drawer open onClose={onClose} width={820} title={a ? <span>{a.rule} {RULES[a.rule]} · <span className="font-mono">{a.sku}</span> · plant {a.plant}</span> : 'Alert'}>
      {err && <p className="text-sm text-bad">{err}</p>}
      {a && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><Pill tone={SEV_TONE[a.severity]}>{a.severity}</Pill><span className="text-muted">{String(ev.text ?? '')}</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Impact INR" value={inr(a.impact_inr)} sub={`change per piece x ${a.plan1 ? 'planned volume' : 'volume'} ${fmtNum(String(ev.volume ?? a.qty), 0, 'INR')}`} />
            <Stat label="Change / piece" value={fmtRate(String(ev.delta_per_pc ?? '0'))} sub="INR" />
            <Stat label="Before" value={ev.before !== undefined ? String(ev.before) : '—'} sub={d?.before ? when(d.before.ts) : 'no earlier run'} />
            <Stat label="After" value={ev.after !== undefined ? String(ev.after) : '—'} sub={d?.after ? when(d.after.ts) : ''} />
          </div>
          {(ev.median_7d || ev.month_start || ev.pct_day !== undefined) && <p className="text-xs text-muted">{ev.pct_day !== undefined && ev.pct_day !== null ? `vs yesterday ${Number(ev.pct_day).toFixed(2)}% · ` : ''}{ev.pct_30d !== undefined && ev.pct_30d !== null ? `vs 30 days ${Number(ev.pct_30d).toFixed(2)}% · ` : ''}{ev.median_7d ? `7-day median ${fmtRate(String(ev.median_7d))} · ` : ''}{ev.month_start ? `month start ${fmtRate(String(ev.month_start))}` : ''}</p>}
          <p className="text-2xs text-muted">First seen {when(a.first_seen)} · last seen {when(a.last_seen)} · status {a.status}{a.ack_by ? ` by ${a.ack_by}` : ''} · settings: priority {a.settings?.prio?.join(' > ') || 'default'}, look-back {a.settings?.lookback} days, donor {a.settings?.donor || 'none'}, freight {a.settings?.stdFrt ? 'standard' : 'actual'}</p>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-xs">
                <thead className="bg-sunken/60"><tr><th className={th}>Component</th><th className={`${th} text-right`}>Qty / pc</th><th className={th}>Source</th><th className={`${th} text-right`}>INR / unit</th><th className={`${th} text-right`}>Freight / unit</th><th className={`${th} text-right`}>FX</th></tr></thead>
                <tbody>
                  {rows.map(({ l, b }) => (
                    <tr key={`${l.idnrk}|${l.meins}`} className="border-t border-line/60">
                      <td className={td}><span className="font-mono font-semibold">{l.idnrk}</span> <span className="text-muted">{l.maktx}</span></td>
                      <td className={cx(td, 'num text-right')}>{b ? `${fmtNum(b.q, 4, 'X')} → ` : ''}{fmtNum(l.q, 4, 'X')} {l.meins}</td>
                      <td className={td}>{b && b.sel_source !== l.sel_source ? `${b.sel_source || 'none'} → ` : ''}{l.sel_source || 'none'}</td>
                      <td className={cx(td, 'num text-right')}>{b ? `${fmtRate(b.p_inr)} → ` : ''}{fmtRate(l.p_inr)}</td>
                      <td className={cx(td, 'num text-right')}>{b ? `${fmtRate(b.f_loc)} → ` : ''}{fmtRate(l.f_loc)}</td>
                      <td className={cx(td, 'num text-right')}>{b ? `${fmtNum(b.fx_inr, 4)} → ` : ''}{fmtNum(l.fx_inr, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {a.status !== 'closed' && a.status !== 'acknowledged' && <Button size="sm" variant="primary" onClick={async () => { await watchApi.ack(a.id); load(); }}><Check size={13} /> Acknowledge</Button>}
            {a.status !== 'closed' && <Button size="sm" onClick={async () => { await watchApi.snooze(a.id, 7); load(); }}><BellOff size={13} /> Snooze 7 days</Button>}
            {a.status !== 'closed' && <Button size="sm" onClick={async () => { await watchApi.snooze(a.id, 30); load(); }}><BellOff size={13} /> Snooze 30 days</Button>}
            <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-semibold hover:bg-sunken" href={`${BASE_PATH}/?q=${costingLink(a)}`}>Open the costing</a>
          </div>
          <p className="text-2xs text-muted">Use Explain change after opening the costing to see the quantity, rate, freight and FX effects.</p>
        </div>
      )}
    </Drawer>
  );
}

/* ======================= watch items ======================= */
const emptyItem = (): Partial<WatchItem> => ({ name: '', skus: [], plants: [], qty: '1000', recipients: [], plan1: '', active: true, settings: { prio: ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'], donor: '', lookback: 365, freightDays: 180, stdFrt: false, inclFrt: true, inclCover: false }, thresholds: {} });

function Items({ canEdit, canRun }: { canEdit: boolean; canRun: boolean }) {
  const [data, setData] = useState<{ loading: boolean; items: WatchItem[]; error: string }>({ loading: true, items: [], error: '' });
  const [edit, setEdit] = useState<Partial<WatchItem> | null>(null);
  const [note, setNote] = useState('');
  const load = useCallback(() => { watchApi.items().then((r) => setData({ loading: false, items: r.items, error: '' })).catch((e) => setData({ loading: false, items: [], error: e.message })); }, []);
  useEffect(load, [load]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {canEdit && <Button size="sm" variant="primary" onClick={() => setEdit(emptyItem())}><Plus size={14} /> New watch item</Button>}
        {!canEdit && <span className="text-xs text-muted">Read-only: BOM Simulator Planners or Admins can create and change watch items.</span>}
        {note && <span className="text-xs text-good">{note}</span>}
      </div>
      <Card bodyClass="p-0">
        {data.error ? <p className="px-3 py-3 text-sm text-bad">{data.error}</p> : data.loading ? <p className="px-3 py-3 text-sm text-muted">Loading…</p> : !data.items.length ? (
          <Empty title="No watch items yet" icon="👁">{canEdit ? 'Create one: pick the SKUs, plants, quantity and settings to watch every morning.' : 'A Planner or Admin creates them.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr><th className={th}>Name</th><th className={th}>SKUs</th><th className={th}>Plants</th><th className={th}>Qty</th><th className={th}>Settings</th><th className={th}>Recipients</th><th className={th}>Open alerts</th><th className={th}>Last run</th><th className={th} /></tr></thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className={cx('border-t border-line/60', !it.active && 'opacity-60')}>
                    <td className={td}><b>{it.name}</b>{!it.active && <span className="ml-1 text-2xs">(paused)</span>}<div className="text-2xs text-muted">{it.owner}{it.plan1 ? ` · plan ${it.plan1}` : ''}</div></td>
                    <td className={cx(td, 'font-mono')}>{it.skus.slice(0, 4).join(', ')}{it.skus.length > 4 ? ` +${it.skus.length - 4}` : ''}</td>
                    <td className={cx(td, 'font-mono')}>{it.plants.join(', ')}</td>
                    <td className={cx(td, 'num')}>{fmtNum(it.qty, 0, 'INR')}</td>
                    <td className={td}>{it.settings.prio.join('>') || 'default'} · {it.settings.lookback} d · {it.settings.stdFrt ? 'std' : 'actual'} freight{it.settings.donor ? ` · donor ${it.settings.donor}` : ''}</td>
                    <td className={td}>{it.recipients.join(', ')}</td>
                    <td className={cx(td, 'num')}>{it.open_alerts ?? 0}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>{when(it.last_run)}</td>
                    <td className={cx(td, 'whitespace-nowrap')}>
                      {canRun && <button type="button" title="Run now" className="mr-2 text-accent" onClick={async () => { try { const r = await watchApi.runNow(it.id); setNote(`${it.name}: ${r.runs} SAP run(s) started; see Alerts and Admin in a minute.`); } catch (e) { setNote((e as Error).message); } }}><Play size={14} /></button>}
                      {canEdit && <button type="button" title="Edit" className="mr-2 text-muted" onClick={() => setEdit(it)}><Pencil size={14} /></button>}
                      {canEdit && <button type="button" title="Delete" className="text-muted hover:text-bad" onClick={async () => { if (confirm(`Delete "${it.name}" and its alerts?`)) { await watchApi.remove(it.id); load(); } }}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {edit && <ItemEditor item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

const THRESHOLDS: { key: string; label: string; unit: string; def: number }[] = [
  { key: 'r1DayPct', label: 'R1 cost per piece vs yesterday', unit: '%', def: 2 }, { key: 'r1MonthPct', label: 'R1 vs 30 days', unit: '%', def: 5 },
  { key: 'r2Pct', label: 'R2 component rate', unit: '%', def: 10 }, { key: 'r2MinSharePct', label: 'R2 min. share of piece cost', unit: '%', def: 0.5 },
  { key: 'r4MinSharePct', label: 'R4 min. share (no / MBEW rate)', unit: '%', def: 1 }, { key: 'r5Pct', label: 'R5 freight per piece', unit: '%', def: 25 },
  { key: 'r6Pct', label: 'R6 FX factor', unit: '%', def: 1 }, { key: 'r7QtyPct', label: 'R7 quantity per piece', unit: '%', def: 5 },
  { key: 'r8LeadDays', label: 'R8 lead time', unit: 'days', def: 15 }, { key: 'highInr', label: 'High severity from', unit: 'INR', def: 50000 }, { key: 'mediumInr', label: 'Medium severity from', unit: 'INR', def: 5000 },
];

function ItemEditor({ item, onClose, onSaved }: { item: Partial<WatchItem>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(() => ({ ...emptyItem(), ...item, settings: { ...emptyItem().settings!, ...item.settings } }));
  const [list, setList] = useState({ skus: (item.skus ?? []).join(' '), plants: (item.plants ?? []).join(' '), recipients: (item.recipients ?? []).join(', ') });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const s = f.settings!;
  const setS = (p: Partial<typeof s>) => setF({ ...f, settings: { ...s, ...p } });
  async function save() {
    setBusy(true); setErr('');
    const body = { ...f, skus: list.skus.split(/[\s,;]+/).filter(Boolean), plants: list.plants.split(/[\s,;]+/).filter(Boolean), recipients: list.recipients.split(/[\s,;]+/).filter(Boolean) };
    try { if (item.id) await watchApi.update(item.id, body); else await watchApi.create(body); onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  const field = 'flex flex-col gap-1 text-xs font-semibold text-muted';
  return (
    <Drawer open onClose={onClose} width={720} title={item.id ? `Edit ${item.name}` : 'New watch item'}>
      <div className="flex flex-col gap-3 text-sm">
        <label className={field}>Name<input className={inputCls} value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Navratna oils - Kolkata" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={field}>SKUs (FG material numbers)<textarea className={cx(inputBase, 'min-h-[70px] py-2 font-mono text-xs')} value={list.skus} onChange={(e) => setList({ ...list, skus: e.target.value })} placeholder="FG1001 FG1002" /></label>
          <label className={field}>Plants<textarea className={cx(inputBase, 'min-h-[70px] py-2 font-mono text-xs')} value={list.plants} onChange={(e) => setList({ ...list, plants: e.target.value })} placeholder="1000 1100" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={field}>Quantity basis (pieces)<input type="number" className={inputCls} value={f.qty ?? '1000'} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label className={field}>Plan (optional, for planned volume and R9)<input className={inputCls} value={f.plan1 ?? ''} onChange={(e) => setF({ ...f, plan1: e.target.value })} placeholder="FY27-BASE" /></label>
          <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted">Costing settings</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {RATE_SOURCES.map((src) => {
              const on = s.prio.includes(src);
              return <button key={src} type="button" onClick={() => setS({ prio: on ? s.prio.filter((x) => x !== src) : [...s.prio, src] })} className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold', on ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted')}>{on ? `${s.prio.indexOf(src) + 1}. ` : ''}{src}</button>;
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={field}>Look-back days<input type="number" className={inputCls} value={s.lookback} onChange={(e) => setS({ lookback: Number(e.target.value) })} /></label>
            <label className={field}>Donor plant<input className={inputCls} value={s.donor} onChange={(e) => setS({ donor: e.target.value })} /></label>
            <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={s.stdFrt} onChange={(e) => setS({ stdFrt: e.target.checked })} /> Standard freight</label>
            <label className="flex items-end gap-2 pb-2 text-xs"><input type="checkbox" checked={s.inclCover} onChange={(e) => setS({ inclCover: e.target.checked })} /> Stock cover (R8)</label>
          </div>
        </div>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-2xs font-bold uppercase tracking-wide text-muted">Thresholds (defaults shown)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {THRESHOLDS.map((t) => (
              <label key={t.key} className="flex items-center justify-between gap-2 text-xs">{t.label}
                <span className="flex items-center gap-1"><input type="number" step="any" className={cx(inputBase, 'h-7 w-24 text-right text-xs')} placeholder={String(t.def)} value={f.thresholds?.[t.key] ?? ''} onChange={(e) => { const th = { ...(f.thresholds ?? {}) }; if (e.target.value === '') delete th[t.key]; else th[t.key] = Number(e.target.value); setF({ ...f, thresholds: th }); }} /><span className="w-8 text-muted">{t.unit}</span></span>
              </label>
            ))}
          </div>
        </details>
        <label className={field}>Digest recipients (emails; they need BOM Simulator access)<input className={inputCls} value={list.recipients} onChange={(e) => setList({ ...list, recipients: e.target.value })} placeholder="name@emamigroup.com, …" /></label>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex gap-2"><Button variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button><Button onClick={onClose}><X size={14} /> Cancel</Button></div>
      </div>
    </Drawer>
  );
}

/* ======================= admin ======================= */
function Admin() {
  const [d, setD] = useState<Awaited<ReturnType<typeof watchApi.admin>> | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { watchApi.admin().then(setD).catch((e) => setErr(e.message)); }, []);
  useEffect(load, [load]);
  if (err) return <p className="text-sm text-bad">{err}</p>;
  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  const failed = d.runs.filter((r) => r.status === 'failed').length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="06:00 job" value={d.enabled && d.scheduler ? 'On' : 'Off'} tone={d.enabled && d.scheduler ? undefined : 'warn'} sub={`SAP ${d.system}${d.running ? ' · running now' : ''}`} />
        <Stat label="Last morning run" value={d.lastRunDate ?? '—'} />
        <Stat label="Runs (latest 200)" value={d.runs.length} sub={`${failed} failed`} tone={failed ? 'bad' : undefined} />
        <Stat label="Digests (latest 200)" value={d.digests.length} sub={`${d.digests.filter((x) => x.status === 'failed').length} failed`} />
      </div>
      <Card title="Runs" bodyClass="p-0" actions={<Button size="sm" variant="ghost" onClick={load}><RefreshCw size={13} /> Refresh</Button>}>
        <div className="scroll-thin max-h-[45vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel"><tr><th className={th}>Time</th><th className={th}>Watch</th><th className={th}>SKU · plant</th><th className={th}>Status</th><th className={`${th} text-right`}>Total ms</th><th className={`${th} text-right`}>SAP ms</th><th className={`${th} text-right`}>Lines</th><th className={`${th} text-right`}>Alerts</th><th className={th}>Trigger / error</th></tr></thead>
            <tbody>
              {d.runs.map((r) => (
                <tr key={String(r.id)} className="border-t border-line/60">
                  <td className={cx(td, 'whitespace-nowrap')}>{when(String(r.ts))}</td><td className={td}>{String(r.watch_name ?? '')}</td><td className={cx(td, 'font-mono')}>{String(r.sku)} · {String(r.plant)}</td>
                  <td className={td}><Pill tone={r.status === 'ok' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'}>{String(r.status)}</Pill></td>
                  <td className={cx(td, 'num text-right')}>{String(r.ms)}</td><td className={cx(td, 'num text-right')}>{String(r.sap_ms)}</td><td className={cx(td, 'num text-right')}>{String(r.line_count)}</td><td className={cx(td, 'num text-right')}>{String(r.alerts)}</td>
                  <td className={td}>{String(r.trigger ?? '')}{r.error ? <div className="text-bad">{String(r.error)}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Digest log" bodyClass="p-0">
        <div className="scroll-thin max-h-[35vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel"><tr><th className={th}>Time</th><th className={th}>Watch</th><th className={th}>Recipient</th><th className={`${th} text-right`}>Alerts</th><th className={th}>Summary</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {d.digests.map((x) => (
                <tr key={String(x.id)} className="border-t border-line/60">
                  <td className={cx(td, 'whitespace-nowrap')}>{when(String(x.ts))}</td><td className={td}>{String(x.watch_name ?? '')}</td><td className={td}>{String(x.recipient)}</td><td className={cx(td, 'num text-right')}>{String(x.alert_count)}</td>
                  <td className={td}>{x.template_used ? 'template' : `AI (${String(x.model)})`}</td><td className={td}>{String(x.status)}{x.error ? <div className="text-bad">{String(x.error)}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
