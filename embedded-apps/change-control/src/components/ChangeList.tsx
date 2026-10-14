'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, FilePlus2, Search, SearchX } from 'lucide-react';
import { getChanges, type Change, type Names } from '@/lib/api';
import { CATEGORY_LABEL, STATUS_LABEL, TYPE_LABEL, fmtDateTime } from '@/lib/labels';
import { nameFromEmail } from '@/lib/hub';
import { Button, Card, Empty, RiskPill, Select, Skeleton, StatusPill, TypePill, cx, inputCls } from './ui';

const all = (label: string, map: Record<string, string>) => [{ value: '', label: `All ${label}` }, ...Object.entries(map).map(([value, l]) => ({ value, label: l }))];

export default function ChangeList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [mine, setMine] = useState(false);
  const [rows, setRows] = useState<{ changes: Change[]; names: Names } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    // Debounced so typing in Search doesn't fire a request per keystroke.
    const t = setTimeout(() => {
      getChanges({ q, status, type, category, mine })
        .then((r) => live && (setRows(r), setError('')))
        .catch((e) => live && setError(e.message));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, status, type, category, mine]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight">Change requests</h2>
        <Button variant="primary" onClick={onNew}><FilePlus2 size={15} /> Raise a change</Button>
      </div>

      <Card bodyClass="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-56 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, CR number or system" className={cx(inputCls, 'pl-9')} />
        </div>
        <Select label="Status" value={status} onChange={setStatus} options={all('statuses', STATUS_LABEL)} />
        <Select label="Type" value={type} onChange={setType} options={all('types', TYPE_LABEL)} />
        <Select label="Category" value={category} onChange={setCategory} options={all('categories', CATEGORY_LABEL)} />
        <label className="flex items-center gap-2 px-1 text-[13px] font-medium">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[rgb(var(--accent))]" /> Raised by me
        </label>
      </Card>

      <Card bodyClass="p-0">
        {error ? (
          <Empty title="Could not load change requests" icon={AlertTriangle}>{error}</Empty>
        ) : !rows ? (
          <div className="p-4"><Skeleton /></div>
        ) : rows.changes.length === 0 ? (
          <Empty title="No change requests match these filters" icon={SearchX} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="border-b border-line bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">CR #</th>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Risk</th>
                  <th className="px-4 py-2.5">Planned start</th>
                  <th className="px-4 py-2.5">Requester</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.changes.map((c) => (
                  <tr key={c.id} onClick={() => onOpen(c.id)} className="cursor-pointer transition hover:bg-sunken">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-2xs font-semibold text-accent">{c.crNo}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => onOpen(c.id)} className="text-left font-semibold hover:underline">{c.title}</button>
                    </td>
                    <td className="px-4 py-2.5"><TypePill type={c.changeType} /></td>
                    <td className="px-4 py-2.5 text-muted">{CATEGORY_LABEL[c.category]}</td>
                    <td className="px-4 py-2.5"><RiskPill risk={c.riskLevel} /></td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-muted">{fmtDateTime(c.plannedStart)}</td>
                    <td className="px-4 py-2.5 text-muted">{rows.names[c.requesterEmail] || nameFromEmail(c.requesterEmail)}</td>
                    <td className="px-4 py-2.5"><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
