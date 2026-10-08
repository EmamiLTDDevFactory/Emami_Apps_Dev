'use client';

import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SAP_BASE_URL } from '../config/api';
import { AreaCode, Attachment, ClaimKPIs, ClaimStatus, ExpenseClaim, SAPError, TaxCode } from '../types';
import { getClaimCreatedTimestamp } from '../utils/claim-date';
import { useAuth } from './AuthContext';

interface ClaimContextType {
  claims: ExpenseClaim[];
  errors: SAPError[];
  historyEntries: any[];
  kpis: ClaimKPIs;
  autoApprovalThreshold: number;
  policyLimit: number;
  // Claim Actions
  addClaim: (claimData: Omit<ExpenseClaim, 'id' | 'status' | 'workflowHistory'>, isDraft: boolean, ignoreDuplicateWarn?: boolean, existingClaimId?: string) => Promise<{ success: boolean; warning?: string; claimId?: string }>;
  updateDraft: (id: string, claimData: Partial<ExpenseClaim>, isDraft: boolean) => { success: boolean; warning?: string };
  deleteClaim: (id: string) => void;
  // Manager Actions
  approveClaim: (id: string) => Promise<{ success: boolean; error?: string }>;
  rejectClaim: (id: string, remarks: string) => Promise<{ success: boolean; error?: string }>;
  requestClarification: (id: string, remarks: string) => void;
  // Finance Actions
  validateClaimFinance: (id: string) => void;
  releasePayment: (id: string, taxCode?: string, taxDescription?: string) => Promise<{ success: boolean; error?: string }>;
  fetchTaxes: (claimId: string) => Promise<TaxCode[]>;
  calculateTax: (totalAmount: number, currency: string, mwskz: string) => Promise<{ expenseAmt: number; taxAmt: number } | null>;
  fetchAreas: () => Promise<AreaCode[]>;
  rejectClaimFinance: (id: string, remarks: string) => Promise<{ success: boolean; error?: string }>;
  // Error Management Actions
  retrySAPPosting: (errorId: string) => void;
  // Getters & Filters
  getClaimById: (id: string) => ExpenseClaim | undefined;
  filterClaims: (roleFilter?: 'employee' | 'manager' | 'finance', search?: string, expenseType?: string, status?: string) => ExpenseClaim[];
  fetchClaims: () => Promise<void>;
  fetchHistorySet: () => Promise<void>;
  // Claim detail lookups for history-trail cards (Approvals/Finance's Approved/Rejected/Total
  // view) — HistorySet itself never carries expense type/amount, and `claims` only holds claims
  // currently assigned to this user (ClaimHeaderSet's LoginId is cleared once a claim moves past
  // them), so already-processed claims silently vanish from it. This fetches/caches each claim's
  // own ClaimHeaderSet record instead — the same call the claim detail page already relies on.
  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 5 (Approvals).
  claimSummaryCache: Record<string, { amount: number; expenseType: string; employeeName: string }>;
  fetchClaimSummaries: (claimIds: string[]) => Promise<void>;
  expenseTypes: any[];
  fetchExpenseTypes: () => Promise<void>;
  // RESUBMIT_FEATURE: Temporary storage for resubmit workflow
  tempClaimForResubmit: any | null;
  setTempClaimForResubmit: (claim: any | null) => void;
}

const INITIAL_CLAIMS: ExpenseClaim[] = [];

// Backs the debug-only SAP error queue screen (errors page) — local/simulated, not real-SAP
// connected. NOT YET VERIFIED — slice 7 (hardening).
const INITIAL_ERRORS: SAPError[] = [
  {
    id: 'ERR-501',
    claimId: 'CLM-1005',
    errorType: 'SAP Posting Failure',
    errorMessage: 'Account assignment 650090 blocked for direct posting.',
    rootCause: 'Cost Center CC-ENG-GLOBAL is locked for the current fiscal period in FI module.',
    status: 'Failed',
    resolutionHistory: [
      { timestamp: '2026-06-23 09:16', resolvedBy: 'System AI Diagnostic', notes: 'Initial posting attempt failed during background sync.' },
    ],
  },
  {
    id: 'ERR-502',
    claimId: 'CLM-1001',
    errorType: 'RFC Gateway Timeout',
    errorMessage: 'Destination SAP_ERP_FIN unreachable.',
    rootCause: 'Temporary network disruption between SAP Cloud Connector and on-premise gateway.',
    status: 'Resolved',
    resolutionHistory: [
      { timestamp: '2026-06-16 10:21', resolvedBy: 'System AI Diagnostic', notes: 'Timeout detected.' },
      { timestamp: '2026-06-16 11:45', resolvedBy: 'Alex Wong (Admin)', notes: 'Manually re-triggered SAP RFC queue. Posting completed successfully.' },
    ],
  },
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

// SAP's stored Filename never includes an extension — used only to reconstruct one when mapping
// a claim's attachments back from SAP (below), so create.tsx's submit-time extension check has
// something valid to find instead of treating the whole extension-less name as one.
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'xls', 'xlsx', 'csv', 'txt']);

// Reads a picked attachment (blob: or file: uri) into a plain base64 string, so it can travel
// as JSON text instead of a raw binary multipart upload.
const readAttachmentAsBase64 = (uri: string): Promise<string> => {
  return fetch(uri)
    .then((res) => res.blob())
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = (reader.result as string) || '';
        resolve(result.includes(',') ? result.split(',')[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
};

const parseCostCenter = (ccStr?: string) => {
  if (!ccStr) return { costCenter: '', ltext: '' };
  const match = ccStr.match(/^([^\(]+)(?:\((.*)\))?$/);
  if (match) {
    const costCenter = (match[1] || '').trim();
    const ltext = (match[2] || '').trim();
    return { costCenter, ltext };
  }
  return { costCenter: ccStr.trim(), ltext: '' };
};

// axios never throws on HTTP-level errors (validateStatus always true) so every call site can
// inspect response.status/data manually, exactly like the original fetch-based code did — this
// is a deliberate choice to NOT change behavior (no auto-throw, no auto-retry) during the
// fetch->axios port the monorepo convention calls for.
const sapClient = axios.create({ validateStatus: () => true });

const ClaimContext = createContext<ClaimContextType | undefined>(undefined);

export const ClaimProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [claims, setClaims] = useState<ExpenseClaim[]>(INITIAL_CLAIMS);
  const [errors, setErrors] = useState<SAPError[]>(INITIAL_ERRORS);
  const [historyEntries, setHistoryEntries] = useState<any[]>([]);
  const [claimSummaryCache, setClaimSummaryCache] = useState<Record<string, { amount: number; expenseType: string; employeeName: string }>>({});
  const [expenseTypes, setExpenseTypes] = useState<any[]>([]);
  // RESUBMIT_FEATURE: State to hold claim data for resubmit workflow
  const [tempClaimForResubmit, setTempClaimForResubmit] = useState<any | null>(null);
  const { currentUser } = useAuth();

  const autoApprovalThreshold = 100.0;
  const policyLimit = 1000.0;

  const handleSetTempClaimForResubmit = (claim: any | null) => {
    setTempClaimForResubmit(claim);
  };

  const fetchExpenseTypes = async () => {
    try {
      // ExptypeSet is open for direct anonymous GET (confirmed with Basis).
      const loginIdForSAP = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
      const filter = loginIdForSAP ? `&$filter=${encodeURIComponent(`LoginId eq '${loginIdForSAP}'`)}` : '';
      const url = `${SAP_BASE_URL}/ExptypeSet?$format=json${filter}`;
      const response = await sapClient.get(url);
      if (response.status < 200 || response.status >= 300) return;

      const data = response.data;
      const sapTypes = data.d?.results || data.value || [];

      if (sapTypes.length > 0) {
        const mappedTypes = sapTypes.map((item: any) => ({
          id: item.ZslNo || item.ExpenseType || '00001',
          name: item.ZglName || item.Description || item.Exptype || 'Unknown Type',
          saknr: item.Saknr || '',
        }));
        setExpenseTypes(mappedTypes);
      }
    } catch (err) {
      console.error('Failed to fetch SAP expense types:', err);
    }
  };

  const fetchClaims = async () => {
    try {
      // Don't fetch until the user is actually loaded from AuthContext
      if (!currentUser?.employeeId) return;

      // Extract numeric PERNR from currentUser
      // ClaimHeaderSet is open for direct anonymous GET (confirmed with Basis).
      const loginIdForSAP = currentUser.employeeId.replace(/\D/g, '').padStart(8, '0');
      const filter = encodeURIComponent(`LoginId eq '${loginIdForSAP}'`);
      const response = await sapClient.get(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
      if (response.status < 200 || response.status >= 300) return;

      const data = response.data;

      let sapClaims = [];
      if (data.d && data.d.results) {
        sapClaims = data.d.results; // GET_ENTITYSET format
      } else if (data.d) {
        sapClaims = [data.d]; // GET_ENTITY format
      } else if (data.value) {
        sapClaims = data.value; // OData V4 format
      } else if (data.EmpId) {
        sapClaims = [data]; // Flat object fallback
      } else if (Array.isArray(data)) {
        sapClaims = data; // Direct array fallback
      }

      const mappedClaims: ExpenseClaim[] = sapClaims.map((sap: any) => {
        let status: ClaimStatus = 'Submitted';
        if (sap.Status === 'D') status = 'Draft';
        if (sap.Status === 'A') status = 'Approved';
        if (sap.Status === 'R') status = 'Rejected';
        if (sap.Status === 'P' || sap.Status === 's' || sap.Status === 'S') status = 'Paid';

        let expenseType = '';
        let justification = '';
        let expenseDate = '';
        let itemNo = '';
        expenseType = sap.ZglName || sap.ExpenseType || '';
        if (sap.CLAIMNAV && sap.CLAIMNAV.results && sap.CLAIMNAV.results.length > 0) {
          const firstLine = sap.CLAIMNAV.results[0];
          expenseType = expenseType || firstLine.ZglName || firstLine.ExpenseType || '';
          if (!firstLine.ZglName && firstLine.ExpenseType) {
            const matchedType = expenseTypes.find((et) => et.id === firstLine.ExpenseType || et.name === firstLine.ExpenseType);
            if (matchedType) {
              expenseType = matchedType.name;
            }
          }
          justification = firstLine.Description || '';
          expenseDate = firstLine.ExpenseDate || '';
          itemNo = firstLine.ItemNo || '';
        } else if (sap.CLAIMNAV && sap.CLAIMNAV.length > 0) {
          const firstLine = sap.CLAIMNAV[0];
          expenseType = expenseType || firstLine.ZglName || firstLine.ExpenseType || '';
          if (!firstLine.ZglName && firstLine.ExpenseType) {
            const matchedType = expenseTypes.find((et) => et.id === firstLine.ExpenseType || et.name === firstLine.ExpenseType);
            if (matchedType) {
              expenseType = matchedType.name;
            }
          }
          justification = firstLine.Description || '';
          expenseDate = firstLine.ExpenseDate || '';
          itemNo = firstLine.ItemNo || '';
        }

        // Handle ClaimDate (use CreatedOn as fallback if ClaimDate is null)
        let claimDateStr = '';
        const dateToParse = sap.ClaimDate || sap.CreatedOn;
        if (dateToParse) {
          if (dateToParse.includes('Date(')) {
            const ts = parseInt(dateToParse.replace(/\D/g, ''), 10);
            claimDateStr = new Date(ts).toISOString().split('T')[0];
          } else {
            claimDateStr = dateToParse.split('T')[0];
          }
        }

        // Map attachments if Base64 data is present in the line items
        const attachments: Attachment[] = [];
        if (sap.CLAIMNAV && sap.CLAIMNAV.results) {
          sap.CLAIMNAV.results.forEach((item: any, attIdx: number) => {
            if (item.Filename && item.Value) {
              const mimetype = item.Mimetype || 'application/pdf';
              // SAP stores Filename with no extension at all — create.tsx's submit-time
              // attachment-type check derives the extension from the name, so editing/
              // resubmitting a claim loaded through this path would fail that check for
              // an otherwise perfectly valid attachment. See MIME_TO_EXTENSION above.
              const name = item.Filename.includes('.')
                ? item.Filename
                : `${item.Filename}.${MIME_TO_EXTENSION[mimetype] || 'pdf'}`;
              attachments.push({
                id: `att-${attIdx}-${item.Filename.replace(/[^a-zA-Z0-9]/g, '')}`,
                name,
                type: mimetype,
                uri: `data:${mimetype};base64,${item.Value}`,
              });
            }
          });
        }

        return {
          id: sap.ClaimId,
          employeeId: sap.EmpId,
          employeeName: sap.EmpName,
          department: sap.Department,
          designation: sap.Designation,
          claimDate: claimDateStr || new Date().toISOString().split('T')[0],
          createdOn: sap.CreatedOn || sap.ClaimDate || '',
          createdTime: sap.CreatedTime || '',
          expenseDate,
          expenseType,
          itemNo,
          amount: parseFloat(sap.TotalAmount) || 0,
          costCenter: sap.CostCenter,
          justification,
          attachments,
          currentApprover: sap.CurrentApprover || sap.currentApprover || '',
          status,
          rawStatus: sap.Status || '',
          stcd3: sap.Stcd3 || '',
          lifnr: sap.Lifnr || '',
          workflowHistory: [],
        };
      });
      // Replace the existing claims with the latest fetched set (clear when SAP returns empty)
      setClaims(mappedClaims);
    } catch (err) {
      console.error('Failed to fetch SAP claims:', err);
    }
  };

  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 5 (Approvals).
  const fetchHistorySet = useCallback(async () => {
    try {
      if (!currentUser?.employeeId) return;

      // HistorySet is open for direct anonymous GET (confirmed with Basis).
      const loginIdForSAP = currentUser.employeeId.replace(/\D/g, '').padStart(8, '0');
      const filter = encodeURIComponent(`ActionBy eq '${loginIdForSAP}'`);
      const response = await sapClient.get(`${SAP_BASE_URL}/HistorySet?$filter=${filter}&$format=json`);
      if (response.status < 200 || response.status >= 300) return;

      const data = response.data;
      const history = data.d?.results || data.value || data.d || [];
      setHistoryEntries(Array.isArray(history) ? history : history ? [history] : []);
    } catch (err) {
      console.error('Failed to fetch SAP history set:', err);
    }
  }, [currentUser?.employeeId]);

  // Kept in a ref (not just reading claimSummaryCache state directly) so fetchClaimSummaries'
  // identity stays stable across cache updates — callers' useEffects depending on this function
  // won't re-fire every time a new claim gets cached.
  const claimSummaryCacheRef = useRef<Record<string, { amount: number; expenseType: string; employeeName: string }>>({});
  useEffect(() => {
    claimSummaryCacheRef.current = claimSummaryCache;
  }, [claimSummaryCache]);

  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 5 (Approvals).
  const fetchClaimSummaries = useCallback(async (claimIds: string[]) => {
    const missing = Array.from(new Set(claimIds)).filter((id) => id && !claimSummaryCacheRef.current[id]);
    if (missing.length === 0) return;

    const results = await Promise.all(missing.map(async (id) => {
      try {
        // Same ClaimHeaderSet call (and same $expand combination) the claim detail page already
        // uses — HistorySet itself never carries expense type/amount, and `claims` drops
        // already-processed claims (ClaimHeaderSet's LoginId clears once a claim moves past the
        // current user). Confirmed by direct testing: this SAP service only actually populates
        // CLAIMNAV's results when HISTORYNAV is expanded alongside it — expanding CLAIMNAV alone
        // silently returns an empty array, even though the line items exist.
        const resp = await sapClient.get(`${SAP_BASE_URL}/ClaimHeaderSet('${id}')?$format=json&$expand=CLAIMNAV,HISTORYNAV`);
        if (resp.status < 200 || resp.status >= 300) return null;
        const data = resp.data;
        const sap = data.d || data;
        const claimNavResults = sap.CLAIMNAV?.results || [];
        return {
          id,
          summary: {
            amount: parseFloat(sap.TotalAmount || '0') || 0,
            expenseType: claimNavResults[0]?.ZglName || '',
            employeeName: sap.EmpName || '',
          },
        };
      } catch (e) {
        console.warn('Failed to fetch claim summary for', id, e);
        return null;
      }
    }));

    setClaimSummaryCache((prev) => {
      const next = { ...prev };
      results.forEach((r) => { if (r) next[r.id] = r.summary; });
      return next;
    });
  }, []);

  // BR-001: Calculate KPIs dynamically
  const kpis = useMemo<ClaimKPIs>(() => {
    let total = 0;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let paid = 0;
    let last3MonthsTotal = 0;

    const normalizeId = (id?: string) => (id || '').toString().replace(/\D/g, '').padStart(8, '0');
    const userNumeric = normalizeId(currentUser?.employeeId);

    claims.forEach((c) => {
      // Always filter KPI calculations to the logged-in user's claims by comparing LoginID == EmpId
      if (currentUser && normalizeId(c.employeeId) !== userNumeric) return;

      if (c.status !== 'Draft') total++;
      if (c.status === 'Submitted') pending++;
      if (c.status === 'Approved' || c.status === 'Pending Release') approved++;
      if (c.status === 'Rejected') rejected++;
      if (c.status === 'Paid') paid++;
    });

    // Compute Last 3 Months Paid Total (defensive parsing)
    try {
      const now = new Date();
      const cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      last3MonthsTotal = claims.reduce((sum, c) => {
        if (!c || c.status !== 'Paid') return sum;
        // Ensure claim belongs to current user
        if (currentUser && normalizeId(c.employeeId) !== userNumeric) return sum;
        const d = c.claimDate ? new Date(c.claimDate) : null;
        if (!d || Number.isNaN(d.getTime())) return sum;
        if (d >= cutoff) return sum + (typeof c.amount === 'number' ? c.amount : parseFloat(String(c.amount) || '0'));
        return sum;
      }, 0);
    } catch (e) {
      console.warn('Failed to compute last3MonthsTotal', e);
      last3MonthsTotal = 0;
    }

    return { total, pending, approved, rejected, paid, last3MonthsTotal };
  }, [claims, currentUser]);

  const getCurrentTimestamp = () => {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 16);
  };

  // BR-002, BR-003, BR-004, BR-005, BR-006: Create Claim Logic
  const addClaim = async (
    claimData: Omit<ExpenseClaim, 'id' | 'status' | 'workflowHistory'>,
    isDraft: boolean,
    ignoreDuplicateWarn = false,
    existingClaimId: string = ''
  ) => {
    // 1. Local Validation
    if (!isDraft) {
      if (!claimData.claimDate || !claimData.expenseType || claimData.expenseType === 'Select Expense Type' || !claimData.amount || !claimData.costCenter) {
        return { success: false, warning: 'Please fill in all mandatory fields before submitting.' };
      }
      // BR-003: Mandatory attachment check
      if (!claimData.attachments || claimData.attachments.length === 0) {
        return { success: false, warning: 'Supporting documents (at least 1 attachment) are mandatory for submitting a claim.' };
      }

      const invalidAttachment = claimData.attachments.find((att) => {
        const extension = (att.name?.split('.').pop() || '').toLowerCase();
        const type = (att.type || '').toLowerCase();
        return !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) || !ALLOWED_ATTACHMENT_MIME_TYPES.has(type);
      });

      if (invalidAttachment) {
        return { success: false, warning: 'Unsupported attachment type. Allowed file types: PDF, PNG, JPG, JPEG, XLS, XLSX, CSV, TXT.' };
      }

      // BR-005: Duplicate claim check (Local Optimistic Check)
      if (!ignoreDuplicateWarn) {
        const isDuplicate = claims.some(
          (c) =>
            c.employeeId === claimData.employeeId &&
            c.claimDate === claimData.claimDate &&
            c.amount === claimData.amount &&
            c.status !== 'Draft' &&
            c.status !== 'Rejected'
        );
        if (isDuplicate) {
          return { success: false, warning: 'DUPLICATE_DETECTED: A claim with the exact same Employee ID, Claim Date, and Amount already exists. Do you wish to continue?' };
        }
      }
    }

    // Find the selected SAP expense type object
    const selectedSapType = expenseTypes.find((et) => et.name === claimData.expenseType);

    // 2. Build the exact Deep Entity payload SAP expects
    const empIdNumeric = claimData.employeeId.replace(/\D/g, '').padStart(8, '0');

    const numAttachments = claimData.attachments && claimData.attachments.length > 0 ? claimData.attachments.length : 1;

    const claimNavItems: any[] = [];
    for (let i = 0; i < numAttachments; i++) {
      claimNavItems.push({
        ClaimId: existingClaimId ? existingClaimId : '',
        ItemNo: i === 0 ? (claimData.itemNo || '000001') : (i + 1).toString().padStart(6, '0'),
        ExpenseType: selectedSapType ? selectedSapType.id : claimData.expenseType,
        ZglName: selectedSapType ? selectedSapType.name : claimData.expenseType,
        Saknr: selectedSapType ? selectedSapType.saknr : '',
        ExpenseDate: claimData.expenseDate || null,
        Amount: i === 0 ? claimData.amount.toFixed(3) : '0.000',
        Currency: 'INR',
        Description: claimData.justification || 'Expense',
        VendorName: claimData.name1 || 'External Vendor',
      });
    }

    const { costCenter: ccCode, ltext: ccLtext } = parseCostCenter(claimData.costCenter);

    const sapPayload: any = {
      ClaimId: existingClaimId ? existingClaimId : '', // Create-time empty, resubmit uses existing claim ID
      EmpId: empIdNumeric,
      EmpName: claimData.employeeName || 'Unknown',
      Department: claimData.department || 'IT',
      Designation: claimData.designation || 'Staff',
      TotalAmount: claimData.amount.toFixed(3),
      Currency: 'INR',
      CostCenter: ccCode || claimData.costCenter,
      Ltext: ccLtext,
      Status: isDraft ? 'D' : 'N',
      Lifnr: claimData.lifnr || '',
      Name1: claimData.name1 || '',
      Stcd3: claimData.stcd3 || '',
      Bezei: claimData.bezei || '',
      // HSN/SAC code captured on the Create form when GSTIN = Yes. Optional — submits as '' when
      // left blank, same as the other GST fields above.
      HsnSac: (claimData as any).hsnSac || '',
      CLAIMNAV: claimNavItems,
    };

    // 3. Submit directly to SAP
    // Attachments travel as base64 inside the JSON body rather than a raw multipart upload.
    try {
      const attachmentsPayload: { fieldName: string; name: string; type: string; base64: string }[] = [];
      if (claimData.attachments && claimData.attachments.length > 0) {
        for (let i = 0; i < claimData.attachments.length; i++) {
          const att = claimData.attachments[i];
          const base64 = await readAttachmentAsBase64(att.uri);
          attachmentsPayload.push({
            fieldName: `receipt_${i}`,
            name: att.name,
            type: att.type || 'application/octet-stream',
            base64,
          });
        }
      }

      // Attach each file's base64 payload onto its matching CLAIMNAV line. claimNavItems is
      // built one row per attachment above, so index i lines up 1:1.
      attachmentsPayload.forEach((att, i) => {
        const line: any = sapPayload.CLAIMNAV[i];
        if (!line) return;
        line.Value = att.base64; // XString — base64
        line.Mimetype = (att.type || '').slice(0, 100); // C(100)
        line.Filename = (att.name || '').slice(0, 90); // C(90)
      });

      // Calls SAP's ClaimHeaderSet directly (same anonymous-POST exception as GST/claims/
      // expense-types/history) — POST, not PUT (SAP gateway rejects PUT with key predicates).
      const response = await sapClient.post(`${SAP_BASE_URL}/ClaimHeaderSet`, sapPayload, {
        headers: { 'Content-Type': 'application/json' },
      });

      // axios parses JSON automatically when content-type says so; otherwise response.data is
      // the raw string body — mirror the original's content-type sniffing exactly.
      let responseData: any = typeof response.data === 'string' ? { error: response.data || 'Server returned an unexpected response.' } : response.data;

      console.log('[SUBMIT] Response Status:', response.status);
      console.log('[SUBMIT] Response Data:', responseData);

      // 5. Handle SAP Errors — check Type==='E' even on HTTP 200, SAP's OData gateway sometimes
      // returns 200 with an error body.
      const bodyType = (responseData?.d?.Type || responseData?.Type || '').toString().toUpperCase();
      if (response.status < 200 || response.status >= 300 || bodyType === 'E') {
        const isHtml = typeof responseData.error === 'string' && responseData.error.trim().startsWith('<');
        let sapErrorMessage = 'Unknown SAP Error';
        if (response.status === 413) {
          sapErrorMessage = 'Uploaded file is too large. Please attach a smaller file.';
        } else if (isHtml) {
          sapErrorMessage = 'Server error. Please try again or upload a smaller file.';
        } else {
          sapErrorMessage = responseData?.error?.message?.value || responseData?.error || responseData?.d?.Message || responseData?.Message || 'Unknown SAP Error';
        }
        console.error('[SUBMIT] Error:', sapErrorMessage);
        return { success: false, warning: sapErrorMessage };
      }

      // Mirror the original response shape (ClaimId/Status/Message) so nothing downstream (the
      // newId extraction right below) needs to change.
      {
        const sapResponse = responseData.d || responseData;
        const claimId = sapResponse.ClaimId || sapResponse.ClaimID || sapResponse['ClaimId'] || sapResponse.id;
        responseData = { ClaimId: claimId, Status: sapResponse.Status, Message: 'Claim submitted successfully' };
      }

      // 6. Success! Update local UI state
      const newId = responseData?.ClaimId || `CLM-${Math.floor(1000 + Math.random() * 9000)}`;
      console.log('[SUBMIT] Success! Claim ID:', newId);

      const status: ClaimStatus = isDraft ? 'Draft' : 'Submitted';
      const outcome = isDraft ? 'Draft' : 'Submitted';
      const remarks = isDraft ? 'Saved as draft.' : 'Submitted for approval.';

      // Auto-approval logic removed as requested. Always set to Draft/Submitted.

      const newClaim: ExpenseClaim = {
        ...claimData,
        id: newId,
        status,
        workflowHistory: [
          {
            step: isDraft ? 'Draft Created' : 'Submission',
            actor: `${currentUser?.employeeName || 'Unknown'} (${currentUser?.role || 'Unknown'})`,
            timestamp: getCurrentTimestamp(),
            outcome,
            remarks,
          },
        ],
      };

      // Replace old claim if resubmitting (existingClaimId set), otherwise add new
      if (existingClaimId) {
        setClaims((prev) => prev.map((c) => (c.id === existingClaimId ? newClaim : c)));
      } else {
        setClaims((prev) => [newClaim, ...prev]);
      }
      console.log('[SUBMIT] Returning success');
      return { success: true, claimId: newId };
    } catch (err: any) {
      console.error('[SUBMIT] Catch Error:', err);
      const message = err?.message || 'Failed to reach the backend server.';
      const cleanMessage = message.includes('Unexpected token <') ? 'Server returned an invalid response. Please try again.' : message;
      return { success: false, warning: `Failed to reach the backend server. ${cleanMessage}` };
    }
  };

  // Update draft claim
  const updateDraft = (id: string, claimData: Partial<ExpenseClaim>, isDraft: boolean) => {
    const existing = claims.find((c) => c.id === id);
    if (!existing) return { success: false, warning: 'Claim not found.' };

    if (!isDraft) {
      const merged = { ...existing, ...claimData };
      if (!merged.claimDate || !merged.expenseType || !merged.amount || !merged.costCenter) {
        return { success: false, warning: 'Please fill in all mandatory fields before submitting.' };
      }
      if (!merged.attachments || merged.attachments.length === 0) {
        return { success: false, warning: 'Supporting documents (at least 1 attachment) are mandatory for submitting a claim.' };
      }
    }

    const status: ClaimStatus = isDraft ? 'Draft' : 'Submitted';
    const outcome = isDraft ? 'Draft Updated' : 'Submitted';
    const remarks = isDraft ? 'Updated draft details.' : 'Submitted from draft.';

    // Auto-approval logic removed as requested. Always set to Submitted.

    setClaims((prev) => prev.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          ...claimData,
          status,
          workflowHistory: [
            ...c.workflowHistory,
            {
              step: isDraft ? 'Draft Updated' : 'Submission',
              actor: `${currentUser?.employeeName} (${currentUser?.role})`,
              timestamp: getCurrentTimestamp(),
              outcome,
              remarks,
            },
          ],
        };
      }
      return c;
    }));

    return { success: true };
  };

  const deleteClaim = (id: string) => {
    setClaims((prev) => prev.filter((c) => c.id !== id));
  };

  // Mirrors the original app's /api/approve-claim/:id backend route: POST (not PUT — SAP Gateway
  // rejects PUTs with key predicates here) to ClaimHeaderSet with the same putData shape, used
  // by approve/reject/release/finance-reject below.
  const postClaimHeaderUpdate = async (putData: any, defaultErrorMessage: string) => {
    const response = await sapClient.post(`${SAP_BASE_URL}/ClaimHeaderSet`, putData, {
      headers: { 'Content-Type': 'application/json' },
    });

    const bodyType = (response.data?.d?.Type || response.data?.Type || '').toString().toUpperCase();
    if (response.status < 200 || response.status >= 300 || bodyType === 'E') {
      let errMsg = defaultErrorMessage;
      try {
        const errData = response.data;
        errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || errMsg;
      } catch (e) {
        // keep defaultErrorMessage
      }
      throw new Error(errMsg);
    }
  };

  // BR-009, BR-011: Manager Approve
  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 4 (Claim Detail).
  const approveClaim = async (id: string) => {
    const claim = claims.find((c) => c.id === id);
    if (!claim) return { success: false, error: 'Claim not found' };

    try {
      const empIdNumeric = claim.employeeId.replace(/\D/g, '').padStart(8, '0');
      const loginIdNumeric = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
      const putData = {
        ClaimId: claim.id, // Must be the actual Claim ID from SAP
        EmpId: empIdNumeric,
        LoginId: loginIdNumeric, // The manager/finance user approving the claim
        EmpName: claim.employeeName || 'Unknown',
        Department: claim.department || 'IT',
        Designation: claim.designation || 'Staff',
        TotalAmount: claim.amount.toFixed(3),
        Currency: 'INR',
        CostCenter: claim.costCenter,
        Status: 'A', // Sending Approved status
        ApprovalRequired: 'A', // Action: Approve
      };

      await postClaimHeaderUpdate(putData, 'SAP Backend rejected the approval');

      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: 'Approved',
            rawStatus: c.rawStatus === 'N' ? 'A' : 'H',
            currentApprover: '',
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: 'Manager Review',
                actor: `${currentUser?.employeeName} (Manager)`,
                timestamp: getCurrentTimestamp(),
                outcome: 'Approved',
                remarks: 'Approved by department manager.',
              },
            ],
          };
        }
        return c;
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // BR-010, BR-011: Manager Reject with mandatory remarks
  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 4 (Claim Detail).
  const rejectClaim = async (id: string, remarks: string) => {
    if (!remarks || remarks.trim() === '') {
      return { success: false, error: 'Rejection remarks are mandatory.' };
    }

    const claim = claims.find((c) => c.id === id);
    if (!claim) return { success: false, error: 'Claim not found' };

    try {
      const empIdNumeric = claim.employeeId.replace(/\D/g, '').padStart(8, '0');
      const loginIdNumeric = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
      const putData = {
        ClaimId: claim.id,
        EmpId: empIdNumeric,
        LoginId: loginIdNumeric,
        EmpName: claim.employeeName || 'Unknown',
        Department: claim.department || 'IT',
        Designation: claim.designation || 'Staff',
        TotalAmount: claim.amount.toFixed(3),
        Currency: 'INR',
        CostCenter: claim.costCenter,
        Status: 'R', // Sending Rejected status
        ApprovalRequired: 'R', // Action: Reject
        RejReason: remarks,
      };

      await postClaimHeaderUpdate(putData, 'SAP Backend rejected the rejection');

      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: 'Rejected',
            rawStatus: 'R',
            currentApprover: '',
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: 'Manager Review',
                actor: `${currentUser?.employeeName} (Manager)`,
                timestamp: getCurrentTimestamp(),
                outcome: 'Rejected',
                remarks,
              },
            ],
          };
        }
        return c;
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Clarification request — local only, no SAP call (confirmed in the original app).
  const requestClarification = (id: string, remarks: string) => {
    setClaims((prev) => prev.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          workflowHistory: [
            ...c.workflowHistory,
            {
              step: 'Clarification Requested',
              actor: `${currentUser?.employeeName} (${currentUser?.role})`,
              timestamp: getCurrentTimestamp(),
              outcome: 'Clarification Requested',
              remarks: remarks || 'Please provide additional details regarding this claim.',
            },
          ],
        };
      }
      return c;
    }));
  };

  // BR-012, BR-014: Finance Validate Claim — local-only simulation, no real SAP transaction.
  const validateClaimFinance = (id: string) => {
    setClaims((prev) => prev.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          status: 'Pending Release',
          workflowHistory: [
            ...c.workflowHistory,
            {
              step: 'Finance Review',
              actor: `${currentUser?.employeeName} (Finance)`,
              timestamp: getCurrentTimestamp(),
              outcome: 'Validated',
              remarks: 'Simulated SAP validation successful. Financial checks passed and posting readiness verified.',
            },
          ],
        };
      }
      return c;
    }));
  };

  // TaxSet/AreaSet are open for direct anonymous GET on the same SAP gateway as everything else
  // above (confirmed with Basis).
  const fetchTaxes = async (claimId: string): Promise<TaxCode[]> => {
    try {
      const filter = encodeURIComponent(`ClaimId eq '${claimId}'`);
      const response = await sapClient.get(`${SAP_BASE_URL}/TaxSet?$format=json&$filter=${filter}`);
      if (response.status < 200 || response.status >= 300) {
        throw new Error('Failed to fetch taxes');
      }
      const data = response.data;
      return data?.d?.results || data?.results || [];
    } catch (err) {
      console.error('[TAXES] Fetch Error:', err);
      return [];
    }
  };

  // Calls SAP's real tax engine (CALCULATE_TAX_FROM_GROSSAMOUNT) to split a claim's gross total
  // into expense vs. tax amount for whichever tax code Finance has just clicked in the tax-code
  // picker — purely informational display, no effect on the actual release/approve flow, which
  // still sends the same selected tax code to releasePayment() exactly as before.
  // NOT YET DEPLOYED TO NGQ at the time this was written — field names (Mwskz/Currency/TotalAmount
  // in, ExpenseAmt/TaxAmaount out, the latter matching a typo in the backend's own field name) are
  // a direct PascalCase read of the ABAP structure zexp_st_tax; re-verify once it's live.
  const calculateTax = async (totalAmount: number, currency: string, mwskz: string): Promise<{ expenseAmt: number; taxAmt: number } | null> => {
    try {
      const postData = { Mwskz: mwskz, Currency: currency, TotalAmount: totalAmount.toFixed(3) };
      const response = await sapClient.post(`${SAP_BASE_URL}/CalculateSet`, postData, {
        headers: { 'Content-Type': 'application/json' },
      });
      const bodyType = (response.data?.d?.Type || response.data?.Type || '').toString().toUpperCase();
      if (response.status < 200 || response.status >= 300 || bodyType === 'E') return null;
      const d = response.data?.d || response.data;
      const expenseAmt = parseFloat(d?.ExpenseAmt ?? d?.Expense_amt ?? '0');
      const taxAmt = parseFloat(d?.TaxAmaount ?? d?.Tax_amaount ?? '0');
      if (Number.isNaN(expenseAmt) || Number.isNaN(taxAmt)) return null;
      return { expenseAmt, taxAmt };
    } catch (err) {
      console.error('[CALCULATE_TAX] Error:', err);
      return null;
    }
  };

  const fetchAreas = async (): Promise<AreaCode[]> => {
    try {
      const response = await sapClient.get(`${SAP_BASE_URL}/AreaSet?$format=json`);
      if (response.status < 200 || response.status >= 300) {
        throw new Error('Failed to fetch areas');
      }
      const data = response.data;
      return data?.d?.results || data?.results || [];
    } catch (err) {
      console.error('[AREAS] Fetch Error:', err);
      return [];
    }
  };

  // BR-013, BR-014: Finance Release Payment
  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 6 (Finance).
  const releasePayment = async (id: string, taxCode?: string, taxDescription?: string) => {
    const claim = claims.find((c) => c.id === id);
    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    const empIdNumeric = (claim.employeeId || '').toString().replace(/\D/g, '').padStart(8, '0');
    const loginIdNumeric = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';

    const putData: any = {
      ClaimId: claim.id || id,
      EmpId: empIdNumeric,
      LoginId: loginIdNumeric,
      EmpName: claim.employeeName || currentUser?.employeeName || 'Unknown',
      Department: claim.department || currentUser?.department || 'Finance',
      Designation: claim.designation || currentUser?.designation || 'Finance',
      TotalAmount: (claim.amount ?? 0).toFixed(3),
      Currency: 'INR',
      CostCenter: claim.costCenter || '',
      Status: 'P',
      ApprovalRequired: 'A',
    };

    if (taxCode) {
      putData.Mwskz = taxCode;
      if (taxDescription) {
        putData.Text1 = taxDescription;
      }
    }

    try {
      await postClaimHeaderUpdate(putData, 'SAP rejected the payment release');

      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: 'Paid',
            rawStatus: 'P',
            currentApprover: '',
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: 'Payment Processing',
                actor: `${currentUser?.employeeName} (Finance)`,
                timestamp: getCurrentTimestamp(),
                outcome: 'Paid',
                remarks: 'Payment released successfully. Accounting document posted.',
              },
            ],
          };
        }
        return c;
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while releasing payment' };
    }
  };

  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 6 (Finance).
  const rejectClaimFinance = async (id: string, remarks: string) => {
    if (!remarks || remarks.trim() === '') {
      return { success: false, error: 'Please provide rejection remarks.' };
    }

    try {
      const claim = claims.find((c) => c.id === id);
      if (!claim) return { success: false, error: 'Claim not found' };

      const empIdNumeric = (claim.employeeId || '').toString().replace(/\D/g, '').padStart(8, '0');
      const loginIdNumeric = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';

      const putData = {
        ClaimId: claim.id || id,
        EmpId: empIdNumeric,
        LoginId: loginIdNumeric,
        EmpName: claim.employeeName || currentUser?.employeeName || 'Unknown',
        Department: claim.department || currentUser?.department || 'Finance',
        Designation: claim.designation || currentUser?.designation || 'Finance',
        TotalAmount: (claim.amount ?? 0).toFixed(3),
        Currency: 'INR',
        CostCenter: claim.costCenter || '',
        Status: 'R',
        ApprovalRequired: 'R',
        RejReason: remarks,
      };

      await postClaimHeaderUpdate(putData, 'SAP rejected the finance rejection');

      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: 'Rejected',
            rawStatus: 'R',
            currentApprover: '',
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: 'Finance Rejection',
                actor: `${currentUser?.employeeName} (Finance)`,
                timestamp: getCurrentTimestamp(),
                outcome: 'Rejected',
                remarks,
              },
            ],
          };
        }
        return c;
      }));

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error while rejecting claim' };
    }
  };

  // BR-018, BR-019: Retry SAP Posting — local-only, backs the debug-only errors screen.
  const retrySAPPosting = (errorId: string) => {
    setErrors((prev) => prev.map((err) => {
      if (err.id === errorId) {
        return {
          ...err,
          status: 'Resolved',
          resolutionHistory: [
            ...err.resolutionHistory,
            {
              timestamp: getCurrentTimestamp(),
              resolvedBy: `${currentUser?.employeeName} (${currentUser?.role})`,
              notes: 'Successfully re-triggered SAP posting queue. Integration error resolved.',
            },
          ],
        };
      }
      return err;
    }));
  };

  const getClaimById = (id: string) => {
    return claims.find((c) => c.id === id);
  };

  // BR-007, BR-008: Filtering & Searching
  const filterClaims = (roleFilter?: 'employee' | 'manager' | 'finance', search?: string, expenseType?: string, status?: string) => {
    return claims
      .filter((c) => {
        // Role filtering logic (Segregation by EmpId and LoginId)
        if (roleFilter === 'employee') {
          // My Claims tab: Only show claims where EmpId matches the logged-in user's LoginId
          if (currentUser && c.employeeId !== currentUser.employeeId) {
            return false;
          }
        } else if (roleFilter === 'manager') {
          const userNumeric = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
          const approverNumeric = (c.currentApprover || '').toString().replace(/\D/g, '').padStart(8, '0');

          if (currentUser) {
            if (approverNumeric !== userNumeric) {
              return false;
            }
          }

          // Manager should only see claims assigned to them with SAP status N or A
          if (c.rawStatus !== 'N' && c.rawStatus !== 'A') return false;
        } else if (roleFilter === 'finance') {
          const userNumericF = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
          const employeeNumeric = c.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';

          if (currentUser) {
            // Finance should see claims that are not their own employee claims.
            if (employeeNumeric === userNumericF) return false;
          }

          const financeStatuses = currentUser?.role === 'B' ? ['H', 'P'] : ['H'];
          if (!financeStatuses.includes(c.rawStatus || '')) return false;
        }

        // Search by employee name or claim ID or cost center
        if (search && search.trim() !== '') {
          const q = search.toLowerCase();
          const match =
            c.employeeName.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            c.costCenter.toLowerCase().includes(q) ||
            c.expenseType.toLowerCase().includes(q);
          if (!match) return false;
        }

        // Filter by expense type
        if (expenseType && expenseType !== 'All') {
          if (c.expenseType !== expenseType) return false;
        }

        // Filter by status
        if (status && status !== 'All') {
          if (c.status !== status) return false;
        }

        return true;
      })
      .sort((left, right) => getClaimCreatedTimestamp(right) - getClaimCreatedTimestamp(left));
  };

  // Automatically load expense types and re-fetch claims whenever the logged-in user changes
  useEffect(() => {
    // Clear any previous user's claims and history immediately to prevent cache leakage/flickering
    setClaims([]);
    setHistoryEntries([]);

    if (!currentUser?.employeeId) {
      return;
    }

    const loadUserData = async () => {
      await fetchExpenseTypes();
      await fetchClaims();
    };

    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return (
    <ClaimContext.Provider
      value={{
        claims,
        errors,
        historyEntries,
        kpis,
        autoApprovalThreshold,
        policyLimit,
        addClaim,
        updateDraft,
        deleteClaim,
        approveClaim,
        rejectClaim,
        requestClarification,
        validateClaimFinance,
        releasePayment,
        fetchTaxes,
        calculateTax,
        fetchAreas,
        rejectClaimFinance,
        retrySAPPosting,
        getClaimById,
        filterClaims,
        fetchClaims,
        fetchHistorySet,
        claimSummaryCache,
        fetchClaimSummaries,
        expenseTypes,
        fetchExpenseTypes,
        tempClaimForResubmit,
        setTempClaimForResubmit: handleSetTempClaimForResubmit,
      }}
    >
      {children}
    </ClaimContext.Provider>
  );
};

export const useClaim = () => {
  const context = useContext(ClaimContext);
  if (!context) {
    throw new Error('useClaim must be used within a ClaimProvider');
  }
  return context;
};
