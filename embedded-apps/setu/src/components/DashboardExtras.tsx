'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckSquare, ListTodo, Plus, Smile, Square, X } from 'lucide-react';
import { addTodo, deleteTodo, getTodos, updateTodo } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { ACTION_LABEL, fmtNum, relative } from '@/lib/format';
import type { Dashboard as Data, Todo } from '@/lib/types';
import { EmptyLine, WCard } from './dashboard/frame';
import { Button, Notice, cx, inputCls } from './ui';

/*
 * Unresolved by group, recent activity, the agent's to-dos and CSAT - the rest of the Freshdesk "My Dashboard".
 * Each is a dashboard widget (ids byGroup, recent, todos, csat); the Dashboard places them in the agent's chosen order.
 */

export function ByGroup({ data }: { data: Data }) {
  const { meta, openList } = useSetu();
  // Only the statuses that occur, in the configured order.
  const statuses = useMemo(() => meta.statuses.filter((s) => data.byGroup.some((r) => r.statusId === s.id)), [meta.statuses, data.byGroup]);
  const groups = useMemo(() => {
    const m = new Map<string, { group: string; groupId: number | null; total: number; by: Record<number, number> }>();
    for (const r of data.byGroup) {
      const g = m.get(r.group) ?? { group: r.group, groupId: r.groupId, total: 0, by: {} };
      g.by[r.statusId] = (g.by[r.statusId] ?? 0) + r.n;
      g.total += r.n;
      m.set(r.group, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data.byGroup]);
  const go = (groupId: number | null, statusId?: number) => openList({ view: 'open', groupId: groupId ? String(groupId) : 'none', ...(statusId ? { statusId: String(statusId) } : {}) });
  return (
    <WCard title="Unresolved tickets by group" sub="Click a number to open those tickets">
      {groups.length === 0 ? <EmptyLine>Nothing unresolved.</EmptyLine> : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-3 font-bold">Group</th>
                {statuses.map((s) => <th key={s.id} className="px-2 py-1.5 text-right font-bold" title={s.name}><span className="block max-w-[90px] truncate">{s.name}</span></th>)}
                <th className="py-1.5 pl-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {groups.map((g) => (
                <tr key={g.group}>
                  <td className="py-1.5 pr-3 font-semibold">{g.group}</td>
                  {statuses.map((s) => (
                    <td key={s.id} className="px-2 py-1.5 text-right">
                      {g.by[s.id] ? <button type="button" onClick={() => go(g.groupId, s.id)} className="num font-semibold text-accent hover:underline">{fmtNum(g.by[s.id])}</button> : <span className="text-faint">·</span>}
                    </td>
                  ))}
                  <td className="py-1.5 pl-2 text-right"><button type="button" onClick={() => go(g.groupId)} className="num font-extrabold hover:text-accent">{fmtNum(g.total)}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WCard>
  );
}

export function Todos() {
  const { openTicket } = useSetu();
  const [items, setItems] = useState<Todo[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => getTodos().then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Could not load to-dos.')), []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.'); } };
  const open = items?.filter((t) => !t.done).length ?? 0;
  return (
    <WCard title={<span className="inline-flex items-center gap-1.5"><ListTodo size={15} className="text-accent" /> My to-dos</span>} sub={items ? `${open} open · only you see these` : undefined}>
      <ul className="scroll-thin max-h-56 space-y-1 overflow-y-auto">
        {items?.length === 0 && <li className="text-xs text-muted">Nothing to do. Add reminders here or from a ticket.</li>}
        {items?.map((td) => (
          <li key={td.id} className="group flex items-start gap-2 text-[13px]">
            <button type="button" onClick={() => run(() => updateTodo(td.id, { done: !td.done }))} className="mt-0.5 text-muted hover:text-accent" aria-label={td.done ? 'Mark not done' : 'Mark done'}>
              {td.done ? <CheckSquare size={15} className="text-good" /> : <Square size={15} />}
            </button>
            <span className={cx('min-w-0 flex-1', td.done && 'text-faint line-through')}>
              {td.text}
              {td.ticketId && <button type="button" onClick={() => openTicket(td.ticketId!)} className="ml-1 text-2xs font-semibold text-accent hover:underline">#{td.ticketId}</button>}
              {td.dueAt && <span className={cx('ml-1 text-2xs', !td.done && new Date(td.dueAt) < new Date() ? 'text-bad' : 'text-muted')}>· {relative(td.dueAt)}</span>}
            </span>
            <button type="button" onClick={() => run(() => deleteTodo(td.id))} className="text-faint opacity-0 hover:text-bad focus-visible:opacity-100 group-hover:opacity-100" aria-label="Delete to-do"><X size={13} /></button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(async () => { await addTodo({ text: text.trim() }); setText(''); }); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a to-do" aria-label="New to-do" className={cx(inputCls, 'h-8 text-xs')} />
        <Button size="sm" type="submit" disabled={!text.trim()} aria-label="Add to-do"><Plus size={13} /></Button>
      </form>
      {error && <div className="mt-2"><Notice onClose={() => setError('')}>{error}</Notice></div>}
    </WCard>
  );
}

export function Csat({ data }: { data: Data }) {
  const pos = data.csat['3'];
  const neu = data.csat['2'];
  const neg = data.csat['1'];
  const total = pos + neu + neg;
  const pct = (n: number) => (total ? Math.round((n * 100) / total) : 0);
  return (
    <WCard title={<span className="inline-flex items-center gap-1.5"><Smile size={15} className="text-accent" /> Customer satisfaction</span>} sub="Survey answers, last 30 days">
      {total === 0 ? <p className="text-xs text-muted">No answers yet. Requesters get a one-click survey when their ticket closes.</p> : (
        <div className="space-y-2">
          <div className="flex h-3 gap-[2px]" role="img" aria-label={`${pct(pos)}% satisfied, ${pct(neu)}% neutral, ${pct(neg)}% dissatisfied`}>
            {([[pos, 'bg-good', 'Satisfied'], [neu, 'bg-faint/40', 'Neutral'], [neg, 'bg-bad', 'Dissatisfied']] as const).filter(([n]) => n > 0).map(([n, c, l], i, arr) => (
              <span key={l} title={`${l}: ${fmtNum(n)}`} className={cx(c, i === 0 && 'rounded-l-full', i === arr.length - 1 && 'rounded-r-full')} style={{ flexGrow: n, flexBasis: 0 }} />
            ))}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-2xs">
            <div><dt className="text-muted">Satisfied</dt><dd className="num text-base font-extrabold text-good">{pct(pos)}%</dd></div>
            <div><dt className="text-muted">Neutral</dt><dd className="num text-base font-extrabold">{pct(neu)}%</dd></div>
            <div><dt className="text-muted">Dissatisfied</dt><dd className="num text-base font-extrabold text-bad">{pct(neg)}%</dd></div>
          </dl>
          <p className="text-2xs text-muted">{fmtNum(total)} response{total === 1 ? '' : 's'}</p>
        </div>
      )}
    </WCard>
  );
}

export function Recent({ data }: { data: Data }) {
  const { openTicket } = useSetu();
  return (
    <WCard title={<span className="inline-flex items-center gap-1.5"><Activity size={15} className="text-accent" /> Recent activity</span>} sub="Across all tickets, last 3 days">
      {data.recent.length === 0 ? <EmptyLine>Nothing yet.</EmptyLine> : (
        <ul className="scroll-thin max-h-72 divide-y divide-line overflow-y-auto">
          {data.recent.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => openTicket(a.ticketId)} className="flex w-full items-baseline gap-2 px-1 py-1.5 text-left text-xs hover:bg-sunken">
                <span className="font-semibold">{a.actorName ?? 'Samadhan'}</span>
                <span className="text-muted">{ACTION_LABEL[a.action] ?? a.action.replace(/_/g, ' ')}</span>
                <span className="num font-bold text-muted">#{a.ticketId}</span>
                <span className="min-w-0 flex-1 truncate">{a.subject}</span>
                <span className="shrink-0 text-2xs text-faint">{relative(a.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WCard>
  );
}
