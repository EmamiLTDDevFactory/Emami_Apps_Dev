'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Card, Button, Chip, Kpi, Tabs, DataTable, Modal, Spinner, ErrorBox, Empty, useAction, type Tone } from '@/components/ui';
import { ApiError, fn, get, isOk, list, odataKey, q } from '@/lib/api';
import type { AuditLog, Budget, BudgetCashFlow, BudgetItem, CPE, DoaRule } from '@/lib/entities';
import { num, fmtInr, fmtInrFull, inLakhs, fmtDate, fmtDateTime, fyLabel, statusLabel, statusTone, orDash, yesNo, irrTone, npvTone, paybackTone, balanceTone, isStatus } from '@/lib/format';
import { resolveDOA } from '@/lib/rules';

interface Loaded { budget: Budget; flows: BudgetCashFlow[]; items: BudgetItem[]; cpes: CPE[]; cpeError: string; audit: AuditLog[]; auditError: string }

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError || e instanceof Error ? e.message : fallback);
const TONE_CLASS = { good: 'text-emerald-700', warn: 'text-amber-700', bad: 'text-red-700', none: 'text-sap-ink' } as const;

export default function BudgetDetail() {
  return <Suspense fallback={<Spinner />}><Inner /></Suspense>;
}

function Inner() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { busy, run } = useAction();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const [confirm, setConfirm] = useState(false);
  const [firstRole, setFirstRole] = useState('Finance');

  const load = useCallback(async () => {
    if (!id) { setError('No budget was selected.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const key = `BudgetSet${odataKey(id)}`;
      const budget = await get<Budget>(key);
      if (!budget) { setError(`Record ${id} could not be found.`); setData(null); return; }
      const [flows, items, cpes, audit] = await Promise.allSettled([
        list<BudgetCashFlow>(`${key}/BudgetToCashFlows`),
        list<BudgetItem>(`${key}/BudgetToItems`),
        list<CPE>(`${key}/BudgetToCPEs`),
        list<AuditLog>('AuditLogSet', { $filter: `Docid eq ${q(id)}` }),
      ]);
      setData({
        budget,
        flows: flows.status === 'fulfilled' ? flows.value.rows.slice().sort((a, b) => a.Yearnr.localeCompare(b.Yearnr)) : [],
        items: items.status === 'fulfilled' ? items.value.rows.slice().sort((a, b) => a.Itemno.localeCompare(b.Itemno)) : [],
        cpes: cpes.status === 'fulfilled' ? cpes.value.rows : [],
        cpeError: cpes.status === 'rejected' ? errMsg(cpes.reason, 'Could not load the linked CPEs.') : '',
        audit: audit.status === 'fulfilled' ? audit.value.rows.filter((a) => a.Docid === id) : [],
        auditError: audit.status === 'rejected' ? errMsg(audit.reason, 'Could not load the audit trail.') : '',
      });
    } catch (e) { setError(errMsg(e, 'Could not load the budget.')); setData(null); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const b = data?.budget;
  const isDraft = !!b && isStatus(b.Status, 'DRAFT');
  const isApproved = !!b && isStatus(b.Status, 'APPROVED');

  // approval route preview for the Submit confirmation (first approver role)
  async function openSubmit() {
    if (!b) return;
    let first = 'Finance';
    try {
      const rules = await list<DoaRule>('DoaRuleSet', { $expand: 'DoaRuleToChain' });
      first = resolveDOA(rules.rows, b.Capextype, num(b.Investment || b.AmtApproved), 'BUD').chain[0]?.role || 'Finance';
    } catch { /* keep the default - SAP routes the real chain on submit anyway */ }
    setFirstRole(first);
    setConfirm(true);
  }

  async function submit() {
    if (!b) return;
    setConfirm(false);
    const ok = await run(async () => {
      const r = await fn('SubmitDocument', { DocType: 'BUD', DocId: b.Budgetid });
      if (!isOk(r)) throw new Error(r.Message || 'Could not submit for approval.');
      return true;
    }, `Budget ${b.Budgetid} submitted. Routed to ${firstRole}.`);
    if (ok) router.push('/budget/');
  }

  if (loading && !data) return <><PageHeader title="Budget Details" back={{ href: '/budget/', label: 'Budgets' }} /><Spinner /></>;
  if (error || !b || !data) return <><PageHeader title="Budget Details" back={{ href: '/budget/', label: 'Budgets' }} /><ErrorBox message={error || 'Budget not found.'} onRetry={load} /></>;

  const approved = num(b.AmtApproved);
  const committed = num(b.AmtCommitted);
  const spent = num(b.AmtSpent);
  const available = approved - committed - spent;
  const pct = (v: number) => (approved ? Math.max(0, Math.min(100, (v / approved) * 100)) : 0);

  return (
    <>
      <PageHeader
        back={{ href: '/budget/', label: 'Budgets' }}
        title={<span className="inline-flex flex-wrap items-center gap-2">{b.Budgetid} <Chip tone={statusTone(b.Status)}>{statusLabel(b.Status)}</Chip></span>}
        subtitle={<>{b.Title}<br />{b.PlantName} {'·'} {b.CategoryText || b.Category} {'·'} {fyLabel(b.Fiscalyear) || b.Fiscalyear}</>}
        actions={<div className="text-right"><div className="text-[11px] text-white/75">Approved</div><div className="font-display text-lg font-extrabold">{inLakhs(approved)}</div>{b.Aufnr && <div className="text-[11px] text-white/75">IO {b.Aufnr}</div>}</div>}
      />

      <div className="glass mb-4 rounded-xl p-4">
        <div role="img" aria-label="Budget position" className="flex h-2.5 w-full overflow-hidden rounded-full bg-[#E6E9F5]">
          <div className="bg-purple-500" style={{ width: `${pct(spent)}%` }} />
          <div className="bg-teal-500" style={{ width: `${pct(committed)}%` }} />
        </div>
        <div className="mt-1.5 flex gap-4 text-[11px] text-sap-muted"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-purple-500" />Spent</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-500" />Committed</span></div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Approved" value={inLakhs(approved)} tone="info" />
        <Kpi label="Committed" value={inLakhs(committed)} foot="Open POs" onClick={() => router.push('/po/')} />
        <Kpi label="Spent" value={inLakhs(spent)} foot="Posted GRNs" onClick={() => router.push('/grn/')} />
        <Kpi label="Available" value={inLakhs(available)} foot="Free to commit" tone={balanceTone(available) as Tone} />
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'details', label: 'Details' }, { id: 'financials', label: 'Financial Evaluation' },
        { id: 'cpes', label: 'Linked CPEs', count: data.cpes.length }, { id: 'audit', label: 'Audit Trail' },
      ]} />

      {tab === 'details' && <DetailsTab b={b} items={data.items} />}
      {tab === 'financials' && <FinancialsTab b={b} flows={data.flows} />}
      {tab === 'cpes' && (
        <Card>
          {data.cpeError && <ErrorBox message={data.cpeError} onRetry={load} />}
          <DataTable rows={data.cpes} rowKey={(c) => c.Cpeid} empty="No CPEs raised against this budget yet."
            onRowClick={(c) => router.push(`/cpe/detail/?id=${encodeURIComponent(c.Cpeid)}`)}
            columns={[
              { key: 'id', header: 'CPE ID', render: (c: CPE) => <span className="font-bold text-plum">{c.Cpeid}</span> },
              { key: 't', header: 'Title', hideBelow: 'sm', render: (c: CPE) => c.Title },
              { key: 'a', header: 'Amount', align: 'right', hideBelow: 'sm', render: (c: CPE) => inLakhs(c.Amount) },
              { key: 's', header: 'Status', align: 'right', width: '9rem', render: (c: CPE) => <Chip tone={statusTone(c.Status)}>{statusLabel(c.Status)}</Chip> },
            ]} />
        </Card>
      )}
      {tab === 'audit' && (
        <Card>
          {data.auditError && <ErrorBox message={data.auditError} onRetry={load} />}
          {!data.auditError && data.audit.length === 0 && <Empty>No audit entries.</Empty>}
          <ol className="space-y-3">
            {data.audit.map((a) => (
              <li key={a.Auditid} className="border-l-2 border-plum pl-3">
                <div className="text-[12px] font-bold">{a.Action}</div>
                <div className="text-[11px] text-sap-muted">{a.Username || a.Userid}{a.Role ? ` (${a.Role})` : ''} {'·'} {fmtDateTime(a.LogTs)}</div>
                {a.Comments && <div className="mt-0.5 text-[12px]">{a.Comments}</div>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {isDraft && <Link href={`/budget/create/?id=${encodeURIComponent(b.Budgetid)}`} className="btn btn-secondary">Edit</Link>}
        {isDraft && <Button variant="primary" disabled={busy} onClick={() => { void openSubmit(); }}>Submit</Button>}
        {isApproved && <Link href={`/cpe/create/?budget=${encodeURIComponent(b.Budgetid)}`} className="btn btn-primary">+ New CPE</Link>}
        <Button onClick={() => window.print()}>Print</Button>
        <Link href="/budget/" className="btn btn-secondary">Back</Link>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Submit Budget"
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={() => { void submit(); }}>Submit</Button></>}>
        <p className="text-[13px]">Submit budget of {fmtInrFull(b.Investment || b.AmtApproved)} for approval?</p>
        <p className="mt-2 text-[12px] text-sap-muted">It will be routed to {firstRole} first.</p>
      </Modal>
    </>
  );
}

function DetailsTab({ b, items }: { b: Budget; items: BudgetItem[] }) {
  const rows: Array<[string, string]> = [
    ['Budget ID', b.Budgetid], ['Capex Type', b.Capextype], ['Plant', b.PlantName], ['Category', b.CategoryText || b.Category],
    ['Internal Order', orDash(b.Aufnr)], ['Common Pool Bucket', yesNo(b.IsCommonpool === 'X')],
    ['Submitted By', orDash(b.SubmittedByName || b.SubmittedBy)], ['Submitted On', fmtDate(b.SubmittedOn)], ['Approved On', fmtDate(b.ApprovedOn)],
  ];
  const total = items.reduce((n, i) => n + num(i.Amount), 0);
  return (
    <Card>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k} className="flex gap-3 text-[12px]"><dt className="w-36 shrink-0 font-bold text-sap-muted">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Business Justification</h3>
      <p className="mt-1 whitespace-pre-wrap text-[12px]">{orDash(b.Justification)}</p>
      {b.ExpectedBenefit && <>
        <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Expected Benefit</h3>
        <p className="mt-1 whitespace-pre-wrap text-[12px]">{b.ExpectedBenefit}</p>
      </>}
      {items.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Budget Line Items</h3>
          <DataTable rows={items} rowKey={(i) => i.Itemno} columns={[
            { key: 'n', header: 'Item No.', render: (i: BudgetItem) => i.Itemno },
            { key: 't', header: 'Title', render: (i: BudgetItem) => i.ItemTitle },
            { key: 'a', header: 'Amount', align: 'right', render: (i: BudgetItem) => inLakhs(i.Amount) },
            { key: 'r', header: 'Remarks', hideBelow: 'sm', render: (i: BudgetItem) => orDash(i.Remarks) },
          ]} />
          <p className="mt-1.5 text-[11px] text-sap-muted">{fmtInrFull(total)} ({items.length} item{items.length === 1 ? '' : 's'})</p>
        </div>
      )}
    </Card>
  );
}

function FinancialsTab({ b, flows }: { b: Budget; flows: BudgetCashFlow[] }) {
  const on = b.MetricsOn === 'X';
  const hurdle = num(b.HurdleRate);
  const irr = num(b.Irr), npv = num(b.Npv), payback = num(b.Payback);
  // Fiori shows the saved metrics; zero = never calculated (Nullable=false fields) -> dash for IRR/payback
  const hasIrr = on && !!irr, hasPay = on && !!payback;
  const rows = useMemo(() => {
    const r = hurdle / 100;
    let cum = -Math.abs(num(b.Investment));
    return flows.map((f, i) => {
      const flow = num(f.Amount);
      const disc = flow / Math.pow(1 + r, i + 1);
      cum += disc;
      return { year: `Year ${parseInt(f.Yearnr, 10) || i + 1}`, flow, disc, cum };
    });
  }, [flows, hurdle, b.Investment]);
  if (!on) return <Card><p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">Financial computation is switched off for this request.</p></Card>;
  const Metric = ({ label, value, tone, foot }: { label: string; value: string; tone: keyof typeof TONE_CLASS; foot?: string }) => (
    <div className="glass rounded-xl px-4 py-3"><div className="text-[11px] font-bold uppercase text-sap-muted">{label}</div><div className={`font-display text-xl font-extrabold ${TONE_CLASS[tone]}`}>{value}</div>{foot && <div className="text-[11px] text-sap-muted">{foot}</div>}</div>
  );
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="IRR" value={hasIrr ? `${irr.toFixed(1)}%` : '—'} tone={irrTone(hasIrr ? irr : null)} foot={`hurdle ${hurdle.toFixed(1)}%`} />
        <Metric label="NPV" value={npv || hasIrr ? inLakhs(npv) : '—'} tone={npvTone(npv || hasIrr ? npv : null)} />
        <Metric label="Payback" value={hasPay ? `${payback.toFixed(1)} yrs` : '—'} tone={paybackTone(hasPay ? payback : null)} />
      </div>
      <h3 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wide text-sap-muted">Projected Net Cash Inflows</h3>
      <DataTable rows={rows} rowKey={(r) => r.year} empty="No cash flows entered." columns={[
        { key: 'y', header: 'Year', render: (r) => r.year },
        { key: 'f', header: 'Net Inflow', align: 'right', render: (r) => inLakhs(r.flow) },
        { key: 'd', header: 'Discounted', align: 'right', hideBelow: 'sm', render: (r) => inLakhs(r.disc) },
        { key: 'c', header: 'Cumulative', align: 'right', hideBelow: 'sm', render: (r) => <span className={r.cum >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-700'}>{inLakhs(r.cum)}</span> },
      ]} />
    </Card>
  );
}
