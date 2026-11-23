'use client';

import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { DoaChainRow } from '../../types';
import { Banner, Button, Card, CardTitle, Checkbox, DateField, EmptyState, Field, Input, InfoField, LoadingBlock, Modal, PageHeader, Select } from '../../components/ui';

// Local-only tracking of "not yet saved to SAP" - stripped before any create/update call.
type EditableDoaRow = DoaChainRow & { _isNew?: boolean };

const DOA_CTYPE_OPTIONS = [
  { value: 'ADM', label: 'ADM — Other Administrative Expenses' },
  { value: 'MBN', label: 'MBN — Mobile (reserved, not used yet)' },
  { value: 'MBS', label: 'MBS — Mobile (reserved, not used yet)' },
];

// Expense group categories backend asked to expose here - no business description was given for
// what B/C1-C4 mean, so these are shown as bare codes rather than invented labels. Empty stays the
// default (today's only behavior per the original DOA spec: "only rows with an empty group are
// used").
const EXPGRP_OPTIONS = [
  { value: '', label: '(none — default)' },
  { value: 'B', label: 'B' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
  { value: 'C3', label: 'C3' },
  { value: 'C4', label: 'C4' },
];

const todayIso = () => new Date().toISOString().split('T')[0];
const FAR_FUTURE = '9999-12-31';

const blankRow = (doaCtype: string, kostl: string, amtFrom: number, amtTo: number, seqno: string): EditableDoaRow => ({
  DoaCtype: doaCtype,
  Kostl: kostl,
  Expgrp: '',
  AmtFrom: amtFrom,
  Seqno: seqno,
  AmtTo: amtTo,
  DeptTxt: '',
  ApprEmail: '',
  ApprRule: 'O',
  Active: true,
  ValidFrom: todayIso(),
  ValidTo: FAR_FUTURE,
  _isNew: true,
});

const rowKey = (row: DoaChainRow) => `${row.DoaCtype}|${row.Kostl}|${row.Expgrp}|${row.AmtFrom}|${row.Seqno}`;
// Expgrp is part of the composite key, so two slabs can legitimately share the same AmtFrom while
// belonging to different expense groups - group/seqno/shared-AmtTo logic must key on both together,
// not AmtFrom alone, or rows from different groups would wrongly merge.
const slabKey = (amtFrom: number, expgrp: string) => `${amtFrom}|${expgrp}`;

const nextSeqno = (rows: EditableDoaRow[], amtFrom: number, expgrp: string) => {
  const used = rows.filter((r) => r.AmtFrom === amtFrom && r.Expgrp === expgrp).map((r) => parseInt(r.Seqno, 10) || 0);
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return String(next).padStart(2, '0');
};

function validateRow(row: EditableDoaRow): string | null {
  if (row.AmtFrom < 0) return 'Amount From cannot be negative';
  if (row.AmtTo && row.AmtTo < row.AmtFrom) return 'Amount To must be greater than or equal to Amount From';
  if (!row.ApprEmail.trim()) return 'Approver e-mail or PERNR is mandatory';
  if (row.ValidTo && row.ValidFrom && row.ValidTo < row.ValidFrom) return 'Valid To cannot be before Valid From';
  return null;
}

type Slab = { amtFrom: number; amtTo: number; expgrp: string; rows: EditableDoaRow[] };

function groupIntoSlabs(rows: EditableDoaRow[]): Slab[] {
  const byKey = new Map<string, EditableDoaRow[]>();
  rows.forEach((r) => {
    const key = slabKey(r.AmtFrom, r.Expgrp);
    const list = byKey.get(key) || [];
    list.push(r);
    byKey.set(key, list);
  });
  return Array.from(byKey.values())
    .map((slabRows) => ({
      amtFrom: slabRows[0].AmtFrom,
      amtTo: slabRows[0]?.AmtTo || 0,
      expgrp: slabRows[0].Expgrp,
      rows: slabRows.sort((a, b) => a.Seqno.localeCompare(b.Seqno)),
    }))
    .sort((a, b) => a.amtFrom - b.amtFrom || a.expgrp.localeCompare(b.expgrp));
}

// Slabs of the same cost centre AND expense group must not overlap (warn, don't block); gaps
// between slabs are allowed but worth flagging too, per the DOA handover. Different expense
// groups are independent chains, so overlap/gap checks only compare slabs within the same group.
function findSlabWarnings(slabs: Slab[]): { overlaps: string[]; gaps: string[] } {
  const overlaps: string[] = [];
  const gaps: string[] = [];
  const byGroup = new Map<string, Slab[]>();
  slabs.forEach((s) => {
    const list = byGroup.get(s.expgrp) || [];
    list.push(s);
    byGroup.set(s.expgrp, list);
  });
  byGroup.forEach((groupSlabs, expgrp) => {
    const label = expgrp ? ` (group ${expgrp})` : '';
    for (let i = 0; i < groupSlabs.length - 1; i++) {
      const cur = groupSlabs[i];
      const next = groupSlabs[i + 1];
      if (cur.amtTo && cur.amtTo >= next.amtFrom) {
        overlaps.push(`${cur.amtFrom}–${cur.amtTo || '∞'} overlaps ${next.amtFrom}–${next.amtTo || '∞'}${label}`);
      } else if (cur.amtTo && next.amtFrom > cur.amtTo + 0.01) {
        gaps.push(`Gap between ${cur.amtTo} and ${next.amtFrom}${label}`);
      }
    }
  });
  return { overlaps, gaps };
}

export default function DoaChainPage() {
  const { currentUser } = useAuth();
  const { fetchDoaChain, createDoaChainRow, updateDoaChainRow, deactivateDoaChainRow } = useClaim();

  const [doaCtype, setDoaCtype] = useState('ADM');
  const [kostl, setKostl] = useState('');
  const [rows, setRows] = useState<EditableDoaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<EditableDoaRow | null>(null);
  const [deactivateValidTo, setDeactivateValidTo] = useState(todayIso());
  const [previewAmount, setPreviewAmount] = useState('');

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
    const kostlUpper = kostl.trim().toUpperCase();
    if (!kostlUpper) { setLoadError('Enter a cost centre to load its DOA chain.'); return; }
    setKostl(kostlUpper);
    setLoading(true);
    setLoadError(null);
    try {
      const loaded = await fetchDoaChain(doaCtype, kostlUpper);
      setRows(loaded.map((r) => ({ ...r, _isNew: false })));
    } catch (err: any) {
      // Shown verbatim - likely to fail until SEGW's Filterable flag and the transport land; that's
      // a backend prerequisite gap, not a frontend bug.
      setLoadError(err?.message || 'Failed to fetch DOA chain');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const slabs = useMemo(() => groupIntoSlabs(rows), [rows]);
  const { overlaps, gaps } = useMemo(() => findSlabWarnings(slabs), [slabs]);

  const updateRow = (key: string, patch: Partial<EditableDoaRow>) => {
    setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...r, ...patch } : r)));
  };

  // Rows sharing a slab's AmtFrom AND Expgrp must share the same AmtTo - editing it on one row
  // updates the others in that same group together, per the DOA handover. Must not cross into a
  // different expense group that happens to share the same AmtFrom.
  const setSlabAmtTo = (amtFrom: number, expgrp: string, newAmtTo: number) => {
    setRows((prev) => prev.map((r) => (r.AmtFrom === amtFrom && r.Expgrp === expgrp ? { ...r, AmtTo: newAmtTo } : r)));
  };

  const handleAddApprover = (slab: Slab) => {
    const row = { ...blankRow(doaCtype, kostl, slab.amtFrom, slab.amtTo, nextSeqno(rows, slab.amtFrom, slab.expgrp)), Expgrp: slab.expgrp };
    setRows((prev) => [...prev, row]);
  };

  const handleAddSlab = () => {
    const row = blankRow(doaCtype, kostl, 0, 0, '01');
    setRows((prev) => [...prev, row]);
  };

  const handleSaveRow = async (row: EditableDoaRow) => {
    const key = rowKey(row);
    const validationError = validateRow(row);
    if (validationError) { setRowErrors((prev) => ({ ...prev, [key]: validationError })); return; }
    setRowErrors((prev) => ({ ...prev, [key]: null }));
    setSavingKey(key);
    try {
      const { _isNew, ...plain } = row;
      const saved = row._isNew
        ? await createDoaChainRow(plain, adminPernr)
        : await updateDoaChainRow(plain, adminPernr);
      setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...(saved as DoaChainRow), _isNew: false } : r)));
    } catch (err: any) {
      // Shown verbatim - the DOA handover's business-error table (e.g. "Slab overlaps existing
      // slab ...", "No employee found for e-mail ...") should reach the admin unmodified.
      setRowErrors((prev) => ({ ...prev, [key]: err?.message || 'Failed to save row' }));
    } finally {
      setSavingKey(null);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateTarget) return;
    const key = rowKey(deactivateTarget);
    setSavingKey(key);
    try {
      if (deactivateTarget._isNew) {
        // Never saved - just drop it locally, nothing to tell SAP.
        setRows((prev) => prev.filter((r) => rowKey(r) !== key));
      } else {
        const { _isNew, ...plain } = deactivateTarget;
        const saved = await deactivateDoaChainRow(plain, adminPernr, deactivateValidTo);
        setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...(saved as DoaChainRow), _isNew: false } : r)));
      }
      setDeactivateTarget(null);
    } catch (err: any) {
      setRowErrors((prev) => ({ ...prev, [key]: err?.message || 'Failed to deactivate row' }));
    } finally {
      setSavingKey(null);
    }
  };

  const previewLevels = useMemo(() => {
    const amount = parseFloat(previewAmount);
    if (Number.isNaN(amount)) return null;
    return slabs.filter((s) => s.amtFrom <= amount);
  }, [previewAmount, slabs]);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="DOA Chain Maintenance"
        subtitle="Maintain approval-chain slabs and approvers per cost centre. Changes only affect new claims submitted after saving — claims already submitted keep the chain fixed at their own submit time."
        icon={ShieldAlert}
      />

      <Banner type="info">
        Changes here only affect new claims submitted after saving — claims already submitted keep the chain that was fixed at their own submit time.
      </Banner>

      <Card className="my-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="DOA Type">
            <Select
              value={doaCtype}
              onChange={setDoaCtype}
              options={DOA_CTYPE_OPTIONS}
            />
          </Field>
          <Field label="Cost Centre" required hint="Upper-case, e.g. CORP16">
            <Input
              value={kostl}
              onChange={(e) => setKostl(e.target.value.toUpperCase())}
              placeholder="e.g. CORP16"
              onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(); }}
            />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" icon={RefreshCw} loading={loading} onClick={handleLoad} className="w-full">
              Load Chain
            </Button>
          </div>
        </div>
        {doaCtype !== 'ADM' && (
          <div className="mt-3">
            <Banner type="warn">MBN/MBS mobile DOA types are reserved — the backend doesn't use them yet.</Banner>
          </div>
        )}
      </Card>

      {loadError && <Banner type="error" onClose={() => setLoadError(null)}>{loadError}</Banner>}

      {!loading && rows.length === 0 && !loadError && kostl && (
        <EmptyState title="No slabs loaded" hint="Add a slab below, or confirm this cost centre has a DOA chain in SAP." />
      )}

      {overlaps.length > 0 && (
        <div className="mb-2">
          <Banner type="warn">
            <p className="font-bold">Overlapping slabs</p>
            {overlaps.map((o) => <p key={o}>{o}</p>)}
          </Banner>
        </div>
      )}
      {gaps.length > 0 && (
        <div className="mb-2">
          <Banner type="warn">
            <p className="font-bold">Gaps between slabs</p>
            {gaps.map((g) => <p key={g}>{g}</p>)}
          </Banner>
        </div>
      )}

      {kostl && (
        <Card className="mb-3">
          <CardTitle title="Preview" hint="See which levels/approvers a test amount would produce, using the slabs loaded above." />
          <div className="flex items-end gap-2">
            <Field label="Test Amount (₹)" className="max-w-[200px]">
              <Input value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} placeholder="e.g. 40000" inputMode="decimal" />
            </Field>
          </div>
          {previewLevels && (
            previewLevels.length === 0 ? (
              <p className="mt-3 text-sm text-inkSoft">No slab matches this amount — falls back to the old supervisor flow.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {previewLevels.map((s, idx) => (
                  <div key={`${s.amtFrom}|${s.expgrp}`} className="rounded-lg border border-border bg-appBg p-2">
                    <p className="text-xs font-bold text-inkSoft">Level {idx + 1} · ₹{s.amtFrom}–{s.amtTo || '∞'}{s.expgrp ? ` · Group ${s.expgrp}` : ''}</p>
                    {s.rows.map((r) => (
                      <p key={rowKey(r)} className="text-sm text-ink">{r.ApprName || r.ApprEmail} ({r.ApprRule === 'A' ? 'all must approve' : 'any one approves'})</p>
                    ))}
                  </div>
                ))}
              </div>
            )
          )}
        </Card>
      )}

      {loading && <LoadingBlock label="Loading DOA chain…" />}

      {!loading && slabs.map((slab) => (
        <Card key={`${slab.amtFrom}|${slab.expgrp}`} className="mb-3">
          <CardTitle
            title={`₹${slab.amtFrom} – ${slab.amtTo || 'no cap'}${slab.expgrp ? ` · Group ${slab.expgrp}` : ''}`}
            hint={`${slab.rows.length} approver${slab.rows.length === 1 ? '' : 's'}`}
            actions={<Button variant="ghost" size="sm" icon={Plus} onClick={() => handleAddApprover(slab)}>Add approver to this slab</Button>}
          />
          <Field label="Amount To (₹, shared by this slab)" className="mb-3 max-w-[220px]">
            <Input
              type="number"
              value={slab.amtTo || ''}
              onChange={(e) => setSlabAmtTo(slab.amtFrom, slab.expgrp, parseFloat(e.target.value) || 0)}
              placeholder="Empty = no cap"
            />
          </Field>

          {slab.rows.map((row) => {
            const key = rowKey(row);
            const rowError = rowErrors[key];
            return (
              <div key={key} className="mb-2 rounded-lg border border-border bg-white p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {row._isNew && (
                    <>
                      <Field label="Amount From (₹)" required hint="Key field — can't be changed after saving">
                        <Input
                          type="number"
                          value={row.AmtFrom || ''}
                          onChange={(e) => updateRow(key, { AmtFrom: parseFloat(e.target.value) || 0 })}
                        />
                      </Field>
                      <Field label="Expense Group" hint="Key field — can't be changed after saving. Only empty-group rows are used today.">
                        <Select
                          value={row.Expgrp}
                          onChange={(v) => updateRow(key, { Expgrp: v })}
                          options={EXPGRP_OPTIONS}
                        />
                      </Field>
                    </>
                  )}
                  {!row._isNew && row.Expgrp && (
                    <InfoField label="Expense Group" value={row.Expgrp} />
                  )}
                  <Field label="Department" className="md:col-span-2">
                    <Input value={row.DeptTxt} onChange={(e) => updateRow(key, { DeptTxt: e.target.value })} />
                  </Field>
                  <Field label="Approver Email" required>
                    <Input value={row.ApprEmail} onChange={(e) => updateRow(key, { ApprEmail: e.target.value })} placeholder="approver@emamigroup.com" />
                  </Field>
                  <Field label="Approval Rule">
                    <Select
                      value={row.ApprRule}
                      onChange={(v) => updateRow(key, { ApprRule: v as 'O' | 'A' })}
                      options={[{ value: 'O', label: 'O — any one approver' }, { value: 'A', label: 'A — all must approve' }]}
                    />
                  </Field>
                  {!row._isNew && (row.ApprPernr || row.ApprName) && (
                    <>
                      <InfoField label="Resolved PERNR" value={row.ApprPernr} />
                      <InfoField label="Resolved Name" value={row.ApprName} />
                    </>
                  )}
                  <Field label="Valid From">
                    <DateField label="Valid From" value={row.ValidFrom} onChange={(v) => updateRow(key, { ValidFrom: v })} />
                  </Field>
                  <Field label="Valid To">
                    <DateField label="Valid To" value={row.ValidTo} onChange={(v) => updateRow(key, { ValidTo: v })} />
                  </Field>
                  <Checkbox checked={row.Active} onChange={(v) => updateRow(key, { Active: v })} label="Active" />
                </div>

                {rowError && (
                  <div className="mt-2"><Banner type="error">{rowError}</Banner></div>
                )}

                <div className="mt-3 flex gap-2">
                  <Button variant="primary" size="sm" loading={savingKey === key} onClick={() => handleSaveRow(row)}>
                    {row._isNew ? 'Create' : 'Save'}
                  </Button>
                  <Button variant="danger" size="sm" icon={Trash2} onClick={() => { setDeactivateTarget(row); setDeactivateValidTo(todayIso()); }}>
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      ))}

      {kostl && (
        <Button variant="secondary" icon={Plus} onClick={handleAddSlab} className="mb-3">
          Add new slab
        </Button>
      )}

      <Modal
        open={!!deactivateTarget}
        title="Remove approver"
        onClose={() => setDeactivateTarget(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={!!deactivateTarget && savingKey === rowKey(deactivateTarget)} onClick={handleConfirmDeactivate}>Confirm</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-inkSoft">
          There's no real delete — this marks the row inactive with a Valid To date instead. Existing claims already submitted keep whatever chain they were built with; this only affects new claims going forward.
        </p>
        <Field label="Valid To">
          <DateField label="Valid To" value={deactivateValidTo} onChange={setDeactivateValidTo} />
        </Field>
      </Modal>
    </div>
  );
}
