'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import StatusBadge from '../../components/StatusBadge';
import { formatDateTime, formatMonthLabel } from '../../utils/date';
import { computeTotals, getDisplayStatus } from '../../utils/timesheet';

export default function TimesheetHistoryPage() {
  const { currentUser, timesheets } = useApp();
  const router = useRouter();

  // Defense in depth - the sidepane already hides this link from a manager, but the route is
  // still reachable by a typed URL. The original app showed Dashboard instead; redirecting there
  // is the equivalent under real routing.
  useEffect(() => {
    if (currentUser?.role === 'manager') router.push('/');
  }, [currentUser?.role, router]);
  if (currentUser?.role === 'manager') return null;

  const rows = timesheets
    .filter((t: any) => t.userId === currentUser.id)
    .sort((a: any, b: any) => (a.monthStartDate < b.monthStartDate ? 1 : -1))
    .map((t: any) => {
      const submitEvent = [...t.history].reverse().find((h: any) => h.status === 'Submitted' || h.status === 'Resubmitted') as any;
      return {
        timesheet: t,
        status: getDisplayStatus(t),
        submittedDate: submitEvent?.date || null,
        total: computeTotals(t.entries, t.monthStartDate).monthTotal,
      };
    });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">My Timesheets History</h1>
        <p className="mt-1 text-sm text-inkSoft">Every month you&apos;ve logged, with its current status.</p>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-glassBorder bg-glassRust text-left text-ink">
                <th scope="col" className="px-4 py-3 font-semibold">Month</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Hours</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ timesheet, status, submittedDate, total }: any) => (
                <tr key={timesheet.id} className="border-b border-border/60 last:border-0 hover:bg-white/40">
                  <td className="px-4 py-3 text-ink">{formatMonthLabel(timesheet.monthStartDate)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3 text-inkSoft">{submittedDate ? formatDateTime(submittedDate) : '-'}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{total.toFixed(2).replace(/\.00$/, '')}h</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => router.push(`/my-timesheet/?month=${timesheet.monthStartDate}`)}
                      className="font-medium text-rust hover:text-rustDeep focus:outline-none focus-visible:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-inkSoft">
                    No timesheets yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
