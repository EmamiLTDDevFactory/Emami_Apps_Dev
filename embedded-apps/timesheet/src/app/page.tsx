'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, History as HistoryIcon, Users, BarChart3, CalendarClock, Clock, Palmtree } from 'lucide-react';
import { useApp } from '../context/AppContext';
import StatusBadge from '../components/StatusBadge';
import LeaveDetailsModal from '../components/LeaveDetailsModal';
import { addMonths, currentMonthStartIso, formatMonthLabel, formatMonthShort, parseISODate, recentMonthStarts, toISODate } from '../utils/date';
import { computeTotals, expectedMonthlyHours, getDisplayStatus, isActionable, isOverdue } from '../utils/timesheet';

const MANAGER_CARDS = [
  {
    href: '/team-approvals/',
    label: 'Team Approvals',
    description: "Review and approve your team's submitted timesheets.",
    icon: ClipboardCheck,
    accent: 'bg-rust',
  },
  {
    href: '/team-history/',
    label: 'Team Timesheets History',
    description: "Browse your team's timesheets from past months.",
    icon: HistoryIcon,
    accent: 'bg-teal',
  },
  {
    href: '/manage-team/',
    label: 'Manage Team',
    description: 'Manage projects, tasks and task assignments.',
    icon: Users,
    accent: 'bg-blue',
  },
  {
    href: '/team-reports/',
    label: 'Team Reports',
    description: 'See hours and trends across your team.',
    icon: BarChart3,
    accent: 'bg-amber',
  },
];

export default function DashboardPage() {
  const { currentUser, getTimesheet, teamSettings, directReports, getLeaveBalance, timesheets, unassignedEmployees, workingDayOverridesSet } = useApp();
  const [showLeaveDetails, setShowLeaveDetails] = useState(false);
  const router = useRouter();

  const thisMonth = currentMonthStartIso();
  const isManager = currentUser.role === 'manager';
  const lastCompletedMonth = toISODate(addMonths(parseISODate(thisMonth), -1));
  const pendingApprovals = isManager
    ? directReports.filter((u: any) => isActionable(getTimesheet(u.id, lastCompletedMonth) || {})).length
    : 0;

  // Team pulse: each direct report's standing for the last fully-completed month, used for both
  // the stat tiles and the roster list below the section cards.
  const teamPulse = useMemo(() => {
    if (!isManager) return [];
    return directReports
      .map((user: any) => {
        const ts = getTimesheet(user.id, lastCompletedMonth);
        const overdueTs = isOverdue(ts || { status: 'Draft', monthStartDate: lastCompletedMonth }, teamSettings);
        const status = overdueTs ? 'Overdue' : getDisplayStatus(ts || { status: 'Draft' });
        const hours = ts ? computeTotals(ts.entries, lastCompletedMonth).monthTotal : 0;
        return { user, status, hours };
      })
      .sort((a: any, b: any) => a.user.name.localeCompare(b.user.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, directReports, lastCompletedMonth]);

  const teamStats = useMemo(
    () => ({
      size: teamPulse.length,
      approved: teamPulse.filter((r: any) => r.status === 'Approved' || r.status === 'Locked').length,
      pending: teamPulse.filter((r: any) => r.status === 'Submitted' || r.status === 'Resubmitted').length,
      overdue: teamPulse.filter((r: any) => r.status === 'Overdue').length,
      totalHours: teamPulse.reduce((sum: number, r: any) => sum + r.hours, 0),
    }),
    [teamPulse]
  );

  const currentTimesheet = getTimesheet(currentUser.id, thisMonth);
  const totals = useMemo(() => computeTotals(currentTimesheet?.entries || [], thisMonth), [currentTimesheet, thisMonth]);
  const overdue = isOverdue(currentTimesheet || { status: 'Draft', monthStartDate: thisMonth }, teamSettings);
  const displayStatus = overdue ? 'Overdue' : getDisplayStatus(currentTimesheet || { status: 'Draft' });
  const expected = expectedMonthlyHours(thisMonth, workingDayOverridesSet);

  const pastMonths = recentMonthStarts(thisMonth, 5)
    .slice(1)
    .map((month) => {
      const ts = getTimesheet(currentUser.id, month);
      const leaveCount = ts ? ts.entries.filter((e: any) => e.leaveType).length : 0;
      return { month, timesheet: ts, status: ts ? getDisplayStatus(ts) : 'Draft', leaveCount };
    });

  const pct = Math.min(100, Math.round((totals.monthTotal / expected) * 100));
  const myLeaveBalance = getLeaveBalance(currentUser.id);

  // Every leave-tagged entry across this user's timesheets, newest first - the breakdown behind
  // the balance card's allocated/used/balance numbers.
  const myLeaveEntries = useMemo(
    () =>
      timesheets
        .filter((t: any) => t.userId === currentUser.id)
        .flatMap((t: any) =>
          t.entries.filter((e: any) => e.leaveType && e.leaveType !== 'Public Holiday').map((e: any) => ({ ...e, monthStartDate: t.monthStartDate }))
        )
        .sort((a: any, b: any) => (a.date < b.date ? 1 : -1)),
    [timesheets, currentUser.id]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Welcome back, {currentUser.name.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-sm text-inkSoft">Here&apos;s where things stand this month.</p>
      </div>

      {isManager && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {MANAGER_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.href}
                type="button"
                onClick={() => router.push(card.href)}
                className="glass-card group relative px-6 py-6 text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-rust"
              >
                <div className={`absolute -top-6 left-4 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-card ${card.accent}`}>
                  <Icon size={26} />
                </div>
                <div className="mt-8">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold text-ink">{card.label}</p>
                    {card.href === '/team-approvals/' && pendingApprovals > 0 && <span className="pill bg-rust text-white">{pendingApprovals} pendings</span>}
                    {/* Anyone who signed in via the hub but has no manager yet - shared across every
                        manager (see AppContext.tsx's claimEmployee), so this is a "someone should look
                        at this" nudge, not a count owned specifically by this manager. */}
                    {card.href === '/manage-team/' && unassignedEmployees.length > 0 && (
                      <span className="pill bg-amberBg text-amber">{unassignedEmployees.length} waiting to join</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-inkSoft">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {isManager && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="glass-card overflow-hidden">
            <div className="border-b border-glassBorder bg-white/40 px-6 py-4">
              <h2 className="font-semibold text-ink">Team pulse</h2>
              <p className="mt-0.5 text-xs text-inkSoft">{formatMonthLabel(lastCompletedMonth)}</p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border">
              {[
                { label: 'Team size', value: teamStats.size, dot: 'bg-rust' },
                { label: 'Approved', value: teamStats.approved, dot: 'bg-green' },
                { label: 'Pending review', value: teamStats.pending, dot: 'bg-amber' },
                { label: 'Overdue', value: teamStats.overdue, dot: 'bg-red' },
              ].map((stat) => (
                <div key={stat.label} className="bg-white/60 p-5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${stat.dot}`} aria-hidden="true" />
                    <span className="text-xs font-medium text-inkSoft">{stat.label}</span>
                  </div>
                  <p className="mt-1.5 text-2xl font-bold text-ink">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-glassBorder px-6 py-3.5">
              <span className="text-xs font-medium text-inkSoft">Total hours logged</span>
              <span className="text-sm font-bold text-ink">{teamStats.totalHours.toFixed(2).replace(/\.00$/, '')}h</span>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="border-b border-glassBorder bg-white/40 px-6 py-4">
              <h2 className="font-semibold text-ink">Team status</h2>
              <p className="mt-0.5 text-xs text-inkSoft">Who&apos;s done, who&apos;s waiting on review</p>
            </div>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto">
              {teamPulse.map(({ user, status, hours }: any) => {
                const reviewable = status === 'Submitted' || status === 'Resubmitted';
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      onClick={() => reviewable && router.push(`/team-approvals/?reviewUserId=${user.id}&reviewMonth=${lastCompletedMonth}`)}
                      disabled={!reviewable}
                      className={`flex w-full items-center gap-3 px-6 py-3 text-left transition-colors focus:outline-none disabled:cursor-default ${
                        reviewable ? 'hover:bg-white/50' : ''
                      }`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-inkSoft to-ink text-xs font-semibold text-white">
                        {user.name[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{user.name}</p>
                        <p className="text-xs text-inkSoft">{hours.toFixed(2).replace(/\.00$/, '')}h logged</p>
                      </div>
                      <StatusBadge status={status} />
                    </button>
                  </li>
                );
              })}
              {teamPulse.length === 0 && <li className="px-6 py-6 text-center text-sm text-inkSoft">No direct reports yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {!isManager && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="glass-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rustLight to-rust text-white shadow-card">
                <CalendarClock size={20} />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-inkSoft">Current month status</h2>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <StatusBadge status={displayStatus} className="px-3 py-1.5 text-sm" />
              <span className="text-sm text-inkSoft">{formatMonthLabel(thisMonth)}</span>
            </div>
            {displayStatus === 'Rejected' && currentTimesheet?.managerComment && (
              <p className="mt-3 rounded-lg border border-redBg bg-redBg px-3 py-2 text-sm text-red">Manager feedback: {currentTimesheet.managerComment}</p>
            )}
            <button type="button" onClick={() => router.push('/my-timesheet/')} className="btn-primary mt-4">
              Open this month&apos;s timesheet
            </button>
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal to-blue text-white shadow-card">
                <Clock size={20} />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-inkSoft">Hours logged this month</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-3xl font-bold text-ink">{totals.monthTotal.toFixed(2).replace(/\.00$/, '')}</span>
              <span className="mb-1 text-inkSoft">/ {expected}h expected</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-teal to-blue transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-inkSoft">{pct}% of expected monthly hours logged</p>
          </div>

          <button type="button" onClick={() => setShowLeaveDetails(true)} className="glass-card p-6 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-rust">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber to-rust text-white shadow-card">
                <Palmtree size={20} />
              </div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-inkSoft">Leave balance</h2>
            </div>
            <div className="mt-4 flex items-end gap-2">
              <span className={`text-3xl font-bold ${myLeaveBalance.balance < 0 ? 'text-red' : 'text-ink'}`}>{myLeaveBalance.balance}</span>
              <span className="mb-1 text-inkSoft">/ {myLeaveBalance.allocated} days a year</span>
            </div>
            <p className="mt-2 text-xs text-inkSoft">{myLeaveBalance.used} taken so far - set by your manager</p>
          </button>
        </div>
      )}

      {showLeaveDetails && <LeaveDetailsModal balance={myLeaveBalance} entries={myLeaveEntries} onClose={() => setShowLeaveDetails(false)} />}

      {!isManager && (
        <div className="glass-card overflow-hidden">
          <div className="border-b border-glassBorder bg-white/40 px-6 py-4">
            <h2 className="font-semibold text-ink">Recent months</h2>
          </div>
          <ul className="divide-y divide-border">
            {pastMonths.map(({ month, timesheet, status, leaveCount }) => (
              <li key={month}>
                <button
                  type="button"
                  onClick={() => router.push(`/my-timesheet/?month=${month}`)}
                  className="flex w-full items-center justify-between px-6 py-3.5 text-left transition-colors hover:bg-white/50 focus:outline-none"
                >
                  <span className="text-sm font-medium text-ink">{formatMonthShort(month)}</span>
                  <span className="flex items-center gap-3">
                    {leaveCount > 0 && (
                      <span className="pill bg-glassRust text-rust">
                        {leaveCount} leave{leaveCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {timesheet && <span className="text-xs text-inkSoft">{computeTotals(timesheet.entries, month).monthTotal.toFixed(2).replace(/\.00$/, '')}h</span>}
                    <StatusBadge status={status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
