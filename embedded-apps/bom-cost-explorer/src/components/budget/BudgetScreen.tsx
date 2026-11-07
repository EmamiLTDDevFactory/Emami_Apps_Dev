'use client';
/**
 * Budget costing: the OData rebuild of the SAP report ZMM_FG_BOMEXPLR_COST (initiate mode). SAP does every costing step; this screen sends the selection,
 * shows the per-FG budget / projected / actual / last cost per piece, the split of one FG, the BOM checklist, and lets an initiator save the run as a new
 * version for approval. Nothing loads before Run (never from the URL), a request has no client time limit (Stop ends it), results stay for the same
 * selection until Refresh, and leaving the page aborts what is running.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, FileSpreadsheet, Pencil, Play, RefreshCw, Send, Square } from 'lucide-react';
import type { PlantsState } from '../FilterPanel';
import { Button, Card, Empty, Modal, Pill, Skeleton, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import WacMessages from '../wac/WacMessages';
import BudgetForm from './BudgetForm';
import BudgetTable from './BudgetTable';
import SplitDrawer from './SplitDrawer';
import BudgetAllSplits from './BudgetAllSplits';
import ColumnMenu, { loadChoice } from './ColumnMenu';
import { api } from '@/lib/client/api';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtMs, fmtNum } from '@/lib/format';
import { invalidate, stop } from '@/lib/wac/cache';
import { FilterError } from '@/lib/sap/filter';
import { buildBudgetFilter, defaultBudgetQuery, INITIATE_BLOCKED, selectionSummary, validateBudget, type BudgetQuery } from '@/lib/budget/filter';
import { runKey, startRun, useEntry } from '@/lib/budget/useBudget';
import { loadAllBasis, loadAllSplits, type Progress } from '@/lib/budget/loadAll';
import { peekRateBasis, rateBasisVersion, subscribeRateBasis } from '@/lib/budget/rateBasis';
import { initiateBudget } from '@/lib/budget/write';
import { canDisplayBudget, canInitiateBudget } from '@/lib/budget/roles';
import { ALL_COLS, DEFAULT_VISIBLE, GROUP_LABEL, colsByKeys, distinctRunIds, filterIssues, issuesOf, kpis, rowKey, searchRows, type FgRates } from '@/lib/budget/view';
import { downloadBudget, paramsOf, splitAllSheet, summarySheet, tieOutSheet } from '@/lib/budget/export';
import type { BudgetInitResult, BudgetSummaryRow } from '@/lib/budget/types';

const CTX = 'budget-run';
const COLS_STORE = 'bce:budget-cols';
const SEARCH_KEYS = ['Matnr', 'Maktx', 'Zskugrcodecrs', 'Zskugroupcrs', 'Zscheme', 'WipCode', 'WipDesc', 'Werks'];

/** The "Run and summary" tab of the Budget page (BudgetHub). It lives as long as the page, so a run survives tab switches. */
export default function BudgetScreen({ email, role, onRun, onOpenApprovals }: { email: string; role: string; /** the selection of the last run, for the BOM checklist tab */ onRun: (q: BudgetQuery) => void; onOpenApprovals?: () => void }) {
  const [form, setForm] = useState<BudgetQuery>(() => defaultBudgetQuery());
  const patch = useCallback((p: Partial<BudgetQuery>) => setForm((f) => ({ ...f, ...p })), []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // After a run the selection card folds into a one-line bar; Edit selection opens it again.
  const [editing, setEditing] = useState(true);
  const [runQ, setRunQ] = useState<BudgetQuery | null>(null);
  const [progress, setProgress] = useState('');
  // Every column of the summary can be shown or hidden; the choice is remembered in this browser.
  const [visible, setVisible] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE));
  useEffect(() => { const s = loadChoice(COLS_STORE, ALL_COLS.map((c) => c.key)); if (s) setVisible(s); }, []);
  const [view, setView] = useState<'summary' | 'splits'>('summary');
  const [rateProg, setRateProg] = useState<Progress | null>(null);
  const [rateNote, setRateNote] = useState('');
  const rateCtl = useRef<AbortController | null>(null);
  useEffect(() => () => rateCtl.current?.abort(), []);
  const rbVer = useSyncExternalStore(subscribeRateBasis, rateBasisVersion, () => 0);
  const [search, setSearch] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [open, setOpen] = useState<BudgetSummaryRow | null>(null);
  const [initOpen, setInitOpen] = useState(false);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const loadPlants = useCallback(() => {
    setPlantsLoading(true); setPlantsErr('');
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false));
  }, []);
  const allowed = canDisplayBudget(role);
  useEffect(() => { if (allowed) loadPlants(); }, [allowed, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);

  const key = runKey(runQ, email);
  const entry = useEntry<BudgetSummaryRow>(key);
  const formKey = safe(() => runKey(form, email));
  const stale = !!runQ && formKey !== key;
  const rows = useMemo(() => (entry?.status === 'done' ? entry.data ?? [] : []), [entry]);
  const k = useMemo(() => kpis(rows), [rows]);
  const shown = useMemo(() => searchRows(onlyIssues ? filterIssues(rows) : rows, search, SEARCH_KEYS), [rows, onlyIssues, search]);
  const cols = useMemo(() => colsByKeys(visible), [visible]);
  const colChoices = useMemo(() => ALL_COLS.map((c) => ({ key: c.key, label: c.label, group: c.group })), []);
  // Selected / C-Map per piece of an FG, once its rates are loaded (rbVer re-creates this when more arrive).
  const ratesOf = useCallback((r: BudgetSummaryRow): FgRates | undefined => { const b = peekRateBasis(r.Matnr, r.Werks); return b ? { selected: b.selected, cmap: b.cmap } : undefined; }, [rbVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRates = async () => {
    rateCtl.current?.abort();
    const c = new AbortController(); rateCtl.current = c;
    setRateNote(''); setRateProg({ done: 0, total: shown.length });
    setVisible((v) => { const n = new Set(v); n.add('_sel'); n.add('_cmap'); return n; });
    const failed = await loadAllBasis(shown, c.signal, setRateProg);
    setRateProg(null);
    if (!c.signal.aborted && failed) setRateNote(`${failed} FG${failed === 1 ? '' : 's'} could not be priced (shown as a dash).`);
  };
  const running = entry?.status === 'loading';
  const canInit = canInitiateBudget(role);

  const run = (force = false) => {
    const e = validateBudget(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    try { buildBudgetFilter(form, { werks: form.plants[0] }); } catch (x) { if (x instanceof FilterError) { setErrors({ _: x.message }); return; } throw x; }
    const snap = structuredClone(form);
    setRunQ(snap); onRun(snap); setEditing(false); setOpen(null);
    if (force) invalidate(CTX);
    setProgress('');
    void startRun(snap, CTX, email, force, (w, i, n) => setProgress(`Plant ${w} (${i + 1} of ${n})`));
  };

  // Excel: the summary plus the split of every FG shown (one SAP split call per FG, those already loaded come from memory), a header vs split sheet and,
  // where they were loaded, the Selected / C-Map rates.
  const [xl, setXl] = useState<Progress | null>(null);
  const xlStop = useRef(false);
  const exportXlsx = async () => {
    if (!runQ || xl) return;
    const q = runQ, list = shown.slice();
    xlStop.current = false;
    const items = await loadAllSplits(q, list, CTX, email, () => xlStop.current, setXl);
    setXl(null);
    if (xlStop.current) return;
    const missing = items.filter((x) => !x.split).length;
    const priced = list.filter((r) => peekRateBasis(r.Matnr, r.Werks)).length;
    const sheets = [summarySheet(shown, cols, ratesOf), splitAllSheet(items), tieOutSheet(items)];
    await downloadBudget(sheets, paramsOf(q, [['Rows', String(list.length)], ['SAP time (summary)', fmtMs(entry?.ms ?? 0)], ['Sheets', 'Summary = one line per FG (the columns on screen); Split = every component of every FG; Header vs split = group totals against the header'], ['FGs without a split', missing ? `${missing} (the split call failed; open the FG and Refresh)` : 'none'], ['Selected / C-Map rates', priced ? `${priced} of ${list.length} FGs (BOM costing of the FG and plant)` : 'not loaded']]));
  };

  if (!allowed) return null; // the hub only shows this tab to people who may see it; fail closed anyway
  const sum = runQ ? selectionSummary(runQ) : null;

  return (
    <>
      <Card title="Selection" actions={editing ? <span className="text-2xs text-faint">Same rules as the SAP selection screen: * = required</span> : undefined}>
        {sum && !editing && (
          <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line bg-sunken/40 px-3 py-2 text-sm" aria-label="Selection of the last run">
            <b>{sum.period}</b><span className="text-faint">·</span><span>plants {sum.plants}</span><span className="text-faint">·</span><span>{sum.source}</span><span className="text-faint">·</span><span>{sum.business}</span><span className="text-faint">·</span><span>{sum.options} option{sum.options === 1 ? '' : 's'} on</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEditing(true)} disabled={running}><Pencil size={13} /> Edit selection</Button>
          </p>
        )}
        {editing && <BudgetForm q={form} onChange={patch} errors={errors} plants={plantsState} canInitiate={canInit} />}
        {errors._ && <p className="mt-2 text-sm text-bad" role="alert">{errors._}</p>}
        <div className={cx('flex flex-wrap items-center gap-2', editing && 'mt-3')}>
          <Button variant="primary" onClick={() => run(false)} disabled={running}><Play size={14} /> Run in SAP</Button>
          {running && <Button variant="danger" onClick={() => stop(CTX)}><Square size={13} /> Stop</Button>}
          {running && <span className="flex items-center gap-2 text-sm text-muted"><Spinner /> {progress || 'Waiting for SAP…'}</span>}
          {!running && entry?.status === 'done' && <span className="text-xs text-muted">{rows.length} lines · {fmtMs(entry.ms)} in SAP</span>}
          {runQ && editing && <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={running}>Hide selection</Button>}
        </div>
      </Card>

      {runQ && (
        <>
          <WacMessages messages={entry?.messages ?? []} error={entry?.status === 'error' ? entry.error : null} />
          {entry?.status === 'cancelled' && <p className="text-sm text-muted">The run was stopped. Press Run in SAP to start again.</p>}
          {running && !rows.length && <Skeleton rows={8} />}
          {entry?.status === 'done' && (
            <>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Stat label="Finished goods" value={k.fgs} sub={`${k.rows} lines · ${k.plants} plant${k.plants === 1 ? '' : 's'}`} />
                <Stat label="Avg budget / pc" value={k.avgBudget ? fmtNum(k.avgBudget, 4, 'X') : 'n/a'} sub="lines with a budget cost" />
                <Stat label="Avg actual / pc" value={k.avgActual ? fmtNum(k.avgActual, 4, 'X') : 'n/a'} sub={`${k.withActual} lines have an actual`} />
                <Stat label="Actual off budget" value={k.high + k.warn} tone={k.high ? 'bad' : k.warn ? 'warn' : 'good'} sub={`${k.high} over 10 % · ${k.warn} over 5 %`} title="Actual vs budget material cost per piece" />
                <Stat label="Checklist issues" value={k.issues} tone={k.issues ? 'warn' : undefined} sub={form.checklist || rows.some((r) => issuesOf(r).length) ? 'BOM / production versions' : 'switch on Checklist flags'} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1" />
                {stale && <Pill tone="warn" title="The selection above is not the one that produced these rows">Selection changed: run again</Pill>}
                <Button size="sm" onClick={() => run(true)}><RefreshCw size={13} /> Refresh</Button>
                {rateProg ? <Button size="sm" variant="danger" onClick={() => rateCtl.current?.abort()}><Square size={13} /> Stop rates {rateProg.done} of {rateProg.total}</Button> : <Button size="sm" onClick={() => void loadRates()} disabled={!shown.length} title="Cost per piece at the Selected rate and at the C-Map (MBEW) rate for every FG shown, from the current BOM costing of the FG and plant: one costing and one rate call each."><RefreshCw size={13} /> Load Selected / C-Map</Button>}
                {xl ? <Button size="sm" variant="danger" onClick={() => { xlStop.current = true; }}><Square size={13} /> Stop export {xl.done} of {xl.total}</Button> : <Button size="sm" onClick={() => void exportXlsx()} title="Summary, the split of every FG shown and a header vs split check. Loads one split per FG from SAP."><FileSpreadsheet size={13} /> Excel with splits</Button>}
                <Button size="sm" variant="primary" disabled={!canInit || stale || !rows.length} title={!canInit ? 'You need the budget-init role' : stale ? 'Run again with the current selection first' : !runQ.exclDiv ? INITIATE_BLOCKED : 'Save this run as a new version for approval'} onClick={() => setInitOpen(true)}><Send size={13} /> Initiate</Button>
              </div>

              {(
                <>
                  <Tabs<'summary' | 'splits'> label="Summary view" value={view} onChange={setView} tabs={[{ id: 'summary', label: 'FG summary' }, { id: 'splits', label: 'All FG splits', badge: <Pill>{shown.length}</Pill> }]} />
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="Search the rows" placeholder="Search material, description, CRS, scheme, WIP…" className={cx(inputCls, 'max-w-sm')} value={search} onChange={(e) => setSearch(e.target.value)} />
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only lines with checklist issues</label>
                    <span className="ml-auto" />
                    {view === 'summary' && <ColumnMenu cols={colChoices} groups={GROUP_LABEL} visible={visible} onChange={setVisible} defaults={DEFAULT_VISIBLE} store={COLS_STORE} />}
                  </div>
                  {rateNote && <p className="text-xs text-warn">{rateNote}</p>}
                  {view === 'splits' ? <BudgetAllSplits q={runQ} fgs={shown} email={email} ctx={CTX} onOpen={setOpen} /> : shown.length ? <BudgetTable rows={shown} cols={cols} onOpen={setOpen} selected={open ? rowKey(open) : null} ratesOf={ratesOf} /> : <Card><Empty title={rows.length ? 'No row matches' : 'SAP returned no finished goods'}>{rows.length ? 'Clear the search or the issues filter.' : 'Check the posting date, plant, material type and business line.'}</Empty></Card>}
                </>
              )}

            </>
          )}
        </>
      )}
      {!runQ && <Card><Empty title="Pick the period, plants and options, then Run in SAP">SAP costs each finished good: BOM explosion, component cost, activity rates and plan. Nothing is calculated in the browser.</Empty></Card>}

      <SplitDrawer q={runQ ?? form} row={open} appUser={email} ctx={CTX} onClose={() => setOpen(null)} />
      {runQ && <InitiateModal open={initOpen} onClose={() => setInitOpen(false)} q={runQ} rows={rows} email={email} onOpenApprovals={onOpenApprovals} />}
    </>
  );
}

const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };

function InitiateModal({ open, onClose, q, rows, email, onOpenApprovals }: { open: boolean; onClose: () => void; q: BudgetQuery; rows: BudgetSummaryRow[]; email: string; onOpenApprovals?: () => void }) {
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<BudgetInitResult | null>(null);
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => { if (!open) { setErr(''); setBusy(false); } }, [open]);
  const ids = distinctRunIds(rows);
  const blocked = !q.exclDiv;
  const go = async () => {
    setBusy(true); setErr('');
    ctl.current = new AbortController();
    try { setDone(await initiateBudget(ids, remarks, email, { signal: ctl.current.signal })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const close = () => { ctl.current?.abort(); setDone(null); setRemarks(''); onClose(); };
  return (
    <Modal open={open} onClose={close} title={done ? 'Budget initiated' : 'Initiate budget for approval'}
      footer={done ? <>{onOpenApprovals && <Button onClick={() => { close(); onOpenApprovals(); }}>Open approvals</Button>}<Button variant="primary" onClick={close}>Close</Button></>
        : <><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" onClick={() => void go()} disabled={busy || blocked || !ids.length}>{busy ? <><Spinner /> Saving in SAP…</> : <><Send size={13} /> Initiate</>}</Button></>}>
      {done ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="flex items-center gap-2 font-semibold text-good"><CheckCircle2 size={16} /> {done.MsgTxt || 'Data updated'}</p>
          <p>Version <b>{done.Version}</b> of year <b>{done.Gjahr}</b>: {done.SavedSum} summary lines and {done.SavedDet} component lines saved. It now waits for the approver named in SAP.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {blocked && <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2" role="alert">{INITIATE_BLOCKED}</p>}
          <p>SAP saves the <b>{rows.length}</b> lines of the run you are looking at ({ids.length} plant run{ids.length === 1 ? '' : 's'}: {q.plants.join(', ')}) as a new version. The browser sends only the run references, never an amount.</p>
          <label className="flex flex-col gap-1 text-xs font-bold text-muted">Remarks (shown to the approver)
            <input className={inputCls} maxLength={100} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          <p className="text-2xs text-faint">A run stays available in SAP for a limited time. If SAP says it is no longer available, run again.</p>
          {err && <p className="text-bad" role="alert">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

