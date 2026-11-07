'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { refMastersAdmin } from '@/lib/api';
import { fmtNum } from '@/lib/format';
import type { RefMaster } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Skeleton, Spinner, Table, cx, inputBase, inputCls } from '../ui';

/*
   v7 Phase 4 (§N 6): reference masters behind the SAP / Infra typeaheads - systems, clients (parent = system), company
   codes, plants, T-codes, Fiori apps, roles, interfaces, batch jobs, servers, cloud accounts, sites. Excel / CSV import.
*/
const MAX_BYTES = 5 * 1024 * 1024;
const LABEL: Record<string, string> = {
  SAP_SYSTEM: 'SAP systems', SAP_CLIENT: 'SAP clients', COMPANY_CODE: 'Company codes', PLANT: 'Plants', STORAGE_LOCATION: 'Storage locations',
  SALES_ORG: 'Sales orgs', PURCH_ORG: 'Purchasing orgs', TCODE: 'T-codes', FIORI_APP: 'Fiori apps', SAP_ROLE: 'SAP roles', INTERFACE: 'Interfaces',
  BATCH_JOB: 'Batch jobs', SERVER: 'Servers', CLOUD_ACCOUNT: 'Cloud accounts', SITE: 'Sites / plants (IT)',
};
const PARENT_HINT: Record<string, string> = { SAP_CLIENT: 'System (e.g. ECP)', PLANT: 'Company code', STORAGE_LOCATION: 'Plant', SALES_ORG: 'Company code', PURCH_ORG: 'Company code' };

/** Finds the code / description / parent / active columns by their header (any order, common spellings). */
function rowsFrom(table: string[][]): RefMaster[] {
  const head = (table[0] ?? []).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  let code = col('code', 'id', 'sid', 'tcode', 'key');
  let desc = col('description', 'desc', 'name', 'text', 'title');
  const parent = col('parent', 'system', 'companycode', 'plant');
  const active = col('active', 'status', 'enabled');
  const body = code >= 0 ? table.slice(1) : table;
  if (code < 0) { code = 0; desc = 1; }
  return body.map((r) => ({
    code: r[code] ?? '', description: desc >= 0 ? r[desc] || null : null, parentCode: parent >= 0 && parent !== code ? r[parent] || null : null,
    ...(active >= 0 && r[active] ? { active: !['no', 'false', '0', 'n', 'inactive'].includes(r[active].toLowerCase()) } : {}),
  })).filter((r) => r.code);
}

export function RefMastersTab() {
  const [kind, setKind] = useState('SAP_SYSTEM');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ kinds: string[]; counts: Record<string, number>; items: RefMaster[] } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState({ code: '', description: '', parentCode: '' });
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setData(await refMastersAdmin.list(kind, q.trim())); } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not load the masters.' }); }
  }, [kind, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try { await fn(); setMsg({ tone: 'good', text: ok }); await load(); return true; } catch (e) { setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save.' }); return false; } finally { setBusy(false); }
  };
  const upload = async (f: File) => {
    if (f.size > MAX_BYTES) return setMsg({ tone: 'bad', text: 'That file is larger than 5 MB.' });
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
      const rows = rowsFrom(table);
      if (!rows.length) return setMsg({ tone: 'bad', text: 'No rows with a code were found. Use a header row: Code, Description, Parent, Active.' });
      let saved = 0;
      await act(async () => { saved = await refMastersAdmin.import(kind, rows); }, '');
      setMsg({ tone: 'good', text: `${LABEL[kind] ?? kind}: ${fmtNum(saved)} rows added or updated.` });
    } catch {
      setMsg({ tone: 'bad', text: 'Could not read that file. Upload .xlsx or .csv with a header row.' });
    } finally {
      if (file.current) file.current.value = '';
    }
  };
  const template = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([['Code', 'Description', 'Parent', 'Active'], ...(data?.items ?? []).map((r) => [r.code, r.description ?? '', r.parentCode ?? '', r.active === false ? 'No' : 'Yes'])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, kind.slice(0, 31));
    XLSX.writeFile(wb, `samadhan-${kind.toLowerCase()}.xlsx`);
  };

  const kinds = data?.kinds ?? Object.keys(LABEL);
  return (
    <div className="space-y-4" data-testid="ref-masters">
      <Card title="SAP & Infra masters" sub="The lists behind the typeaheads on SAP and IT tickets. Import from Excel (Code, Description, Parent, Active) or add one at a time.">
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={cx('rounded-full border px-2.5 py-1 text-2xs font-bold', kind === k ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>
              {LABEL[k] ?? k} <span className="num opacity-70">{fmtNum(data?.counts[k] ?? 0)}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="primary" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Spinner /> : <Upload size={14} />} Import {LABEL[kind] ?? kind}</Button>
          <Button onClick={template}><Download size={14} /> Download as Excel</Button>
        </div>
        {msg && msg.text && <div className="mt-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}
      </Card>
      <Card title={LABEL[kind] ?? kind} sub="Add or update one row (the same code updates it)" bodyClass="space-y-3 p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <Field label="Code" required><input className={inputCls} value={row.code} onChange={(e) => setRow({ ...row, code: e.target.value })} /></Field>
          <Field label="Description"><input className={inputCls} value={row.description} onChange={(e) => setRow({ ...row, description: e.target.value })} /></Field>
          <Field label="Parent" hint={PARENT_HINT[kind]}><input className={inputCls} value={row.parentCode} onChange={(e) => setRow({ ...row, parentCode: e.target.value })} /></Field>
          <div className="flex items-end"><Button variant="primary" disabled={busy || !row.code.trim()} onClick={async () => { if (await act(() => refMastersAdmin.save({ kind, code: row.code.trim(), description: row.description.trim() || null, parentCode: row.parentCode.trim() || null }), 'Saved.')) setRow({ code: '', description: '', parentCode: '' }); }}><Plus size={14} /> Save</Button></div>
        </div>
      </Card>
      <Card
        title="Rows"
        sub={data ? `${fmtNum(data.counts[kind] ?? 0)} in ${LABEL[kind] ?? kind}${data.items.length < (data.counts[kind] ?? 0) ? ` · showing ${data.items.length}` : ''}` : undefined}
        actions={<div className="relative"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" /><input className={cx('h-8 w-56 pl-7 text-xs', inputBase)} placeholder="Code or description" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search masters" /></div>}
        bodyClass="p-0"
      >
        {!data ? <div className="p-4"><Skeleton /></div> : data.items.length === 0 ? <p className="p-4 text-sm text-muted">Nothing here{q ? ' matches' : ' yet - import a list or add a row above'}.</p> : (
          <Table head={['Code', 'Description', 'Parent', 'Active', '']}>
            {data.items.map((r) => (
              <tr key={r.id}>
                <td className="num px-3 py-2 font-semibold">{r.code}</td>
                <td className="px-3 py-2">{r.description ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.parentCode ?? '—'}</td>
                <td className="px-3 py-2">{r.active === false ? <Pill>No</Pill> : <Pill tone="good">Yes</Pill>}</td>
                <td className="px-3 py-2 text-right"><button type="button" aria-label={`Delete ${r.code}`} className="text-muted hover:text-bad" disabled={busy} onClick={() => window.confirm(`Delete ${r.code}?`) && act(() => refMastersAdmin.remove(r.id!), `${r.code} deleted.`)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
