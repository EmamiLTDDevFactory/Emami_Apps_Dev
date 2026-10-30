'use client';
import { useCallback, useEffect, useState } from 'react';
import { Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { admin } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { relative } from '@/lib/format';
import type { AccessUser, Role } from '@/lib/types';
import { Button, Card, Empty, Notice, Person, Pill, Skeleton, Table, cx, inputBase, inputCls } from '../ui';
import { useAction } from './shared';

const ROLES: Role[] = ['Agent', 'Supervisor', 'Admin'];
const ROLE_HINT: Record<Role, string> = {
  Agent: 'Works tickets',
  Supervisor: 'Agent + reports, export, analytics and shared views',
  Admin: 'Supervisor + every Admin screen',
};
type Filter = 'all' | 'access' | 'admins' | 'agents' | 'none';
const FILTERS: { id: Filter; label: string; test: (u: AccessUser) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'access', label: 'Has access', test: (u) => u.role !== null },
  { id: 'admins', label: 'Admins', test: (u) => u.role === 'Admin' },
  { id: 'agents', label: 'Agents', test: (u) => u.role === 'Agent' },
  { id: 'none', label: 'No access', test: (u) => u.role === null },
];

/** Admin > Roles & access: who can open Samadhan and as what. Same data as Emami Apps Manage Access (app 'setu'). */
export function AccessTab() {
  const { me, reloadMeta } = useSetu();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [users, setUsers] = useState<AccessUser[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [busyEmail, setBusyEmail] = useState('');
  const act = useAction();

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (search: string) => {
    try {
      const r = await admin.access(search);
      setUsers(r.users);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the people.');
    }
  }, []);
  useEffect(() => { load(term); }, [load, term]);

  const isMe = (u: AccessUser) => u.email.toLowerCase() === me.email.toLowerCase();
  const label = (u: AccessUser) => u.name || u.email;

  const change = async (u: AccessUser, role: Role | '') => {
    if ((role || null) === u.role) return;
    if (role === '') {
      if (!confirm(`Remove ${label(u)}'s Samadhan access? They will no longer be able to open Samadhan.`)) return;
    } else if (role === 'Admin' && u.role !== 'Admin') {
      if (!confirm(`Make ${label(u)} a Samadhan Admin? Admins can change every setting, role and automation.`)) return;
    } else if (u.role === 'Admin' && role !== 'Admin') {
      if (!confirm(`Take away ${label(u)}'s Admin role (make them ${role})?`)) return;
    }
    setBusyEmail(u.email);
    const ok = await act.run(
      () => (role === '' ? admin.removeAccess(u.email) : admin.setRole(u.email, role)),
      role === '' ? `${label(u)} no longer has Samadhan access.` : `${label(u)} is now ${role === 'Admin' ? 'an' : 'a'} ${role}.`,
    );
    setBusyEmail('');
    if (ok) {
      await load(term);
      if (isMe(u)) await reloadMeta();
    }
  };

  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, users ? users.filter(f.test).length : 0])) as Record<Filter, number>;
  const shown = users ? users.filter((FILTERS.find((f) => f.id === filter) ?? FILTERS[0]).test) : null;

  return (
    <div className="space-y-4">
      <Card
        title={<span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-accent" /> Roles &amp; access</span>}
        sub="Same as Emami Apps Manage Access - changes are recorded in its access history. People must be Emami Apps users first (Manage Access)."
        bodyClass="p-0"
      >
        <div className="space-y-3 p-4">
          <div className="grid gap-2 text-2xs text-muted sm:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r} className="rounded-xl border border-line bg-sunken/50 px-3 py-2">
                <Pill tone={r === 'Admin' ? 'accent' : r === 'Supervisor' ? 'warn' : 'neutral'}>{r}</Pill>
                <span className="ml-1.5">{ROLE_HINT[r]}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input className={cx(inputCls, 'pl-8')} placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter people">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cx('rounded-full border px-2.5 py-1 text-2xs font-semibold transition', filter === f.id ? 'border-accent bg-accent/10 text-accent' : 'border-line text-muted hover:bg-sunken')}
                >
                  {f.label} {users && <span className="num opacity-70">{counts[f.id]}</span>}
                </button>
              ))}
            </div>
          </div>
          {loadError && <Notice>{loadError}</Notice>}
          {act.msg && <Notice tone={act.msg.tone} onClose={() => act.setMsg(null)}>{act.msg.text}</Notice>}
        </div>
        {!shown ? (!loadError && <div className="p-4 pt-0"><Skeleton /></div>) : shown.length === 0 ? (
          <Empty title={term ? 'Nobody matches' : 'Nobody here'} icon={Users}>
            Only Emami Apps users are listed. Add a new person in Emami Apps Manage Access first.
          </Empty>
        ) : (
          <Table head={['Person', 'Samadhan role', 'Last seen', 'Emami Apps', '']}>
            {shown.map((u) => {
              const mine = isMe(u);
              const busy = busyEmail === u.email;
              return (
                <tr key={u.email} className={cx(!u.hubActive && 'opacity-60')}>
                  <td className="px-3 py-2"><Person email={u.email} name={u.name} sub={<>{u.email}{mine && <span className="ml-1 font-semibold text-accent">(you)</span>}</>} /></td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Samadhan role of ${label(u)}`}
                      className={cx('h-8 min-w-[8.5rem] text-xs', inputBase, u.role === 'Admin' && 'font-semibold text-accent', u.role === null && 'text-muted')}
                      value={u.role ?? ''}
                      disabled={busy || act.busy}
                      onChange={(e) => change(u, e.target.value as Role | '')}
                    >
                      {u.role === null && <option value="">No access</option>}
                      {ROLES.map((r) => <option key={r} value={r} disabled={mine && r !== 'Admin'}>{r}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{u.lastSeenAt ? relative(u.lastSeenAt) : 'Never'}</td>
                  <td className="px-3 py-2">{u.hubActive ? <Pill tone="good">Active</Pill> : <Pill tone="warn" title="Deactivated in Emami Apps Manage Access - they cannot sign in">Inactive</Pill>}</td>
                  <td className="px-3 py-2 text-right">
                    {u.role !== null && !mine && (
                      <Button size="sm" variant="ghost" disabled={busy || act.busy} onClick={() => change(u, '')} aria-label={`Remove ${label(u)}'s access`} title="Remove access">
                        <Trash2 size={13} /><span className="hidden sm:inline">Remove access</span>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {users && users.length >= 300 && <p className="px-4 pb-3 text-2xs text-faint">Showing the first 300 people - search to narrow it down.</p>}
      </Card>
    </div>
  );
}
