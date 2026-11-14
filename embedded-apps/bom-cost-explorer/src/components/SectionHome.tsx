'use client';
/** The page of a side-pane section: one tile per screen. A costing screen opens in place when the page is shown inside the costing page (`onMode`), else by the costing route. */
import { ArrowRight } from 'lucide-react';
import { useNav } from './Shell';
import { BASE_PATH } from '@/lib/client/session';
import type { Mode } from '@/lib/query/schema';
import type { NavItem, SectionId } from '@/lib/nav/sections';
import { cx } from './ui';

export default function SectionHome({ id, onMode }: { id: SectionId; onMode?: (m: Mode) => void }) {
  const section = useNav().find((s) => s.id === id);
  if (!section) {
    return <div className="p-6 text-sm text-muted">This section is not available to you, or it is switched off in this build.</div>;
  }
  const Icon = section.icon;
  return (
    <div className="flex min-h-0 flex-1 animate-pageIn flex-col gap-5 overflow-y-auto p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-glow"><Icon size={22} /></span>
        <div>
          <h2 className="brand-text text-lg font-extrabold">{section.label}</h2>
          <p className="text-sm text-muted">{section.hint}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="list" aria-label={`${section.label} screens`}>
        {section.items.map((i) => <Tile key={i.id} item={i} onMode={onMode} />)}
      </div>
    </div>
  );
}

function Tile({ item, onMode }: { item: NavItem; onMode?: (m: Mode) => void }) {
  const Icon = item.icon;
  const cls = 'group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-line bg-panel p-4 text-left shadow-card transition duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-cardHover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-accent/[0.07] blur-2xl transition-opacity opacity-0 group-hover:opacity-100" />
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent/15 to-sim/10 text-accent transition group-hover:from-accent group-hover:to-accent-deep group-hover:text-white group-hover:shadow-glow"><Icon size={19} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink">{item.label}</span>
        <span className="mt-0.5 block text-xs text-muted">{item.hint}</span>
      </span>
      <ArrowRight size={16} className={cx('mt-1 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-accent')} />
    </>
  );
  if (item.mode) {
    const m = item.mode;
    return onMode
      ? <button type="button" role="listitem" onClick={() => onMode(m)} className={cls}>{body}</button>
      : <a role="listitem" href={`${BASE_PATH}/?mode=${m}`} className={cls}>{body}</a>;
  }
  return <a role="listitem" href={`${BASE_PATH}${item.path}`} className={cls}>{body}</a>;
}
