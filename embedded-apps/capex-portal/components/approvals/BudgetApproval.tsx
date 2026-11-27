'use client';
import Link from 'next/link';
import { get, list, odataKey } from '@/lib/api';
import { fmtDate, inLakhs, num, rupees, statusLabel, statusTone } from '@/lib/format';
import type { Budget, BudgetCashFlow, BudgetItem } from '@/lib/entities';
import { useSession } from '@/lib/session';
import { listDocuments, type CapexDocument } from '@/lib/documents';
import DocActions from '@/components/documents/DocActions';
import { Button, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { useBudgetOptions } from '@/components/budget/useOptions';
import { textOf } from '@/components/budget/logic';
import { act } from './actions';
import DecisionBar, { type DecisionAction } from './DecisionBar';
import { Hero, Metric, Section, dash, irrText, paybackText } from './Parts';
import Timeline, { useApprovalChain } from './Timeline';
import { DEFAULT_COMMENT_MIN, buildCashFlowRows, canActOn, nextRole } from './logic';
import { useDoc } from './useDoc';

interface Bundle { budget: Budget; items: BudgetItem[]; flows: BudgetCashFlow[]; docs: CapexDocument[] }

async function load(id: string): Promise<Bundle | null> {
  const budget = await get<Budget>(`BudgetSet${odataKey(id)}`);
  if (!budget) return null;
  const [items, flows, docs] = await Promise.all([
    list<BudgetItem>(`BudgetSet${odataKey(id)}/BudgetToItems`).then((r) => r.rows).catch(() => [] as BudgetItem[]),
    list<BudgetCashFlow>(`BudgetSet${odataKey(id)}/BudgetToCashFlows`).then((r) => r.rows).catch(() => [] as BudgetCashFlow[]),
    listDocuments('BUD', id).catch(() => [] as CapexDocument[]),
  ]);
  return { budget, items: items.sort((a, b) => Number(a.Itemno) - Number(b.Itemno)), flows: flows.sort((a, b) => Number(a.Yearnr) - Number(b.Yearnr)), docs };
}

export default function BudgetApproval({ id }: { id: string }) {
  const s = useSession();
  const { classifications, departments } = useBudgetOptions();
  const { data, loading, error, reload, tick } = useDoc(id, () => load(id));
  const b = data?.budget;
  const { chain, loading: chainLoading } = useApprovalChain('BUD', id, b?.Doaid ?? '', b?.CurrLevel ?? '', b?.Status ?? '', tick);

  const back = { href: '/approvals/', label: 'My Approvals' };
  if (loading && !data) return <><PageHeader title={id} back={back} /><Spinner /></>;
  if (error) return <><PageHeader title={id} back={back} /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data || !b) return <><PageHeader title={id} back={back} /><ErrorBox message={`${id} was not found, or you do not have access to it.`} /></>;

  const { items, flows, docs } = data;
  const canAct = canActOn(b, s);
  const min = s.cfgNum('COMMENT_MIN_CHARS', DEFAULT_COMMENT_MIN);
  const metricsOn = b.MetricsOn === 'X';
  const rows = buildCashFlowRows(flows.map((f) => num(f.Amount)), num(b.HurdleRate), num(b.Investment));
  const itemsTotal = items.reduce((n, i) => n + num(i.Amount), 0);
  const raisedBy = b.SubmittedByName || b.SubmittedBy;
  const { final, next } = nextRole(chain);
  const classificationText = textOf(classifications, b.Classification || '');
  const departmentText = textOf(departments, b.Department || '');
  const heroLine = [`${b.PlantName} · ${b.Capextype}`, classificationText, departmentText, `raised by ${raisedBy}`].filter(Boolean).join(' · ');

  const actions: DecisionAction[] = [
    { key: 'reject', label: 'Reject', variant: 'danger', commentRequired: true, requiredVerb: 'reject a budget', confirmLabel: 'Reject', confirmTitle: 'Reject budget',
      confirmText: `Reject budget ${id} and return it to ${raisedBy}?`,
      run: async (c) => { await act('RejectDocument', { DocType: 'BUD', DocId: id, Comment: c }); return `Budget ${id} rejected.`; } },
    { key: 'approve', label: 'Approve', variant: 'success', confirmLabel: 'Approve', confirmTitle: 'Approve budget',
      confirmText: final ? 'This is the final approval. On confirming, the SAP Internal Order will be created automatically.' : next ? `Approve and route to ${next}?` : `Approve budget ${id} and route it to the next DOA level?`,
      run: async (c) => { await act('ApproveDocument', { DocType: 'BUD', DocId: id, Comment: c || 'Approved.' }); return final ? `Budget ${id} approved. The SAP Internal Order is being created.` : next ? `Budget ${id} approved and routed to ${next}.` : `Budget ${id} approved and routed to the next level.`; } },
  ];

  return (
    <>
      <PageHeader title="Budget Approval" back={back} />
      <Hero id={b.Budgetid} title={b.Title} line={heroLine}
        amountLabel="Budget Amount" amount={inLakhs(b.AmtApproved)} badge={{ tone: statusTone(b.Status), text: statusLabel(b.Status) }} />

      <Section title="Approval Chain">
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <Metric label="Current Level" value={dash(b.CurrLevel)} />
          <Metric label="DOA Chain" value={dash(b.Doaid)} />
          <Metric label="Submitted On" value={fmtDate(b.SubmittedOn)} />
        </div>
        <Timeline chain={chain} loading={chainLoading} />
      </Section>

      <Section title="Justification"><p className="whitespace-pre-line text-[12.5px]">{dash(b.Justification)}</p></Section>

      {items.length > 0 && (
        <Section title="Budget Items">
          <div className="scroll-glass overflow-x-auto">
            <table className="glass-table w-full min-w-[480px] border-separate border-spacing-0 text-[12px]">
              <thead><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2 text-right">Amount</th><th className="hidden px-3 py-2 text-left md:table-cell">Remarks</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.Itemno}>
                    <td className="border-b border-sap-line px-3 py-2">{i.Itemno}</td><td className="border-b border-sap-line px-3 py-2">{i.ItemTitle}</td>
                    <td className="border-b border-sap-line px-3 py-2 text-right">{inLakhs(i.Amount)}</td><td className="hidden border-b border-sap-line px-3 py-2 md:table-cell">{dash(i.Remarks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-sap-muted">{rupees(itemsTotal)} ({items.length} item{items.length === 1 ? '' : 's'})</p>
        </Section>
      )}

      <Section title="Attachments">
        {docs.length === 0 ? <p className="text-[12px] text-sap-muted">No documents attached.</p> : (
          <ul className="divide-y divide-sap-line text-[12px]">
            {docs.map((d) => (
              <li key={`${d.Doctype}${d.Docseq}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0"><b>{d.DocTitle || d.Filename}</b><span className="text-sap-muted"> · {d.CategoryText || d.Category}{d.SizeText ? ` · ${d.SizeText}` : ''}{fmtDate(d.UploadedOn) !== '-' ? ` · ${fmtDate(d.UploadedOn)}` : ''}</span></span>
                <DocActions doc={d} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Financial Metrics">
        {!metricsOn ? (
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">Financial metrics are not enabled for this budget.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Metric label="IRR" value={irrText(b.Irr)} foot={`hurdle ${num(b.HurdleRate).toFixed(1)}%`} />
              <Metric label="NPV" value={b.Npv === '' || isNaN(Number(b.Npv)) ? '—' : inLakhs(b.Npv)} />
              <Metric label="Payback" value={paybackText(b.Payback)} />
            </div>
            <h3 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Cash flows</h3>
            <div className="scroll-glass overflow-x-auto">
              <table className="glass-table w-full min-w-[420px] border-separate border-spacing-0 text-[12px]">
                <thead><tr><th className="px-3 py-2 text-left">Year</th><th className="px-3 py-2 text-right">Net Inflow</th><th className="px-3 py-2 text-right">Discounted</th><th className="px-3 py-2 text-right">Cumulative</th></tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-sap-muted">No cash flows recorded.</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.year}>
                      <td className="border-b border-sap-line px-3 py-2">{r.year}</td><td className="border-b border-sap-line px-3 py-2 text-right">{inLakhs(r.flow)}</td>
                      <td className="border-b border-sap-line px-3 py-2 text-right">{inLakhs(r.discounted)}</td>
                      <td className={`border-b border-sap-line px-3 py-2 text-right font-bold ${r.cumulative >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{inLakhs(r.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {canAct
        ? <DecisionBar actions={actions} commentMin={min} reload={reload} placeholder="Optional for approval. Mandatory when rejecting." />
        : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
            This budget is currently with {dash(b.CurrLevel)} ({statusLabel(b.Status)}). You are viewing it in read-only mode.
            <Link href="/approvals/"><Button className="ml-3">Back to My Approvals</Button></Link>
          </div>
        )}
    </>
  );
}
