'use client';

import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SAP_BASE_URL } from '../config/api';
import { AreaCode, Attachment, ClaimKPIs, ClaimStatus, DoaChainRow, ExpenseClaim, SAPError, TaxCode } from '../types';
import { getClaimCreatedTimestamp } from '../utils/claim-date';
import { useAuth } from './AuthContext';

interface ClaimContextType {
  claims: ExpenseClaim[];
  errors: SAPError[];
  historyEntries: any[];
  kpis: ClaimKPIs;
  policyLimit: number;
  // Claim Actions
  addClaim: (claimData: Omit<ExpenseClaim, 'id' | 'status' | 'workflowHistory'>, isDraft: boolean, existingClaimId?: string) => Promise<{ success: boolean; warning?: string; claimId?: string }>;
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
  // Admin Actions (ZEXP_ADMIN) — search any claim, reject any open claim. See lib/adminAccess.ts
  // for how isAdmin is resolved.
  adminSearchClaims: (adminLoginId: string, criteria: { claimId?: string }) => Promise<ExpenseClaim[]>;
  adminRejectClaim: (claimId: string, adminLoginId: string, reason: string) => Promise<{ Status?: string; Message?: string }>;
  // DOA Chain Maintenance Actions — CRUD against the new DoaChainSet entity.
  fetchDoaChain: (doaCtype: string, kostl: string) => Promise<DoaChainRow[]>;
  createDoaChainRow: (row: DoaChainRow, adminPernr: string) => Promise<DoaChainRow>;
  updateDoaChainRow: (row: DoaChainRow, adminPernr: string) => Promise<DoaChainRow>;
  deactivateDoaChainRow: (row: DoaChainRow, adminPernr: string, validTo: string) => Promise<DoaChainRow>;
  // Error Management Actions
  retrySAPPosting: (errorId: string) => void;
  // Getters & Filters
  getClaimById: (id: string) => ExpenseClaim | undefined;
  filterClaims: (roleFilter?: 'employee' | 'manager' | 'finance', search?: string, expenseType?: string, status?: string) => ExpenseClaim[];
  fetchClaims: () => Promise<void>;
  fetchHistorySet: (fiscalYear?: number) => Promise<void>;
  // Claim detail lookups for history-trail cards (Approvals/Finance's Approved/Rejected/Total
  // view) — HistorySet itself never carries expense type/amount, and `claims` only holds claims
  // currently assigned to this user (ClaimHeaderSet's LoginId is cleared once a claim moves past
  // them), so already-processed claims silently vanish from it. This fetches/caches each claim's
  // own ClaimHeaderSet record instead — the same call the claim detail page already relies on.
  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 5 (Approvals).
  claimSummaryCache: Record<string, { amount: number; expenseType: string; employeeName: string; lifnr?: string }>;
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

// SAP's gateway expects the standard OData v2 JSON date-literal wire format for Edm.DateTime
// fields — a plain 'YYYY-MM-DD' string silently lands as an initial/null value in the backend
// instead of erroring. Confirmed directly: ClaimDate and ExpenseDate both stored as null on every
// claim created through this app until switched to this format.
const toODataDate = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime();
  return Number.isNaN(ms) ? null : `/Date(${ms})/`;
};

// Single source of truth for raw SAP Status -> display ClaimStatus, used by fetchClaims and by
// every action (approveClaim, releasePayment) that needs to trust a POST response's returned
// Status instead of guessing the next state locally — see the DOA handover's "read the result, do
// not assume it" requirement.
const mapRawStatusToClaimStatus = (rawStatus: string): ClaimStatus => {
  if (rawStatus === 'D') return 'Draft';
  if (rawStatus === 'A') return 'Approved';
  if (rawStatus === 'R') return 'Rejected';
  if (rawStatus === 'P') return 'Pending Release';
  if (rawStatus === 'H') return 'Pending at finance';
  if (rawStatus === 's' || rawStatus === 'S') return 'Paid';
  return 'Submitted';
};

// SAP's OData gateway returns results in one of several shapes depending on entity/call -
// normalize every GET response (ClaimHeaderSet, DoaChainSet, etc.) to a plain array once, here.
const extractSapResults = (data: any): any[] => {
  if (!data) return [];
  if (data.d && data.d.results) return data.d.results; // GET_ENTITYSET format
  if (data.d) return [data.d]; // GET_ENTITY format
  if (data.value) return data.value; // OData V4 format
  if (data.EmpId) return [data]; // Flat object fallback
  if (Array.isArray(data)) return data; // Direct array fallback
  return [];
};

// Maps one raw SAP ClaimHeaderSet (with $expand=CLAIMNAV) record to this app's ExpenseClaim shape
// - shared by fetchClaims (the logged-in user's own/assigned claims) and adminSearchClaims (any
// claim, via Zview='ADMIN'), so the two don't duplicate this mapping.
const mapSapClaimToExpenseClaim = (sap: any, expenseTypes: any[]): ExpenseClaim => {
  const status: ClaimStatus = mapRawStatusToClaimStatus(sap.Status || '');

  let expenseType = sap.ZglName || sap.ExpenseType || '';
  let justification = '';
  let expenseDate = '';
  let itemNo = '';
  const claimNavResults = sap.CLAIMNAV?.results || (Array.isArray(sap.CLAIMNAV) ? sap.CLAIMNAV : []);
  if (claimNavResults.length > 0) {
    const firstLine = claimNavResults[0];
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
    // Persisted on the claim itself once it's gone through a GST tax-code release — SAP
    // leaves these at '0.000' for claims that never had a tax code applied (see claim/
    // page.tsx's identical persistedExpenseAmt/persistedTaxAmount read of this same header).
    expenseAmt: parseFloat(sap.ExpenseAmt || '0') || 0,
    taxAmaount: parseFloat(sap.TaxAmaount || '0') || 0,
    workflowHistory: [],
  };
};

// Shared status/error-body check for any SAP OData write response - SAP's gateway sometimes
// returns HTTP 200 with an error body (Type==='E'), so status alone isn't enough. Returns the
// parsed success body so callers can trust what SAP actually did instead of guessing.
const handleSapWriteResponse = (response: any, defaultErrorMessage: string) => {
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
  return response.data?.d || response.data || {};
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
          // ExptypeSet.Flag = 'X' means this expense type doesn't require a supporting-document
          // attachment to submit — the mandatory-attachment rule (BR-003) is skipped for it.
          noAttachmentRequired: item.Flag === 'X',
          // Same Flag field, different value: blank (neither 'X' nor anything else) means this
          // expense type additionally needs a separate Manager Approved Attachment - currently
          // only true for the "1st Telephone Claim" ExptypeSet record.
          requiresManagerApprovedAttachment: !item.Flag,
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

      const sapClaims = extractSapResults(response.data);
      const mappedClaims: ExpenseClaim[] = sapClaims.map((sap: any) => mapSapClaimToExpenseClaim(sap, expenseTypes));
      // Replace the existing claims with the latest fetched set (clear when SAP returns empty)
      setClaims(mappedClaims);
    } catch (err) {
      console.error('Failed to fetch SAP claims:', err);
    }
  };

  // NOT YET VERIFIED AGAINST REAL SAP IN THIS REWRITE — slice 5 (Approvals).
  const fetchHistorySet = useCallback(async (fiscalYear?: number) => {
    try {
      if (!currentUser?.employeeId) return;

      // HistorySet is open for direct anonymous GET (confirmed with Basis).
      const loginIdForSAP = currentUser.employeeId.replace(/\D/g, '').padStart(8, '0');
      // Fiscal-year scoping now happens server-side (SAP's own Fiscalyear field), replacing the
      // old client-side ActionDate-based year filter — Approvals passes the selected year chip's
      // value through here on every change instead of fetching everything and filtering locally.
      const filterClause = fiscalYear
        ? `ActionBy eq '${loginIdForSAP}' and Fiscalyear eq '${fiscalYear}'`
        : `ActionBy eq '${loginIdForSAP}'`;
      const filter = encodeURIComponent(filterClause);
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
            lifnr: sap.Lifnr || '',
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
      if (c.status === 'Pending Release' || c.status === 'Pending at finance') approved++;
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

  // BR-002, BR-003, BR-004, BR-006: Create Claim Logic
  const addClaim = async (
    claimData: Omit<ExpenseClaim, 'id' | 'status' | 'workflowHistory'>,
    isDraft: boolean,
    existingClaimId: string = ''
  ) => {
    // 1. Local Validation
    if (!isDraft) {
      if (!claimData.claimDate || !claimData.expenseType || claimData.expenseType === 'Select Expense Type' || !claimData.amount || !claimData.costCenter) {
        return { success: false, warning: 'Please fill in all mandatory fields before submitting.' };
      }
      // BR-003: Mandatory attachment check — normally skipped when the chosen expense type's
      // ExptypeSet record has Flag = 'X' (that type doesn't require a supporting document).
      // Forced to false for now - attachment is mandatory for every expense type until the
      // Flag X rule is revisited.
      const attachmentsOptionalForType = false;
      if (!attachmentsOptionalForType && (!claimData.attachments || claimData.attachments.length === 0)) {
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

      // Second, separate attachment required when the chosen expense type's ExptypeSet.Flag
      // comes back blank - see requiresManagerApprovedAttachment in fetchExpenseTypes above.
      const requiresManagerApprovedAttachment = expenseTypes.find((et) => et.name === claimData.expenseType)?.requiresManagerApprovedAttachment === true;
      const managerApprovedAttachments = (claimData as any).managerApprovedAttachments || [];
      if (requiresManagerApprovedAttachment && managerApprovedAttachments.length === 0) {
        return { success: false, warning: 'Manager Approved attachment is mandatory for 1st Telephone Claim.' };
      }
    }

    // Find the selected SAP expense type object
    const selectedSapType = expenseTypes.find((et) => et.name === claimData.expenseType);

    // 2. Build the exact Deep Entity payload SAP expects
    const empIdNumeric = claimData.employeeId.replace(/\D/g, '').padStart(8, '0');

    // SAP has no separate document-type field for the Manager Approved Attachment - it travels
    // alongside the regular supporting documents as just another CLAIMNAV line/attachment.
    const allAttachments = [...(claimData.attachments || []), ...((claimData as any).managerApprovedAttachments || [])];
    const numAttachments = allAttachments.length > 0 ? allAttachments.length : 1;

    const claimNavItems: any[] = [];
    for (let i = 0; i < numAttachments; i++) {
      claimNavItems.push({
        ClaimId: existingClaimId ? existingClaimId : '',
        ItemNo: i === 0 ? (claimData.itemNo || '000001') : (i + 1).toString().padStart(6, '0'),
        ExpenseType: selectedSapType ? selectedSapType.id : claimData.expenseType,
        ZglName: selectedSapType ? selectedSapType.name : claimData.expenseType,
        Saknr: selectedSapType ? selectedSapType.saknr : '',
        ExpenseDate: toODataDate(claimData.expenseDate),
        Amount: i === 0 ? claimData.amount.toFixed(3) : '0.000',
        Currency: 'INR',
        Description: claimData.justification || 'Expense',
        VendorName: claimData.name1 || 'External Vendor',
      });
    }

    const { costCenter: ccCode, ltext: ccLtext } = parseCostCenter(claimData.costCenter);

    const sapPayload: any = {
      ClaimId: existingClaimId ? existingClaimId : '', // Create-time empty, resubmit uses existing claim ID
      ClaimDate: toODataDate(claimData.claimDate),
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
      if (allAttachments.length > 0) {
        for (let i = 0; i < allAttachments.length; i++) {
          const att = allAttachments[i];
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
      // Forced to false for now - attachment is mandatory for every expense type until the
      // Flag X rule is revisited.
      const attachmentsOptionalForType = false;
      if (!attachmentsOptionalForType && (!merged.attachments || merged.attachments.length === 0)) {
        return { success: false, warning: 'Supporting documents (at least 1 attachment) are mandatory for submitting a claim.' };
      }

      const requiresManagerApprovedAttachment = expenseTypes.find((et) => et.name === merged.expenseType)?.requiresManagerApprovedAttachment === true;
      const managerApprovedAttachments = (merged as any).managerApprovedAttachments || [];
      if (requiresManagerApprovedAttachment && managerApprovedAttachments.length === 0) {
        return { success: false, warning: 'Manager Approved attachment is mandatory for 1st Telephone Claim.' };
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
    // Callers that need to trust what SAP actually did (e.g. the DOA chain's resulting Status/
    // CurrentApprover after an approve, or Belnr/Gjahr after a finance release) read it from here
    // instead of guessing the next state locally.
    return handleSapWriteResponse(response, defaultErrorMessage);
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

      const sapResponse = await postClaimHeaderUpdate(putData, 'SAP Backend rejected the approval');

      // Under the DOA chain, approving doesn't always mean "done" or even "status changed" — a
      // claim can stay N/A if it's a parallel (rule A) level still waiting on other approvers, or
      // move to A (more levels to go) or H (last level done). Trust whatever SAP actually
      // returned instead of guessing a fixed N->A->H progression that only ever held for the old
      // 2-level flow.
      const newRawStatus = sapResponse.Status || claim.rawStatus;
      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: mapRawStatusToClaimStatus(newRawStatus),
            rawStatus: newRawStatus,
            // First pending approver of the next level, or empty once the chain reaches H.
            currentApprover: sapResponse.CurrentApprover || '',
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: 'Approval',
                actor: `${currentUser?.employeeName} (${currentUser?.role})`,
                timestamp: getCurrentTimestamp(),
                outcome: 'Approved',
                remarks: 'Approved at this level.',
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
      // Sent Status is unconfirmed against the new one-step H->S finance flow - the handover doc
      // only describes new behavior, not a new request payload, and this value is very likely
      // overridden server-side the same way approveClaim's sent Status:'A' already is. Verify
      // once the new posting logic is actually live; the result handling below reads the real
      // returned Status either way, so this is safe regardless of what SAP does with it.
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
      const sapResponse = await postClaimHeaderUpdate(putData, 'SAP rejected the payment release');

      // A NEW claim's release now goes straight H -> S (posted) in one step; a legacy claim that
      // genuinely still goes through the old park step comes back P. Read the real result instead
      // of hardcoding either outcome, so this is correct under both flows.
      const newRawStatus = sapResponse.Status || 'P';
      setClaims((prev) => prev.map((c) => {
        if (c.id === id) {
          return {
            ...c,
            status: mapRawStatusToClaimStatus(newRawStatus),
            rawStatus: newRawStatus,
            currentApprover: '',
            belnr: sapResponse.Belnr || c.belnr,
            gjahr: sapResponse.Gjahr || c.gjahr,
            workflowHistory: [
              ...c.workflowHistory,
              {
                step: newRawStatus === 'S' ? 'Posted to FI' : 'Payment Processing',
                actor: `${currentUser?.employeeName} (Finance)`,
                timestamp: getCurrentTimestamp(),
                outcome: newRawStatus === 'S' ? 'Posted' : 'Processed',
                remarks: newRawStatus === 'S'
                  ? `Posted to FI${sapResponse.Belnr ? ` (doc ${sapResponse.Belnr}/${sapResponse.Gjahr || ''})` : ''}.`
                  : 'Payment processing updated.',
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

  // Admin search — Zview='ADMIN' restricts the GET to rows this admin PERNR is allowed to see.
  // Only ClaimId, LoginId, Zview are filterable server-side today; EmpId/EmpName/Status/
  // CostCenter need a backend metadata change first (open prerequisite) — the admin page itself
  // discloses this and only wires up the ClaimId criterion for now.
  const adminSearchClaims = async (adminLoginId: string, criteria: { claimId?: string }): Promise<ExpenseClaim[]> => {
    const parts = [`Zview eq 'ADMIN'`, `LoginId eq '${adminLoginId}'`];
    if (criteria.claimId) parts.push(`ClaimId eq '${criteria.claimId}'`);
    const filter = encodeURIComponent(parts.join(' and '));
    const response = await sapClient.get(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Admin claim search failed';
      throw new Error(errMsg);
    }
    const sapClaims = extractSapResults(response.data);
    return sapClaims.map((sap: any) => mapSapClaimToExpenseClaim(sap, expenseTypes));
  };

  // Admin reject — same ApprovalRequired='R' shape as rejectClaim/rejectClaimFinance, plus the
  // Zview flag that tells SAP this is the admin path (works on any open claim, any employee,
  // including those who've left). Routes through the same ClaimHeaderSet POST helper since it's
  // the same entity every other write here uses.
  const adminRejectClaim = async (claimId: string, adminLoginId: string, reason: string) => {
    const putData = {
      ClaimId: claimId,
      LoginId: adminLoginId,
      Zview: 'ADMIN',
      ApprovalRequired: 'R',
      RejReason: reason,
    };
    return postClaimHeaderUpdate(putData, 'Admin reject failed');
  };

  // DOA Chain Maintenance — new DoaChainSet entity. Likely can't be written/filtered yet (SEGW
  // Creatable/Updatable/Filterable flags are off, transport EDSK9B0EN3 must land before
  // EDSK9B0EMX) — these calls are wired up ready for when that lands; expect failures until then.
  const fetchDoaChain = async (doaCtype: string, kostl: string): Promise<DoaChainRow[]> => {
    const filter = encodeURIComponent(`DoaCtype eq '${doaCtype}' and Kostl eq '${kostl.toUpperCase()}'`);
    const response = await sapClient.get(`${SAP_BASE_URL}/DoaChainSet?$filter=${filter}&$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Failed to fetch DOA chain';
      throw new Error(errMsg);
    }
    return extractSapResults(response.data) as DoaChainRow[];
  };

  const createDoaChainRow = async (row: DoaChainRow, adminPernr: string): Promise<DoaChainRow> => {
    const postData = { ...row, Aenam: adminPernr };
    const response = await sapClient.post(`${SAP_BASE_URL}/DoaChainSet`, postData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return handleSapWriteResponse(response, 'Failed to create DOA chain row') as DoaChainRow;
  };

  // PUT must resend every field (whole-row replace); key fields can't change. If SAP's gateway
  // rejects PUT-with-key-predicates the same way it does for ClaimHeaderSet (see
  // postClaimHeaderUpdate's comment), fall back to POST.
  const updateDoaChainRow = async (row: DoaChainRow, adminPernr: string): Promise<DoaChainRow> => {
    const putData = { ...row, Aenam: adminPernr };
    const keyUrl = `DoaChainSet(DoaCtype='${row.DoaCtype}',Kostl='${row.Kostl}',Expgrp='${row.Expgrp}',AmtFrom=${row.AmtFrom.toFixed(2)}M,Seqno='${row.Seqno}')`;
    let response = await sapClient.put(`${SAP_BASE_URL}/${keyUrl}`, putData, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.status === 405) {
      response = await sapClient.post(`${SAP_BASE_URL}/DoaChainSet`, putData, {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handleSapWriteResponse(response, 'Failed to update DOA chain row');
  };

  // There is no real delete — "removing" an approver row means marking it inactive with a
  // ValidTo date, per spec.
  const deactivateDoaChainRow = async (row: DoaChainRow, adminPernr: string, validTo: string): Promise<DoaChainRow> =>
    updateDoaChainRow({ ...row, Active: false, ValidTo: validTo }, adminPernr);

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
          // Under the DOA chain, a level can have parallel approvers (rule O: any one closes it,
          // rule A: all must approve) and SAP only ever returns ONE CurrentApprover PERNR even
          // then - so this user can be a valid pending approver for a claim without being the
          // single value c.currentApprover happens to hold. fetchClaims() already scopes `claims`
          // to `LoginId eq <me>` server-side, i.e. SAP has already decided this claim is waiting
          // on this user at their level; re-checking currentApprover here would wrongly drop
          // exactly the parallel-approver case the DOA chain introduces. Status is still the
          // right local check: only N/A claims are still open at some approval level.
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

        // Filter by status - 'Pending Pay' is a synthetic combined status (not a real SAP status)
        // matching the Dashboard KPI card of the same name, covering both claims sitting at
        // Finance review and claims already Parked awaiting payment release.
        if (status && status !== 'All') {
          if (status === 'Pending Pay') {
            if (c.status !== 'Pending at finance' && c.status !== 'Pending Release') return false;
          } else if (c.status !== status) return false;
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
        adminSearchClaims,
        adminRejectClaim,
        fetchDoaChain,
        createDoaChainRow,
        updateDoaChainRow,
        deactivateDoaChainRow,
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
