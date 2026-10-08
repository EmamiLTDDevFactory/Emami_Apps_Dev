'use client';
import { useMemo, useState } from 'react';
import { Download, Grid3x3, List, Search, Users } from 'lucide-react';
import type { RosterUser } from '@/lib/api';
import { appName } from '@/lib/apps';
import { LEVELS, downloadCsv, fmtNum, relative, stamp } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import type { Data } from './App';
import { Button, Card, Empty, LevelBadge, Person, Pill, Select, StatusBadge, Tabs, cx, inputBase } from './ui';

const ELEVATED = new Set(['Admin', 'CQA', 'Finance']);
const roleTone = (role: string) => (ELEVATED.has(role) ? 'accent' : 'neutral') as 'accent' | 'neutral';
const displayName = (u: RosterUser) => u.usage.name || nameFromEmail(u.email);

export default function AccessView({ data, onPerson }: { data: Data; onPerson: (email: string) => void }) {
  const { roster } = data;
  const [mode, setMode] = useState<'list' | 'matrix'>('list');
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [app, setApp] = useState('');

  const appIds = useMemo(() => {
    const count = new Map<string, number>();
    for (const u of roster) for (const g of u.apps) count.set(g.appId, (count.get(g.appId) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [roster]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roster
      .filter((u) => !needle || u.email.toLowerCase().includes(needle) || displayName(u).toLowerCase().includes(needle))
      .filter((u) => !level || u.accessLevel === level)
      .filter((u) => !status || (status === 'active') === u.isActive)
      .filter((u) => !app || u.apps.some((g) => g.appId === app))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [roster, q, level, status, app]);

  const exportCsv = () =>
    downloadCsv(
      `emami-apps-access-${stamp()}.csv`,
      ['Name', 'Email', 'Status', 'Access level', 'Apps granted', ...appIds.map(appName), 'Last sign-in'],
      rows.map((u) => {
        const role = new Map(u.apps.map((g) => [g.appId, g.depot ? `${g.role} (${g.depot})` : g.role]));
        return [displayName(u), u.email, u.isActive ? 'Active' : 'Inactive', u.accessLevel, u.apps.length, ...appIds.map((id) => role.get(id) ?? ''), u.usage.lastLogin ?? 'Never'];
      }),
    );

  const filtered = rows.length !== roster.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Who has access</h2>
          <p className="text-sm text-muted">Every authorized user, their hub access level and their role in each app.</p>
        </div>
        <Tabs label="Layout" value={mode} onChange={setMode} tabs={[
          { id: 'list', label: <span className="inline-flex items-center gap-1.5"><List size={13} /> List</span> },
          { id: 'matrix', label: <span className="inline-flex items-center gap-1.5"><Grid3x3 size={13} /> Matrix</span> },
        ]} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-2.5 shadow-card">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className={cx('h-9 w-full pl-8', inputBase)} />
        </label>
        <Select label="Access level" value={level} onChange={setLevel} options={[{ value: '', label: 'All levels' }, ...LEVELS.map((l) => ({ value: l, label: l }))]} />
        <Select label="Status" value={status} onChange={setStatus} options={[{ value: '', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <Select label="App" value={app} onChange={setApp} className="max-w-[220px]" options={[{ value: '', label: 'Any app' }, ...appIds.map((id) => ({ value: id, label: appName(id) }))]} />
        <Button onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Export</Button>
      </div>

      <p className="num px-1 text-2xs text-muted">
        Showing {fmtNum(rows.length)}{filtered && ` of ${fmtNum(roster.length)}`} users
        {filtered && <button type="button" className="ml-2 font-bold text-accent hover:underline" onClick={() => { setQ(''); setLevel(''); setStatus(''); setApp(''); }}>Clear filters</button>}
      </p>

      {!rows.length ? (
        <Card><Empty icon={Users} title="No users match these filters" /></Card>
      ) : mode === 'list' ? (
        <Card bodyClass="p-0">
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="border-b border-line bg-sunken/60 text-2xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-3 py-2.5">Level</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Apps &amp; roles</th>
                  <th className="px-4 py-2.5 text-right">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.email} onClick={() => onPerson(u.email)} className={cx('cursor-pointer align-middle transition hover:bg-sunken/70', !u.isActive && 'opacity-60')}>
                    <td className="max-w-[260px] px-4 py-2.5"><Person email={u.email} name={u.usage.name} /></td>
                    <td className="px-3 py-2.5"><LevelBadge level={u.accessLevel} /></td>
                    <td className="px-3 py-2.5"><StatusBadge active={u.isActive} /></td>
                    <td className="px-3 py-2.5">
                      {u.apps.length ? (
                        <div className="flex max-w-[460px] flex-wrap gap-1">
                          {u.apps.slice(0, 5).map((g) => (
                            <Pill key={g.appId} tone={roleTone(g.role)} title={`${appName(g.appId)}: ${g.role}${g.depot ? ` (${g.depot})` : ''}`}>
                              {appName(g.appId)}<span className="opacity-70">· {g.role}</span>
                            </Pill>
                          ))}
                          {u.apps.length > 5 && <Pill>+{u.apps.length - 5} more</Pill>}
                        </div>
                      ) : (
                        <span className="text-2xs text-faint">No apps granted</span>
                      )}
                    </td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right text-xs text-muted" title={u.usage.lastLogin ?? undefined}>{relative(u.usage.lastLogin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Matrix rows={rows} appIds={app ? [app] : appIds} onPerson={onPerson} />
      )}
    </div>
  );
}

/** Users down, apps across; a cell carries the role as text, tinted when it's an elevated role. */
function Matrix({ rows, appIds, onPerson }: { rows: RosterUser[]; appIds: string[]; onPerson: (email: string) => void }) {
  const [col, setCol] = useState<number | null>(null);
  return (
    <Card bodyClass="p-0">
      <div className="scroll-thin max-h-[70vh] overflow-auto">
        <table className="border-separate border-spacing-0 text-left" onMouseLeave={() => setCol(null)}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[230px] border-b border-r border-line bg-panel px-4 py-2 text-2xs font-bold uppercase tracking-wide text-muted">User</th>
              {appIds.map((id, i) => (
                <th key={id} className={cx('sticky top-0 z-10 h-32 w-[52px] min-w-[52px] border-b border-line bg-panel px-1 pb-2 align-bottom', col === i && 'bg-sunken')}>
                  <span className="mx-auto block max-h-[116px] rotate-180 truncate text-2xs font-semibold text-ink [writing-mode:vertical-rl]" title={appName(id)}>{appName(id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const grants = new Map(u.apps.map((g) => [g.appId, g]));
              return (
                <tr key={u.email} className="group">
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-panel px-4 py-1.5 font-normal group-hover:bg-sunken">
                    <button type="button" onClick={() => onPerson(u.email)} className="block w-full text-left"><Person email={u.email} name={u.usage.name} sub={u.accessLevel} /></button>
                  </th>
                  {appIds.map((id, i) => {
                    const g = grants.get(id);
                    return (
                      <td key={id} onMouseEnter={() => setCol(i)} className={cx('border-b border-line p-1 text-center group-hover:bg-sunken/60', col === i && 'bg-sunken/60')} title={g ? `${appName(id)}: ${g.role}${g.depot ? ` (${g.depot})` : ''}` : `${appName(id)}: no access`}>
                        {g ? (
                          <span className={cx('inline-grid h-6 min-w-[38px] place-items-center rounded-md px-1 text-[10px] font-bold', ELEVATED.has(g.role) ? 'bg-accent text-white' : 'bg-accent/10 text-accent')}>{g.role}</span>
                        ) : (
                          <span aria-label="No access" className="text-line">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="inline-grid h-4 min-w-[28px] place-items-center rounded bg-accent px-1 text-[9px] font-bold text-white">Admin</span> Elevated role (Admin, CQA, Finance)</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-grid h-4 min-w-[28px] place-items-center rounded bg-accent/10 px-1 text-[9px] font-bold text-accent">User</span> Standard role</span>
        <span>· No access</span>
      </div>
    </Card>
  );
}
