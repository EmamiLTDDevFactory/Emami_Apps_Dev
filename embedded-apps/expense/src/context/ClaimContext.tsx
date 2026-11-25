'use client';

import axios from 'axios';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, SAP_BASE_URL } from '../config/api';
import { AreaCode, Attachment, ClaimKPIs, ClaimStatus, ConfigLogRow, ConfigVarName, ConfigVarRow, DoaChainRow, ExpenseClaim, MobCapRow, MobileMonthItem, SAPError, TaxCode } from '../types';
import { getClaimCreatedTimestamp } from '../utils/claim-date';
import { getHubToken } from '../lib/hubEmailLogin';
import { useAuth } from './AuthContext';

// Authenticated calls to THIS app's own backend (embedded-apps/expense/server) instead of SAP
// directly - used only for the claims/admin routes that backend now gates behind a verified hub
// session (see server/src/middleware/hubAuth.js). Everything else in this file still calls SAP
// directly, same as before; this is a deliberate, incremental move, not a full rewrite.
const expenseApiClient = axios.create({ validateStatus: () => true });
const hubAuthHeaders = () => {
  const token = getHubToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface ClaimContextType {
  claims: ExpenseClaim[];
  errors: SAPError[];
  historyEntries: any[];
  kpis: ClaimKPIs;
  policyLimit: number;
  // Claim Actions
  addClaim: (claimData: Omit<ExpenseClaim, 'id' | 'status' | 'workflowHistory'>, isDraft: boolean, existingClaimId?: string, mobileMonthItems?: MobileMonthItem[]) => Promise<{ success: boolean; warning?: string; claimId?: string }>;
  // Non-CTC: Mobile Exp - best-effort read of this employee's own earlier mobile claims (by EmpId,
  // not the LoginId `claims` is scoped to - LoginId is cleared once a claim moves past them, so an
  // already-approved/posted month would otherwise silently fall off the "already claimed" check).
  // Returns [] on any failure (EmpId isn't confirmed filterable on ClaimHeaderSet yet) rather than
  // blocking the UI - this is a defense-in-depth check layered on top of the local-claims one.
  fetchClaimedMonthsForExpenseType: (expenseTypeId: string) => Promise<string[]>;
  // Non-CTC: Mobile Exp - grade-based monthly cap lookup. Returns null on any failure (best-effort,
  // doesn't block the month card). eligibleAmount is null when NoCap='X' (explicitly uncapped) or
  // CapFound is blank (no cap row found for this grade) - both mean "don't enforce a cap or show a
  // warning", per the backend's EligibilitySet contract.
  fetchEligibility: (empId: string, monthKey: string) => Promise<{ eligibleAmount: number | null; grade?: string; category?: string } | null>;
  // Non-CTC: Mobile Exp, non-sales (Category='NS') above the eligibility cap - lists the HoD(s)
  // flagged in the DOA chain (MBN, slab = claim amount) for the employee's cost centre. Empty
  // array (not an error) when there's nothing to choose - the backend falls back to the
  // supervisor flow in that case.
  fetchHodApprovers: (empId: string, amount: number) => Promise<{ apprId: string; apprName: string; apprEmail: string }[]>;
  updateDraft: (id: string, claimData: Partial<ExpenseClaim>, isDraft: boolean) => { success: boolean; warning?: string };
  deleteClaim: (id: string) => void;
  // Manager Actions
  approveClaim: (id: string) => Promise<{ success: boolean; error?: string }>;
  rejectClaim: (id: string, remarks: string) => Promise<{ success: boolean; error?: string }>;
  requestClarification: (id: string, remarks: string) => void;
  // Finance Actions
  releasePayment: (id: string, taxCode?: string, taxDescription?: string) => Promise<{ success: boolean; error?: string }>;
  fetchTaxes: (claimId: string) => Promise<TaxCode[]>;
  calculateTax: (totalAmount: number, currency: string, mwskz: string) => Promise<{ expenseAmt: number; taxAmt: number } | null>;
  fetchAreas: () => Promise<AreaCode[]>;
  rejectClaimFinance: (id: string, remarks: string) => Promise<{ success: boolean; error?: string }>;
  // Admin Actions (ZEXP_ADMIN) — search any claim, reject any open claim. See lib/adminAccess.ts
  // for how isAdmin is resolved.
  adminSearchClaims: (adminLoginId: string, criteria: { claimId?: string; empId?: string; empName?: string; status?: string; costCenter?: string }) => Promise<ExpenseClaim[]>;
  adminRejectClaim: (claimId: string, adminLoginId: string, reason: string) => Promise<{ Status?: string; Message?: string }>;
  // DOA Chain Maintenance Actions — CRUD against the new DoaChainSet entity.
  fetchDoaChain: (filters?: { doaCtype?: string; kostl?: string; expgrp?: string; amtFrom?: number; active?: boolean }) => Promise<DoaChainRow[]>;
  createDoaChainRow: (row: DoaChainRow, adminPernr: string) => Promise<DoaChainRow>;
  updateDoaChainRow: (row: DoaChainRow, adminPernr: string) => Promise<DoaChainRow>;
  // Mobile Expense Cap Maintenance Actions — CRUD against the new MobCapSet entity.
  fetchMobCaps: (filters?: { mcat?: string; kostl?: string; trfgr?: string; trfst?: string; active?: boolean }) => Promise<MobCapRow[]>;
  createMobCapRow: (row: MobCapRow, adminPernr: string) => Promise<MobCapRow>;
  updateMobCapRow: (row: MobCapRow, adminPernr: string) => Promise<MobCapRow>;
  // Configuration Maintenance Actions — CRUD against the new ConfigVarSet/ConfigLogSet entities,
  // replacing the former STVARV-maintained variables (ZEXP_ADMIN, ZEXP_DOA_ADMIN, ZEXP_FINANCE,
  // ZEXP_EXPTYPE_SET, ZEXP_MOBILE_SET, ZEXP_NON_CTC_GO_LIVE, ZFI_EXPENCE_CLAIM).
  fetchConfigVars: (adminPernr: string, name?: ConfigVarName) => Promise<ConfigVarRow[]>;
  addConfigVar: (row: { Name: ConfigVarName; Low: string; High?: string }, adminPernr: string) => Promise<ConfigVarRow>;
  updateConfigVar: (row: ConfigVarRow, adminPernr: string) => Promise<ConfigVarRow>;
  removeConfigVar: (row: ConfigVarRow, adminPernr: string) => Promise<void>;
  fetchConfigLog: (adminPernr: string, varname?: ConfigVarName) => Promise<ConfigLogRow[]>;
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
          // ExptypeSet is now GL-set-driven (STVARV ZEXP_EXPTYPE_SET) - ZslNo is a running number
          // that can change whenever the set is edited, so it's never a stable key. Saknr (GL
          // account) is the stable identifier, both for list-item identity and as the actual
          // ExpenseType value sent on claim submission below (see selectedSapType.id usage).
          id: item.Saknr || item.ExpenseType || '00001',
          name: item.ZglName || item.Description || item.Exptype || 'Unknown Type',
          saknr: item.Saknr || '',
          // ExptypeSet.Flag = 'X' means this expense type doesn't require a supporting-document
          // attachment to submit — the mandatory-attachment rule (BR-003) is skipped for it.
          noAttachmentRequired: item.Flag === 'X',
          // Same Flag field, different value: blank (neither 'X' nor anything else) means this
          // expense type additionally needs a separate Manager Approved Attachment - currently
          // only true for the "1st Telephone Claim" ExptypeSet record.
          requiresManagerApprovedAttachment: !item.Flag,
          // New field: true for the ~22 mobile/telephone/internet GL accounts on dev - drives the
          // multi-month claim flow in create/page.tsx. Defensively accepts either a real JSON
          // boolean or SAP's XFELD-style 'X' string, same as other boolean-ish OData fields here.
          isMobile: item.IsMobile === true || item.IsMobile === 'X',
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

      // Goes through this app's own backend now, not SAP directly - the server resolves the real
      // LoginId server-side from the verified hub session, so this can't be asked to return a
      // different employee's claims just by changing what's in currentUser client-side.
      const response = await expenseApiClient.get(`${API_BASE_URL}/api/expense/claims`, {
        headers: hubAuthHeaders(),
      });
      if (response.status >= 200 && response.status < 300) {
        const sapClaims = extractSapResults(response.data);
        const mappedClaims: ExpenseClaim[] = sapClaims.map((sap: any) => mapSapClaimToExpenseClaim(sap, expenseTypes));
        // Replace the existing claims with the latest fetched set (clear when SAP returns empty)
        setClaims(mappedClaims);
        return;
      }
      // TEMPORARY fallback (2026-11-24): some real sessions are hitting the backend's hub-token
      // check with a 401 ("jwt malformed") that hasn't been root-caused yet - this silently left
      // the whole claims list empty with no error shown, which is strictly worse than the old
      // behaviour. Only fall back on an auth failure (401/403), and only to the exact same direct
      // SAP call this route replaced, so a working token still gets the hardened path - remove
      // once the real-token issue is found and fixed.
      if (response.status === 401 || response.status === 403) {
        console.warn('[fetchClaims] authenticated route rejected the session, falling back to direct SAP read:', response.data);
        const loginIdForSAP = currentUser.employeeId.replace(/\D/g, '').padStart(8, '0');
        const filter = encodeURIComponent(`LoginId eq '${loginIdForSAP}'`);
        const fallback = await sapClient.get(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
        if (fallback.status < 200 || fallback.status >= 300) return;
        const sapClaims = extractSapResults(fallback.data);
        const mappedClaims: ExpenseClaim[] = sapClaims.map((sap: any) => mapSapClaimToExpenseClaim(sap, expenseTypes));
        setClaims(mappedClaims);
      }
    } catch (err) {
      console.error('Failed to fetch claims:', err);
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
    existingClaimId: string = '',
    mobileMonthItems?: MobileMonthItem[]
  ) => {
    // Non-CTC: Mobile Exp - one CLAIMNAV row per month card, each with its own Amount/
    // ExpenseDate/ReceiptNo, instead of the generic "amount on row 0 only" shape every other
    // expense type uses.
    const isMobilePayload = !!mobileMonthItems && mobileMonthItems.length > 0;

    // 1. Local Validation
    if (!isDraft) {
      if (!claimData.claimDate || !claimData.expenseType || claimData.expenseType === 'Select Expense Type' || !claimData.amount || !claimData.costCenter) {
        return { success: false, warning: 'Please fill in all mandatory fields before submitting.' };
      }
      // BR-003: Mandatory attachment check — normally skipped when the chosen expense type's
      // ExptypeSet record has Flag = 'X' (that type doesn't require a supporting document).
      // Forced to false for now - attachment is mandatory for every expense type until the
      // Flag X rule is revisited. For mobile, each month card's own document is what's checked -
      // claimData.attachments isn't where mobile's documents live.
      const attachmentsOptionalForType = false;
      const attachmentsToValidate: Attachment[] = isMobilePayload ? mobileMonthItems!.map((i) => i.attachment) : (claimData.attachments || []);
      if (!attachmentsOptionalForType && attachmentsToValidate.length === 0) {
        return { success: false, warning: isMobilePayload ? 'Each month needs its invoice document before submitting.' : 'Supporting documents (at least 1 attachment) are mandatory for submitting a claim.' };
      }

      const invalidAttachment = attachmentsToValidate.find((att) => {
        const extension = (att.name?.split('.').pop() || '').toLowerCase();
        const type = (att.type || '').toLowerCase();
        return !ALLOWED_ATTACHMENT_EXTENSIONS.has(extension) || !ALLOWED_ATTACHMENT_MIME_TYPES.has(type);
      });

      if (invalidAttachment) {
        return { success: false, warning: 'Unsupported attachment type. Allowed file types: PDF, PNG, JPG, JPEG, XLS, XLSX, CSV, TXT.' };
      }

      // Second, separate attachment required when the chosen expense type's ExptypeSet.Flag
      // comes back blank - see requiresManagerApprovedAttachment in fetchExpenseTypes above.
      // Applies to mobile too (first mobile claim of a new employee) - this check doesn't branch
      // on isMobilePayload, so it was silently skipped before since mobile never reached addClaim.
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
    // alongside the regular supporting documents as just another CLAIMNAV line/attachment, at
    // Amount 0.000, same convention every claim already uses for its secondary attachment(s).
    const extraZeroAmountAttachments: Attachment[] = [
      ...((claimData as any).managerApprovedAttachments || []),
    ];

    let allAttachments: Attachment[];
    const claimNavItems: any[] = [];

    if (isMobilePayload) {
      mobileMonthItems!.forEach((item, idx) => {
        claimNavItems.push({
          ClaimId: existingClaimId ? existingClaimId : '',
          ItemNo: (idx + 1).toString().padStart(6, '0'),
          // Sent blank per backend instruction - ExpenseType's field facet rejects the GL account
          // number now in selectedSapType.id (e.g. '509412'), and ZslNo is no longer a stable value
          // to send either. Saknr (sent separately below) is the field SAP actually keys off now.
          ExpenseType: '',
          ZglName: selectedSapType ? selectedSapType.name : claimData.expenseType,
          Saknr: selectedSapType ? selectedSapType.saknr : '',
          ExpenseDate: toODataDate(item.expenseDate),
          Amount: item.amount.toFixed(3),
          Currency: 'INR',
          Description: claimData.justification || 'Mobile expense',
          VendorName: claimData.name1 || 'External Vendor',
          ReceiptNo: (item.receiptNo || '').slice(0, 30), // SAP field is C(30)
        });
      });
      extraZeroAmountAttachments.forEach((_, idx) => {
        claimNavItems.push({
          ClaimId: existingClaimId ? existingClaimId : '',
          ItemNo: (mobileMonthItems!.length + idx + 1).toString().padStart(6, '0'),
          // Sent blank per backend instruction - ExpenseType's field facet rejects the GL account
          // number now in selectedSapType.id (e.g. '509412'), and ZslNo is no longer a stable value
          // to send either. Saknr (sent separately below) is the field SAP actually keys off now.
          ExpenseType: '',
          ZglName: selectedSapType ? selectedSapType.name : claimData.expenseType,
          Saknr: selectedSapType ? selectedSapType.saknr : '',
          ExpenseDate: toODataDate(mobileMonthItems![0].expenseDate),
          Amount: '0.000',
          Currency: 'INR',
          Description: claimData.justification || 'Supporting document',
          VendorName: claimData.name1 || 'External Vendor',
        });
      });
      allAttachments = [...mobileMonthItems!.map((i) => i.attachment), ...extraZeroAmountAttachments];
    } else {
      allAttachments = [...(claimData.attachments || []), ...extraZeroAmountAttachments];
      const numAttachments = allAttachments.length > 0 ? allAttachments.length : 1;
      for (let i = 0; i < numAttachments; i++) {
        claimNavItems.push({
          ClaimId: existingClaimId ? existingClaimId : '',
          ItemNo: i === 0 ? (claimData.itemNo || '000001') : (i + 1).toString().padStart(6, '0'),
          // Sent blank per backend instruction - ExpenseType's field facet rejects the GL account
          // number now in selectedSapType.id (e.g. '509412'), and ZslNo is no longer a stable value
          // to send either. Saknr (sent separately below) is the field SAP actually keys off now.
          ExpenseType: '',
          ZglName: selectedSapType ? selectedSapType.name : claimData.expenseType,
          Saknr: selectedSapType ? selectedSapType.saknr : '',
          ExpenseDate: toODataDate(claimData.expenseDate),
          Amount: i === 0 ? claimData.amount.toFixed(3) : '0.000',
          Currency: 'INR',
          Description: claimData.justification || 'Expense',
          VendorName: claimData.name1 || 'External Vendor',
        });
      }
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

    // Non-CTC: Mobile Exp - PeriodFrom/PeriodTo are deliberately NOT sent - optional, and the
    // backend derives them from the month cards' own ExpenseDate values when omitted.
    if (isMobilePayload) {
      // Chosen HoD for a non-sales claim above the eligibility cap, when 2+ candidates exist.
      // Omitted entirely when there's nothing to choose (sales employee, or 0/1 HoD candidates) -
      // the backend errors "Please select the HoD ..." only when a choice was actually required.
      const selAppr = (claimData as any).selAppr;
      if (selAppr) {
        sapPayload.SelAppr = String(selAppr).replace(/\D/g, '').padStart(8, '0').slice(0, 8);
      }
    }

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
      return { success: true, claimId: newId };
    } catch (err: any) {
      const message = err?.message || 'Failed to reach the backend server.';
      const cleanMessage = message.includes('Unexpected token <') ? 'Server returned an invalid response. Please try again.' : message;
      return { success: false, warning: `Failed to reach the backend server. ${cleanMessage}` };
    }
  };

  // Non-CTC: Mobile Exp - reads this employee's own claim history by EmpId (not LoginId, which
  // `claims` is scoped to and which clears once a claim moves past them) to find months already
  // claimed for the given expense type, as a second check layered on top of the local-claims-only
  // one the month picker already does. EmpId filterability on ClaimHeaderSet isn't confirmed yet
  // (same open prerequisite as the Admin search screen's EmpId/EmpName/Status/CostCenter filters),
  // so this fails soft to [] rather than blocking the month picker.
  const fetchClaimedMonthsForExpenseType = async (expenseTypeId: string): Promise<string[]> => {
    if (!currentUser?.employeeId) return [];
    try {
      const empIdNumeric = currentUser.employeeId.replace(/\D/g, '').padStart(8, '0');
      const filter = encodeURIComponent(`EmpId eq '${empIdNumeric}'`);
      const response = await sapClient.get(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
      if (response.status < 200 || response.status >= 300) return [];

      const sapClaims = extractSapResults(response.data);
      const months = new Set<string>();
      sapClaims.forEach((sap: any) => {
        // A rejected claim's month is available again for a fresh claim - only count months from
        // claims that are still live (not R).
        if (sap.Status === 'R') return;
        const navItems = sap.CLAIMNAV?.results || (Array.isArray(sap.CLAIMNAV) ? sap.CLAIMNAV : []);
        navItems.forEach((item: any) => {
          if (item.ExpenseType !== expenseTypeId || !item.ExpenseDate) return;
          const dateStr = item.ExpenseDate as string;
          const ts = dateStr.includes('Date(') ? parseInt(dateStr.replace(/\D/g, ''), 10) : new Date(dateStr).getTime();
          if (!Number.isNaN(ts)) months.add(new Date(ts).toISOString().slice(0, 7));
        });
      });
      return Array.from(months);
    } catch (err) {
      console.warn('[fetchClaimedMonthsForExpenseType] best-effort check failed:', err);
      return [];
    }
  };

  // Non-CTC: Mobile Exp - grade-based monthly eligibility cap. The backend uses the employee's
  // CURRENT grade regardless of which month is asked about - Month only picks the entity key.
  const fetchEligibility = async (empId: string, monthKey: string): Promise<{ eligibleAmount: number | null; grade?: string; category?: string } | null> => {
    try {
      const empIdNumeric = empId.replace(/\D/g, '').padStart(8, '0');
      const yyyymm = monthKey.replace('-', '');
      const url = `${SAP_BASE_URL}/EligibilitySet(EmpId='${empIdNumeric}',Month='${yyyymm}')?$format=json`;
      const response = await sapClient.get(url);
      if (response.status < 200 || response.status >= 300) return null;

      const data = response.data?.d || response.data;
      if (!data) return null;

      // NoCap/CapFound were originally 'X'/blank strings; SAP's gateway now returns them as real
      // Edm.Boolean values instead (confirmed live 2026-11-24: {"NoCap": false, "CapFound": true}),
      // same ambiguity ExptypeSet.IsMobile above already handles - check both forms so this keeps
      // working regardless of which one a given SEGW build sends. CapFound false/blank means no cap
      // row was found for this grade at all (e.g. a grade not in the cap table) - treated the same
      // as an explicit NoCap='X': no limit, no "above eligibility" warning.
      const noCap = data.NoCap === true || data.NoCap === 'X';
      const capFound = data.CapFound === true || data.CapFound === 'X';
      const eligibleAmount = (!capFound || noCap) ? null : (parseFloat(data.EligibleAmount) || 0);

      return { eligibleAmount, grade: data.Grade, category: data.Category };
    } catch (err) {
      console.warn('[fetchEligibility] best-effort check failed:', err);
      return null;
    }
  };

  // Non-CTC: Mobile Exp - HoD choice list for non-sales (Category='NS') claims above the cap.
  // Amount is the OData decimal literal format the backend example gives (e.g. "Amount eq 1200m").
  const fetchHodApprovers = async (empId: string, amount: number): Promise<{ apprId: string; apprName: string; apprEmail: string }[]> => {
    try {
      const empIdNumeric = empId.replace(/\D/g, '').padStart(8, '0');
      const filter = encodeURIComponent(`EmpId eq '${empIdNumeric}' and Amount eq ${amount}m`);
      const response = await sapClient.get(`${SAP_BASE_URL}/HodApproverSet?$filter=${filter}&$format=json`);
      if (response.status < 200 || response.status >= 300) return [];

      const rows = extractSapResults(response.data);
      return rows.map((r: any) => ({ apprId: r.ApprId, apprName: r.ApprName, apprEmail: r.ApprEmail }));
    } catch (err) {
      console.warn('[fetchHodApprovers] best-effort check failed:', err);
      return [];
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
      // Per the DOA handover: there's no park step anymore (H -> posted/S directly), so this no
      // longer asserts 'P' - sending the claim's own current status is a neutral passthrough, not
      // a claimed transition. SAP decides the real outcome server-side regardless (same as
      // approveClaim's sent Status:'A'); the result handling below reads the real returned Status.
      Status: claim.rawStatus || 'H',
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

  // Admin search/reject now go through this app's own backend (embedded-apps/expense/server),
  // not SAP directly - the server independently verifies the caller is a real, currently-admin
  // hub user (resolved server-side from SAP's own LoginSet, not trusted from the client) before it
  // will relay anything to SAP's Zview='ADMIN' path. adminLoginId is kept as a parameter only so
  // existing callers don't need to change - the server ignores it and uses its own verified
  // identity instead. EmpId is sent exactly as typed — the backend pads it with ALPHA itself.
  // EmpName is an exact match server-side (OData eq, not a contains/wildcard search).
  const adminSearchClaims = async (
    adminLoginId: string,
    criteria: { claimId?: string; empId?: string; empName?: string; status?: string; costCenter?: string }
  ): Promise<ExpenseClaim[]> => {
    const params = new URLSearchParams();
    if (criteria.claimId) params.set('claimId', criteria.claimId);
    if (criteria.empId) params.set('empId', criteria.empId);
    if (criteria.status) params.set('status', criteria.status);
    if (criteria.costCenter) params.set('costCenter', criteria.costCenter);
    if (criteria.empName) params.set('empName', criteria.empName);
    const response = await expenseApiClient.get(`${API_BASE_URL}/api/expense/admin/claims?${params.toString()}`, {
      headers: hubAuthHeaders(),
    });
    if (response.status < 200 || response.status >= 300) {
      const errMsg = response.data?.error?.message?.value || response.data?.error || 'Admin claim search failed';
      throw new Error(errMsg);
    }
    const sapClaims = extractSapResults(response.data);
    return sapClaims.map((sap: any) => mapSapClaimToExpenseClaim(sap, expenseTypes));
  };

  // Admin reject — see adminSearchClaims above for why this now goes through our own backend.
  const adminRejectClaim = async (claimId: string, adminLoginId: string, reason: string) => {
    const response = await expenseApiClient.post(
      `${API_BASE_URL}/api/expense/admin/claims/${encodeURIComponent(claimId)}/reject`,
      { reason },
      { headers: hubAuthHeaders() }
    );
    if (response.status < 200 || response.status >= 300) {
      const errMsg = response.data?.error?.message?.value || response.data?.error || 'Admin reject failed';
      throw new Error(errMsg);
    }
    return response.data;
  };

  // DOA Chain Maintenance (SM30-style grid) — new DoaChainSet entity. All filters are optional;
  // no filter at all returns every row, per the SM30 rebuild spec.
  const fetchDoaChain = async (filters?: { doaCtype?: string; kostl?: string; expgrp?: string; amtFrom?: number; active?: boolean }): Promise<DoaChainRow[]> => {
    const parts: string[] = [];
    if (filters?.doaCtype) parts.push(`DoaCtype eq '${filters.doaCtype}'`);
    if (filters?.kostl) parts.push(`Kostl eq '${filters.kostl.toUpperCase()}'`);
    if (filters?.expgrp !== undefined) parts.push(`Expgrp eq '${filters.expgrp}'`);
    if (filters?.amtFrom !== undefined) parts.push(`AmtFrom eq ${filters.amtFrom}M`);
    if (filters?.active !== undefined) parts.push(`Active eq ${filters.active}`);
    const filterQuery = parts.length ? `$filter=${encodeURIComponent(parts.join(' and '))}&` : '';
    const response = await sapClient.get(`${SAP_BASE_URL}/DoaChainSet?${filterQuery}$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Failed to fetch DOA chain';
      throw new Error(errMsg);
    }
    return extractSapResults(response.data) as DoaChainRow[];
  };

  // AmtFrom/AmtTo (Edm.Decimal) must go as fixed-decimal STRINGS, not raw JSON numbers - sending a
  // bare number fails SAP's gateway parser the same way an unformatted MaxAmt does on MobCapSet
  // (CX_SXML_PARSE_ERROR). The composite-key URL already uses .toFixed(2) on the raw row value -
  // this keeps the body payload's own precision consistent with that.
  // ValidFrom/ValidTo must go as SAP's /Date(ms)/ literal on write, same gotcha toODataDate already
  // works around for MobCapSet below - a plain 'YYYY-MM-DD' string fails gateway conversion
  // (CX_SY_CONVERSION_NO_DATE_TIME "Conversion error for property 'ValidFrom'").
  const buildDoaChainPayload = (row: DoaChainRow, adminPernr: string) => ({
    ...row,
    AmtFrom: row.AmtFrom.toFixed(2),
    AmtTo: row.AmtTo.toFixed(2),
    ValidFrom: toODataDate(row.ValidFrom),
    ValidTo: toODataDate(row.ValidTo),
    Aenam: adminPernr,
  });

  const createDoaChainRow = async (row: DoaChainRow, adminPernr: string): Promise<DoaChainRow> => {
    const postData = buildDoaChainPayload(row, adminPernr);
    const response = await sapClient.post(`${SAP_BASE_URL}/DoaChainSet`, postData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return handleSapWriteResponse(response, 'Failed to create DOA chain row') as DoaChainRow;
  };

  // PUT must resend every field (whole-row replace); key fields can't change. If SAP's gateway
  // rejects PUT-with-key-predicates the same way it does for ClaimHeaderSet (see
  // postClaimHeaderUpdate's comment), fall back to POST.
  const updateDoaChainRow = async (row: DoaChainRow, adminPernr: string): Promise<DoaChainRow> => {
    const putData = buildDoaChainPayload(row, adminPernr);
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

  // Mobile Expense Cap Maintenance (SM30-style grid) — new MobCapSet entity, live on dev
  // 2026-11-24. Same optional-filters/no-filter-returns-everything pattern as DoaChainSet.
  const fetchMobCaps = async (filters?: { mcat?: string; kostl?: string; trfgr?: string; trfst?: string; active?: boolean }): Promise<MobCapRow[]> => {
    const parts: string[] = [];
    if (filters?.mcat) parts.push(`Mcat eq '${filters.mcat}'`);
    if (filters?.kostl) parts.push(`Kostl eq '${filters.kostl.toUpperCase()}'`);
    if (filters?.trfgr) parts.push(`Trfgr eq '${filters.trfgr}'`);
    if (filters?.trfst !== undefined) parts.push(`Trfst eq '${filters.trfst}'`);
    if (filters?.active !== undefined) parts.push(`Active eq ${filters.active}`);
    const filterQuery = parts.length ? `$filter=${encodeURIComponent(parts.join(' and '))}&` : '';
    const response = await sapClient.get(`${SAP_BASE_URL}/MobCapSet?${filterQuery}$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Failed to fetch mobile caps';
      throw new Error(errMsg);
    }
    return extractSapResults(response.data) as MobCapRow[];
  };

  // ValidFrom/ValidTo must go as SAP's /Date(ms)/ literal on write - a plain 'YYYY-MM-DD' string
  // silently lands as null, same gotcha toODataDate above already works around for claim fields.
  // MaxAmt (Edm.Decimal) must go as a fixed-decimal STRING, not a raw JSON number - sending a bare
  // number fails SAP's gateway parser (CX_SXML_PARSE_ERROR "Failed to read property 'MaxAmt'"),
  // same reason TotalAmount above is always sent via .toFixed(3), never a raw number.
  const buildMobCapPayload = (row: MobCapRow, adminPernr: string) => ({
    ...row,
    MaxAmt: row.MaxAmt.toFixed(3),
    ValidFrom: toODataDate(row.ValidFrom),
    ValidTo: toODataDate(row.ValidTo),
    Aenam: adminPernr,
  });

  const createMobCapRow = async (row: MobCapRow, adminPernr: string): Promise<MobCapRow> => {
    const postData = buildMobCapPayload(row, adminPernr);
    const response = await sapClient.post(`${SAP_BASE_URL}/MobCapSet`, postData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return handleSapWriteResponse(response, 'Failed to create mobile cap row') as MobCapRow;
  };

  // PUT must resend every field (whole-row replace, including Active); key fields can't change.
  // Falls back to POST if the gateway rejects PUT-with-key-predicates, same as DoaChainSet.
  const updateMobCapRow = async (row: MobCapRow, adminPernr: string): Promise<MobCapRow> => {
    const putData = buildMobCapPayload(row, adminPernr);
    const keyUrl = `MobCapSet(Mcat='${row.Mcat}',Kostl='${row.Kostl}',Trfgr='${row.Trfgr}',Trfst='${row.Trfst}')`;
    let response = await sapClient.put(`${SAP_BASE_URL}/${keyUrl}`, putData, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.status === 405) {
      response = await sapClient.post(`${SAP_BASE_URL}/MobCapSet`, putData, {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return handleSapWriteResponse(response, 'Failed to update mobile cap row');
  };

  // Configuration Maintenance (ConfigVarSet/ConfigLogSet, live on dev 2026-11-24) — replaces the
  // former STVARV variables. Aenam (the logged-in admin's PERNR) is mandatory on every call, same
  // identity mechanism as DoaChainSet/MobCapSet above; the backend returns "Not authorised to
  // maintain the configuration" / "... view the configuration log." for a non-admin.
  const fetchConfigVars = async (adminPernr: string, name?: ConfigVarName): Promise<ConfigVarRow[]> => {
    const parts = [`Aenam eq '${adminPernr}'`];
    if (name) parts.push(`Name eq '${name}'`);
    const filterQuery = `$filter=${encodeURIComponent(parts.join(' and '))}&`;
    const response = await sapClient.get(`${SAP_BASE_URL}/ConfigVarSet?${filterQuery}$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Failed to fetch configuration';
      throw new Error(errMsg);
    }
    return extractSapResults(response.data) as ConfigVarRow[];
  };

  // Numb is backend-assigned on create — never sent.
  const addConfigVar = async (row: { Name: ConfigVarName; Low: string; High?: string }, adminPernr: string): Promise<ConfigVarRow> => {
    const postData = { ...row, Aenam: adminPernr };
    const response = await sapClient.post(`${SAP_BASE_URL}/ConfigVarSet`, postData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return handleSapWriteResponse(response, 'Failed to add configuration line') as ConfigVarRow;
  };

  const updateConfigVar = async (row: ConfigVarRow, adminPernr: string): Promise<ConfigVarRow> => {
    const putData = { ...row, Aenam: adminPernr };
    const keyUrl = `ConfigVarSet(Name='${row.Name}',Numb='${row.Numb}')`;
    const response = await sapClient.put(`${SAP_BASE_URL}/${keyUrl}`, putData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return handleSapWriteResponse(response, 'Failed to update configuration line');
  };

  // There is no DELETE — a line is removed by PUTting it with Remove:true, which the backend
  // answers with 204 No Content (handleSapWriteResponse's 2xx check already tolerates that).
  const removeConfigVar = async (row: ConfigVarRow, adminPernr: string): Promise<void> => {
    const putData = { ...row, Remove: true, Aenam: adminPernr };
    const keyUrl = `ConfigVarSet(Name='${row.Name}',Numb='${row.Numb}')`;
    const response = await sapClient.put(`${SAP_BASE_URL}/${keyUrl}`, putData, {
      headers: { 'Content-Type': 'application/json' },
    });
    handleSapWriteResponse(response, 'Failed to remove configuration line');
  };

  const fetchConfigLog = async (adminPernr: string, varname?: ConfigVarName): Promise<ConfigLogRow[]> => {
    const parts = [`Aenam eq '${adminPernr}'`];
    if (varname) parts.push(`Varname eq '${varname}'`);
    const filterQuery = `$filter=${encodeURIComponent(parts.join(' and '))}&`;
    const response = await sapClient.get(`${SAP_BASE_URL}/ConfigLogSet?${filterQuery}$format=json`);
    if (response.status < 200 || response.status >= 300) {
      const errData = response.data;
      const errMsg = errData?.error?.message?.value || errData?.error || errData?.d?.Message || errData?.Message || 'Failed to fetch configuration log';
      throw new Error(errMsg);
    }
    return extractSapResults(response.data) as ConfigLogRow[];
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
          // Under the DOA chain, a level can have parallel approvers (rule O: any one closes it,
          // rule A: all must approve) and SAP only ever returns ONE CurrentApprover PERNR even
          // then - so this user can be a valid pending approver for a claim without being the
          // single value c.currentApprover happens to hold. fetchClaims() scopes `claims` to
          // `LoginId eq <me>` server-side, but that filter returns every claim this PERNR is
          // associated with in ANY capacity - including their OWN submitted claims still open at
          // someone else's approval level, not only ones actually waiting on this user (confirmed
          // live 2026-11-24: a test account's own open claims, routed to a different approver
          // PERNR, still came back from this fetch and were wrongly shown as pending the viewer's
          // own approval). Re-checking currentApprover would wrongly drop the real parallel-
          // approver case (see above), but excluding the viewer's own claims is always safe -
          // nobody approves their own expense claim, same guard the finance branch below already
          // applies.
          const employeeNumericM = c.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
          const userNumericM = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
          if (currentUser && employeeNumericM === userNumericM) return false;
          if (c.rawStatus !== 'N' && c.rawStatus !== 'A') return false;
        } else if (roleFilter === 'finance') {
          const userNumericF = currentUser?.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';
          const employeeNumeric = c.employeeId?.replace(/\D/g, '').padStart(8, '0') || '';

          if (currentUser) {
            // Finance should see claims that are not their own employee claims.
            if (employeeNumeric === userNumericF) return false;
          }

          // H is the live queue (direct post, no park step); P is legacy-only (claims parked
          // before this change). No role check - whether someone may open the Finance screen at
          // all is decided by the isFinance flag gating the tab/route, not by what this filter
          // returns once they're there.
          if (c.rawStatus !== 'H' && c.rawStatus !== 'P') return false;
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
        // Finance review and claims already awaiting posting.
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
        fetchClaimedMonthsForExpenseType,
        fetchEligibility,
        fetchHodApprovers,
        updateDraft,
        deleteClaim,
        approveClaim,
        rejectClaim,
        requestClarification,
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
        fetchMobCaps,
        createMobCapRow,
        updateMobCapRow,
        fetchConfigVars,
        addConfigVar,
        updateConfigVar,
        removeConfigVar,
        fetchConfigLog,
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
