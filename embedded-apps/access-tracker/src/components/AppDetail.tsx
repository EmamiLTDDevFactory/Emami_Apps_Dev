'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download, MousePointerClick, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { getAppUserStats, type OpenStat, type RosterUser } from '@/lib/api';
import { APP_CATALOG, appName } from '@/lib/apps';
import { downloadCsv, fmtDate, fmtDateTime, fmtNum, relative, stamp } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import type { Data } from './App';
import { Button, Card, Drawer, Empty, LevelBadge, Person, Pill, Skeleton, StatusBadge, Tabs, cx } from './ui';

const ELEVATED = new Set(['Admin', 'CQA', 'Finance']);
type Filter = 'all' | 'elevated' | 'unused';

interface Row {
  user: RosterUser;
  role: string;
  depot?: string | null;
  stat?: OpenStat;
}

/** Everything about one app: who holds access (role, status, how much they use it), who used it
 * without a current grant, and the headline numbers. Grants come from the roster already loaded;
 * per-person opens come from /admin/app/:appId/users. */
export default function AppDetail({ appId, data, onClose, onPerson }: { appId: string | null; data: Data; onClose: () => void; onPerson: (email: string) => void }) {
  const [stats, setStats] = useState<(OpenStat & { email: string })[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!appId) return;
    setStats(null);
    setError('');
    setFilter('all');
    getAppUserStats(appId).then(setStats, (e: Error) => setError(e.message));
  }, [appId]);

  const { rows, former } = useMemo(() => {
    if (!appId) return { rows: [] as Row[], former: [] as (OpenStat & { email: string })[] };
    const byEmail = new Map((stats ?? []).map((s) => [s.email, s]));
    const rows: Row[] = [];
    for (const user of data.roster) {
      const g = user.apps.find((a) => a.appId === appId);
      if (g) rows.push({ user, role: g.role, depot: g.depot, stat: byEmail.get(user.email) });
    }
    rows.sort((a, b) => (b.stat?.opens ?? 0) - (a.stat?.opens ?? 0) || (a.user.usage.name || a.user.email).localeCompare(b.user.usage.name || b.user.email));
    const granted = new Set(rows.map((r) => r.user.email));
    return { rows, former: (stats ?? []).filter((s) => !granted.has(s.email)) };
  }, [appId, data.roster, stats]);

  if (!appId) return null;

  const meta = APP_CATALOG.find((a) => a.id === appId);
  const appStat = data.appStats.find((a) => a.appId === appId);
  const elevated = rows.filter((r) => ELEVATED.has(r.role)).length;
  const used = rows.filter((r) => r.stat).length;
  const unused = rows.length - used;
  const roles = [...new Set(rows.map((r) => r.role))];
  const shown = rows.filter((r) => (filter === 'elevated' ? ELEVATED.has(r.role) : filter === 'unused' ? !r.stat : true));

  const exportCsv = () =>
    downloadCsv(
      `${appId}-access-${stamp()}.csv`,
      ['Name', 'Email', 'Role', 'Depot', 'Access level', 'Status', 'Opens', 'First opened', 'Last opened', 'Has access now'],
      [
        ...rows.map((r) => [r.user.usage.name || nameFromEmail(r.user.email), r.user.email, r.role, r.depot ?? '', r.user.accessLevel, r.user.isActive ? 'Active' : 'Inactive', r.stat?.opens ?? 0, fmtDate(r.stat?.firstOpened ?? null), fmtDate(r.stat?.lastOpened ?? null), 'Yes']),
        ...former.map((s) => [nameFromEmail(s.email), s.email, '', '', '', '', s.opens, fmtDate(s.firstOpened), fmtDate(s.lastOpened), 'No']),
      ],
    );

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={
        <div>
          <div className="text-2xs font-bold uppercase tracking-wide text-muted">{meta?.cat ?? 'App'}</div>
          <div className="text-lg font-extrabold">{appName(appId)}</div>
          <div className="mt-0.5 flex flex-wrap gap-1">{roles.map((r) => <Pill key={r} tone={ELEVATED.has(r) ? 'accent' : 'neutral'}>{rows.filter((x) => x.role === r).length} {r}</Pill>)}</div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { icon: Users, label: 'With access', value: fmtNum(rows.length), sub: `${rows.filter((r) => r.user.isActive).length} active` },
            { icon: ShieldCheck, label: 'Admin roles', value: fmtNum(elevated), sub: 'Admin, CQA or Finance' },
            { icon: UserCheck, label: 'Have opened it', value: stats ? fmtNum(used) : '…', sub: stats ? `${rows.length ? Math.round((used / rows.length) * 100) : 0}% of those with access` : ' ' },
            { icon: MousePointerClick, label: 'Total opens', value: fmtNum(appStat?.opens ?? 0), sub: appStat?.lastOpened ? `Last ${relative(appStat.lastOpened)}` : 'Never opened' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-panel px-3 py-2.5 shadow-card">
              <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted"><s.icon size={12} className="text-accent" /> {s.label}</div>
              <div className="num mt-0.5 text-xl font-extrabold">{s.value}</div>
              <div className="num truncate text-2xs text-muted">{s.sub}</div>
            </div>
          ))}
        </div>

        <Card
          title="People with access"
          sub="Role in this app, access level, status and how often they open it"
          actions={<Button size="sm" onClick={exportCsv}><Download size={13} /> Export</Button>}
          bodyClass="p-0"
        >
          <div className="border-b border-line px-4 py-2.5">
            <Tabs label="Filter people" value={filter} onChange={setFilter} tabs={[
              { id: 'all', label: `All (${rows.length})` },
              { id: 'elevated', label: `Admin roles (${elevated})` },
              { id: 'unused', label: `Never opened (${stats ? unused : '…'})` },
            ]} />
          </div>
          {error && <p className="px-4 pt-3 text-sm text-bad">{error}</p>}
          {!rows.length ? (
            <Empty icon={Users} title="Nobody has access to this app yet">Grant it in the hub&apos;s Manage Access screen.</Empty>
          ) : !shown.length ? (
            <Empty title="Nobody in this filter" />
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((r) => (
                <li key={r.user.email}>
                  <button type="button" onClick={() => onPerson(r.user.email)} className={cx('grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition hover:bg-sunken/70 sm:grid-cols-[minmax(0,1fr)_96px_110px]', !r.user.isActive && 'opacity-60')}>
                    <Person
                      email={r.user.email}
                      name={r.user.usage.name}
                      sub={<span className="inline-flex flex-wrap items-center gap-2"><LevelBadge level={r.user.accessLevel} /><StatusBadge active={r.user.isActive} /></span>}
                    />
                    <span className="justify-self-start sm:justify-self-center">
                      <Pill tone={ELEVATED.has(r.role) ? 'accent' : 'neutral'} title={r.depot ? `Depot: ${r.depot}` : undefined}>{r.role}{r.depot ? ` · ${r.depot}` : ''}</Pill>
                    </span>
                    <span className="hidden text-right sm:block">
                      {!stats ? <span className="skeleton ml-auto block h-4 w-16 rounded" /> : r.stat ? (
                        <>
                          <span className="num block text-sm font-bold">{fmtNum(r.stat.opens)} <span className="text-2xs font-normal text-muted">opens</span></span>
                          <span className="block text-2xs text-muted" title={fmtDateTime(r.stat.lastOpened)}>last {relative(r.stat.lastOpened)}</span>
                        </>
                      ) : (
                        <span className="text-2xs font-semibold text-warn">Never opened</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {!stats && !error ? (
          <Skeleton rows={2} />
        ) : former.length > 0 && (
          <Card title="Used it, no access now" sub="Opened this app in the past but no longer hold a grant" bodyClass="p-0">
            <ul className="divide-y divide-line">
              {former.map((s) => (
                <li key={s.email}>
                  <button type="button" onClick={() => onPerson(s.email)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sunken/70">
                    <div className="min-w-0 flex-1"><Person email={s.email} sub={`First ${fmtDate(s.firstOpened)} · last ${relative(s.lastOpened)}`} /></div>
                    <span className="num text-sm font-bold">{fmtNum(s.opens)}</span>
                    <span className="text-2xs text-muted">opens</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Drawer>
  );
}
