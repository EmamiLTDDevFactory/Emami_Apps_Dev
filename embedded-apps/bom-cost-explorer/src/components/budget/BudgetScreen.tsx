'use client';
/**
 * Budget costing: the OData rebuild of the SAP report ZMM_FG_BOMEXPLR_COST (initiate mode). SAP does every costing step; this screen sends the selection,
 * shows the per-FG budget / projected / actual / last cost per piece, the split of one FG, the BOM checklist, and lets an initiator save the run as a new
 * version for approval. Nothing loads before Run (never from the URL), a request has no client time limit (Stop ends it), results stay for the same
 * selection until Refresh, and leaving the page aborts what is running.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, Lock, Play, RefreshCw, Send, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import type { PlantsState } from '../FilterPanel';
import { Button, Card, Empty, Modal, Pill, Skeleton, Spinner, Stat, Tabs, cx, inputCls } from '../ui';
import WacMessages from '../wac/WacMessages';
import BudgetForm from './BudgetForm';
import BudgetTable from './BudgetTable';
import SplitDrawer from './SplitDrawer';
import { api } from '@/lib/client/api';
import { useHubSession, BASE_PATH } from '@/lib/client/session';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtMs, fmtNum } from '@/lib/format';
import { abortAll, invalidate, stop } from '@/lib/wac/cache';
import { FilterError } from '@/lib/sap/filter';
import { buildBudgetFilter, defaultBudgetQuery, INITIATE_BLOCKED, validateBudget, type BudgetQuery } from '@/lib/budget/filter';
import { checkKey, runKey, startCheck, startRun, useEntry } from '@/lib/budget/useBudget';
import { initiateBudget } from '@/lib/budget/write';
import { canDisplayBudget, canInitiateBudget, useBudgetRole } from '@/lib/budget/roles';
import { DEFAULT_GROUPS, GROUP_LABEL, SUMMARY_COLS, colsOf, distinctRunIds, filterIssues, issuesOf, kpis, rowKey, searchRows, type ColGroup } from '@/lib/budget/view';
import { checkSheet, downloadBudget, paramsOf, summarySheet } from '@/lib/budget/export';
import type { BudgetCheckRow, BudgetInitResult, BudgetSummaryRow } from '@/lib/budget/types';

type Tab = 'summary' | 'checklist';
const CTX = 'budget-run';
const SEARCH_KEYS = ['Matnr', 'Maktx', 'Zskugrcodecrs', 'Zskugroupcrs', 'Zscheme', 'WipCode', 'WipDesc', 'Werks'];

function Locked({ text }: { text: string }) {
  return <Card><Empty title="Budget costing is not open to you" icon={<Lock size={28} />}>{text}</Empty></Card>;
}

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const role = useBudgetRole(email);
  const [form, setForm] = useState<BudgetQuery>(() => defaultBudgetQuery());
  const patch = useCallback((p: Partial<BudgetQuery>) => setForm((f) => ({ ...f, ...p })), []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('summary');
  const [runQ, setRunQ] = useState<BudgetQuery | null>(null);
  const [progress, setProgress] = useState('');
  const [groups, setGroups] = useState<Set<ColGroup>>(new Set(DEFAULT_GROUPS));
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
  const allowed = typeof role === 'string' && role !== 'checking' && canDisplayBudget(role);
  useEffect(() => { if (allowed) loadPlants(); }, [allowed, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);
  useEffect(() => () => abortAll(), []); // leaving the page ends every running request

  const key = runKey(runQ, email);
  const entry = useEntry<BudgetSummaryRow>(key);
  const chkEntry = useEntry<BudgetCheckRow>(runQ ? safe(() => checkKey(runQ, email)) : null);
  const formKey = safe(() => runKey(form, email));
  const stale = !!runQ && formKey !== key;
  const rows = useMemo(() => (entry?.status === 'done' ? entry.data ?? [] : []), [entry]);
  const k = useMemo(() => kpis(rows), [rows]);
  const shown = useMemo(() => searchRows(onlyIssues ? filterIssues(rows) : rows, search, SEARCH_KEYS), [rows, onlyIssues, search]);
  const cols = useMemo(() => colsOf(groups), [groups]);
  const running = entry?.status === 'loading';
  const canInit = typeof role === 'string' && canInitiateBudget(role);

  const run = (force = false) => {
    const e = validateBudget(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    try { buildBudgetFilter(form, { werks: form.plants[0] }); } catch (x) { if (x instanceof FilterError) { setErrors({ _: x.message }); return; } throw x; }
    const snap = structuredClone(form);
    setRunQ(snap); setTab('summary'); setOpen(null);
    if (force) invalidate(CTX);
    setProgress('');
    void startRun(snap, CTX, email, force, (w, i, n) => setProgress(`Plant ${w} (${i + 1} of ${n})`));
  };
  const runChecklist = (force = false) => { if (runQ) void startCheck(runQ, CTX, email, force); };

  const toggleGroup = (g: ColGroup) => setGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); n.add('core'); return n; });
  const exportXlsx = () => {
    if (!runQ) return;
    const sheets = [summarySheet(shown, cols)];
    if (chkEntry?.status === 'done') sheets.push(checkSheet(chkEntry.data ?? []));
    void downloadBudget(sheets, paramsOf(runQ, [['Rows', String(shown.length)], ['SAP time', fmtMs(entry?.ms ?? 0)]]));
  };

  if (hub === 'checking' || role === 'checking') return <div className="grid place-items-center py-24"><Spinner /></div>;
  if (!allowed) return <Locked text="Ask an admin to give you the budget-init or budget-approve role for Costing Cockpit in Manage Access." />;

  return (
    <>
      <Card title="Selection" actions={<span className="text-2xs text-faint">Same rules as the SAP selection screen: * = required</span>}>
        <BudgetForm q={form} onChange={patch} errors={errors} plants={plantsState} canInitiate={canInit} />
        {errors._ && <p className="mt-2 text-sm text-bad" role="alert">{errors._}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => run(false)} disabled={running}><Play size={14} /> Run in SAP</Button>
          {running && <Button variant="danger" onClick={() => stop(CTX)}><Square size={13} /> Stop</Button>}
          {running && <span className="flex items-center gap-2 text-sm text-muted"><Spinner /> {progress || 'Waiting for SAP…'}</span>}
          {!running && entry?.status === 'done' && <span className="text-xs text-muted">{rows.length} lines · {fmtMs(entry.ms)} in SAP</span>}
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
                <Tabs<Tab> label="Budget views" value={tab} onChange={setTab} tabs={[{ id: 'summary', label: 'Summary' }, { id: 'checklist', label: 'BOM checklist' }]} />
                <span className="flex-1" />
                {stale && <Pill tone="warn" title="The selection above is not the one that produced these rows">Selection changed: run again</Pill>}
                <Button size="sm" onClick={() => run(true)}><RefreshCw size={13} /> Refresh</Button>
                <Button size="sm" onClick={exportXlsx}><FileSpreadsheet size={13} /> Excel</Button>
                <Button size="sm" variant="primary" disabled={!canInit || stale || !rows.length} title={!canInit ? 'You need the budget-init role' : stale ? 'Run again with the current selection first' : !runQ.exclDiv ? INITIATE_BLOCKED : 'Save this run as a new version for approval'} onClick={() => setInitOpen(true)}><Send size={13} /> Initiate</Button>
              </div>

              {tab === 'summary' && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="Search the rows" placeholder="Search material, description, CRS, scheme, WIP…" className={cx(inputCls, 'max-w-sm')} value={search} onChange={(e) => setSearch(e.target.value)} />
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Only lines with checklist issues</label>
                    <details className="relative ml-auto">
                      <summary className="cursor-pointer list-none rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-semibold hover:bg-sunken">Columns ({cols.length})</summary>
                      <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-panel p-2 shadow-pop">
                        {(Object.keys(GROUP_LABEL) as ColGroup[]).filter((g) => SUMMARY_COLS.some((c) => c.group === g)).map((g) => (
                          <label key={g} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={groups.has(g)} disabled={g === 'core'} onChange={() => toggleGroup(g)} /> {GROUP_LABEL[g]}</label>
                        ))}
                      </div>
                    </details>
                  </div>
                  {shown.length ? <BudgetTable rows={shown} cols={cols} onOpen={setOpen} selected={open ? rowKey(open) : null} /> : <Card><Empty title={rows.length ? 'No row matches' : 'SAP returned no finished goods'}>{rows.length ? 'Clear the search or the issues filter.' : 'Check the posting date, plant, material type and business line.'}</Empty></Card>}
                </>
              )}

              {tab === 'checklist' && (
                <Card title="BOM and production version checklist" actions={<Button size="sm" variant="primary" onClick={() => runChecklist(chkEntry?.status === 'done')} disabled={chkEntry?.status === 'loading'}><Play size={13} /> {chkEntry?.status === 'done' ? 'Refresh' : 'Run checklist'}</Button>}>
                  <p className="mb-2 text-sm text-muted">Finished goods whose BOMs or production versions are inactive, duplicated or out of step. SAP checks them for the selection above (the report's FG-level checklist).</p>
                  {chkEntry?.status === 'loading' && <Skeleton rows={5} />}
                  <WacMessages messages={chkEntry?.messages ?? []} error={chkEntry?.status === 'error' ? chkEntry.error : null} />
                  {chkEntry?.status === 'done' && <CheckTable rows={chkEntry.data ?? []} />}
                </Card>
              )}
            </>
          )}
        </>
      )}
      {!runQ && <Card><Empty title="Pick the period, plants and options, then Run in SAP">SAP costs each finished good: BOM explosion, component cost, activity rates and plan. Nothing is calculated in the browser.</Empty></Card>}

      <SplitDrawer q={runQ ?? form} row={open} appUser={email} ctx={CTX} onClose={() => setOpen(null)} />
      {runQ && <InitiateModal open={initOpen} onClose={() => setInitOpen(false)} q={runQ} rows={rows} email={email} />}
    </>
  );
}

const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };

function CheckTable({ rows }: { rows: BudgetCheckRow[] }) {
  const bad = rows.filter((r) => issuesOf(r).length);
  if (!rows.length) return <Empty title="Nothing to check">SAP returned no finished goods.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm"><b>{bad.length}</b> of {rows.length} finished goods have an issue.</p>
      <div className="scroll-thin max-h-[52vh] overflow-auto rounded-2xl border border-line">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead><tr className="text-left text-2xs font-extrabold uppercase text-muted">{['Material', 'Description', 'Plant', 'All BoM inactive', 'All PVer inactive', 'Multiple BoM active', 'Multiple PVer unlocked', 'Alt. BoM issue'].map((h) => <th key={h} className="sticky top-0 whitespace-nowrap border-b border-line bg-sunken px-2.5 py-2">{h}</th>)}</tr></thead>
          <tbody>
            {[...bad, ...rows.filter((r) => !issuesOf(r).length)].map((r) => (
              <tr key={`${r.Werks}|${r.Matnr}|${r.Rowid}`} className="odd:bg-panel even:bg-sunken/40">
                <td className="border-b border-line/60 px-2.5 py-1.5 font-mono text-xs font-bold text-accent">{r.Matnr}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Maktx}</td><td className="border-b border-line/60 px-2.5 py-1.5">{r.Werks}</td>
                {[r.AllBomIn, r.AllPverIn, r.MulBom, r.MulUnlock, r.MulProd].map((f, i) => <td key={i} className="border-b border-line/60 px-2.5 py-1.5">{f ? <Pill tone="warn">X</Pill> : <span className="text-faint">–</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InitiateModal({ open, onClose, q, rows, email }: { open: boolean; onClose: () => void; q: BudgetQuery; rows: BudgetSummaryRow[]; email: string }) {
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
      footer={done ? <><a href={`${BASE_PATH}/budget-cost/approvals/`} className="inline-flex h-9 items-center rounded-xl border border-line px-3.5 text-sm font-semibold hover:bg-sunken">Open approvals</a><Button variant="primary" onClick={close}>Close</Button></>
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

export default function BudgetScreen() {
  return <PlanFrame active="budget"><Screen /></PlanFrame>;
}
