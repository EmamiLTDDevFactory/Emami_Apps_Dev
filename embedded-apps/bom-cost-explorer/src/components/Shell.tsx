'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import TutorialButton from './TutorialButton';
import { ArrowLeft, Boxes, Calendar, ChevronRight, ClipboardList, Layers, Menu, PanelLeftClose, PanelLeftOpen, Scale, Tags, Truck, User, X, type LucideIcon } from 'lucide-react';
import { WAC_ENABLED, wacNavVisible } from '@/lib/wac/flag';
import { PSUM_ENABLED } from '@/lib/psum/flag';
import { COGM_ENABLED } from '@/lib/margin/flag';
import { CK_ENABLED } from '@/lib/ck/flag';
import { BUDGET_ENABLED } from '@/lib/budget/flag';
import { activeOf, navSections, sectionPath, tileAllowed, type NavSection, type PlanNav, type SectionId } from '@/lib/nav/sections';
import { PriceContextBar, PriceContextProvider } from './price-context/slots';
import { COGM_SO_ENABLED } from '@/lib/so/flag';
import { fetchAppRole, fetchAppTiles, fetchIsAdmin } from '@/lib/client/hubAccess';
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

function NavPane({ sections, active, onHome, open, onClose, wide, collapsed, onCollapse }: { sections: NavSection[]; active?: SectionId; onHome?: (id: SectionId) => void; open: boolean; onClose: () => void; wide: boolean; collapsed?: boolean; onCollapse?: () => void }) {
  const dark = 'bg-gradient-to-b from-plum-deep via-plum to-[#2A2A92] text-white';
  const pane = wide
    ? cx('relative w-64 shrink-0', dark)
    : cx('fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] shadow-pop transition-transform duration-200', dark, open ? 'translate-x-0' : '-translate-x-full');
  if (wide && collapsed) return null;
  return (
    <>
      {!wide && open && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={cx(pane, 'flex flex-col no-print')} aria-label="Sections">
        <span aria-hidden className="pointer-events-none absolute -left-16 top-1/3 h-72 w-72 rounded-full bg-blue-500/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-orange/10 blur-3xl" />
        <div className="relative border-b border-white/10">
          {!wide && (
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={onClose} aria-label="Close menu" className="p-1 text-white/70 hover:text-white"><X size={20} /></button>
            </div>
          )}
          {wide && onCollapse && (
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={onCollapse} aria-label="Collapse side pane" title="Collapse side pane (bigger screen)" className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><PanelLeftClose size={18} /></button>
            </div>
          )}
          <div className={cx('relative flex items-center justify-center px-4 pb-5', wide ? 'pt-5' : 'pt-1')}>
            <a href="/" title="Back to Emami Apps" aria-label="Back to Emami Apps" className="relative block rounded-2xl bg-white p-2.5 shadow-pop ring-1 ring-white/20 transition-transform duration-300 hover:scale-[1.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
            </a>
          </div>
        </div>
        <nav className="scroll-thin relative flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {sections.map((s) => <SectionLink key={s.id} s={s} active={active === s.id} onHome={onHome} onClose={onClose} />)}
        </nav>
        <div className="relative border-t border-white/10 px-4 py-3 text-[11px] leading-snug text-white/45">
          Costs come from SAP <span className="font-mono text-white/60">ZMM_BOM_COST_SRV</span>. Simulations stay in your browser.
        </div>
      </aside>
    </>
  );
}

/** A section opens its page of tiles (in place on the costing page, else the section route); a section with one screen opens that screen. */
function SectionLink({ s, active, onHome, onClose }: { s: NavSection; active: boolean; onHome?: (id: SectionId) => void; onClose: () => void }) {
  const Icon = s.icon;
  const path = sectionPath(s);
  const cls = cx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:translate-x-0.5', active ? 'bg-gradient-to-r from-[#3B4FD8] to-accent text-white shadow-glow ring-1 ring-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white');
  const body = (
    <>
      {active && <span aria-hidden className="absolute inset-y-2 -left-3 w-1 rounded-full bg-orange" />}
      <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg transition', active ? 'bg-white/20 text-white shadow-sm' : 'bg-white/10 text-white/90 group-hover:bg-white/15')}>
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{s.label}</span>
        <span className={cx('block truncate text-[11px]', active ? 'text-white/75' : 'text-white/50')}>{s.items.length === 1 ? s.items[0].hint : `${s.items.length} screens`}</span>
      </span>
      <ChevronRight size={15} className={cx('shrink-0 transition', active ? 'text-white' : 'text-white/40 group-hover:translate-x-0.5 group-hover:text-white')} />
    </>
  );
  if (path) return <a href={`${BASE_PATH}${path}`} aria-current={active ? 'page' : undefined} className={cls}>{body}</a>;
  return <button type="button" aria-current={active ? 'page' : undefined} className={cls} onClick={() => { if (onHome) onHome(s.id); else window.location.href = `${BASE_PATH}/section/?s=${s.id}`; onClose(); }}>{body}</button>;
}

/** SAP system + app environment, always visible; red for production SAP (NWP). */
export function EnvBadge({ system, appEnv, onDark }: { system: string; appEnv: string; /** on the blue banner: translucent white instead of tinted green */ onDark?: boolean }) {
  const prod = system === 'NWP';
  return (
    <span
      className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ring-1', prod ? 'bg-gradient-to-r from-bad to-[#a03028] text-white ring-bad shadow-sm' : onDark ? 'bg-white/15 text-white ring-white/30' : 'bg-good/10 text-good ring-good/30')}
      title={`SAP system ${system} · ${appEnv}`}
    >
      <span aria-hidden className="relative flex h-1.5 w-1.5">
        {prod && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 motion-reduce:hidden" />}
        <span className={cx('relative inline-flex h-1.5 w-1.5 rounded-full', prod ? 'bg-white' : onDark ? 'bg-emerald-300' : 'bg-good')} />
      </span>
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
  // Screen limit from Manage Access: undefined while loading, null = no limit.
  const [tiles, setTiles] = useState<string[] | null | undefined>(undefined);
  useEffect(() => { if (email) void fetchAppTiles(email).then(setTiles); else setTiles(null); }, [email]);
  const sections = useMemo(() => navSections({ wac: wacNavVisible(WAC_ENABLED, wacAdmin), ck: wacNavVisible(CK_ENABLED, wacAdmin), so: wacNavVisible(COGM_SO_ENABLED, wacAdmin), psum: wacNavVisible(PSUM_ENABLED, wacAdmin), marginRole, budgetRole, tiles }), [wacAdmin, marginRole, budgetRole, tiles]);
  // The screen on show, by its Manage Access id: a section page lists screens, so it is not itself limited.
  const shownId = section ? null : planActive && planActive !== 'section' ? planActive : planActive ? null : `mode-${mode}`;
  const blocked = tiles !== undefined && shownId !== null && !tileAllowed(tiles, shownId);
  const now = activeOf(sections, planActive, mode, section);
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem('cc-nav-collapsed') === '1'); } catch { /* storage blocked */ } }, []);
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem('cc-nav-collapsed', n ? '1' : '0'); } catch { /* storage blocked */ } return n; });
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })), []);
  const Icon = MODE_ICON[mode];
  return (
    <PriceContextProvider email={email}>
    <NavContext.Provider value={sections}>
    <div className="flex h-screen overflow-clip bg-plum">
      <NavPane sections={sections} active={now.section?.id} onHome={onHome} open={open} onClose={() => setOpen(false)} wide={wide} collapsed={collapsed} onCollapse={toggleCollapsed} />
      <div className="app-canvas flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <header className="no-print">
          <div aria-hidden className="banner-line h-1" />
          <div className="page-banner flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 text-white sm:px-5">
            {!wide && (
              <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-lg p-1.5 text-white hover:bg-white/10"><Menu size={22} /></button>
            )}
            {wide && collapsed && (
              <button type="button" onClick={toggleCollapsed} aria-label="Show side pane" title="Show side pane" className="rounded-lg p-1.5 text-white hover:bg-white/10"><PanelLeftOpen size={22} /></button>
            )}
            {/* In-app "Back" to the previous screen; without a screen history it leaves the app. */}
            <button type="button" onClick={onBack ?? leaveApp} aria-label="Back" title="Back" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/30 bg-white/10 text-white transition hover:bg-white/20">
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">Costing Cockpit</h1>
              <p className="flex items-center gap-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em] text-white/80">
                {now.section ? <><now.section.icon size={12} /> {now.section.label}{now.item ? <> <ChevronRight size={11} /> {now.item.label}</> : null}</> : planActive ? <><ClipboardList size={12} /> Production plan</> : <><Icon size={12} /> {MODE_LABEL[mode]}</>}
              </p>
            </div>
            <EnvBadge {...env} onDark />
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/95 px-1.5 py-1 shadow-card text-ink"><PriceContextBar /><TutorialButton />{actions}</div>
            <div className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 sm:flex" title={email}>
              <User size={14} className="text-orange" />
              <span className="max-w-[160px] truncate text-[12px] font-bold">{nameFromEmail(email)}</span>
            </div>
            <div className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 md:flex">
              <Calendar size={14} className="text-orange" />
              <span className="whitespace-nowrap text-[12px] font-bold">{today}</span>
            </div>
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-clip animate-pageIn">
          {tiles === undefined ? null : blocked ? (
            <div className="m-auto max-w-md p-8 text-center">
              <h2 className="text-lg font-extrabold text-ink">This screen is not part of your access</h2>
              <p className="mt-2 text-sm text-inkSoft">Your Costing Cockpit access is limited to some screens. Use the side pane to open one of them, or ask for access from the Emami Apps hub.</p>
            </div>
          ) : children}
        </main>
      </div>
    </div>
    </NavContext.Provider>
    </PriceContextProvider>
  );
}
