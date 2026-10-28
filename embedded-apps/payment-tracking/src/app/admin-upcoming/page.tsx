'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, FileCheck2, FileText, Lock, Paperclip, Send, Users } from 'lucide-react';
import {
  fetchPoAttachment,
  fetchVendorPOFollowups,
  submitProvisionApproval,
  submitProvisionApprovalBatch,
  type PoAttachment,
  type ProvisionConfirmation,
  type VendorPOFollowupRow,
} from '../../lib/paymentTrackingApi';
import { ensureAttachmentUnderLimit, readAttachmentAsBase64 } from '../../lib/pdfAttachment';
import { getDocumentAsync } from '../../lib/documentPicker';
import { QuotationPreviewModal } from '../../components/QuotationPreviewModal';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { filterByMonth, filterByFiscalYear } from '../../lib/provisionMetrics';
import {
  Banner, Button, Card, CardTitle, Chip, DateField, EmptyState, Field, InfoField, Input, LoadingBlock,
  Modal, PageHeader, Spinner, TableWrap, TextArea, YesNo, cx,
} from '../../components/ui';

// Matches the hub's own useIsWideScreen breakpoint and this app's layout copy of this
// constant — a compact desktop layout kicks in at the same viewport width the side pane docks at.
const WIDE_BREAKPOINT = 768;

/** useWindowDimensions() replacement: starts wide (1200) and tracks `resize`. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** One row's local, in-progress confirmation. Invoice fields seed from whatever
 * ZVendorPOFollowupSet already had on file (not blank) so reopening this screen doesn't discard a
 * previous partial fill; DelvConf always starts at Yes with no revised date/comments per
 * instruction, regardless of what SAP has on file for those two. The invoice attachment has no
 * equivalent field on the GET side yet, so it always starts blank. */
interface RowState {
  delvConf: boolean;
  revisedDelDate: string;
  comments: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
  attachmentName: string;
  attachmentBase64: string;
  attachmentMimeType: string;
  attaching: boolean;
  submitting: boolean;
  submitted: boolean;
  error: string | null;
}

function initialRowState(row: VendorPOFollowupRow): RowState {
  return {
    delvConf: true,
    revisedDelDate: '',
    comments: '',
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    invoiceAmount: row.invoiceAmount,
    attachmentName: '',
    attachmentBase64: '',
    attachmentMimeType: '',
    attaching: false,
    submitting: false,
    submitted: false,
    error: null,
  };
}

/** Attach Invoice (PDF) — restricted to `application/pdf` at the picker level (the underlying
 * `<input accept>` honors it). Optional, per instruction — no longer gates "Send for Invoice
 * Approval" (see rowMandatoryError). */
function AttachButton({ fileName, attaching, onPick }: { fileName: string; attaching: boolean; onPick: () => void }) {
  const Icon = fileName ? FileCheck2 : Paperclip;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={attaching}
      title={fileName || 'Choose PDF file'}
      className="input flex items-center gap-1.5 text-left font-semibold hover:border-rust/40 disabled:opacity-60"
    >
      {attaching ? <Spinner size={12} /> : <Icon size={13} className="shrink-0 text-rust" />}
      <span className="truncate">{attaching ? 'Attaching…' : (fileName || 'Choose PDF file')}</span>
    </button>
  );
}

/** Upcoming Provision — All Vendors — Admin's mirror of the vendor-side "Upcoming Provision" tab
 * (same ZVendorPOFollowupSet/Zaction='U' fetch, same ZProvHeader submit), just called with the
 * signed-in user's own login email — the backend already expands scope to every vendor once it
 * sees an Admin email on this same GET. Every row: confirm delivery (Yes/No — No opens a mandatory
 * Revised Delivery Date + Comments popup, no back-dating), fill in the three editable invoice
 * fields plus the PDF attachment, then send for approval (row-wise or as a multi-select mass
 * batch) — POSTs to ZProvHeader (see paymentTrackingApi.ts's
 * submitProvisionApproval/submitProvisionApprovalBatch). */
export default function AdminUpcomingProvision() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<VendorPOFollowupRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [modalDraft, setModalDraft] = useState<{ revisedDelDate: string; comments: string }>({ revisedDelDate: '', comments: '' });
  const [modalTouched, setModalTouched] = useState(false);
  const [massSubmitting, setMassSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [quotationLoadingKey, setQuotationLoadingKey] = useState<string | null>(null);
  const [quotation, setQuotation] = useState<PoAttachment | null>(null);
  // Dense table for a wide viewport (desktop); compact cards below the breakpoint.
  const width = useWindowWidth();
  const isDesktopWeb = width >= WIDE_BREAKPOINT;

  /** "View Quotation" on a PO tile — a keyed GetEntity read against ZPOAttachmentSet by Ebeln, per
   * instruction (see fetchPoAttachment). A PO with nothing on file yet surfaces as a banner, not
   * an error state, since that's an expected, common case, not a failure. */
  const handleViewQuotation = async (row: VendorPOFollowupRow) => {
    setQuotationLoadingKey(row.key);
    try {
      const att = await fetchPoAttachment(row.poNumber);
      if (!att) {
        setBanner({ type: 'error', message: `No quotation is on file for PO ${row.poNumber} yet.` });
      } else {
        setQuotation(att);
      }
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Could not load this quotation.' });
    } finally {
      setQuotationLoadingKey(null);
    }
  };

  // Month/Year (the bar every Provision Tracking screen shares) narrows by delivery date
  // client-side, same as Pending Approval's own monthYearRows; ZVendorPOFollowupSet has no Gjahr
  // server filter to send the year to, so both dimensions apply here.
  const monthYearRows = useMemo(
    () => filterByFiscalYear(filterByMonth(rows, month), year),
    [rows, month, year]
  );

  useEffect(() => {
    if (roleLoading) return;
    if (role !== 'Finance' || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    // NOTE: this screen's "all vendors" scope has historically relied on the backend/SAP
    // recognizing the caller's email as an Admin and expanding the GET beyond that vendor's own
    // rows — now that this tab moved to Finance, confirm the backend also expands scope for
    // Finance emails, not just Admin ones; otherwise a Finance user hits this route but only gets
    // their own vendor's rows (or none).
    fetchVendorPOFollowups(email, 'U')
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => { state[r.key] = initialRowState(r); });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load upcoming provision items.'))
      .finally(() => setLoading(false));
  }, [email, role, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const openNoModal = (key: string) => {
    const current = rowState[key];
    setModalDraft({ revisedDelDate: current?.revisedDelDate || '', comments: current?.comments || '' });
    setModalTouched(false);
    setModalKey(key);
  };

  const handleDelvConfChange = (key: string, yes: boolean) => {
    if (yes) {
      // Back to Yes clears the revised date/comments — those only apply to a "No" answer.
      patchRow(key, { delvConf: true, revisedDelDate: '', comments: '' });
    } else {
      patchRow(key, { delvConf: false });
      openNoModal(key);
    }
  };

  const handlePickAttachment = async (key: string) => {
    patchRow(key, { error: null });
    try {
      const result = await getDocumentAsync({ type: 'application/pdf' });
      if (result.canceled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const asset = (result as any).assets?.[0] ?? result;
      if (!asset?.uri) return;
      const name: string = asset.name || 'invoice.pdf';
      const mimeType: string = asset.mimeType || 'application/pdf';
      if (!name.toLowerCase().endsWith('.pdf') || (mimeType && mimeType !== 'application/pdf')) {
        patchRow(key, { error: 'Only a PDF file can be attached as the invoice.' });
        return;
      }
      patchRow(key, { attaching: true });
      const picked = await readAttachmentAsBase64(asset.uri);
      // SAP's ZProvHeaderSet 413s well below what even a small PDF needs (confirmed in dev
      // testing) — anything over 70KB gets compressed before it's attached.
      const base64 = await ensureAttachmentUnderLimit(picked, true);
      if (!base64) {
        patchRow(key, {
          attaching: false,
          error: 'This PDF could not be compressed under 70KB. Please attach a smaller file.',
        });
        return;
      }
      patchRow(key, { attaching: false, attachmentName: name, attachmentBase64: base64, attachmentMimeType: mimeType });
    } catch {
      patchRow(key, { attaching: false, error: 'Could not attach this file. Please try again.' });
    }
  };

  const confirmModal = () => {
    if (!modalKey) return;
    if (!modalDraft.revisedDelDate || !modalDraft.comments.trim()) {
      setModalTouched(true);
      return;
    }
    patchRow(modalKey, { revisedDelDate: modalDraft.revisedDelDate, comments: modalDraft.comments.trim() });
    setModalKey(null);
  };

  const cancelModal = () => {
    // Cancelling a fresh "No" pick (nothing saved yet) reverts to Yes instead of leaving DelvConf
    // on "No" with its required fields still empty. Cancelling while *editing* an already-saved
    // No answer (comments already on file) leaves that answer untouched.
    if (modalKey && !rowState[modalKey]?.comments) {
      patchRow(modalKey, { delvConf: true });
    }
    setModalKey(null);
  };

  // Delivery Confirmed = Yes -> invoice fields + PDF attachment are optional (per instruction, no
  // longer required to send for invoice approval — only validated if something was actually typed
  // in, so a stray non-numeric Invoice Amount still gets caught). Delivery Confirmed = No -> those
  // are hidden entirely and instead the Revised Delivery Date + Comments popup (already mandatory
  // via confirmModal) is what's required.
  function rowMandatoryError(state: RowState): string | null {
    if (state.delvConf) {
      if (state.invoiceAmount.trim() && Number.isNaN(Number(state.invoiceAmount))) return 'Invoice Amount must be a valid number.';
    } else {
      if (!state.revisedDelDate) return 'Revised Delivery Date is required when delivery is not confirmed.';
      if (!state.comments.trim()) return 'Comments are required when delivery is not confirmed.';
    }
    return null;
  }

  function toConfirmation(row: VendorPOFollowupRow, state: RowState): ProvisionConfirmation {
    return {
      row,
      delvConf: state.delvConf,
      revisedDelDate: state.revisedDelDate,
      comments: state.comments,
      invoiceNo: state.invoiceNo,
      invoiceDate: state.invoiceDate,
      invoiceAmount: state.invoiceAmount,
      attachmentName: state.attachmentName,
      attachmentBase64: state.attachmentBase64,
      attachmentMimeType: state.attachmentMimeType,
    };
  }

  const submitRow = async (row: VendorPOFollowupRow) => {
    const state = rowState[row.key];
    const err = rowMandatoryError(state);
    if (err) {
      patchRow(row.key, { error: err });
      return;
    }
    patchRow(row.key, { submitting: true, error: null });
    try {
      await submitProvisionApproval([toConfirmation(row, state)], email || '');
      patchRow(row.key, { submitting: false, submitted: true });
      setBanner({ type: 'success', message: `PO ${row.poNumber} / Item ${row.poItemNo} sent for approval.` });
    } catch (e) {
      patchRow(row.key, { submitting: false, error: e instanceof Error ? e.message : 'Could not send this for approval.' });
    }
  };

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const submitSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.key) && !rowState[r.key]?.submitted);
    if (targets.length === 0) return;

    // Validate every selected row up front — a single bad row shouldn't silently drop out of an
    // otherwise-successful mass submission.
    const badRow = targets.find((r) => rowMandatoryError(rowState[r.key]));
    if (badRow) {
      const err = rowMandatoryError(rowState[badRow.key])!;
      patchRow(badRow.key, { error: err });
      setBanner({ type: 'error', message: `PO ${badRow.poNumber} / Item ${badRow.poItemNo}: ${err}` });
      return;
    }

    setMassSubmitting(true);
    targets.forEach((r) => patchRow(r.key, { submitting: true, error: null }));
    const confirmations = targets.map((row) => toConfirmation(row, rowState[row.key]));

    const failures = await submitProvisionApprovalBatch(confirmations, email || '');
    const failedLifnrs = new Set(failures.map((f) => f.lifnr));
    targets.forEach((row) => {
      if (failedLifnrs.has(row.lifnr)) {
        const failure = failures.find((f) => f.lifnr === row.lifnr);
        patchRow(row.key, { submitting: false, error: failure?.error || 'Could not send this for approval.' });
      } else {
        patchRow(row.key, { submitting: false, submitted: true });
      }
    });
    setSelected(new Set());
    setMassSubmitting(false);

    if (failures.length === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) sent for approval.` });
    } else {
      setBanner({ type: 'error', message: `${failures.length} vendor group(s) failed — see the affected rows below.` });
    }
  };

  if (roleLoading) {
    return <LoadingBlock label="" />;
  }

  // Defense in depth — the nav bar already hides this link from non-Finance roles, but the route
  // is still reachable by a typed URL.
  if (role !== 'Finance') {
    return (
      <EmptyState icon={Lock} title="Upcoming Provision (All Vendors) is only available to Finance." />
    );
  }

  /* ------------------------------------------------------------ shared row bits ---------- */

  const quotationBtn = (row: VendorPOFollowupRow) => (
    <Button
      size="sm"
      variant="ghost"
      icon={FileText}
      loading={quotationLoadingKey === row.key}
      onClick={() => handleViewQuotation(row)}
      aria-label={`View quotation for PO ${row.poNumber}`}
      className="text-rust"
    >
      Quotation
    </Button>
  );

  const sendBtn = (row: VendorPOFollowupRow, state: RowState) => (
    <Button
      size="sm"
      variant="primary"
      icon={Send}
      loading={state.submitting}
      onClick={() => submitRow(row)}
    >
      {state.delvConf ? 'Send for Invoice Approval' : 'Send for Revised Date Approval'}
    </Button>
  );

  const selectBox = (row: VendorPOFollowupRow) => (
    <input
      type="checkbox"
      className="h-[14px] w-[14px] cursor-pointer accent-rust"
      checked={selected.has(row.key)}
      onChange={() => toggleSelected(row.key)}
      aria-label={`Select PO ${row.poNumber} item ${row.poItemNo}`}
    />
  );

  const sentChip = <Chip tone="green" icon={CheckCircle2}>Sent for approval</Chip>;

  /* ------------------------------------------------------------ desktop: dense table ------ */

  const renderTable = () => (
    <TableWrap>
      <table className="tbl">
        <thead>
          <tr>
            <th className="w-8" />
            <th>PO · Item</th>
            <th>Service Text</th>
            <th>Delivery Date</th>
            <th className="text-right">Provision Value</th>
            <th>Delivery Confirmed?</th>
            <th>Invoice Number</th>
            <th>Invoice Date</th>
            <th className="text-right">Invoice Amount</th>
            <th>Attach Invoice (PDF)</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {monthYearRows.map((row) => {
            const state = rowState[row.key];
            if (!state) return null;
            return (
              <React.Fragment key={row.key}>
                <tr className={cx(state.submitted && 'opacity-70')}>
                  <td className={cx(state.error && 'border-b-0')}>{!state.submitted && selectBox(row)}</td>
                  <td className={cx('max-w-[200px]', state.error && 'border-b-0')}>
                    <p className="code whitespace-nowrap">{row.poNumber} · {row.poItemNo}</p>
                    {row.materialDesc ? <p className="truncate text-xs text-inkSoft" title={row.materialDesc}>{row.materialDesc}</p> : null}
                  </td>
                  <td className={cx('max-w-[180px]', state.error && 'border-b-0')}>
                    <p className="line-clamp-2 text-sm" title={row.serviceText}>{row.serviceText || '—'}</p>
                  </td>
                  <td className={cx('whitespace-nowrap', state.error && 'border-b-0')}>{formatDisplayDate(row.deliveryDate)}</td>
                  <td className={cx('num whitespace-nowrap text-right font-semibold text-ledger', state.error && 'border-b-0')}>
                    {row.provisionValue ? `${row.provisionValue} ${row.currency}` : '—'}
                  </td>
                  <td className={cx(state.error && 'border-b-0')}>
                    <YesNo value={state.delvConf} onChange={(v) => handleDelvConfChange(row.key, v)} disabled={state.submitted} />
                  </td>
                  {state.delvConf ? (state.submitted ? (
                    <>
                      <td className={cx('code', state.error && 'border-b-0')}>{state.invoiceNo || '—'}</td>
                      <td className={cx('whitespace-nowrap', state.error && 'border-b-0')}>{formatDisplayDate(state.invoiceDate)}</td>
                      <td className={cx('num text-right', state.error && 'border-b-0')}>{state.invoiceAmount || '—'}</td>
                      <td className={cx('max-w-[160px] truncate', state.error && 'border-b-0')}>{state.attachmentName || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className={cx('min-w-[120px]', state.error && 'border-b-0')}>
                        <Input aria-label="Invoice Number" value={state.invoiceNo} onChange={(e) => patchRow(row.key, { invoiceNo: e.target.value })} />
                      </td>
                      <td className={cx('min-w-[130px]', state.error && 'border-b-0')}>
                        <DateField value={state.invoiceDate} onChange={(v) => patchRow(row.key, { invoiceDate: v })} label="Invoice Date" />
                      </td>
                      <td className={cx('min-w-[110px]', state.error && 'border-b-0')}>
                        <Input
                          aria-label="Invoice Amount"
                          inputMode="decimal"
                          className="num text-right"
                          value={state.invoiceAmount}
                          onChange={(e) => patchRow(row.key, { invoiceAmount: e.target.value })}
                        />
                      </td>
                      <td className={cx('w-[160px] max-w-[160px]', state.error && 'border-b-0')}>
                        <AttachButton fileName={state.attachmentName} attaching={state.attaching} onPick={() => handlePickAttachment(row.key)} />
                      </td>
                    </>
                  )) : (
                    <td colSpan={4} className={cx(state.error && 'border-b-0')}>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="shrink-0">
                          <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkFaint">Revised Delivery Date</p>
                          <p className="flex items-center gap-1 text-sm font-semibold text-amber">
                            <CalendarClock size={12} /> {formatDisplayDate(state.revisedDelDate)}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-2xs font-bold uppercase tracking-[0.06em] text-inkFaint">Comments</p>
                          <p className="line-clamp-2 text-sm text-ink" title={state.comments}>{state.comments || '—'}</p>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className={cx('text-right', state.error && 'border-b-0')}>
                    <div className="flex items-center justify-end gap-1">
                      {quotationBtn(row)}
                      {state.submitted ? sentChip : sendBtn(row, state)}
                    </div>
                  </td>
                </tr>
                {state.error && (
                  <tr className="hover:bg-transparent">
                    <td />
                    <td colSpan={10} className="pt-0 text-xs font-semibold text-red">{state.error}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );

  /* ------------------------------------------------------------ mobile: compact cards ----- */

  const renderCards = () => (
    <div className="flex flex-col gap-2">
      {monthYearRows.map((row) => {
        const state = rowState[row.key];
        if (!state) return null;
        return (
          <Card key={row.key} className={cx('flex flex-col gap-2', state.submitted && 'opacity-70')}>
            <div className="flex flex-wrap items-center gap-1.5">
              {!state.submitted && selectBox(row)}
              <div className="min-w-0 flex-1">
                <p className="code text-ink">PO {row.poNumber} · Item {row.poItemNo}</p>
                {row.materialDesc ? <p className="truncate text-xs text-inkSoft">{row.materialDesc}</p> : null}
              </div>
              {quotationBtn(row)}
              {state.submitted && sentChip}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <InfoField label="Service Text" value={row.serviceText} className="col-span-2" />
              <InfoField label="Delivery Date" value={formatDisplayDate(row.deliveryDate)} />
              <InfoField label="Provision Value" value={row.provisionValue ? `${row.provisionValue} ${row.currency}` : '—'} />
              {state.delvConf && (state.submitted ? (
                <>
                  <InfoField label="Invoice Number" value={state.invoiceNo} mono />
                  <InfoField label="Invoice Date" value={formatDisplayDate(state.invoiceDate)} />
                  <InfoField label="Invoice Amount" value={state.invoiceAmount} />
                  <InfoField label="Attach Invoice (PDF)" value={state.attachmentName} />
                </>
              ) : (
                <>
                  <Field label="Invoice Number">
                    <Input value={state.invoiceNo} onChange={(e) => patchRow(row.key, { invoiceNo: e.target.value })} />
                  </Field>
                  <Field label="Invoice Date">
                    <DateField value={state.invoiceDate} onChange={(v) => patchRow(row.key, { invoiceDate: v })} label="Invoice Date" />
                  </Field>
                  <Field label="Invoice Amount">
                    <Input inputMode="decimal" value={state.invoiceAmount} onChange={(e) => patchRow(row.key, { invoiceAmount: e.target.value })} />
                  </Field>
                  <Field label="Attach Invoice (PDF)">
                    <AttachButton fileName={state.attachmentName} attaching={state.attaching} onPick={() => handlePickAttachment(row.key)} />
                  </Field>
                </>
              ))}
              {!state.delvConf && (
                <>
                  <InfoField label="Revised Delivery Date" value={formatDisplayDate(state.revisedDelDate)} />
                  <InfoField label="Comments" value={state.comments} />
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
              <span className="text-sm font-bold text-ink">Delivery Confirmed?</span>
              <YesNo value={state.delvConf} onChange={(v) => handleDelvConfChange(row.key, v)} disabled={state.submitted} />
            </div>

            {state.error && <p className="text-xs font-semibold text-red">{state.error}</p>}

            {!state.submitted && <div>{sendBtn(row, state)}</div>}
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        eyebrow="Service PO Automation"
        title="Upcoming Provision — All Vendors"
        subtitle="Confirm delivery for each vendor's PO item, add the invoice details, and send it for approval."
        icon={Users}
      />

      {banner && (
        <Banner type={banner.type} onClose={() => setBanner(null)}>{banner.message}</Banner>
      )}

      {loading ? (
        <LoadingBlock label="Loading upcoming provision items…" />
      ) : loadError ? (
        <Banner type="error">{loadError}</Banner>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No upcoming provision items." />
      ) : monthYearRows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No upcoming provision items for the selected month/year." />
      ) : (
        <Card ledger className="flex flex-col gap-2">
          <CardTitle
            icon={CalendarClock}
            title="Upcoming items"
            hint={`${monthYearRows.length} item(s)`}
          />
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rust/25 bg-rust/5 px-3 py-1.5">
              <span className="text-sm font-bold text-ink">{selected.size} selected</span>
              <Button size="sm" variant="primary" icon={Send} loading={massSubmitting} onClick={submitSelected}>
                Send Selected for Approval
              </Button>
            </div>
          )}
          {isDesktopWeb ? renderTable() : renderCards()}
        </Card>
      )}

      <Modal
        open={modalKey !== null}
        size="sm"
        title="Delivery Not Confirmed"
        subtitle="Revised Delivery Date and Comments are required."
        onClose={cancelModal}
        footer={(
          <>
            <Button onClick={cancelModal}>Cancel</Button>
            <Button variant="primary" onClick={confirmModal}>Save</Button>
          </>
        )}
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Revised Delivery Date *"
            error={modalTouched && !modalDraft.revisedDelDate ? 'Revised Delivery Date is required.' : undefined}
          >
            <DateField
              value={modalDraft.revisedDelDate}
              onChange={(v) => setModalDraft((prev) => ({ ...prev, revisedDelDate: v }))}
              label="Revised Delivery Date"
              min={todayIso()}
            />
          </Field>
          <Field
            label="Comments *"
            error={modalTouched && !modalDraft.comments.trim() ? 'Comments are required.' : undefined}
          >
            <TextArea
              value={modalDraft.comments}
              onChange={(e) => setModalDraft((prev) => ({ ...prev, comments: e.target.value }))}
              placeholder="Reason for the delay…"
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      {quotation && <QuotationPreviewModal attachment={quotation} onClose={() => setQuotation(null)} />}
    </div>
  );
}
