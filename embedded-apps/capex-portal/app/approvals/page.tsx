'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useList } from '@/lib/useData';
import { inLakhs, slaState, type SlaState } from '@/lib/format';
import type { ApprovalInbox } from '@/lib/entities';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorBox, Field, Input, Kpi, PageHeader, Select, useToast } from '@/components/ui';
import { act, readLive } from '@/components/approvals/actions';
import ConfirmModal from '@/components/approvals/ConfirmModal';
import InboxTable from '@/components/approvals/InboxTable';
import {
  NO_FILTERS, docIdOf, filterRows, isGenericBackendError, isStale, planBulk, runBudgetBulk, splitByType, summarize,
  type BulkPlan, type InboxFilters, type LiveState,
} from '@/components/approvals/logic';

type LiveRow = LiveState & { Cpeid?: string; Budgetid?: string };
type Kind = 'CPE' | 'BUD';
interface Pending { kind: Kind; plan: BulkPlan; value: number }

const SLA_FROM_QUERY: Record<string, SlaState> = { BREACH: 'breached', breached: 'breached', RISK: 'atRisk', atRisk: 'atRisk', OK: 'onTrack', onTrack: 'onTrack' };

/** My Approvals (Fiori: ApprovalInbox). SAP already limits ApprovalInboxSet to what this person may act on. */
function Inbox() {
  const s = useSession();
  const toast = useToast();
  const params = useSearchParams();
  const inbox = useList<ApprovalInbox>('ApprovalInboxSet');
  // soft "Already Actioned" hint (log #114) - same live lists Fiori cached; the real guard is the per-document re-read at action time
  const cpeLive = useList<LiveRow>('CPESet', { $select: 'Cpeid,Status,CurrLevel' });
  const budLive = useList<LiveRow>('BudgetSet', { $select: 'Budgetid,Status,CurrLevel' });

  const [filters, setFilters] = useState<InboxFilters>({ ...NO_FILTERS, sla: SLA_FROM_QUERY[params.get('sla') || ''] ?? '' });
  const [selCpe, setSelCpe] = useState<Set<string>>(new Set());
  const [selBud, setSelBud] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const guard = useRef(false);

  const warn = s.cfgNum('SLA_WARN_DAYS', 3), breach = s.cfgNum('SLA_BREACH_DAYS', 5);
  const who = useMemo(() => ({ role: s.role, isAdmin: s.isAdmin }), [s.role, s.isAdmin]);

  const all = inbox.rows;
  const summary = useMemo(() => summarize(all, warn, breach), [all, warn, breach]);
  const filtered = useMemo(() => filterRows(all, filters, warn, breach), [all, filters, warn, breach]);
  const { cpe: cpeRows, budget: budRows } = useMemo(() => splitByType(filtered), [filtered]);

  const staleSet = useMemo(() => {
    const out = new Set<string>();
    const mark = (rows: ApprovalInbox[], live: LiveRow[], key: 'Cpeid' | 'Budgetid') => {
      const m = new Map(live.map((l) => [l[key], l]));
      rows.forEach((r) => { const l = m.get(docIdOf(r)); if (l && isStale(l, who)) out.add(docIdOf(r)); }); // unknown rows are not guessed stale
    };
    if (!cpeLive.error && !cpeLive.loading) mark(all.filter((r) => r.Doctype !== 'BUD'), cpeLive.rows, 'Cpeid');
    if (!budLive.error && !budLive.loading) mark(all.filter((r) => r.Doctype === 'BUD'), budLive.rows, 'Budgetid');
    return out;
  }, [all, cpeLive.rows, cpeLive.error, cpeLive.loading, budLive.rows, budLive.error, budLive.loading, who]);

  // selections only ever keep rows still in the inbox (log #23: no stale rows after an action)
  useEffect(() => {
    const ids = new Set(all.map(docIdOf));
    const keep = (p: Set<string>) => { const n = new Set([...p].filter((i) => ids.has(i))); return n.size === p.size ? p : n; };
    setSelCpe(keep); setSelBud(keep);
  }, [all]);

  const reloadAll = useCallback(() => { inbox.reload(); cpeLive.reload(); budLive.reload(); }, [inbox, cpeLive, budLive]);

  const onSelect = (set: (s: Set<string>) => void) => (next: Set<string>, blocked: string[]) => {
    set(next);
    if (blocked.length) toast(`${blocked.join(', ')} ${blocked.length > 1 ? 'are' : 'is'} already actioned and can't be selected.`, 'warning');
  };

  const valueOf = (ids: string[]) => all.filter((r) => ids.includes(docIdOf(r))).reduce((n, r) => n + (Number(r.Amount) || 0), 0);

  /** Pre-check (log #110/#111): fresh per-document read of every selected id, drop what is no longer actionable, then confirm. */
  const startBulk = async (kind: Kind) => {
    const ids = [...(kind === 'CPE' ? selCpe : selBud)];
    if (!ids.length) { toast(`Select at least one ${kind === 'CPE' ? 'CPE' : 'Budget'} to approve.`, 'warning'); return; }
    if (guard.current) return;
    guard.current = true; setBusy(true);
    try {
      const live: Record<string, LiveState | null> = {};
      await Promise.all(ids.map(async (id) => { live[id] = await readLive(kind, id); }));
      const plan = planBulk(ids, live, who);
      if (!plan.valid.length) {
        (kind === 'CPE' ? setSelCpe : setSelBud)(new Set());
        reloadAll();
        toast(`None of the selected ${kind === 'CPE' ? 'CPEs' : 'Budgets'} are still awaiting your approval - the list has been refreshed.`, 'warning');
        return;
      }
      setPending({ kind, plan, value: valueOf(plan.valid) });
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not check the selected documents.', 'error'); }
    finally { guard.current = false; setBusy(false); }
  };

  const confirmBulk = async () => {
    if (!pending || guard.current) return;
    const { kind, plan } = pending;
    guard.current = true; setBusy(true);
    const clear = () => (kind === 'CPE' ? setSelCpe : setSelBud)(new Set());
    try {
      if (kind === 'CPE') {
        // BulkApprove is one batch call; Success/Message from SAP is the real signal (not HTTP 2xx)
        const r = await act('BulkApprove', { CpeIds: plan.valid.join(',') });
        reloadAll(); clear();
        toast(String(r.Message || `${plan.valid.length} CPE${plan.valid.length > 1 ? 's' : ''} approved and routed to the next level.`), 'success');
      } else {
        const res = await runBudgetBulk(plan.valid, who, { readLive: (id) => readLive('BUD', id), approve: async (id) => { await act('ApproveDocument', { DocType: 'BUD', DocId: id, Comment: 'Bulk approved.' }); } });
        reloadAll(); clear();
        const skipped = res.skipped.length ? ` ${res.skipped.join(', ')} already moved on and ${res.skipped.length > 1 ? 'were' : 'was'} skipped.` : '';
        if (res.failed) {
          toast(isGenericBackendError(res.failed.error)
            ? `${res.failed.id} was likely just acted on by someone else - the list has been refreshed.${res.approved.length ? ` ${res.approved.length} approved before it.` : ''}`
            : `Bulk approval stopped at ${res.failed.id}: ${res.failed.error instanceof Error ? res.failed.error.message : 'SAP rejected it.'}${res.approved.length ? ` ${res.approved.length} approved before it.` : ''}`, 'error');
        } else toast(`${res.approved.length} Budget${res.approved.length === 1 ? '' : 's'} approved and routed to the next level.${skipped}`, res.approved.length ? 'success' : 'warning');
      }
    } catch (e) {
      reloadAll(); clear();
      toast(isGenericBackendError(e) ? 'One of these may have already been acted on by someone else - the list has been refreshed.' : `Bulk approval failed. ${e instanceof Error ? e.message : ''}`, isGenericBackendError(e) ? 'warning' : 'error');
    } finally { guard.current = false; setBusy(false); setPending(null); }
  };

  const set = (patch: Partial<InboxFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const tile = (sla: SlaState) => setFilters((f) => ({ ...f, sla }));
  const noun = pending?.kind === 'CPE' ? 'CPE' : 'Budget';
  const n = pending?.plan.valid.length ?? 0;

  return (
    <>
      <PageHeader title="My Approvals" subtitle={`${s.fullName} · ${s.role}`}
        actions={<div className="text-right"><div className="text-[11px] text-white/75">Pending with me</div><div className="font-display text-xl font-extrabold">{summary.count}</div><div className="text-[12px] text-white/75">{inLakhs(summary.value)}</div></div>} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="On Track" value={summary.onTrack} foot={`Within ${warn} days`} tone="success" onClick={() => tile('onTrack')} />
        <Kpi label="At Risk" value={summary.atRisk} foot={`${warn + 1}-${breach} days pending`} tone="warning" onClick={() => tile('atRisk')} />
        <Kpi label="SLA Breached" value={summary.breached} foot={`Over ${breach} days — escalated`} tone="error" onClick={() => tile('breached')} />
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search"><Input type="search" placeholder="Document number or title" value={filters.query} onChange={(e) => set({ query: e.target.value })} /></Field>
          <Field label="SLA">
            <Select value={filters.sla} onChange={(e) => set({ sla: e.target.value as InboxFilters['sla'] })}>
              <option value="">All</option><option value="breached">Breached</option><option value="atRisk">At Risk</option><option value="onTrack">On Track</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="">All</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
            </Select>
          </Field>
          <div><Button onClick={() => setFilters(NO_FILTERS)}>Clear</Button></div>
        </div>
      </Card>

      {inbox.error && <div className="mb-4"><ErrorBox message={inbox.error} onRetry={inbox.reload} /></div>}

      <InboxTable budget={false} title="CPE Approvals" idHeader="CPE Number" titleHeader="Title" amountHeader="Amount" emptyText="No CPEs are waiting for your approval."
        rows={cpeRows} loading={inbox.loading} stale={staleSet} selected={selCpe} onSelect={onSelect(setSelCpe)} myRole={s.role} warn={warn} breach={breach} busy={busy}
        onBulk={() => startBulk('CPE')} onRefresh={() => { reloadAll(); toast('Refreshed', 'info'); }} />
      <InboxTable budget title="Budget Approvals" idHeader="Budget ID" titleHeader="Title" amountHeader="Amount" emptyText="No Budgets are waiting for your approval."
        rows={budRows} loading={inbox.loading} stale={staleSet} selected={selBud} onSelect={onSelect(setSelBud)} myRole={s.role} warn={warn} breach={breach} busy={busy}
        onBulk={() => startBulk('BUD')} onRefresh={() => { reloadAll(); toast('Refreshed', 'info'); }} />

      <ConfirmModal open={!!pending} title={`Bulk approve ${noun}s`} confirmLabel="Approve" busy={busy} onConfirm={confirmBulk} onClose={() => setPending(null)}>
        {pending && (
          <>
            {`Approve ${n} ${noun}${n > 1 ? 's' : ''} totalling ${inLakhs(pending.value)}?\n\n${pending.plan.valid.join(', ')}\n\nEach will move to the next DOA level automatically.`}
            {pending.kind === 'BUD' && ' They are approved one at a time; if one fails, the rest stop so it is clear which one needs attention.'}
            {pending.plan.stale.length > 0 && `\n\n${pending.plan.stale.join(', ')} already moved on and will be skipped.`}
          </>
        )}
      </ConfirmModal>
    </>
  );
}

export default function Page() { return <Suspense fallback={null}><Inbox /></Suspense>; }
