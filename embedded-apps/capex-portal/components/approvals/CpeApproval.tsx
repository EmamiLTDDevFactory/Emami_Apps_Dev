'use client';
import Link from 'next/link';
import { get, list, odataKey } from '@/lib/api';
import { balanceTone, fmtDate, inLakhs, irrTone, npvTone, num, paybackTone, slaLabel, slaState, slaTone, statusLabel } from '@/lib/format';
import type { Budget, CPE, Vendor } from '@/lib/entities';
import { listDocuments, type CapexDocument } from '@/lib/documents';
import DocActions from '@/components/documents/DocActions';
import { useSession } from '@/lib/session';
import { Button, Chip, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { act } from './actions';
import DecisionBar, { type DecisionAction } from './DecisionBar';
import { Hero, Metric, Section, dash, irrText, paybackText } from './Parts';
import Timeline, { useApprovalChain } from './Timeline';
import { DEFAULT_COMMENT_MIN, canActOn, nextRole, savingVsL1 } from './logic';
import { useDoc } from './useDoc';

interface Bundle { cpe: CPE; vendors: Vendor[]; docs: CapexDocument[]; budget: Budget | null }

async function load(id: string): Promise<Bundle | null> {
  const cpe = await get<CPE>(`CPESet${odataKey(id)}`);
  if (!cpe) return null;
  const [vendors, docs, budget] = await Promise.all([
    list<Vendor>(`CPESet${odataKey(id)}/CPEToVendors`).then((r) => r.rows).catch(() => [] as Vendor[]),
    listDocuments('CPE', id).catch(() => [] as CapexDocument[]),
    cpe.Budgetid ? get<Budget>(`BudgetSet${odataKey(cpe.Budgetid)}`).catch(() => null) : Promise.resolve(null),
  ]);
  return { cpe, vendors: vendors.sort((a, b) => String(a.Ranking).localeCompare(String(b.Ranking))), docs, budget };
}

export default function CpeApproval({ id }: { id: string }) {
  const s = useSession();
  const { data, loading, error, reload, tick } = useDoc(id, () => load(id));
  const cpe = data?.cpe;
  const { chain, loading: chainLoading } = useApprovalChain('CPE', id, cpe?.Doaid ?? '', cpe?.CurrLevel ?? '', cpe?.Status ?? '', tick);

  const back = { href: '/approvals/', label: 'My Approvals' };
  if (loading && !data) return <><PageHeader title={id} back={back} /><Spinner /></>;
  if (error) return <><PageHeader title={id} back={back} /><ErrorBox message={error} onRetry={reload} /></>;
  if (!data || !cpe) return <><PageHeader title={id} back={back} /><ErrorBox message={`${id} was not found, or you do not have access to it.`} /></>;

  const { vendors, docs, budget } = data;
  const canAct = canActOn(cpe, s);
  const warn = s.cfgNum('SLA_WARN_DAYS', 3), breach = s.cfgNum('SLA_BREACH_DAYS', 5);
  const sla = slaState(cpe.DaysPending, warn, breach);
  const min = s.cfgNum('COMMENT_MIN_CHARS', DEFAULT_COMMENT_MIN);

  const approved = num(budget?.AmtApproved), committed = num(budget?.AmtCommitted), spent = num(budget?.AmtSpent);
  const available = approved - committed - spent;
  const amount = num(cpe.Amount);
  const pct = (v: number) => (approved ? Math.max(0, Math.min(100, (v / approved) * 100)) : 0);
  const saving = vendors.length ? savingVsL1(vendors) : num(cpe.SavingVsL1);
  const { final, next } = nextRole(chain);
  const irr = cpe.Irr === '' ? null : Number(cpe.Irr), npv = cpe.Npv === '' ? null : Number(cpe.Npv), pb = cpe.Payback === '' ? null : Number(cpe.Payback);
  const raisedBy = cpe.CreatedByName || cpe.CreatedBy;

  const actions: DecisionAction[] = [
    { key: 'rollout', label: 'Rollout', variant: 'secondary', confirmLabel: 'Flag rollout', confirmTitle: 'Capex rollout',
      confirmText: `Mark ${id} for capex rollout?\n\nThe CPE is approved at this level and flagged for rollout to other units. It continues through the remaining DOA levels.`,
      run: async (c) => { await act('RolloutCPE', { CpeId: id, Comment: c || 'Marked for capex rollout.' }); return `${id} flagged for capex rollout.`; } },
    { key: 'hold', label: 'Hold', variant: 'secondary', commentRequired: true, requiredVerb: 'place a CPE on hold', confirmLabel: 'Place on hold', confirmTitle: 'Place on hold',
      confirmText: `Place ${id} on hold?\n\n${raisedBy} will be notified and the SLA clock paused until the clarification is provided.`,
      run: async (c) => { await act('HoldCPE', { CpeId: id, Comment: c }); return `${id} placed on hold.`; } },
    { key: 'reject', label: 'Reject', variant: 'danger', commentRequired: true, requiredVerb: 'reject a CPE', confirmLabel: 'Reject', confirmTitle: 'Reject CPE',
      confirmText: `Reject ${id} and return it to ${raisedBy}?\n\nThe committed amount will be released back to budget ${cpe.Budgetid}.`,
      run: async (c) => { await act('RejectCPE', { CpeId: id, Comment: c }); return `${id} rejected and returned to the initiator.`; } },
    { key: 'approve', label: 'Approve', variant: 'success', confirmLabel: 'Approve', confirmTitle: 'Approve CPE',
      confirmText: final ? 'This is the final approval. On confirming, the SAP Internal Order and CWIP will be created automatically.' : next ? `Approve and route to ${next}?` : `Approve ${id} and route it to the next DOA level?`,
      run: async (c) => { await act('ApproveCPE', { CpeId: id, Comment: c || 'Approved.' }); return final ? `${id} approved. The SAP Internal Order and CWIP are being created.` : next ? `${id} approved and routed to ${next}.` : `${id} approved and routed to the next level.`; } },
  ];

  return (
    <>
      <PageHeader title="Approval" back={back} />
      <Hero id={cpe.Cpeid} title={cpe.Title} line={`${cpe.PlantName} · ${cpe.CategoryText || cpe.Category} · raised by ${raisedBy}`}
        amountLabel="CPE Amount" amount={inLakhs(cpe.Amount)} badge={{ tone: slaTone(sla), text: slaLabel(cpe.DaysPending, warn, breach) }} />

      <Section title="Budget Position">
        <div className="mb-3 flex items-center justify-between text-[12px]">
          <span className="text-sap-muted">Budget</span>
          {cpe.Budgetid ? <Link className="font-bold text-plum underline" href={`/budget/detail/?id=${encodeURIComponent(cpe.Budgetid)}`}>{cpe.Budgetid}</Link> : <span>-</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Metric label="Total Budget" value={inLakhs(approved)} />
          <Metric label="Allocated" value={inLakhs(committed)} />
          <Metric label="Spent" value={inLakhs(spent)} />
          <Metric label="Balance" value={inLakhs(available)} tone={balanceTone(available) === 'success' ? 'good' : 'bad'} />
        </div>
        <div role="img" aria-label="Budget position" className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[#E7EAF8]">
          <div className="bg-purple-500" style={{ width: `${pct(spent)}%` }} /><div className="bg-teal-500" style={{ width: `${pct(committed)}%` }} />
        </div>
        <p className={`mt-3 rounded-md border px-3 py-2 text-[12px] font-semibold ${amount <= available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {amount <= available
            ? `This CPE of ${inLakhs(amount)} is fully covered. Balance after approval: ${inLakhs(available - amount)}.`
            : `This CPE of ${inLakhs(amount)} exceeds the available balance of ${inLakhs(available)}. Shortfall ${inLakhs(amount - available)} — a budget increase or common pool draw is required.`}
        </p>
      </Section>

      <Section title="Vendor Comparison">
        <div className="scroll-glass overflow-x-auto">
          <table className="glass-table w-full min-w-[520px] border-separate border-spacing-0 text-[12px]">
            <thead><tr><th className="px-3 py-2 text-left">Rank</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-right">Quote</th><th className="px-3 py-2 text-right">Delivery</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {vendors.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sap-muted">No quotes recorded.</td></tr>}
              {vendors.map((v) => (
                <tr key={v.Vendorseq} className={v.Selected === 'X' ? 'bg-emerald-50/60' : ''}>
                  <td className="border-b border-sap-line px-3 py-2">{v.Ranking === 'L1' ? <Chip tone="info">L1</Chip> : v.Ranking || '-'}</td>
                  <td className="border-b border-sap-line px-3 py-2">{v.Vendorname}</td>
                  <td className="border-b border-sap-line px-3 py-2 text-right">{inLakhs(v.QuoteAmt)}</td>
                  <td className="border-b border-sap-line px-3 py-2 text-right">{v.DeliveryDays} d</td>
                  <td className="border-b border-sap-line px-3 py-2 text-right">{v.Selected === 'X' && <Chip tone="success">Selected</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cpe.Nonl1Justif && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px]">
            <b className="text-amber-800">Non-L1 vendor selected — justification on record</b>
            <p className="mt-1 text-sap-ink">{cpe.Nonl1Justif}</p>
            {saving !== 0 && <p className="mt-1 text-[11px] text-sap-muted">{saving > 0 ? `Net saving against L1: ${inLakhs(saving)}` : `Premium over L1: ${inLakhs(Math.abs(saving))}`}</p>}
          </div>
        )}
      </Section>

      {cpe.MetricsOn === 'X' && (
        <Section title="Financial Metrics">
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="IRR" value={irrText(cpe.Irr)} foot={`hurdle ${num(cpe.HurdleRate).toFixed(1)}%`} tone={irrTone(irr)} />
            <Metric label="NPV" value={npv === null || isNaN(npv) ? '—' : inLakhs(npv)} tone={npvTone(npv)} />
            <Metric label="Payback" value={paybackText(cpe.Payback)} tone={paybackTone(pb)} />
          </div>
        </Section>
      )}

      <Section title="Technical Details & Documents">
        <div className="mb-3"><Chip tone={cpe.TechCompliant === 'X' ? 'success' : 'warning'}>{cpe.TechCompliant === 'X' ? 'Technically compliant' : 'Technical sign-off pending'}</Chip></div>
        <dl className="grid gap-3 text-[12px] md:grid-cols-3">
          <div><dt className="font-bold text-sap-muted">Specifications</dt><dd className="whitespace-pre-line">{dash(cpe.Specs)}</dd></div>
          <div><dt className="font-bold text-sap-muted">Terms</dt><dd className="whitespace-pre-line">{dash(cpe.Terms)}</dd></div>
          <div><dt className="font-bold text-sap-muted">Technical remark</dt><dd className="whitespace-pre-line">{dash(cpe.TechRemark)}</dd></div>
        </dl>
        <h3 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Attachments</h3>
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

      <Section title="Approval Chain" hint={`DOA ${dash(cpe.Doaid)} · currently with ${dash(cpe.CurrLevel)} · status ${statusLabel(cpe.Status)}`}>
        <Timeline chain={chain} loading={chainLoading} />
      </Section>

      {canAct
        ? <DecisionBar actions={actions} commentMin={min} reload={reload} placeholder="Optional for approval. Mandatory when rejecting or holding." />
        : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-[12px] text-blue-800">
            This CPE is currently with {dash(cpe.CurrLevel)} ({statusLabel(cpe.Status)}). You are viewing it in read-only mode.
            <Link href="/approvals/"><Button className="ml-3">Back to My Approvals</Button></Link>
          </div>
        )}
    </>
  );
}
