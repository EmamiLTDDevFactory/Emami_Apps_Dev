'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileUp, Headset, ShoppingBag, Upload } from 'lucide-react';
import { migrationImport, migrationTemplate } from '@/lib/api';
import type { MigrationKind, MigrationResult, MigrationTemplate } from '@/lib/types';
import { Button, Card, Field, Notice, Pill, Spinner, Table, cx, inputBase } from '../ui';

/*
   Admin > Ticket migration: move OPEN tickets from another tool into Samadhan with an Excel template.
     1. Download the template (always current: the allowed values come from Samadhan when you click).
     2. Fill one row per ticket and upload it - every row is checked first, nothing is saved.
     3. Import. Each ticket keeps its old number (searchable), logged date and status, is created quietly (no mails),
        and a file "old number -> Samadhan reference" is offered for the communication to users.
   Two templates: ITSM support vendor tickets (Allied Digital's tool today) and Secondary Sales tickets.
*/
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const KINDS: { kind: MigrationKind; title: string; sub: string; icon: typeof Headset }[] = [
  { kind: 'itsm', title: 'ITSM tickets (support vendor tool)', sub: 'Laptop, desktop, servers, network, cloud, M365, software applications, SAP - the open tickets in the ITSM support vendor\'s current tool (Allied Digital).', icon: Headset },
  { kind: 'sales', title: 'Secondary Sales tickets', sub: 'Open tickets of distributors, MRs and the sales apps (mSFA, DMS, B2B ...).', icon: ShoppingBag },
];

// A cell starting with = + - @ would run as a formula in Excel (CSV / formula injection): stored as text instead.
const cell = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
// The backend accepts request bodies up to 6 MB; keep a margin.
const MAX_BODY = 5_500_000;

async function downloadTemplate(t: MigrationTemplate) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const head = t.columns.map((c) => `${c.header}${c.required ? ' *' : ''}`);
  // 1. The sheet to fill: header only (the example is on its own sheet, so it is never imported by mistake).
  const ws = XLSX.utils.aoa_to_sheet([head]);
  ws['!cols'] = t.columns.map((c) => ({ wch: Math.max(14, Math.min(40, c.header.length + 4)) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, t.sheet.slice(0, 31));
  // 2. Instructions: one line per column.
  const listName: Record<string, string> = { applications: 'Application code', types: 'Ticket type', categories: 'Category', priorities: 'Priority', statuses: 'Status', groups: 'Assigned group', agents: 'Assigned agent', vendors: 'Support vendor', hosting: 'Hosting', environments: 'Environment', impacts: 'Impact', urgencies: 'Urgency', sources: 'Source', region: 'Region' };
  const howTo = [
    [t.title],
    [t.intro],
    ['How: fill the first sheet, one row per OPEN ticket (resolved / closed tickets are not moved). Columns marked * are required. Keep the header row as it is.'],
    ['Then: Samadhan > Admin > Ticket migration > Upload. Every row is checked first; nothing is saved until you press Import. Uploading the same file again skips tickets already moved.'],
    ...(t.currentVendor ? [[`Support vendor: empty = ${t.currentVendor} (the current ITSM support vendor).`]] : []),
    [],
    ['Column', 'Required', 'What to enter', 'Allowed values'],
    ...t.columns.map((c) => [c.header, c.required ? 'Yes' : '', c.hint, c.list ? `sheet "Lists", column "${listName[c.list] ?? c.list}"` : '']),
  ];
  const wi = XLSX.utils.aoa_to_sheet(howTo);
  wi['!cols'] = [{ wch: 28 }, { wch: 9 }, { wch: 90 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wi, 'Instructions');
  // 3. Example row.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, t.columns.map((c) => c.example)]), 'Example');
  // 4. Allowed values, one column per list (live from Samadhan).
  const lists = Object.entries(t.values).filter(([k, v]) => v.length && (t.columns.some((c) => c.list === k) || k === 'subCategories'));
  const titles = lists.map(([k]) => (k === 'subCategories' ? 'Category > Sub-category' : listName[k] ?? k));
  const depth = Math.max(0, ...lists.map(([, v]) => v.length));
  const aoa = [titles, ...Array.from({ length: depth }, (_, i) => lists.map(([, v]) => cell(v[i] ?? '')))];
  const wl = XLSX.utils.aoa_to_sheet(aoa);
  wl['!cols'] = titles.map(() => ({ wch: 34 }));
  XLSX.utils.book_append_sheet(wb, wl, 'Lists');
  XLSX.writeFile(wb, t.file);
}

/** Reads the filled sheet (the template's sheet, else the first) as text rows; Excel dates become ISO times. */
async function readRows(f: File, sheetName: string): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
  const name = wb.SheetNames.find((n) => n.toLowerCase() === sheetName.slice(0, 31).toLowerCase()) ?? wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' });
  return raw.map((r) => r.map((c) => (c instanceof Date ? c.toISOString() : String(c ?? '').trim())));
}

async function downloadRows(file: string, head: string[], rows: (string | number)[][]) {
  const XLSX = await import('xlsx');
  const safe = (v: string | number) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? `'${v}` : v);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows.map((r) => r.map(safe))]), 'Result');
  XLSX.writeFile(wb, file);
}

export function MigrationTab() {
  return (
    <div className="space-y-4" data-testid="admin-migration">
      <p className="text-sm text-muted">Moving to Samadhan from another tool? Bring the <b>open</b> tickets across in three steps: download the template, fill it, upload it. Nothing is saved until you press Import, and nobody is emailed.</p>
      {KINDS.map((k) => <MigrationCard key={k.kind} {...k} />)}
    </div>
  );
}

function MigrationCard({ kind, title, sub, icon: Icon }: (typeof KINDS)[number]) {
  const file = useRef<HTMLInputElement>(null);
  const [tpl, setTpl] = useState<MigrationTemplate | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [check, setCheck] = useState<MigrationResult | null>(null);
  const [done, setDone] = useState<MigrationResult | null>(null);
  const [slaFrom, setSlaFrom] = useState<'import' | 'logged'>('import');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const template = async () => {
    setBusy('template');
    setError('');
    try { const t = tpl ?? await migrationTemplate(kind); setTpl(t); await downloadTemplate(t); } catch (e) { setError(errText(e)); } finally { setBusy(''); }
  };
  const upload = async (f: File) => {
    setBusy('check');
    setError('');
    setCheck(null);
    setDone(null);
    try {
      const t = tpl ?? await migrationTemplate(kind);
      setTpl(t);
      const r = await readRows(f, t.sheet);
      if (JSON.stringify(r).length > MAX_BODY) throw new Error(`The file is too large to upload at once (${r.length - 1} rows). Split it into two or more files and upload them one after the other.`);
      setRows(r);
      setFileName(f.name);
      setCheck(await migrationImport(kind, r, true, slaFrom));
    } catch (e) { setError(errText(e)); } finally { setBusy(''); if (file.current) file.current.value = ''; }
  };
  const run = async () => {
    if (!rows || !check) return;
    if (!window.confirm(`Create ${check.ok} ticket(s) in Samadhan now?${check.errors.length ? `\n\n${check.errors.length} row(s) with errors are left out - fix them and upload again later.` : ''}`)) return;
    setBusy('import');
    setError('');
    try { const r = await migrationImport(kind, rows, false, slaFrom); setDone(r); setCheck(null); } catch (e) { setError(errText(e)); } finally { setBusy(''); }
  };
  const errorReport = () => check && downloadRows(`${kind}-migration-errors.xlsx`, ['Row in your file', 'Legacy ticket no', 'What to fix'], check.errors.map((e) => [e.line, e.legacyRef ?? '', e.error]));
  const mapping = () => done && downloadRows(`${kind}-migration-old-to-new.xlsx`, ['Row in your file', 'Old ticket no', 'Samadhan ticket', 'Samadhan reference'], done.created.map((c) => [c.line, c.legacyRef, c.id, c.ref]));
  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-2xs font-bold text-accent">{n}</span><div className="min-w-0 flex-1 space-y-2">{children}</div></div>
  );
  return (
    <Card title={<span className="inline-flex items-center gap-1.5"><Icon size={15} className="text-accent" /> {title}</span>} sub={sub}>
      <div className="space-y-4 text-[13px]" data-testid={`migration-${kind}`}>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <Step n={1}>
          <div className="font-semibold">Download the template</div>
          <p className="text-2xs text-muted">Excel with the sheet to fill, an Instructions sheet, an Example and the allowed values (Lists) - taken from Samadhan right now.</p>
          <Button onClick={template} disabled={!!busy}>{busy === 'template' ? <Spinner /> : <Download size={14} />} Download template</Button>
        </Step>
        <Step n={2}>
          <div className="font-semibold">Upload the filled file - it is checked, not saved</div>
          <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => file.current?.click()} disabled={!!busy}>{busy === 'check' ? <Spinner /> : <Upload size={14} />} Upload &amp; check</Button>
            {fileName && <span className="inline-flex items-center gap-1 text-2xs text-muted"><FileSpreadsheet size={13} /> {fileName}</span>}
          </div>
          {check && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Pill tone="good">{check.ok} ready</Pill>
                {check.skipped > 0 && <Pill>{check.skipped} already moved (skipped)</Pill>}
                {check.errors.length > 0 && <Pill tone="bad">{check.errors.length} to fix</Pill>}
              </div>
              {check.errors.length > 0 && (
                <>
                  <Table head={['Row', 'Old no.', 'What to fix']} className="max-h-64 overflow-y-auto rounded-lg border border-line">
                    {check.errors.slice(0, 200).map((e, i) => (
                      <tr key={i} className="border-b border-line last:border-0"><td className="num px-3 py-1.5">{e.line}</td><td className="px-3 py-1.5">{e.legacyRef ?? '—'}</td><td className="px-3 py-1.5 text-bad">{e.error}</td></tr>
                    ))}
                  </Table>
                  <Button size="sm" onClick={errorReport}><Download size={13} /> Download the list to fix</Button>
                </>
              )}
            </div>
          )}
        </Step>
        <Step n={3}>
          <div className="font-semibold">Import</div>
          <Field label="SLA clock">
            <select className={cx('h-9 w-full max-w-md', inputBase)} value={slaFrom} onChange={(e) => setSlaFrom(e.target.value as 'import' | 'logged')}>
              <option value="import">Starts at the import (recommended - a fair start for the new team)</option>
              <option value="logged">From the original logged date (old tickets may show as overdue)</option>
            </select>
          </Field>
          <Button variant="primary" onClick={run} disabled={!!busy || !check || check.ok === 0} data-testid={`migration-${kind}-import`}>{busy === 'import' ? <Spinner /> : <FileUp size={14} />} Import {check?.ok ? `${check.ok} ticket(s)` : ''}</Button>
          {done && (
            <div className="space-y-2">
              <Notice tone="good"><CheckCircle2 size={14} className="mr-1 inline" />{done.created.length} ticket(s) created{done.skipped ? `, ${done.skipped} already there` : ''}{done.errors.length ? `, ${done.errors.length} not created` : ''}. They carry the tag &quot;migrated&quot; and their old number.</Notice>
              {done.created.length > 0 && <Button size="sm" onClick={mapping}><Download size={13} /> Old number → Samadhan reference (Excel)</Button>}
            </div>
          )}
        </Step>
      </div>
    </Card>
  );
}
