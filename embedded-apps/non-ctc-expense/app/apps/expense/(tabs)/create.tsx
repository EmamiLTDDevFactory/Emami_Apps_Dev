import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SAP_BASE_URL } from '../../../../src/config/api';
import { useAuth } from '../../../../src/context/AuthContext';
import { useClaim } from '../../../../src/context/ClaimContext';
import { ensurePdfAttachmentUnderLimit } from '../../../../src/lib/pdfAttachment';
import { Attachment } from '../../../../src/types';
import { formatCurrency } from '../../../../src/utils/currency';

// Remove hardcoded EXPENSE_TYPES

const COST_CENTERS = [
  'CC-SA',
  'CC-ENG-GLOBAL',
  'CC-MARKETING-UK',
  'CC-FINANCE-HQ',
  'CC-IT-INFRA',
];

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
]);

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'xls', 'xlsx', 'csv', 'txt']);
const ALLOWED_ATTACHMENT_LABEL = 'PDF, PNG, JPG, JPEG, XLS, XLSX, CSV, TXT';

// SAP's stored Filename never includes an extension — used only to reconstruct one for
// resubmitted attachments (see mapSAPClaimToFormData below), so the submit-time extension check
// has something valid to find instead of treating the whole extension-less name as one.
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

const MAX_ATTACHMENTS_TOTAL_BYTES = 30 * 1024 * 1024;
const MAX_ATTACHMENTS_TOTAL_LABEL = '30 MB';

// The claim gets POSTed as one base64-embedded JSON body straight to SAP, with no app-controlled
// size limit anywhere in that path — a modest image can trip a 413 from the gateway sitting in
// front of SAP well before it reaches the 30MB ceiling this screen warns about. Images can be
// safely re-encoded smaller without losing their usefulness as a receipt; compression tries
// progressively smaller width/quality combinations (most lenient first) until the file is at or
// under TARGET_FILE_BYTES, falling back to whatever got smallest if none of the steps quite reach
// it. PDF/XLS/XLSX/CSV/TXT attachments can't be shrunk this way and are deliberately left
// untouched.
//
// Uses the plain DOM canvas APIs directly (this app only ever runs on web — no native build
// config exists) rather than expo-image-manipulator: that library's web implementation in the
// SDK-52-compatible version (~13.0.6) silently ignores the compress/format options on
// saveAsync() and always returns a lossless PNG re-encode regardless of what's requested, which
// would have made the "JPEG at quality X" steps below no-ops.
const TARGET_FILE_BYTES = 70 * 1024;
const MAX_IMAGE_WIDTH = 1280;
const MIN_IMAGE_WIDTH = 320;
const COMPRESSION_STEPS = [
  { width: MAX_IMAGE_WIDTH, quality: 0.6 },
  { width: MAX_IMAGE_WIDTH, quality: 0.4 },
  { width: 960, quality: 0.4 },
  { width: 960, quality: 0.25 },
  { width: 640, quality: 0.3 },
  { width: 640, quality: 0.18 },
  { width: MIN_IMAGE_WIDTH, quality: 0.2 },
  { width: MIN_IMAGE_WIDTH, quality: 0.1 },
];

function loadImageElement(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = uri;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality));
}

async function compressAttachmentImage(uri: string, knownWidth?: number) {
  try {
    const img = await loadImageElement(uri);
    const naturalWidth = img.naturalWidth || knownWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    let bestBlob: Blob | null = null;
    for (const step of COMPRESSION_STEPS) {
      const targetWidth = Math.min(naturalWidth, step.width); // never upscale past the original
      const targetHeight = Math.max(1, Math.round(naturalHeight * (targetWidth / naturalWidth)));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      // eslint-disable-next-line no-await-in-loop
      const blob = await canvasToJpegBlob(canvas, step.quality);
      if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob;
      if (blob && blob.size <= TARGET_FILE_BYTES) break;
    }
    return bestBlob ? { uri: URL.createObjectURL(bestBlob), size: bestBlob.size } : null;
  } catch (e) {
    console.warn('Failed to compress attachment image, falling back to the original', e);
    return null;
  }
}

export default function CreateClaimScreen() {
  const router = useRouter();
  // Desktop-only: pair related fields side by side so the form isn't one very tall single column
  // inside a capped width. Below this width every pair falls back to stacked, i.e. exactly the
  // current mobile form. Layout only — no field, value, validation or handler changes.
  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 900;
  const { currentUser } = useAuth();
  const params = useLocalSearchParams();
  const editingClaimId = (params?.claimId as string) || '';
  // RESUBMIT_FEATURE: Add tempClaimForResubmit and setTempClaimForResubmit
  const { addClaim, policyLimit, autoApprovalThreshold, expenseTypes, fetchExpenseTypes, getClaimById, tempClaimForResubmit, setTempClaimForResubmit, claims, fetchAreas } = useClaim();

  // If currentUser is null (e.g. during a page reload before redirecting to login), don't render to prevent crashes
  if (!currentUser) return null;

  // Fetch expense types on mount
  useEffect(() => {
    fetchExpenseTypes();
  }, []);

  // Use dynamic types for picker, fallback to empty if still loading
  const dynamicExpenseTypes = expenseTypes.map((et, index) => ({
    id: et.id || `${et.name}-${index}`,
    name: et.name,
  }));
  const [typeSearch, setTypeSearch] = useState('');
  const filteredExpenseTypes = dynamicExpenseTypes.filter(type =>
    type.name.toLowerCase().includes(typeSearch.toLowerCase())
  );

  const recentExpenseTypeNames = useMemo(() => {
    const seen = new Set<string>();
    const recent: string[] = [];

    // Prefer most recent expense types from the user's claims
    [...claims].reverse().forEach(claim => {
      const name = (claim.expenseType || '').toString().trim();
      if (name && !seen.has(name) && recent.length < 5) {
        seen.add(name);
        recent.push(name);
      }
    });

    // Fallback to the first expense types from SAP if there are not enough recent claims
    if (recent.length < 5) {
      dynamicExpenseTypes.forEach(type => {
        if (recent.length >= 5) return;
        const name = type.name?.toString().trim();
        if (name && !seen.has(name)) {
          seen.add(name);
          recent.push(name);
        }
      });
    }

    return recent;
  }, [claims, dynamicExpenseTypes]);

  // Form State
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [claimDateObj, setClaimDateObj] = useState<Date>(new Date());
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseType, setExpenseType] = useState(dynamicExpenseTypes[0]?.name || 'Select Expense Type');
  const [itemNo, setItemNo] = useState('000001');

  // Update default selected value when types finish loading
  useEffect(() => {
    if (expenseTypes.length > 0 && expenseType === 'Select Expense Type') {
      setExpenseType(expenseTypes[0].name);
    }
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
  // HSN/SAC code — only collected when GSTIN = Yes, shown right after Region. Goes to SAP as
  // HsnSac (Edm.String, max length 16). Optional: left blank it simply submits as ''.
  const [hsnSac, setHsnSac] = useState('');
  const [availableAreas, setAvailableAreas] = useState<any[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any | null>(null);
  const [areaModalVisible, setAreaModalVisible] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [justification, setJustification] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const normalizedGstin = gstinInput.replace(/\s+/g, '').toUpperCase();
  const filteredAreas = availableAreas.filter(area =>
    `${area.Bland || ''} ${area.Bezei || ''}`.toLowerCase().includes(areaSearch.toLowerCase())
  );
  const [amountError, setAmountError] = useState('');
  const [formError, setFormError] = useState('');

  const resetForm = useCallback(() => {
    const defaultExpenseType = expenseTypes.length > 0 ? expenseTypes[0].name : 'Select Expense Type';
    setClaimDate(new Date().toISOString().split('T')[0]);
    setClaimDateObj(new Date());
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
    setShowDatePicker(false);
    setJustification('');
    setAttachments([]);
    setPreviewAttachment(null);
    setPreviewModalVisible(false);
    setAmountError('');
    setFormError('');
    setFormError('');
    setDuplicateWarnModal(false);
    setPendingDraftFlag(false);
    setExistingClaimId('');
    setPendingDraftFlag(false);
    setExistingClaimId('');
  }, [currentUser, expenseTypes]);

  // Success Modal State
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Selection Modal state for custom picker on mobile
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  // Document Preview Modal State
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  const handlePreviewAttachment = (att: Attachment) => {
    setPreviewAttachment(att);
    setPreviewModalVisible(true);
  };

  // Duplicate Warning State
  const [duplicateWarnModal, setDuplicateWarnModal] = useState(false);
  const [pendingDraftFlag, setPendingDraftFlag] = useState(false);
  const [existingClaimId, setExistingClaimId] = useState('');

  // RESUBMIT_FEATURE: Function to convert SAP claim data to form values
  const mapSAPClaimToFormData = (sapClaim: any) => {
    if (!sapClaim) return null;
    
    const header = sapClaim;
    const lineItems = sapClaim.CLAIMNAV?.results || sapClaim.CLAIMNAV || [];
    
    // Extract data from header
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

    // Extract data from first line item
    let expenseType = '';
    let expenseDateStr = '';
    let justification = '';
    let itemNoStr = '000001';
    
    if (lineItems.length > 0) {
      const firstLine = lineItems[0];
      expenseType = header.ZglName || firstLine.ZglName || firstLine.ExpenseType || header.ExpenseType || '';
      justification = firstLine.Description || '';
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

    // Map attachments
    const attachmentList: Attachment[] = [];
    if (lineItems.length > 0) {
      lineItems.forEach((item: any, index: number) => {
        if (item.Filename && item.Value) {
          const mimetype = item.Mimetype || 'application/pdf';
          // SAP stores Filename with no extension at all (e.g. "90000367_0000000011_000001") —
          // handleSubmit's attachment-type check derives the extension from the name, so on
          // resubmit it fails even a perfectly valid attachment since there's no "." to split on.
          // Appending the right extension here (same mapping ALLOWED_ATTACHMENT_MIME_TYPES
          // covers) fixes that without touching the shared validation logic itself.
          const name = item.Filename.includes('.')
            ? item.Filename
            : `${item.Filename}.${MIME_TO_EXTENSION[mimetype] || 'pdf'}`;
          attachmentList.push({
            id: `att-${index}-${Date.now()}-${item.Filename.replace(/[^a-zA-Z0-9]/g, '')}`,
            name,
            uri: `data:${mimetype};base64,${item.Value}`,
            type: mimetype
          });
        }
      });
    }

    return {
      claimDate: claimDateStr,
      expenseDate: expenseDateStr,
      expenseType,
      justification,
      itemNo: itemNoStr,
      amount: parseFloat(header.TotalAmount || 0),
      costCenter: header.CostCenter || COST_CENTERS[0],
      attachments: attachmentList
    };
  };

  useFocusEffect(
    useCallback(() => {
      if (!editingClaimId && !tempClaimForResubmit) {
        resetForm();
      }
    }, [editingClaimId, tempClaimForResubmit, resetForm])
  );

  useEffect(() => {
    // RESUBMIT_FEATURE: Check tempClaimForResubmit first (for resubmit workflow)
    if (tempClaimForResubmit) {
      console.log('[CREATE] tempClaimForResubmit found:', tempClaimForResubmit);
      const formData = mapSAPClaimToFormData(tempClaimForResubmit);
      console.log('[CREATE] Mapped formData:', formData);
      if (formData) {
        setExistingClaimId(tempClaimForResubmit.ClaimId);
        const resolvedDate = formData.claimDate || new Date().toISOString().split('T')[0];
        setClaimDate(resolvedDate);
        try {
          setClaimDateObj(resolvedDate ? new Date(resolvedDate) : new Date());
        } catch (e) {
          setClaimDateObj(new Date());
        }
        setExpenseDate(formData.expenseDate || '');
        setExpenseType(formData.expenseType || expenseTypes[0]?.name || 'Select Expense Type');
        setItemNo(formData.itemNo);
        setAmountStr(String(formData.amount || 0));
        setCostCenter(formData.costCenter);
        setJustification(formData.justification);
        setAttachments(formData.attachments);
        console.log('[CREATE] Form populated from tempClaimForResubmit');
        // Don't clear temp claim yet - let it persist for this session
      }
      return;
    }

    // Fallback: Check context claims (existing logic)
    if (!editingClaimId) return;
    console.log('[CREATE] Fallback: checking getClaimById for:', editingClaimId);
    const claim = getClaimById(editingClaimId);
    if (!claim) {
      console.log('[CREATE] Fallback: claim not found in context');
      return;
    }

    setExistingClaimId(claim.id);
    setClaimDate(claim.claimDate);
    try {
      setClaimDateObj(claim.claimDate ? new Date(claim.claimDate) : new Date());
    } catch (e) {
      setClaimDateObj(new Date());
    }
    setExpenseDate(claim.expenseDate || '');
    setExpenseType(claim.expenseType);
    setItemNo(claim.itemNo || '000001');
    setAmountStr(String(claim.amount));
    setCostCenter(claim.costCenter);
    setJustification(claim.justification);
    setAttachments(claim.attachments || []);
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
        // Basis has opened GstSet for direct anonymous GET access, same exception already
        // granted for MoldHealthCheck's SAP service — so this calls SAP directly instead of
        // going through our own backend, which stays reserved for login/OTP/claim submission.
        const filter = encodeURIComponent(`Stcd3 eq '${normalizedGstin}'`);
        const res = await fetch(`${SAP_BASE_URL}/GstSet?$format=json&$filter=${filter}`);
        if (!res.ok) {
          setGstLookupError('Unable to lookup GSTIN at this time.');
          return;
        }

        const payload = await res.json();
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
  const exceedsPolicyLimit = parsedAmount > policyLimit;
  const isAutoApprove = parsedAmount > 0 && parsedAmount < autoApprovalThreshold;

  useEffect(() => {
    if (parsedAmount > 20000) {
      setAmountError('Amount cannot exceed ₹20,000');
    } else {
      setAmountError('');
    }
  }, [parsedAmount]);

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

  const handlePickAttachment = async () => {
    try {
      setFormError('');
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: '*/*' });
      if (!result.canceled) {
        const asset = (result as any).assets?.[0] ?? result;
        if (asset && asset.uri) {
          const attachmentMimeType = getMimeTypeForFile(asset.name, asset.mimeType || asset.type);
          if (!isAttachmentAllowed(asset.name, attachmentMimeType)) {
            setFormError(`Unsupported attachment type. Allowed file types: ${ALLOWED_ATTACHMENT_LABEL}.`);
            return;
          }

          // Images can be safely re-encoded smaller, and a PDF can be re-rasterized smaller
          // (see pdfAttachment.ts, ported from payment-tracking's own working fix for this same
          // gateway limit) — XLS/XLSX/CSV/TXT can't be shrunk either way and are left exactly as
          // picked.
          let finalUri = asset.uri;
          let finalSize = asset.size || 0;
          let finalType = attachmentMimeType;
          if (attachmentMimeType.startsWith('image/')) {
            const compressed = await compressAttachmentImage(asset.uri, asset.width);
            if (compressed) {
              finalUri = compressed.uri;
              finalSize = compressed.size;
              // Compression always re-encodes as JPEG (see compressAttachmentImage's
              // SaveFormat.JPEG) — the stored Mimetype must say so too, or claim/[id].tsx's
              // preview/download (which trusts this field, not the actual bytes) ends up
              // labelling real JPEG data as the original PNG/etc.
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
          setAttachments(prev => [...prev, newAtt]);
        }
      }
    } catch (err) {
      setFormError('Unable to add attachment. Please try again with a supported file.');
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
    setFormError('');
  };

  const handleSubmit = async (isDraft: boolean, ignoreDuplicateWarn = false) => {
    // Validate maximum allowed amount
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
    const claimData = {
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

    console.log('[CREATE] Submitting claim:', claimData);
    const result = await addClaim(claimData, isDraft, ignoreDuplicateWarn, existingClaimId);
    console.log('[CREATE] addClaim result:', result);

    if (!result.success) {
      console.log('[CREATE] Submission failed:', result.warning);
      if (result.warning?.startsWith('DUPLICATE_DETECTED')) {
        setPendingDraftFlag(isDraft);
        setDuplicateWarnModal(true);
        return;
      } else {
        setFormError(result.warning || 'Unable to submit claim. Please review the form and try again.');
        return;
      }
    }

    // Success
    console.log('[CREATE] Submission successful, showing alert');
    setSuccessMessage(
      isDraft
        ? 'Your expense claim has been saved as a draft.'
        : `Your claim has been successfully submitted.${isAutoApprove ? ' Amount is below threshold (₹100), claim has been auto-approved!' : ''}`
    );
    setSuccessModalVisible(true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Create Expense Claim</Text>

      {formError ? (
        <View style={styles.formErrorBanner}>
          <Ionicons name="alert-circle" size={20} color="#DC2626" />
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      {/* Auto-populated Employee Info */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionHeading}>Employee Information</Text>
        <View style={styles.infoRow}>       
          <Text style={styles.infoLabel}>Employee ID</Text>
          <Text style={styles.infoValue}>{currentUser.employeeId}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Name</Text>
          <Text style={styles.infoValue}>{currentUser.name || currentUser.employeeName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Department</Text>
          <Text style={styles.infoValue}>{currentUser.department || (currentUser as any).Department}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Designation</Text>
          <Text style={styles.infoValue}>{currentUser.designation || (currentUser as any).Designation}</Text>
        </View>
      </View>

      {/* Claim Details Form */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionHeading}>Claim Details</Text>

        {recentExpenseTypeNames.length > 0 && (
          <View style={styles.recentTypesCard}>
            <Text style={styles.recentTypesTitle}>Recent Expense Types</Text>
            <Text style={styles.recentTypesSubtitle}>Tap a type to fill the field instantly</Text>
            <View style={styles.recentTypesRow}>
              {recentExpenseTypeNames.map((name, index) => (
                <TouchableOpacity
                  key={`${name}-${index}`}
                  style={[
                    styles.recentTypeChip,
                    expenseType === name && styles.recentTypeChipActive,
                  ]}
                  onPress={() => {
                    setExpenseType(name);
                    setTypeModalVisible(false);
                  }}
                >
                  <Text
                    style={[
                      styles.recentTypeChipText,
                      expenseType === name && styles.recentTypeChipTextActive,
                    ]}
                  >
                    {name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={isWideScreen && styles.fieldRow}>
        <View style={isWideScreen && styles.fieldCol}>
        <Text style={styles.inputLabel}>Claim Date *</Text>
        {Platform.OS === 'web' ? (
          // Use native HTML date input on web for consistent behavior
          <input
            type="date"
            value={claimDate}
            onChange={(e: any) => {
              const v = e.target.value;
              setClaimDate(v);
              try {
                setClaimDateObj(v ? new Date(v) : new Date());
              } catch (er) {
                setClaimDateObj(new Date());
              }
            }}
            style={{
              width: '100%',
              height: 44,
              minHeight: 44,
              padding: '10px 12px',
              borderRadius: 8,
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#E6EEF8',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: 16,
              boxSizing: 'border-box'
            }}
          />
        ) : (
          <>
            <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.selectorBtnText}>{claimDate}</Text>
              <Ionicons name="calendar" size={18} color="#64748B" />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={claimDateObj}
                mode="date"
                display={Platform.OS === 'android' ? 'spinner' : 'default'}
                maximumDate={new Date(2100, 0, 1)}
                onChange={(event: any, selected?: Date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selected) {
                    setClaimDateObj(selected);
                    try {
                      setClaimDate(selected.toISOString().split('T')[0]);
                    } catch (e) {
                      setClaimDate(new Date().toISOString().split('T')[0]);
                    }
                  }
                }}
              />
            )}
          </>
        )}
        </View>

        <View style={isWideScreen && styles.fieldCol}>
        <Text style={styles.inputLabel}>Expense Type *</Text>
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setTypeModalVisible(true)}>
          <Text style={styles.selectorBtnText}>{expenseType}</Text>
          <Ionicons name="chevron-down" size={20} color="#64748B" />
        </TouchableOpacity>
        </View>
        </View>

        <Text style={styles.inputLabel}>GSTIN Available * (Select Yes in Case of Gst)</Text>
        <View style={styles.choiceRow}>
          <TouchableOpacity
            style={[styles.choiceBtn, gstinChoice === 'yes' && styles.choiceBtnActive]}
            onPress={async () => {
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
            }}
          >
            <Text style={[styles.choiceBtnText, gstinChoice === 'yes' && styles.choiceBtnTextActive]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.choiceBtn, gstinChoice === 'no' && styles.choiceBtnActive]}
            onPress={() => {
              setGstinChoice('no');
              setGstinInput('');
              setSelectedGst(null);
              setGstLookupError('');
              setSelectedArea(null);
              setHsnSac('');
              setAvailableAreas([]);
            }}
          >
            <Text style={[styles.choiceBtnText, gstinChoice === 'no' && styles.choiceBtnTextActive]}>No</Text>
          </TouchableOpacity>
        </View>

        {gstinChoice === 'yes' && (
          <>
            <View style={isWideScreen && styles.fieldRow}>
            <View style={isWideScreen && styles.fieldCol}>
            <Text style={styles.inputLabel}>GSTIN * (For your given Gst System will Determine the Vendor code)</Text>
            <TextInput
              style={styles.textInput}
              value={gstinInput}
              onChangeText={(text) => {
                const normalized = text.replace(/\s+/g, '').toUpperCase();
                setGstinInput(normalized);
                setGstLookupError('');
                if (normalized.length !== 15) {
                  setSelectedGst(null);
                }
              }}
              placeholder="Enter 15-digit GSTIN"
              placeholderTextColor="#94A3B8"
              keyboardType={Platform.OS === 'web' ? 'default' : 'ascii-capable'}
              autoCapitalize="characters"
              maxLength={15}
            />
            {gstLookupLoading && <Text style={styles.subtext}>Looking up GST details…</Text>}
            {gstLookupError ? <Text style={[styles.subtext, { color: '#DC2626' }]}>{gstLookupError}</Text> : null}
            {selectedGst ? (
              <View style={[styles.selectorBtn, { marginTop: 8, borderColor: '#10B981', backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.selectorBtnText, { color: '#065F46' }]}>{selectedGst.display}</Text>
              </View>
            ) : null}
            </View>

            <View style={isWideScreen && styles.fieldCol}>
            <Text style={styles.inputLabel}>Region *</Text>
            <TouchableOpacity style={styles.selectorBtn} onPress={() => setAreaModalVisible(true)}>
              <Text style={styles.selectorBtnText}>
                {selectedArea ? `${selectedArea.Bland}${selectedArea.Bezei ? ` (${selectedArea.Bezei})` : ''}` : 'Select Region...'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#64748B" />
            </TouchableOpacity>
            {areasLoading && <Text style={styles.subtext}>Loading regions…</Text>}
            </View>
            </View>

            <View style={isWideScreen && styles.fieldRow}>
            <View style={isWideScreen && styles.fieldCol}>
            <Text style={styles.inputLabel}>HSN Code</Text>
            <TextInput
              style={styles.textInput}
              value={hsnSac}
              onChangeText={(text) => setHsnSac(text.replace(/\s+/g, '').toUpperCase())}
              placeholder="Enter HSN/SAC code"
              placeholderTextColor="#94A3B8"
              autoCapitalize="characters"
              maxLength={16}
            />
            </View>
            {/* Empty second column so HSN keeps the same half-width as the fields above it
                instead of stretching across the form. */}
            {isWideScreen ? <View style={styles.fieldCol} /> : null}
            </View>
          </>
        )}

        <View style={isWideScreen && styles.fieldRow}>
        {/* Amount keeps its own error banner and the auto-approve notice inside its column, since
            both describe the amount that was just typed. */}
        <View style={isWideScreen && styles.fieldCol}>
        <Text style={styles.inputLabel}>Amount (₹) *</Text>
        <TextInput
          style={styles.textInput}
          value={amountStr}
          onChangeText={setAmountStr}
          placeholder="0.00"
          keyboardType="numeric"
        />

        {amountError ? (
          <View style={styles.amountErrorBanner}>
            <Ionicons name="alert-circle" size={20} color="#DC2626" />
            <Text style={styles.amountErrorText}>{amountError}</Text>
          </View>
        ) : null}

        {/* Policy warning removed per request; 20,000 validation remains */}

        {/* BR-006: Auto Approval Threshold Info Indicator */}
        {isAutoApprove && (
          <View style={styles.autoApproveBanner}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#047857" />
            <Text style={styles.autoApproveText}>
              Claim is under ₹100 threshold. Will be automatically approved upon submission!
            </Text>
          </View>
        )}
        </View>

        <View style={isWideScreen && styles.fieldCol}>
        <Text style={styles.inputLabel}>Cost Center *</Text>
        <TextInput
          style={[styles.textInput, styles.textInputReadonly]}
          value={costCenter}
          onChangeText={setCostCenter}
          placeholder="Cost Center"
          editable={false}
        />
        </View>
        </View>

        <Text style={styles.inputLabel}>Business Justification</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={justification}
          onChangeText={setJustification}
          placeholder="State the business purpose for this expense..."
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Attachments Section (BR-003) */}
      <View style={styles.cardSection}>
        <View style={styles.attachmentHeader}>
          <Text style={styles.sectionHeading}>Supporting Documents *</Text>
          <Text style={styles.subtext}>At least 1 attachment is mandatory</Text>
          <Text style={styles.subtext}>Allowed: {ALLOWED_ATTACHMENT_LABEL}</Text>
          <Text style={styles.subtext}>Total size limit: {MAX_ATTACHMENTS_TOTAL_LABEL}</Text>
        </View>

        {attachments.map(att => (
          <View key={att.id} style={styles.attachmentItem}>
            <Ionicons name="document-text" size={22} color="#005A9E" />
            <Text style={styles.attachmentName} numberOfLines={1}>{att.name}</Text>
            <View style={styles.attachmentActionsRow}>
              <TouchableOpacity
                style={styles.attachmentActionBtn}
                onPress={() => handlePreviewAttachment(att)}
                accessibilityLabel="View document"
              >
                <Ionicons name="eye-outline" size={20} color="#005A9E" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.attachmentActionBtn}
                onPress={() => handleRemoveAttachment(att.id)}
                accessibilityLabel="Remove document"
              >
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.uploadBtn} onPress={handlePickAttachment}>
          <Ionicons name="cloud-upload-outline" size={20} color="#005A9E" />
          <Text style={styles.uploadBtnText}>Add Attachment / Scanned Receipt</Text>
        </TouchableOpacity>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.draftBtn} onPress={() => {
          resetForm();
          router.back();
        }}>
          <Ionicons name="close-outline" size={20} color="#005A9E" />
          <Text style={styles.draftBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.submitBtn} onPress={() => handleSubmit(false)}>
          <Ionicons name="send" size={20} color="#FFFFFF" />
          <Text style={styles.submitBtnText}>Submit Claim</Text>
        </TouchableOpacity>
      </View>

      {/* Expense Type Select Modal */}
      <Modal visible={typeModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayBackground} onPress={() => setTypeModalVisible(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Select Expense Type</Text>
            <TextInput
              style={[styles.textInput, { marginBottom: 12 }]}
              value={typeSearch}
              onChangeText={setTypeSearch}
              placeholder="Search expense types"
              placeholderTextColor="#94A3B8"
            />
            <ScrollView style={styles.modalOptionList} nestedScrollEnabled>
              {filteredExpenseTypes.length === 0 ? (
                <View style={styles.modalOption}>
                  <Text style={styles.modalOptionText}>No matching expense types</Text>
                </View>
              ) : (
                filteredExpenseTypes.map((type, index) => (
                  <TouchableOpacity
                    key={`${type.id}-${index}`}
                    style={styles.modalOption}
                    onPress={() => {
                      setExpenseType(type.name);
                      setTypeModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalOptionText}>{type.name}</Text>
                    {expenseType === type.name && <Ionicons name="checkmark" size={20} color="#005A9E" />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Region Select Modal */}
      <Modal visible={areaModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayBackground} onPress={() => setAreaModalVisible(false)} />
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Select Region</Text>
            <TextInput
              style={[styles.textInput, { marginBottom: 12 }]}
              value={areaSearch}
              onChangeText={setAreaSearch}
              placeholder="Search regions"
              placeholderTextColor="#94A3B8"
            />
            <ScrollView style={styles.modalOptionList} nestedScrollEnabled>
              {filteredAreas.length === 0 ? (
                <View style={styles.modalOption}>
                  <Text style={styles.modalOptionText}>No matching regions</Text>
                </View>
              ) : (
                filteredAreas.map((area, index) => (
                  <TouchableOpacity
                    key={`${area.Bland}-${index}`}
                    style={styles.modalOption}
                    onPress={() => {
                      setSelectedArea(area);
                      setAreaModalVisible(false);
                    }}
                  >
                    <Text style={styles.modalOptionText}>{area.Bland}{area.Bezei ? ` (${area.Bezei})` : ''}</Text>
                    {selectedArea?.Bland === area.Bland && <Ionicons name="checkmark" size={20} color="#005A9E" />}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Duplicate Claim Warning Modal (BR-005) */}
      <Modal visible={duplicateWarnModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.duplicateModalBox}>
            <View style={styles.duplicateModalIcon}>
              <Ionicons name="alert-circle" size={48} color="#DC2626" />
            </View>
            <Text style={styles.duplicateModalTitle}>Potential Duplicate Detected</Text>
            <Text style={styles.duplicateModalDesc}>
              A claim with the exact same Employee ID ({currentUser.employeeId}), Claim Date ({claimDate}), and Amount (₹{formatCurrency(parsedAmount)}) already exists in the system.
            </Text>
            <Text style={styles.duplicateModalQuestion}>Do you wish to proceed and create this claim anyway?</Text>

            <View style={styles.duplicateModalActions}>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setDuplicateWarnModal(false)}>
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.proceedModalBtn}
                onPress={() => {
                  setDuplicateWarnModal(false);
                  handleSubmit(pendingDraftFlag, true);
                }}
              >
                <Text style={styles.proceedModalBtnText}>Continue Submission</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.successModalBox}>
            <View style={styles.successModalIcon}>
              <Ionicons name="checkmark-circle" size={60} color="#10B981" />
            </View>
            <Text style={styles.successModalTitle}>
              {successMessage.includes('draft') ? 'Draft Saved' : 'Claim Submitted'}
            </Text>
            <Text style={styles.successModalDesc}>{successMessage}</Text>

            <TouchableOpacity
              style={styles.successModalBtn}
              onPress={() => {
                console.log('[CREATE] Success modal dismissed, redirecting to dashboard');
                setSuccessModalVisible(false);
                // Reset form and navigate
                resetForm();
                router.replace('/apps/expense/');
              }}
            >
              <Text style={styles.successModalBtnText}>Go to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Document Preview Modal */}
      <Modal visible={previewModalVisible} transparent animationType="fade" onRequestClose={() => setPreviewModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayBackground} onPress={() => setPreviewModalVisible(false)} />
          <View style={styles.previewModalBox}>
            <View style={styles.previewModalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.previewModalTitle} numberOfLines={1}>
                  {previewAttachment?.name || 'Document Preview'}
                </Text>
                {previewAttachment?.type ? (
                  <Text style={styles.subtext}>{previewAttachment.type}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.previewCloseBtn}
                onPress={() => setPreviewModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.previewContentContainer}>
              {previewAttachment && (
                (previewAttachment.type?.startsWith('image/') ||
                ['png', 'jpg', 'jpeg'].includes((previewAttachment.name.split('.').pop() || '').toLowerCase())) ? (
                  <Image
                    source={{ uri: previewAttachment.uri }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : Platform.OS === 'web' ? (
                  <iframe
                    src={previewAttachment.uri}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }}
                    title={previewAttachment.name}
                  />
                ) : (
                  <View style={styles.previewFallbackBox}>
                    <Ionicons name="document-text-outline" size={64} color="#005A9E" />
                    <Text style={styles.previewFallbackName}>{previewAttachment.name}</Text>
                    <Text style={styles.subtext}>Document preview ready</Text>
                  </View>
                )
              )}
            </View>

            <View style={styles.previewModalFooter}>
              {Platform.OS === 'web' && previewAttachment?.uri ? (
                <TouchableOpacity
                  style={styles.openExternalBtn}
                  onPress={() => {
                    if (previewAttachment?.uri) {
                      window.open(previewAttachment.uri, '_blank');
                    }
                  }}
                >
                  <Ionicons name="open-outline" size={18} color="#005A9E" />
                  <Text style={styles.openExternalBtnText}>Open in New Tab</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.closeModalFooterBtn}
                onPress={() => setPreviewModalVisible(false)}
              >
                <Text style={styles.closeModalFooterBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    // A form field stretched across a full desktop window is unusable — the eye has to travel the
    // whole width for every input. Cap and centre the form, same approach login.tsx already uses
    // for its card (maxWidth 620). Below this width the cap does nothing, so phones/tablets are
    // completely unaffected.
    //
    // 1280 is shared by the Dashboard ((tabs)/index.tsx) and My Claims ((tabs)/my-claims.tsx) so
    // all three pages line up when switching tabs. Keep the three in sync if this is ever changed.
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
  },
  // Two-column form pairing, desktop only. Both styles are applied conditionally via
  // `isWideScreen && …`, so on narrower screens the wrappers carry no style at all and every
  // field stacks exactly as it always has.
  fieldRow: {
    flexDirection: 'row',
    gap: 18,
    alignItems: 'flex-start',
  },
  fieldCol: {
    flex: 1,
    minWidth: 0,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },
  cardSection: {
    backgroundColor: '#EFF8FF',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D1E9FF',
    borderLeftWidth: 6,
    borderLeftColor: '#005A9E',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  recentTypesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#D1E9FF',
  },
  recentTypesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  recentTypesSubtitle: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 10,
  },
  recentTypesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentTypeChip: {
    backgroundColor: '#E0F2FE',
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 8,
  },
  recentTypeChipActive: {
    backgroundColor: '#0EA5E9',
    borderColor: '#0284C7',
  },
  recentTypeChipText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  recentTypeChipTextActive: {
    color: '#FFFFFF',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  infoLabel: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'left',
  },
  formErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  formErrorText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '700',
    marginLeft: 8,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1E293B',
  },
  textInputReadonly: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E6EEF6',
    color: '#0F172A',
    opacity: 1,
  },
  textArea: {
    textAlignVertical: 'top',
    height: 80,
  },
  selectorBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorBtnText: {
    fontSize: 14,
    color: '#1E293B',
    fontWeight: '600',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  choiceBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  choiceBtnActive: {
    borderColor: '#005A9E',
    backgroundColor: '#E6F2FF',
  },
  choiceBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  choiceBtnTextActive: {
    color: '#005A9E',
  },
  amountErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  amountErrorText: {
    fontSize: 13,
    color: '#7F1D1D',
    fontWeight: '700',
    marginLeft: 8,
  },
  autoApproveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  autoApproveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
    marginLeft: 10,
    flex: 1,
  },
  attachmentHeader: {
    marginBottom: 10,
  },
  subtext: {
    fontSize: 12,
    color: '#64748B',
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  attachmentName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },
  uploadBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#005A9E',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  uploadBtnText: {
    color: '#005A9E',
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  draftBtn: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#005A9E',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  draftBtnText: {
    color: '#005A9E',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  submitBtn: {
    flex: 1,
    backgroundColor: '#005A9E',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  modalBox: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
  },
  modalBoxTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
  },
  modalOptionList: {
    maxHeight: 320,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalOptionText: {
    fontSize: 15,
    color: '#334155',
  },
  duplicateModalBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  duplicateModalIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  duplicateModalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    textAlign: 'center',
  },
  duplicateModalDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  duplicateModalQuestion: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 24,
  },
  duplicateModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelModalBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelModalBtnText: {
    fontWeight: '600',
    color: '#475569',
    fontSize: 14,
  },
  proceedModalBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedModalBtnText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 14,
  },
  successModalBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  successModalIcon: {
    marginBottom: 16,
  },
  successModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 12,
    textAlign: 'center',
  },
  successModalDesc: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  successModalBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  successModalBtnText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 14,
  },
  attachmentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attachmentActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewModalBox: {
    width: '92%',
    maxWidth: 720,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'column',
  },
  previewModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  previewCloseBtn: {
    padding: 4,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  previewContentContainer: {
    height: 380,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewFallbackBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewFallbackName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  previewModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#005A9E',
    backgroundColor: '#EFF6FF',
  },
  openExternalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#005A9E',
    marginLeft: 6,
  },
  closeModalFooterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#005A9E',
  },
  closeModalFooterBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
