'use client';
import { useEffect, useState, type ReactNode } from 'react';
import TutorialButton from './TutorialButton';
import { ArrowLeft, BellRing, Boxes, Calendar, ClipboardList, Layers, GitCompareArrows, Menu, Scale, Tags, Truck, Upload, User, X, type LucideIcon } from 'lucide-react';
import { PLAN_MODULE_ENABLED } from '@/lib/plan/flag';
import { AI_ENABLED } from '@/lib/ai/config';
import { WATCH_ENABLED } from '@/lib/watch/api';
import { WAC_ENABLED, wacNavVisible } from '@/lib/wac/flag';
import { CK_ENABLED } from '@/lib/ck/flag';
import { PriceContextBar, PriceContextProvider } from './price-context/slots';
import { COGM_SO_ENABLED } from '@/lib/so/flag';
import { fetchIsAdmin } from '@/lib/client/hubAccess';
import { MODE_LABEL, type Mode } from '@/lib/query/schema';
import { BASE_PATH } from '@/lib/client/session';
import { leaveApp } from '@/lib/useScreenHistory';
import { cx } from './ui';

/** Same shell as every sibling embedded app (Rate Auction, PO Approval...): white side pane with the
 * Emami Apps logo, a plum "Back to Emami Apps" bar, and a white header with user / date chips. */

export const MODE_ICON: Record<Mode, LucideIcon> = { B: Layers, C: Scale, R: Tags, F: Truck, M: Boxes };
const MODE_HINT: Record<Mode, string> = {
  B: 'Multi-level costing by plant',
  C: 'One BOM across plants, in INR',
  R: 'Rate records in the look-back',
  F: 'Freight per PO, actual vs standard',
  M: 'Exploded RM / PM requirement',
};

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

/** Hub home: the embedded app lives at /apps/bom-cost-explorer on the hub's own origin. */
const HUB_HOME = '/';

/** Production Plan pages (only when PLAN_MODULE_ENABLED): which plan nav item is active. */
export type PlanNav = 'plans' | 'upload' | 'watch' | 'freight' | 'wac' | 'ck' | 'so';

function NavPane({ mode, onMode, open, onClose, wide, planActive, wacVisible = false, ckVisible = false, soVisible = false }: { mode: Mode; onMode: (m: Mode) => void; open: boolean; onClose: () => void; wide: boolean; planActive?: PlanNav; wacVisible?: boolean; ckVisible?: boolean; soVisible?: boolean }) {
  const pane = wide
    ? 'relative w-64 shrink-0 border-r border-line bg-panel'
    : cx('fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-panel shadow-pop transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full');
  return (
    <>
      {!wide && open && <div className="fixed inset-0 z-30 bg-plum-deep/50 backdrop-blur-sm" onClick={onClose} />}
      <aside className={cx(pane, 'flex flex-col no-print')} aria-label="Modes">
        <div className="border-b border-line">
          {!wide && (
            <div className="flex justify-end px-3 pt-3">
              <button type="button" onClick={onClose} aria-label="Close menu" className="p-1 text-muted hover:text-ink"><X size={20} /></button>
            </div>
          )}
          <div className={cx('flex items-center justify-center px-4 pb-5', wide ? 'pt-5' : 'pt-1')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE_PATH}/emami-apps-logo.png`} alt="Emami Apps" width={172} height={142} />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <p className="px-3 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Costing</p>
          {(['B', 'C'] as Mode[]).map((m) => <NavItem key={m} m={m} active={!planActive && mode === m} onClick={() => { onMode(m); onClose(); }} />)}
          <p className="px-3 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Analysis</p>
          {(['R', 'F', 'M'] as Mode[]).map((m) => <NavItem key={m} m={m} active={!planActive && mode === m} onClick={() => { onMode(m); onClose(); }} />)}
          <NavLink href={`${BASE_PATH}/freight-compare/`} icon={GitCompareArrows} label="Freight comparison" hint="Actual vs standard, plant and FG wise" active={planActive === 'freight'} />
          {wacVisible && <NavLink href={`${BASE_PATH}/actual/`} icon={Scale} label="Actual vs rate sources" hint="Weighted average actual cost vs rates" active={planActive === 'wac'} />}
          {ckVisible && <NavLink href={`${BASE_PATH}/standard-cost/`} icon={Layers} label="Standard cost" hint="Cost estimate, like CK13N" active={planActive === 'ck'} />}
          {soVisible && <NavLink href={`${BASE_PATH}/sales-price/`} icon={Tags} label="Sales price" hint="MRP and selling price, latest order" active={planActive === 'so'} />}
          {PLAN_MODULE_ENABLED && (
            <>
              <p className="px-3 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Production plan</p>
              <NavLink href={`${BASE_PATH}/plan/`} icon={ClipboardList} label="Plans" hint="Plans in SAP, breakup and cost" active={planActive === 'plans'} />
              <NavLink href={`${BASE_PATH}/plan/upload/`} icon={Upload} label="Upload plan" hint="Excel template, check, save" active={planActive === 'upload'} />
            </>
          )}
          {AI_ENABLED && WATCH_ENABLED && (
            <>
              <p className="px-3 pb-1 pt-4 text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Monitoring</p>
              <NavLink href={`${BASE_PATH}/watch/`} icon={BellRing} label="Cost watch" hint="Daily 06:00 cost alerts and digest" active={planActive === 'watch'} />
            </>
          )}
        </nav>
        <div className="border-t border-line px-4 py-3 text-[11px] leading-snug text-faint">
          Costs come from SAP <span className="font-mono">ZMM_BOM_COST_SRV</span>. Simulations stay in your browser.
        </div>
      </aside>
    </>
  );
}

function NavItem({ m, active, onClick }: { m: Mode; active: boolean; onClick: () => void }) {
  const Icon = MODE_ICON[m];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx('group flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
    >
      <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition', active ? 'bg-gradient-to-br from-accent to-accent-deep text-white shadow-sm' : 'bg-sunken text-accent group-hover:bg-panel')}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{MODE_LABEL[m]}</span>
        <span className={cx('block truncate text-[11px]', active ? 'text-accent/80' : 'text-muted')}>{MODE_HINT[m]}</span>
      </span>
    </button>
  );
}

function NavLink({ href, icon: Icon, label, hint, active }: { href: string; icon: LucideIcon; label: string; hint: string; active: boolean }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx('group flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-sunken')}
    >
      <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg transition', active ? 'bg-gradient-to-br from-accent to-accent-deep text-white shadow-sm' : 'bg-sunken text-accent group-hover:bg-panel')}>
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className={cx('block truncate text-[11px]', active ? 'text-accent/80' : 'text-muted')}>{hint}</span>
      </span>
    </a>
  );
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

export default function Shell({ mode, onMode, email, actions, children, env, onBack, planActive }: { mode: Mode; onMode: (m: Mode) => void; email: string; actions?: ReactNode; children: ReactNode; env: { system: string; appEnv: string }; onBack?: () => void; planActive?: PlanNav }) {
  // Admin-only nav item of the Actual vs rate sources page; with the flag off no request is made.
  const [wacAdmin, setWacAdmin] = useState(false);
  useEffect(() => { if ((WAC_ENABLED || CK_ENABLED || COGM_SO_ENABLED) && email) void fetchIsAdmin(email).then(setWacAdmin); }, [email]);
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })), []);
  const Icon = MODE_ICON[mode];
  return (
    <PriceContextProvider email={email}>
    <div className="flex h-screen overflow-clip bg-plum">
      <NavPane mode={mode} onMode={onMode} open={open} onClose={() => setOpen(false)} wide={wide} planActive={planActive} wacVisible={wacNavVisible(WAC_ENABLED, wacAdmin)} ckVisible={wacNavVisible(CK_ENABLED, wacAdmin)} soVisible={wacNavVisible(COGM_SO_ENABLED, wacAdmin)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-clip bg-bg">
        <div className="flex bg-plum no-print">
          {/* In-app "Back" to the previous screen; without a screen history it leaves the app. */}
          <button type="button" onClick={onBack ?? leaveApp} className="flex items-center gap-1.5 border-r border-white/20 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep no-print">
            <ArrowLeft size={14} /> Back
          </button>
          <a href={HUB_HOME} className="flex items-center gap-1.5 bg-plum px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-plum-deep no-print">
            <ArrowLeft size={14} /> Back to Emami Apps
          </a>
        </div>
        <header className="flex items-center gap-2.5 border-b border-line bg-panel px-4 py-2.5 no-print">
          {!wide && (
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="p-1 text-ink"><Menu size={22} /></button>
          )}
          <h1 className="truncate text-[15px] font-extrabold text-ink">BOM Simulator</h1>
          <span className="hidden items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-accent sm:inline-flex">
            {planActive ? <><ClipboardList size={11} /> Production plan</> : <><Icon size={11} /> {MODE_LABEL[mode]}</>}
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
    </PriceContextProvider>
  );
}
