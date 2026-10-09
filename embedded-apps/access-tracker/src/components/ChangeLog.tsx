'use client';
import { useMemo, useState } from 'react';
import { Download, History, Minus, Pencil, Plus, Search } from 'lucide-react';
import type { AccessChange } from '@/lib/api';
import { appName } from '@/lib/apps';
import { CHANGE_LABEL, changeTone, describeChange, downloadCsv, fmtDateTime, fmtNum, stamp } from '@/lib/format';
import { nameFromEmail } from '@/lib/hub';
import type { Data } from './App';
import { ChangeRow } from './feed';
import { Button, Card, Empty, Kpi, Select, cx, inputBase } from './ui';

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '', label: 'All loaded' },
];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ChangeLog({ data, onPerson }: { data: Data; onPerson: (email: string) => void }) {
  const { history } = data;
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [by, setBy] = useState('');
  const [app, setApp] = useState('');
  const [period, setPeriod] = useState('30');

  const admins = useMemo(() => [...new Set(history.map((c) => c.changedBy).filter((x): x is string => Boolean(x)))].sort(), [history]);
  const apps = useMemo(() => [...new Set(history.map((c) => c.appId).filter((x): x is string => Boolean(x)))].sort((a, b) => appName(a).localeCompare(appName(b))), [history]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const since = period ? Date.now() - Number(period) * 86_400_000 : 0;
    return history.filter(
      (c) =>
        Date.parse(c.occurredAt) >= since &&
        (!type || c.changeType === type) &&
        (!by || c.changedBy === by) &&
        (!app || c.appId === app) &&
        (!needle || c.targetEmail.includes(needle) || nameFromEmail(c.targetEmail).toLowerCase().includes(needle) || describeChange(c).toLowerCase().includes(needle)),
    );
  }, [history, q, type, by, app, period]);

  const groups = useMemo(() => {
    const out: { label: string; items: AccessChange[] }[] = [];
    for (const c of rows) {
      const label = dayLabel(c.occurredAt);
      if (out[out.length - 1]?.label === label) out[out.length - 1].items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [rows]);

  const tally = { good: 0, bad: 0, accent: 0 };
  for (const c of rows) tally[changeTone(c)]++;

  const exportCsv = () =>
    downloadCsv(
      `emami-apps-access-changes-${stamp()}.csv`,
      ['When', 'User', 'Email', 'Change type', 'App', 'Old value', 'New value', 'Description', 'Changed by'],
      rows.map((c) => [fmtDateTime(c.occurredAt), nameFromEmail(c.targetEmail), c.targetEmail, CHANGE_LABEL[c.changeType], c.appId ? appName(c.appId) : '', c.oldValue, c.newValue, describeChange(c), c.changedBy ?? 'System']),
    );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Change log</h2>
        <p className="text-sm text-muted">Every add, removal, activation, level and app-role change made in Manage Access - who did it and when.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi icon={Plus} tone="good" label="Grants" value={fmtNum(tally.good)} sub="Users added, apps granted, activations" />
        <Kpi icon={Minus} tone="bad" label="Revocations" value={fmtNum(tally.bad)} sub="Users removed, apps revoked, deactivations" />
        <Kpi icon={Pencil} label="Edits" value={fmtNum(tally.accent)} sub="Role, level and mobile changes" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-2.5 shadow-card">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user or change" aria-label="Search changes" className={cx('h-9 w-full pl-8', inputBase)} />
        </label>
        <Select label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        <Select label="Change type" value={type} onChange={setType} options={[{ value: '', label: 'All types' }, ...Object.entries(CHANGE_LABEL).map(([value, label]) => ({ value, label }))]} />
        <Select label="App" value={app} onChange={setApp} className="max-w-[200px]" options={[{ value: '', label: 'Any app' }, ...apps.map((id) => ({ value: id, label: appName(id) }))]} />
        <Select label="Changed by" value={by} onChange={setBy} className="max-w-[200px]" options={[{ value: '', label: 'Anyone' }, ...admins.map((e) => ({ value: e, label: nameFromEmail(e) }))]} />
        <Button onClick={exportCsv} disabled={!rows.length}><Download size={14} /> Export</Button>
      </div>

      <Card bodyClass="px-4 py-2">
        {groups.length ? (
          <div className="space-y-3">
            {groups.map((g) => (
              <section key={g.label}>
                <h3 className="sticky top-0 z-10 -mx-4 flex items-center justify-between border-b border-line bg-panel/95 px-4 py-2 text-2xs font-bold uppercase tracking-wide text-muted backdrop-blur">
                  {g.label}
                  <span className="num font-semibold normal-case tracking-normal">{g.items.length} change{g.items.length === 1 ? '' : 's'}</span>
                </h3>
                <ul className="divide-y divide-line">{g.items.map((c) => <ChangeRow key={c.id} c={c} onPerson={onPerson} timeOnly />)}</ul>
              </section>
            ))}
          </div>
        ) : (
          <Empty icon={History} title="No changes in this view">Try a longer period or clear the filters.</Empty>
        )}
      </Card>
      <p className="px-1 text-2xs text-faint">The server returns the latest {fmtNum(history.length)} changes; older history stays in the database.</p>
    </div>
  );
}
