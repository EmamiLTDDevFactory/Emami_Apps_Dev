'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Info, Plus, Power, PowerOff, RefreshCw, Save, Search, ShieldAlert, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { DoaChainRow } from '../../types';
import { Banner, Button, Card, Checkbox, cx, DateField, EmptyState, Field, Input, LoadingBlock, MessageModal, type MessageModalState, PageHeader, Select } from '../../components/ui';

// SM30-style flat maintenance grid for ZEXP_DOA_CHAIN (DoaChainSet) - replaces the earlier
// slab-by-slab card editor per the rebuild spec. One row = one approver in one amount slab of one
// cost centre; admins edit the whole table in place and save all changes together.

type GridRow = DoaChainRow & {
  // Stable client-only identity, independent of the business composite key - AmtFrom/DoaCtype/
  // Kostl are all editable on a new row before save, so using the composite key as a React key
  // would remount (and lose focus in) the row on every keystroke.
  _cid: string;
  _isNew: boolean;
  _dirty: boolean;
  _rowError: string | null;
  _saving: boolean;
};

const DOA_CTYPE_OPTIONS = [
  { value: 'ADM', label: 'ADM — Other Administrative Expenses' },
  { value: 'MBN', label: 'MBN — Mobile (non-sales)' },
];
const DOA_CTYPE_FILTER_OPTIONS = [{ value: '', label: 'All types' }, ...DOA_CTYPE_OPTIONS];

const PAGE_SIZE = 20;

const todayIso = () => new Date().toISOString().split('T')[0];
const FAR_FUTURE = '9999-12-31';
const newCid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cid-${Math.random().toString(36).slice(2)}-${Date.now()}`);

const blankRow = (doaCtype: string, kostl: string): GridRow => ({
  DoaCtype: doaCtype || 'ADM',
  Kostl: kostl || '',
  Expgrp: '',
  AmtFrom: 0,
  Seqno: '01',
  AmtTo: 0,
  DeptTxt: '',
  ApprEmail: '',
  ApprRule: 'O',
  Active: true,
  ValidFrom: todayIso(),
  ValidTo: FAR_FUTURE,
  Hod: false,
  _cid: newCid(),
  _isNew: true,
  _dirty: false,
  _rowError: null,
  _saving: false,
});

function validateRow(row: GridRow): string | null {
  if (!row.DoaCtype) return 'Type is mandatory';
  if (!row.Kostl.trim()) return 'Cost centre is mandatory';
  if (row.AmtFrom < 0) return 'Amount From cannot be negative';
  if (row.AmtTo && row.AmtTo < row.AmtFrom) return 'Amount To must be greater than or equal to Amount From';
  if (row.ValidTo && row.ValidFrom && row.ValidTo < row.ValidFrom) return 'Valid To cannot be before Valid From';
  if (row.ApprRule !== 'O' && row.ApprRule !== 'A') return 'Approver rule must be O (any one) or A (all)';
  if (!row.ApprEmail.trim()) return 'Approver e-mail or PERNR is mandatory';
  if (row.Hod && row.DoaCtype !== 'MBN') return "HoD flag is only allowed for mobile non-sales rows (type MBN)";
  return null;
}

// Active slabs of the same type+cost centre must not overlap; rows sharing AmtFrom are parallel
// approvers in the same slab, not a conflict. Non-blocking (warn, don't block save).
function findOverlapWarnings(rows: GridRow[]): string[] {
  const warnings: string[] = [];
  const byTypeKostl = new Map<string, GridRow[]>();
  rows.filter((r) => r.Active).forEach((r) => {
    const key = `${r.DoaCtype}|${r.Kostl}`;
    const list = byTypeKostl.get(key) || [];
    list.push(r);
    byTypeKostl.set(key, list);
  });
  byTypeKostl.forEach((group, key) => {
    const slabFroms = Array.from(new Set(group.map((r) => r.AmtFrom))).sort((a, b) => a - b);
    for (let i = 0; i < slabFroms.length - 1; i++) {
      const curTo = group.find((r) => r.AmtFrom === slabFroms[i])?.AmtTo || 0;
      const nextFrom = slabFroms[i + 1];
      if (curTo && curTo >= nextFrom) {
        const [type, kostl] = key.split('|');
        warnings.push(`${type}/${kostl}: slab ${slabFroms[i]}–${curTo} overlaps ${nextFrom}`);
      }
    }
  });
  return warnings;
}

// Rows in the same slab must share the same AmtTo - the backend aligns them after save, so this
// is informational only (reload after save shows the real, aligned values).
function findAmtToMismatchWarnings(rows: GridRow[]): string[] {
  const warnings: string[] = [];
  const byKey = new Map<string, Set<number>>();
  rows.forEach((r) => {
    const key = `${r.DoaCtype}|${r.Kostl}|${r.AmtFrom}`;
    const set = byKey.get(key) || new Set<number>();
    set.add(r.AmtTo || 0);
    byKey.set(key, set);
  });
  byKey.forEach((amtTos, key) => {
    if (amtTos.size > 1) {
      const [type, kostl, amtFrom] = key.split('|');
      warnings.push(`${type}/${kostl} slab ${amtFrom}: mismatched Amount To (${Array.from(amtTos).join(', ')}) — backend will align these on save`);
    }
  });
  return warnings;
}

export default function DoaChainPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { fetchDoaChain, createDoaChainRow, updateDoaChainRow } = useClaim();

  const [doaCtypeFilter, setDoaCtypeFilter] = useState('');
  const [kostlFilter, setKostlFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [rows, setRows] = useState<GridRow[]>([]);
  const originalsRef = useRef<Record<string, DoaChainRow>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);

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
      const loadedRows = await fetchDoaChain({
        doaCtype: doaCtypeFilter || undefined,
        kostl: kostlFilter.trim() || undefined,
      });
      // Hod/Active must always be explicit booleans on save, never missing - coerce right on load
      // in case an older row predates the Hod field or SAP returns it blank for a non-MBN row.
      // SAP's OData gateway serializes Edm.Decimal fields as JSON strings (e.g. "50001.00"), not
      // real numbers - without this coercion, AmtFrom/AmtTo stay strings for any row the admin
      // doesn't manually retype, and row.AmtFrom.toFixed(2) throws on save (silently caught,
      // nothing actually saves, reload shows the unchanged original - looks like the edit "reverted").
      const gridRows: GridRow[] = loadedRows.map((r) => ({ ...r, AmtFrom: parseFloat(r.AmtFrom as any) || 0, AmtTo: parseFloat(r.AmtTo as any) || 0, Hod: !!r.Hod, Active: !!r.Active, _cid: newCid(), _isNew: false, _dirty: false, _rowError: null, _saving: false }));
      originalsRef.current = Object.fromEntries(gridRows.map((r) => [r._cid, { ...r }]));
      setRows(gridRows);
      setLoaded(true);
      setPage(1);
    } catch (err: any) {
      // Shown verbatim - likely to fail until SEGW's Filterable flag and the transport land; that's
      // a backend prerequisite gap, not a frontend bug.
      setLoadError(err?.message || 'Failed to fetch DOA chain');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (cid: string, patch: Partial<DoaChainRow>) => {
    setRows((prev) => prev.map((r) => (r._cid === cid ? { ...r, ...patch, _dirty: r._isNew ? r._dirty : true, _rowError: null } : r)));
  };

  const handleAddRow = () => {
    setRows((prev) => [...prev, blankRow(doaCtypeFilter, kostlFilter)]);
  };

  const handleCopyRow = (row: GridRow) => {
    const sameSlab = rows.filter((r) => r.DoaCtype === row.DoaCtype && r.Kostl === row.Kostl && r.Expgrp === row.Expgrp && r.AmtFrom === row.AmtFrom);
    const usedSeq = sameSlab.map((r) => parseInt(r.Seqno, 10) || 0);
    const nextSeq = String((usedSeq.length ? Math.max(...usedSeq) : 0) + 1).padStart(2, '0');
    const copy: GridRow = {
      ...row,
      Seqno: nextSeq,
      ApprPernr: undefined,
      ApprName: undefined,
      _cid: newCid(),
      _isNew: true,
      _dirty: false,
      _rowError: null,
      _saving: false,
    };
    setRows((prev) => [...prev, copy]);
  };

  // No real delete - Deactivate sets Active=false + ValidTo=today, Reactivate the opposite. Both
  // are local, staged changes included in the next Save (matching the grid's stage-then-save model),
  // not immediate API calls.
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

    // Saving an existing row whose approver e-mail changed moves that approver's pending (N/A)
    // claims at this level to the new approver and e-mails them - not reversible from here, so
    // confirm once before the whole batch goes out.
    const approverChanged = toSave.some((r) => !r._isNew && (originalsRef.current[r._cid]?.ApprEmail || '').trim().toLowerCase() !== r.ApprEmail.trim().toLowerCase());
    if (approverChanged) {
      setMessageModal({
        title: 'Confirm approver change',
        message: 'Pending claims waiting for the old approver at this level will move to the new approver, who gets a mail. Continue?',
        type: 'info',
        confirmLabel: 'Continue',
        cancelLabel: 'Cancel',
        onConfirm: () => { setMessageModal(null); performSaveAll(toSave); },
      });
      return;
    }

    await performSaveAll(toSave);
  };

  const performSaveAll = async (toSave: GridRow[]) => {
    setSavingAll(true);
    for (const row of toSave) {
      setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _saving: true } : r)));
      try {
        // Audit fields are backend-set and read-only - never sent on create/update, same as the
        // existing _cid/_isNew/etc UI-only props. Aenam is the one exception (handled by
        // createDoaChainRow/updateDoaChainRow themselves).
        const { _cid, _isNew, _dirty, _rowError, _saving, Ernam, Erdat, Erzet, Aedat, Aezet, ...plain } = row;
        const saved = row._isNew
          ? await createDoaChainRow(plain, adminPernr)
          : await updateDoaChainRow(plain, adminPernr);
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, ...(saved as DoaChainRow), _isNew: false, _dirty: false, _rowError: null, _saving: false } : r)));
      } catch (err: any) {
        // Shown verbatim - the DOA handover's business-error table (e.g. "Slab overlaps existing
        // slab ...", "No employee found for e-mail ...") should reach the admin unmodified.
        setRows((prev) => prev.map((r) => (r._cid === row._cid ? { ...r, _rowError: err?.message || 'Failed to save row', _saving: false } : r)));
      }
    }
    setSavingAll(false);
    // Always re-fetch after saving, so the grid shows what's really in SAP (e.g. AmtTo aligned
    // across a slab, ApprPernr/ApprName resolved) rather than our own optimistic local state.
    await handleLoad();
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

      // Seqno isn't a file column (the spec's import column list doesn't include it) - rows that
      // share the same Type+Cost Centre+Amount From are parallel approvers in the same slab, so
      // each needs its own Seqno or they'd collide on save as duplicate composite keys. Auto-
      // increments per slab, seeded from whatever's already in the grid (loaded or previously
      // imported) so a bulk import never collides with an existing row in that slab either.
      const slabKey = (doaCtype: string, kostl: string, amtFrom: number) => `${doaCtype}|${kostl}|${amtFrom}`;
      const nextSeqBySlab = new Map<string, number>();
      rows.forEach((r) => {
        const key = slabKey(r.DoaCtype, r.Kostl, r.AmtFrom);
        const seq = parseInt(r.Seqno, 10) || 0;
        nextSeqBySlab.set(key, Math.max(nextSeqBySlab.get(key) || 0, seq));
      });

      const imported: GridRow[] = parsed.map((line) => {
        const doaCtype = String(line['Type'] || line['DoaCtype'] || 'ADM').trim();
        const kostl = String(line['Cost Centre'] || line['Kostl'] || '').trim().toUpperCase();
        const amtFrom = parseFloat(line['Amount From'] || line['AmtFrom']) || 0;
        const key = slabKey(doaCtype, kostl, amtFrom);
        const nextSeq = (nextSeqBySlab.get(key) || 0) + 1;
        nextSeqBySlab.set(key, nextSeq);
        const row = blankRow(doaCtype, kostl);
        return {
          ...row,
          AmtFrom: amtFrom,
          Seqno: String(nextSeq).padStart(2, '0'),
          AmtTo: parseFloat(line['Amount To'] || line['AmtTo']) || 0,
          DeptTxt: String(line['Department'] || line['DeptTxt'] || ''),
          ApprEmail: String(line['Approver Email'] || line['ApprEmail'] || '').trim(),
          ApprRule: (String(line['Rule'] || line['ApprRule'] || 'O').trim().toUpperCase() === 'A') ? 'A' : 'O',
          Hod: ['x', 'true', '1', 'yes'].includes(String(line['HoD'] || line['Hod'] || '').trim().toLowerCase()),
          ValidFrom: String(line['Valid From'] || line['ValidFrom'] || todayIso()),
          ValidTo: String(line['Valid To'] || line['ValidTo'] || FAR_FUTURE),
        };
      });
      setRows((prev) => [...prev, ...imported]);
      setLoaded(true);
    } catch (err: any) {
      setImportError(err?.message || 'Could not read this file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const overlapWarnings = useMemo(() => findOverlapWarnings(rows), [rows]);
  const amtToMismatchWarnings = useMemo(() => findAmtToMismatchWarnings(rows), [rows]);
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
        r.DeptTxt.toLowerCase().includes(q) ||
        (r.ApprName || '').toLowerCase().includes(q) ||
        r.ApprEmail.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) =>
      a.DoaCtype.localeCompare(b.DoaCtype) ||
      a.Kostl.localeCompare(b.Kostl) ||
      a.AmtFrom - b.AmtFrom ||
      a.Seqno.localeCompare(b.Seqno));
  }, [rows, showInactive, searchText]);

  // Unsaved/new rows always render in full on every page, regardless of which page you're on -
  // only already-saved, untouched rows get paginated. Otherwise a row added (or imported) while
  // on page 1 could land on page 3 by sort order and silently vanish from view before it's saved.
  const unsavedRows = useMemo(() => visibleRows.filter((r) => r._isNew || r._dirty), [visibleRows]);
  const savedRows = useMemo(() => visibleRows.filter((r) => !(r._isNew || r._dirty)), [visibleRows]);
  const totalPages = Math.max(1, Math.ceil(savedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedSavedRows = useMemo(
    () => savedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [savedRows, currentPage]
  );
  const pagedRows = useMemo(() => [...unsavedRows, ...pagedSavedRows], [unsavedRows, pagedSavedRows]);

  // Any change that reshuffles what's visible (new search/filter results, a fresh Load, rows
  // saved and dropping out of the unsaved list) should land back on page 1, not strand the admin
  // on a now-out-of-range page.
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
        title="DOA Chain Maintenance"
        icon={ShieldAlert}
      />

      <Banner type="info">
        Changes here only affect new claims submitted after saving — claims already submitted keep the chain that was fixed at their own submit time.
      </Banner>

      <Card className="my-3">
        {/* Every field below shares the same label+input top line regardless of whether it also
            has a hint line under it (Cost Centre does, Type/Load don't) - items-start keeps all
            three aligned on that shared top line instead of Load drifting to the bottom of the
            tallest cell. */}
        <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
          <Field label="Type">
            <Select value={doaCtypeFilter} onChange={setDoaCtypeFilter} options={DOA_CTYPE_FILTER_OPTIONS} />
          </Field>
          <Field label="Cost Centre" hint="Blank = all">
            <Input
              value={kostlFilter}
              onChange={(e) => setKostlFilter(e.target.value.toUpperCase())}
              placeholder="e.g. CORP16"
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
          <Field label="Search" hint="Filters whatever's already loaded - cost centre, department, approver name or email">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkFaint" />
              <Input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search loaded rows…" className="pl-8" />
            </div>
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Checkbox checked={showInactive} onChange={setShowInactive} label="Show inactive rows" />
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
            Import CSV/Excel
          </Button>
        </div>
        {importError && <div className="mt-2"><Banner type="error" onClose={() => setImportError(null)}>{importError}</Banner></div>}
        <p className="mt-2 text-2xs text-inkFaint">
          Import columns: Type, Cost Centre, Amount From, Amount To, Department, Approver Email, Rule, HoD, Valid From, Valid To. Imported rows land in the grid for review — nothing is sent to SAP until you click Save.
        </p>
      </Card>

      {loadError && <Banner type="error" onClose={() => setLoadError(null)}>{loadError}</Banner>}

      {overlapWarnings.length > 0 && (
        <div className="mb-2">
          <Banner type="warn">
            <p className="font-bold">Overlapping active slabs</p>
            {overlapWarnings.map((w) => <p key={w}>{w}</p>)}
          </Banner>
        </div>
      )}
      {amtToMismatchWarnings.length > 0 && (
        <div className="mb-2">
          <Banner type="warn">
            <p className="font-bold">Mismatched Amount To within a slab</p>
            {amtToMismatchWarnings.map((w) => <p key={w}>{w}</p>)}
          </Banner>
        </div>
      )}

      {loading && <LoadingBlock label="Loading DOA chain…" />}

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
                    <th className="sticky top-0 z-10 w-[7%] border-b border-border bg-appBg p-1.5">Type</th>
                    <th className="sticky top-0 z-10 w-[8%] border-b border-border bg-appBg p-1.5">Cost Centre</th>
                    <th className="sticky top-0 z-10 w-[7%] border-b border-border bg-appBg p-1.5">Amt From</th>
                    <th className="sticky top-0 z-10 w-[5%] border-b border-border bg-appBg p-1.5">Seq</th>
                    <th className="sticky top-0 z-10 w-[7%] border-b border-border bg-appBg p-1.5">Amt To</th>
                    <th className="sticky top-0 z-10 w-[9%] border-b border-border bg-appBg p-1.5">Department</th>
                    <th className="sticky top-0 z-10 w-[15%] border-b border-border bg-appBg p-1.5">Approver Email</th>
                    <th className="sticky top-0 z-10 w-[11%] border-b border-border bg-appBg p-1.5">Approver</th>
                    <th className="sticky top-0 z-10 w-[6%] border-b border-border bg-appBg p-1.5">Rule</th>
                    <th className="sticky top-0 z-10 w-[5%] border-b border-border bg-appBg p-1.5">HoD</th>
                    <th className="sticky top-0 z-10 w-[5%] border-b border-border bg-appBg p-1.5">Active</th>
                    <th className="sticky top-0 z-10 w-[9%] border-b border-border bg-appBg p-1.5">Validity</th>
                    <th className="sticky top-0 z-10 w-[5%] border-b border-border bg-appBg p-1.5">Audit</th>
                    <th className="sticky top-0 z-10 w-[6%] border-b border-border bg-appBg p-1.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row) => {
                  const isKeyLocked = !row._isNew;
                  return (
                    <tr key={row._cid} className={row._isNew || row._dirty ? 'bg-amberBg/40' : 'border-b border-line'}>
                      <td className="p-1 align-top">
                        {row._isNew ? (
                          <Select value={row.DoaCtype} onChange={(v) => updateField(row._cid, { DoaCtype: v, Hod: v === 'MBN' ? row.Hod : false })} options={DOA_CTYPE_OPTIONS.map((o) => ({ value: o.value, label: o.value }))} className="!h-7 !w-full !min-w-0 !py-0.5 !px-1 text-2xs" />
                        ) : row.DoaCtype}
                      </td>
                      <td className="p-1 align-top">
                        {row._isNew ? (
                          <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} className={cellInputClass} />
                        ) : row.Kostl}
                      </td>
                      <td className="p-1 align-top">
                        {row._isNew ? (
                          <Input type="number" value={row.AmtFrom || ''} onChange={(e) => updateField(row._cid, { AmtFrom: parseFloat(e.target.value) || 0 })} className={cellInputClass} />
                        ) : row.AmtFrom}
                      </td>
                      <td className="p-1 align-top">
                        {row._isNew ? (
                          <Input value={row.Seqno} onChange={(e) => updateField(row._cid, { Seqno: e.target.value.slice(0, 2) })} className={cellInputClass} />
                        ) : row.Seqno}
                      </td>
                      <td className="p-1 align-top">
                        <Input type="number" value={row.AmtTo || ''} onChange={(e) => updateField(row._cid, { AmtTo: parseFloat(e.target.value) || 0 })} placeholder="No cap" className={cellInputClass} />
                      </td>
                      <td className="p-1 align-top">
                        <Input value={row.DeptTxt} onChange={(e) => updateField(row._cid, { DeptTxt: e.target.value })} className={cellInputClass} />
                      </td>
                      <td className="p-1 align-top">
                        <Input value={row.ApprEmail} onChange={(e) => updateField(row._cid, { ApprEmail: e.target.value })} placeholder="approver@…" className={cellInputClass} title={row.ApprEmail} />
                      </td>
                      <td className="p-1 align-top text-inkSoft" title={`${row.ApprPernr || ''} ${row.ApprName || ''}`}>
                        <div className="truncate">{row.ApprName || '—'}</div>
                        {row.ApprPernr && <div className="truncate text-inkFaint">{row.ApprPernr}</div>}
                      </td>
                      <td className="p-1 align-top">
                        <Select value={row.ApprRule} onChange={(v) => updateField(row._cid, { ApprRule: v as 'O' | 'A' })} options={[{ value: 'O', label: 'O' }, { value: 'A', label: 'A' }]} className="!h-7 !w-full !min-w-0 !py-0.5 !px-1.5 text-2xs" />
                      </td>
                      <td className="p-1 align-top">
                        {row.DoaCtype === 'MBN' ? (
                          <Checkbox checked={!!row.Hod} onChange={(v) => updateField(row._cid, { Hod: v })} />
                        ) : '—'}
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
                          <button type="button" title="Copy row (parallel approver)" onClick={() => handleCopyRow(row)} className="rounded p-1 text-inkSoft hover:bg-appBg hover:text-ink">
                            <Copy size={13} />
                          </button>
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

          {/* Mobile: same rows, same handlers (updateField/handleCopyRow/handleToggleActive), just
              stacked as cards instead of table columns - nothing here changes save/validation
              behavior, only how a row is laid out on a narrow screen. */}
          <div className="flex flex-col gap-2 md:hidden">
            {pagedRows.map((row) => {
              const isKeyLocked = !row._isNew;
              return (
                <div key={row._cid} className={cx('card p-3', (row._isNew || row._dirty) && 'border-l-4 border-l-amber bg-amberBg/20')}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Type">
                      {row._isNew ? (
                        <Select value={row.DoaCtype} onChange={(v) => updateField(row._cid, { DoaCtype: v, Hod: v === 'MBN' ? row.Hod : false })} options={DOA_CTYPE_OPTIONS.map((o) => ({ value: o.value, label: o.value }))} />
                      ) : <p className="text-sm font-semibold text-ink">{row.DoaCtype}</p>}
                    </Field>
                    <Field label="Cost Centre">
                      {row._isNew ? (
                        <Input value={row.Kostl} onChange={(e) => updateField(row._cid, { Kostl: e.target.value.toUpperCase() })} />
                      ) : <p className="text-sm font-semibold text-ink">{row.Kostl}</p>}
                    </Field>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Field label="Amt From">
                      {row._isNew ? (
                        <Input type="number" value={row.AmtFrom || ''} onChange={(e) => updateField(row._cid, { AmtFrom: parseFloat(e.target.value) || 0 })} />
                      ) : <p className="text-sm text-ink">{row.AmtFrom}</p>}
                    </Field>
                    <Field label="Seq">
                      {row._isNew ? (
                        <Input value={row.Seqno} onChange={(e) => updateField(row._cid, { Seqno: e.target.value.slice(0, 2) })} />
                      ) : <p className="text-sm text-ink">{row.Seqno}</p>}
                    </Field>
                    <Field label="Amt To">
                      <Input type="number" value={row.AmtTo || ''} onChange={(e) => updateField(row._cid, { AmtTo: parseFloat(e.target.value) || 0 })} placeholder="No cap" />
                    </Field>
                  </div>
                  <Field label="Department" className="mt-2">
                    <Input value={row.DeptTxt} onChange={(e) => updateField(row._cid, { DeptTxt: e.target.value })} />
                  </Field>
                  <Field label="Approver Email" className="mt-2">
                    <Input value={row.ApprEmail} onChange={(e) => updateField(row._cid, { ApprEmail: e.target.value })} placeholder="approver@…" />
                  </Field>
                  {(row.ApprName || row.ApprPernr) && (
                    <Field label="Approver" className="mt-2">
                      <p className="text-sm text-ink">{row.ApprName || '—'} {row.ApprPernr ? `(${row.ApprPernr})` : ''}</p>
                    </Field>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Field label="Rule">
                      <Select value={row.ApprRule} onChange={(v) => updateField(row._cid, { ApprRule: v as 'O' | 'A' })} options={[{ value: 'O', label: 'O — any one' }, { value: 'A', label: 'A — all' }]} />
                    </Field>
                    <Field label="HoD">
                      {row.DoaCtype === 'MBN' ? (
                        <div className="pt-2"><Checkbox checked={!!row.Hod} onChange={(v) => updateField(row._cid, { Hod: v })} /></div>
                      ) : <p className="pt-2 text-sm text-inkFaint">—</p>}
                    </Field>
                    <Field label="Active">
                      <div className="pt-2"><Checkbox checked={row.Active} onChange={() => handleToggleActive(row._cid)} /></div>
                    </Field>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <DateField label="Valid From" value={row.ValidFrom} onChange={(v) => updateField(row._cid, { ValidFrom: v })} />
                    <DateField label="Valid To" value={row.ValidTo} onChange={(v) => updateField(row._cid, { ValidTo: v })} />
                  </div>
                  {row.Aenam && (
                    <p className="mt-2 flex items-center gap-1 text-2xs text-inkFaint"><Info size={12} /> Last updated by {row.Aenam}{row.Aedat ? ` · ${row.Aedat}` : ''}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" icon={Copy} onClick={() => handleCopyRow(row)}>Copy</Button>
                      <Button size="sm" variant="secondary" icon={row.Active ? PowerOff : Power} onClick={() => handleToggleActive(row._cid)}>
                        {row.Active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
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

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}
