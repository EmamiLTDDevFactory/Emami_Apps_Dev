'use client';
import { useEffect, useState } from 'react';
import { AlertTriangle, History } from 'lucide-react';
import { getHistory, type HistoryEntry, type Names, type Role } from '@/lib/api';
import { ROLE_LABEL, STATUS_LABEL, fmtDateTime } from '@/lib/labels';
import { nameFromEmail } from '@/lib/hub';
import { Card, Empty, Skeleton } from './ui';

export default function AuditView({ onOpen }: { onOpen: (id: number) => void }) {
  const [data, setData] = useState<{ history: HistoryEntry[]; names: Names } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getHistory().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Audit trail</h2>
        <p className="text-sm text-muted">Every action on every change request, newest first (latest 500). Rows are never edited or deleted.</p>
      </div>
      <Card bodyClass="p-0">
        {error ? (
          <Empty title="Could not load the audit trail" icon={AlertTriangle}>{error}</Empty>
        ) : !data ? (
          <div className="p-4"><Skeleton /></div>
        ) : data.history.length === 0 ? (
          <Empty title="Nothing recorded yet" icon={History} />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="border-b border-line bg-sunken text-left text-2xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Change</th>
                  <th className="px-4 py-2.5">Status change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-muted">{fmtDateTime(h.occurredAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">{data.names[h.actorEmail] || nameFromEmail(h.actorEmail)}</span>
                      {h.actorRole && <span className="ml-1.5 text-2xs text-muted">{ROLE_LABEL[h.actorRole as Role] ?? h.actorRole}</span>}
                    </td>
                    <td className="px-4 py-2.5 capitalize">{h.action.replaceAll('_', ' ')}</td>
                    <td className="px-4 py-2.5">
                      {h.changeId && h.crNo ? (
                        <button type="button" onClick={() => onOpen(h.changeId!)} className="font-mono text-2xs font-semibold text-accent hover:underline">{h.crNo}</button>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted">
                      {h.toStatus ? `${h.fromStatus ? `${STATUS_LABEL[h.fromStatus]} → ` : ''}${STATUS_LABEL[h.toStatus]}` : '—'}
                    </td>
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
