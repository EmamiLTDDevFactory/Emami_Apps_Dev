'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Info, Plus, Power, PowerOff, RefreshCw, Save, Search, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { MobCapRow } from '../../types';
import { Banner, Button, Card, Checkbox, cx, DateField, EmptyState, Field, Input, LoadingBlock, PageHeader, Select } from '../../components/ui';

// SM30-style flat maintenance grid for ZEXP_MOB_CAP (MobCapSet) - same pattern as the DOA Chain
// screen. One row = one monthly mobile-expense cap for a category + grade + level (and cost
// centre, for sales categories); admins edit the whole table in place and save all changes
// together.

type GridRow = MobCapRow & {
  _cid: string;
  _isNew: boolean;
  _dirty: boolean;
  _rowError: string | null;
  _saving: boolean;
};

const MCAT_OPTIONS = [
  { value: 'NS', label: 'NS — Non-sales' },
  { value: 'SC', label: 'SC — Sales CCD' },
  { value: 'SH', label: 'SH — Sales HCD' },
  { value: 'SM', label: 'SM — Sales MT' },
  { value: 'SE', label: 'SE — Sales Ecom' },
  { value: 'SG', label: 'SG — Sales GT' },
];
const MCAT_FILTER_OPTIONS = [{ value: '', label: 'All categories' }, ...MCAT_OPTIONS];

const TRFGR_OPTIONS = ['E1', 'E2', 'M1', 'M2', 'M3', 'M4', 'M5'].map((v) => ({ value: v, label: v }));

const TRFST_OPTIONS = [
  { value: '', label: 'Any level' },
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
];

const PAGE_SIZE = 20;

const todayIso = () => new Date().toISOString().split('T')[0];
const FAR_FUTURE = '9999-12-31';
const newCid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid-${Math.random().toString(36).slice(2)}-${Date.now()}`);

// MobCapSet's ValidFrom/ValidTo come back as SAP's /Date(ms)/ literal, unlike DoaChainSet - parse
// to a plain 'YYYY-MM-DD' for the date inputs; ClaimContext's write side converts back on save.
const parseODataDateToIso = (value: any): string => {
  if (!value) return '';
  const str = String(value);
  const m = str.match(/\/Date\((\d+)\)\//);
  const ms = m ? parseInt(m[1], 10) : new Date(str).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toISOString().split('T')[0];
};

const blankRow = (mcat: string, kostl: string): GridRow => ({
  Mcat: mcat || 'NS',
  Kostl: (mcat || 'NS') === 'NS' ? '' : (kostl || ''),
  Trfgr: 'E1',
  Trfst: '',
  MaxAmt: 0,
  NoCap: false,
  Active: true,
  ValidFrom: todayIso(),
  ValidTo: FAR_FUTURE,
  Remark: '',
  _cid: newCid(),
  _isNew: true,
  _dirty: false,
  _rowError: null,
  _saving: false,
});

function validateRow(row: GridRow): string | null {
  if (!row.Mcat) return 'Category is mandatory';
  if (!row.Trfgr) return 'Grade is mandatory';
  if (row.Trfst !== '' && row.Trfst !== 'A' && row.Trfst !== 'B') return 'Level must be A, B, or blank (any level)';
  if (row.Mcat === 'NS' && row.Kostl.trim()) return 'NS (non-sales) must not have a cost centre';
  if (row.Mcat !== 'NS' && !row.Kostl.trim()) return 'Cost centre is mandatory for a sales category';
  if (row.ValidTo && row.ValidFrom && row.ValidTo < row.ValidFrom) return 'Valid To cannot be before Valid From';
  if (!row.NoCap && !(row.MaxAmt > 0)) return 'Enter an amount or tick On Actuals';
  return null;
}

export default function MobCapPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { fetchMobCaps, createMobCapRow, updateMobCapRow } = useClaim();

  const [mcatFilter, setMcatFilter] = useState('');
  const [kostlFilter, setKostlFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [rows, setRows] = useState<GridRow[]>([]);
  const originalsRef = useRef<Record<string, MobCapRow>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);

  if (!currentUser?.isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Access restricted"
        hint="This page is only available to admins listed in SAP's ZEXP_ADMIN variable."
      />
    );
  }

  const adminPernr = currentUser.employeeId;

  const handleLoad = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const loadedRows = await fetchMobCaps({
        mcat: mcatFilter || undefined,
        kostl: kostlFilter.trim() || undefined,
      });
      // NoCap/Active must always be explicit booleans on save, never missing. ValidFrom/ValidTo
      // arrive as SAP's /Date(ms)/ literal - normalize to plain 'YYYY-MM-DD' for the date inputs.
      const gridRows: GridRow[] = loadedRows.map((r) => ({
        ...r,
        NoCap: !!r.NoCap,
        Active: !!r.Active,
        ValidFrom: parseODataDateToIso(r.ValidFrom) || todayIso(),
        ValidTo: parseODataDateToIso(r.ValidTo) || FAR_FUTURE,
        _cid: newCid(),
        _isNew: false,
        _dirty: false,
        _rowError: null,
        _saving: false,
      }));
      originalsRef.current = Object.fromEntries(gridRows.map((r) => [r._cid, { ...r }]));
      setRows(gridRows);
      setLoaded(true);
      setPage(1);
    } catch (err: any) {
      // Shown verbatim - the backend's own business-error messages (category/grade/cost-centre
      // rules) should reach the admin unmodified.
      setLoadError(err?.message || 'Failed to fetch mobile caps');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (cid: string, patch: Partial<MobCapRow>) => {
    setRows((prev) => prev.map((r) => (r._cid === cid ? { ...r, ...patch, _dirty: r._isNew ? r._dirty : true, _rowError: null } : r)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, blankRow(mcatFilter, kostlFilter)]);
  };

  // No real delete - Deactivate sets Active=false + ValidTo=today, Reactivate the opposite. Both
  // are local, staged changes included in the next Save, not immediate API calls.
  const handleToggleActive = (cid: string) => {
    setRows((prev) => prev.map((r) => {
      if (r._cid !== cid) return r;
      const willBeActive = !r.Active;
      return {
        ...r,
        Active: willBeActive,
        ValidTo: willBeActive ? (r.ValidTo && r.ValidTo > todayIso() ? r.ValidTo : FAR_FUTURE) : todayIso(),
        _dirty: r._isNew ? r._dirty : true,
      };
    }));
  };

  const handleDiscardAll = () => {
    setRows((prev) => prev
      .filter((r) => !r._isNew)
      .map((r) => {
        if (!r._dirty) return r;
        const original = originalsRef.current[r._cid];
        return original ? { ...original, _cid: r._cid, _isNew: false, _dirty: false, _rowError: null, _saving: false } : r;
      }));
  };

  const handleSaveAll = async () => {
    const toSave = rows.filter((r) => r._isNew || r._dirty);
    if (toSave.length === 0) return;

    // Validate every row being saved first - no network call at all if anything fails locally.
    // Computed on the plain `toSave` array, not inside the setRows updater: React doesn't run a
    // state updater synchronously at the call site, so mutating `hasError` in there and checking
    // it right after was a no-op - every row (valid or not) was reaching the SAP POST/PUT call.
    const errorByCid = new Map(toSave.map((r) => [r._cid, validateRow(r)]));
    const hasError = Array.from(errorByCid.values()).some(Boolean);
    setRows((prev) => prev.map((r) => (errorByCid.has(r._cid) ? { ...r, _rowError: errorByCid.get(r._cid) || null } : r)));
    if (hasError) return;

    setSavingAll(true);
    for (const row of toSave) {
      setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _saving: true } : r)));
      try {
        // Audit fields are backend-set and read-only - never sent on create/update. Aenam is the
        // one exception (handled by createMobCapRow/updateMobCapRow themselves).
        const { _cid, _isNew, _dirty, _rowError, _saving, Ernam, Erdat, Erzet, Aedat, Aezet, ...plain } = row;
        const saved = row._isNew
          ? await createMobCapRow(plain, adminPernr)
          : await updateMobCapRow(plain, adminPernr);
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? {
          ...r,
          ...(saved as MobCapRow),
          ValidFrom: parseODataDateToIso((saved as any).ValidFrom) || r.ValidFrom,
          ValidTo: parseODataDateToIso((saved as any).ValidTo) || r.ValidTo,
          _isNew: false,
          _dirty: false,
          _rowError: null,
          _saving: false,
        } : r)));
      } catch (err: any) {
        // Shown verbatim - the backend's own business-error table (e.g. "cost centre already used
        // for another category") should reach the admin unmodified.
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _rowError: err?.message || 'Failed to save row', _saving: false } : r)));
      }
    }
    setSavingAll(false);
    // Always re-fetch after saving, so the grid shows what's really in SAP.
    await handleLoad();
  };

  const dirtyCount = useMemo(() => rows.filter((r) => r._isNew || r._dirty).length, [rows]);

  const visibleRows = useMemo(() => {
    let list = rows;
    // A row you just unticked Active on (but haven't saved yet) must stay visible - otherwise
    // unticking it instantly hides it before Save even runs, which looks like the click did
    // nothing. It only actually drops out of the default view once a reload confirms it's saved.
    if (!showInactive) list = list.filter((r) => r.Active || r._isNew || r._dirty);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((r) =>
        r.Kostl.toLowerCase().includes(q) ||
        r.Trfgr.toLowerCase().includes(q) ||
        r.Mcat.toLowerCase().includes(q) ||
        r.Remark.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      a.Mcat.localeCompare(b.Mcat) ||
      a.Kostl.localeCompare(b.Kostl) ||
      a.Trfgr.localeCompare(b.Trfgr) ||
      a.Trfst.localeCompare(b.Trfst));
  }, [rows, showInactive, searchText]);

  // Unsaved/new rows always render in full on every page, regardless of which page you're on -
  // only already-saved, untouched rows get paginated.
  const unsavedRows = useMemo(() => visibleRows.filter((r) => r._isNew || r._dirty), [visibleRows]);
  const savedRows = useMemo(() => visibleRows.filter((r) => !(r._isNew || r._dirty)), [visibleRows]);
  const totalPages = Math.max(1, Math.ceil(savedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedSavedRows = useMemo(
    () => savedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [savedRows, currentPage]
  );
  const pagedRows = useMemo(() => [...unsavedRows, ...pagedSavedRows], [unsavedRows, pagedSavedRows]);

  const resetPageOnChange = `${showInactive}|${searchText}|${rows.length}`;
  React.useEffect(() => { setPage(1); }, [resetPageOnChange]);

  const cellInputClass = 'input !h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs';

  return (
    <div>
      <button
        type="button"
        onClick={() => router.push('/admin/')}
        className="mb-2 flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
      >
        <ArrowLeft size={14} /> Back to Admin
      </button>

      <PageHeader
        eyebrow="Admin"
        title="Mobile Expense Cap Maintenance"
        icon={ShieldAlert}
      />

      <Banner type="info">
        Caps are checked by category and the employee's grade/level - NS (non-sales) rows have no cost centre; every sales category needs one.
      </Banner>

      <Card className="my-3">
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
          <Field label="Category">
            <Select value={mcatFilter} onChange={setMcatFilter} options={MCAT_FILTER_OPTIONS} />
          </Field>
          <Field label="Cost Centre" hint="Blank = all">
            <Input
              value={kostlFilter}
              onChange={(e) => setKostlFilter(e.target.value.toUpperCase())}
              placeholder="e.g. CORP10"
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(); }}
            />
          </Field>
          <Field label=" ">
            <Button variant="primary" icon={RefreshCw} loading={loading} onClick={handleLoad} className="w-full">
              Load
            </Button>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Search" hint="Filters whatever's already loaded - category, cost centre, grade or remark">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search loaded rows…" className="pl-8" />
            </div>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Checkbox checked={showInactive} onChange={setShowInactive} label="Show inactive rows" />
        </div>
      </Card>

      {loadError && <Banner type="error" onClose={() => setLoadError(null)}>{loadError}</Banner>}

      {loading && <LoadingBlock label="Loading mobile caps…" />}

      {!loading && loaded && rows.length === 0 && (
        <EmptyState title="No rows loaded" hint="Add a row below, or confirm these filters have data in SAP." />
      )}

      {!loading && loaded && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={Plus} onClick={handleAddRow}>Add row</Button>
            </div>
            <div className="flex items-center gap-2">
              {dirtyCount > 0 && <span className="text-xs font-semibold text-amber">{dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}</span>}
              <Button variant="secondary" size="sm" icon={X} onClick={handleDiscardAll} disabled={dirtyCount === 0}>Discard</Button>
              <Button variant="primary" size="sm" icon={Save} loading={savingAll} onClick={handleSaveAll} disabled={dirtyCount === 0}>Save all</Button>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <EmptyState title="No rows match" hint="Try clearing Search or ticking Show inactive rows." />
          ) : (
          <>
          {/* Desktop/tablet: the full inline-edit grid. Below md, a dense multi-column table can't
              reflow without either shrinking columns unreadably thin or forcing horizontal scroll -
              the card list below is the mobile-friendly equivalent instead. */}
          <div className="hidden card !overflow-hidden !p-0 md:block">
            <div className="max-h-[65vh] overflow-y-auto">
              <table className="w-full table-fixed border-separate [border-spacing:0] text-2xs">
                <thead>
                  <tr className="text-left">
                    <th className="sticky top-0 z-10 w-[9%] border-b border-border bg-appBg p-1.5">Category</th>
                    <th className="sticky top-0 z-10 w-[10%] border-b border-border bg-appBg p-1.5">Cost Centre</th>
                    <th className="sticky top-0 z-10 w-[7%] border-b border-border bg-appBg p-1.5">Grade</th>
                    <th className="sticky top-0 z-10 w-[9%] border-b border-border bg-appBg p-1.5">Level</th>
                    <th className="sticky top-0 z-10 w-[10%] border-b border-border bg-appBg p-1.5">Max Amount</th>
                    <th className="sticky top-0 z-10 w-[8%] border-b border-border bg-appBg p-1.5">On Actuals</th>
                    <th className="sticky top-0 z-10 w-[6%] border-b border-border bg-appBg p-1.5">Active</th>
                    <th className="sticky top-0 z-10 w-[12%] border-b border-border bg-appBg p-1.5">Validity</th>
                    <th className="sticky top-0 z-10 w-[16%] border-b border-border bg-appBg p-1.5">Remark</th>
                    <th className="sticky top-0 z-10 w-[5%] border-b border-border bg-appBg p-1.5">Audit</th>
                    <th className="sticky top-0 z-10 w-[8%] border-b border-border bg-appBg p-1.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => {
                    const isKeyLocked = !row._isNew;
                    return (
                      <tr key={row._cid} className={row._isNew || row._dirty ? 'bg-amberBg/40' : 'border-b border-line'}>
                        <td className="p-1 align-top">
                          {row._isNew ? (
                            <Select
                              value={row.Mcat}
                              onChange={(v) => updateField(row._cid, { Mcat: v, Kostl: v === 'NS' ? '' : row.Kostl })}
                              options={MCAT_OPTIONS.map((o) => ({ value: o.value, label: o.value }))}
                              className="!h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs"
                            />
                          ) : row.Mcat}
                        </td>
                        <td className="p-1 align-top">
                          {row._isNew ? (
                            row.Mcat === 'NS' ? (
                              <span className="text-inkFaint">—</span>
                            ) : (
                              <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} className={cellInputClass} />
                            )
                          ) : (row.Kostl || '—')}
                        </td>
                        <td className="p-1 align-top">
                          {row._isNew ? (
                            <Select value={row.Trfgr} onChange={(v) => updateField(row._cid, { Trfgr: v })} options={TRFGR_OPTIONS} className="!h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs" />
                          ) : row.Trfgr}
                        </td>
                        <td className="p-1 align-top">
                          {row._isNew ? (
                            <Select value={row.Trfst} onChange={(v) => updateField(row._cid, { Trfst: v })} options={TRFST_OPTIONS} className="!h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs" />
                          ) : (row.Trfst || 'Any')}
                        </td>
                        <td className="p-1 align-top">
                          <Input
                            type="number"
                            value={row.MaxAmt || ''}
                            disabled={row.NoCap}
                            onChange={(e) => updateField(row._cid, { MaxAmt: parseFloat(e.target.value) || 0 })}
                            placeholder={row.NoCap ? 'On actuals' : ''}
                            className={cellInputClass}
                          />
                        </td>
                        <td className="p-1 align-top">
                          <Checkbox checked={row.NoCap} onChange={(v) => updateField(row._cid, { NoCap: v, MaxAmt: v ? 0 : row.MaxAmt })} />
                        </td>
                        <td className="p-1 align-top">
                          <Checkbox checked={row.Active} onChange={() => handleToggleActive(row._cid)} />
                        </td>
                        <td className="p-1 align-top">
                          <DateField label="Valid From" value={row.ValidFrom} onChange={(v) => updateField(row._cid, { ValidFrom: v })} className={`${cellInputClass} mb-0.5`} />
                          <DateField label="Valid To" value={row.ValidTo} onChange={(v) => updateField(row._cid, { ValidTo: v })} className={cellInputClass} />
                        </td>
                        <td className="p-1 align-top">
                          <Input value={row.Remark} onChange={(e) => updateField(row._cid, { Remark: e.target.value })} className={cellInputClass} title={row.Remark} />
                        </td>
                        <td className="p-1 align-top text-inkFaint" title={row.Aenam ? `${row.Aenam} · ${row.Aedat || ''}` : 'No audit yet'}>
                          {row.Aenam ? <Info size={14} /> : '—'}
                        </td>
                        <td className="p-1 align-top">
                          <div className="flex items-center gap-0.5">
                            <button type="button" title={row.Active ? 'Deactivate' : 'Reactivate'} onClick={() => handleToggleActive(row._cid)} className="rounded p-1 text-inkSoft hover:bg-appBg hover:text-ink">
                              {row.Active ? <PowerOff size={13} /> : <Power size={13} />}
                            </button>
                          </div>
                          {row._saving && <p className="mt-1 text-inkFaint">Saving…</p>}
                          {row._rowError && <p className="mt-1 font-semibold text-red">{row._rowError}</p>}
                          {isKeyLocked && <p className="mt-1 text-inkFaint">Locked</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: same rows, same handlers, just stacked as cards instead of table columns. */}
          <div className="flex flex-col gap-2 md:hidden">
            {pagedRows.map((row) => {
              const isKeyLocked = !row._isNew;
              return (
                <div key={row._cid} className={cx('card p-3', (row._isNew || row._dirty) && 'border-l-4 border-l-amber bg-amberBg/20')}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Category">
                      {row._isNew ? (
                        <Select
                          value={row.Mcat}
                          onChange={(v) => updateField(row._cid, { Mcat: v, Kostl: v === 'NS' ? '' : row.Kostl })}
                          options={MCAT_OPTIONS.map((o) => ({ value: o.value, label: o.value }))}
                        />
                      ) : <p className="text-sm font-semibold text-ink">{row.Mcat}</p>}
                    </Field>
                    <Field label="Cost Centre">
                      {row._isNew ? (
                        row.Mcat === 'NS' ? (
                          <p className="pt-2 text-sm text-inkFaint">—</p>
                        ) : (
                          <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} />
                        )
                      ) : <p className="text-sm font-semibold text-ink">{row.Kostl || '—'}</p>}
                    </Field>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Grade">
                      {row._isNew ? (
                        <Select value={row.Trfgr} onChange={(v) => updateField(row._cid, { Trfgr: v })} options={TRFGR_OPTIONS} />
                      ) : <p className="text-sm text-ink">{row.Trfgr}</p>}
                    </Field>
                    <Field label="Level">
                      {row._isNew ? (
                        <Select value={row.Trfst} onChange={(v) => updateField(row._cid, { Trfst: v })} options={TRFST_OPTIONS} />
                      ) : <p className="text-sm text-ink">{row.Trfst || 'Any'}</p>}
                    </Field>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="Max Amount">
                      <Input
                        type="number"
                        value={row.MaxAmt || ''}
                        disabled={row.NoCap}
                        onChange={(e) => updateField(row._cid, { MaxAmt: parseFloat(e.target.value) || 0 })}
                        placeholder={row.NoCap ? 'On actuals' : ''}
                      />
                    </Field>
                    <Field label="On Actuals">
                      <div className="pt-2"><Checkbox checked={row.NoCap} onChange={(v) => updateField(row._cid, { NoCap: v, MaxAmt: v ? 0 : row.MaxAmt })} /></div>
                    </Field>
                  </div>
                  <Field label="Remark" className="mt-2">
                    <Input value={row.Remark} onChange={(e) => updateField(row._cid, { Remark: e.target.value })} />
                  </Field>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <DateField label="Valid From" value={row.ValidFrom} onChange={(v) => updateField(row._cid, { ValidFrom: v })} />
                    <DateField label="Valid To" value={row.ValidTo} onChange={(v) => updateField(row._cid, { ValidTo: v })} />
                  </div>
                  <Field label="Active" className="mt-2">
                    <div className="pt-1"><Checkbox checked={row.Active} onChange={() => handleToggleActive(row._cid)} /></div>
                  </Field>
                  {row.Aenam && (
                    <p className="mt-2 flex items-center gap-1 text-2xs text-inkFaint"><Info size={12} /> Last updated by {row.Aenam}{row.Aedat ? ` · ${row.Aedat}` : ''}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
                    <Button size="sm" variant="secondary" icon={row.Active ? PowerOff : Power} onClick={() => handleToggleActive(row._cid)}>
                      {row.Active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    {isKeyLocked && <span className="text-2xs text-inkFaint">Locked</span>}
                  </div>
                  {row._saving && <p className="mt-1 text-2xs text-inkFaint">Saving…</p>}
                  {row._rowError && <p className="mt-1 text-2xs font-semibold text-red">{row._rowError}</p>}
                </div>
              );
            })}
          </div>
          </>
          )}

          {totalPages > 1 && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-inkSoft">
                Page {currentPage} of {totalPages} ({savedRows.length} saved row{savedRows.length === 1 ? '' : 's'}
                {unsavedRows.length > 0 ? `, +${unsavedRows.length} unsaved shown on every page` : ''})
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
                  Prev
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
