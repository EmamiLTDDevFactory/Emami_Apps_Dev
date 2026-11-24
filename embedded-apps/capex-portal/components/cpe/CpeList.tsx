'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader, Card, Button, Field, Input, Chip, DataTable, ErrorBox, Tabs, useToast, type Column } from '@/components/ui';
import Combo from '@/components/budget/Combo';
import { useList } from '@/lib/useData';
import { useSession } from '@/lib/session';
import type { CPE, PurchaseOrder } from '@/lib/entities';
import { fmtDate, fyLabel, inLakhs, orDash, slaLabel, slaState, slaTone, statusLabel, statusTone } from '@/lib/format';
import { STATUS_TABS, inFiscalYear, matchesStatus, statusCounts } from './logic';

const PAGE = 20;

export default function CpeList() {
  const router = useRouter();
  const toast = useToast();
  const { fiscalYear, cfgNum, canSeePlant } = useSession();
  const cpes = useList<CPE>('CPESet');
  // PO column: first PurchaseOrderSet row raised against the CPE. Optional - a failed/empty PO read just leaves "-".
  const pos = useList<PurchaseOrder>('PurchaseOrderSet');

  const [tab, setTab] = useState('ALL');
  // Dashboard tiles open this list with ?status=APPROVED (replaces Fiori's cpeListInitialStatus).
  useEffect(() => {
    const st = new URLSearchParams(window.location.search).get('status')?.toUpperCase();
    if (st && STATUS_TABS.some((t) => t.id === st)) setTab(st);
  }, []);
  const [search, setSearch] = useState('');
  const [plant, setPlant] = useState('');
  const [budget, setBudget] = useState('');
  const [shown, setShown] = useState(PAGE);

  const warn = cfgNum('SLA_WARN_DAYS', 3);
  const breach = cfgNum('SLA_BREACH_DAYS', 5);

  // Scope: the selected fiscal year (log #43) and only plants this person may see (SAP enforces it; this hides what would be empty).
  const scoped = useMemo(
    () => cpes.rows.filter((r) => inFiscalYear(r.Fiscalyear, fiscalYear) && canSeePlant(r.Werks)),
    [cpes.rows, fiscalYear, canSeePlant],
  );
  // Counts are derived from the loaded rows on every render, so they can never sit at 0 after a late load (log #116).
  const counts = useMemo(() => statusCounts(scoped), [scoped]);

  const plantOptions = useMemo(() => {
    const m = new Map<string, string>();
    scoped.forEach((r) => m.set(r.Werks, r.PlantName || r.Werks));
    return [...m].map(([key, text]) => ({ key, text })).sort((a, b) => a.key.localeCompare(b.key));
  }, [scoped]);
  const budgetOptions = useMemo(() => {
    const m = new Map<string, string>();
    scoped.forEach((r) => { if (r.Budgetid) m.set(r.Budgetid, r.BudgetTitle || ''); });
    return [...m].map(([key, text]) => ({ key, text })).sort((a, b) => b.key.localeCompare(a.key));
  }, [scoped]);

  const poByCpe = useMemo(() => {
    const m = new Map<string, string>();
    pos.rows.forEach((p) => { if (p.Cpeid && !m.has(p.Cpeid)) m.set(p.Cpeid, p.Ebeln); });
    return m;
  }, [pos.rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped
      .filter((r) => matchesStatus(r.Status, tab)
        && (!q || r.Cpeid.toLowerCase().includes(q) || (r.Title || '').toLowerCase().includes(q))
        && (!plant || r.Werks === plant) && (!budget || r.Budgetid === budget))
      .sort((a, b) => b.Cpeid.localeCompare(a.Cpeid));
  }, [scoped, tab, search, plant, budget]);

  const clear = () => { setSearch(''); setPlant(''); setBudget(''); setTab('ALL'); setShown(PAGE); };
  const refresh = () => { cpes.reload(); pos.reload(); toast('Refreshed', 'info'); };

  const columns: Column<CPE>[] = [
    { key: 'id', header: 'CPE ID', width: '9rem', render: (c) => <><div className="font-bold text-plum">{c.Cpeid}</div><div className="text-[11px] text-sap-muted">{fmtDate(c.CreatedOn)}</div></> },
    { key: 'title', header: 'Title', render: (c) => <>{c.Title}{c.Nonl1Justif && <div className="mt-0.5"><Chip tone="warning">Non-L1 vendor</Chip></div>}</> },
    { key: 'plant', header: 'Plant', hideBelow: 'md', render: (c) => c.PlantName },
    { key: 'budget', header: 'Budget', hideBelow: 'lg', render: (c) => <Link href={`/budget/detail/?id=${encodeURIComponent(c.Budgetid)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-plum underline-offset-2 hover:underline">{c.Budgetid}</Link> },
    { key: 'pr', header: 'PR No.', hideBelow: 'lg', render: (c) => orDash(c.Banfn) },
    { key: 'po', header: 'PO No.', hideBelow: 'lg', render: (c) => {
      const po = poByCpe.get(c.Cpeid);
      return po ? <Link href={`/po/detail/?id=${encodeURIComponent(po)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-plum underline-offset-2 hover:underline">{po}</Link> : '-';
    } },
    { key: 'amt', header: 'Amount', align: 'right', render: (c) => <span className="font-bold">{inLakhs(c.Amount)}</span> },
    { key: 'lvl', header: 'Current Level', hideBelow: 'md', render: (c) => c.CurrLevel || '-' },
    { key: 'sla', header: 'SLA', align: 'right', hideBelow: 'lg', render: (c) => (Number(c.DaysPending) > 0
      ? <Chip tone={slaTone(slaState(c.DaysPending, warn, breach))}>{slaLabel(c.DaysPending, warn, breach)}</Chip> : null) },
    { key: 'status', header: 'Status', align: 'right', render: (c) => <Chip tone={statusTone(c.Status)}>{statusLabel(c.Status)}</Chip> },
  ];

  return (
    <>
      <PageHeader
        title="Capital Purchase Expenditure"
        subtitle={fyLabel(fiscalYear) || undefined}
        actions={<Link href="/cpe/create/" className="btn btn-primary">+ Create CPE</Link>}
      />
      <Tabs
        tabs={STATUS_TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))}
        value={tab}
        onChange={(t) => { setTab(t); setShown(PAGE); }}
      />
      <Card className="mb-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.3fr_auto]">
          <Field label="Search"><Input placeholder="CPE number or title" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} /></Field>
          <Field label="Plant"><Combo options={plantOptions} value={plant} onChange={(k) => { setPlant(k); setShown(PAGE); }} allLabel="All" /></Field>
          <Field label="Budget ID"><Combo options={budgetOptions} value={budget} onChange={(k) => { setBudget(k); setShown(PAGE); }} allLabel="All" /></Field>
          <Button onClick={clear}>Clear</Button>
        </div>
      </Card>
      {cpes.error && <ErrorBox message={cpes.error} onRetry={cpes.reload} />}
      <Card
        title={<>Capital Purchase Expenditure <span className="font-normal text-sap-muted">({filtered.length})</span></>}
        actions={<Button onClick={refresh} aria-label="Refresh">Refresh</Button>}
      >
        <DataTable
          columns={columns}
          rows={filtered.slice(0, shown)}
          rowKey={(c) => c.Cpeid}
          loading={cpes.loading && !cpes.rows.length}
          onRowClick={(c) => router.push(`/cpe/detail/?id=${encodeURIComponent(c.Cpeid)}`)}
          empty="No CPEs match these filters."
          footer={filtered.length > shown ? (
            <div className="flex items-center justify-between border-t border-sap-line px-3 py-2 text-[11.5px] text-sap-muted">
              <span>Showing {Math.min(shown, filtered.length)} of {filtered.length}</span>
              <Button onClick={() => setShown((n) => n + PAGE)}>Show more</Button>
            </div>
          ) : undefined}
        />
      </Card>
    </>
  );
}
