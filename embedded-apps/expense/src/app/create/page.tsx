'use client';

import axios from 'axios';
import { Check, CheckCircle2, ChevronDown, CloudUpload, Download, Eye, FileText, Send, Trash2, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Chip, Field, Input, InfoField, MessageModal, type MessageModalState, Modal, Select, Spinner, TextArea, YesNo } from '../../components/ui';
import { API_BASE_URL, SAP_BASE_URL } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useClaim } from '../../context/ClaimContext';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  ALLOWED_ATTACHMENT_LABEL,
  ALLOWED_ATTACHMENT_MIME_TYPES,
  compressAttachmentImage,
  getPerFileTargetBytes,
  MIME_TO_EXTENSION,
  SAFE_COMBINED_RAW_ATTACHMENT_BYTES,
} from '../../lib/attachmentCompression';
import { getDocumentAsync } from '../../lib/documentPicker';
import { ensurePdfAttachmentUnderLimit } from '../../lib/pdfAttachment';
import { Attachment, MobileMonthItem } from '../../types';

const COST_CENTERS = ['CC-SA', 'CC-ENG-GLOBAL', 'CC-MARKETING-UK', 'CC-FINANCE-HQ', 'CC-IT-INFRA'];

// Real measured ceiling (see attachmentCompression.ts), not a generic file-size cap — showing an
// honest number here instead of a made-up "30 MB" that the real gateway would reject long before.
const MAX_ATTACHMENTS_TOTAL_BYTES = SAFE_COMBINED_RAW_ATTACHMENT_BYTES;
const MAX_ATTACHMENTS_TOTAL_LABEL = `${Math.round(SAFE_COMBINED_RAW_ATTACHMENT_BYTES / 1024)} KB`;

const EXCEL_MIME_TYPES = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

// Standard 15-character GSTIN format - gates auto-flipping "GSTIN Available" to Yes off a
// document-extraction result, so a bad OCR read on a non-GST receipt can't force someone into
// the GST flow (Region/HSN fields) for a value that isn't actually a real GSTIN.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// "2026-08" -> "August 2026". Used for month keys throughout the multi-month flow below.
const formatMonthLabel = (monthKey: string) => {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// From/To Period picker options - any month can be missed, not just "last 6/12", so this is a
// plain scrollable list (most recent first) rather than preset shortcuts. 3 years back is
// generous headroom for a missed-months catch-up without the list being unreasonably long.
const PERIOD_PICKER_MONTHS_BACK = 36;
const getPeriodPickerOptions = () => {
  const now = new Date();
  const options: string[] = [];
  for (let i = 0; i < PERIOD_PICKER_MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
};

type MonthClaimEntry = {
  attachment: Attachment | null;
  claimAmount: string;
  // Eligible Amount is grade-table-driven (EligibilitySet). Null means either "not fetched yet"
  // or "no cap to enforce" (NoCap='X' or CapFound blank) - eligibilityChecked disambiguates the two
  // for display purposes.
  eligibleAmount: number | null;
  // True once the EligibilitySet call has returned (success or fail) for this month - lets the UI
  // show "No Cap" instead of the "Auto-fetched..." placeholder once a real answer has come back.
  eligibilityChecked: boolean;
  // Eligibility's Category field - 'NS' = non-sales (HoD pick-list routing above the cap),
  // 'SC'/'SH'/'SM'/'SE'/'SG' = sales channels (straight to L1 supervisor, no choice). Same value
  // expected on every month card for one employee, since it's a property of the employee's cost
  // centre, not the month.
  category: string | null;
  // Set once OCR reads the invoice's own printed date off this card's document and it doesn't
  // fall inside this card's month — e.g. an August invoice dropped into the July card. Informational
  // only (doesn't block anything); the card's period stays whatever slot the user put it in.
  dateMismatchWarning: string | null;
  // OCR-read invoice/bill number, shown read-only on the card for reference back to the document.
  invoiceNumber: string | null;
};

const BLANK_MONTH_ENTRY: MonthClaimEntry = { attachment: null, claimAmount: '', eligibleAmount: null, eligibilityChecked: false, category: null, dateMismatchWarning: null, invoiceNumber: null };

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(((reader.result as string) || '').split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

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
  const { addClaim, policyLimit, expenseTypes, fetchExpenseTypes, getClaimById, tempClaimForResubmit, setTempClaimForResubmit, claims, fetchAreas, fetchClaims, fetchClaimedMonthsForExpenseType, fetchEligibility, fetchHodApprovers } = useClaim();

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
    // Exact-match lookup set for the CURRENT live SAP expense-type list - a past claim's saved
    // expenseType string is only ever shown as a "recent" chip if it still matches a live entry
    // byte-for-byte. Otherwise clicking it would setExpenseType to a name expenseTypes.find()
    // can never match, so Flag-driven logic (Manager Approved Attachment, attachment-optional)
    // would silently stay stuck on the previous selection for that one chip only.
    const liveNames = new Set(dynamicExpenseTypes.map((t) => t.name));

    [...claims].reverse().forEach((claim) => {
      const name = (claim.expenseType || '').toString().trim();
      if (name && liveNames.has(name) && !seen.has(name) && recent.length < 5) {
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
  const [expenseType, setExpenseType] = useState('Select Expense Type');
  const [itemNo, setItemNo] = useState('000001');

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
  // Auto-matched from the GST lookup's Regio field against AreaSet.Bland (see lookupGstByGstin
  // below) - no longer a user-pickable dropdown, same treatment as the read-only Cost Center field.
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  // Document-extraction result state (see extractDocumentDetails) - set once per Original Expense
  // Document upload attempt. hsnAutoFillMissing specifically means "we tried, GST was detected,
  // but no HSN was readable from the document" - the user must key it in manually at that point.
  const [documentExtractionLoading, setDocumentExtractionLoading] = useState(false);
  const [documentExtractionError, setDocumentExtractionError] = useState('');
  // Which attachment section (if any) is currently picking/compressing a file - there was no
  // visual feedback during this step before, so a large file (especially a PDF needing heavy
  // compression) made the UI look stuck/broken for however long that silently took.
  const [pickingTarget, setPickingTarget] = useState<'original' | 'supporting' | 'managerApproved' | null>(null);
  const [hsnAutoFillMissing, setHsnAutoFillMissing] = useState(false);
  const [justification, setJustification] = useState('');
  // The receipt/invoice itself - capped at exactly 1 file (enforced in pickAttachmentInto and the
  // JSX below). This is the only attachment document extraction (GSTIN/HSN/Amount OCR) runs on,
  // and the only one that's mandatory.
  const [originalExpenseDocument, setOriginalExpenseDocument] = useState<Attachment[]>([]);
  // Any other related document (optional, any number of files) - rendered after Business
  // Justification, same position this section held before document extraction was built. Combined
  // with originalExpenseDocument into one `attachments` array at submit time (see handleSubmit) so
  // ClaimContext/SAP still see exactly the same single list they always have - no backend changes.
  const [supportingDocuments, setSupportingDocuments] = useState<Attachment[]>([]);
  // Pristine, pre-compression source for every attachment picked THIS session (keyed by attachment
  // id) — the only way to recompress an already-added file to a tighter shared target when a new
  // attachment arrives, without compounding quality loss by re-encoding an already-compressed copy.
  // Attachments loaded from an existing claim (resubmit) have no entry here — there's no original
  // file to re-derive, so their already-fixed size is treated as a sunk cost against the shared
  // budget instead.
  const [originalExpenseDocumentSources, setOriginalExpenseDocumentSources] = useState<Record<string, { uri: string; mimeType: string }>>({});
  const [supportingDocumentSources, setSupportingDocumentSources] = useState<Record<string, { uri: string; mimeType: string }>>({});
  // Second, separate attachment required when the selected expense type's ExptypeSet.Flag comes
  // back blank (not 'X') - see requiresManagerApprovedAttachment below. Shares the same combined
  // size budget as the two lists above (see pickAttachmentInto).
  const [managerApprovedAttachments, setManagerApprovedAttachments] = useState<Attachment[]>([]);
  const [managerApprovedOriginalSources, setManagerApprovedOriginalSources] = useState<Record<string, { uri: string; mimeType: string }>>({});

  // Non-CTC: Mobile Exp — multi-month claim state. Independent of the shared attachment-budget
  // system above: each month's document is its own claim line with its own amount, not folded
  // into the single combined attachments list the rest of this form submits today. Submission
  // itself (building per-month CLAIMNAV lines, splitting into one or two SAP claims by routing
  // outcome) is NOT wired yet — see the disabled note on the Submit button below.
  // One card by default, each slot holding a month key once picked ('' = not yet picked). Growable
  // via "+ Add Another Month" rather than a From/To range - months missed aren't always
  // contiguous (e.g. March and June but not April/May), and a single default slot means the
  // common one-month case needs no extra field at all.
  const [selectedMonths, setSelectedMonths] = useState<string[]>(['']);
  // Which slot's picker modal is open, if any (index into selectedMonths).
  const [monthPickerSlotIndex, setMonthPickerSlotIndex] = useState<number | null>(null);
  const [monthPickerSearch, setMonthPickerSearch] = useState('');
  const [monthClaims, setMonthClaims] = useState<Record<string, MonthClaimEntry>>({});
  const [monthPickingKey, setMonthPickingKey] = useState<string | null>(null);
  const [monthExtractingKey, setMonthExtractingKey] = useState<string | null>(null);
  // Non-CTC: Mobile Exp, non-sales (Category='B') above the eligibility cap - HoD choice list.
  const [hodApprovers, setHodApprovers] = useState<{ apprId: string; apprName: string; apprEmail: string }[]>([]);
  const [selectedHodApprId, setSelectedHodApprId] = useState('');
  const [hodLoading, setHodLoading] = useState(false);
  const normalizedGstin = gstinInput.replace(/\s+/g, '').toUpperCase();
  const [amountError, setAmountError] = useState('');
  const [messageModal, setMessageModal] = useState<MessageModalState>(null);
  // Every submission/validation error - including attachment and mandatory-field messages -
  // now shows as the same standard error popup used on other screens, instead of an inline
  // banner at the top of the page. An empty string closes the popup, same as before.
  const setFormError = (message: string) => {
    if (!message) {
      setMessageModal(null);
      return;
    }
    setMessageModal({ title: 'Error', message, type: 'error' });
  };

  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  // Parsed lazily (dynamic import, only when an Excel attachment is actually opened) so the xlsx
  // library never loads into the bundle for users who never preview a spreadsheet - same approach
  // as the Claim detail page's attachment preview.
  const [excelPreview, setExcelPreview] = useState<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: any[][] } | null>(null);
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false);

  const [existingClaimId, setExistingClaimId] = useState('');

  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const resetForm = useCallback(() => {
    setClaimDate(new Date().toISOString().split('T')[0]);
    setExpenseDate('');
    setExpenseType('Select Expense Type');
    setItemNo('000001');
    setAmountStr('');
    setCostCenter(currentUser?.CostCenter || currentUser?.costCenter || currentUser?.costcenter || COST_CENTERS[0]);
    setGstinInput('');
    setSelectedGst(null);
    setGstLookupLoading(false);
    setGstLookupError('');
    setGstinChoice('no');
    setHsnSac('');
    setHsnAutoFillMissing(false);
    setDocumentExtractionLoading(false);
    setDocumentExtractionError('');
    setJustification('');
    setOriginalExpenseDocument([]);
    setOriginalExpenseDocumentSources({});
    setSupportingDocuments([]);
    setSupportingDocumentSources({});
    setManagerApprovedAttachments([]);
    setManagerApprovedOriginalSources({});
    setPreviewAttachment(null);
    setPreviewModalVisible(false);
    setExcelPreview(null);
    setAmountError('');
    setFormError('');
    setExistingClaimId('');
    setSelectedMonths(['']);
    setMonthClaims({});
    setHodApprovers([]);
    setSelectedHodApprId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, expenseTypes]);

  const handlePreviewAttachment = (att: Attachment) => {
    setPreviewAttachment(att);
    setPreviewModalVisible(true);

    if (EXCEL_MIME_TYPES.includes(att.type || '')) {
      setExcelPreview({ status: 'loading' });
      (async () => {
        try {
          const [XLSX, res] = await Promise.all([import('xlsx'), fetch(att.uri)]);
          const buffer = await res.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false });
          setExcelPreview({ status: 'ready', rows: rows.slice(0, 500) });
        } catch {
          setExcelPreview({ status: 'error' });
        }
      })();
    } else {
      setExcelPreview(null);
    }
  };

  // "/Date(ms)/" or plain ISO -> "YYYY-MM-DD". Mirrors the inline parsing already used below for
  // claimDateStr/expenseDateStr, factored out here since rebuilding mobile month cards (PeriodFrom)
  // needs the same thing.
  const parseSapDateToIso = (value: any): string => {
    if (!value) return '';
    const str = String(value);
    if (str.includes('Date(')) {
      const ts = parseInt(str.replace(/\D/g, ''), 10);
      return new Date(ts).toISOString().split('T')[0];
    }
    return str.split('T')[0];
  };

  // One CLAIMNAV line -> one Attachment, same shape/extension-recovery as the combined
  // attachmentList below - factored out so a mobile line's single attachment can reuse it too.
  const mapLineToAttachment = (item: any, key: string): Attachment | null => {
    if (!item.Filename || !item.Value) return null;
    const mimetype = item.Mimetype || 'application/pdf';
    const name = item.Filename.includes('.')
      ? item.Filename
      : `${item.Filename}.${MIME_TO_EXTENSION[mimetype] || 'pdf'}`;
    const sizeBytes = item.Value ? Math.floor((item.Value.length * 3) / 4) : 0;
    return {
      id: `att-${key}-${Date.now()}-${item.Filename.replace(/[^a-zA-Z0-9]/g, '')}`,
      name,
      uri: `data:${mimetype};base64,${item.Value}`,
      type: mimetype,
      size: sizeBytes,
    };
  };

  const mapSAPClaimToFormData = (sapClaim: any) => {
    if (!sapClaim) return null;

    const header = sapClaim;
    const lineItems = sapClaim.CLAIMNAV?.results || sapClaim.CLAIMNAV || [];

    // Mobile Exp claims carry one CLAIMNAV line per month (PeriodFrom identifies them - a plain
    // non-mobile claim's lines never have it); without this, a rejected mobile claim resubmitted
    // the old way, loaded as one generic line with the header total and the first line's date,
    // and its month cards were simply gone. BillAmt (not Amount, which the backend overwrites to
    // the claim total on every line) is each month's own real amount.
    const mobileLines = lineItems.filter((item: any) => item.PeriodFrom);
    const mobileMonths: { monthKey: string; entry: MonthClaimEntry }[] | null = mobileLines.length > 0
      ? mobileLines
          .map((item: any, index: number) => ({
            monthKey: parseSapDateToIso(item.PeriodFrom).slice(0, 7),
            entry: {
              ...BLANK_MONTH_ENTRY,
              claimAmount: String(parseFloat(item.BillAmt) || 0),
              invoiceNumber: item.ReceiptNo || null,
              attachment: mapLineToAttachment(item, `mob-${index}`),
            } as MonthClaimEntry,
          }))
          .filter((m: { monthKey: string; entry: MonthClaimEntry }) => m.monthKey)
      : null;

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
          // Base64 char count -> decoded byte length, so this already-submitted attachment counts
          // accurately against the shared attachment budget if the user adds another file here.
          const sizeBytes = item.Value ? Math.floor((item.Value.length * 3) / 4) : 0;
          attachmentList.push({
            id: `att-${index}-${Date.now()}-${item.Filename.replace(/[^a-zA-Z0-9]/g, '')}`,
            name,
            uri: `data:${mimetype};base64,${item.Value}`,
            type: mimetype,
            size: sizeBytes,
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
      mobileMonths,
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
        // A claim submitted before this two-section split simply had one combined attachment
        // list - split it back out so nothing is lost: first file is treated as the Original
        // Expense Document, everything else as Supporting Document(s).
        setOriginalExpenseDocument(formData.attachments.slice(0, 1));
        setSupportingDocuments(formData.attachments.slice(1));
        setOriginalExpenseDocumentSources({});
        setSupportingDocumentSources({});
        // Mobile Exp: restore one month card per CLAIMNAV line that has PeriodFrom, then re-run
        // the eligibility check for each - a rejected mobile claim previously lost its month cards
        // entirely on resubmit, loading as a single generic line instead.
        if (formData.mobileMonths && formData.mobileMonths.length > 0) {
          const monthKeys = formData.mobileMonths.map((m) => m.monthKey);
          setSelectedMonths(monthKeys);
          setMonthClaims(Object.fromEntries(formData.mobileMonths.map((m) => [m.monthKey, m.entry])));
          monthKeys.forEach((mk) => fetchEligibilityForMonth(mk));
        }
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
    const loadedAttachments = claim.attachments || [];
    setOriginalExpenseDocument(loadedAttachments.slice(0, 1));
    setSupportingDocuments(loadedAttachments.slice(1));
    setOriginalExpenseDocumentSources({});
    setSupportingDocumentSources({});
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
      setSelectedArea(null);

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

        // Auto-bind Region from this GST record's own Regio, matched against AreaSet.Bland -
        // the user no longer picks a region manually, same as Cost Center.
        const regio = (matchingItem.Regio || matchingItem.regio || '').toString().trim().toUpperCase();
        if (regio) {
          const areas = await fetchAreas();
          const matchedArea = areas.find((area: any) => (area.Bland || '').toString().trim().toUpperCase() === regio);
          if (matchedArea) {
            setSelectedArea(matchedArea);
          } else {
            setGstLookupError('GST details found, but no matching region could be determined for this GSTIN.');
          }
        } else {
          setGstLookupError('GST details found, but this record has no region to auto-fill.');
        }
      } catch (e) {
        setGstLookupError('Failed to lookup GSTIN. Please try again.');
      } finally {
        setGstLookupLoading(false);
      }
    };

    lookupGstByGstin();
  }, [gstinChoice, normalizedGstin]);

  const parsedAmount = parseFloat(amountStr) || 0;
  // ExptypeSet.Flag = 'X' on the selected expense type means an attachment isn't required for it
  // (mirrors the same check ClaimContext's addClaim/updateDraft enforce server-submission-side).
  // Forced to false for now - attachment is mandatory for every expense type until the Flag X
  // rule is revisited; noAttachmentRequired itself is left untouched on the expense type data.
  const attachmentOptionalForType = false;
  // Same Flag field, different value: blank means this expense type needs a second, separate
  // Manager Approved Attachment - see requiresManagerApprovedAttachment in ClaimContext.tsx.
  const requiresManagerApprovedAttachment = expenseTypes.find((et: any) => et.name === expenseType)?.requiresManagerApprovedAttachment === true;

  // Non-CTC: Mobile Exp — turns on the multi-month flow below in place of the single
  // date/amount/document fields. Every other expense type is completely unaffected. Driven by
  // ExptypeSet's own IsMobile flag now (GL-set-driven, ~22 types on dev) rather than matching
  // specific expense-type names, which stopped being a stable signal once the dropdown moved to
  // SAP GL sets.
  const isMobileExpense = !!expenseTypes.find((et) => et.name === expenseType)?.isMobile;

  // Non-CTC: Mobile Exp — the local `claims` list only holds claims currently assigned to this
  // user (LoginId is cleared once a claim moves past them, e.g. once approved/posted), so an
  // older already-claimed month would silently stop being excluded here otherwise. This reads the
  // employee's full claim history by EmpId as a second check - best-effort (fails to [] rather
  // than blocking the picker if EmpId isn't filterable on this SAP landscape yet).
  const [sapClaimedMonthKeys, setSapClaimedMonthKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!isMobileExpense) { setSapClaimedMonthKeys(new Set()); return; }
    const sapTypeId = expenseTypes.find((et: any) => et.name === expenseType)?.id;
    if (!sapTypeId) return;
    let cancelled = false;
    fetchClaimedMonthsForExpenseType(sapTypeId).then((months) => {
      if (!cancelled) setSapClaimedMonthKeys(new Set(months));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileExpense, expenseType, expenseTypes]);

  // Months already claimed for this expense type - from claims the app has already fetched (no
  // extra call) merged with the SAP-wide check above.
  const claimedMonthKeys = useMemo(() => {
    const mobileTypeNames = new Set(expenseTypes.filter((et) => et.isMobile).map((et) => et.name));
    const set = new Set<string>();
    claims.forEach((c: any) => {
      if (mobileTypeNames.has(c.expenseType) && c.expenseDate) {
        set.add(String(c.expenseDate).slice(0, 7));
      }
    });
    sapClaimedMonthKeys.forEach((mk) => set.add(mk));
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims, sapClaimedMonthKeys, expenseTypes]);

  // The months actually picked across all slots, in slot order - what every card/total below
  // renders from. Empty slots (not yet picked) are filtered out.
  const pickedMonths = useMemo(() => selectedMonths.filter(Boolean), [selectedMonths]);

  // Options for one slot's picker: every month in the lookback window, minus already-claimed
  // months, minus whatever's already picked in every OTHER slot (so the same month can't end up
  // selected twice across different cards) - but including this slot's own current pick, so
  // re-opening its picker still shows it as selected.
  const getAvailableMonthsForSlot = (slotIndex: number) => {
    const takenElsewhere = new Set(
      selectedMonths.filter((mk, i) => i !== slotIndex && mk),
    );
    return getPeriodPickerOptions().filter((mk) => !claimedMonthKeys.has(mk) && !takenElsewhere.has(mk));
  };

  const addMonthSlot = () => setSelectedMonths((prev) => [...prev, '']);

  // Always keeps at least one slot - removing the only one just resets it to empty rather than
  // leaving zero cards with no entry point to pick a month at all.
  const removeMonthSlot = (slotIndex: number) => {
    setSelectedMonths((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== slotIndex)));
  };

  // Non-CTC: Mobile Exp - kicks off the grade-based eligibility cap lookup as soon as a month is
  // picked, so it's usually already back by the time the invoice document is uploaded/OCR'd.
  const fetchEligibilityForMonth = async (monthKey: string) => {
    if (!currentUser?.employeeId) return;
    const result = await fetchEligibility(currentUser.employeeId, monthKey);
    setMonthClaims((prev) => {
      const entry = prev[monthKey] || BLANK_MONTH_ENTRY;
      return { ...prev, [monthKey]: { ...entry, eligibleAmount: result ? result.eligibleAmount : null, eligibilityChecked: true, category: result?.category || null } };
    });
  };

  const selectMonthForSlot = (slotIndex: number, monthKey: string) => {
    setSelectedMonths((prev) => prev.map((mk, i) => (i === slotIndex ? monthKey : mk)));
    setMonthPickerSlotIndex(null);
    if (monthKey) fetchEligibilityForMonth(monthKey);
  };

  const getMonthEntry = (monthKey: string): MonthClaimEntry =>
    monthClaims[monthKey] || BLANK_MONTH_ENTRY;

  // Running totals across every picked month - so the employee sees the overall numbers without
  // manually adding up each card. Null Eligible Amount (not fetched yet) counts as 0, not
  // "unknown" - once the grade table is wired in this will only ever be a real number per card.
  const totalEligibleAmount = useMemo(
    () => pickedMonths.reduce((sum, mk) => sum + (getMonthEntry(mk).eligibleAmount || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedMonths, monthClaims],
  );
  const totalClaimAmount = useMemo(
    () => pickedMonths.reduce((sum, mk) => sum + (parseFloat(getMonthEntry(mk).claimAmount) || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedMonths, monthClaims],
  );

  const anyMonthAboveEligibility = useMemo(
    () => pickedMonths.some((mk) => {
      const entry = getMonthEntry(mk);
      return entry.eligibleAmount != null && (parseFloat(entry.claimAmount) || 0) > entry.eligibleAmount;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedMonths, monthClaims],
  );
  // Non-CTC: Mobile Exp - Category is a property of the employee's cost centre (non-sales vs which
  // sales channel), not the month, but it only arrives via the per-month Eligibility call - any
  // month card that's already resolved it carries the same value.
  const employeeCategory = useMemo(
    () => pickedMonths.map((mk) => getMonthEntry(mk).category).find(Boolean) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickedMonths, monthClaims],
  );
  // NS (non-sales) above the cap goes through the HoD pick list; any sales category (SC/SH/SM/
  // SE/SG) above the cap goes straight to the employee's L1 supervisor instead, no choice offered.
  const needsHodChoice = isMobileExpense && anyMonthAboveEligibility && employeeCategory === 'NS';
  const needsL1Notice = isMobileExpense && anyMonthAboveEligibility && !!employeeCategory && employeeCategory !== 'NS';

  // Re-fetches whenever the total claim amount changes, per the backend's "Amount = header
  // TotalAmount" / "re-fetch when the total amount changes" instructions.
  useEffect(() => {
    if (!needsHodChoice || !currentUser?.employeeId || totalClaimAmount <= 0) {
      setHodApprovers([]);
      setSelectedHodApprId('');
      return;
    }
    let cancelled = false;
    setHodLoading(true);
    fetchHodApprovers(currentUser.employeeId, totalClaimAmount).then((rows) => {
      if (cancelled) return;
      setHodApprovers(rows);
      // A single candidate is auto-selected (no choice needed); 2+ requires the user to pick.
      setSelectedHodApprId(rows.length === 1 ? rows[0].apprId : '');
      setHodLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsHodChoice, totalClaimAmount]);

  // Mirrors extractDocumentDetails above, but for one month card: reads the invoice's amount
  // (auto-fills Claim Amount if the user hasn't typed one yet) and its printed date (checked
  // against this card's own month — informational warning only, same backend endpoint, no new
  // infrastructure). 503/non-2xx responses no-op exactly like the existing flow, same reasoning.
  const extractMonthDocumentDetails = async (monthKey: string, attachment: Attachment) => {
    setMonthExtractingKey(monthKey);
    try {
      const fileRes = await fetch(attachment.uri);
      const blob = await fileRes.blob();
      const base64 = await blobToBase64(blob);

      const response = await axios.post(
        `${API_BASE_URL}/api/expense/extract-document`,
        { mimeType: attachment.type || blob.type, data: base64 },
        { validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) return;

      const { totalAmount, invoiceDate, invoiceNumber } = response.data || {};

      setMonthClaims((prev) => {
        const entry = prev[monthKey] || BLANK_MONTH_ENTRY;
        // Default Claim Amount to the invoice amount, capped at the grade's Eligible Amount if one
        // applies (null eligibleAmount = no cap) - only when the user hasn't already typed a value.
        const claimAmount = (!entry.claimAmount && totalAmount && Number(totalAmount) > 0)
          ? (entry.eligibleAmount != null ? Math.min(Number(totalAmount), entry.eligibleAmount) : Number(totalAmount)).toString()
          : entry.claimAmount;

        let dateMismatchWarning: string | null = null;
        if (invoiceDate) {
          const invoiceMonthKey = String(invoiceDate).slice(0, 7);
          if (invoiceMonthKey !== monthKey) {
            dateMismatchWarning = `This invoice is dated ${formatMonthLabel(invoiceMonthKey)}, but it's attached to the ${formatMonthLabel(monthKey)} card.`;
          }
        }

        return { ...prev, [monthKey]: { ...entry, claimAmount, dateMismatchWarning, invoiceNumber: invoiceNumber || null } };
      });
    } catch {
      // Same as the existing single-document flow: a failed read just leaves the fields for the
      // user to fill in manually, no error surfaced for this best-effort auto-fill.
    } finally {
      setMonthExtractingKey(null);
    }
  };

  const pickMonthAttachment = async (monthKey: string) => {
    setMonthPickingKey(monthKey);
    try {
      setFormError('');
      const result = await getDocumentAsync({ multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !asset.uri) return;

      const mimeType = getMimeTypeForFile(asset.name, asset.mimeType);
      if (!isAttachmentAllowed(asset.name, mimeType)) {
        setFormError(`Unsupported attachment type. Allowed file types: ${ALLOWED_ATTACHMENT_LABEL}.`);
        return;
      }

      const newAtt: Attachment = { id: `att-${monthKey}-${Date.now()}`, name: asset.name || 'document', uri: asset.uri, size: asset.size || 0, type: mimeType };
      setMonthClaims((prev) => ({ ...prev, [monthKey]: { ...getMonthEntry(monthKey), attachment: newAtt } }));
      extractMonthDocumentDetails(monthKey, newAtt);
    } catch {
      setFormError('Unable to add attachment. Please try again with a supported file.');
    } finally {
      setMonthPickingKey(null);
    }
  };

  const removeMonthAttachment = (monthKey: string) => {
    setMonthClaims((prev) => ({ ...prev, [monthKey]: { ...getMonthEntry(monthKey), attachment: null, dateMismatchWarning: null, invoiceNumber: null } }));
  };

  const setMonthClaimAmount = (monthKey: string, value: string) => {
    setMonthClaims((prev) => ({ ...prev, [monthKey]: { ...getMonthEntry(monthKey), claimAmount: value } }));
  };

  // Reads GSTIN / HSN / total amount off the first Supporting Document the user uploads, via a
  // backend endpoint that calls Claude's document understanding (not live yet - the backend
  // returns 503 until ANTHROPIC_API_KEY is configured there, in which case this just no-ops and
  // the user fills everything in manually exactly as before). A detected GSTIN only auto-flips
  // "GSTIN Available" to Yes when it matches the real 15-character GSTIN format, so a bad OCR
  // read on a non-GST receipt can't force the GST flow (Region/HSN fields) on someone by mistake.
  const extractDocumentDetails = async (attachment: Attachment) => {
    setDocumentExtractionLoading(true);
    setDocumentExtractionError('');
    try {
      const fileRes = await fetch(attachment.uri);
      const blob = await fileRes.blob();
      const base64 = await blobToBase64(blob);

      const response = await axios.post(
        `${API_BASE_URL}/api/expense/extract-document`,
        { mimeType: attachment.type || blob.type, data: base64 },
        { validateStatus: () => true },
      );

      if (response.status === 503) return; // Not configured on the backend yet - silent no-op.
      if (response.status < 200 || response.status >= 300) {
        setDocumentExtractionError("Couldn't read details from this document automatically. Please fill them in manually.");
        return;
      }

      const { gstin, hsnSac: extractedHsn, totalAmount } = response.data || {};
      const normalizedExtractedGstin = (gstin || '').toString().replace(/\s+/g, '').toUpperCase();
      const isRealGstin = GSTIN_PATTERN.test(normalizedExtractedGstin);

      if (isRealGstin) {
        setGstinChoice('yes');
        setGstinInput(normalizedExtractedGstin);
      }

      if (extractedHsn) {
        setHsnSac(extractedHsn.toString().replace(/\s+/g, '').toUpperCase());
        setHsnAutoFillMissing(false);
      } else if (isRealGstin) {
        setHsnAutoFillMissing(true);
      }

      if (totalAmount && Number(totalAmount) > 0) {
        setAmountStr(Number(totalAmount).toString());
      }
    } catch (e) {
      setDocumentExtractionError("Couldn't read details from this document automatically. Please fill them in manually.");
    } finally {
      setDocumentExtractionLoading(false);
    }
  };

  type AttachmentSectionKey = 'original' | 'supporting' | 'managerApproved';

  // Shared by all three attachment sections (Original Expense Document, Supporting Document, and
  // Manager Approved Attachment) - all three ride in the SAME SAP submission payload (see
  // handleSubmit's combined `attachments` and ClaimContext's allAttachments), so they share ONE
  // combined size budget across all lists, not one budget each — independent 70KB budgets per
  // section would let a claim carry far more than the backend proxy's request-size limit accepts
  // (confirmed: PayloadTooLargeError).
  const pickAttachmentInto = async (target: AttachmentSectionKey) => {
    const sections: Record<AttachmentSectionKey, {
      list: Attachment[];
      setList: (updater: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void;
      sources: Record<string, { uri: string; mimeType: string }>;
      setSources: (updater: Record<string, { uri: string; mimeType: string }> | ((prev: Record<string, { uri: string; mimeType: string }>) => Record<string, { uri: string; mimeType: string }>)) => void;
      maxFiles: number;
    }> = {
      original: {
        list: originalExpenseDocument,
        setList: setOriginalExpenseDocument,
        sources: originalExpenseDocumentSources,
        setSources: setOriginalExpenseDocumentSources,
        maxFiles: 1,
      },
      supporting: {
        list: supportingDocuments,
        setList: setSupportingDocuments,
        sources: supportingDocumentSources,
        setSources: setSupportingDocumentSources,
        maxFiles: Infinity,
      },
      managerApproved: {
        list: managerApprovedAttachments,
        setList: setManagerApprovedAttachments,
        sources: managerApprovedOriginalSources,
        setSources: setManagerApprovedOriginalSources,
        maxFiles: Infinity,
      },
    };

    const current = sections[target];
    if (current.list.length >= current.maxFiles) {
      setFormError('Remove the current document before adding another.');
      return;
    }

    const otherKeys = (Object.keys(sections) as AttachmentSectionKey[]).filter((k) => k !== target);
    const otherList = otherKeys.flatMap((k) => sections[k].list);
    const otherSources = otherKeys.reduce(
      (acc, k) => ({ ...acc, ...sections[k].sources }),
      {} as Record<string, { uri: string; mimeType: string }>,
    );

    setPickingTarget(target);
    try {
      setFormError('');
      const result = await getDocumentAsync({ multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset || !asset.uri) return;

      const attachmentMimeType = getMimeTypeForFile(asset.name, asset.mimeType);
      if (!isAttachmentAllowed(asset.name, attachmentMimeType)) {
        setFormError(`Unsupported attachment type. Allowed file types: ${ALLOWED_ATTACHMENT_LABEL}.`);
        return;
      }

      // Images can be safely re-encoded smaller, and a PDF can be re-rasterized smaller —
      // XLS/XLSX/CSV/TXT can't be shrunk either way and are left exactly as picked.
      const isRecompressible = attachmentMimeType.startsWith('image/') || attachmentMimeType === 'application/pdf';
      const newId = `att-${Date.now()}`;

      // Budget math runs across ALL THREE lists combined - everything already on the claim, in
      // any section, counts against the one shared ceiling.
      const combinedExisting = [...current.list, ...otherList];
      const combinedSources = { ...current.sources, ...otherSources };

      // Attachments that can't be (further) shrunk — resubmit-loaded attachments, and any
      // non-image/PDF file already on the claim — are a fixed cost against the shared budget.
      // Everything else (image/PDF attachments picked this session) gets re-targeted below.
      const reservedBytes = combinedExisting.reduce(
        (sum, a) => (combinedSources[a.id] ? sum : sum + (a.size || 0)),
        0,
      );
      const recompressibleCount = combinedExisting.filter((a) => combinedSources[a.id]).length + (isRecompressible ? 1 : 0);
      const targetBytes = recompressibleCount > 0 ? getPerFileTargetBytes(recompressibleCount, reservedBytes) : null;

      if (isRecompressible && targetBytes === null) {
        setFormError('This claim is already close to the safe combined attachment size. Remove an attachment before adding another.');
        return;
      }

      let finalUri = asset.uri;
      let finalSize = asset.size || 0;
      let finalType = attachmentMimeType;

      if (attachmentMimeType.startsWith('image/')) {
        const compressed = await compressAttachmentImage(asset.uri, targetBytes as number);
        if (compressed) {
          finalUri = compressed.uri;
          finalSize = compressed.size;
          // Compression always re-encodes as JPEG — the stored Mimetype must say so too.
          finalType = 'image/jpeg';
        }
      } else if (attachmentMimeType === 'application/pdf') {
        if ((asset.size || 0) > (targetBytes as number)) {
          const compressed = await ensurePdfAttachmentUnderLimit(asset.uri, targetBytes as number);
          if (compressed) {
            finalUri = compressed.uri;
            finalSize = compressed.size;
          } else {
            setFormError('This PDF is too large and could not be compressed enough to upload alongside your other attachments. Please attach a smaller PDF or remove an existing attachment.');
            return;
          }
        }
      } else if (reservedBytes + finalSize > SAFE_COMBINED_RAW_ATTACHMENT_BYTES) {
        // XLS/XLSX/CSV/TXT can't be shrunk — reject outright rather than let it blow the real
        // combined ceiling at submit time.
        setFormError(`This file is too large to add alongside your other attachments (max ${MAX_ATTACHMENTS_TOTAL_LABEL}). Please use a smaller file or remove an existing attachment.`);
        return;
      }

      const newAtt: Attachment = { id: newId, name: asset.name || 'document', uri: finalUri, size: finalSize, type: finalType };

      // Existing session-picked image/PDF attachments — in ANY section — were compressed
      // against a looser (fewer-attachments) target; re-derive each from its pristine source
      // against the same tighter target this new attachment uses, so the combined total across
      // all sections actually stays in budget. Recompressed results are split back into their
      // original section below.
      let finalCombined: Attachment[];
      if (isRecompressible && recompressibleCount > 1) {
        finalCombined = await Promise.all(
          combinedExisting.map(async (a) => {
            const original = combinedSources[a.id];
            if (!original) return a;
            if (original.mimeType.startsWith('image/')) {
              const recompressed = await compressAttachmentImage(original.uri, targetBytes as number);
              return recompressed ? { ...a, uri: recompressed.uri, size: recompressed.size, type: 'image/jpeg' } : a;
            }
            const recompressed = await ensurePdfAttachmentUnderLimit(original.uri, targetBytes as number);
            return recompressed ? { ...a, uri: recompressed.uri, size: recompressed.size } : a;
          }),
        );
      } else {
        finalCombined = combinedExisting;
      }

      // Final safety net against the real combined ceiling, using the actual post-compression
      // sizes rather than the predicted target — catches any edge case the math above missed.
      const finalTotal = finalCombined.reduce((sum, a) => sum + (a.size || 0), 0) + finalSize;
      if (finalTotal > SAFE_COMBINED_RAW_ATTACHMENT_BYTES) {
        setFormError(`Combined attachment size would exceed the safe upload limit (${MAX_ATTACHMENTS_TOTAL_LABEL}). Please remove an attachment or use a smaller file.`);
        return;
      }

      // Split the (possibly recompressed) combined set back into each section's own list by id.
      otherKeys.forEach((k) => {
        const ownIds = new Set(sections[k].list.map((a) => a.id));
        const recompressedForSection = finalCombined.filter((a) => ownIds.has(a.id));
        if (recompressedForSection.length > 0) sections[k].setList(recompressedForSection);
      });
      const thisSectionIds = new Set(current.list.map((a) => a.id));
      const recompressedThis = finalCombined.filter((a) => thisSectionIds.has(a.id));

      current.setList([...recompressedThis, newAtt]);
      if (isRecompressible) {
        current.setSources((prev) => ({ ...prev, [newId]: { uri: asset.uri, mimeType: attachmentMimeType } }));
      }

      // Only the Original Expense Document is a candidate receipt to read GST/HSN/Amount off of -
      // not Supporting Document or the separate Manager Approved Attachment.
      if (target === 'original') {
        extractDocumentDetails(newAtt);
      }
    } catch (err) {
      setFormError('Unable to add attachment. Please try again with a supported file.');
    } finally {
      setPickingTarget(null);
    }
  };

  const handlePickOriginalExpenseDocument = () => pickAttachmentInto('original');
  const handlePickSupportingDocument = () => pickAttachmentInto('supporting');
  const handlePickManagerApprovedAttachment = () => pickAttachmentInto('managerApproved');

  const handleRemoveOriginalExpenseDocument = (id: string) => {
    setOriginalExpenseDocument((prev) => prev.filter((a) => a.id !== id));
    setOriginalExpenseDocumentSources((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFormError('');
  };

  const handleRemoveSupportingDocument = (id: string) => {
    setSupportingDocuments((prev) => prev.filter((a) => a.id !== id));
    setSupportingDocumentSources((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFormError('');
  };

  const handleRemoveManagerApprovedAttachment = (id: string) => {
    setManagerApprovedAttachments((prev) => prev.filter((a) => a.id !== id));
    setManagerApprovedOriginalSources((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFormError('');
  };

  const handleSubmit = async (isDraft: boolean) => {
    // Non-CTC: Mobile Exp — one CLAIMNAV row per picked month, each with its own document/amount/
    // receipt number, plus the Finance Document and Approval Notes as extra rows (see
    // ClaimContext.addClaim's mobileMonthItems branch). Eligible-amount-vs-claim-amount routing
    // (auto-park vs HoD) is still decided server-side by the DOA chain per the claim total, same
    // as every other expense type now that the DOA chain is live - no separate client-side routing
    // decision is needed here.
    if (isMobileExpense) {
      if (pickedMonths.length === 0) {
        setFormError('Please select at least one month to claim.');
        return;
      }
      const missingDocMonth = pickedMonths.find((mk) => !getMonthEntry(mk).attachment);
      if (missingDocMonth) {
        setFormError(`Please add the invoice document for ${formatMonthLabel(missingDocMonth)}.`);
        return;
      }
      const invalidAmountMonth = pickedMonths.find((mk) => !(parseFloat(getMonthEntry(mk).claimAmount) > 0));
      if (invalidAmountMonth) {
        setFormError(`Please enter a valid Claim Amount for ${formatMonthLabel(invalidAmountMonth)}.`);
        return;
      }
      if (needsHodChoice && hodApprovers.length >= 2 && !selectedHodApprId) {
        setFormError('Please select the HoD to send this claim to.');
        return;
      }
      // No HoD maintained for this cost centre - the backend now blocks this claim outright
      // (it used to silently fall back to the supervisor), so stop it here with a clear reason
      // instead of letting the user submit into a guaranteed SAP rejection.
      if (needsHodChoice && !hodLoading && hodApprovers.length === 0) {
        setFormError('No HoD is maintained for your cost centre - contact Admin.');
        return;
      }

      setAmountError('');
      setFormError('');

      const mobileMonthItems: MobileMonthItem[] = pickedMonths.map((monthKey) => {
        const entry = getMonthEntry(monthKey);
        const [y, m] = monthKey.split('-').map(Number);
        return {
          expenseDate: `${y}-${String(m).padStart(2, '0')}-01`,
          amount: parseFloat(entry.claimAmount) || 0,
          receiptNo: entry.invoiceNumber || undefined,
          attachment: entry.attachment as Attachment,
        };
      });

      const claimData: any = {
        employeeId: currentUser.employeeId,
        employeeName: currentUser.employeeName,
        department: currentUser.department,
        designation: currentUser.designation,
        claimDate,
        expenseType,
        itemNo,
        amount: totalClaimAmount,
        costCenter,
        justification: justification || 'Mobile Expense - missed months catch-up',
        // Mobile's documents travel per-month via mobileMonthItems, not this combined list.
        attachments: [],
        managerApprovedAttachments,
        // Chosen HoD (non-sales, 2+ candidates) or the single auto-selected one - undefined when
        // there's nothing to choose (sales employee, or 0/1 HoD candidates).
        selAppr: selectedHodApprId || undefined,
        lifnr: null,
        name1: null,
        stcd3: null,
        bezei: null,
        hsnSac: null,
      };

      const result = await addClaim(claimData, isDraft, existingClaimId, mobileMonthItems);
      if (!result.success) {
        setFormError(result.warning || 'Unable to submit claim. Please review the form and try again.');
        return;
      }

      setSuccessMessage(
        isDraft
          ? 'Your expense claim has been saved as a draft.'
          : 'Your claim has been successfully submitted.'
      );
      setSuccessModalVisible(true);
      fetchClaims();
      return;
    }

    if (parsedAmount <= 0) {
      setAmountError('Amount must be greater than 0');
      return;
    }

    if (!expenseType || expenseType === 'Select Expense Type') {
      setFormError('Please select an Expense Type.');
      return;
    }

    if (!attachmentOptionalForType && originalExpenseDocument.length === 0) {
      setFormError('Please upload the Original Expense Document.');
      return;
    }

    if (gstinChoice === 'yes' && !selectedGst) {
      setFormError('Enter a valid 15-digit GSTIN and wait for lookup before submitting.');
      return;
    }

    if (gstinChoice === 'yes' && selectedGst && !selectedArea) {
      setFormError('Unable to determine Region for this GSTIN. Please re-enter the GSTIN or contact support.');
      return;
    }

    if (gstinChoice === 'yes' && !hsnSac.trim()) {
      setFormError("HSN Code couldn't be auto-detected from the document. Please enter it manually before submitting.");
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
      // ClaimContext/SAP still see one single combined list, exactly as before the two-section
      // split - no backend/data-flow changes needed.
      attachments: [...originalExpenseDocument, ...supportingDocuments],
      managerApprovedAttachments,
      lifnr: gstinChoice === 'yes' ? (selectedGst?.item?.Lifnr || selectedGst?.item?.lifnr || null) : null,
      name1: gstinChoice === 'yes' ? (selectedGst?.item?.Name1 || selectedGst?.item?.name1 || null) : null,
      stcd3: gstinChoice === 'yes' ? (selectedGst?.item?.Stcd3 || selectedGst?.item?.stcd3 || null) : null,
      bezei: gstinChoice === 'yes' ? (selectedArea?.Bezei || null) : null,
      hsnSac: gstinChoice === 'yes' ? (hsnSac.trim() || null) : null,
    };

    const result = await addClaim(claimData, isDraft, existingClaimId);

    if (!result.success) {
      setFormError(result.warning || 'Unable to submit claim. Please review the form and try again.');
      return;
    }

    setSuccessMessage(
      isDraft
        ? 'Your expense claim has been saved as a draft.'
        : 'Your claim has been successfully submitted.'
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

      {/* Original Expense Document - moved ahead of Claim Details so uploading the receipt first
          can auto-fill GSTIN/Region, HSN, and Amount below via extractDocumentDetails. Capped at
          exactly 1 file - this is the receipt/invoice itself, not a general attachment bucket.
          Hidden for Non-CTC: Mobile Exp - that flow uploads one document per claimed month
          instead (see the per-month cards below Claim Details). */}
      {!isMobileExpense && (
      <Card className="mb-3">
        <h2 className="text-sm font-bold text-ink">Original Expense Document{attachmentOptionalForType ? '' : ' *'}</h2>
        <p className="text-xs text-inkSoft">{attachmentOptionalForType ? 'Optional for this expense type' : 'Mandatory — upload the receipt or invoice for this expense'}</p>
        <p className="text-xs text-inkSoft">Allowed: {ALLOWED_ATTACHMENT_LABEL}</p>
        <p className="mb-3 text-xs text-inkSoft">Images/PDFs are compressed automatically; combined size after compression: {MAX_ATTACHMENTS_TOTAL_LABEL}</p>

        {originalExpenseDocument.map((att) => (
          <div key={att.id} className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
            <FileText size={20} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{att.name}</span>
            <button type="button" onClick={() => handlePreviewAttachment(att)} aria-label="View document" className="rounded p-1.5 text-brand hover:bg-cream">
              <Eye size={18} />
            </button>
            <button type="button" onClick={() => handleRemoveOriginalExpenseDocument(att.id)} aria-label="Remove document" className="rounded p-1.5 text-red hover:bg-redBg">
              <Trash2 size={18} />
            </button>
          </div>
        ))}

        {originalExpenseDocument.length === 0 ? (
          <button
            type="button"
            onClick={handlePickOriginalExpenseDocument}
            disabled={pickingTarget !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-cream/40 py-3 text-sm font-semibold text-brand hover:bg-cream disabled:opacity-60"
          >
            <CloudUpload size={18} /> Add Attachment / Scanned Receipt
          </button>
        ) : (
          <p className="text-xs text-inkSoft">Remove the current document to upload a different one.</p>
        )}

        {pickingTarget === 'original' && (
          <div className="mt-2 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Processing document — large or multi-page files can take a little while to compress…</div>
        )}

        {documentExtractionLoading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Reading GST, HSN and amount details from the document…</div>
        )}
        {documentExtractionError && (
          <p className="mt-2 text-xs font-semibold text-red">{documentExtractionError}</p>
        )}
      </Card>
      )}

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
            onChange={(v) => {
              if (v) {
                setGstinChoice('yes');
                setGstinInput('');
                setSelectedGst(null);
                setGstLookupError('');
                setSelectedArea(null);
                setHsnSac('');
                setHsnAutoFillMissing(false);
              } else {
                setGstinChoice('no');
                setGstinInput('');
                setSelectedGst(null);
                setGstLookupError('');
                setSelectedArea(null);
                setHsnSac('');
                setHsnAutoFillMissing(false);
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
                    if (normalized.length !== 15) { setSelectedGst(null); setSelectedArea(null); }
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
                <Input
                  value={selectedArea ? `${selectedArea.Bland}${selectedArea.Bezei ? ` (${selectedArea.Bezei})` : ''}` : ''}
                  placeholder={gstLookupLoading ? 'Determining region…' : 'Auto-filled from GSTIN'}
                  disabled
                />
              </Field>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field
                label="HSN Code"
                required={hsnAutoFillMissing}
                error={hsnAutoFillMissing ? "Couldn't auto-detect this from the document — please enter it manually." : undefined}
              >
                <Input
                  value={hsnSac}
                  onChange={(e) => { setHsnSac(e.target.value.replace(/\s+/g, '').toUpperCase()); setHsnAutoFillMissing(false); }}
                  placeholder="Enter HSN/SAC code"
                  maxLength={16}
                />
              </Field>
              <div />
            </div>
          </>
        )}

        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Amount is per-month for Mobile Exp (see Claim Amount on each month card below) -
              there's no single claim-wide amount to enter here for that flow. */}
          {!isMobileExpense && (
            <Field label="Amount (₹)" required>
              <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0.00" inputMode="decimal" />
              {amountError && (
                <div className="mt-2">
                  <Banner type="error">{amountError}</Banner>
                </div>
              )}
            </Field>
          )}

          <Field label="Cost Center" required>
            <Input value={costCenter} disabled />
          </Field>
        </div>

        <Field label="Business Justification">
          <TextArea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="State the business purpose for this expense..." />
        </Field>
      </Card>

      {/* Non-CTC: Mobile Exp — one card by default, each with its own document, Eligible/Claim
          Amount; "+ Add Another Month" grows the list for a missed-months catch-up. No From/To
          range - missed months aren't always contiguous, and a single default card means the
          common one-month case needs no extra field at all. Only shown for this expense type;
          every other type keeps the single-document/single-amount flow above untouched. */}
      {isMobileExpense && (
        <>
          {selectedMonths.map((monthKey, slotIndex) => {
            const entry = monthKey ? getMonthEntry(monthKey) : null;
            return (
              <Card key={slotIndex} className="mb-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => { setMonthPickerSlotIndex(slotIndex); setMonthPickerSearch(''); }}
                    className="input flex max-w-xs flex-1 items-center justify-between text-left"
                  >
                    <span className={monthKey ? 'truncate font-semibold text-ink' : 'truncate text-inkSoft'}>
                      {monthKey ? formatMonthLabel(monthKey) : 'Select Month'}
                    </span>
                    <ChevronDown size={16} className="shrink-0 text-inkSoft" />
                  </button>
                  {selectedMonths.length > 1 && (
                    <button type="button" onClick={() => removeMonthSlot(slotIndex)} aria-label="Remove this month" className="rounded p-1.5 text-red hover:bg-redBg">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                {!monthKey ? (
                  <p className="text-xs text-inkSoft">Pick the month this claim is for.</p>
                ) : (
                  <>
                    {entry!.attachment ? (
                      <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
                        <FileText size={20} className="shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{entry!.attachment.name}</span>
                        <button type="button" onClick={() => entry!.attachment && handlePreviewAttachment(entry!.attachment)} aria-label="View document" className="rounded p-1.5 text-brand hover:bg-cream">
                          <Eye size={18} />
                        </button>
                        <button type="button" onClick={() => removeMonthAttachment(monthKey)} aria-label="Remove document" className="rounded p-1.5 text-red hover:bg-redBg">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => pickMonthAttachment(monthKey)}
                        disabled={monthPickingKey !== null}
                        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-cream/40 py-3 text-sm font-semibold text-brand hover:bg-cream disabled:opacity-60"
                      >
                        <CloudUpload size={18} /> Add Invoice for {formatMonthLabel(monthKey)}
                      </button>
                    )}
                    {monthPickingKey === monthKey && (
                      <div className="mb-3 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Processing document…</div>
                    )}
                    {monthExtractingKey === monthKey && (
                      <div className="mb-3 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Reading amount, invoice number and date…</div>
                    )}
                    {entry!.dateMismatchWarning && (
                      <p className="mb-3 text-xs font-semibold text-red">{entry!.dateMismatchWarning}</p>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Field label="Invoice Number">
                        <Input value={entry!.invoiceNumber || ''} placeholder="Auto-fetched from invoice" disabled />
                      </Field>
                      <Field label="Eligible Amount (₹)">
                        <Input
                          value={entry!.eligibleAmount != null ? String(entry!.eligibleAmount) : (entry!.eligibilityChecked ? 'No Cap' : '')}
                          placeholder="Auto-fetched from grade table"
                          disabled
                        />
                      </Field>
                      <Field label="Claim Amount (₹)" required>
                        <Input
                          value={entry!.claimAmount}
                          onChange={(e) => setMonthClaimAmount(monthKey, e.target.value)}
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        {entry!.eligibleAmount != null && (parseFloat(entry!.claimAmount) || 0) > entry!.eligibleAmount && (
                          <div className="mt-2">
                            <Banner type="warn">
                              Rs {(parseFloat(entry!.claimAmount) || 0).toFixed(2)} is higher than eligibility Rs {entry!.eligibleAmount.toFixed(2)}. Approval needed.
                            </Banner>
                          </div>
                        )}
                      </Field>
                    </div>
                  </>
                )}
              </Card>
            );
          })}

          <button
            type="button"
            onClick={addMonthSlot}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand/40 bg-white py-2.5 text-sm font-semibold text-brand hover:bg-cream"
          >
            + Add Another Month
          </button>

          {pickedMonths.length > 0 && (
            <Card className="mb-3">
              <h2 className="mb-3 text-sm font-bold text-ink">Total Across {pickedMonths.length} Month{pickedMonths.length === 1 ? '' : 's'}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-cream/40 px-3 py-2.5">
                  <p className="text-xs font-semibold text-inkSoft">Total Eligible Amount (₹)</p>
                  <p className="text-lg font-extrabold text-ink">{totalEligibleAmount.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-border bg-cream/40 px-3 py-2.5">
                  <p className="text-xs font-semibold text-inkSoft">Total Claim Amount (₹)</p>
                  <p className="text-lg font-extrabold text-ink">{totalClaimAmount.toFixed(2)}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Non-CTC: Mobile Exp - HoD choice (non-sales, Category='NS') or an L1-approver notice
              (sales, Category SC/SH/SM/SE/SG), only once the claim total is above the eligibility
              cap. */}
          {needsHodChoice && (
            <Card className="mb-3">
              <h2 className="mb-2 text-sm font-bold text-ink">Approval Routing</h2>
              {hodLoading ? (
                <div className="flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Checking HoD approvers…</div>
              ) : hodApprovers.length === 0 ? (
                <p className="text-xs font-semibold text-red">No HoD is maintained for your cost centre - contact Admin.</p>
              ) : hodApprovers.length === 1 ? (
                <p className="text-sm text-ink">Will be sent to <span className="font-bold">{hodApprovers[0].apprName}</span> for approval.</p>
              ) : (
                <Field label="Send to HoD" required hint="More than one HoD can approve this amount - pick one.">
                  <Select
                    value={selectedHodApprId}
                    onChange={setSelectedHodApprId}
                    options={[{ value: '', label: 'Select an approver…' }, ...hodApprovers.map((a) => ({ value: a.apprId, label: a.apprName }))]}
                  />
                </Field>
              )}
            </Card>
          )}
          {needsL1Notice && (
            <Card className="mb-3">
              <h2 className="mb-2 text-sm font-bold text-ink">Approval Routing</h2>
              <p className="text-sm text-ink">Will go to your L1 approver.</p>
            </Card>
          )}
        </>
      )}

      {/* Supporting Document - optional, any number of additional related documents. No
          extraction/OCR runs on these; only the Original Expense Document above feeds that. */}
      <Card className="mb-3">
        <h2 className="text-sm font-bold text-ink">Supporting Document</h2>
        <p className="text-xs text-inkSoft">Optional — upload any other related document</p>
        <p className="text-xs text-inkSoft">Allowed: {ALLOWED_ATTACHMENT_LABEL}</p>
        <p className="mb-3 text-xs text-inkSoft">Images/PDFs are compressed automatically; combined size after compression: {MAX_ATTACHMENTS_TOTAL_LABEL}</p>

        {supportingDocuments.map((att) => (
          <div key={att.id} className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
            <FileText size={20} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{att.name}</span>
            <button type="button" onClick={() => handlePreviewAttachment(att)} aria-label="View document" className="rounded p-1.5 text-brand hover:bg-cream">
              <Eye size={18} />
            </button>
            <button type="button" onClick={() => handleRemoveSupportingDocument(att.id)} aria-label="Remove document" className="rounded p-1.5 text-red hover:bg-redBg">
              <Trash2 size={18} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={handlePickSupportingDocument}
          disabled={pickingTarget !== null}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-cream/40 py-3 text-sm font-semibold text-brand hover:bg-cream disabled:opacity-60"
        >
          <CloudUpload size={18} /> Add Attachment
        </button>

        {pickingTarget === 'supporting' && (
          <div className="mt-2 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Processing document — large or multi-page files can take a little while to compress…</div>
        )}
      </Card>

      {/* Manager Approved Attachment - only for expense types whose ExptypeSet.Flag comes back blank */}
      {requiresManagerApprovedAttachment && (
        <Card className="mb-3">
          <p className="mb-3 text-sm font-semibold text-red/60">Manager Approved attachment is mandatory for 1st Telephone Claim</p>
          <h2 className="text-sm font-bold text-ink">Manager Approved Attachment *</h2>
          <p className="text-xs text-inkSoft">Allowed: {ALLOWED_ATTACHMENT_LABEL}</p>
          <p className="mb-3 text-xs text-inkSoft">Images/PDFs are compressed automatically; combined size after compression: {MAX_ATTACHMENTS_TOTAL_LABEL}</p>

          {managerApprovedAttachments.map((att) => (
            <div key={att.id} className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
              <FileText size={20} className="shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{att.name}</span>
              <button type="button" onClick={() => handlePreviewAttachment(att)} aria-label="View document" className="rounded p-1.5 text-brand hover:bg-cream">
                <Eye size={18} />
              </button>
              <button type="button" onClick={() => handleRemoveManagerApprovedAttachment(att.id)} aria-label="Remove document" className="rounded p-1.5 text-red hover:bg-redBg">
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={handlePickManagerApprovedAttachment}
            disabled={pickingTarget !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-brand/40 bg-cream/40 py-3 text-sm font-semibold text-brand hover:bg-cream disabled:opacity-60"
          >
            <CloudUpload size={18} /> Add Manager Approved Attachment
          </button>

          {pickingTarget === 'managerApproved' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-inkSoft"><Spinner size={13} /> Processing document — large or multi-page files can take a little while to compress…</div>
          )}
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => setCancelConfirmVisible(true)}>
          <X size={18} /> Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={(requiresManagerApprovedAttachment && managerApprovedAttachments.length === 0) || (needsHodChoice && !hodLoading && hodApprovers.length === 0)}
          onClick={() => handleSubmit(false)}
        >
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

      {/* Month Picker Modal (Non-CTC: Mobile Exp) - same list-with-search pattern as Expense
          Type above, so there's nothing new for the user to learn. Options exclude already-
          claimed months and whatever's already picked on every OTHER card (see
          getAvailableMonthsForSlot), so the same month can't be selected twice. */}
      <Modal
        open={monthPickerSlotIndex !== null}
        title="Select Month"
        onClose={() => setMonthPickerSlotIndex(null)}
      >
        <Input value={monthPickerSearch} onChange={(e) => setMonthPickerSearch(e.target.value)} placeholder="Search month or year" className="mb-3" />
        <div className="max-h-80 overflow-y-auto">
          {(() => {
            if (monthPickerSlotIndex === null) return null;
            const selected = selectedMonths[monthPickerSlotIndex];
            const options = getAvailableMonthsForSlot(monthPickerSlotIndex).filter((mk) =>
              formatMonthLabel(mk).toLowerCase().includes(monthPickerSearch.toLowerCase())
            );
            if (options.length === 0) {
              return <p className="py-3 text-sm text-inkSoft">No matching months</p>;
            }
            return options.map((mk) => (
              <button
                key={mk}
                type="button"
                onClick={() => selectMonthForSlot(monthPickerSlotIndex, mk)}
                className="flex w-full items-center justify-between border-b border-line py-2.5 text-left text-sm text-ink last:border-b-0 hover:bg-cream"
              >
                {formatMonthLabel(mk)}
                {selected === mk && <Check size={16} className="text-brand" />}
              </button>
            ));
          })()}
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
        onClose={() => { setPreviewModalVisible(false); setExcelPreview(null); }}
        size="lg"
        footer={
          <>
            {previewAttachment?.uri && (
              <Button variant="secondary" onClick={() => previewAttachment?.uri && window.open(previewAttachment.uri, '_blank')}>
                <Download size={16} /> Open in New Tab
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setPreviewModalVisible(false); setExcelPreview(null); }}>Close</Button>
          </>
        }
      >
        <div className="h-[60vh]">
          {previewAttachment && (
            previewAttachment.type?.startsWith('image/') || ['png', 'jpg', 'jpeg'].includes((previewAttachment.name.split('.').pop() || '').toLowerCase()) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewAttachment.uri} alt={previewAttachment.name} className="h-full w-full object-contain" />
            ) : previewAttachment.type && EXCEL_MIME_TYPES.includes(previewAttachment.type) ? (
              <div className="h-full overflow-auto p-2">
                {excelPreview?.status === 'loading' && (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-inkSoft"><Spinner size={16} /> Loading spreadsheet…</div>
                )}
                {excelPreview?.status === 'error' && (
                  <div className="flex h-full items-center justify-center"><p className="text-sm text-inkSoft">Couldn't preview this spreadsheet. Try "Open in New Tab" instead.</p></div>
                )}
                {excelPreview?.status === 'ready' && (
                  excelPreview.rows.length === 0 ? (
                    <div className="flex h-full items-center justify-center"><p className="text-sm text-inkSoft">This spreadsheet appears to be empty.</p></div>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <tbody>
                        {excelPreview.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="whitespace-nowrap border border-line px-2 py-1 text-ink">{cell ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            ) : (
              <iframe src={previewAttachment.uri} className="h-full w-full rounded-lg border-none" title={previewAttachment.name} />
            )
          )}
        </div>
      </Modal>

      <Modal open={cancelConfirmVisible} title="Cancel Claim?" onClose={() => setCancelConfirmVisible(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setCancelConfirmVisible(false)}>Keep Editing</Button>
          <Button variant="danger" onClick={() => { setCancelConfirmVisible(false); resetForm(); router.back(); }}>Yes, Cancel</Button>
        </>}>
        <p className="text-sm text-inkSoft">Are you sure you want to cancel? Any details you've entered will be lost.</p>
      </Modal>

      <MessageModal state={messageModal} onClose={() => setMessageModal(null)} />
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
