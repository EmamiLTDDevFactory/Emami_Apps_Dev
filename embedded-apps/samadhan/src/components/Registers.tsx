'use client';
import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { register, registers } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { fmtDateTime, fmtNum } from '@/lib/format';
import type { RegisterData } from '@/lib/types';
import { appOptions } from './Tickets';
import { Button, Card, Notice, Skeleton, Table, cx, inputBase, inputCls } from './ui';

/** v7 Phase 6 (§N 8): the registers - Change & Transport, Access Request Log, SAP / Infra / Digital / Sales Apps - with Excel export. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? fmtDateTime(String(v)) : String(v));

export default function Registers() {
  const { meta, openTicket } = useSamadhan();
  const [list, setList] = useState<{ key: string; title: string }[]>([]);
  const [kind, setKind] = useState('change');
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [app, setApp] = useState('');
  const [data, setData] = useState<RegisterData | null>(null);
  const [error, setError] = useState('');
  const load = () => { setData(null); register(kind, from, to, app || undefined).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load the register.')); };
  useEffect(() => { registers().then(setList).catch(() => setList([])); }, []);
  useEffect(load, [kind, from, to, app]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportXlsx = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([data.columns.map(([, l]) => l), ...data.rows.map((r) => data.columns.map(([k]) => show(r[k])))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data.title.slice(0, 31));
    XLSX.writeFile(wb, `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-to-${to}.xlsx`);
  };
  return (
    <div className="space-y-4" data-testid="registers">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Registers</h2>
        <p className="text-sm text-muted">Audit-ready lists for changes, access, SAP, Infra, Digital and the sales apps. The daily report is unchanged.</p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Registers">
        {list.map((r) => (
          <button key={r.key} type="button" role="tab" aria-selected={kind === r.key} onClick={() => setKind(r.key)}
            className={cx('rounded-full border px-3 py-1 text-xs font-bold', kind === r.key ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:text-ink')}>{r.title}</button>
        ))}
      </div>
      <Card bodyClass="flex flex-wrap items-end gap-2 p-3">
        <label className="text-2xs font-semibold text-muted">From<input type="date" className={cx(inputCls, 'mt-0.5 w-40')} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-2xs font-semibold text-muted">To<input type="date" className={cx(inputCls, 'mt-0.5 w-40')} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-2xs font-semibold text-muted">Application
          <select className={cx('mt-0.5 h-9 w-56', inputBase)} value={app} onChange={(e) => setApp(e.target.value)}><option value="">All</option>{appOptions(meta, true).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        <div className="ml-auto flex gap-2">
          <Button onClick={load} aria-label="Refresh"><RefreshCw size={14} /></Button>
          <Button variant="primary" disabled={!data?.rows.length} onClick={exportXlsx}><Download size={14} /> Excel</Button>
        </div>
      </Card>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <Card title={data?.title} sub={data ? `${fmtNum(data.rows.length)} rows${data.rows.length >= 5000 ? ' (first 5,000 - narrow the dates)' : ''}` : undefined} bodyClass="p-0">
        {!data ? <div className="p-4"><Skeleton /></div> : !data.rows.length ? <p className="p-4 text-sm text-muted">Nothing in this period.</p> : (
          <div className="overflow-x-auto">
            <Table head={data.columns.map(([, l]) => l)}>
              {data.rows.slice(0, 500).map((r) => (
                <tr key={String(r.id)}>
                  {data.columns.map(([k]) => (
                    <td key={k} className="whitespace-nowrap px-3 py-2 text-xs">{k === 'ref' ? <button type="button" className="num font-bold text-accent hover:underline" onClick={() => openTicket(Number(r.id))}>{String(r.ref)}</button> : show(r[k])}</td>
                  ))}
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
