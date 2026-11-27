'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader, Card, Button, Field, Input, Select, Chip, DataTable, ErrorBox, Modal, Spinner, useToast, type Column } from '@/components/ui';
import { useList } from '@/lib/useData';
import { list } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Budget, BudgetItem } from '@/lib/entities';
import { num, fmtInr, inLakhs, fyDigits, fyLabel, statusLabel, statusTone, orDash } from '@/lib/format';
import Combo from './Combo';
import { useBudgetOptions } from './useOptions';
import { guardRow, textOf } from './logic';

const PAGE = 15;
const STATUSES = [['DRAFT', 'Draft'], ['IN_APPROVAL', 'In Approval'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']] as const;

const available = (b: Budget) => num(b.AmtApproved) - num(b.AmtCommitted) - num(b.AmtSpent);
function availTone(b: Budget): string {
  const approved = num(b.AmtApproved);
  const avail = available(b);
  if (approved === 0) return 'text-sap-ink';
  if (avail <= 0) return 'text-red-700';
  if (avail / approved < 0.2) return 'text-amber-700';
  return 'text-emerald-700';
}

export default function BudgetList() {
  const router = useRouter();
  const toast = useToast();
  const { fiscalYear } = useSession();
  const { rows, loading, error, reload } = useList<Budget>('BudgetSet');
  const { plants, capexTypes, classifications, departments } = useBudgetOptions();

  const [search, setSearch] = useState('');
  // null = follow the signed-in person's current fiscal year; '' = All years (log #71)
  const [fy, setFy] = useState<string | null>(null);
  const [plant, setPlant] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [itemsFor, setItemsFor] = useState<Budget | null>(null);

  const effFy = fy ?? fyDigits(fiscalYear);
  const years = useMemo(() => {
    const s = new Set(rows.map((r) => fyDigits(r.Fiscalyear)).filter(Boolean));
    const cur = fyDigits(fiscalYear);
    if (cur) s.add(cur);
    return [...s].sort().reverse();
  }, [rows, fiscalYear]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (!effFy || fyDigits(r.Fiscalyear) === effFy) &&
      (!q || r.Budgetid.toLowerCase().includes(q) || r.Title.toLowerCase().includes(q) || r.PlantName.toLowerCase().includes(q)) &&
      (!plant || r.Werks === plant) && (!type || r.Capextype === type) && (!status || r.Status.toUpperCase() === status));
  }, [rows, effFy, search, plant, type, status]);

  const clear = () => { setSearch(''); setFy(null); setPlant(''); setType(''); setStatus(''); setShown(PAGE); };
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setShown(PAGE); };

  async function exportXlsx() {
    const XLSX = await import('xlsx');
    const head = ['Budget ID', 'Fiscal Year', 'Title', 'Plant', 'Category', 'Capex Type', 'Classification', 'Department', 'Approved', 'Committed', 'Spent', 'Available', 'Internal Order', 'Status'];
    const aoa = [head, ...filtered.map((b) => guardRow([b.Budgetid, fyLabel(b.Fiscalyear), b.Title, b.PlantName, b.CategoryText || b.Category, b.Capextype,
      textOf(classifications, b.Classification || ''), textOf(departments, b.Department || ''),
      num(b.AmtApproved), num(b.AmtCommitted), num(b.AmtSpent), available(b), b.Aufnr, statusLabel(b.Status)]))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Budgets');
    XLSX.writeFile(wb, 'Budgets.xlsx');
  }

  const columns: Column<Budget>[] = [
    { key: 'id', header: 'Budget ID', width: '9rem', render: (b) => <><div className="font-bold text-plum">{b.Budgetid}</div><div className="text-[11px] text-sap-muted">{b.Fiscalyear}</div></> },
    { key: 'title', header: 'Budget Title', render: (b) => <>{b.Title}{b.IsCommonpool === 'X' && <span className="ml-2"><Chip tone="info">Common Pool Bucket</Chip></span>}</> },
    { key: 'plant', header: 'Plant', hideBelow: 'md', render: (b) => b.PlantName },
    { key: 'cat', header: 'Category', hideBelow: 'lg', render: (b) => b.CategoryText || b.Category },
    { key: 'classif', header: 'Classification', hideBelow: 'lg', render: (b) => orDash(textOf(classifications, b.Classification || '')) },
    { key: 'dept', header: 'Department', hideBelow: 'lg', render: (b) => orDash(textOf(departments, b.Department || '')) },
    { key: 'appr', header: 'Approved', align: 'right', hideBelow: 'sm', render: (b) => inLakhs(b.AmtApproved) },
    { key: 'comm', header: 'Committed', align: 'right', hideBelow: 'lg', render: (b) => inLakhs(b.AmtCommitted) },
    { key: 'avail', header: 'Available', align: 'right', hideBelow: 'sm', render: (b) => <span className={`font-bold ${availTone(b)}`}>{inLakhs(available(b))}</span> },
    { key: 'io', header: 'Internal Order', hideBelow: 'lg', render: (b) => orDash(b.Aufnr) },
    { key: 'status', header: 'Status', align: 'right', width: '9rem', render: (b) => <Chip tone={statusTone(b.Status)}>{statusLabel(b.Status)}</Chip> },
    { key: 'items', header: '', align: 'center', width: '3rem', render: (b) => (
      <button type="button" aria-label="View line items" title="View line items" className="rounded px-1.5 py-0.5 text-sap-muted hover:bg-plum-soft hover:text-plum"
        onClick={(e) => { e.stopPropagation(); setItemsFor(b); }}>{'☰'}</button>) },
  ];

  return (
    <>
      <PageHeader title="Capex Budgets" subtitle={effFy ? fyLabel(effFy) : 'All years'}
        actions={<Link href="/budget/create/" className="btn btn-primary">+ New Budget</Link>} />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Search" className="lg:col-span-2"><Input placeholder="ID, title or unit" value={search} onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} /></Field>
          <Field label="Fiscal Year">
            <Select value={effFy} onChange={(e) => { setFy(e.target.value); setShown(PAGE); }}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
            </Select>
          </Field>
          <Field label="Plant"><Combo options={plants} value={plant} onChange={reset(setPlant)} allLabel="All" /></Field>
          <Field label="Capex Type">
            <Select value={type} onChange={(e) => reset(setType)(e.target.value)}>
              <option value="">All</option>
              {capexTypes.map((o) => <option key={o.key} value={o.key}>{o.text}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
              <option value="">All</option>
              {STATUSES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-3"><Button onClick={clear}>Clear</Button></div>
      </Card>

      {error && <div className="mb-3"><ErrorBox message={error} onRetry={reload} /></div>}
      <Card title={<>Capex Budgets <span className="font-normal text-sap-muted">({filtered.length})</span></>}
        actions={<>
          <Button onClick={() => { exportXlsx().catch(() => toast('Could not create the Excel file.', 'error')); }} disabled={!filtered.length}>Export</Button>
          <Button onClick={() => { reload(); toast('Refreshed', 'info'); }}>Refresh</Button>
        </>}>
        <DataTable columns={columns} rows={filtered.slice(0, shown)} rowKey={(b) => b.Budgetid} loading={loading && !rows.length}
          empty="No records found" onRowClick={(b) => router.push(`/budget/detail/?id=${encodeURIComponent(b.Budgetid)}`)} />
        {filtered.length > shown && <div className="mt-3 text-center"><Button onClick={() => setShown((s) => s + PAGE)}>Show more ({filtered.length - shown} more)</Button></div>}
      </Card>

      <ItemsModal budget={itemsFor} onClose={() => setItemsFor(null)} />
    </>
  );
}

/** The Fiori line-items popover: sub-budgets of one budget (BudgetToItems), read when opened. */
function ItemsModal({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const [state, setState] = useState<{ id: string; rows: BudgetItem[]; error: string } | null>(null);
  const id = budget?.Budgetid ?? '';
  useEffect(() => {
    if (!id) return;
    let live = true;
    list<BudgetItem>(`BudgetSet('${id.replace(/'/g, "''")}')/BudgetToItems`)
      .then((r) => { if (live) setState({ id, rows: r.rows, error: '' }); })
      .catch((e) => { if (live) setState({ id, rows: [], error: e instanceof Error ? e.message : 'Could not load the line items.' }); });
    return () => { live = false; };
  }, [id]);
  const ready = state && state.id === id;
  return (
    <Modal open={!!budget} onClose={onClose} title={budget ? `Line items - ${budget.Title}` : ''} wide footer={<Button onClick={onClose}>Close</Button>}>
      {!ready ? <Spinner /> : state.error ? <ErrorBox message={state.error} /> : state.rows.length === 0 ? <p className="text-[12px] text-sap-muted">This budget has no line items.</p> : (
        <DataTable columns={[
          { key: 'no', header: 'Item No.', render: (r: BudgetItem) => r.Itemno },
          { key: 't', header: 'Title', render: (r: BudgetItem) => r.ItemTitle },
          { key: 'a', header: 'Amount', align: 'right', render: (r: BudgetItem) => fmtInr(r.Amount) },
          { key: 'r', header: 'Remarks', hideBelow: 'sm', render: (r: BudgetItem) => orDash(r.Remarks) },
        ]} rows={state.rows} rowKey={(r) => r.Itemno} />
      )}
    </Modal>
  );
}
