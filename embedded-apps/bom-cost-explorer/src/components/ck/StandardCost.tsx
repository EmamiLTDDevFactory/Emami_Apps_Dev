'use client';
/**
 * Standard cost (CK13N): the standard cost estimate of a material, shown like SAP transaction CK13N (Admin of this app only). SAP computes every
 * figure; this page presents it. Read-only. Nothing loads until Show (never from the URL alone), no request has a time limit (Stop ends it),
 * results stay for the same inputs until Refresh, and leaving the page aborts what is running.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, FileSpreadsheet, Lock, Play, RefreshCw, Square } from 'lucide-react';
import PlanFrame from '../plan/PlanFrame';
import type { PlantsState } from '../FilterPanel';
import BomCostingPanel from '../costline/BomCostingPanel';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker } from '../Pickers';
import { Button, Card, Empty, Field, Spinner, Tabs, cx, inputCls } from '../ui';
import WacMessages from '../wac/WacMessages';
import { ComponentsTab, EstimatesTab, HeaderCard, ItemsTab, estimateLabel, type CompareData } from './CkParts';
import { api } from '@/lib/client/api';
import { fetchCostLines } from '@/lib/sap/service';
import { defaultQuery } from '@/lib/query/schema';
import { originMapOf } from '@/lib/cost/originBreakup';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { useHubSession } from '@/lib/client/session';
import { loadSapConfig } from '@/lib/sap/config';
import type { PlantRow } from '@/lib/sap/fields';
import { fmtDate, fmtMs } from '@/lib/format';
import { abortAll, invalidate, stop, type WacEntry } from '@/lib/wac/cache';
import { downloadWacWorkbook, type WacSheet } from '@/lib/wac/export';
import { compareSheet, componentsSheet, estimatesSheet, headerSheet, itemsSheet, originSheet, structureSheet } from '@/lib/ck/export';
import { flatten } from '@/lib/ck/structure';
import { CostingStructureTab, useCostingStructure } from './CostingStructure';
import { buildCkFilter, type CkEstimateKey, type CkQuery } from '@/lib/ck/filter';
import { ckKey, startCk, useCkEntry } from '@/lib/ck/useCk';
import { ckSearch, parseCkUrl } from '@/lib/ck/url';
import type { CkCompRow, CkHeaderRow, CkItemRow, CkListRow } from '@/lib/ck/types';
import { breadcrumb, compareEstimates, currentMaterial, defaultEstimate, keyFromRow, popStack, pushStack, sapKeyText } from '@/lib/ck/view';

type Tab = 'components' | 'structure' | 'items' | 'estimates' | 'bom';
interface Form { mat: string[]; plant: string[]; klvar: string; tvers: string }
interface View { root: string; werks: string; klvar: string; tvers: string; key: CkEstimateKey | null; at: Date }

const sig = (f: Form) => `${f.mat[0] ?? ''}|${f.plant[0] ?? ''}|${f.klvar}|${f.tvers}`;
const initial = (): { form: Form; stack: string[] } => {
  const u = typeof window === 'undefined' ? {} : parseCkUrl(window.location.search);
  return { form: { mat: u.mat ? [u.mat] : [], plant: u.plant ? [u.plant] : [], klvar: u.klvar ?? '', tvers: u.tvers ?? '' }, stack: u.stack ?? [] };
};
const doneRows = <T,>(e: WacEntry<T> | undefined): T[] | null => (e?.status === 'done' ? e.data ?? [] : null);

function Screen() {
  const hub = useHubSession();
  const email = hub && hub !== 'checking' ? hub.email : '';
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  useEffect(() => { if (email) void fetchIsAdmin(email).then((a) => setAdmin(a ? 'yes' : 'no')); }, [email]);
  const cfg = useMemo(() => (typeof window === 'undefined' ? null : loadSapConfig()), []);
  const system = cfg?.ok ? cfg.config.system : '';

  const init = useRef(initial());
  const [form, setForm] = useState<Form>(init.current.form);
  const [stack, setStack] = useState<string[]>(init.current.stack);
  const restored = useRef(init.current.stack.length > 0); // a stack that came from the URL survives the first Show only if the selection is unchanged
  const firstSig = useRef(sig(init.current.form));
  const patch = useCallback((p: Partial<Form>) => setForm((f) => ({ ...f, ...p })), []);

  // The URL mirrors the selection and the stack. Writing it never starts a request.
  useEffect(() => {
    const s = ckSearch(window.location.search, { mat: form.mat[0] ?? '', plant: form.plant[0] ?? '', klvar: form.klvar, tvers: form.tvers, stack });
    if (s !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${s}${window.location.hash}`);
  }, [form, stack]);

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [plantsErr, setPlantsErr] = useState('');
  const loadPlants = useCallback(() => {
    setPlantsLoading(true);
    setPlantsErr('');
    api.plants().then((r) => setPlants(r.plants)).catch((e) => setPlantsErr(e.message)).finally(() => setPlantsLoading(false));
  }, []);
  useEffect(() => { if (admin === 'yes') loadPlants(); }, [admin, loadPlants]);
  const plantsState: PlantsState = useMemo(() => ({ plants, loading: plantsLoading, error: plantsErr, reload: loadPlants }), [plants, plantsLoading, plantsErr, loadPlants]);
  useEffect(() => () => abortAll(), []); // leaving the page ends every running request

  const [errors, setErrors] = useState<{ mat?: string; plant?: string }>({});
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<Tab>('components');
  const [nonce, setNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const show = () => {
    const e: typeof errors = {};
    if (!form.mat[0]) e.mat = 'Pick a material.';
    if (!form.plant[0]) e.plant = 'Pick one plant.';
    if (form.plant[0] && plants.length && !plants.some((p) => p.Werks.toUpperCase() === form.plant[0].toUpperCase())) e.plant = 'This plant is not available to you in SAP.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const keep = restored.current && sig(form) === firstSig.current;
    restored.current = false;
    const nextStack = keep ? stack : [];
    setStack(nextStack);
    setCompareKeys(null);
    setView({ root: form.mat[0], werks: form.plant[0].toUpperCase(), klvar: form.klvar.trim(), tvers: form.tvers.trim(), key: null, at: new Date() });
    setNonce((n) => n + 1);
  };

  const cur = view ? currentMaterial(view.root, stack) : '';
  const needKey = !!view && !!(view.klvar || view.tvers);
  const listQ = useMemo<CkQuery | null>(() => (view ? { matnr: cur, werks: view.werks, klvar: view.klvar, tvers: view.tvers } : null), [view, cur]);
  const listE = useCkEntry('LIST', listQ);
  const listRows = doneRows(listE);
  // Default = the current standard: SAP picks it from Matnr + Plant. With a variant or version typed in, the matching estimate of the list is used.
  const effKey = useMemo<CkEstimateKey | null>(() => {
    if (!view) return null;
    if (view.key) return view.key;
    if (needKey && listRows) { const d = defaultEstimate(listRows); return d ? keyFromRow(d) : null; }
    return null;
  }, [view, needKey, listRows]);
  const detailQ = useMemo<CkQuery | null>(() => {
    if (!view) return null;
    if (effKey) return { key: effKey };
    return needKey ? null : { matnr: cur, werks: view.werks };
  }, [view, effKey, needKey, cur]);
  const headerE = useCkEntry('HEADER', detailQ);
  const compE = useCkEntry('COMP', detailQ);
  const itemE = useCkEntry('ITEM', detailQ); // read only: the items are requested when the Itemization tab is open

  const ctx = view ? `ck-run|${view.werks}|${cur}|${view.klvar}|${view.tvers}` : '';
  const listKey = ckKeySafe('LIST', listQ), detailKey = ckKeySafe('HEADER', detailQ);
  useEffect(() => {
    if (!view || !listQ) return;
    void startCk('LIST', listQ, ctx, 'LIST');
    if (detailQ) {
      void startCk('HEADER', detailQ, ctx, 'HEADER');
      void startCk('COMP', detailQ, ctx, 'COMP');
      if (tab === 'items' || tab === 'structure') void startCk('ITEM', detailQ, ctx, 'ITEM');
    }
  }, [view, listKey, detailKey, tab, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // compare of two estimates
  const [compareKeys, setCompareKeys] = useState<{ a: CkEstimateKey; b: CkEstimateKey; la: string; lb: string } | null>(null);
  const cmpAE = useCkEntry('COMP', compareKeys ? { key: compareKeys.a } : null);
  const cmpBE = useCkEntry('COMP', compareKeys ? { key: compareKeys.b } : null);
  useEffect(() => {
    if (!compareKeys || !ctx) return;
    void startCk('COMP', { key: compareKeys.a }, ctx, 'COMPARE_COMP');
    void startCk('COMP', { key: compareKeys.b }, ctx, 'COMPARE_COMP');
  }, [compareKeys, ctx]);

  const watched = [listE, headerE, compE, tab === 'items' || tab === 'structure' ? itemE : undefined, cmpAE, cmpBE];
  const loading = watched.some((e) => e?.status === 'loading');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = Math.min(...watched.filter((e) => e?.status === 'loading').map((e) => e!.startedAt), Infinity);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(t);
  }, [loading, startedAt]);

  const header = (doneRows(headerE)?.[0] ?? null) as CkHeaderRow | null;
  const comps = doneRows(compE) as CkCompRow[] | null;
  const items = doneRows(itemE) as CkItemRow[] | null;
  // CK13N costing structure, all levels: built once the tab has been opened for this estimate
  const [structOn, setStructOn] = useState(false);
  useEffect(() => { if (tab === 'structure') setStructOn(true); }, [tab]);
  useEffect(() => { setStructOn(tab === 'structure'); }, [header?.Kalnr, header?.Kadky, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const structure = useCostingStructure(header, items, structOn);
  // Origin group of each component, read from the BOM costing (CostLineSet CompOgrp) when the person asks and SAP sent none on the items.
  const [originMap, setOriginMap] = useState<Map<string, string> | null>(null);
  const [originState, setOriginState] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; note?: string }>({ status: 'idle' });
  const originFor = useRef('');
  const loadOrigins = () => {
    if (!header) return;
    const key = `${header.Matnr}|${header.Werks}`;
    originFor.current = key;
    setOriginState({ status: 'loading' });
    const query = { ...defaultQuery('B'), materials: [header.Matnr], plants: [header.Werks], explQty: '1' };
    fetchCostLines(query, { noTimeout: true })
      .then((r) => { if (originFor.current === key) { setOriginMap(originMapOf(r.rows)); setOriginState({ status: 'done' }); } })
      .catch((e: Error) => { if (originFor.current === key) setOriginState({ status: 'error', note: e.message }); });
  };
  useEffect(() => { originFor.current = ''; setOriginMap(null); setOriginState({ status: 'idle' }); }, [header?.Matnr, header?.Werks]);
  const messages = [...watched.flatMap((e) => e?.messages ?? [])];
  const failed = watched.find((e) => e?.status === 'error');
  const noEstimate = !!view && listE?.status === 'done' && (listRows?.length ?? 0) === 0 && (!detailQ || headerE?.status === 'done' && !header);

  const drill = (matnr: string) => { setStack((s) => pushStack(s, matnr)); setView((v) => (v ? { ...v, key: null } : v)); setCompareKeys(null); setTab('components'); };
  const back = () => { setStack((s) => popStack(s)); setView((v) => (v ? { ...v, key: null } : v)); setCompareKeys(null); };
  const openEstimate = (r: CkListRow) => { const k = keyFromRow(r); if (k) { setView((v) => (v ? { ...v, key: k } : v)); setTab('components'); } };
  const refresh = () => { if (ctx) { invalidate(ctx); setNonce((n) => n + 1); } };

  const copyForSap = async () => {
    if (!header) return;
    const text = sapKeyText(header, (d) => (d ? fmtDate(d) : ''));
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFallbackText(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallbackText(text); // clipboard blocked: the values are shown to copy by hand
    }
  };

  const doExport = async () => {
    if (!header || !view) return;
    const sheets: WacSheet[] = [headerSheet(header)];
    if (comps) sheets.push(componentsSheet(comps));
    const loadedItems = doneRows(itemE) as CkItemRow[] | null;
    if (loadedItems) sheets.push(itemsSheet(loadedItems, originMap), originSheet(loadedItems, originMap));
    if (structure.status === 'done' && structure.nodes) sheets.push(structureSheet(flatten(structure.nodes), header.Curr || 'INR'));
    if (listRows) sheets.push(estimatesSheet(listRows));
    if (compareKeys && cmpAE?.status === 'done' && cmpBE?.status === 'done') sheets.push(compareSheet(compareEstimates(cmpAE.data ?? [], cmpBE.data ?? []), compareKeys.la, compareKeys.lb));
    await downloadWacWorkbook(sheets, [
      ['Report', 'Standard cost estimate (like CK13N), amounts per base unit in the currency shown'], ['SAP system', system], ['Run at', view.at.toLocaleString('en-IN')],
      ['Material', cur], ['Plant', view.werks], ['Costing variant (typed)', view.klvar || 'any'], ['Costing version (typed)', view.tvers || 'any'],
      ['Estimate', effKey ? `Kalnr ${effKey.kalnr}, Kadky ${effKey.kadky}, version ${effKey.tvers}, valuation variant ${effKey.bwvar}` : 'the current standard (SAP picked it)'],
      ['Drill-down path', breadcrumb(view.root, stack).join(' > ')], ['Sheets', 'only what has been loaded: Items after the Itemization tab was opened, Compare after Compare was pressed'],
    ], 'standard-cost');
  };

  if (admin === 'checking') return <div className="grid min-h-[40vh] place-items-center"><Spinner className="h-7 w-7" /></div>;
  if (admin === 'no') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-line bg-panel p-7 text-center shadow-card">
        <Lock size={24} className="mx-auto text-warn" aria-hidden />
        <h1 className="mt-2 text-lg font-extrabold">Standard cost is for Admins</h1>
        <p className="mt-1 text-sm text-muted">Ask a Costing Cockpit Admin for access (Manage Access in the Emami Apps Admin Center).</p>
      </div>
    );
  }

  const compare: CompareData | null = compareKeys ? { a: cmpAE as WacEntry<CkCompRow> | undefined, b: cmpBE as WacEntry<CkCompRow> | undefined, labelA: compareKeys.la, labelB: compareKeys.lb } : null;
  const crumbs = view ? breadcrumb(view.root, stack) : [];
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">Standard cost (CK13N)</h1>
          <p className="text-xs text-muted">The standard cost estimate of a material, like SAP CK13N. Amounts are per base unit, in the currency shown; SAP computes every figure.</p>
        </div>
        <div className="num text-right text-2xs text-muted">
          <div>SAP system <span className="font-mono font-bold text-ink">{system || '—'}</span></div>
          {view && header && headerE?.status === 'done' && <div>Run {view.at.toLocaleTimeString('en-IN')} · {fmtMs(headerE.ms)} in SAP</div>}
        </div>
      </div>

      <Card title="Selection" bodyClass="flex flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Material" hint="One material (finished good or semi-finished)." error={errors.mat}>
            {(id) => (
              <>
                <MaterialPicker id={id} values={form.mat} onChange={(v) => patch({ mat: v.slice(-1) })} max={1} invalid={!!errors.mat} />
                <MaterialHierarchyPicker values={form.mat} onChange={(v) => patch({ mat: v.slice(-1) })} max={1} werks={form.plant} />
              </>
            )}
          </Field>
          <Field label="Plant" hint="One plant, as in CK13N." error={errors.plant}>
            {(id) => <PlantPicker id={id} values={form.plant} onChange={(v) => patch({ plant: v.slice(-1) })} state={plantsState} single invalid={!!errors.plant} />}
          </Field>
          <Field label="Costing variant (optional)" hint="Empty = the current standard estimate.">{(id) => <input id={id} className={inputCls} placeholder="e.g. PPC1" value={form.klvar} onChange={(e) => patch({ klvar: e.target.value })} />}</Field>
          <Field label="Costing version (optional)" hint="Empty = the current standard estimate.">{(id) => <input id={id} className={inputCls} placeholder="e.g. 1" value={form.tvers} onChange={(e) => patch({ tvers: e.target.value })} />}</Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {loading ? <Button type="button" variant="ghost" onClick={() => stop(ctx)}><Square size={14} /> Stop ({fmtMs(elapsed)})</Button> : <Button type="button" variant="primary" onClick={show}><Play size={14} /> Show</Button>}
          <Button type="button" onClick={refresh} disabled={!view || loading} title="Fetch the same selection again from SAP (a result is kept until you refresh)"><RefreshCw size={14} /> Refresh</Button>
          <Button type="button" onClick={() => void doExport()} disabled={!header} title="Excel: header, components, itemization (if opened), estimates, compare (if run), parameters. Exports only what has been loaded."><FileSpreadsheet size={14} /> Excel</Button>
          <span className="text-xs text-faint">Nothing loads until you press Show. There is no time limit; Stop ends a run.</span>
        </div>
      </Card>

      {view && (
        <nav aria-label="Estimate path" className="flex flex-wrap items-center gap-1 text-sm">
          {stack.length > 0 && <Button size="sm" variant="ghost" onClick={back}><ArrowLeft size={13} /> Back</Button>}
          {crumbs.map((m, i) => <span key={`${m}-${i}`} className="inline-flex items-center gap-1">{i > 0 && <ChevronRight size={12} className="text-faint" aria-hidden />}<span className={cx('font-mono', i === crumbs.length - 1 ? 'font-bold text-accent' : 'text-muted')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{m}</span></span>)}
          <span className="text-xs text-faint">· plant {view.werks}</span>
        </nav>
      )}

      {loading && !header && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" /> Reading from SAP… {fmtMs(elapsed)}</p>}
      {[listE, headerE, compE].some((e) => e?.status === 'cancelled') && !loading && <p className="text-sm text-muted">The run was stopped.</p>}
      <WacMessages messages={messages} error={failed?.status === 'error' ? failed.error : null} />
      {fallbackText && (
        <div className="rounded-xl border border-line bg-panel p-3 text-sm">
          <p className="mb-1 font-semibold">Your browser blocked the clipboard. Select and copy these values:</p>
          <textarea readOnly aria-label="Key values for CK13N" className="h-40 w-full rounded-lg border border-line bg-sunken p-2 font-mono text-xs" value={fallbackText} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}

      {noEstimate && <Empty title="No cost estimate found">SAP has no standard cost estimate for this material in this plant{view?.klvar || view?.tvers ? ' with this variant / version' : ''}. Try another plant, or clear the variant and version.</Empty>}
      {header && <HeaderCard h={header} onCopy={() => void copyForSap()} copied={copied} />}

      {header && (
        <>
          <Tabs<Tab> label="Cost estimate views" value={tab} onChange={setTab} tabs={[{ id: 'components', label: 'Cost components' }, { id: 'structure', label: 'Costing structure (all levels)' }, { id: 'items', label: 'Itemization' }, { id: 'bom', label: 'BOM costing (all costs)' }, { id: 'estimates', label: 'Estimates', badge: listRows ? <span className="rounded-full bg-sunken px-1.5 text-2xs font-bold">{listRows.length}</span> : undefined }]} />
          {tab === 'components' && (comps ? <ComponentsTab comps={comps} /> : <p className="text-sm text-muted">{compE?.status === 'error' ? 'The components could not be loaded.' : 'Loading the cost components…'}</p>)}
          {tab === 'structure' && (items ? <CostingStructureTab header={header} state={structure} /> : <p className="text-sm text-muted">{itemE?.status === 'error' ? 'The items could not be loaded.' : 'Loading the itemization from SAP…'}</p>)}
          {tab === 'bom' && <BomCostingPanel matnr={header.Matnr} werks={header.Werks} uom={header.Meeht} defaultQty={header.Losgr} />}
          {tab === 'items' && (items ? <ItemsTab items={items} onOpen={drill} originMap={originMap} originState={originState} onLoadOrigins={loadOrigins} /> : <p className="text-sm text-muted">{itemE?.status === 'error' ? 'The items could not be loaded.' : 'Loading the itemization from SAP…'}</p>)}
          {tab === 'estimates' && (listRows ? <EstimatesTab rows={listRows} active={effKey ?? keyFromRow(defaultEstimate(listRows) ?? ({} as CkListRow))} onOpen={openEstimate} onCompare={(a, b) => { const ka = keyFromRow(a), kb = keyFromRow(b); if (ka && kb) setCompareKeys({ a: ka, b: kb, la: estimateLabel(a), lb: estimateLabel(b) }); }} compare={compare} /> : <p className="text-sm text-muted">Loading the estimates…</p>)}
        </>
      )}
      {!view && <Empty title="Nothing loaded yet">Pick a material and a plant, then press Show. The current standard estimate is shown unless you type a variant or version.</Empty>}
    </>
  );
}

function ckKeySafe(set: 'LIST' | 'HEADER' | 'COMP' | 'ITEM', q: CkQuery | null): string | null {
  if (!q) return null;
  try { buildCkFilter(q, set); return ckKey(set, q); } catch { return null; }
}

export default function StandardCost() {
  return (
    <PlanFrame active="ck">
      <Screen />
    </PlanFrame>
  );
}
