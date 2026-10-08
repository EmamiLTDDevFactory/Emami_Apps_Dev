'use client';

import axios from 'axios';
import { AlertCircle, Check, CheckCircle2, ChevronDown, CloudUpload, Download, Eye, FileText, Send, Trash2, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Chip, Field, Input, InfoField, Modal, Spinner, TextArea, YesNo } from '../../components/ui';
import { SAP_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_LABEL,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  compressAttachmentImage,
  MIME_TO_EXTENSION,
} from '../../lib/attachmentCompression';
import { getDocumentAsync } from '../../lib/documentPicker';
import { ensurePdfAttachmentUnderLimit } from '../../lib/pdfAttachment';
import { Attachment } from '../../types';
import { formatCurrency } from '../../utils/currency';

const COST_CENTERS = ['CC-SA', 'CC-ENG-GLOBAL', 'CC-MARKETING-UK', 'CC-FINANCE-HQ', 'CC-IT-INFRA'];

const MAX_ATTACHMENTS_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_LABEL = '30 MB';

const getMimeTypeForFile = (fileName?: string, mimeType?: string) => {
  if (mimeType) return mimeType;
  if (!fileName) return 'application/octet-stream';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'xls': return 'application/vnd.ms-excel';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv': return 'text/csv';
    default: return 'application/octet-stream';
  }
};

const isAttachmentAllowed = (fileName?: string, mimeType?: string) => {
  const extension = (fileName?.split('.').pop() || '').toLowerCase();
  const normalizedMimeType = (mimeType || '').toLowerCase();
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) && ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMimeType);
};

function CreateClaimInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentUser } = useAuth() as { currentUser: any };
  const editingClaimId = searchParams.get('claimId') || '';
  const { addClaim, policyLimit, autoApprovalThreshold, expenseTypes, fetchExpenseTypes, getClaimById, tempClaimForResubmit, setTempClaimForResubmit, claims, fetchAreas, fetchClaims } = useClaim();

  useEffect(() => {
    fetchExpenseTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dynamicExpenseTypes = expenseTypes.map((et, index) => ({
    id: et.id || `${et.name}-${index}`,
    name: et.name,
  }));
  const [typeSearch, setTypeSearch] = useState('');
  const filteredExpenseTypes = dynamicExpenseTypes.filter((type) => type.name.toLowerCase().includes(typeSearch.toLowerCase()));

  const recentExpenseTypeNames = useMemo(() => {
    const seen = new Set<string>();
    const recent: string[] = [];

    [...claims].reverse().forEach((claim) => {
      const name = (claim.expenseType || '').toString().trim();
      if (name && !seen.has(name) && recent.length < 5) {
        seen.add(name);
        recent.push(name);
      }
    });

    if (recent.length < 5) {
      dynamicExpenseTypes.forEach((type) => {
        if (recent.length >= 5) return;
        const name = type.name?.toString().trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          recent.push(name);
        }
      });
    }

    return recent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims]);

  // Form State
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseType, setExpenseType] = useState(dynamicExpenseTypes[0]?.name || 'Select Expense Type');
  const [itemNo, setItemNo] = useState('000001');

  useEffect(() => {
    if (expenseTypes.length > 0 && expenseType === 'Select Expense Type') {
      setExpenseType(expenseTypes[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseTypes]);

  const [amountStr, setAmountStr] = useState('');
  const [costCenter, setCostCenter] = useState(
    currentUser?.CostCenter || currentUser?.costCenter || currentUser?.costcenter || COST_CENTERS[0]
  );
  const [gstinInput, setGstinInput] = useState('');
  const [selectedGst, setSelectedGst] = useState<any | null>(null);
  const [gstLookupLoading, setGstLookupLoading] = useState(false);
  const [gstLookupError, setGstLookupError] = useState('');
  const [gstinChoice, setGstinChoice] = useState<'yes' | 'no'>('no');
  const [hsnSac, setHsnSac] = useState('');
  const [availableAreas, setAvailableAreas] = useState<any[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [justification, setJustification] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const normalizedGstin = gstinInput.replace(/\s+/g, '').toUpperCase();
  const filteredAreas = availableAreas.filter((area) =>
    `${area.Bland || ''} ${area.Bezei || ''}`.toLowerCase().includes(areaSearch.toLowerCase())
  );
  const [amountError, setAmountError] = useState('');
  const [formError, setFormError] = useState('');

  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const [duplicateWarnModal, setDuplicateWarnModal] = useState(false);
  const [pendingDraftFlag, setPendingDraftFlag] = useState(false);
  const [existingClaimId, setExistingClaimId] = useState('');

  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const resetForm = useCallback(() => {
    const defaultExpenseType = expenseTypes.length > 0 ? expenseTypes[0].name : 'Select Expense Type';
    setClaimDate(new Date().toISOString().split('T')[0]);
    setExpenseDate('');
    setExpenseType(defaultExpenseType);
    setItemNo('000001');
    setAmountStr('');
    setCostCenter(currentUser?.CostCenter || currentUser?.costCenter || currentUser?.costcenter || COST_CENTERS[0]);
    setGstinInput('');
    setSelectedGst(null);
    setGstLookupLoading(false);
    setGstLookupError('');
    setGstinChoice('no');
    setHsnSac('');
    setJustification('');
    setAttachments([]);
    setPreviewAttachment(null);
    setPreviewModalVisible(false);
    setAmountError('');
    setFormError('');
    setDuplicateWarnModal(false);
    setPendingDraftFlag(false);
    setExistingClaimId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, expenseTypes]);

  const handlePreviewAttachment = (att: Attachment) => {
    setPreviewAttachment(att);
    setPreviewModalVisible(true);
  };

  const mapSAPClaimToFormData = (sapClaim: any) => {
    if (!sapClaim) return null;

    const header = sapClaim;
    const lineItems = sapClaim.CLAIMNAV?.results || sapClaim.CLAIMNAV || [];

    let claimDateStr = '';
    const dateToParse = header.ClaimDate || header.CreatedOn;
    if (dateToParse) {
      if (dateToParse.includes('Date(')) {
        const ts = parseInt(dateToParse.replace(/\D/g, ''), 10);
        claimDateStr = new Date(ts).toISOString().split('T')[0];
      } else {
        claimDateStr = dateToParse.split('T')[0];
      }
    }

    let expenseTypeStr = '';
    let expenseDateStr = '';
    let justificationStr = '';
    let itemNoStr = '000001';

    if (lineItems.length > 0) {
      const firstLine = lineItems[0];
      expenseTypeStr = header.ZglName || firstLine.ZglName || firstLine.ExpenseType || header.ExpenseType || '';
      justificationStr = firstLine.Description || '';
      itemNoStr = firstLine.ItemNo || '000001';

      if (firstLine.ExpenseDate) {
        if (firstLine.ExpenseDate.includes('Date(')) {
          const ts = parseInt(firstLine.ExpenseDate.replace(/\D/g, ''), 10);
          expenseDateStr = new Date(ts).toISOString().split('T')[0];
        } else {
          expenseDateStr = firstLine.ExpenseDate.split('T')[0];
        }
      }
    }

    const attachmentList: Attachment[] = [];
    if (lineItems.length > 0) {
      lineItems.forEach((item: any, index: number) => {
        if (item.Filename && item.Value) {
          const mimetype = item.Mimetype || 'application/pdf';
          // SAP stores Filename with no extension at all — the submit-time attachment-type check
          // derives the extension from the name, so on resubmit it fails even a perfectly valid
          // attachment since there's no "." to split on.
          const name = item.Filename.includes('.')
            ? item.Filename
            : `${item.Filename}.${MIME_TO_EXTENSION[mimetype] || 'pdf'}`;
          attachmentList.push({
            id: `att-${index}-${Date.now()}-${item.Filename.replace(/[^a-zA-Z0-9]/g, '')}`,
            name,
            uri: `data:${mimetype};base64,${item.Value}`,
            type: mimetype,
          });
        }
      });
    }

    return {
      claimDate: claimDateStr,
      expenseDate: expenseDateStr,
      expenseType: expenseTypeStr,
      justification: justificationStr,
      itemNo: itemNoStr,
      amount: parseFloat(header.TotalAmount || 0),
      costCenter: header.CostCenter || COST_CENTERS[0],
      attachments: attachmentList,
    };
  };

  // Reset once on mount when there's nothing to edit/resubmit. expo-router's useFocusEffect had no
  // tab-switch-triggered re-reset to approximate here yet (slice 1 has only one route) — this gets
  // revisited once more tabs exist (slice 2+) and navigating back to Create needs the same reset.
  // Re-runs whenever editingClaimId (the URL's ?claimId=) changes — not just on mount — because
  // the tab bar navigates with next/link replace, which keeps this SAME page instance mounted when
  // going from /create/?claimId=X (Edit/Resubmit) back to plain /create/. Without this, the old
  // claim's data stayed in the form (and in tempClaimForResubmit) for the rest of the session,
  // leaking into every later "Create New Claim" visit. editingClaimId being empty is the
  // authoritative "not resubmitting" signal — Edit/Resubmit always sets both the URL's claimId and
  // tempClaimForResubmit together (see claim/page.tsx), so clearing here whenever claimId is absent
  // is safe and doesn't affect the Edit/Resubmit flow itself.
  useEffect(() => {
    if (!editingClaimId) {
      if (tempClaimForResubmit) setTempClaimForResubmit(null);
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingClaimId]);

  useEffect(() => {
    // Gated on editingClaimId too, not just tempClaimForResubmit's truthiness — on a fresh mount
    // both this effect and the reset-guard effect above run off the SAME initial render's closure,
    // so the reset-guard's setTempClaimForResubmit(null) call (scheduled for the next render)
    // wouldn't stop this effect from still reading the stale pre-clear value in that same pass.
    // Tying population to editingClaimId (the real URL signal for "this is a resubmit") closes
    // that race instead of relying on clear-then-hope-the-order-helps.
    if (editingClaimId && tempClaimForResubmit) {
      const formData = mapSAPClaimToFormData(tempClaimForResubmit);
      if (formData) {
        setExistingClaimId(tempClaimForResubmit.ClaimId);
        const resolvedDate = formData.claimDate || new Date().toISOString().split('T')[0];
        setClaimDate(resolvedDate);
        setExpenseDate(formData.expenseDate || '');
        setExpenseType(formData.expenseType || expenseTypes[0]?.name || 'Select Expense Type');
        setItemNo(formData.itemNo);
        setAmountStr(String(formData.amount || 0));
        setCostCenter(formData.costCenter);
        setJustification(formData.justification);
        setAttachments(formData.attachments);
      }
      return;
    }

    if (!editingClaimId) return;
    const claim = getClaimById(editingClaimId);
    if (!claim) return;

    setExistingClaimId(claim.id);
    setClaimDate(claim.claimDate);
    setExpenseDate(claim.expenseDate || '');
    setExpenseType(claim.expenseType);
    setItemNo(claim.itemNo || '000001');
    setAmountStr(String(claim.amount));
    setCostCenter(claim.costCenter);
    setJustification(claim.justification);
    setAttachments(claim.attachments || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingClaimId, getClaimById, tempClaimForResubmit, expenseTypes]);

  // Perform GST lookup only after the user enters a full 15-digit GSTIN
  useEffect(() => {
    const lookupGstByGstin = async () => {
      if (gstinChoice !== 'yes' || normalizedGstin.length !== 15) {
        return;
      }

      setGstLookupLoading(true);
      setGstLookupError('');
      setSelectedGst(null);

      try {
        // Basis has opened GstSet for direct anonymous GET access. Filter is pre-encoded into the
        // URL string directly (not passed via axios's `params`, which would encode it a second
        // time and corrupt it — confirmed by a real 400 from SAP during testing).
        const filter = encodeURIComponent(`Stcd3 eq '${normalizedGstin}'`);
        const res = await axios.get(`${SAP_BASE_URL}/GstSet?$format=json&$filter=${filter}`, { validateStatus: () => true });
        if (res.status < 200 || res.status >= 300) {
          setGstLookupError('Unable to lookup GSTIN at this time.');
          return;
        }

        const payload = res.data;
        const results = payload?.d?.results || payload?.results || [];
        if (!Array.isArray(results) || results.length === 0) {
          setGstLookupError('No GST record found for the entered GSTIN.');
          return;
        }

        const matchingItem = results.find((item: any) => {
          const gstValue = (item.Stcd3 || item.stcd3 || item.GSTIN || item.gstin || '').toString().replace(/\s+/g, '').toUpperCase();
          return gstValue === normalizedGstin;
        }) || results[0];

        const display = `${matchingItem.Lifnr || matchingItem.lifnr || ''} • ${matchingItem.Name1 || matchingItem.name1 || ''} • ${matchingItem.Stcd3 || matchingItem.stcd3 || matchingItem.GSTIN || matchingItem.gstin || ''}`.trim();
        setSelectedGst({ value: matchingItem.Lifnr || matchingItem.lifnr || display, display, item: matchingItem });
      } catch (e) {
        setGstLookupError('Failed to lookup GSTIN. Please try again.');
      } finally {
        setGstLookupLoading(false);
      }
    };

    lookupGstByGstin();
  }, [gstinChoice, normalizedGstin]);

  const parsedAmount = parseFloat(amountStr) || 0;
  const isAutoApprove = parsedAmount > 0 && parsedAmount < autoApprovalThreshold;

  useEffect(() => {
    if (parsedAmount > 20000) {
      setAmountError('Amount cannot exceed ₹20,000');
    } else {
      setAmountError('');
    }
  }, [parsedAmount]);

  const handlePickAttachment = async () => {
    try {
      setFormError('');
      const result = await getDocumentAsync({ multiple: false });
      if (!result.canceled) {
        const asset = result.assets[0];
        if (asset && asset.uri) {
          const attachmentMimeType = getMimeTypeForFile(asset.name, asset.mimeType);
          if (!isAttachmentAllowed(asset.name, attachmentMimeType)) {
            setFormError(`Unsupported attachment type. Allowed file types: ${ALLOWED_ATTACHMENT_LABEL}.`);
            return;
          }

          // Images can be safely re-encoded smaller, and a PDF can be re-rasterized smaller —
          // XLS/XLSX/CSV/TXT can't be shrunk either way and are left exactly as picked.
          let finalUri = asset.uri;
          let finalSize = asset.size || 0;
          let finalType = attachmentMimeType;
          if (attachmentMimeType.startsWith('image/')) {
            const compressed = await compressAttachmentImage(asset.uri);
            if (compressed) {
              finalUri = compressed.uri;
              finalSize = compressed.size;
              // Compression always re-encodes as JPEG — the stored Mimetype must say so too.
              finalType = 'image/jpeg';
            }
          } else if (attachmentMimeType === 'application/pdf') {
            if ((asset.size || 0) > 70 * 1024) {
              const compressed = await ensurePdfAttachmentUnderLimit(asset.uri);
              if (compressed) {
                finalUri = compressed.uri;
                finalSize = compressed.size;
              } else {
                setFormError('This PDF is too large and could not be compressed enough to upload. Please attach a smaller PDF.');
                return;
              }
            }
          }

          const existingTotal = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
          if (existingTotal + finalSize > MAX_ATTACHMENTS_TOTAL_BYTES) {
            setFormError(`Total attachment size cannot exceed ${MAX_ATTACHMENTS_TOTAL_LABEL}. Please attach a smaller file or remove an existing one.`);
            return;
          }

          const newAtt: Attachment = {
            id: `att-${Date.now()}`,
            name: asset.name || 'document',
            uri: finalUri,
            size: finalSize,
            type: finalType,
          };
          setAttachments((prev) => [...prev, newAtt]);
        }
      }
    } catch (err) {
      setFormError('Unable to add attachment. Please try again with a supported file.');
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setFormError('');
  };

  const handleSubmit = async (isDraft: boolean, ignoreDuplicateWarn = false) => {
    if (parsedAmount > 20000) {
      setAmountError('Amount cannot exceed ₹20,000');
      return;
    }

    if (gstinChoice === 'yes' && !selectedGst) {
      setFormError('Enter a valid 15-digit GSTIN and wait for lookup before submitting.');
      return;
    }

    setAmountError('');
    setFormError('');
    const claimData: any = {
      employeeId: currentUser.employeeId,
      employeeName: currentUser.employeeName,
      department: currentUser.department,
      designation: currentUser.designation,
      claimDate,
      expenseDate,
      expenseType,
      itemNo,
      amount: parsedAmount,
      costCenter,
      justification,
      attachments,
      lifnr: gstinChoice === 'yes' ? (selectedGst?.item?.Lifnr || selectedGst?.item?.lifnr || null) : null,
      name1: gstinChoice === 'yes' ? (selectedGst?.item?.Name1 || selectedGst?.item?.name1 || null) : null,
      stcd3: gstinChoice === 'yes' ? (selectedGst?.item?.Stcd3 || selectedGst?.item?.stcd3 || null) : null,
      bezei: gstinChoice === 'yes' ? (selectedArea?.Bezei || null) : null,
      hsnSac: gstinChoice === 'yes' ? (hsnSac.trim() || null) : null,
    };

    const result = await addClaim(claimData, isDraft, ignoreDuplicateWarn, existingClaimId);

    if (!result.success) {
      if (result.warning?.startsWith('DUPLICATE_DETECTED')) {
        setPendingDraftFlag(isDraft);
        setDuplicateWarnModal(true);
        return;
      } else {
        setFormError(result.warning || 'Unable to submit claim. Please review the form and try again.');
        return;
      }
    }

    setSuccessMessage(
      isDraft
        ? 'Your expense claim has been saved as a draft.'
        : `Your claim has been successfully submitted.${isAutoApprove ? ' Amount is below threshold (₹100), claim has been auto-approved!' : ''}`
    );
    setSuccessModalVisible(true);
    // Refresh claims in the background so Dashboard/My Claims already show the new submission by
    // the time the user navigates there — previously only the manual Refresh button did this.
    fetchClaims();
  };

  if (!currentUser) return null;

  return (
    <div className="pb-10">
      <h1 className="mb-3 text-lg font-extrabold text-ink">Create Expense Claim</h1>

      {formError && (
        <div className="mb-3">
          <Banner type="error">{formError}</Banner>
        </div>
      )}

      {/* Employee Information */}
      <Card className="mb-3">
        <h2 className="mb-2 text-sm font-bold text-ink">Employee Information</h2>
        <div className="divide-y divide-line">
          {[
            ['Employee ID', currentUser.employeeId],
            ['Name', currentUser.name || currentUser.employeeName],
            ['Department', currentUser.department],
            ['Designation', currentUser.designation],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between py-2">
              <span className="text-xs font-semibold text-inkSoft">{label}</span>
              <span className="w-64 text-left text-sm font-bold text-ink">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Claim Details */}
      <Card className="mb-3">
        <h2 className="mb-2 text-sm font-bold text-ink">Claim Details</h2>

        {recentExpenseTypeNames.length > 0 && (
          <div className="mb-4 rounded-lg border border-border bg-cream/50 p-3">
            <p className="text-sm font-bold text-ink">Recent Expense Types</p>
            <p className="mb-2 text-xs text-inkSoft">Tap a type to fill the field instantly</p>
            <div className="flex flex-wrap gap-2">
              {recentExpenseTypeNames.map((name, index) => (
                <Chip key={`${name}-${index}`} tone={expenseType === name ? 'brand' : 'neutral'} onClick={() => { setExpenseType(name); setTypeModalVisible(false); }}>
                  {name}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Claim Date" required>
            <input type="date" value={claimDate} onChange={(e) => setClaimDate(e.target.value)} className="input" />
          </Field>
          <Field label="Expense Type" required>
            <button type="button" onClick={() => setTypeModalVisible(true)} className="input flex items-center justify-between text-left">
              <span className="truncate">{expenseType}</span>
              <ChevronDown size={16} className="shrink-0 text-inkSoft" />
            </button>
          </Field>
        </div>

        <Field label="GSTIN Available (Select Yes in Case of Gst)" required className="mb-3">
          <YesNo
            value={gstinChoice === 'yes'}
            onChange={async (v) => {
              if (v) {
                setGstinChoice('yes');
                setGstinInput('');
                setSelectedGst(null);
                setGstLookupError('');
                setSelectedArea(null);
                setHsnSac('');
                setAreasLoading(true);
                const areas = await fetchAreas();
                setAvailableAreas(areas);
                setAreasLoading(false);
              } else {
                setGstinChoice('no');
                setGstinInput('');
                setSelectedGst(null);
                setGstLookupError('');
                setSelectedArea(null);
                setHsnSac('');
                setAvailableAreas([]);
              }
            }}
          />
        </Field>

        {gstinChoice === 'yes' && (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="GSTIN (For your given Gst System will Determine the Vendor code)" required>
                <Input
                  value={gstinInput}
                  onChange={(e) => {
                    const normalized = e.target.value.replace(/\s+/g, '').toUpperCase();
                    setGstinInput(normalized);
                    setGstLookupError('');
                    if (normalized.length !== 15) setSelectedGst(null);
                  }}
                  placeholder="Enter 15-digit GSTIN"
                  maxLength={15}
                />
                {gstLookupLoading && <p className="mt-1 text-xs text-inkSoft">Looking up GST details…</p>}
                {gstLookupError && <p className="mt-1 text-xs font-semibold text-red">{gstLookupError}</p>}
                {selectedGst && (
                  <div className="mt-2 rounded-lg border border-green/40 bg-greenBg px-2.5 py-2 text-sm font-semibold text-green">{selectedGst.display}</div>
                )}
              </Field>

              <Field label="Region" required>
                <button type="button" onClick={() => setAreaModalVisible(true)} className="input flex items-center justify-between text-left">
                  <span className="truncate">{selectedArea ? `${selectedArea.Bland}${selectedArea.Bezei ? ` (${selectedArea.Bezei})` : ''}` : 'Select Region...'}</span>
                  <ChevronDown size={16} className="shrink-0 text-inkSoft" />
                </button>
                {areasLoading && <p className="mt-1 text-xs text-inkSoft">Loading regions…</p>}
              </Field>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="HSN Code">
                <Input
                  value={hsnSac}
                  onChange={(e) => setHsnSac(e.target.value.replace(/\s+/g, '').toUpperCase())}
                  placeholder="Enter HSN/SAC code"
                  maxLength={16}
                />
              </Field>
              <div />
            </div>
          </>
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Amount (₹)" required>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0.00" inputMode="decimal" />
            {amountError && (
              <div className="mt-2">
                <Banner type="error">{amountError}</Banner>
              </div>
            )}
            {isAutoApprove && (
              <div className="mt-2">
                <Banner type="success">Claim is under ₹100 threshold. Will be automatically approved upon submission!</Banner>
              </div>
            )}
          </Field>

          <Field label="Cost Center" required>
            <Input value={costCenter} disabled />
          </Field>
        </div>

        <Field label="Business Justification">
          <TextArea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="State the business purpose for this expense..." />
        </Field>
      </Card>

      {/* Attachments */}
      <Card className="mb-3">
        <h2 className="text-sm font-bold text-ink">Supporting Documents *</h2>
        <p className="text-xs text-inkSoft">At least 1 attachment is mandatory</p>
        <p className="text-xs text-inkSoft">Allowed: {ALLOWED_ATTACHMENT_LABEL}</p>
        <p className="mb-3 text-xs text-inkSoft">Total size limit: {MAX_ATTACHMENTS_TOTAL_LABEL}</p>

        {attachments.map((att) => (
          <div key={att.id} className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
            <FileText size={20} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{att.name}</span>
            <button type="button" onClick={() => handlePreviewAttachment(att)} aria-label="View document" className="rounded p-1.5 text-brand hover:bg-cream">
              <Eye size={18} />
            </button>
            <button type="button" onClick={() => handleRemoveAttachment(att.id)} aria-label="Remove document" className="rounded p-1.5 text-red hover:bg-redBg">
              <Trash2 size={18} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={handlePickAttachment}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-cream/40 py-3 text-sm font-semibold text-brand hover:bg-cream"
        >
          <CloudUpload size={18} /> Add Attachment / Scanned Receipt
        </button>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => { resetForm(); router.back(); }}>
          <X size={18} /> Cancel
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => handleSubmit(false)}>
          <Send size={16} /> Submit Claim
        </Button>
      </div>

      {/* Expense Type Modal */}
      <Modal open={typeModalVisible} title="Select Expense Type" onClose={() => setTypeModalVisible(false)}>
        <Input value={typeSearch} onChange={(e) => setTypeSearch(e.target.value)} placeholder="Search expense types" className="mb-3" />
        <div className="max-h-80 overflow-y-auto">
          {filteredExpenseTypes.length === 0 ? (
            <p className="py-3 text-sm text-inkSoft">No matching expense types</p>
          ) : (
            filteredExpenseTypes.map((type, index) => (
              <button
                key={`${type.id}-${index}`}
                type="button"
                onClick={() => { setExpenseType(type.name); setTypeModalVisible(false); }}
                className="flex w-full items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink last:border-b-0 hover:bg-cream"
              >
                {type.name}
                {expenseType === type.name && <Check size={16} className="text-brand" />}
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* Region Modal */}
      <Modal open={areaModalVisible} title="Select Region" onClose={() => setAreaModalVisible(false)}>
        <Input value={areaSearch} onChange={(e) => setAreaSearch(e.target.value)} placeholder="Search regions" className="mb-3" />
        <div className="max-h-80 overflow-y-auto">
          {filteredAreas.length === 0 ? (
            <p className="py-3 text-sm text-inkSoft">No matching regions</p>
          ) : (
            filteredAreas.map((area, index) => (
              <button
                key={`${area.Bland}-${index}`}
                type="button"
                onClick={() => { setSelectedArea(area); setAreaModalVisible(false); }}
                className="flex w-full items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink last:border-b-0 hover:bg-cream"
              >
                {area.Bland}{area.Bezei ? ` (${area.Bezei})` : ''}
                {selectedArea?.Bland === area.Bland && <Check size={16} className="text-brand" />}
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* Duplicate Warning Modal */}
      <Modal
        open={duplicateWarnModal}
        title="Potential Duplicate Detected"
        onClose={() => setDuplicateWarnModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicateWarnModal(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setDuplicateWarnModal(false); handleSubmit(pendingDraftFlag, true); }}>Continue Submission</Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <AlertCircle size={44} className="text-red" />
          <p className="text-sm text-ink">
            A claim with the exact same Employee ID ({currentUser.employeeId}), Claim Date ({claimDate}), and Amount (₹{formatCurrency(parsedAmount)}) already exists in the system.
          </p>
          <p className="text-sm font-semibold text-ink">Do you wish to proceed and create this claim anyway?</p>
        </div>
      </Modal>

      {/* Success Modal */}
      <Modal
        open={successModalVisible}
        title={successMessage.includes('draft') ? 'Draft Saved' : 'Claim Submitted'}
        onClose={() => setSuccessModalVisible(false)}
        footer={
          <Button
            variant="success"
            className="w-full"
            onClick={() => {
              setSuccessModalVisible(false);
              resetForm();
              router.replace('/');
            }}
          >
            Go to Dashboard
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 size={48} className="text-green" />
          <p className="text-sm text-ink">{successMessage}</p>
        </div>
      </Modal>

      {/* Attachment Preview Modal */}
      <Modal
        open={previewModalVisible}
        title={previewAttachment?.name || 'Document Preview'}
        subtitle={previewAttachment?.type}
        onClose={() => setPreviewModalVisible(false)}
        size="lg"
        footer={
          <>
            {previewAttachment?.uri && (
              <Button variant="secondary" onClick={() => previewAttachment?.uri && window.open(previewAttachment.uri, '_blank')}>
                <Download size={16} /> Open in New Tab
              </Button>
            )}
            <Button variant="secondary" onClick={() => setPreviewModalVisible(false)}>Close</Button>
          </>
        }
      >
        <div className="h-[60vh]">
          {previewAttachment && (
            previewAttachment.type?.startsWith('image/') || ['png', 'jpg', 'jpeg'].includes((previewAttachment.name.split('.').pop() || '').toLowerCase()) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewAttachment.uri} alt={previewAttachment.name} className="h-full w-full object-contain" />
            ) : (
              <iframe src={previewAttachment.uri} className="h-full w-full rounded-lg border-none" title={previewAttachment.name} />
            )
          )}
        </div>
      </Modal>
    </div>
  );
}

export default function CreateClaimPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size={28} /></div>}>
      <CreateClaimInner />
    </Suspense>
  );
}
