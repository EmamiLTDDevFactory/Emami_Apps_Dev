'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  Download,
  FileCheck2,
  Hourglass,
  Info,
  Lock,
  Mail,
  Paperclip,
  Search,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchPendingApprovals,
  submitApprovalDecision,
  submitApprovalDecisionBatch,
  PENDING_APPROVAL_ACTIONS,
  PENDING_APPROVAL_ACTION_LABELS,
  type ApprovalDecision,
  type InvoiceEditOverrides,
  type PendingApprovalAction,
  type VendorPOFollowupRow,
} from '../../lib/paymentTrackingApi';
import { base64ToBlob, base64ToBytes, ensureAttachmentUnderLimit, looksLikePdf, readAttachmentAsBase64 } from '../../lib/pdfAttachment';
import { getDocumentAsync } from '../../lib/documentPicker';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { filterByMonth, filterByFiscalYear, formatDeliveryDate } from '../../lib/provisionMetrics';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  DateField,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Spinner,
  TableWrap,
  cx,
} from '../../components/ui';

/** Per-row decision state — 'idle' until the Admin acts on it, then locks into whichever decision
 * went through (or an error, which leaves it actionable again). attachmentError is only for the
 * rare case opening an in-hand attachment fails (e.g. malformed base64) — whether one exists at
 * all is read straight off the row (see the attachment cell below), not tracked here. The four
 * invoice fields (invoiceNo/invoiceDate/invoiceAmount/attachment) are editable here too, per
 * instruction — seeded from whatever the row already had, same posture as Submission History's own
 * RowState. */
interface RowState {
  deciding: ApprovalDecision | null; // which action is in flight, if any
  decided: ApprovalDecision | null; // which action has gone through
  error: string | null;
  attachmentError: string | null;
  invoiceNo: string;
  invoiceDate: string;
  invoiceAmount: string;
  attachmentName: string;
  attachmentBase64: string;
  attachmentMimeType: string;
  attaching: boolean;
  /** In flight for the standalone "Save" button (Zaction 'S') — separate from `deciding`, since
   * saving the edited invoice fields never decides the row (see saveInvoiceRow below). */
  savingInvoice: boolean;
}

function initialRowState(row: VendorPOFollowupRow): RowState {
  return {
    deciding: null,
    decided: null,
    error: null,
    attachmentError: null,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    invoiceAmount: row.invoiceAmount,
    attachmentName: row.filename,
    attachmentBase64: row.attachmentBase64,
    attachmentMimeType: row.mimetype,
    attaching: false,
    savingInvoice: false,
  };
}

type DecisionFilter = 'all' | 'pending' | 'A';

const DECISION_FILTERS: { key: DecisionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'A', label: 'Approved' },
];

type ActionFilter = 'all' | PendingApprovalAction;

/** Per-Zaction color + icon so Admin can tell at a glance which type of approval a row is —
 * mirrors Submission History's STATUS_STYLE (same ZROLE_ACTION codes), plus a neutral fallback for
 * any row whose Zaction doesn't match one of the five known codes. Class strings are spelled out in
 * full so Tailwind's JIT picks them up. */
interface ActionStyle {
  icon: LucideIcon;
  text: string; // text colour
  chip: string; // tinted chip (badge)
  active: string; // active filter chip
  edge: string; // left accent on the row
}
const ACTION_STYLE: Record<PendingApprovalAction, ActionStyle> = {
  RD: { icon: CalendarClock, text: 'text-amber', chip: 'bg-amberBg text-amber border-amber/30', active: 'bg-amberBg text-amber border-amber', edge: 'border-l-amber' },
  SA: { icon: Hourglass, text: 'text-blue', chip: 'bg-blueBg text-blue border-blue/30', active: 'bg-blueBg text-blue border-blue', edge: 'border-l-blue' },
  AS: { icon: CheckCircle2, text: 'text-green', chip: 'bg-greenBg text-green border-green/30', active: 'bg-greenBg text-green border-green', edge: 'border-l-green' },
  RS: { icon: Undo2, text: 'text-red', chip: 'bg-redBg text-red border-red/30', active: 'bg-redBg text-red border-red', edge: 'border-l-red' },
  MS: { icon: Mail, text: 'text-teal', chip: 'bg-tealBg text-teal border-teal/30', active: 'bg-tealBg text-teal border-teal', edge: 'border-l-teal' },
};
const UNKNOWN_ACTION_STYLE: ActionStyle = { icon: Circle, text: 'text-inkSoft', chip: 'bg-appBg text-inkSoft border-border', active: 'bg-appBg text-ink border-inkSoft', edge: 'border-l-inkSoft' };

function actionStyleFor(zaction: string) {
  return ACTION_STYLE[zaction as PendingApprovalAction] || UNKNOWN_ACTION_STYLE;
}

function actionLabelFor(zaction: string) {
  return PENDING_APPROVAL_ACTION_LABELS[zaction as PendingApprovalAction] || zaction || 'Unknown';
}

/** Approve button copy per approval type, so Admin knows exactly what they're approving without
 * reading the fields first — e.g. "Approve Revised Delivery Date" instead of a bare "Approve" that
 * could mean the delivery date change or the SES itself. Only RD/SA are specified; any other type
 * (or an unrecognized code) falls back to the generic "Approve". */
const APPROVAL_BUTTON_LABELS: Partial<Record<PendingApprovalAction, { approve: string }>> = {
  RD: { approve: 'Approve Revised Delivery Date' },
  SA: { approve: 'Approve for SES' },
};

function approveLabelFor(zaction: string) {
  return APPROVAL_BUTTON_LABELS[zaction as PendingApprovalAction]?.approve || 'Approve';
}

/** Un-truncated badge naming what this row is actually asking the Admin to approve (a long label
 * like "Approval for Revised Delivery Date" wraps rather than clipping). */
function ActionBadge({ zaction }: { zaction: string }) {
  const style = actionStyleFor(zaction);
  const Icon = style.icon;
  return (
    <span className={cx('inline-flex items-start gap-1 rounded-md border px-1.5 py-[3px] text-2xs font-extrabold leading-tight', style.chip)}>
      <Icon size={12} className="mt-[1px] shrink-0" />
      <span>{actionLabelFor(zaction)}</span>
    </span>
  );
}

/** In-app attachment preview — an <iframe> onto the attachment's blob URL, so the browser's own
 * PDF viewer (scroll, zoom in/out, its own print/download controls) renders inside the modal
 * instead of a bare new tab. Plus an explicit Download button, since not every browser's inline
 * viewer makes that obvious. */
function AttachmentPreviewModal({
  blobUrl,
  filename,
  onClose,
}: {
  blobUrl: string | null;
  filename: string;
  onClose: () => void;
}) {
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
    <Modal
      title={filename || 'Attachment'}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          <Button size="sm" variant="primary" icon={Download} onClick={handleDownload} aria-label="Download attachment">Download</Button>
        </>
      }
    >
      <iframe
        src={blobUrl}
        title={filename || 'Attachment preview'}
        className="block h-[72vh] w-full rounded-lg border-0 bg-appBg"
      />
    </Modal>
  );
}

/** Admin's Pending Approval — every ZVendorPOFollowupSet row scoped to the signed-in Admin's own
 * login email and Zaction 'PA' (see fetchPendingApprovals). Each row: PO Number/PO Line Item/Service Description/
 * Provisional Value/Currency/Revised Del Date/Delivery date/Comments/Invoice No/Invoice Date/
 * Invoice Amount, with an Approve action — row-wise or as a multi-select mass batch — calling the
 * same ZProvHeader POST as Upcoming Provision's "send for approval" (see paymentTrackingApi.ts's
 * submitApprovalDecision/submitApprovalDecisionBatch). Reject was removed per instruction — there
 * is no reject action on this screen anymore. Also filtered by the shared Month/Year bar and by
 * SAP's own Stat field (Pending/Approved tabs — see effectiveStatus below), not just this session's
 * own in-memory decisions. */
export default function PendingApproval() {
  const { email, role, roleLoading } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<VendorPOFollowupRow[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [massDeciding, setMassDeciding] = useState<ApprovalDecision | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [preview, setPreview] = useState<{ blobUrl: string; filename: string } | null>(null);

  useEffect(() => {
    if (roleLoading) return;
    if (role !== 'Finance' || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchPendingApprovals(email)
      .then((data) => {
        setRows(data);
        const state: Record<string, RowState> = {};
        data.forEach((r) => {
          const s = initialRowState(r);
          // Seed decided from SAP's own Stat so a row already approved in an earlier session (or
          // by someone else) renders as Approved on load, not as still-actionable.
          if ((r.status || '').trim() === 'A') s.decided = 'A';
          state[r.key] = s;
        });
        setRowState(state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not load pending approvals.'))
      .finally(() => setLoading(false));
  }, [email, role, roleLoading]);

  const patchRow = useCallback((key: string, patch: Partial<RowState>) => {
    setRowState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // Month/Year (the bar every Provision Tracking screen shares) narrows by delivery date
  // client-side, same as every other screen; ZVendorPOFollowupSet has no Gjahr server filter to
  // send the year to, unlike ZProvisionTrackSet, so both dimensions apply here.
  const monthYearRows = useMemo(
    () => filterByFiscalYear(filterByMonth(rows, month), year),
    [rows, month, year]
  );

  const currencies = useMemo(
    () => Array.from(new Set(monthYearRows.map((r) => r.currency).filter(Boolean))).sort(),
    [monthYearRows]
  );

  // A row's effective status: whatever this Admin already decided this session takes priority
  // (so an acted-on row moves tabs immediately, without waiting on a refetch), otherwise it's SAP's
  // own Stat field ('P' pending, 'A' approved, ' '/blank = not yet submitted) — real server state,
  // not just "untouched in this browser session" the way the old decided-only check was.
  const effectiveStatus = useCallback(
    (row: VendorPOFollowupRow): string => {
      const decided = rowState[row.key]?.decided ?? null;
      if (decided) return decided;
      return (row.status || '').trim();
    },
    [rowState]
  );

  // Search + filter narrows what's shown, but selection/decision state stays keyed by the full row
  // set — a row selected before a search term hides it stays selected, same as any other filtered
  // list, so "Select all" below only ever (de)selects what's currently visible.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthYearRows.filter((row) => {
      if (decisionFilter === 'pending' && effectiveStatus(row) !== 'P') return false;
      if (decisionFilter === 'A' && effectiveStatus(row) !== 'A') return false;
      if (currencyFilter !== 'all' && row.currency !== currencyFilter) return false;
      if (actionFilter !== 'all' && row.zaction !== actionFilter) return false;
      if (q) {
        const haystack = [
          row.poNumber, row.poItemNo, row.vendorName, row.materialDesc, row.invoiceNo, row.comments,
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [monthYearRows, effectiveStatus, search, decisionFilter, currencyFilter, actionFilter]);

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = filteredRows.filter((r) => !rowState[r.key]?.decided);
    setSelected((prev) => {
      const allChecked = selectable.length > 0 && selectable.every((r) => prev.has(r.key));
      const next = new Set(prev);
      selectable.forEach((r) => { if (allChecked) next.delete(r.key); else next.add(r.key); });
      return next;
    });
  };

  // Whatever the Admin typed into the four invoice fields for this row rides along on the same
  // POST as the decision itself (see submitApprovalDecision's overridesByKey param) — undefined
  // fields mean "leave whatever the row already had".
  const overridesFor = (key: string): InvoiceEditOverrides => {
    const state = rowState[key];
    return {
      invoiceNo: state?.invoiceNo,
      invoiceDate: state?.invoiceDate,
      invoiceAmount: state?.invoiceAmount,
      attachmentBase64: state?.attachmentBase64,
      attachmentMimeType: state?.attachmentMimeType,
      attachmentName: state?.attachmentName,
    };
  };

  // Attach Invoice (PDF) — same picker/compress/limit flow as Upcoming Provision's
  // handlePickAttachment (see pdfAttachment.ts).
  const handlePickAttachment = async (key: string) => {
    patchRow(key, { error: null });
    try {
      const result = await getDocumentAsync({ type: 'application/pdf' });
      if (result.canceled) return;
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

  const decideRow = async (row: VendorPOFollowupRow, decision: ApprovalDecision) => {
    patchRow(row.key, { deciding: decision, error: null });
    try {
      await submitApprovalDecision([row], email || '', decision, { [row.key]: overridesFor(row.key) });
      patchRow(row.key, { deciding: null, decided: decision });
      setBanner({
        type: 'success',
        message: `PO ${row.poNumber} / Item ${row.poItemNo} ${decision === 'A' ? 'approved' : 'rejected'}.`,
      });
    } catch (e) {
      patchRow(row.key, { deciding: null, error: e instanceof Error ? e.message : 'Could not save this decision.' });
    }
  };

  const decideSelected = async (decision: ApprovalDecision) => {
    const targets = rows.filter((r) => selected.has(r.key) && !rowState[r.key]?.decided);
    if (targets.length === 0) return;

    setMassDeciding(decision);
    targets.forEach((r) => patchRow(r.key, { deciding: decision, error: null }));

    const overridesByKey: Record<string, InvoiceEditOverrides> = {};
    targets.forEach((r) => { overridesByKey[r.key] = overridesFor(r.key); });
    const failures = await submitApprovalDecisionBatch(targets, email || '', decision, overridesByKey);
    const failedLifnrs = new Set(failures.map((f) => f.lifnr));
    targets.forEach((row) => {
      if (failedLifnrs.has(row.lifnr)) {
        const failure = failures.find((f) => f.lifnr === row.lifnr);
        patchRow(row.key, { deciding: null, error: failure?.error || 'Could not save this decision.' });
      } else {
        patchRow(row.key, { deciding: null, decided: decision });
      }
    });
    setSelected(new Set());
    setMassDeciding(null);

    if (failures.length === 0) {
      setBanner({ type: 'success', message: `${targets.length} item(s) ${decision === 'A' ? 'approved' : 'rejected'}.` });
    } else {
      setBanner({ type: 'error', message: `${failures.length} vendor group(s) failed — see the affected rows below.` });
    }
  };

  // Standalone Save — Zaction 'S' on the same ZProvHeaderSet POST, per instruction, so Admin can
  // persist an edited invoice field/attachment without also deciding the row (unlike decideRow,
  // this never touches `decided`, so Approve stays available afterward).
  const saveInvoiceRow = async (row: VendorPOFollowupRow) => {
    patchRow(row.key, { savingInvoice: true, error: null });
    try {
      await submitApprovalDecision([row], email || '', 'S', { [row.key]: overridesFor(row.key) });
      patchRow(row.key, { savingInvoice: false });
      setBanner({ type: 'success', message: `Invoice details saved for PO ${row.poNumber} / Item ${row.poItemNo}.` });
    } catch (e) {
      patchRow(row.key, { savingInvoice: false, error: e instanceof Error ? e.message : 'Could not save the invoice details.' });
    }
  };

  // The attachment (if any) comes back inline on the row itself — Filename/Mimetype/Value on the
  // same GET as every other field (see paymentTrackingApi.ts) — so opening it is just decoding the
  // base64 already in hand, no extra request. Opens in-app (AttachmentPreviewModal) rather than a
  // bare new tab, so Admin/User get a scroll/zoom/download-capable view without leaving the app.
  const viewAttachment = (row: VendorPOFollowupRow) => {
    if (!row.attachmentBase64) return;
    try {
      const bytes = base64ToBytes(row.attachmentBase64);
      if (!looksLikePdf(bytes)) {
        patchRow(row.key, {
          attachmentError: 'This attachment did not come through as a valid PDF (it may be corrupted or incomplete on the SAP side) — try again, or ask SAP support to check the file.',
        });
        return;
      }
      // Every attachment on this entity is a PDF by construction (mandatory PDF-only picker on the
      // upload side) — SAP's own Mimetype field isn't reliably populated, so it's hardcoded here
      // rather than trusted: a blank/wrong Mimetype made the browser render the raw bytes as text
      // instead of invoking its PDF viewer.
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
    return <LoadingBlock label="" />;
  }

  // Defense in depth — the nav bar already hides this link from non-Finance roles, but the route
  // is still reachable by a typed URL.
  if (role !== 'Finance') {
    return <EmptyState icon={Lock} title="Pending Approval is only available to Finance." />;
  }

  const selectableCount = filteredRows.filter((r) => !rowState[r.key]?.decided).length;
  const allSelected = selectableCount > 0 && filteredRows.filter((r) => !rowState[r.key]?.decided).every((r) => selected.has(r.key));

  const filterChip = (active: boolean, activeCls = 'border-rust bg-rust/10 text-rust') =>
    cx(
      'inline-flex h-[24px] items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-2xs font-bold transition-colors',
      active ? activeCls : 'border-border bg-white text-inkSoft hover:text-ink'
    );

  return (
    <>
      <PageHeader
        eyebrow="Admin · Cross-org"
        title="Pending Approval"
        subtitle="Review every vendor's submitted PO item and approve or reject it — one at a time, or as a mass action."
        icon={BadgeCheck}
      />

      <div className="flex flex-col gap-2">
        {banner && (
          <Banner type={banner.type} onClose={() => setBanner(null)}>{banner.message}</Banner>
        )}

        {loading ? (
          <LoadingBlock label="Loading pending approvals…" />
        ) : loadError ? (
          <p className="text-sm font-semibold text-red">{loadError}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-inkSoft">No pending approvals.</p>
        ) : (
          <Card ledger className="flex flex-col gap-2">
            {/* Filters: search, decision, currency, approval type */}
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PO, vendor, invoice, comments…"
                  className="pl-7 pr-7"
                />
                {search.length > 0 && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-inkSoft hover:text-ink">
                    <XCircle size={13} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DECISION_FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setDecisionFilter(f.key)} className={filterChip(decisionFilter === f.key)} aria-label={`Filter: ${f.label}`}>
                    {f.label}
                  </button>
                ))}
                {currencies.length > 1 && (
                  <>
                    <span className="mx-0.5 h-3.5 w-px bg-border" />
                    <button type="button" onClick={() => setCurrencyFilter('all')} className={filterChip(currencyFilter === 'all')}>All Currencies</button>
                    {currencies.map((c) => (
                      <button key={c} type="button" onClick={() => setCurrencyFilter(c)} className={filterChip(currencyFilter === c)}>{c}</button>
                    ))}
                  </>
                )}
                <span className="ml-auto text-2xs font-semibold text-inkSoft">{filteredRows.length} of {rows.length}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setActionFilter('all')} className={filterChip(actionFilter === 'all')} aria-label="Filter: All approval types">All Types</button>
                {PENDING_APPROVAL_ACTIONS.map((a) => {
                  const active = actionFilter === a;
                  const style = ACTION_STYLE[a];
                  const Icon = style.icon;
                  return (
                    <button key={a} type="button" onClick={() => setActionFilter(a)} className={filterChip(active, style.active)} aria-label={`Filter: ${PENDING_APPROVAL_ACTION_LABELS[a]}`}>
                      <Icon size={11} className={active ? style.text : 'text-inkSoft'} />
                      {PENDING_APPROVAL_ACTION_LABELS[a]}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-inkSoft">No items match your search/filter.</p>
            ) : (
              <>
                {/* Select all + mass action bar */}
                <div className="flex min-h-[30px] flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-cream/60 px-2.5 py-1">
                  <Checkbox checked={allSelected} onChange={() => toggleSelectAll()} label={<span className="text-xs font-bold">Select all</span>} />
                  {selected.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink">{selected.size} selected</span>
                      <Button
                        size="sm"
                        variant="success"
                        icon={CheckCircle2}
                        loading={massDeciding === 'A'}
                        disabled={massDeciding !== null}
                        onClick={() => decideSelected('A')}
                      >
                        Approve Selected
                      </Button>
                    </div>
                  )}
                </div>

                <TableWrap maxHeight="72vh">
                  <table className="tbl min-w-[1180px]">
                    <thead>
                      <tr>
                        <th className="w-8" />
                        <th>Type</th>
                        <th>PO · Item / Vendor</th>
                        <th>Service Description</th>
                        <th className="text-right">Provisional Value</th>
                        <th>Delivery Date</th>
                        <th>Comments</th>
                        <th className="min-w-[120px]">Invoice No</th>
                        <th className="min-w-[130px]">Invoice Date</th>
                        <th className="min-w-[110px] text-right">Invoice Amount</th>
                        <th className="min-w-[140px]">Attach Invoice (PDF)</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const state = rowState[row.key];
                        if (!state) return null;
                        const busy = state.deciding !== null;
                        const actionStyle = actionStyleFor(row.zaction);
                        const showInvoice = row.zaction !== 'RD';
                        const editable = showInvoice && !state.decided;
                        const hasErrors = !!(state.error || state.attachmentError);
                        return (
                          <React.Fragment key={row.key}>
                            <tr className={cx('align-top', state.decided && 'opacity-70')}>
                              <td className={cx('border-l-[3px]', actionStyle.edge, hasErrors && 'border-b-0')}>
                                {!state.decided && (
                                  <Checkbox
                                    checked={selected.has(row.key)}
                                    onChange={() => toggleSelected(row.key)}
                                  />
                                )}
                              </td>
                              <td className={cx('max-w-[170px]', hasErrors && 'border-b-0')}>
                                <ActionBadge zaction={row.zaction} />
                              </td>
                              <td className={cx('max-w-[220px]', hasErrors && 'border-b-0')}>
                                <p className="code whitespace-nowrap">
                                  {row.poNumber || '—'} <span className="text-inkFaint">·</span> {row.poItemNo || '—'}
                                </p>
                                {row.vendorName ? <p className="truncate text-xs text-inkSoft" title={row.vendorName}>{row.vendorName}</p> : null}
                                {/* Existing inline attachment (from the row's own GET) */}
                                {row.filename ? (
                                  row.attachmentBase64 ? (
                                    <button
                                      type="button"
                                      onClick={() => viewAttachment(row)}
                                      className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-[1px] text-2xs font-bold text-rust hover:border-rust/50 hover:bg-rust/5"
                                      aria-label={`View or download attachment for PO ${row.poNumber} item ${row.poItemNo}`}
                                    >
                                      <Paperclip size={11} /> Attachment
                                    </button>
                                  ) : (
                                    // Filename comes through with no content (Value empty) — originally assumed
                                    // to mean "backend skips anything over 2MB", but that's been confirmed wrong
                                    // for at least one case where the actual file is well under 2MB and still
                                    // comes back this way. So this no longer asserts a specific reason — SAP just
                                    // isn't returning the bytes, for whatever cause, and that needs SAP Basis to
                                    // look at GET_ENTITYSET directly. An info icon (not the attach icon) so this
                                    // reads as an intentional status message rather than a broken button — there's
                                    // no click handler at all.
                                    <span
                                      className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-appBg px-1.5 py-[1px] text-2xs font-bold text-inkSoft"
                                      aria-label={`Attachment "${row.filename}" has no content available to preview`}
                                    >
                                      <Info size={11} /> Attachment unavailable
                                    </span>
                                  )
                                ) : null}
                              </td>
                              <td className={cx('max-w-[220px]', hasErrors && 'border-b-0')}>
                                <p className="line-clamp-2 text-xs" title={row.serviceText}>{row.serviceText || '—'}</p>
                              </td>
                              <td className={cx('whitespace-nowrap text-right', hasErrors && 'border-b-0')}>
                                <span className="num font-semibold text-ledger">{row.provisionValue || '—'}</span>{' '}
                                <span className="text-2xs font-bold text-inkSoft">{row.currency || '—'}</span>
                              </td>
                              <td className={cx('whitespace-nowrap', hasErrors && 'border-b-0')}>
                                {row.revisedDeliveryDate ? (
                                  <div className="rounded-md border border-amber/25 bg-amberBg px-1.5 py-1" title="Requested to overwrite delivery date">
                                    <p className="text-2xs font-bold uppercase tracking-wide text-amber">Requested to overwrite delivery date</p>
                                    <p className="flex items-center gap-1 text-xs font-semibold">
                                      <span className="text-inkSoft line-through">{formatDeliveryDate(row.deliveryDate) || '—'}</span>
                                      <ArrowRight size={11} className="text-amber" />
                                      <span className="font-extrabold text-amber">{formatDeliveryDate(row.revisedDeliveryDate)}</span>
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-xs font-semibold">{formatDeliveryDate(row.deliveryDate) || '—'}</span>
                                )}
                              </td>
                              <td className={cx('max-w-[200px]', hasErrors && 'border-b-0')}>
                                <p className="line-clamp-2 text-xs" title={row.comments}>{row.comments || '—'}</p>
                              </td>
                              {!showInvoice ? (
                                <td colSpan={4} className={cx('text-xs text-inkFaint', hasErrors && 'border-b-0')}>—</td>
                              ) : editable ? (
                                <>
                                  <td className={cx(hasErrors && 'border-b-0')}>
                                    <Input aria-label="Invoice No" value={state.invoiceNo} onChange={(e) => patchRow(row.key, { invoiceNo: e.target.value })} className="h-[26px] text-xs" />
                                  </td>
                                  <td className={cx(hasErrors && 'border-b-0')}>
                                    <DateField label="Invoice Date" value={state.invoiceDate} onChange={(v) => patchRow(row.key, { invoiceDate: v })} className="h-[26px] text-xs" />
                                  </td>
                                  <td className={cx(hasErrors && 'border-b-0')}>
                                    <Input aria-label="Invoice Amount" inputMode="decimal" value={state.invoiceAmount} onChange={(e) => patchRow(row.key, { invoiceAmount: e.target.value })} className="num h-[26px] text-right text-xs" />
                                  </td>
                                  <td className={cx(hasErrors && 'border-b-0')}>
                                    <button
                                      type="button"
                                      onClick={() => handlePickAttachment(row.key)}
                                      disabled={state.attaching}
                                      className="inline-flex h-[26px] w-full max-w-[180px] items-center gap-1 rounded-lg border border-border bg-white px-2 text-xs font-semibold text-ink hover:border-rust/40 disabled:opacity-60"
                                    >
                                      {state.attaching ? <Spinner size={12} /> : state.attachmentName ? <FileCheck2 size={12} className="shrink-0 text-rust" /> : <Paperclip size={12} className="shrink-0 text-rust" />}
                                      <span className="truncate">{state.attaching ? 'Attaching…' : (state.attachmentName || 'Choose PDF file')}</span>
                                    </button>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className={cx(hasErrors && 'border-b-0')}><span className="code">{state.invoiceNo || '—'}</span></td>
                                  <td className={cx('whitespace-nowrap text-xs', hasErrors && 'border-b-0')}>{formatDeliveryDate(state.invoiceDate) || '—'}</td>
                                  <td className={cx('num text-right', hasErrors && 'border-b-0')}>{state.invoiceAmount || '—'}</td>
                                  <td className={cx('text-xs text-inkFaint', hasErrors && 'border-b-0')}>—</td>
                                </>
                              )}
                              <td className={cx('text-right', hasErrors && 'border-b-0')}>
                                {state.decided ? (
                                  <span className="chip bg-greenBg text-green"><CheckCircle2 size={10} /> Approved</span>
                                ) : (
                                  <div className="flex flex-col items-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="success"
                                      loading={state.deciding === 'A'}
                                      disabled={busy || state.savingInvoice}
                                      onClick={() => decideRow(row, 'A')}
                                    >
                                      {approveLabelFor(row.zaction)}
                                    </Button>
                                    {showInvoice && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="text-rust"
                                        loading={state.savingInvoice}
                                        disabled={busy || state.savingInvoice}
                                        onClick={() => saveInvoiceRow(row)}
                                      >
                                        Save Invoice Details
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                            {hasErrors && (
                              <tr className="hover:bg-transparent">
                                <td className={cx('border-l-[3px] pt-0', actionStyle.edge)} />
                                <td colSpan={11} className="pt-0">
                                  {state.error && <p className="text-xs font-semibold text-red">{state.error}</p>}
                                  {state.attachmentError && <p className="text-xs font-semibold text-red">{state.attachmentError}</p>}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              </>
            )}
          </Card>
        )}
      </div>
      <AttachmentPreviewModal blobUrl={preview?.blobUrl ?? null} filename={preview?.filename ?? ''} onClose={closePreview} />
    </>
  );
}
