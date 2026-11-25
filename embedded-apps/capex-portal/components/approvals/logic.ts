/**
 * Pure approval-screen logic (no React, no network): inbox filtering/summary, "still actionable" checks (log #110/#111/#114),
 * approval chain building (log #19/#29/#113/#135), bulk-approve planning and the sequential Budget loop (log #109/#110).
 */
import { slaState, type SlaState } from '@/lib/format';
import type { ApprovalInbox, ApprovalStep, DoaChain } from '@/lib/entities';

export type DocType = 'CPE' | 'BUD';
export const DEFAULT_COMMENT_MIN = 10;

// ------------------------------------------------------------------ inbox rows

/** The document id of an inbox row (a BUD row carries the budget id in Cpeid, like Fiori's mapApprovalInboxEntity). */
export const docIdOf = (r: ApprovalInbox): string => (r.Doctype === 'BUD' ? r.Cpeid || r.Budgetid : r.Cpeid) || '';
export const isBudgetRow = (r: ApprovalInbox): boolean => r.Doctype === 'BUD';

export interface InboxFilters { query: string; sla: '' | SlaState; priority: string }
export const NO_FILTERS: InboxFilters = { query: '', sla: '', priority: '' };

/** ApprovalInbox.onFilter: contains(docId|title) AND sla bucket AND priority. (Doc-type split is done by splitByType.) */
export function filterRows(rows: ApprovalInbox[], f: InboxFilters, warn: number, breach: number): ApprovalInbox[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(docIdOf(r).toLowerCase().includes(q) || (r.Title || '').toLowerCase().includes(q))) return false;
    if (f.sla && slaState(r.DaysPending, warn, breach) !== f.sla) return false;
    if (f.priority && r.Priority !== f.priority) return false;
    return true;
  });
}

/** Log #101/#107: the two tables are a permanent split by document type. */
export function splitByType(rows: ApprovalInbox[]): { cpe: ApprovalInbox[]; budget: ApprovalInbox[] } {
  return { cpe: rows.filter((r) => !isBudgetRow(r)), budget: rows.filter(isBudgetRow) };
}

export interface InboxSummary { count: number; value: number; onTrack: number; atRisk: number; breached: number }
export function summarize(rows: ApprovalInbox[], warn: number, breach: number): InboxSummary {
  const s: InboxSummary = { count: rows.length, value: 0, onTrack: 0, atRisk: 0, breached: 0 };
  for (const r of rows) {
    s.value += Number(r.Amount) || 0;
    const st = slaState(r.DaysPending, warn, breach);
    if (st === 'breached') s.breached++; else if (st === 'atRisk') s.atRisk++; else s.onTrack++;
  }
  return s;
}

// ------------------------------------------------------------------ can act / stale

export interface Actor { role: string; isAdmin: boolean }
export interface LiveState { Status?: string; CurrLevel?: string }

const inApproval = (status?: string) => String(status || '').toUpperCase().startsWith('IN_APPROVAL');

/** ApprovalDetail canAct / _isCpeStillApprovable / _isBudgetStillApprovable: IN_APPROVAL, has a level, and it is mine (or I am admin). */
export function canActOn(doc: LiveState | null | undefined, who: Actor): boolean {
  return !!doc && inApproval(doc.Status) && !!doc.CurrLevel && (who.isAdmin || who.role === doc.CurrLevel);
}

/** "Already Actioned" (log #114): the live record is gone, or is no longer actionable by this person. */
export const isStale = (live: LiveState | null | undefined, who: Actor): boolean => !canActOn(live, who);

// ------------------------------------------------------------------ comment

export function commentError(comment: string, min: number, what: string): string {
  return comment.trim().length >= min ? '' : `A comment of at least ${min} characters is required to ${what}.`;
}

// ------------------------------------------------------------------ approval chain

export type StepStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'HOLD' | 'WAITING';
export interface ChainStep { level: number; role: string; approver: string; status: StepStatus; actedOn: string; comment: string; slaDays: number }

/** Log #135: "Unit Technical *" is the evaluation step, not an approval level. */
export const isUnitTechnicalRole = (role: string | null | undefined): boolean => /^\s*unit\s+technical/i.test(role || '');

/** Drop Unit Technical rows and renumber, so no gap (1,3,4) shows. */
export function skipUnitTechnical<T extends { role: string; level: number }>(chain: T[]): T[] {
  return chain.filter((s) => !isUnitTechnicalRole(s.role)).map((s, i) => ({ ...s, level: i + 1 }));
}

/**
 * Chain from the DOA rule's steps (DoaChainSet), compared to the document's live CurrLevel (ApprovalDetail._buildLiveChain):
 * before the current role = APPROVED, the current role = PENDING, after = WAITING; an APPROVED document marks every step done.
 * No truncation: 7-8 step chains render in full.
 */
export function buildDoaChain(chain: DoaChain[], currLevel: string, status: string): ChainStep[] {
  const steps = [...chain].sort((a, b) => Number(a.Seqnr) - Number(b.Seqnr));
  const final = String(status || '').toUpperCase().startsWith('APPROVED');
  const cur = steps.findIndex((s) => s.Role === currLevel);
  const rows: ChainStep[] = steps.map((s, i) => ({
    level: i + 1, role: s.Role, approver: s.ApproverName || s.Approver || '', actedOn: '', comment: '', slaDays: Number(s.SlaDays) || 0,
    status: final || (cur > -1 && i < cur) ? 'APPROVED' : i === cur ? 'PENDING' : 'WAITING',
  }));
  return skipUnitTechnical(rows);
}

/** Real steps (ApprovalStepSet / CPEToApprovalSteps): newest cycle only, with who/when/comment. */
export function buildStepChain(steps: ApprovalStep[]): ChainStep[] {
  if (!steps.length) return [];
  const cycle = steps.reduce((m, s) => (String(s.Cyclenr) > m ? String(s.Cyclenr) : m), '');
  const rows = steps
    .filter((s) => String(s.Cyclenr) === cycle)
    .sort((a, b) => Number(a.Levelnr) - Number(b.Levelnr))
    .map<ChainStep>((s, i) => {
      const st = String(s.Status || '').toUpperCase();
      const status: StepStatus = st.startsWith('APPR') ? 'APPROVED' : st.startsWith('REJ') ? 'REJECTED' : st.startsWith('HOLD') ? 'HOLD'
        : s.IsCurrent === 'X' || st.startsWith('PEND') ? 'PENDING' : 'WAITING';
      return { level: i + 1, role: s.Role, approver: s.ApproverName || s.Approver || '', status, actedOn: s.ActedOn || '', comment: s.Comments || '', slaDays: Number(s.SlaDays) || 0 };
    });
  return skipUnitTechnical(rows);
}

/** Prefer real steps when SAP has them; otherwise the DOA-derived chain. */
export function chooseChain(steps: ChainStep[], doa: ChainStep[]): ChainStep[] {
  return steps.length ? steps : doa;
}

export const pendingIndex = (chain: ChainStep[]): number => chain.findIndex((s) => s.status === 'PENDING');

/** Role the document goes to after this approval, or null when this is the final approval. Unknown position = null-safe "next level". */
export function nextRole(chain: ChainStep[]): { final: boolean; next: string } {
  const i = pendingIndex(chain);
  if (i < 0) return { final: false, next: '' };
  return i === chain.length - 1 ? { final: true, next: '' } : { final: false, next: chain[i + 1].role };
}

// ------------------------------------------------------------------ budget cash flows

export interface CashFlowRow { year: string; flow: number; discounted: number; cumulative: number }
/** BudgetApprovalDetail._buildCashFlowRows: discount at the hurdle rate, running total from -|investment|. */
export function buildCashFlowRows(flows: number[], hurdleRatePct: number, investment: number): CashFlowRow[] {
  const r = (Number(hurdleRatePct) || 0) / 100;
  let cum = -Math.abs(Number(investment) || 0);
  return flows.map((cf, i) => {
    const flow = Number(cf) || 0;
    const discounted = flow / Math.pow(1 + r, i + 1);
    cum += discounted;
    return { year: `Year ${i + 1}`, flow, discounted, cumulative: cum };
  });
}

// ------------------------------------------------------------------ vendors

export interface VendorLike { Ranking: string; Selected: string; QuoteAmt: string; Totalcost: string }
/** ApprovalDetail._calcSavingVsL1: >0 saving, <0 premium over L1, 0 when selected is L1 or unknown. */
export function savingVsL1(vendors: VendorLike[]): number {
  const sel = vendors.find((v) => v.Selected === 'X');
  const l1 = vendors.find((v) => v.Ranking === 'L1');
  if (!sel || !l1 || sel === l1) return 0;
  const cost = (v: VendorLike) => Number(v.Totalcost) || Number(v.QuoteAmt) || 0;
  return cost(l1) - cost(sel);
}

// ------------------------------------------------------------------ bulk approve

export interface BulkPlan { valid: string[]; stale: string[] }
/** Split selected ids by a fresh live read (log #110/#111). `live` maps id -> live state (missing/null = gone). */
export function planBulk(ids: string[], live: Record<string, LiveState | null | undefined>, who: Actor): BulkPlan {
  const valid = ids.filter((id) => canActOn(live[id], who));
  return { valid, stale: ids.filter((id) => !valid.includes(id)) };
}

export interface BudgetBulkResult { approved: string[]; skipped: string[]; failed?: { id: string; error: unknown } }
export interface BudgetBulkDeps {
  /** fresh read of the document's live state, immediately before acting on it */
  readLive: (id: string) => Promise<LiveState | null>;
  approve: (id: string) => Promise<void>;
}
/**
 * Log #109/#110: loop ApproveDocument one Budget at a time. Before EACH call re-read the live row and skip (and report) anything
 * already actioned; stop at the first real failure so it is clear which one needs attention (no Promise.all).
 */
export async function runBudgetBulk(ids: string[], who: Actor, deps: BudgetBulkDeps): Promise<BudgetBulkResult> {
  const out: BudgetBulkResult = { approved: [], skipped: [] };
  for (const id of ids) {
    try {
      if (!canActOn(await deps.readLive(id), who)) { out.skipped.push(id); continue; }
      await deps.approve(id);
      out.approved.push(id);
    } catch (error) {
      out.failed = { id, error };
      break;
    }
  }
  return out;
}

/** The gateway's catch-all text (log #1 / #110): used to soften a race with another approver into a calm message. */
export const isGenericBackendError = (e: unknown): boolean => /unknown internal server error/i.test(e instanceof Error ? e.message : String(e ?? ''));
