'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, BookmarkPlus, ChevronDown, Columns3, Download, FileSpreadsheet, Filter, RefreshCw, RotateCcw, Save, Star, StarOff, Trash2, X } from 'lucide-react';
import { deleteVariant, getDailyReport, getMe, getVariants, savePrefs, saveVariant } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtNum, istToday } from '@/lib/format';
import type { ReportVariantConfig, Variant } from '@/lib/types';
import { Button, Card, Field, Modal, MultiSelect, Notice, Spinner, cx, inputCls } from './ui';
import { ItsmTag } from './Itsm';

// Neutralise spreadsheet formulas in user-supplied text (same rule as the other apps' exports).
const safeCell = (v: string | number) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

type Cell = string | number;
type Report = { columns: string[]; rows: Cell[][]; from: string; to: string };
type Range = ReportVariantConfig['range'];
type ColFilter = { values?: string[]; contains?: string };
type Filters = Record<string, ColFilter>;
type Msg = { tone: 'good' | 'bad' | 'warn'; text: string };

const BLANK = '(blank)';
const PREVIEW_ROWS = 100;
// The pick list of a column shows at most this many values (the most frequent ones); "contains" covers the rest.
const OPTIONS_MAX = 500;

const text = (v: Cell) => String(v ?? '').trim();
const byValue = (a: string, b: string) => (a === BLANK ? 1 : b === BLANK ? -1 : a.localeCompare(b, 'en', { numeric: true }));

const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom' },
];

/** A relative range resolved against today in IST, so a "Today" variant always means today. */
function resolveRange(range: Range, from?: string, to?: string): { from: string; to: string } {
  const today = istToday();
  switch (range) {
    case 'yesterday': return { from: istToday(-1), to: istToday(-1) };
    case 'last7': return { from: istToday(-6), to: today };
    case 'last30': return { from: istToday(-29), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'lastMonth': {
      const y = Number(today.slice(0, 4));
      const m = Number(today.slice(5, 7)); // 1-based current month
      const iso = (d: number) => new Date(d).toISOString().slice(0, 10);
      return { from: iso(Date.UTC(y, m - 2, 1)), to: iso(Date.UTC(y, m - 1, 0)) };
    }
    case 'custom': return { from: from || today, to: to || today };
    default: return { from: today, to: today };
  }
}

/** Drop empty filters, sort picked values: two equal setups give the same JSON. */
function cleanFilters(f: Filters | undefined): Filters {
  const out: Filters = {};
  if (!f || typeof f !== 'object') return out;
  for (const key of Object.keys(f).sort()) {
    const raw: ColFilter = f[key] ?? {};
    const values = Array.isArray(raw.values) ? [...new Set(raw.values)].filter((v): v is string => typeof v === 'string').sort() : [];
    const contains = typeof raw.contains === 'string' ? raw.contains.trim() : '';
    if (!values.length && !contains) continue;
    out[key] = { ...(values.length ? { values } : {}), ...(contains ? { contains } : {}) };
  }
  return out;
}

function buildConfig(range: Range, from: string, to: string, cols: string[] | null, filters: Filters): ReportVariantConfig {
  return { range, ...(range === 'custom' ? { from, to } : {}), columns: cols ?? [], filters: cleanFilters(filters) };
}
const configKey = (c: ReportVariantConfig) => JSON.stringify(buildConfig(c.range, c.from ?? '', c.to ?? '', c.columns?.length ? c.columns : null, c.filters));

// v7 Phase 3: optional columns the server appends after the 36 (pick them under Columns; never in the default).
const V7_EXTRA = ['Reference', 'Application', 'Workspace'];

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * The 36-column daily report in Daily_Report_template.xlsx order. Load a date range, pick values (or "contains") on any
 * column, choose and order the columns, check the preview, then download what matches. The whole setup can be saved as
 * a variant; the agent's default variant is applied and loaded on opening the screen.
 */
export default function Reports() {
  const { me, meta, can } = useSamadhan();
  const isAdmin = can('admin.general'); // v7: change anyone's variant
  const isSupervisor = can('report.variants.share');
  const hasApps = (meta.applications?.length ?? 0) > 0;
  const [range, setRange] = useState<Range>('today');
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [cols, setCols] = useState<string[] | null>(null); // null = every column, template order
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(true);
  const [msg, setMsg] = useState<Msg | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantsBusy, setVariantsBusy] = useState(true);
  const [applied, setApplied] = useState<{ id: number; key: string } | null>(null);
  const [defaultId, setDefaultId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'save' | 'delete' | 'columns' | null>(null);

  const load = useCallback(async (f: string, t: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await getDailyReport(f, t, hasApps ? V7_EXTRA : undefined);
      setReport({ ...r, from: f, to: t });
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e, 'Could not load the report.') });
    } finally {
      setBusy(false);
    }
  }, [hasApps]);

  /** Put a variant's setup on screen and load its (resolved) date range. */
  const applyVariant = useCallback((v: Variant) => {
    const c = v.config ?? { range: 'today', columns: [], filters: {} };
    const r: Range = RANGES.some((x) => x.id === c.range) ? c.range : 'today';
    const d = resolveRange(r, c.from, c.to);
    const nextCols = Array.isArray(c.columns) && c.columns.length ? c.columns : null;
    const nextFilters = cleanFilters(c.filters);
    setRange(r);
    setFrom(d.from);
    setTo(d.to);
    setCols(nextCols);
    setFilters(nextFilters);
    setApplied({ id: v.id, key: configKey({ range: r, from: d.from, to: d.to, columns: nextCols ?? [], filters: nextFilters }) });
    setMenuOpen(false);
    void load(d.from, d.to);
  }, [load]);

  // On opening: read the variants and my default; apply + load the default if it still exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, meRes] = await Promise.all([getVariants('report'), getMe()]);
        if (cancelled) return;
        setVariants(list);
        const def = meRes.prefs?.defaultVariants?.report ?? null;
        const v = def != null ? list.find((x) => x.id === def) : undefined;
        setDefaultId(v ? v.id : null);
        if (v) applyVariant(v);
      } catch (e) {
        if (!cancelled) setMsg({ tone: 'bad', text: errText(e, 'Could not read the saved variants.') });
      } finally {
        if (!cancelled) setVariantsBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [applyVariant]);

  const refreshVariants = async () => {
    const list = await getVariants('report');
    setVariants(list);
    return list;
  };

  const colIndex = useMemo(() => new Map((report?.columns ?? []).map((c, i) => [c, i] as const)), [report]);
  // The template's 36 columns (the optional v7 ones are only shown when picked).
  const baseCols = useMemo(() => (report?.columns ?? []).filter((c) => !V7_EXTRA.includes(c)), [report]);

  // Columns shown in the preview and the download: the chosen ones that still exist, else all of them.
  const shownCols = useMemo(() => {
    if (!report) return [];
    const picked = (cols ?? []).filter((c) => colIndex.has(c));
    return picked.length ? picked : baseCols;
  }, [report, cols, colIndex, baseCols]);

  // Per column: the pick-list options (most frequent OPTIONS_MAX, alphabetical, '(blank)' last) and the distinct count.
  const choices = useMemo(() => {
    const out = new Map<string, { options: string[]; total: number }>();
    if (!report) return out;
    report.columns.forEach((col, i) => {
      const counts = new Map<string, number>();
      for (const r of report.rows) {
        const v = text(r[i]) || BLANK;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let values = [...counts.keys()];
      if (values.length > OPTIONS_MAX) values = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, OPTIONS_MAX).map(([v]) => v);
      out.set(col, { options: values.sort(byValue), total: counts.size });
    });
    return out;
  }, [report]);

  // Filters on columns that exist in the loaded report (others - e.g. from an old variant - are ignored).
  const liveFilters = useMemo(() => {
    const clean = cleanFilters(filters);
    return report ? Object.entries(clean).filter(([c]) => colIndex.has(c)) : Object.entries(clean);
  }, [filters, report, colIndex]);
  const active = liveFilters.reduce((n, [, f]) => n + (f.values?.length ? 1 : 0) + (f.contains ? 1 : 0), 0);

  const rows = useMemo(() => {
    if (!report) return [];
    const tests = liveFilters.map(([c, f]) => ({ i: colIndex.get(c) ?? -1, set: f.values?.length ? new Set(f.values) : null, q: f.contains?.toLowerCase() ?? '' }));
    if (!tests.length) return report.rows;
    return report.rows.filter((r) => tests.every(({ i, set, q }) => {
      const v = text(r[i]);
      return (!set || set.has(v || BLANK)) && (!q || v.toLowerCase().includes(q));
    }));
  }, [report, liveFilters, colIndex]);

  const setColFilter = (col: string, patch: ColFilter) => setFilters((f) => ({ ...f, [col]: { ...f[col], ...patch } }));

  const currentConfig = buildConfig(range, from, to, cols, filters);
  const appliedVariant = applied ? variants.find((v) => v.id === applied.id) ?? null : null;
  const dirty = !!applied && configKey(currentConfig) !== applied.key;
  const canEdit = (v: Variant | null) => !!v && (v.ownerAgentId === me.id || isAdmin);

  const pickRange = (r: Range) => {
    setRange(r);
    if (r !== 'custom') {
      const d = resolveRange(r);
      setFrom(d.from);
      setTo(d.to);
    }
  };

  const download = async () => {
    if (!report) return;
    setBusy(true);
    setMsg(null);
    try {
      const XLSX = await import('xlsx');
      const idx = shownCols.map((c) => colIndex.get(c) ?? -1);
      const ws = XLSX.utils.aoa_to_sheet([shownCols, ...rows.map((r) => idx.map((i) => safeCell(r[i] ?? '')))]);
      // Wide columns by their template position (subject and the remark / resolution columns at the end).
      ws['!cols'] = idx.map((i) => ({ wch: i === 1 || i >= 31 ? 40 : 18 }));
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: shownCols.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const suffix = appliedVariant ? `_${appliedVariant.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '')}` : active ? '_filtered' : '';
      XLSX.writeFile(wb, `Samadhan_Daily_Report_${report.from}_to_${report.to}${suffix}.xlsx`);
      setMsg({ tone: 'good', text: `Downloaded ${rows.length} ticket${rows.length === 1 ? '' : 's'}${active ? ` (${active} filter${active === 1 ? '' : 's'} applied)` : ''}.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e, 'Could not build the report.') });
    } finally {
      setBusy(false);
    }
  };

  const overwrite = async () => {
    if (!appliedVariant) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveVariant({ id: appliedVariant.id, kind: 'report', name: appliedVariant.name, shared: appliedVariant.shared, config: currentConfig });
      await refreshVariants();
      setApplied({ id: appliedVariant.id, key: configKey(currentConfig) });
      setMsg({ tone: 'good', text: `Variant "${appliedVariant.name}" saved.` });
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e, 'Could not save the variant.') });
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const setDefault = async (id: number | null) => {
    setMenuOpen(false);
    setMsg(null);
    try {
      const prefs = await savePrefs({ defaultVariants: { report: id } });
      setDefaultId(prefs.defaultVariants?.report ?? null);
      setMsg({ tone: 'good', text: id == null ? 'Default variant cleared - the report opens empty for today.' : 'Default set - the report opens with this variant and loads it.' });
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e, 'Could not change the default variant.') });
    }
  };

  const remove = async () => {
    if (!appliedVariant) return;
    setBusy(true);
    try {
      await deleteVariant(appliedVariant.id);
      if (defaultId === appliedVariant.id) setDefaultId(null);
      setApplied(null);
      await refreshVariants();
      setMsg({ tone: 'good', text: `Variant "${appliedVariant.name}" deleted.` });
      setDialog(null);
    } catch (e) {
      setMsg({ tone: 'bad', text: errText(e, 'Could not delete the variant.') });
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const standard = () => {
    setMenuOpen(false);
    setApplied(null);
    setCols(null);
    setFilters({});
    pickRange('today');
  };

  const stale = report && (report.from !== from || report.to !== to);
  const mine = variants.filter((v) => v.ownerAgentId === me.id);
  const others = variants.filter((v) => v.ownerAgentId !== me.id);

  const variantRow = (v: Variant) => (
    <div key={v.id} className={cx('flex items-center rounded-lg hover:bg-sunken', applied?.id === v.id && 'text-accent')}>
      <button type="button" onClick={() => applyVariant(v)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-xs font-semibold" title={`Apply and load ${v.name}`}>
        <Bookmark size={13} className="shrink-0" />
        <span className="truncate">{v.name}</span>
        {v.shared && <span className="shrink-0 rounded bg-accent/10 px-1 text-[10px] text-accent" title={`Shared by ${v.ownerName}`}>shared</span>}
        {v.ownerAgentId !== me.id && <span className="min-w-0 truncate text-2xs font-normal text-muted">{v.ownerName}</span>}
      </button>
      <button
        type="button"
        onClick={() => void setDefault(defaultId === v.id ? null : v.id)}
        className={cx('px-2', defaultId === v.id ? 'text-warn' : 'text-faint hover:text-warn')}
        aria-label={defaultId === v.id ? `Clear ${v.name} as my default` : `Make ${v.name} my default`}
        title={defaultId === v.id ? 'My default - click to clear' : 'Make this my default'}
      >
        <Star size={13} fill={defaultId === v.id ? 'currentColor' : 'none'} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight">Daily report <ItsmTag practice={'reporting'} /></h2>
        <p className="text-sm text-muted">Tickets created in the date range (IST), in the 36-column order of the daily report template. Filter on any column, choose the columns, and save the setup as a variant. Includes requesters&apos; phone numbers and emails - supervisors and admins only.</p>
      </div>

      <Card title="Report setup" actions={<FileSpreadsheet size={16} className="text-accent" />} className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu" className={cx('max-w-[18rem]', applied && 'text-accent')}>
              {variantsBusy ? <Spinner /> : <Bookmark size={14} />}
              <span className="truncate">{appliedVariant ? appliedVariant.name : 'Variant'}</span>
              {appliedVariant && defaultId === appliedVariant.id && <Star size={12} className="shrink-0 text-warn" fill="currentColor" aria-label="my default" />}
              {dirty && <span className="h-2 w-2 shrink-0 rounded-full bg-warn" title="Unsaved changes" aria-label="unsaved changes" />}
              <ChevronDown size={14} className="shrink-0" />
            </Button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div role="menu" className="absolute left-0 z-30 mt-1 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                  <button type="button" onClick={standard} className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken', !applied && 'text-accent')}>
                    <RotateCcw size={13} /> Standard (today, all columns, no filters)
                  </button>
                  <div className="my-1.5 border-t border-line px-2.5 pt-2 text-2xs font-bold uppercase tracking-wide text-faint">My variants</div>
                  {mine.length === 0 && <p className="px-2.5 pb-1.5 text-2xs text-muted">None yet - set the range, columns and filters, then &quot;Save as new variant&quot;.</p>}
                  {mine.map(variantRow)}
                  {others.length > 0 && <div className="my-1.5 border-t border-line px-2.5 pt-2 text-2xs font-bold uppercase tracking-wide text-faint">Shared with everyone</div>}
                  {others.map(variantRow)}
                  <div className="my-1.5 border-t border-line" />
                  <button type="button" onClick={() => { setMenuOpen(false); setDialog('save'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken">
                    <BookmarkPlus size={13} /> Save as new variant…
                  </button>
                  {appliedVariant && canEdit(appliedVariant) && (
                    <button type="button" onClick={() => void overwrite()} disabled={busy} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken disabled:opacity-50">
                      <Save size={13} /> <span className="truncate">Save &quot;{appliedVariant.name}&quot;{dirty ? '' : ' (no changes)'}</span>
                    </button>
                  )}
                  {appliedVariant && (
                    <button type="button" onClick={() => void setDefault(defaultId === appliedVariant.id ? null : appliedVariant.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-sunken">
                      {defaultId === appliedVariant.id ? <><StarOff size={13} /> Clear my default</> : <><Star size={13} /> Set as my default</>}
                    </button>
                  )}
                  {appliedVariant && canEdit(appliedVariant) && (
                    <button type="button" onClick={() => { setMenuOpen(false); setDialog('delete'); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-bad hover:bg-bad/10">
                      <Trash2 size={13} /> <span className="truncate">Delete &quot;{appliedVariant.name}&quot;…</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <Button onClick={() => setDialog('columns')} disabled={!report} title={report ? 'Choose and order the columns' : 'Load tickets first to choose columns'}>
            <Columns3 size={14} /> Columns{report && <span className="num rounded-md bg-sunken px-1.5 text-2xs text-muted">{shownCols.length}/{report.columns.length}</span>}
          </Button>
          {dirty && <span className="text-2xs font-semibold text-warn">Unsaved changes to this variant</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Button key={r.id} size="sm" variant={range === r.id ? 'primary' : 'secondary'} aria-pressed={range === r.id} onClick={() => pickRange(r.id)}>{r.label}</Button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="From"><input type="date" className={inputCls} value={from} max={to} onChange={(e) => { setFrom(e.target.value); setRange('custom'); }} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={to} min={from} onChange={(e) => { setTo(e.target.value); setRange('custom'); }} /></Field>
        </div>
        {msg && <div className="mt-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void load(from, to)} disabled={busy || !from || !to || from > to}>
            {busy ? <Spinner /> : <RefreshCw size={14} />} {report ? 'Reload' : 'Load tickets'}
          </Button>
          {report && (
            <Button onClick={download} disabled={busy || rows.length === 0 || !!stale} title={stale ? 'The dates changed - reload first' : undefined}>
              <Download size={14} /> Download {fmtNum(rows.length)} as .xlsx
            </Button>
          )}
        </div>
        {stale && <p className="mt-2 text-2xs text-warn">The dates changed since the tickets were loaded. Reload to download this range.</p>}
        {!report && busy && <p className="mt-2 text-2xs text-muted">Loading tickets…</p>}
      </Card>

      {report && (
        <Card
          title={<span className="inline-flex items-center gap-2"><Filter size={15} className="text-accent" /> Filters on all {report.columns.length} fields</span>}
          sub={`${fmtNum(rows.length)} of ${fmtNum(report.rows.length)} tickets match`}
          actions={
            <div className="flex items-center gap-2">
              {active > 0 && <button type="button" onClick={() => setFilters({})} className="inline-flex items-center gap-1 text-2xs font-bold text-accent hover:underline"><X size={12} /> Clear {active}</button>}
              <Button size="sm" onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>{showFilters ? 'Hide' : 'Show'} filters</Button>
            </div>
          }
        >
          {showFilters && (
            <>
              <p className="mb-3 text-2xs text-muted">Pick any number of values in a field (any of them matches); every field you set must match. &quot;contains&quot; searches the text.</p>
              <div className="grid gap-x-2 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {report.columns.map((col) => {
                  const c = choices.get(col) ?? { options: [], total: 0 };
                  const picked = filters[col]?.values ?? [];
                  // Keep picked values selectable even when outside the capped list or this range.
                  const extra = picked.filter((v) => !c.options.includes(v));
                  const options = [...c.options, ...extra].map((v) => ({ value: v, label: v }));
                  const contains = filters[col]?.contains ?? '';
                  return (
                    <div key={col} className={cx('min-w-0 space-y-1', !shownCols.includes(col) && 'opacity-70')}>
                      <MultiSelect label={col} values={picked} onChange={(v) => setColFilter(col, { values: v })} options={options} />
                      <input
                        value={contains}
                        onChange={(e) => setColFilter(col, { contains: e.target.value })}
                        placeholder="contains…"
                        aria-label={`${col} contains`}
                        className={cx(inputCls, 'h-7 text-xs', contains.trim() && 'border-accent/50')}
                      />
                      {c.total > OPTIONS_MAX && <p className="text-[10px] text-faint">Showing {OPTIONS_MAX} of {fmtNum(c.total)} values (most frequent) - type to find, or use contains.</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {report && (
        <Card title="Preview" sub={rows.length > PREVIEW_ROWS ? `First ${PREVIEW_ROWS} of ${fmtNum(rows.length)} - the download has them all` : undefined} bodyClass="p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-muted">{report.rows.length ? 'No ticket matches these filters.' : 'No tickets were created in this date range.'}</p>
          ) : (
            <div className="scroll-thin max-h-[480px] overflow-auto">
              <table className="min-w-max text-left text-xs">
                <thead className="sticky top-0 z-10 bg-sunken">
                  <tr>{shownCols.map((c) => <th key={c} className="whitespace-nowrap border-b border-line px-2.5 py-2 text-2xs font-bold uppercase tracking-wide text-muted">{c}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.slice(0, PREVIEW_ROWS).map((r, ri) => (
                    <tr key={ri} className="hover:bg-sunken/60">
                      {shownCols.map((c) => {
                        const v = text(r[colIndex.get(c) ?? -1]);
                        return <td key={c} className="max-w-[260px] truncate px-2.5 py-1.5" title={v}>{v}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <SaveVariantDialog
        open={dialog === 'save'}
        onClose={() => setDialog(null)}
        canShare={isSupervisor}
        config={currentConfig}
        onSaved={async (id, name, makeDefault) => {
          setDialog(null);
          try {
            await refreshVariants();
            setApplied({ id, key: configKey(currentConfig) });
            if (makeDefault) await setDefault(id);
            else setMsg({ tone: 'good', text: `Variant "${name}" saved.` });
          } catch (e) {
            setMsg({ tone: 'bad', text: errText(e, 'The variant was saved, but the list could not be refreshed.') });
          }
        }}
      />

      <Modal open={dialog === 'delete'} onClose={() => setDialog(null)} title="Delete variant">
        <div className="space-y-4">
          <p className="text-sm">Delete the variant <b>{appliedVariant?.name}</b>{appliedVariant?.shared ? ' - it is shared, so it goes for everyone' : ''}? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? <Spinner /> : <Trash2 size={14} />} Delete</Button>
          </div>
        </div>
      </Modal>

      {report && (
        <ColumnsDialog
          open={dialog === 'columns'}
          onClose={() => setDialog(null)}
          all={report.columns}
          selected={shownCols}
          onApply={(next) => {
            setDialog(null);
            setCols(next.length === baseCols.length && next.every((c, i) => c === baseCols[i]) ? null : next);
          }}
        />
      )}
    </div>
  );
}

function SaveVariantDialog({ open, onClose, canShare, config, onSaved }: {
  open: boolean;
  onClose: () => void;
  canShare: boolean;
  config: ReportVariantConfig;
  onSaved: (id: number, name: string, makeDefault: boolean) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(''); setShared(false); setMakeDefault(false); setError(''); } }, [open]);
  const save = async () => {
    setBusy(true);
    try {
      const id = await saveVariant({ kind: 'report', name: name.trim(), shared: canShare && shared, config });
      await onSaved(id, name.trim(), makeDefault);
    } catch (e) {
      setError(errText(e, 'Could not save the variant.'));
    } finally {
      setBusy(false);
    }
  };
  const label = RANGES.find((r) => r.id === config.range)?.label ?? config.range;
  const nFilters = Object.keys(config.filters).length;
  return (
    <Modal open={open} onClose={onClose} title="Save as new variant">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Saves the date range ({label}{config.range === 'custom' ? `: ${config.from} to ${config.to}` : ', always relative to the day you open it'}),
          {' '}{config.columns.length ? `${config.columns.length} chosen columns` : 'all columns'} and {nFilters} filtered field{nFilters === 1 ? '' : 's'}.
        </p>
        <Field label="Name" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && !busy) void save(); }} maxLength={80} className={inputCls} placeholder="e.g. Kolkata depot - open sync issues" /></Field>
        {canShare && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with everyone</label>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make this my default (applied and loaded when I open the report)</label>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={() => void save()}>{busy ? <Spinner /> : <BookmarkPlus size={14} />} Save variant</Button></div>
      </div>
    </Modal>
  );
}

function ColumnsDialog({ open, onClose, all, selected, onApply }: { open: boolean; onClose: () => void; all: string[]; selected: string[]; onApply: (cols: string[]) => void }) {
  const [draft, setDraft] = useState<{ name: string; on: boolean }[]>([]);
  const [find, setFind] = useState('');
  // Chosen columns in their order first, then the rest in template order.
  useEffect(() => {
    if (!open) return;
    const on = new Set(selected);
    setDraft([...selected.map((name) => ({ name, on: true })), ...all.filter((c) => !on.has(c)).map((name) => ({ name, on: false }))]);
    setFind('');
  }, [open, all, selected]);
  const move = (i: number, d: -1 | 1) => setDraft((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const count = draft.filter((d) => d.on).length;
  const q = find.trim().toLowerCase();
  return (
    <Modal open={open} onClose={onClose} title="Columns" width={560}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setDraft((l) => l.map((d) => ({ ...d, on: true })))}>Select all</Button>
          <Button size="sm" onClick={() => setDraft((l) => l.map((d) => ({ ...d, on: false })))}>Clear</Button>
          <Button size="sm" onClick={() => setDraft(all.map((name) => ({ name, on: true })))}><RotateCcw size={13} /> Reset to template order</Button>
          <span className="ml-auto text-2xs text-muted">{count} of {all.length} selected</span>
        </div>
        <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a column…" aria-label="Find a column" className={cx(inputCls, 'h-8 text-xs')} />
        <ul className="divide-y divide-line rounded-xl border border-line">
          {draft.map((d, i) => (q && !d.name.toLowerCase().includes(q) ? null : (
            <li key={d.name} className="flex items-center gap-2 px-2.5 py-1.5">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
                <input type="checkbox" checked={d.on} onChange={(e) => setDraft((l) => l.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} />
                <span className={cx('truncate', !d.on && 'text-muted')}>{d.name}</span>
              </label>
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0 || !!q} aria-label={`Move ${d.name} up`}><ArrowUp size={13} /></Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === draft.length - 1 || !!q} aria-label={`Move ${d.name} down`}><ArrowDown size={13} /></Button>
            </li>
          )))}
        </ul>
        {count === 0 && <p className="text-2xs text-warn">Pick at least one column.</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={count === 0} onClick={() => onApply(draft.filter((d) => d.on).map((d) => d.name))}>Apply</Button>
        </div>
      </div>
    </Modal>
  );
}
