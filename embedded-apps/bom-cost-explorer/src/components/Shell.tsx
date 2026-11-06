'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import TutorialButton from './TutorialButton';
import { ArrowLeft, Boxes, Calendar, ChevronRight, ClipboardList, Layers, Menu, Scale, Tags, Truck, User, X, type LucideIcon } from 'lucide-react';
import { WAC_ENABLED, wacNavVisible } from '@/lib/wac/flag';
import { PSUM_ENABLED } from '@/lib/psum/flag';
import { COGM_ENABLED } from '@/lib/margin/flag';
import { CK_ENABLED } from '@/lib/ck/flag';
import { BUDGET_ENABLED } from '@/lib/budget/flag';
import { activeOf, navSections, sectionPath, type NavSection, type PlanNav, type SectionId } from '@/lib/nav/sections';
import { PriceContextBar, PriceContextProvider } from './price-context/slots';
import { COGM_SO_ENABLED } from '@/lib/so/flag';
import { fetchAppRole, fetchIsAdmin } from '@/lib/client/hubAccess';
import { MODE_LABEL, type Mode } from '@/lib/query/schema';
import { BASE_PATH } from '@/lib/client/session';
import { leaveApp } from '@/lib/useScreenHistory';
import { cx } from './ui';

/** Same shell as every sibling embedded app (Rate Auction, PO Approval...): white side pane with the
 * Emami Apps logo, a plum "Back to Emami Apps" bar, and a white header with user / date chips. */

export const MODE_ICON: Record<Mode, LucideIcon> = { B: Layers, C: Scale, R: Tags, F: Truck, M: Boxes };

/** The visible side-pane sections for this person, shared with the section pages. */
const NavContext = createContext<NavSection[]>([]);
export const useNav = (): NavSection[] => useContext(NavContext);

function useIsWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return wide;
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}


export type { PlanNav };

function NavPane({ sections, active, onHome, open, onClose, wide }: { sections: NavSection[]; active?: SectionId; onHome?: (id: SectionId) => void; open: boolean; onClose: () => void; wide: boolean }) {
  const pane = wide
    ? 'relative w-64 shrink-0 border-r border-line bg-panel'
    : cx('fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-panel shadow-pop transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full');
  return (
    <>
      {!wide && open && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={cx(pane, 'flex flex-col no-print')} aria-label="Sections">
        <div className="border-b border-line">
          {!wide && (
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={onClose} aria-label="Close menu" className="p-1 text-muted hover:text-ink"><X size={20} /></button>
            </div>
          )}
          <div className={cx('flex items-center justify-center px-4 pb-5', wide ? 'pt-5' : 'pt-1')}>
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
            </a>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {sections.map((s) => <SectionLink key={s.id} s={s} active={active === s.id} onHome={onHome} onClose={onClose} />)}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Costs come from SAP <span className="font-mono">ZMM_BOM_COST_SRV</span>. Simulations stay in your browser.
        </div>
      </aside>
    </>
  );
}

/** A section opens its page of tiles (in place on the costing page, else the section route); a section with one screen opens that screen. */
function SectionLink({ s, active, onHome, onClose }: { s: NavSection; active: boolean; onHome?: (id: SectionId) => void; onClose: () => void }) {
  const Icon = s.icon;
  const path = sectionPath(s);
  const cls = cx('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken');
  const body = (
    <>
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg transition', active ? 'bg-gradient-to-br from-accent to-accent-deep text-white shadow-sm' : 'bg-sunken text-accent group-hover:bg-panel')}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{s.label}</span>
        <span className={cx('block truncate text-[11px]', active ? 'text-accent/80' : 'text-muted')}>{s.items.length === 1 ? s.items[0].hint : `${s.items.length} screens`}</span>
      </span>
      <ChevronRight size={15} className={cx('shrink-0 transition', active ? 'text-accent' : 'text-faint group-hover:text-accent')} />
    </>
  );
  if (path) return <a href={`${BASE_PATH}${path}`} aria-current={active ? 'page' : undefined} className={cls}>{body}</a>;
  return <button type="button" aria-current={active ? 'page' : undefined} className={cls} onClick={() => { if (onHome) onHome(s.id); else window.location.href = `${BASE_PATH}/section/?s=${s.id}`; onClose(); }}>{body}</button>;
}

/** SAP system + app environment, always visible; red for production SAP (NWP). */
export function EnvBadge({ system, appEnv }: { system: string; appEnv: string }) {
  const prod = system === 'NWP';
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1', prod ? 'bg-bad text-white ring-bad' : 'bg-good/10 text-good ring-good/30')}
      title={`SAP system ${system} · ${appEnv}`}
    >
      SAP {system} · {appEnv}
    </span>
  );
}

export default function Shell({ mode, email, actions, children, env, onBack, planActive, section, onHome }: { mode: Mode; /** kept for the callers; the section pages switch the screen themselves */ onMode?: (m: Mode) => void; email: string; actions?: ReactNode; children: ReactNode; env: { system: string; appEnv: string }; onBack?: () => void; planActive?: PlanNav; /** the section whose page of tiles is showing */ section?: SectionId; /** the costing page opens a section page in place; without it the section route is opened */ onHome?: (id: SectionId) => void }) {
  // Admin-only nav item of the Actual vs rate sources page; with the flag off no request is made.
  const [wacAdmin, setWacAdmin] = useState(false);
  useEffect(() => { if ((WAC_ENABLED || CK_ENABLED || COGM_SO_ENABLED || PSUM_ENABLED) && email) void fetchIsAdmin(email).then(setWacAdmin); }, [email]);
  // Margin module: the person's role of this app (one lookup per session); with the flag off no request is made.
  const [marginRole, setMarginRole] = useState('');
  useEffect(() => { if (COGM_ENABLED && email) void fetchAppRole(email).then(setMarginRole); }, [email]);
  // Budget costing: the person's role of this app; with the flag off no request is made.
  const [budgetRole, setBudgetRole] = useState('');
  useEffect(() => { if (BUDGET_ENABLED && email) void fetchAppRole(email).then(setBudgetRole); }, [email]);
  const sections = useMemo(() => navSections({ wac: wacNavVisible(WAC_ENABLED, wacAdmin), ck: wacNavVisible(CK_ENABLED, wacAdmin), so: wacNavVisible(COGM_SO_ENABLED, wacAdmin), psum: wacNavVisible(PSUM_ENABLED, wacAdmin), marginRole, budgetRole }), [wacAdmin, marginRole, budgetRole]);
  const now = activeOf(sections, planActive, mode, section);
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })), []);
  const Icon = MODE_ICON[mode];
  return (
    <PriceContextProvider email={email}>
    <NavContext.Provider value={sections}>
    <div className="flex h-screen overflow-clip bg-plum">
      <NavPane sections={sections} active={now.section?.id} onHome={onHome} open={open} onClose={() => setOpen(false)} wide={wide} />
      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <div className="flex bg-plum no-print">
          {/* In-app "Back" to the previous screen; without a screen history it leaves the app. */}
          <button type="button" onClick={onBack ?? leaveApp} className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep no-print">
            <ArrowLeft size={14} /> Back
          </button>
        </div>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5 no-print">
          {!wide && (
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 text-ink"><Menu size={22} /></button>
          )}
          <h1 className="truncate text-[15px] font-extrabold text-ink">Costing Cockpit</h1>
          <span className="hidden items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-accent sm:inline-flex">
            {now.section ? <><now.section.icon size={11} /> {now.section.label}{now.item ? <> <ChevronRight size={10} /> {now.item.label}</> : null}</> : planActive ? <><ClipboardList size={11} /> Production plan</> : <><Icon size={11} /> {MODE_LABEL[mode]}</>}
          </span>
          <EnvBadge {...env} />
          <div className="flex-1" />
          <div className="flex items-center gap-1.5"><PriceContextBar /><TutorialButton />{actions}</div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 sm:flex" title={email}>
            <User size={13} className="text-accent" />
            <span className="max-w-[160px] truncate text-[11.5px] font-bold text-ink">{nameFromEmail(email)}</span>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full border border-line bg-bg px-2.5 py-1 md:flex">
            <Calendar size={13} className="text-accent" />
            <span className="text-[11.5px] font-bold text-ink">{today}</span>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-clip">{children}</main>
      </div>
    </div>
    </NavContext.Provider>
    </PriceContextProvider>
  );
}
