'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight, CalendarClock, CheckCircle2, CheckSquare, Circle, Download, FileCheck2, FileText, Hourglass, Info, Mail,
  Paperclip, Search, Square, Undo2, XCircle, type LucideIcon,
} from 'lucide-react';
import {
  fetchProvisionLog,
  submitLogAction,
  submitLogActionBatch,
  PROVISION_LOG_STATUSES,
  PROVISION_LOG_STATUS_LABELS,
  LOG_ACTION_LABELS,
  type ProvisionLogRow,
  type ProvisionLogStatus,
  type LogAction,
  type InvoiceEditOverrides,
} from '../../lib/paymentTrackingApi';
import { base64ToBlob, base64ToBytes, ensureAttachmentUnderLimit, looksLikePdf, readAttachmentAsBase64 } from '../../lib/pdfAttachment';
import { getDocumentAsync } from '../../lib/documentPicker';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { formatDeliveryDate, filterByMonth, filterByFiscalYear } from '../../lib/provisionMetrics';
import {
  Banner, Button, Card, Chip, DateField, EmptyState, InfoField, Input, LoadingBlock, Modal, PageHeader, Spinner, TableWrap, cx, type Tone,
} from '../../components/ui';

/** Per-row action state for the 'AS' (SES Created) rows' Reverse SES / Mail for P2P buttons —
 * mirrors Pending Approval's RowState, plus the four invoice fields Admin can edit before Mail for
 * P2P (per instruction — seeded from whatever the row already had, not blank, same posture as
 * Upcoming Provision's own RowState). attachmentError is for the rare case opening an in-hand
 * attachment fails (e.g. malformed base64). */
interface RowState {
  acting: LogAction | null; // which action is in flight, if any
  actionError: string | null;
  attachmentError: string | null;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
  attachmentName: string;
  attachmentBase64: string;
  attachmentMimeType: string;
  attaching: boolean;
  /** Transient confirmation after a standalone Save (Zaction 'S') — cleared the next time any
   * action runs on this row, so it never lingers stale next to a later Reverse SES/Mail for P2P. */
  savedNotice: boolean;
}

function initialRowState(row: ProvisionLogRow): RowState {
  return {
    acting: null,
    actionError: null,
    attachmentError: null,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    invoiceAmount: row.invoiceAmount,
    attachmentName: row.filename,
    attachmentBase64: row.attachmentBase64,
    attachmentMimeType: row.mimetype,
    attaching: false,
    savedNotice: false,
  };
}

function useViewportWidth(): number {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function AttachField({ fileName, attaching, onPick, className }: { fileName: string; attaching: boolean; onPick: () => void; className?: string }) {
  const Icon = fileName ? FileCheck2 : Paperclip;
  return (
    <button type="button" onClick={onPick} disabled={attaching}
      className={cx('input flex items-center gap-1.5 text-left font-semibold disabled:opacity-60', className)} title={fileName || 'Choose PDF file'}>
      {attaching ? <Spinner size={12} /> : <Icon size={13} className="shrink-0 text-rust" />}
      <span className="truncate text-xs">{attaching ? 'Attaching…' : (fileName || 'Choose PDF file')}</span>
    </button>
  );
}

/** In-app attachment preview — same approach as Pending Approval's AttachmentPreviewModal (an
 * <iframe> onto the attachment's blob URL). */
function AttachmentPreviewModal({ blobUrl, filename, onClose }: { blobUrl: string | null; filename: string; onClose: () => void }) {
  if (!blobUrl) return null;

  const handleDownload = () => {
    if (typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'attachment.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Modal title={filename || 'Attachment'} onClose={onClose} size="xl"
      footer={<Button variant="primary" size="sm" icon={Download} onClick={handleDownload} aria-label="Download attachment">Download</Button>}>
      <iframe src={blobUrl} title={filename || 'Attachment preview'} className="h-[75vh] w-full rounded-lg border-0 bg-appBg" />
    </Modal>
  );
}

/** Per-status tone + icon, keyed by the ZROLE_ACTION domain code (see paymentTrackingApi.ts's
 * Submission History section) — every status gets its own accent so the list reads as a status
 * timeline at a glance, not just a flat table with a text column. */
const STATUS_STYLE: Record<ProvisionLogStatus, { tone: Tone; icon: LucideIcon; ring: string }> = {
  RD: { tone: 'amber', icon: CalendarClock, ring: 'border-amber' },
  SA: { tone: 'blue', icon: Hourglass, ring: 'border-blue' },
  AS: { tone: 'green', icon: CheckCircle2, ring: 'border-green' },
  RS: { tone: 'red', icon: Undo2, ring: 'border-red' },
  MS: { tone: 'teal', icon: Mail, ring: 'border-teal' },
};

function StatusBadge({ status, text }: { status: ProvisionLogStatus | ''; text: string }) {
  const style = status ? STATUS_STYLE[status] : null;
  return <Chip tone={style?.tone || 'neutral'} icon={style?.icon || Circle} className="normal-case tracking-normal">{text || 'Unknown'}</Chip>;
}

type StatusFilter = 'all' | ProvisionLogStatus;

/** Submission History (User side-pane tab) — every ZProvisionLogSet entry for the signed-in
 * user's own login email (see fetchProvisionLog), fetched once and then filtered client-side by
 * Zstatus (see filteredRows below) so switching status chips doesn't re-hit SAP. Each row gets a
 * colored indicator per status (see STATUS_STYLE above and this screen's status chip row). */
export default function PaymentTrackingHistory() {
  const { email, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const width = useViewportWidth();
  const isWide = width >= 768;
  const [rows, setRows] = useState<ProvisionLogRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [preview, setPreview] = useState<{ blobUrl: string; filename: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massSubmitting, setMassSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (roleLoading || !email) return;
    setLoading(true);
    setLoadError(null);
    fetchProvisionLog(email)
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => { state[r.key] = initialRowState(r); });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load submission history.'))
      .finally(() => setLoading(false));
  }, [email, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Month/Year (the bar every Provision Tracking screen shares — see MonthYearBar.tsx) narrows by
  // delivery date client-side, same as Pending Approval's own monthYearRows; ZProvisionLogSet has
  // no Gjahr server filter to send the year to, so both dimensions apply here, ahead of the
  // existing status/search filter below.
  const monthYearRows = useMemo(
    () => filterByFiscalYear(filterByMonth(rows, month), year),
    [rows, month, year]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthYearRows.filter((row) => {
      if (statusFilter !== 'all' && row.zstatus !== statusFilter) return false;
      if (!q) return true;
      const haystack = [row.poNumber, row.poItemNo, row.vendorName, row.serviceText, row.remarks].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [monthYearRows, search, statusFilter]);

  // Reverse SES / Mail for P2P — only offered on a row already in the 'AS' (SES Created) state.
  // Marks the row done locally on success (removeAction) rather than refetching the whole log,
  // same "acted-on row updates immediately" posture as Pending Approval's decideRow.
  const [doneActions, setDoneActions] = useState<Record<string, LogAction>>({});
  const runLogAction = async (row: ProvisionLogRow, action: LogAction) => {
    const state = rowState[row.key];
    patchRow(row.key, { acting: action, actionError: null, savedNotice: false });
    try {
      await submitLogAction(row, email || '', action, {
        invoiceNo: state?.invoiceNo,
        invoiceDate: state?.invoiceDate,
        invoiceAmount: state?.invoiceAmount,
        attachmentBase64: state?.attachmentBase64,
        attachmentMimeType: state?.attachmentMimeType,
        attachmentName: state?.attachmentName,
      });
      patchRow(row.key, { acting: null });
      setDoneActions((prev) => ({ ...prev, [row.key]: action }));
    } catch (e) {
      patchRow(row.key, { acting: null, actionError: e instanceof Error ? e.message : 'Could not complete this action.' });
    }
  };

  // Standalone Save (Zaction 'S') — same POST as Reverse SES/Mail for P2P above, but unlike those
  // this never marks the row done (setDoneActions), since saving the edited invoice fields doesn't
  // complete anything — Reverse SES/Mail for P2P stay available afterward.
  const saveInvoiceRow = async (row: ProvisionLogRow) => {
    const state = rowState[row.key];
    patchRow(row.key, { acting: 'S', actionError: null, savedNotice: false });
    try {
      await submitLogAction(row, email || '', 'S', {
        invoiceNo: state?.invoiceNo,
        invoiceDate: state?.invoiceDate,
        invoiceAmount: state?.invoiceAmount,
        attachmentBase64: state?.attachmentBase64,
        attachmentMimeType: state?.attachmentMimeType,
        attachmentName: state?.attachmentName,
      });
      patchRow(row.key, { acting: null, savedNotice: true });
      // Move this row's "already saved" baseline forward to what was just submitted, so Save
      // Invoice Details hides again immediately rather than staying visible (dirty-against-stale-
      // row) until the next full refetch.
      setRows((prev) => prev.map((r) => (r.key === row.key ? {
        ...r,
        invoiceNo: state?.invoiceNo ?? r.invoiceNo,
        invoiceDate: state?.invoiceDate ?? r.invoiceDate,
        invoiceAmount: state?.invoiceAmount ?? r.invoiceAmount,
        filename: state?.attachmentName ?? r.filename,
        mimetype: state?.attachmentMimeType ?? r.mimetype,
        attachmentBase64: state?.attachmentBase64 ?? r.attachmentBase64,
      } : r)));
    } catch (e) {
      patchRow(row.key, { acting: null, actionError: e instanceof Error ? e.message : 'Could not save the invoice details.' });
    }
  };

  // Attach Invoice (PDF) — same picker/compress/limit flow as Upcoming Provision's
  // handlePickAttachment (see pdfAttachment.ts), so Admin can add or replace the invoice attachment
  // right here before Mail for P2P.
  const handlePickAttachment = async (key: string) => {
    patchRow(key, { actionError: null });
    try {
      const result = await getDocumentAsync({ type: 'application/pdf' });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      const name: string = asset.name || 'invoice.pdf';
      const mimeType: string = asset.mimeType || 'application/pdf';
      if (!name.toLowerCase().endsWith('.pdf') || (mimeType && mimeType !== 'application/pdf')) {
        patchRow(key, { actionError: 'Only a PDF file can be attached as the invoice.' });
        return;
      }
      patchRow(key, { attaching: true });
      const picked = await readAttachmentAsBase64(asset.uri);
      const base64 = await ensureAttachmentUnderLimit(picked, true);
      if (!base64) {
        patchRow(key, {
          attaching: false,
          actionError: 'This PDF could not be compressed under 70KB. Please attach a smaller file.',
        });
        return;
      }
      patchRow(key, { attaching: false, attachmentName: name, attachmentBase64: base64, attachmentMimeType: mimeType });
    } catch {
      patchRow(key, { attaching: false, actionError: 'Could not attach this file. Please try again.' });
    }
  };

  // Mail for P2P is greyed out until all four invoice fields (Invoice Number/Date/Amount +
  // attachment) are filled in, per instruction — Reverse SES has no such requirement.
  function canMailP2P(state: RowState): boolean {
    return (
      !!state.invoiceNo.trim() &&
      !!state.invoiceDate &&
      !!state.invoiceAmount.trim() &&
      !Number.isNaN(Number(state.invoiceAmount)) &&
      !!state.attachmentBase64
    );
  }

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Mass Mail for P2P — same vendor-grouped batching as Upcoming Provision's "Send Selected for
  // Approval" (see submitLogActionBatch). Validates every selected row up front (same four fields
  // as the per-row canMailP2P check) so a single incomplete row can't silently drop out of an
  // otherwise-successful mass submission — the whole batch is blocked until it's fixed, same
  // posture as Upcoming Provision's submitSelected.
  const submitMassMailP2P = async () => {
    const targets = rows.filter((r) => selected.has(r.key) && r.zstatus === 'AS' && !doneActions[r.key]);
    if (targets.length === 0) return;

    const badRow = targets.find((r) => !canMailP2P(rowState[r.key]));
    if (badRow) {
      setBanner({
        type: 'error',
        message: `PO ${badRow.poNumber} / Item ${badRow.poItemNo}: fill in Invoice Number, Date, Amount and attachment first.`,
      });
      return;
    }

    setMassSubmitting(true);
    targets.forEach((r) => patchRow(r.key, { acting: 'MS', actionError: null, savedNotice: false }));
    const overridesByKey: Record<string, InvoiceEditOverrides> = {};
    targets.forEach((r) => {
      const s = rowState[r.key];
      overridesByKey[r.key] = {
        invoiceNo: s.invoiceNo,
        invoiceDate: s.invoiceDate,
        invoiceAmount: s.invoiceAmount,
        attachmentBase64: s.attachmentBase64,
        attachmentMimeType: s.attachmentMimeType,
        attachmentName: s.attachmentName,
      };
    });

    const failures = await submitLogActionBatch(targets, email || '', 'MS', overridesByKey);
    const failedLifnrs = new Set(failures.map((f) => f.lifnr));
    targets.forEach((r) => {
      if (failedLifnrs.has(r.vendor)) {
        const failure = failures.find((f) => f.lifnr === r.vendor);
        patchRow(r.key, { acting: null, actionError: failure?.error || 'Could not send mail to P2P.' });
      } else {
        patchRow(r.key, { acting: null });
        setDoneActions((prev) => ({ ...prev, [r.key]: 'MS' }));
      }
    });
    setSelected(new Set());
    setMassSubmitting(false);

    if (failures.length === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) mailed for P2P.` });
    } else {
      setBanner({ type: 'error', message: `${failures.length} vendor group(s) failed — see the affected rows below.` });
    }
  };

  // Attachment (if any) comes back inline on the row itself, same as Pending Approval — decoding
  // base64 already in hand, no extra request.
  const viewAttachment = (row: ProvisionLogRow) => {
    if (!row.attachmentBase64) return;
    try {
      const bytes = base64ToBytes(row.attachmentBase64);
      if (!looksLikePdf(bytes)) {
        patchRow(row.key, {
          attachmentError: 'This attachment did not come through as a valid PDF (it may be corrupted or incomplete on the SAP side) — try again, or ask SAP support to check the file.',
        });
        return;
      }
      const blob = base64ToBlob(row.attachmentBase64, 'application/pdf');
      const blobUrl = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        return { blobUrl, filename: row.filename || `PO-${row.poNumber}-Item-${row.poItemNo}.pdf` };
      });
      patchRow(row.key, { attachmentError: null });
    } catch (e) {
      patchRow(row.key, { attachmentError: 'Could not open this attachment.' });
    }
  };

  const closePreview = useCallback(() => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }, []);

  if (roleLoading) {
    return <LoadingBlock />;
  }

  /* ---------------- per-row view pieces (shared by the desktop table and the mobile cards) -------- */

  const rowView = (row: ProvisionLogRow) => {
    const state = rowState[row.key] ?? initialRowState(row);
    const doneAction = doneActions[row.key];
    const busy = state.acting !== null;
    const editable = row.zstatus === 'AS' && !doneAction;
    // Save Invoice Details only needs to appear when there's actually something to save:
    // either the row didn't already have all four invoice fields filled in, or the user
    // has changed one of them since the row loaded (per instruction).
    const allInvoiceFieldsComplete = !!row.invoiceNo.trim() && !!row.invoiceDate && !!row.invoiceAmount.trim() && !!row.attachmentBase64;
    const invoiceFieldsDirty = (
      state.invoiceNo !== row.invoiceNo
      || state.invoiceDate !== row.invoiceDate
      || state.invoiceAmount !== row.invoiceAmount
      || state.attachmentBase64 !== row.attachmentBase64
    );
    const showSaveButton = !allInvoiceFieldsComplete || invoiceFieldsDirty;
    const isSelected = selected.has(row.key);
    const mailOk = canMailP2P(state);

    const checkbox = editable ? (
      <button type="button" onClick={() => toggleSelected(row.key)} role="checkbox" aria-checked={isSelected}
        aria-label={`Select PO ${row.poNumber} item ${row.poItemNo} for Mass Mail for P2P`}
        className={cx('inline-flex', isSelected ? 'text-rust' : 'text-inkSoft hover:text-ink')}>
        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
    ) : null;

    const attachment = row.filename ? (
      row.attachmentBase64 ? (
        <button type="button" onClick={() => viewAttachment(row)}
          aria-label={`View or download attachment for PO ${row.poNumber} item ${row.poItemNo}`} title={row.filename}
          className="chip border border-border bg-white normal-case tracking-normal text-rust hover:border-rust/40 hover:bg-cream">
          <Paperclip size={11} /> Attachment
        </button>
      ) : (
        <span className="chip border border-dashed border-border bg-appBg normal-case tracking-normal text-inkSoft"
          aria-label={`Attachment "${row.filename}" has no content available to preview`} title={row.filename}>
          <Info size={11} /> Attachment unavailable
        </span>
      )
    ) : null;

    const invoiceNoEl = editable
      ? <Input aria-label="Invoice Number" value={state.invoiceNo} onChange={(e) => patchRow(row.key, { invoiceNo: e.target.value })} className="code" />
      : <span className="code">{row.invoiceNo || '—'}</span>;
    const invoiceDateEl = editable
      ? <DateField value={state.invoiceDate} onChange={(v) => patchRow(row.key, { invoiceDate: v })} label="Invoice Date" />
      : <span className="whitespace-nowrap">{formatDeliveryDate(row.invoiceDate) || '—'}</span>;
    const invoiceAmountEl = editable
      ? <Input aria-label="Invoice Amount" inputMode="decimal" value={state.invoiceAmount} onChange={(e) => patchRow(row.key, { invoiceAmount: e.target.value })} className="num text-right" />
      : <span className="num">{row.invoiceAmount || '—'}</span>;
    const attachPicker = editable
      ? <AttachField fileName={state.attachmentName} attaching={state.attaching} onPick={() => handlePickAttachment(row.key)} />
      : null;

    const messages = (
      <>
        {editable && (
          <p className="text-2xs font-semibold italic text-inkSoft">
            Invoice Number, Invoice Date, Invoice Amount and the attachment must all be filled in before Mail for P2P.
          </p>
        )}
        {state.actionError && <p className="text-xs font-semibold text-red">{state.actionError}</p>}
        {state.attachmentError && <p className="text-xs font-semibold text-red">{state.attachmentError}</p>}
        {state.savedNotice && (
          <p className="flex items-center gap-1 text-xs font-bold text-green"><CheckCircle2 size={12} /> Invoice details saved.</p>
        )}
      </>
    );
    const hasMessages = editable || !!state.actionError || !!state.attachmentError || state.savedNotice;

    const actions = row.zstatus === 'AS' ? (
      doneAction ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-green">
          <CheckCircle2 size={13} /> {LOG_ACTION_LABELS[doneAction]} sent
        </span>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {showSaveButton && (
            <Button size="sm" variant="secondary" className="border-rust/50 text-rust" onClick={() => saveInvoiceRow(row)}
              disabled={busy} loading={state.acting === 'S'}>
              {LOG_ACTION_LABELS.S}
            </Button>
          )}
          <Button size="sm" variant="danger" icon={Undo2} onClick={() => runLogAction(row, 'RS')} disabled={busy} loading={state.acting === 'RS'}>
            {LOG_ACTION_LABELS.RS}
          </Button>
          <button type="button" onClick={() => runLogAction(row, 'MS')} disabled={busy || !mailOk}
            aria-label={!mailOk ? 'Mail for P2P — fill in Invoice Number, Date, Amount and attachment first' : 'Mail for P2P'}
            title={!mailOk ? 'Fill in Invoice Number, Date, Amount and attachment first' : undefined}
            className="btn btn-sm bg-teal text-white hover:brightness-110">
            {state.acting === 'MS' ? <Spinner size={12} className="text-white" /> : <Mail size={12} />}
            {LOG_ACTION_LABELS.MS}
          </button>
        </div>
      )
    ) : null;

    return { state, editable, checkbox, attachment, invoiceNoEl, invoiceDateEl, invoiceAmountEl, attachPicker, messages, hasMessages, actions };
  };

  const anyEditable = filteredRows.some((r) => r.zstatus === 'AS' && !doneActions[r.key]);

  return (
    <>
      <PageHeader
        eyebrow="Submission History"
        title="Submission History"
        subtitle="Every action recorded against your provision submissions — filter by status to focus on one stage."
        icon={ArrowLeftRight}
      />

      <div className="flex flex-col gap-2">
        {banner && (
          <Banner type={banner.type} onClose={() => setBanner(null)}>{banner.message}</Banner>
        )}

        <Card ledger className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO, vendor, service, remarks…" className="pl-7 pr-7" />
              {search.length > 0 && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-inkSoft hover:text-ink">
                  <XCircle size={13} />
                </button>
              )}
            </div>
            <span className="ml-auto text-2xs font-semibold text-inkSoft">{filteredRows.length} of {rows.length}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setStatusFilter('all')} aria-label="Filter: All"
              className={cx('chip border', statusFilter === 'all' ? 'border-rust bg-rust/10 text-rust' : 'border-border bg-white text-inkSoft hover:text-ink')}>
              All
            </button>
            {PROVISION_LOG_STATUSES.map((s) => {
              const active = statusFilter === s;
              const st = STATUS_STYLE[s];
              const Icon = st.icon;
              const toneCls: Record<Tone, string> = {
                neutral: '', rust: '', ledger: '',
                amber: 'bg-amberBg text-amber', blue: 'bg-blueBg text-blue', green: 'bg-greenBg text-green', red: 'bg-redBg text-red', teal: 'bg-tealBg text-teal',
              };
              return (
                <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-label={`Filter: ${PROVISION_LOG_STATUS_LABELS[s]}`}
                  className={cx('chip border', active ? cx(st.ring, toneCls[st.tone]) : 'border-border bg-white text-inkSoft hover:text-ink')}>
                  <Icon size={11} />
                  {PROVISION_LOG_STATUS_LABELS[s]}
                </button>
              );
            })}
          </div>
        </Card>

        {loading ? (
          <LoadingBlock label="Loading submission history…" />
        ) : loadError ? (
          <p className="text-sm font-semibold text-red">{loadError}</p>
        ) : filteredRows.length === 0 ? (
          <EmptyState icon={FileText} title={rows.length === 0 ? 'No submission history yet.' : 'No entries match your search/filter.'} />
        ) : (
          <>
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-card">
                <span className="text-sm font-bold text-ink">{selected.size} selected</span>
                <button type="button" onClick={submitMassMailP2P} disabled={massSubmitting}
                  className="btn btn-sm bg-teal text-white hover:brightness-110">
                  {massSubmitting ? <Spinner size={12} className="text-white" /> : <><Mail size={12} /> Mail Selected for P2P</>}
                </button>
              </div>
            )}

            {isWide ? (
              <TableWrap maxHeight="calc(100vh - 260px)">
                <table className="tbl">
                  <thead>
                    <tr>
                      {anyEditable && <th className="w-8" />}
                      <th>PO · Item</th>
                      <th>Status</th>
                      <th>Service</th>
                      <th>SES No</th>
                      <th>Action Date</th>
                      <th>Delivery</th>
                      <th>Revised Del.</th>
                      <th className="text-right">Provision Amt</th>
                      <th>Invoice No</th>
                      <th>Invoice Date</th>
                      <th className="text-right">Invoice Amt</th>
                      <th>Attachment</th>
                      <th>Remarks</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const v = rowView(row);
                      const cols = anyEditable ? 15 : 14;
                      return (
                        <React.Fragment key={row.key}>
                          <tr className={cx(v.hasMessages && '[&>td]:border-b-0')}>
                            {anyEditable && <td>{v.checkbox}</td>}
                            <td className="whitespace-nowrap">
                              <p className="code">{row.poNumber || '—'} · {row.poItemNo || '—'}</p>
                              {row.vendorName ? <p className="max-w-[180px] truncate text-2xs text-inkSoft" title={row.vendorName}>{row.vendorName}</p> : null}
                            </td>
                            <td><StatusBadge status={row.zstatus} text={row.zstatusText} /></td>
                            <td><p className="line-clamp-2 min-w-[140px] max-w-[220px] text-xs" title={row.serviceText}>{row.serviceText || '—'}</p></td>
                            <td className="code whitespace-nowrap">{row.entrySheetNo || '—'}</td>
                            <td className="whitespace-nowrap">{formatDeliveryDate(row.actionDate) || '—'}</td>
                            <td className="whitespace-nowrap">{formatDeliveryDate(row.deliveryDate) || '—'}</td>
                            <td className="whitespace-nowrap">{formatDeliveryDate(row.revisedDeliveryDate) || '—'}</td>
                            <td className="num whitespace-nowrap text-right font-semibold text-ledger">{row.provisionValue || '—'}</td>
                            <td className={cx(v.editable && 'min-w-[120px]')}>{v.invoiceNoEl}</td>
                            <td className={cx(v.editable && 'min-w-[130px]')}>{v.invoiceDateEl}</td>
                            <td className={cx('text-right', v.editable && 'min-w-[100px]')}>{v.invoiceAmountEl}</td>
                            <td className={cx(v.editable && 'min-w-[150px]')}>
                              <div className="flex flex-col items-start gap-1">
                                {v.attachPicker}
                                {v.attachment}
                                {!v.attachPicker && !v.attachment && <span className="text-inkFaint">—</span>}
                              </div>
                            </td>
                            <td><p className="line-clamp-2 min-w-[120px] max-w-[200px] text-xs" title={row.remarks}>{row.remarks || '—'}</p></td>
                            <td className="text-right">{v.actions}</td>
                          </tr>
                          {v.hasMessages && (
                            <tr className="hover:bg-transparent">
                              <td colSpan={cols} className="pt-0">
                                <div className="flex flex-col items-end gap-0.5 text-right">{v.messages}</div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredRows.map((row) => {
                  const v = rowView(row);
                  return (
                    <div key={row.key} className="card flex flex-col gap-2 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {v.checkbox}
                        <div className="min-w-0 flex-1">
                          <p className="code text-ink">PO {row.poNumber || '—'} · Item {row.poItemNo || '—'}</p>
                          {row.vendorName ? <p className="truncate text-2xs text-inkSoft">{row.vendorName}</p> : null}
                        </div>
                        {v.attachment}
                        <StatusBadge status={row.zstatus} text={row.zstatusText} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                        <InfoField label="Service" value={row.serviceText} className="col-span-2 sm:col-span-3" />
                        {row.entrySheetNo ? <InfoField label="Service Entry Sheet No" value={row.entrySheetNo} mono /> : null}
                        <InfoField label="Action Date" value={formatDeliveryDate(row.actionDate)} />
                        <InfoField label="Delivery Date" value={formatDeliveryDate(row.deliveryDate)} />
                        <InfoField label="Revised Delivery Date" value={formatDeliveryDate(row.revisedDeliveryDate)} />
                        <InfoField label="Provision Amount" value={row.provisionValue} />
                        {v.editable ? (
                          <>
                            <div className="min-w-0"><span className="label">Invoice Number</span>{v.invoiceNoEl}</div>
                            <div className="min-w-0"><span className="label">Invoice Date</span>{v.invoiceDateEl}</div>
                            <div className="min-w-0"><span className="label">Invoice Amount</span>{v.invoiceAmountEl}</div>
                            <div className="min-w-0"><span className="label">Attach Invoice (PDF)</span>{v.attachPicker}</div>
                          </>
                        ) : (
                          <>
                            <InfoField label="Invoice Number" value={row.invoiceNo} mono />
                            <InfoField label="Invoice Date" value={formatDeliveryDate(row.invoiceDate)} />
                            <InfoField label="Invoice Amount" value={row.invoiceAmount} />
                          </>
                        )}
                        <InfoField label="Remarks" value={row.remarks} className="col-span-2 sm:col-span-3" />
                      </div>
                      {v.hasMessages && <div className="flex flex-col gap-0.5">{v.messages}</div>}
                      {v.actions && <div className="flex justify-end border-t border-line pt-1.5">{v.actions}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <AttachmentPreviewModal blobUrl={preview?.blobUrl ?? null} filename={preview?.filename ?? ''} onClose={closePreview} />
    </>
  );
}
