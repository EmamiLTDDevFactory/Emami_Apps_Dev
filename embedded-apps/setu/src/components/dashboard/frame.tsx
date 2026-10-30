'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { DASHBOARD_WIDGETS, type DashboardWidget } from '@/lib/types';
import { Card, cx } from '../ui';

export type Span = 'full' | 'wide' | 'one';

/** Every dashboard widget: its name and one-line description (Customise dialog, card headers) and its grid width. */
export const WIDGET_INFO: Record<DashboardWidget, { title: string; description: string; span: Span; overview?: boolean }> = {
  kpis: { title: 'Queue counters', description: 'Open, unassigned, overdue, due today, due in 4 h, on hold and mine - each opens its list.', span: 'full' },
  insights: { title: 'Insights & action points', description: 'What needs attention and why, worked out from the live queue.', span: 'full' },
  trends: { title: "Today's trends", description: 'Tickets received per hour against yesterday, with today\'s received, resolved and SLA figures.', span: 'full' },
  sla: { title: 'SLA health', description: 'First-response and resolution SLA, CSAT and the share of open tickets still on track.', span: 'one', overview: true },
  backlog: { title: 'Backlog trend', description: 'Open tickets at the end of each day, with tickets created and resolved per day.', span: 'wide', overview: true },
  ageing: { title: 'Ageing', description: 'Open tickets by age, split by severity.', span: 'one', overview: true },
  risk: { title: 'At risk', description: 'Tickets overdue or due within 2 hours, with a live countdown.', span: 'one', overview: true },
  byStatus: { title: 'Open by status', description: 'Open tickets per status.', span: 'one' },
  bySeverity: { title: 'Open by severity', description: 'Open tickets per severity (Category -> Function matrix).', span: 'one' },
  agentLoad: { title: 'Agent load', description: 'Open tickets per agent and their current status.', span: 'one' },
  leaderboard: { title: 'Agent leaderboard', description: 'Resolved in the last 7 days, open, average first response and CSAT per agent.', span: 'wide', overview: true },
  regionStatus: { title: 'Region × status', description: 'Heat grid of open tickets by region and status.', span: 'wide', overview: true },
  categories: { title: 'Open by category', description: 'Tiles sized by the number of open tickets in each category.', span: 'one', overview: true },
  sources: { title: 'Sources', description: 'Where tickets created in the period came from.', span: 'one', overview: true },
  byGroup: { title: 'Unresolved by group', description: 'Group × status table of unresolved tickets.', span: 'wide' },
  todos: { title: 'My to-dos', description: 'Your own reminders, optionally linked to a ticket.', span: 'one' },
  csat: { title: 'Customer satisfaction', description: 'Survey answers in the last 30 days.', span: 'one' },
  recent: { title: 'Recent activity', description: 'What happened across all tickets in the last 3 days.', span: 'wide' },
};

export const SPAN_CLASS: Record<Span, string> = { full: 'md:col-span-2 xl:col-span-3', wide: 'md:col-span-2', one: '' };

/** Keep known widget ids, once each, in the given order; null when the value is not a list. */
export function cleanLayout(v: unknown): DashboardWidget[] | null {
  if (!Array.isArray(v)) return null;
  const known = new Set<string>(DASHBOARD_WIDGETS);
  const out: DashboardWidget[] = [];
  for (const x of v) if (typeof x === 'string' && known.has(x) && !out.includes(x as DashboardWidget)) out.push(x as DashboardWidget);
  return out;
}

export const WidgetCtx = createContext<{ id: DashboardWidget; onHide?: () => void } | null>(null);

/** Card for a dashboard widget: fills its grid cell (so a row lines up) and carries the small "hide" control. */
export function WCard({ title, sub, actions, children, className, bodyClass, stale }: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  /** Refetching: keep the previous render, dimmed. */
  stale?: boolean;
}) {
  const ctx = useContext(WidgetCtx);
  const name = ctx ? WIDGET_INFO[ctx.id].title : '';
  return (
    <Card
      className={cx('flex h-full min-w-0 flex-col', className)}
      bodyClass={cx('min-w-0 flex-1 motion-safe:transition-opacity', stale && 'opacity-60', bodyClass)}
      title={title ?? name}
      sub={sub}
      actions={
        (actions || ctx?.onHide) && (
          <>
            {actions}
            {ctx?.onHide && (
              <button
                type="button"
                onClick={ctx.onHide}
                title={`Hide "${name}" from my dashboard`}
                aria-label={`Hide ${name} from my dashboard`}
                className="grid h-7 w-7 place-items-center rounded-lg text-faint transition-colors hover:bg-sunken hover:text-ink"
              >
                <EyeOff size={13} />
              </button>
            )}
          </>
        )
      }
    >
      {children}
    </Card>
  );
}

/** Small empty-state line used inside widgets. */
export function EmptyLine({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 py-6 text-center text-sm text-muted">
      {icon}
      <p>{children}</p>
    </div>
  );
}
