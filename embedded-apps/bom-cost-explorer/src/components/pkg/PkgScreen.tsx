'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { Button, Card, Empty, Modal, Spinner, Tabs, inputCls } from '../ui';
import PlanFrame from '../plan/PlanFrame';
import { ErrorBox, OkBox, errorText } from '../budget-mgmt/shared';
import AuditView from './AuditView';
import CompareView from './CompareView';
import ExceptionsView from './ExceptionsView';
import FinaliseDialog from './FinaliseDialog';
import GlobalEditBar from './GlobalEditBar';
import KpiCards from './KpiCards';
import NewScenarioDrawer from './NewScenarioDrawer';
import RatesGrid from './RatesGrid';
import ScenarioBar, { type BarAction } from './ScenarioBar';
import { useHubSession } from '@/lib/client/session';
import { fetchItems, fetchOverrides, fetchScenarios, postAction } from '@/lib/pkg/api';
import { exportRates } from '@/lib/pkg/export';
import { canEdit, fmtInt, groupItems, kpis, parseFlags, stripZeros } from '@/lib/pkg/rules';
import type { EditLevel, PkgActionBody, PkgItem, PkgOvr, PkgResult, PkgScen } from '@/lib/pkg/types';

type Tab = 'rates' | 'compare' | 'exceptions' | 'audit';
const TABS: { id: Tab; label: string }[] = [{ id: 'rates', label: 'Rates & simulation' }, { id: 'compare', label: 'Compare' }, { id: 'exceptions', label: 'Exceptions' }, { id: 'audit', label: 'Audit' }];
interface Banner { kind: 'ok' | 'err'; text: string }
interface Confirm { title: string; text: string; yes: string; run: () => void }

export default function PkgScreen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [scens, setScens] = useState<PkgScen[]>([]);
  const [scenId, setScenId] = useState('');
  const [items, setItems] = useState<PkgItem[]>([]);
  const [ovr, setOvr] = useState<PkgOvr[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('rates');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [pending, setPending] = useState('');
  const [search, setSearch] = useState('');
  const [exOnly, setExOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editKey, setEditKey] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerErr, setDrawerErr] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [copy, setCopy] = useState<{ descr: string; version: string } | null>(null);
  const [fin, setFin] = useState<{ open: boolean; result: PkgResult | null; error: string }>({ open: false, result: null, error: '' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const scen = useMemo(() => scens.find((s) => s.ScenId === scenId) ?? null, [scens, scenId]);
  const groups = useMemo(() => groupItems(items), [items]);
  const editable = !!scen && canEdit(scen.Status);

  const say = useCallback((b: Banner | null) => setBanner(b), []);
  useEffect(() => { if (banner?.kind !== 'ok') return; const t = setTimeout(() => setBanner(null), 6000); return () => clearTimeout(t); }, [banner]);

  const loadItems = useCallback(async (id: string) => {
    if (!id) { setItems([]); return; }
    setLoading(true);
    try { const r = await fetchItems(id); if (alive.current) setItems(r); } catch (e) { if (alive.current) { setItems([]); say({ kind: 'err', text: errorText(e) }); } }
    if (alive.current) setLoading(false);
  }, [say]);
  const loadOvr = useCallback(async (id: string) => {
    if (!id) { setOvr([]); return; }
    try { const r = await fetchOverrides(id); if (alive.current) setOvr(r); } catch (e) { if (alive.current) { setOvr([]); say({ kind: 'err', text: errorText(e) }); } }
  }, [say]);
  const loadScens = useCallback(async (pick?: string) => {
    try {
      const r = await fetchScenarios();
      if (!alive.current) return;
      setScens(r);
      const want = pick ?? new URLSearchParams(window.location.search).get('scen') ?? '';
      setScenId((cur) => { const id = [pick, cur, want].find((x) => x && r.some((s) => s.ScenId === x)) ?? r[0]?.ScenId ?? ''; return id; });
    } catch (e) { if (alive.current) { setScens([]); say({ kind: 'err', text: errorText(e) }); setLoading(false); } }
  }, [say]);

  useEffect(() => { void loadScens(); }, [loadScens]);
  useEffect(() => {
    setSelected(new Set()); setEditKey(null);
    if (scenId) { history.replaceState(null, '', `?scen=${scenId}`); void loadItems(scenId); } else setLoading(false);
  }, [scenId, loadItems]);
  useEffect(() => { if (tab === 'audit') void loadOvr(scenId); }, [tab, scenId, loadOvr]);

  /** One SAP action: spinner on its button, a banner with SAP's own message on failure, a refresh after. */
  async function run(key: string, body: PkgActionBody, ok: (r: PkgResult) => string, after?: (r: PkgResult) => Promise<void> | void) {
    setPending(key); say(null);
    try {
      const r = await postAction(body, email);
      await after?.(r);
      say({ kind: 'ok', text: ok(r) || 'Done' });
    } catch (e) { say({ kind: 'err', text: errorText(e) }); }
    if (alive.current) setPending('');
  }
  const refresh = async () => { await Promise.all([loadScens(scenId), loadItems(scenId), tab === 'audit' ? loadOvr(scenId) : Promise.resolve()]); };

  /** After every EDIT or REVERT SAP recalculates (RECALC), then everything is read again. */
  const editAndRecalc = (key: string, body: PkgActionBody, text: string) =>
    run(key, body, (r) => r.Msg || text, async () => { await postAction({ action: 'RECALC', scenId }, email); await refresh(); });

  const onCellEdit = (p: { level: EditLevel; value: string; scopeMatnr: string; scopeIdnrk?: string }) =>
    void editAndRecalc('EDIT', { action: 'EDIT', scenId, level: p.level, rule: 'S', value: p.value, scopeMatnr: p.scopeMatnr, ...(p.scopeIdnrk ? { scopeIdnrk: p.scopeIdnrk } : {}) }, 'Value saved and scenario recalculated');
  const onCellRevert = (p: { level: EditLevel; scopeMatnr: string; scopeIdnrk?: string }) =>
    void editAndRecalc('REVERT', { action: 'REVERT', scenId, ...p }, 'Reverted to the SAP value');

  function onBar(a: BarAction) {
    if (!scen) return;
    const id = scen.ScenId;
    if (a === 'RECALC') void run(a, { action: a, scenId: id }, (r) => r.Msg || 'Scenario recalculated', refresh);
    else if (a === 'SUBMIT') void run(a, { action: a, scenId: id }, (r) => r.Msg || 'Scenario submitted', refresh);
    else if (a === 'COPY') setCopy({ descr: `${scen.Descr} (copy)`, version: '' });
    else if (a === 'FINALIZE') setFin({ open: true, result: null, error: '' });
    else if (a === 'REOPEN') setConfirm({ title: 'Reopen scenario', yes: 'Reopen', text: `Reopen #${stripZeros(id)}? It becomes editable again.`, run: () => void run(a, { action: a, scenId: id }, (r) => r.Msg || 'Scenario reopened', refresh) });
    else setConfirm({ title: 'Delete scenario', yes: 'Delete', text: `Delete #${stripZeros(id)} ${scen.Descr}? This cannot be undone.`, run: () => void run(a, { action: a, scenId: id }, (r) => r.Msg || 'Scenario deleted', async () => { setScenId(''); await loadScens(); }) });
  }

  async function create(b: PkgActionBody) {
    setPending('CREATE'); setDrawerErr('');
    try {
      const r = await postAction(b, email);
      const id = r.ScenId;
      if (id) { await postAction({ action: 'RECALC', scenId: id }, email).catch(() => undefined); }
      setDrawer(false); setTab('rates');
      await loadScens(id || undefined);
      if (id === scenId) await loadItems(id);
      say({ kind: 'ok', text: r.Msg || `Scenario ${stripZeros(id)} created and calculated` });
    } catch (e) { setDrawerErr(errorText(e)); }
    if (alive.current) setPending('');
  }

  async function finalise() {
    if (!scen) return;
    setPending('FINALIZE'); setFin((f) => ({ ...f, error: '' }));
    try {
      const r = await postAction({ action: 'FINALIZE', scenId: scen.ScenId }, email);
      setFin({ open: true, result: r, error: '' });
      await refresh();
      say({ kind: 'ok', text: r.Msg || 'Scenario finalised' });
    } catch (e) { setFin((f) => ({ ...f, error: errorText(e) })); }
    if (alive.current) setPending('');
  }

  // ---- the rows shown: search and "exceptions only" --------------------------------------------------------------------
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => (!exOnly || parseFlags(g.head.MsgFlags).length > 0) && (!q || [stripZeros(g.head.Matnr), g.head.Matnr, g.head.Maktx, g.head.Matkl].some((t) => t.toLowerCase().includes(q))));
  }, [groups, search, exOnly]);
  const matkls = useMemo(() => Array.from(new Set(groups.map((g) => g.head.Matkl).filter(Boolean))).sort(), [groups]);
  const toggle = (set: Set<string>, m: string, on?: boolean) => { const n = new Set(set); if (on ?? !n.has(m)) n.add(m); else n.delete(m); return n; };
  const selectedList = shown.filter((g) => selected.has(g.head.Matnr)).map((g) => g.head.Matnr);

  return (
    <PlanFrame active="pkg-budget">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3">
        <h2 className="text-lg font-extrabold">Packing material budget rate</h2>
        <ScenarioBar scens={scens} scen={scen} pending={pending} onSelect={setScenId} onNew={() => { setDrawerErr(''); setDrawer(true); }} onAction={onBar} onOpenBase={(id) => scens.some((s) => s.ScenId === id) && setScenId(id)} />
        {banner && (
          <div className="flex items-start gap-2">
            <div className="flex-1">{banner.kind === 'ok' ? <OkBox>{banner.text}</OkBox> : <ErrorBox>{banner.text}</ErrorBox>}</div>
            <button type="button" aria-label="Dismiss message" className="rounded p-1 text-muted hover:bg-sunken" onClick={() => say(null)}><X size={14} /></button>
          </div>
        )}
        {!scen ? (
          loading ? <div className="grid place-items-center py-16"><Spinner /></div> : <Card><Empty title="Select or create a scenario">Pick a scenario above, or choose New to create one.</Empty></Card>
        ) : (
          <>
            <KpiCards k={kpis(groups)} />
            <Tabs label="Packing budget rate" tabs={TABS} value={tab} onChange={setTab} />
            {tab === 'rates' && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-faint" />
                    <input aria-label="Search materials" className={`${inputCls} w-64 pl-8`} placeholder="Material, description or group" value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={exOnly} onChange={(e) => setExOnly(e.target.checked)} /> Exceptions only</label>
                  <span className="text-xs text-muted">{fmtInt(shown.length)} of {fmtInt(groups.length)} materials | {fmtInt(selectedList.length)} selected</span>
                  <Button size="sm" className="ml-auto" disabled={!groups.length} onClick={() => void exportRates(scen, shown)}><Download size={14} /> Excel</Button>
                </div>
                <GlobalEditBar
                  editable={editable} busy={!!pending} pending={pending} matkls={matkls}
                  scope={{ visible: shown.map((g) => g.head.Matnr), filterActive: !!search.trim() || exOnly, selected: selectedList }}
                  onApply={(p) => void editAndRecalc('EDIT', { ...p, scenId }, 'Edit applied and scenario recalculated')}
                  onRevertSelected={() => void editAndRecalc('REVERT', { action: 'REVERT', scenId, scopeMatnr: selectedList.join(',') }, 'Selected rows reverted to SAP')}
                  onRevertScenario={() => setConfirm({ title: 'Revert scenario', yes: 'Revert scenario', text: 'Every override in this scenario goes back to the SAP value.', run: () => void editAndRecalc('REVERT', { action: 'REVERT', scenId }, 'Scenario reverted to SAP') })}
                />
                <RatesGrid
                  groups={shown} loading={loading} editKey={editKey} setEditKey={setEditKey}
                  cell={{ editable, busy: !!pending, onEdit: onCellEdit, onRevert: onCellRevert }}
                  expanded={expanded} onToggle={(m) => setExpanded((s) => toggle(s, m))} selected={selected}
                  onSelect={(m, on) => setSelected((s) => toggle(s, m, on))} onSelectAll={(on) => setSelected(on ? new Set(shown.map((g) => g.head.Matnr)) : new Set())}
                />
              </>
            )}
            {tab === 'compare' && <CompareView scen={scen} scens={scens} groups={groups} />}
            {tab === 'exceptions' && <ExceptionsView groups={groups} />}
            {tab === 'audit' && <AuditView rows={ovr} loading={!ovr.length && !!pending} />}
          </>
        )}
      </div>

      <NewScenarioDrawer open={drawer} busy={pending === 'CREATE'} error={drawerErr} onClose={() => setDrawer(false)} onCreate={(b) => void create(b)} />
      <FinaliseDialog open={fin.open} scen={scen} groups={groups} busy={pending === 'FINALIZE'} result={fin.result} error={fin.error} onClose={() => setFin({ open: false, result: null, error: '' })} onConfirm={() => void finalise()} />
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''} footer={<><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={() => { const c = confirm; setConfirm(null); c?.run(); }}>{confirm?.yes}</Button></>}>
        <p className="text-sm">{confirm?.text}</p>
      </Modal>
      <Modal open={!!copy} onClose={() => setCopy(null)} title="Copy to a new version"
        footer={<><Button onClick={() => setCopy(null)}>Cancel</Button><Button variant="primary" disabled={!copy?.descr.trim() || !!(copy?.version.trim() && !/^[1-9]\d{0,2}$/.test(copy.version.trim()))} onClick={() => {
          const c = copy; setCopy(null);
          if (c && scen) void run('COPY', { action: 'COPY', scenId: scen.ScenId, descr: c.descr.trim(), ...(c.version.trim() ? { budgetVersion: Number(c.version) } : {}) }, (r) => r.Msg || 'Copied to a new version', async (r) => { await loadScens(r.ScenId || undefined); });
        }}>Copy</Button></>}>
        {copy && (
          <div className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1 font-semibold">Description<input className={inputCls} value={copy.descr} onChange={(e) => setCopy({ ...copy, descr: e.target.value })} /></label>
            <label className="flex flex-col gap-1 font-semibold">Budget version <span className="font-normal text-muted">(blank = next free)</span><input className={inputCls} inputMode="numeric" value={copy.version} onChange={(e) => setCopy({ ...copy, version: e.target.value })} /></label>
          </div>
        )}
      </Modal>
    </PlanFrame>
  );
}
