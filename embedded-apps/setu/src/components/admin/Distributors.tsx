'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Upload } from 'lucide-react';
import { admin } from '@/lib/api';
import { fmtDateTime, fmtNum } from '@/lib/format';
import type { Distributor } from '@/lib/types';
import { Button, Card, Notice, Pill, Skeleton, Spinner, Table, cx, inputCls } from '../ui';

const MAX_BYTES = 5 * 1024 * 1024;

/** Distributor master: the distributor (DB) list (.xlsx / .csv) is read in the browser and sent to the server as rows. */
export function DistributorsTab() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ items: Distributor[]; total: number; lastUpdated: string | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async (term: string) => {
    try {
      setData(await admin.distributors(term));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the distributor master.');
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q, load]);

  const upload = async (f: File) => {
    setMsg(null);
    if (f.size > MAX_BYTES) return setMsg({ tone: 'bad', text: 'That file is larger than 5 MB.' });
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '').trim()));
      const n = await admin.importDistributors(rows);
      setMsg({ tone: 'good', text: `Distributor list imported: ${fmtNum(n)} distributors added or updated.` });
      load(q.trim());
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not read that file. Upload the DB list as .xlsx or .csv with a header row.' });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Upload distributor list" sub="Columns recognised: DB Code, Distributor Name, Region, State, Depot, ASM Name, Depot Co-ordinator, DB Category, Status. Existing codes are updated.">
        <input ref={file} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <Button variant="primary" onClick={() => file.current?.click()} disabled={busy}>{busy ? <Spinner /> : <Upload size={14} />} Choose .xlsx or .csv</Button>
        {msg && <div className="mt-3"><Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice></div>}
      </Card>
      <Card
        title="Distributor master"
        sub={data ? `${fmtNum(data.total)} distributors${data.lastUpdated ? ` · last updated ${fmtDateTime(data.lastUpdated)}` : ''}` : undefined}
        actions={
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className={cx(inputCls, 'h-8 w-56 pl-7 text-xs')} placeholder="Code, name or depot" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search distributors" />
          </div>
        }
        bodyClass="p-0"
      >
        {error && <div className="p-4"><Notice>{error}</Notice></div>}
        {!data ? <div className="p-4"><Skeleton /></div> : data.items.length === 0 ? <p className="p-4 text-sm text-muted">No distributors{q ? ' match' : ' yet - upload the DB list above'}.</p> : (
          <Table head={['Code', 'Name', 'Region', 'State', 'Depot', 'ASM', 'Co-ordinator', 'Status']}>
            {data.items.map((d) => (
              <tr key={d.id}>
                <td className="num px-3 py-2 font-semibold">{d.code}</td>
                <td className="px-3 py-2">{d.name}</td>
                <td className="px-3 py-2 text-xs">{d.region ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{d.state ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{d.depot ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{d.asmName ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{d.depotCoordinator ?? '—'}</td>
                <td className="px-3 py-2">{d.active ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Inactive</Pill>}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && data.total > data.items.length && <p className="border-t border-line px-4 py-2 text-2xs text-muted">Showing the first {data.items.length}. Search to narrow down.</p>}
      </Card>
    </div>
  );
}
