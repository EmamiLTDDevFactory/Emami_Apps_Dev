'use client';

import React, { Suspense, useEffect, useState } from 'react';
import axios from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp, Download, Eye, Pencil, Search, X } from 'lucide-react';
import { SAP_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import { formatCurrency } from '../../utils/currency';
import { formatSapErrorMessage } from '../../utils/sap-error';
import { Banner, Button, LoadingBlock, MessageModal, type MessageModalState, Modal, Spinner } from '../../components/ui';

const sapClient = axios.create({ validateStatus: () => true });

const formatDate = (value?: string) => {
  if (!value) return '';
  let d = new Date(value);
  const timestampMatch = value.match(/(\d+)/);
  if (timestampMatch && value.includes('/Date(')) {
    d = new Date(parseInt(timestampMatch[1], 10));
  }
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatTime = (value?: string) => {
  if (!value) return '';
  const match = value.match(/PT(\d+)H(\d+)M(\d+)S/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}:${match[3].padStart(2, '0')}`;
  return value;
};

const getStatusLabel = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'A': return 'Approved';
    case 'R': case 'REJECT': case 'REJECTED': return 'Rejected';
    case 'N': case 'SUBMIT': case 'RESUBMIT': return 'Submitted';
    case 'H': return 'HOD Approval';
    case 'C': return 'Created';
    default: return status || 'Unknown';
  }
};

const getActionLevelLabel = (level?: string) => {
  switch ((level || '').toUpperCase()) {
    case 'L1': return 'Manager Approval';
    case 'L2': return 'HOD Approval';
    default: return 'Employee Action';
  }
};

const getEntryDisplayLabel = (entry: any) => {
  const status = (entry?.Status || '').toString().toUpperCase();
  const action = (entry?.Action || '').toString().toUpperCase();
  if (status === 'S') return 'Posted';
  if (status === 'P') return 'Parked';
  if (status === 'H') return 'Pending at finance';
  if (action === 'APPROVE') return 'Approved';
  if (action === 'REJECT') return 'Rejected';
  if (action === 'SUBMIT' || action === 'RESUBMIT') return 'Submitted';
  if (status === 'A') return 'Approved';
  if (status === 'R') return 'Rejected';
  if (status === 'N') return 'Submitted';
  if (status === 'C') return 'Created';
  return entry?.Action || entry?.Status || 'Unknown';
};

const STATUS_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  posted: { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  parked: { bg: '#E0F2FE', border: '#0284C7', text: '#0369A1' },
  'pending at finance': { bg: '#FEF3C7', border: '#D97706', text: '#B45309' },
  submitted: { bg: '#DBEAFE', border: '#1D4ED8', text: '#1E3A8A' },
  rejected: { bg: '#FEE2E2', border: '#EF4444', text: '#B91C1C' },
};
const getStatusPalette = (status: string) => STATUS_PALETTE[(status || '').trim().toLowerCase()] || { bg: '#FFFFFF', border: '#E2E8F0', text: '#111827' };

const TAX_RESULTS_LIMIT = 50;

function ClaimDetailInner() {
  const searchParams = useSearchParams();
  const claimId = searchParams.get('id') || '';
  const router = useRouter();
  const { currentUser } = useAuth();
  const { setTempClaimForResubmit, approveClaim, rejectClaim, releasePayment, rejectClaimFinance, fetchTaxes } = useClaim();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionRemarks, setActionRemarks] = useState('');
  const [actionMode, setActionMode] = useState<'manager-reject' | 'finance-reject' | ''>('');
  const [taxModalVisible, setTaxModalVisible] = useState(false);
  const [availableTaxes, setAvailableTaxes] = useState<any[]>([]);
  const [selectedTaxCode, setSelectedTaxCode] = useState('');
  const [selectedTaxDescription, setSelectedTaxDescription] = useState('');
  const [taxDropdownOpen, setTaxDropdownOpen] = useState(false);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxSearch, setTaxSearch] = useState('');
  const [screenMessage, setScreenMessage] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ filename: string; mimetype: string; dataUri: string; raw: any } | null>(null);
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);

  const loadClaim = async () => {
    if (!claimId) return null;
    setLoading(true);
    try {
      // CLAIMNAV only populates when HISTORYNAV is expanded alongside it — expanding CLAIMNAV
      // alone silently returns an empty line-item list. Both must be requested together.
      const url = `${SAP_BASE_URL}/ClaimHeaderSet('${claimId}')?$format=json&$expand=${encodeURIComponent('CLAIMNAV,HISTORYNAV')}`;
      const resp = await sapClient.get(url);
      if (resp.status < 200 || resp.status >= 300) throw new Error('Failed to fetch claim');
      const nextData = resp.data?.d || resp.data || null;
      setData(nextData);
      return nextData;
    } catch (e: any) {
      console.error('Failed to load claim detail', e);
      setMessageModal({ title: 'Load Error', message: e?.message || String(e), type: 'error' });
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (claimId) loadClaim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId]);

  if (!claimId) return <div className="flex items-center justify-center py-20 text-red">No Claim ID supplied.</div>;
  if (loading) return <LoadingBlock label="Loading claim…" />;
  if (!data) return <div className="flex items-center justify-center py-20 text-red">Claim not found.</div>;

  const header = data;
  const lines = header.CLAIMNAV?.results || header.CLAIMNAV || [];
  const historyEntries = header.HISTORYNAV?.results || header.HISTORYNAV || [];

  const normalizedHeaderStatus = (header.Status || '').toString().toUpperCase();
  const currentUserId = (currentUser?.employeeId || '').toString().replace(/\D/g, '').padStart(8, '0');
  const claimApproverId = (header.CurrentApprover || '').toString().replace(/\D/g, '').padStart(8, '0');
  const isManagerRole = currentUser?.role === 'manager';
  const isFinanceRole = currentUser?.role === 'finance' || currentUser?.role === 'B';
  const isTopLevelPending = currentUser?.role === 'B' && normalizedHeaderStatus === 'P';
  const claimRaiserId = (header.EmpId || '').toString().replace(/\D/g, '').padStart(8, '0');
  const isOwnClaim = !!currentUserId && claimRaiserId === currentUserId;

  // Approve/Reject is for the ONE manager the claim is actually routed to. This must stay a full
  // AND, not an OR — an OR previously let any manager approve claims they themselves had raised,
  // because the status check alone satisfied the condition. See ClaimContext.tsx/plan notes.
  const showManagerActions =
    isManagerRole &&
    !isOwnClaim &&
    claimApproverId === currentUserId &&
    (normalizedHeaderStatus === 'N' || normalizedHeaderStatus === 'SUBMITTED');
  const showFinanceActions = isFinanceRole && (normalizedHeaderStatus === 'A' || normalizedHeaderStatus === 'APPROVED' || normalizedHeaderStatus === 'H' || normalizedHeaderStatus === 'PENDING RELEASE' || isTopLevelPending);

  const handlePreviewAttachment = (ln: any) => {
    const mimetype = ln.Mimetype || 'application/pdf';
    const filename = ln.Filename || 'attachment';
    const value = ln.Value;
    if (!value) { setMessageModal({ title: 'Attachment', message: 'No attachment data available', type: 'error' }); return; }
    setPreviewAttachment({ filename, mimetype, dataUri: `data:${mimetype};base64,${value}`, raw: ln });
  };

  const handleOpenAttachment = (ln: any) => {
    const mimetype = ln.Mimetype || 'application/pdf';
    const filename = ln.Filename || 'attachment.pdf';
    const value = ln.Value;
    if (!value) { setMessageModal({ title: 'Attachment', message: 'No attachment data available', type: 'error' }); return; }
    const dataUri = `data:${mimetype};base64,${value}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleManagerApprove = async () => {
    const result = await approveClaim(claimId);
    if (!result.success) { setMessageModal({ title: 'Approval Failed', message: result.error || 'Failed to approve claim.', type: 'error' }); return; }
    await loadClaim();
    setMessageModal({ title: 'Success', message: `Claim ${claimId} has been approved successfully.`, type: 'success' });
  };

  const handleOpenManagerReject = () => {
    setActionMode('manager-reject');
    setActionRemarks('');
    setActionModalVisible(true);
  };

  // Role B (top-level/Boss) must skip the tax-code modal just like Finance's own list already
  // does — previously Claim Detail asked role B to pick a tax code again even though Finance's
  // list correctly released GSTIN claims for role B without it. Authorized fix, same guard now
  // used in both places.
  const handleFinanceRelease = async () => {
    const hasGstin = header.Stcd3 || header.Lifnr;
    if (hasGstin && currentUser?.role !== 'B') {
      setTaxModalVisible(true);
      setTaxLoading(true);
      setTaxDropdownOpen(true);
      setTaxSearch('');
      const taxes = await fetchTaxes(claimId);
      setAvailableTaxes(taxes || []);
      setTaxLoading(false);
    } else {
      await executeReleasePayment();
    }
  };

  const executeReleasePayment = async (taxCode?: string, taxDescription?: string) => {
    const result = await releasePayment(claimId, taxCode, taxDescription);
    setTaxModalVisible(false);
    setSelectedTaxCode('');
    setSelectedTaxDescription('');
    setTaxDropdownOpen(false);
    setTaxSearch('');
    setAvailableTaxes([]);
    if (!result.success) {
      setScreenMessage({ title: 'Payment Release Failed', message: formatSapErrorMessage(result.error), type: 'error' });
      return;
    }
    await loadClaim();
    setMessageModal({ title: 'Success', message: `Claim ${claimId} has been paid successfully and workflow updated.`, type: 'success' });
  };

  const handleConfirmReleaseWithTax = () => {
    if (!selectedTaxCode) { setMessageModal({ title: 'Selection Required', message: 'Please select a tax code.', type: 'error' }); return; }
    executeReleasePayment(selectedTaxCode, selectedTaxDescription);
  };

  const handleOpenFinanceReject = () => {
    setActionMode('finance-reject');
    setActionRemarks('');
    setActionModalVisible(true);
  };

  const handleConfirmReject = async () => {
    const remarks = actionRemarks.trim();
    if (!remarks) { setMessageModal({ title: 'Validation Error', message: 'Rejection remarks are mandatory.', type: 'error' }); return; }
    const result = actionMode === 'finance-reject' ? await rejectClaimFinance(claimId, remarks) : await rejectClaim(claimId, remarks);
    if (!result.success) { setMessageModal({ title: 'Rejection Failed', message: result.error || 'Failed to reject claim.', type: 'error' }); return; }
    setActionModalVisible(false);
    await loadClaim();
    setMessageModal({ title: 'Success', message: `Claim ${claimId} has been rejected successfully.`, type: 'success' });
  };

  const normalizedStatus =
    header.Status === 'R' ? 'Rejected' :
    header.Status === 'A' ? 'Approved' :
    header.Status === 'N' ? 'Submitted' :
    header.Status === 'C' ? 'Created' :
    header.Status === 'H' ? 'Pending at Finance' :
    header.Status === 'P' ? 'Parked' :
    header.Status === 'S' ? 'Posted' : header.Status;

  const claimOwner = currentUser && currentUser.employeeId === header.EmpId;
  const canEdit = claimOwner && (header.Status === 'R' || String(header.Status).toLowerCase() === 'rejected');

  const groupedLines: any[] = [];
  lines.forEach((ln: any) => {
    const type = ln.ZglName || ln.ExpenseType || 'Other';
    const desc = ln.Description || '';
    const existing = groupedLines.find((g) => g.type === type && g.desc === desc);
    const attachment = (ln.Filename || ln.Value) ? { Filename: ln.Filename, Value: ln.Value, Mimetype: ln.Mimetype, ClaimId: ln.ClaimId, ItemNo: ln.ItemNo } : null;
    if (existing) {
      if (attachment) existing.attachments.push(attachment);
      existing.amount += parseFloat(ln.Amount || ln.Value || 0);
    } else {
      groupedLines.push({ type, desc, amount: parseFloat(ln.Amount || ln.Value || 0), status: ln.Status, rejReason: ln.RejReason, attachments: attachment ? [attachment] : [], date: ln.ExpenseDate || null });
    }
  });

  const postingDoc = header?.Belnr ? String(header.Belnr).trim() : '';
  const gjahrRaw = header?.Gjahr ? String(header.Gjahr).trim() : '';
  const fiscalYear = gjahrRaw && gjahrRaw !== '0000' ? gjahrRaw : '';

  const taxQuery = taxSearch.trim().toLowerCase();
  const filteredTaxes = taxQuery ? availableTaxes.filter((t: any) => `${t?.Mwskz ?? ''} ${t?.Text1 ?? ''}`.toLowerCase().includes(taxQuery)) : availableTaxes;
  const visibleTaxes = filteredTaxes.slice(0, TAX_RESULTS_LIMIT);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold text-ink">Claim {header.ClaimId}</h1>
          <p className="text-sm text-inkSoft">{header.EmpName} • {formatDate(header.ClaimDate || header.CreatedOn)}</p>
        </div>
        {canEdit && (
          <Button
            variant="primary"
            icon={Pencil}
            onClick={() => {
              setTempClaimForResubmit(header);
              router.push(`/create/?claimId=${encodeURIComponent(header.ClaimId)}`);
            }}
          >
            Edit / Resubmit
          </Button>
        )}
      </div>

      <div className="card p-4">
        <p className="mb-3 text-xs font-extrabold text-brand">{header.ZglName || header.ExpenseType || 'Claim Summary'}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div><p className="text-2xs font-bold text-inkSoft">Amount</p><p className="text-sm font-extrabold text-ink">₹{formatCurrency(parseFloat(header.TotalAmount || 0))}</p></div>
          <div><p className="text-2xs font-bold text-inkSoft">Status</p><p className="text-sm font-extrabold text-ink">{normalizedStatus}</p></div>
          <div><p className="text-2xs font-bold text-inkSoft">Cost Center</p><p className="text-sm font-extrabold text-ink">{header.CostCenter || '-'}</p></div>
          <div><p className="text-2xs font-bold text-inkSoft">Department</p><p className="text-sm font-extrabold text-ink">{header.Department || '-'}</p></div>
          <div><p className="text-2xs font-bold text-inkSoft">Designation</p><p className="text-sm font-extrabold text-ink">{header.Designation || '-'}</p></div>
          {postingDoc && <div><p className="text-2xs font-bold text-inkSoft">Posting Document</p><p className="text-sm font-extrabold text-ink">{postingDoc}</p></div>}
          {fiscalYear && <div><p className="text-2xs font-bold text-inkSoft">Fiscal Year</p><p className="text-sm font-extrabold text-ink">{fiscalYear}</p></div>}
        </div>
        {(header.Status === 'R' || String(header.Status).toLowerCase() === 'rejected') && header.RejReason && (
          <div className="mt-3">
            <p className="text-2xs font-semibold text-inkSoft">Rejection Reason</p>
            <p className="mt-0.5 text-sm font-semibold text-red">{header.RejReason}</p>
          </div>
        )}
      </div>

      {(showManagerActions || showFinanceActions) && (
        <div className="card flex flex-col gap-2 p-4">
          {showManagerActions && (
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleOpenManagerReject}>Reject</Button>
              <Button variant="success" className="flex-1" onClick={handleManagerApprove}>Approve</Button>
            </div>
          )}
          {showFinanceActions && (
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={handleOpenFinanceReject}>Reject</Button>
              <Button variant="primary" className="flex-1" onClick={handleFinanceRelease}>Release Payment</Button>
            </div>
          )}
        </div>
      )}

      {screenMessage && (
        <Banner type={screenMessage.type} onClose={() => setScreenMessage(null)}>
          <p className="font-bold">{screenMessage.title}</p>
          <p>{screenMessage.message}</p>
        </Banner>
      )}

      {groupedLines.length === 0 && <p className="text-sm text-inkFaint">No line items</p>}
      {groupedLines.map((ln, idx) => {
        const lineStatus = ln.status === 'A' ? 'Approved' : ln.status === 'R' ? 'Rejected' : ln.status === 'N' ? 'Submitted' : ln.status || normalizedStatus;
        const palette = getStatusPalette(lineStatus === 'Approved' ? 'approved' : lineStatus === 'Submitted' ? 'submitted' : lineStatus === 'Rejected' ? 'rejected' : '');
        return (
          <div key={idx} className="rounded-lg border p-3" style={{ backgroundColor: palette.bg, borderColor: palette.border }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-ink">{ln.type}</p>
              <p className="font-extrabold text-ink">₹{formatCurrency(ln.amount)}</p>
            </div>
            <p className="mt-2 text-sm text-inkSoft">{ln.desc}</p>
            {ln.date && <p className="mt-1 text-xs text-inkFaint">Date: {formatDate(ln.date)}</p>}
            {canEdit && ln.rejReason && <p className="mt-1 text-sm font-semibold text-red">{ln.rejReason}</p>}
            {ln.attachments?.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {ln.attachments.map((att: any, aIdx: number) => (
                  <div key={aIdx} className="flex items-center gap-2 text-sm text-brand">
                    <span className="truncate">{att.Filename ? `Attachment: ${att.Filename}` : `Attachment ${aIdx + 1}`}</span>
                    <button type="button" onClick={() => handlePreviewAttachment(att)} aria-label="Preview"><Eye size={16} className="text-brand" /></button>
                    <button type="button" onClick={() => handleOpenAttachment(att)} aria-label="Download"><Download size={16} className="text-green" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <h2 className="mt-2 text-sm font-bold text-ink">Claim Status History{historyEntries.length > 0 ? ` (${historyEntries.length})` : ''}</h2>
      {historyEntries.length === 0 ? (
        <p className="text-sm text-inkFaint">No workflow history available.</p>
      ) : (
        historyEntries.map((entry: any, idx: number) => {
          const entryStatus = getEntryDisplayLabel(entry);
          const palette = getStatusPalette(entryStatus);
          const nextApproverName = (entry.NextApproverName || '').toString().trim();
          const nextApproverValue = (entry.NextApprover || '').toString().trim();
          const shouldShowNextApprover = nextApproverName !== '' || (nextApproverValue !== '' && nextApproverValue !== '00000000');
          return (
            <div key={idx} className="rounded-lg border p-3" style={{ backgroundColor: palette.bg, borderColor: palette.border }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-inkSoft">{formatDate(entry.ActionDate)} • {formatTime(entry.ActionTime)}</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink">{entry.ActionByName || entry.ActionBy || 'Unknown'}</p>
                  <p className="mt-0.5 text-xs text-inkSoft">{entry.Action || getStatusLabel(entry.Status)} • {getActionLevelLabel(entry.ActionLevel)}</p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-2xs font-bold text-white" style={{ backgroundColor: palette.border }}>{entryStatus}</span>
              </div>
              {shouldShowNextApprover && (
                <p className="mt-2 text-xs"><span className="font-bold text-inkSoft">Next Approver: </span><span className="text-ink">{nextApproverName || nextApproverValue}</span></p>
              )}
              {entry.Remarks && (
                <p className="mt-2 text-xs"><span className="font-bold text-inkSoft">Remarks: </span><span className="text-ink">{entry.Remarks}</span></p>
              )}
            </div>
          );
        })
      )}

      <Modal open={actionModalVisible} title="Reject Claim" onClose={() => setActionModalVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setActionModalVisible(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleConfirmReject}>Confirm Rejection</Button>
        </>}>
        <p className="mb-3 text-sm text-inkSoft">Please provide a mandatory reason for rejecting this expense claim. This will be recorded in the workflow audit log.</p>
        <textarea className="input" rows={4} value={actionRemarks} onChange={(e) => setActionRemarks(e.target.value)} placeholder="Enter mandatory rejection remarks..." />
      </Modal>

      <Modal open={taxModalVisible} title="Select Tax Code" subtitle="This claim has a GSTIN. Please select the applicable tax code to release payment."
        onClose={() => { setTaxModalVisible(false); setSelectedTaxCode(''); setSelectedTaxDescription(''); setTaxDropdownOpen(false); setAvailableTaxes([]); }}
        footer={<>
          <Button variant="secondary" onClick={() => { setTaxModalVisible(false); setSelectedTaxCode(''); setSelectedTaxDescription(''); setTaxDropdownOpen(false); setAvailableTaxes([]); }}>Cancel</Button>
          <Button variant="success" onClick={handleConfirmReleaseWithTax}>Confirm Release</Button>
        </>}>
        {taxLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : availableTaxes.length === 0 ? (
          <p className="py-4 text-center text-sm text-inkSoft">No Tax Codes found for this claim.</p>
        ) : (
          <div>
            <button type="button" onClick={() => setTaxDropdownOpen(!taxDropdownOpen)} className="input flex items-center justify-between">
              <span className={selectedTaxCode ? 'text-ink' : 'text-inkFaint'}>
                {selectedTaxCode ? `${selectedTaxCode}${selectedTaxDescription ? ` (${selectedTaxDescription})` : ''}` : 'Select a Tax Code...'}
              </span>
              {taxDropdownOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {taxDropdownOpen && (
              <div className="mt-1 rounded-lg border border-border bg-white">
                <div className="flex items-center gap-2 border-b border-line bg-appBg px-2.5 py-2">
                  <Search size={14} className="text-inkFaint" />
                  <input value={taxSearch} onChange={(e) => setTaxSearch(e.target.value)} placeholder="Search tax code or description..." className="flex-1 bg-transparent text-sm text-ink outline-none" />
                  {taxSearch && <button type="button" onClick={() => setTaxSearch('')}><X size={14} className="text-inkFaint" /></button>}
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {visibleTaxes.length === 0 ? (
                    <p className="p-3 text-center text-sm text-inkSoft">No tax code matches &quot;{taxSearch.trim()}&quot;.</p>
                  ) : (
                    visibleTaxes.map((tax: any, index: number) => (
                      <button
                        key={`${tax.Mwskz}-${index}`}
                        type="button"
                        onClick={() => { setSelectedTaxCode(tax.Mwskz); setSelectedTaxDescription(tax.Text1 || ''); }}
                        className={`block w-full border-b border-line px-3 py-2.5 text-left text-sm last:border-b-0 ${selectedTaxCode === tax.Mwskz ? 'bg-cream font-bold text-ink' : 'text-ink'}`}
                      >
                        {tax.Mwskz}{tax.Text1 ? ` (${tax.Text1})` : ''}
                      </button>
                    ))
                  )}
                </div>
                {filteredTaxes.length > visibleTaxes.length && (
                  <p className="border-t border-line bg-appBg px-3 py-2 text-xs text-inkSoft">Showing {visibleTaxes.length} of {filteredTaxes.length} — keep typing to narrow down.</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!previewAttachment} title={previewAttachment?.filename || 'Attachment'} onClose={() => setPreviewAttachment(null)} size="lg"
        footer={<Button variant="success" icon={Download} onClick={() => previewAttachment && handleOpenAttachment(previewAttachment.raw)}>Download</Button>}>
        <div className="flex h-[60vh] items-center justify-center bg-appBg">
          {previewAttachment?.mimetype.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewAttachment.dataUri} alt={previewAttachment.filename} className="max-h-full max-w-full object-contain" />
          ) : previewAttachment?.mimetype === 'application/pdf' ? (
            <iframe src={previewAttachment.dataUri} className="h-full w-full border-0" title={previewAttachment.filename} />
          ) : (
            <p className="text-sm text-inkSoft">Preview not available for this file type.</p>
          )}
        </div>
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
    </div>
  );
}

export default function ClaimDetailPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading claim…" />}>
      <ClaimDetailInner />
    </Suspense>
  );
}
