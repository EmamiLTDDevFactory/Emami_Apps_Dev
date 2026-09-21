// ---------------------------------------------------------------------------
// Journal Entry & GL Anomaly Agent — shared domain types
// ---------------------------------------------------------------------------

export type RiskBand = 'Critical' | 'High' | 'Medium' | 'Low';

export type CaseStatus = 'OPEN' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'CLOSED';

/** One scored journal document (WorklistSet row) — ATOM field mapping per
 * sap/ODATA_API_CONTRACT.md: CompositeScore -> score, RiskBand -> risk, KeySignal -> signal,
 * ScoredAtDate/Time -> scoredAt. */
export interface WorklistEntry {
  document: string;
  companyCode: string;
  fiscalYear?: string;
  period?: number;
  userName: string;
  glPair: string;
  amount: string;
  risk: RiskBand;
  score: number;
  signal: string;
  scoredAt?: string;
}

/** CaseSet row — the governed investigation workflow. Never posts/pays/clears anything in SAP;
 * a case is a work item only (see ODATA_API_CONTRACT.md's write-operations table). */
export interface CaseRecord {
  id: string;
  document: string;
  companyCode: string;
  fiscalYear: string;
  period?: number;
  severity: RiskBand;
  status: CaseStatus;
  disposition: string | null;
  assignedTo: string | null;
  dueAt: string | null;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** DriverSet row — one explainable feature contribution to a document's composite score. */
export interface Driver {
  code: string;
  category: string;
  contribution: number;
}

/** RiskScoreSet + DriverSet combined for one document (GET /journals/{cc}/{fy}/{doc}/explanation). */
export interface Explanation {
  score: number;
  band: RiskBand;
  drivers: Driver[];
}

/** DashboardSet row, pre-aggregated per company code or 'ALL'. */
export interface Summary {
  journals: {
    entriesScored: number;
    flagged: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    avgScore: number;
    scoredLast24h: number;
    lastScoredAt: string | null;
  };
  cases: { openCases: number; overdueCases: number; closedCases: number };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CompanyCodeOption {
  key: string;
  text: string;
}

export interface FilterDraft {
  companyCode: string;
  period: string;
  risk: string;
}
