'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, RefreshCw, Save, ScrollText, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { ConfigLogRow, ConfigVarName, ConfigVarRow } from '../../types';
import { Banner, Button, Card, CardTitle, EmptyState, Field, IconButton, Input, LoadingBlock, PageHeader, Segmented, Select } from '../../components/ui';

// Admin maintenance for the settings formerly kept in STVARV, now ConfigVarSet/ConfigLogSet (see
// UI_CHANGES_REQUIRED section J). Each variable is a short list of lines (or, for the two
// single-line variables, exactly one line, Numb '0000') - simple enough that each row saves/
// removes independently on its own button, unlike the DOA Chain/Mob Cap grids' batched "Save all".

interface VarConfig {
  name: ConfigVarName;
  label: string;
  lowLabel: string;
  lowPlaceholder: string;
  hasHigh: boolean;
  highOptions?: { value: string; label: string }[];
  singleLine: boolean; // true = no add/remove - backend always keeps exactly one line, Numb '0000'
}

const VAR_CONFIGS: VarConfig[] = [
  { name: 'ZEXP_ADMIN', label: 'Admins', lowLabel: 'Employee ID (PERNR)', lowPlaceholder: 'e.g. 90001020', hasHigh: false, singleLine: false },
  { name: 'ZEXP_DOA_ADMIN', label: 'DOA Admins', lowLabel: 'Employee ID (PERNR)', lowPlaceholder: 'e.g. 90001020', hasHigh: false, singleLine: false },
  { name: 'ZEXP_FINANCE', label: 'Finance Users', lowLabel: 'Employee ID (PERNR)', lowPlaceholder: 'e.g. 90001020', hasHigh: true, highOptions: [{ value: 'POST', label: 'POST' }, { value: 'PARK', label: 'PARK' }], singleLine: false },
  { name: 'ZFI_NONCTC_USER', label: 'Employee Subgroups (skip approval)', lowLabel: 'Subgroup (PERSK)', lowPlaceholder: 'e.g. 27', hasHigh: false, singleLine: false },
  { name: 'ZEXP_EXPTYPE_SET', label: 'Expense Type Sets', lowLabel: 'GL Set Name', lowPlaceholder: 'e.g. EMA_CAREXP', hasHigh: false, singleLine: false },
  { name: 'ZEXP_MOBILE_SET', label: 'Mobile Expense Sets', lowLabel: 'GL Set Name', lowPlaceholder: 'e.g. EMA_MOBILE', hasHigh: false, singleLine: false },
  { name: 'ZEXP_NON_CTC_GO_LIVE', label: 'Go-Live Date', lowLabel: 'Date (YYYYMMDD)', lowPlaceholder: 'e.g. 20261101', hasHigh: false, singleLine: true },
  { name: 'ZFI_EXPENCE_CLAIM', label: 'Attachment Directory', lowLabel: 'Server Path', lowPlaceholder: '/usr/sap/...', hasHigh: false, singleLine: true },
];

const VARNAME_FILTER_OPTIONS = [{ value: '', label: 'All variables' }, ...VAR_CONFIGS.map((v) => ({ value: v.name, label: v.label }))];

type EditableRow = ConfigVarRow & { _draftLow: string; _draftHigh: string; _saving: boolean; _error: string | null };

// Light client-side checks only (per the backend spec: "validate nothing twice") - the backend
// does the real validation (employee exists in HR, GL set exists, etc.) and its message is shown
// verbatim on failure.
function validateLow(cfg: VarConfig, value: string): string | null {
  const v = value.trim();
  if (!v) return 'This field is required';
  if ((cfg.name === 'ZEXP_ADMIN' || cfg.name === 'ZEXP_DOA_ADMIN' || cfg.name === 'ZEXP_FINANCE' || cfg.name === 'ZFI_NONCTC_USER') && !/^\d+$/.test(v)) {
    return 'Enter a numeric value';
  }
  if (cfg.name === 'ZEXP_NON_CTC_GO_LIVE' && !/^\d{8}$/.test(v)) return 'Enter the date as YYYYMMDD';
  if (cfg.name === 'ZFI_EXPENCE_CLAIM' && !v.startsWith('/')) return 'Enter an absolute path starting with /';
  return null;
}

const formatLogDate = (value?: string) => {
  if (!value) return '';
  const m = String(value).match(/\/Date\((\d+)\)\//);
  const ms = m ? parseInt(m[1], 10) : new Date(value).getTime();
  if (Number.isNaN(ms)) return value;
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dd} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const formatLogTime = (value?: string) => {
  if (!value) return '';
  const match = String(value).match(/PT(\d+)H(\d+)M(\d+)S/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${match[3].padStart(2, '0')}`;
  return value;
};

export default function ConfigPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { fetchConfigVars, addConfigVar, updateConfigVar, removeConfigVar, fetchConfigLog } = useClaim();

  const [activeTab, setActiveTab] = useState<ConfigVarName | 'LOG'>('ZEXP_ADMIN');
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<{ low: string; high: string } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [logRows, setLogRows] = useState<ConfigLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState('');
  const [logLoaded, setLogLoaded] = useState(false);

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
      // One call returns all 8 variables at once (per the backend spec) - grouped client-side by
      // Name into each tab's section rather than re-fetching per tab switch.
      const loadedRows = await fetchConfigVars(adminPernr);
      const editable: EditableRow[] = loadedRows.map((r) => ({ ...r, _draftLow: r.Low, _draftHigh: r.High || '', _saving: false, _error: null }));
      setRows(editable);
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to fetch configuration');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const config = VAR_CONFIGS.find((v) => v.name === activeTab);
  const sectionRows = useMemo(() => rows.filter((r) => r.Name === activeTab), [rows, activeTab]);

  const handleSaveRow = async (row: EditableRow) => {
    if (!config) return;
    const err = validateLow(config, row._draftLow);
    if (err) { setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _error: err } : r))); return; }
    if (config.hasHigh && !row._draftHigh) { setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _error: 'Select POST or PARK' } : r))); return; }

    setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _saving: true, _error: null } : r)));
    try {
      const { _draftLow, _draftHigh, _saving, _error, ...plain } = row;
      await updateConfigVar({ ...plain, Low: _draftLow.trim(), High: config.hasHigh ? _draftHigh : undefined }, adminPernr);
      await handleLoad();
    } catch (e: any) {
      setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _saving: false, _error: e?.message || 'Failed to save' } : r)));
    }
  };

  const handleRemoveRow = async (row: EditableRow) => {
    if (!config) return;
    if (!window.confirm(`Remove this ${config.label.toLowerCase()} line${row.LowText ? ` (${row.LowText})` : ''}?`)) return;
    setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _saving: true, _error: null } : r)));
    try {
      await removeConfigVar(row, adminPernr);
      await handleLoad();
    } catch (e: any) {
      setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _saving: false, _error: e?.message || 'Failed to remove' } : r)));
    }
  };

  const handleAdd = async () => {
    if (!config || !newRow) return;
    const err = validateLow(config, newRow.low);
    if (err) { setAddError(err); return; }
    if (config.hasHigh && !newRow.high) { setAddError('Select POST or PARK'); return; }
    setAddError(null);
    setAdding(true);
    try {
      await addConfigVar({ Name: config.name, Low: newRow.low.trim(), High: config.hasHigh ? newRow.high : undefined }, adminPernr);
      setNewRow(null);
      await handleLoad();
    } catch (e: any) {
      setAddError(e?.message || 'Failed to add line');
    } finally {
      setAdding(false);
    }
  };

  const handleLoadLog = async (varname?: string) => {
    setLogLoading(true);
    setLogError(null);
    try {
      const data = await fetchConfigLog(adminPernr, (varname || undefined) as ConfigVarName | undefined);
      setLogRows(data);
      setLogLoaded(true);
    } catch (e: any) {
      setLogError(e?.message || 'Failed to fetch configuration log');
      setLogRows([]);
    } finally {
      setLogLoading(false);
    }
  };

  const handleTabChange = (tab: ConfigVarName | 'LOG') => {
    setActiveTab(tab);
    setNewRow(null);
    setAddError(null);
    if (tab === 'LOG' && !logLoaded && !logLoading) handleLoadLog(logFilter);
  };

  const isLastAdminLine = activeTab === 'ZEXP_ADMIN' && sectionRows.length <= 1;

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
        title="Configuration Maintenance"
        subtitle="Settings formerly maintained in STVARV - admins, finance users, expense-type sets and more."
        icon={ShieldAlert}
      />

      {loadError && <Banner type="error" onClose={() => setLoadError(null)}>{loadError}</Banner>}

      <Card className="my-3 overflow-x-auto">
        <Segmented
          value={activeTab}
          onChange={handleTabChange}
          options={[...VAR_CONFIGS.map((v) => ({ value: v.name, label: v.label })), { value: 'LOG' as const, label: 'Change Log' }]}
        />
      </Card>

      {loading && <LoadingBlock label="Loading configuration…" />}

      {!loading && activeTab !== 'LOG' && config && (
        <Card>
          <CardTitle
            icon={RefreshCw}
            title={config.label}
            hint={config.singleLine ? 'Single value — change only, no add/remove.' : 'Add, change or remove lines. Every change is logged automatically.'}
            actions={<IconButton icon={RefreshCw} label="Refresh" onClick={handleLoad} />}
          />

          <div className="flex flex-col gap-2">
            {sectionRows.length === 0 && (
              <p className="py-3 text-center text-sm text-inkFaint">
                {config.singleLine ? 'No value found — this should not normally happen.' : 'No lines yet.'}
              </p>
            )}
            {sectionRows.map((row) => (
              <div key={row.Numb} className="rounded-lg border border-border p-3">
                {/* Fixed widths (not auto/flex-1-everywhere) on every column after the field so
                    the field's own right edge lands in the same place on every row, regardless of
                    how long that row's own Resolved text or whether Role even applies - each row
                    is its own independent layout box, so anything size-by-content varies row to
                    row otherwise (confirmed live: GL Set Name's width visibly drifted per row). */}
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <Field label={config.lowLabel} error={row._error || undefined} className="min-w-0 flex-1">
                    <Input
                      value={row._draftLow}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _draftLow: e.target.value, _error: null } : r)))}
                      placeholder={config.lowPlaceholder}
                    />
                  </Field>
                  {config.hasHigh && (
                    <Field label="Role" className="shrink-0 sm:w-28">
                      <Select
                        value={row._draftHigh}
                        onChange={(v) => setRows((prev) => prev.map((r) => (r.Numb === row.Numb ? { ...r, _draftHigh: v, _error: null } : r)))}
                        options={[{ value: '', label: 'Select…' }, ...(config.highOptions || [])]}
                      />
                    </Field>
                  )}
                  <div className="min-w-0 shrink-0 sm:w-40 sm:px-2">
                    {row.LowText && (
                      <>
                        <p className="text-2xs font-semibold text-inkFaint">Resolved</p>
                        <p className="truncate text-sm font-semibold text-ink" title={row.LowText}>{row.LowText}</p>
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                    <IconButton icon={Save} label="Save" onClick={() => handleSaveRow(row)} disabled={row._saving} />
                    {!config.singleLine && (
                      <IconButton
                        icon={Trash2}
                        label="Remove"
                        onClick={() => handleRemoveRow(row)}
                        disabled={row._saving || isLastAdminLine}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!config.singleLine && (
            <div className="mt-3 border-t border-border pt-3">
              {newRow === null ? (
                <Button variant="secondary" icon={Plus} onClick={() => setNewRow({ low: '', high: '' })}>
                  Add line
                </Button>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3">
                  {/* Fields first, action row below - Add/Cancel sitting beside a taller label+
                      input column (the previous layout) put them level with the label instead of
                      the input, which read as misaligned. Stacking removes the ambiguity entirely. */}
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                    <Field label={config.lowLabel} error={addError || undefined} className="min-w-0 flex-1">
                      <Input value={newRow.low} onChange={(e) => setNewRow({ ...newRow, low: e.target.value })} placeholder={config.lowPlaceholder} />
                    </Field>
                    {config.hasHigh && (
                      <Field label="Role" className="shrink-0 sm:w-28">
                        <Select value={newRow.high} onChange={(v) => setNewRow({ ...newRow, high: v })} options={[{ value: '', label: 'Select…' }, ...(config.highOptions || [])]} />
                      </Field>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button variant="primary" size="sm" loading={adding} onClick={handleAdd}>Add</Button>
                    <Button variant="secondary" size="sm" onClick={() => { setNewRow(null); setAddError(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {!loading && activeTab === 'LOG' && (
        <Card>
          <CardTitle icon={ScrollText} title="Change Log" hint="Every add/change/remove across all settings, newest first." />
          <div className="mb-3 flex items-center gap-2">
            <Select value={logFilter} onChange={(v) => { setLogFilter(v); handleLoadLog(v); }} options={VARNAME_FILTER_OPTIONS} />
            <IconButton icon={RefreshCw} label="Refresh" onClick={() => handleLoadLog(logFilter)} />
          </div>
          {logLoading && <LoadingBlock label="Loading log…" />}
          {logError && <Banner type="error" onClose={() => setLogError(null)}>{logError}</Banner>}
          {!logLoading && !logError && logRows.length === 0 && (
            <p className="py-3 text-center text-sm text-inkFaint">No changes logged yet.</p>
          )}
          {!logLoading && logRows.length > 0 && (
            <div className="flex flex-col gap-2">
              {logRows
                .slice()
                .sort((a, b) => (b.LogDate + b.LogTime).localeCompare(a.LogDate + a.LogTime))
                .map((entry, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-ink">{entry.Varname} <span className="font-normal text-inkSoft">• {entry.Action}</span></p>
                      <p className="text-xs text-inkFaint">{formatLogDate(entry.LogDate)} • {formatLogTime(entry.LogTime)}</p>
                    </div>
                    <p className="mt-1 text-xs text-inkSoft">By {entry.ChangedName || entry.ChangedBy || 'Unknown'}</p>
                    {(entry.OldLow || entry.NewLow) && (
                      <p className="mt-1 text-xs text-ink">{entry.OldLow || '—'}{entry.OldHigh ? ` (${entry.OldHigh})` : ''} → {entry.NewLow || '—'}{entry.NewHigh ? ` (${entry.NewHigh})` : ''}</p>
                    )}
                    {entry.Remark && <p className="mt-1 text-xs text-inkFaint">{entry.Remark}</p>}
                  </div>
                ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
