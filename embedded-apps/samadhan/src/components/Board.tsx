'use client';
import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { MoreVertical, RefreshCw } from 'lucide-react';
import { getBoard, updateTicket } from '@/lib/api';
import { refOf, workspaceByKey } from '@/lib/workspaces';
import { useSamadhan } from '@/lib/context';
import { SEVERITY_EDGE } from '@/lib/format';
import type { TicketRow } from '@/lib/types';
import { PriorityPill, SlaBadge } from './badges';
import { Button, Notice, Select, Skeleton, cx } from './ui';
import { ItsmTag } from './Itsm';

export default function Board() {
  const { meta, openTicket, workspace } = useSamadhan();
  const ws = workspaceByKey(meta, workspace);
  const [items, setItems] = useState<TicketRow[] | null>(null);
  const [mine, setMine] = useState('');
  const [groupId, setGroupId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setItems(await getBoard({ mine, groupId, ...(ws ? { workspaceId: String(ws.id) } : {}) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the board.');
    } finally {
      setBusy(false);
    }
  }, [mine, groupId, ws]);

  useEffect(() => { load(); }, [load]);

  const move = async (ticketId: number, statusId: number) => {
    setMenuFor(null);
    const t = items?.find((x) => x.id === ticketId);
    if (!t || t.statusId === statusId) return;
    const status = meta.statuses.find((s) => s.id === statusId)!;
    // Optimistic move; the server may refuse (e.g. required fields before resolving).
    setItems((list) => list?.map((x) => (x.id === ticketId ? { ...x, statusId, statusName: status.name, pausesSla: status.pausesSla, isResolved: status.isResolved, isClosed: status.isClosed } : x)) ?? null);
    try {
      await updateTicket(ticketId, { statusId });
      setError('');
    } catch (e) {
      setError(`${refOf(meta, items?.find((x) => x.id === ticketId) ?? { id: ticketId })}: ${e instanceof Error ? e.message : 'Could not move the ticket.'}`);
    }
    load();
  };

  const columns = meta.statuses.filter((s) => !s.isClosed);
  const onDrop = (e: DragEvent, statusId: number) => {
    e.preventDefault();
    setOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    if (id) move(id, statusId);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight">Board <ItsmTag practice={'workflow'} /></h2>
          <p className="text-sm text-muted">Drag a card to change its status, or use the card menu. Closed tickets are not shown.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select label="Whose tickets" value={mine} onChange={setMine} options={[{ value: '', label: 'Everyone' }, { value: '1', label: 'Mine' }]} />
          <Select label="Group" value={groupId} onChange={setGroupId} options={[{ value: '', label: 'All groups' }, ...meta.groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
          <Button onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>
        </div>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {!items ? (
        <Skeleton />
      ) : (
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-3">
          {columns.map((s) => {
            const list = items.filter((t) => t.statusId === s.id);
            return (
              <section
                key={s.id}
                onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
                onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                onDrop={(e) => onDrop(e, s.id)}
                className={cx('flex w-72 shrink-0 flex-col rounded-2xl border bg-sunken/60 transition', over === s.id ? 'border-accent ring-2 ring-accent/20' : 'border-line')}
              >
                <header className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <h3 className="truncate text-xs font-bold" title={s.name}>{s.name}</h3>
                  <span className="num rounded-md bg-panel px-1.5 text-2xs font-bold text-muted ring-1 ring-line">{list.length}</span>
                </header>
                <div className="flex max-h-[68vh] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {list.map((t) => (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                      className={cx('relative cursor-grab rounded-xl border border-l-4 border-line bg-panel p-2.5 shadow-card active:cursor-grabbing', SEVERITY_EDGE[t.severity])}
                    >
                      <button type="button" onClick={() => openTicket(t.id)} className="block w-full pr-5 text-left">
                        <div className="num text-2xs font-bold text-muted">{refOf(meta, t)}</div>
                        <div className="line-clamp-2 text-[13px] font-semibold">{t.subject}</div>
                        <div className="mt-0.5 truncate text-2xs text-muted">{t.requesterName}{t.agentName ? ` · ${t.agentName}` : ' · Unassigned'}</div>
                      </button>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <PriorityPill priority={t.priority} />
                        <SlaBadge t={t} />
                      </div>
                      <button type="button" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} className="absolute right-1.5 top-1.5 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink" aria-label="Move ticket">
                        <MoreVertical size={14} />
                      </button>
                      {menuFor === t.id && (
                        <div className="absolute right-1.5 top-7 z-20 w-56 rounded-xl border border-line bg-panel p-1 shadow-pop">
                          <div className="px-2 py-1 text-2xs font-bold uppercase tracking-wide text-muted">Move to</div>
                          {meta.statuses.filter((x) => x.id !== t.statusId).map((x) => (
                            <button key={x.id} type="button" onClick={() => move(t.id, x.id)} className="block w-full rounded-lg px-2 py-1 text-left text-xs hover:bg-sunken">{x.name}</button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
