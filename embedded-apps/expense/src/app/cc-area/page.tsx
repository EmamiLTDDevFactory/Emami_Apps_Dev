'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Info, Plus, Power, PowerOff, RefreshCw, Save, Search, ShieldAlert, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { CcAreaRow } from '../../types';
import { Banner, Button, Card, Checkbox, cx, DateField, EmptyState, Field, Input, LoadingBlock, PageHeader, Select } from '../../components/ui';

// SM30-style flat maintenance grid for CcAreaSet, live on dev 2026-11-26 - same pattern as
// /mob-cap and /doa-chain. One row = one cost centre's sales-channel area; Mobile Expense Cap
// Maintenance now reads this instead of taking a cost centre directly on its own rows.

type GridRow = CcAreaRow & {
  _cid: string;
  _isNew: boolean;
  _dirty: boolean;
  _rowError: string | null;
  _saving: boolean;
};

const AREA_OPTIONS = [
  { value: 'NS', label: 'NS — Non Sales' },
  { value: 'CCD', label: 'CCD — Sales CCD' },
  { value: 'HCD', label: 'HCD — Sales HCD' },
];
const AREA_FILTER_OPTIONS = [{ value: '', label: 'All areas' }, ...AREA_OPTIONS];

const PAGE_SIZE = 20;

const todayIso = () => new Date().toISOString().split('T')[0];
const FAR_FUTURE = '9999-12-31';
const newCid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid-${Math.random().toString(36).slice(2)}-${Date.now()}`);

// CcAreaSet's ValidFrom/ValidTo come back as SAP's /Date(ms)/ literal (confirmed the same gotcha
// as MobCapSet/DoaChainSet) - parse to a plain 'YYYY-MM-DD' for the date inputs; ClaimContext's
// write side converts back on save.
const parseODataDateToIso = (value: any): string => {
  if (!value) return '';
  const str = String(value);
  const m = str.match(/\/Date\((\d+)\)\//);
  const ms = m ? parseInt(m[1], 10) : new Date(str).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toISOString().split('T')[0];
};

const blankRow = (kostl: string): GridRow => ({
  Kostl: kostl || '',
  Area: 'NS',
  Active: true,
  ValidFrom: todayIso(),
  ValidTo: FAR_FUTURE,
  _cid: newCid(),
  _isNew: true,
  _dirty: false,
  _rowError: null,
  _saving: false,
});

function validateRow(row: GridRow): string | null {
  if (!row.Kostl.trim()) return 'Cost centre is mandatory';
  if (row.Area !== 'NS' && row.Area !== 'CCD' && row.Area !== 'HCD') return 'Area must be NS, CCD or HCD';
  if (row.ValidTo && row.ValidFrom && row.ValidTo < row.ValidFrom) return 'Valid To cannot be before Valid From';
  return null;
}

export default function CcAreaPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { fetchCcAreas, createCcAreaRow, updateCcAreaRow } = useClaim();

  const [areaFilter, setAreaFilter] = useState('');
  const [kostlFilter, setKostlFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [rows, setRows] = useState<GridRow[]>([]);
  const originalsRef = useRef<Record<string, CcAreaRow>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const loadedRows = await fetchCcAreas({
        area: areaFilter || undefined,
        kostl: kostlFilter.trim() || undefined,
      });
      // Active must always be an explicit boolean on save, never missing - coerce right on load.
      // ValidFrom/ValidTo arrive as SAP's /Date(ms)/ literal - normalize to plain 'YYYY-MM-DD' for
      // the date inputs.
      const gridRows: GridRow[] = loadedRows.map((r) => ({
        ...r,
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
      // Shown verbatim - the backend's own business-error messages should reach the admin
      // unmodified.
      setLoadError(err?.message || 'Failed to fetch cost centre areas');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (cid: string, patch: Partial<CcAreaRow>) => {
    setRows((prev) => prev.map((r) => (r._cid === cid ? { ...r, ...patch, _dirty: r._isNew ? r._dirty : true, _rowError: null } : r)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, blankRow(kostlFilter)]);
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
    const errorByCid = new Map(toSave.map((r) => [r._cid, validateRow(r)]));
    const hasError = Array.from(errorByCid.values()).some(Boolean);
    setRows((prev) => prev.map((r) => (errorByCid.has(r._cid) ? { ...r, _rowError: errorByCid.get(r._cid) || null } : r)));
    if (hasError) return;

    setSavingAll(true);
    for (const row of toSave) {
      setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _saving: true } : r)));
      try {
        // Audit fields are backend-set and read-only - never sent on create/update. Aenam is the
        // one exception (handled by createCcAreaRow/updateCcAreaRow themselves).
        const { _cid, _isNew, _dirty, _rowError, _saving, Ernam, Erdat, Erzet, Aedat, Aezet, ...plain } = row;
        const saved = row._isNew
          ? await createCcAreaRow(plain, adminPernr)
          : await updateCcAreaRow(plain, adminPernr);
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? {
          ...r,
          ...(saved as CcAreaRow),
          ValidFrom: parseODataDateToIso((saved as any).ValidFrom) || r.ValidFrom,
          ValidTo: parseODataDateToIso((saved as any).ValidTo) || r.ValidTo,
          _isNew: false,
          _dirty: false,
          _rowError: null,
          _saving: false,
        } : r)));
      } catch (err: any) {
        // Shown verbatim - the backend's own business-error table (e.g. "Cost centre X does not
        // exist", "This cost centre is already maintained - change it with an update") should
        // reach the admin unmodified.
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _rowError: err?.message || 'Failed to save row', _saving: false } : r)));
      }
    }
    setSavingAll(false);
    // Always re-fetch after saving, so the grid shows what's really in SAP.
    await handleLoad();
  };

  // Blank workbook with just the header row Import CSV/Excel actually reads - fill it in a normal
  // spreadsheet app and re-upload, same pattern as the DOA Chain screen's template.
  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const headers = ['Cost Centre', 'Area'];
    const sheet = XLSX.utils.aoa_to_sheet([headers]);
    sheet['!cols'] = headers.map(() => ({ wch: 16 }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Cost Centre Area');
    XLSX.writeFile(workbook, 'cc_area_import_template.xlsx');
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const workbook = XLSX.read(buf, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (parsed.length === 0) { setImportError('No rows found in the file.'); return; }

      const imported: GridRow[] = parsed.map((line) => {
        const kostl = String(line['Cost Centre'] || line['Kostl'] || '').trim().toUpperCase();
        const areaRaw = String(line['Area'] || 'NS').trim().toUpperCase();
        const area = (['NS', 'CCD', 'HCD'].includes(areaRaw) ? areaRaw : 'NS') as 'NS' | 'CCD' | 'HCD';
        const row = blankRow(kostl);
        return { ...row, Area: area };
      });
      setRows((prev) => [...prev, ...imported]);
      setLoaded(true);
    } catch (err: any) {
      setImportError(err?.message || 'Could not read this file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      list = list.filter((r) => r.Kostl.toLowerCase().includes(q) || r.Area.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.Kostl.localeCompare(b.Kostl));
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
        title="Cost Centre Area Maintenance"
        subtitle="Maps each cost centre to its sales channel area - Mobile Expense Cap Maintenance reads this instead of a cost centre on its own rows."
        icon={ShieldAlert}
      />

      <Banner type="info">
        NS (Non Sales) cost centres have no mobile sales caps of their own; CCD and HCD map to the Sales CCD / Sales HCD categories in Mobile Expense Cap Maintenance.
      </Banner>

      <Card className="my-3">
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
          <Field label="Area">
            <Select value={areaFilter} onChange={setAreaFilter} options={AREA_FILTER_OPTIONS} />
          </Field>
          <Field label="Cost Centre" hint="Blank = all">
            <Input
              value={kostlFilter}
              onChange={(e) => setKostlFilter(e.target.value.toUpperCase())}
              placeholder="e.g. CORP16"
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(); }}
            />
          </Field>
          <Field label=" ">
            <Button variant="primary" icon={RefreshCw} loading={loading} onClick={handleLoad} className="w-full">
              Load
            </Button>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Search" hint="Filters whatever's already loaded - cost centre or area">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search loaded rows…" className="pl-8" />
            </div>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Checkbox checked={showInactive} onChange={setShowInactive} label="Show inactive rows" />
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
          <Button variant="secondary" size="sm" icon={Download} onClick={handleDownloadTemplate}>
            Download Template
          </Button>
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Import CSV/Excel
          </Button>
        </div>
        {importError && <div className="mt-2"><Banner type="error" onClose={() => setImportError(null)}>{importError}</Banner></div>}
        <p className="mt-2 text-2xs text-inkFaint">
          Import columns: Cost Centre, Area. Imported rows land in the grid for review — nothing is sent to SAP until you click Save.
        </p>
      </Card>

      {loadError && <Banner type="error" onClose={() => setLoadError(null)}>{loadError}</Banner>}

      {loading && <LoadingBlock label="Loading cost centre areas…" />}

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
                    <th className="sticky top-0 z-10 w-[20%] border-b border-border bg-appBg p-1.5">Cost Centre</th>
                    <th className="sticky top-0 z-10 w-[20%] border-b border-border bg-appBg p-1.5">Area</th>
                    <th className="sticky top-0 z-10 w-[10%] border-b border-border bg-appBg p-1.5">Active</th>
                    <th className="sticky top-0 z-10 w-[20%] border-b border-border bg-appBg p-1.5">Validity</th>
                    <th className="sticky top-0 z-10 w-[10%] border-b border-border bg-appBg p-1.5">Audit</th>
                    <th className="sticky top-0 z-10 w-[20%] border-b border-border bg-appBg p-1.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => {
                    const isKeyLocked = !row._isNew;
                    return (
                      <tr key={row._cid} className={row._isNew || row._dirty ? 'bg-amberBg/40' : 'border-b border-line'}>
                        <td className="p-1 align-top">
                          {row._isNew ? (
                            <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} className={cellInputClass} />
                          ) : row.Kostl}
                        </td>
                        <td className="p-1 align-top">
                          <Select
                            value={row.Area}
                            onChange={(v) => updateField(row._cid, { Area: v as 'NS' | 'CCD' | 'HCD' })}
                            options={AREA_OPTIONS}
                            className="!h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs"
                          />
                        </td>
                        <td className="p-1 align-top">
                          <Checkbox checked={row.Active} onChange={() => handleToggleActive(row._cid)} />
                        </td>
                        <td className="p-1 align-top">
                          <DateField label="Valid From" value={row.ValidFrom} onChange={(v) => updateField(row._cid, { ValidFrom: v })} className={`${cellInputClass} mb-0.5`} />
                          <DateField label="Valid To" value={row.ValidTo} onChange={(v) => updateField(row._cid, { ValidTo: v })} className={cellInputClass} />
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
                    <Field label="Cost Centre">
                      {row._isNew ? (
                        <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} />
                      ) : <p className="text-sm font-semibold text-ink">{row.Kostl}</p>}
                    </Field>
                    <Field label="Area">
                      <Select
                        value={row.Area}
                        onChange={(v) => updateField(row._cid, { Area: v as 'NS' | 'CCD' | 'HCD' })}
                        options={AREA_OPTIONS}
                      />
                    </Field>
                  </div>
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
