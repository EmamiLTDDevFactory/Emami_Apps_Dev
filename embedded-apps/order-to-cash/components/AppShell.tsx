'use client';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import StatusBar from './StatusBar';
import { Button, type ScreenProps } from './ui';
import * as I from './icons';
import { checkHealth, getMe } from '@/lib/api';
import type { StatusMessage, Tone } from '@/lib/types';
import Overview from './screens/Overview';
import PoCapture from './screens/PoCapture';
import Exceptions from './screens/Exceptions';
import SalesOrders from './screens/SalesOrders';
import OrderTracker from './screens/OrderTracker';
import Backorders from './screens/Backorders';
import Appointments from './screens/Appointments';
import Asn from './screens/Asn';
import GrnRecon from './screens/GrnRecon';
import Invoices from './screens/Invoices';
import CashApplication from './screens/CashApplication';
import Deductions from './screens/Deductions';
import Disputes from './screens/Disputes';

type Icon = ComponentType<{ size?: number }>;
/** The JAVIS order-to-cash flow: order management, fulfilment, invoice to cash. */
const SCREENS: { id: string; label: string; hint: string; group: string; icon: Icon; Comp: ComponentType<ScreenProps> }[] = [
  { id: 'overview', label: 'Overview', hint: 'Flow, KPIs, leakage', group: 'Control tower', icon: I.IconGauge, Comp: Overview },
  { id: 'capture', label: 'PO Capture', hint: 'PDF, Excel, image, email', group: 'Order management', icon: I.IconInbox, Comp: PoCapture },
  { id: 'exceptions', label: 'Validation & Exceptions', hint: 'SAP checks, auto amendment', group: 'Order management', icon: I.IconAlert, Comp: Exceptions },
  { id: 'sales-orders', label: 'Sales Order Creation', hint: 'Simulate and create in SAP', group: 'Order management', icon: I.IconCart, Comp: SalesOrders },
  { id: 'tracker', label: 'Order Tracker', hint: 'Order to invoice, real time', group: 'Order fulfilment', icon: I.IconRoute, Comp: OrderTracker },
  { id: 'backorders', label: 'Back Orders', hint: 'Open lines, create deliveries', group: 'Order fulfilment', icon: I.IconClock, Comp: Backorders },
  { id: 'appointments', label: 'Appointments', hint: 'Customer delivery slots', group: 'Order fulfilment', icon: I.IconCalendar, Comp: Appointments },
  { id: 'asn', label: 'Advance Shipping Note', hint: 'ASN per delivery', group: 'Order fulfilment', icon: I.IconTruck, Comp: Asn },
  { id: 'grn', label: 'GRN Reconciliation', hint: 'Customer GRN vs invoice', group: 'Order fulfilment', icon: I.IconClipboard, Comp: GrnRecon },
  { id: 'invoices', label: 'Invoices', hint: 'Delivery, ageing, payment', group: 'Invoice to cash', icon: I.IconReceipt, Comp: Invoices },
  { id: 'cash', label: 'Cash Application', hint: 'Match remittances', group: 'Invoice to cash', icon: I.IconWallet, Comp: CashApplication },
  { id: 'deductions', label: 'Deductions', hint: 'Short payments, debit notes', group: 'Invoice to cash', icon: I.IconMinus, Comp: Deductions },
  { id: 'disputes', label: 'Disputes', hint: 'Track to resolution', group: 'Invoice to cash', icon: I.IconScale, Comp: Disputes },
];
const GROUPS = [...new Set(SCREENS.map((s) => s.group))];
const PANE_KEY = 'order-to-cash:menu-collapsed';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
type Health = { state: 'checking' } | { state: 'ok' } | { state: 'down'; error: string };

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}

export default function AppShell() {
  const [wide, setWide] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [screen, setScreen] = useState('overview');
  const [args, setArgs] = useState<Record<string, string | number | undefined>>({});
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(['overview']));
  const [messages, setMessages] = useState<StatusMessage[]>([]);
  const [health, setHealth] = useState<Health>({ state: 'checking' });
  const [system, setSystem] = useState('SAP');
  const [email, setEmail] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [role, setRole] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    try { setEmail(window.localStorage.getItem('emami_apps_user_email') || ''); } catch { /* storage blocked */ }
    try { setCollapsed(window.localStorage.getItem(PANE_KEY) === '1'); } catch { /* storage blocked */ }
    const fromHash = window.location.hash.slice(1);
    if (SCREENS.some((s) => s.id === fromHash)) { setScreen(fromHash); setVisited(new Set([fromHash])); }
    return () => window.removeEventListener('resize', check);
  }, []);

  const notify = useCallback((text: string, tone: Tone) => {
    seq.current += 1;
    const at = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setMessages((m) => [{ id: seq.current, at, text, tone }, ...m].slice(0, 20));
  }, []);

  const runHealth = useCallback(async () => {
    setHealth({ state: 'checking' });
    const h = await checkHealth();
    if (h.system) setSystem(`SAP ${h.system}`);
    setHealth(h.ok ? { state: 'ok' } : { state: 'down', error: h.error ?? 'SAP connection unavailable' });
  }, []);
  useEffect(() => { void runHealth(); }, [runHealth]);
  useEffect(() => { void getMe().then((m) => { setCanWrite(m.canWrite); setRole(m.role); if (m.email) setEmail(m.email); }); }, []);

  const go = useCallback((id: string, arg?: string | number) => {
    if (!SCREENS.some((s) => s.id === id)) return;
    setScreen(id);
    setArgs((a) => ({ ...a, [id]: arg }));
    setVisited((v) => new Set(v).add(id));
    setMenuOpen(false);
    try { window.history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
  }, []);
  const setPane = (c: boolean) => {
    setCollapsed(c);
    try { window.localStorage.setItem(PANE_KEY, c ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const current = SCREENS.find((s) => s.id === screen) ?? SCREENS[0];
  const CurrentIcon = current.icon;
  const pane = wide
    ? `${collapsed ? 'hidden ' : ''}relative w-64 shrink-0 border-r border-sap-line bg-white shadow-card`
    : `fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-sap-line bg-white shadow-pop transition-transform duration-200 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`;
  const dot = health.state === 'ok' ? 'bg-emerald-500' : health.state === 'down' ? 'bg-red-500' : 'animate-pulse bg-amber-400';

  return (
    <div className="aurora fixed inset-0 flex overflow-hidden">
      {!wide && menuOpen && <div className="fixed inset-0 z-30 bg-brand-deep/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />}
      <aside className={`${pane} flex flex-col overflow-hidden`} aria-label="Order to cash steps">
        <div className="relative border-b border-sap-line">
          <div className="absolute right-2 top-2 z-10">
            <button type="button" onClick={() => (wide ? setPane(true) : setMenuOpen(false))} aria-label={wide ? 'Collapse menu' : 'Close menu'} className="rounded-full p-1.5 text-sap-muted hover:bg-sap-head hover:text-sap-ink">
              {wide ? <I.IconArrowLeft size={18} /> : <I.IconX size={18} />}
            </button>
          </div>
          <div className="flex items-center justify-center px-4 pb-4 pt-5">
            <a href="/" title="Back to Emami Apps" className="block rounded-2xl bg-white p-2.5 shadow-card ring-1 ring-sap-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={130} height={107} />
            </a>
          </div>
        </div>
        <nav className="scroll-glass flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {GROUPS.map((g, gi) => (
            <div key={g} className="flex flex-col gap-1">
              <p className={`px-3 pb-1 ${gi ? 'pt-3' : 'pt-1'} text-[10px] font-extrabold uppercase tracking-[0.18em] text-plum/60`}>{g}</p>
              {SCREENS.filter((s) => s.group === g).map((s) => {
                const active = s.id === current.id;
                const Ic = s.icon;
                return (
                  <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={active ? 'page' : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${active ? 'bg-gradient-to-r from-[#3B4FD8] to-plum text-white shadow-glow' : 'text-sap-ink hover:bg-sap-head'}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? 'bg-white/20 text-white' : 'bg-plum-soft text-plum'}`}><Ic size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold leading-tight">{s.label}</span>
                      <span className={`block truncate text-[11px] ${active ? 'text-white/75' : 'text-sap-muted'}`}>{s.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="flex items-start gap-2 border-t border-sap-line px-4 py-3 text-[11px] leading-snug text-sap-muted">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span>SAP <span className="font-mono text-sap-ink">Z_SD_O2C_ACTION</span>. {health.state === 'ok' ? 'Connected.' : health.state === 'down' ? 'Not connected.' : 'Checking…'}{role && <> Role: <b className="text-sap-ink">{role}</b>{!canWrite && ' (read only)'}.</>}</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header>
          <div aria-hidden="true" className="banner-line h-1" />
          <div className="page-banner flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 sm:px-5">
            {((wide && collapsed) || !wide) && <button type="button" onClick={() => (wide ? setPane(false) : setMenuOpen(true))} aria-label="Open menu" className="rounded-lg p-1.5 text-white hover:bg-white/10"><I.IconMenu size={22} /></button>}
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">Order to Cash</h1>
              <p className="flex items-center gap-1 truncate text-[11.5px] font-bold uppercase tracking-[0.08em] text-white/80"><CurrentIcon size={12} /> {current.group} <I.IconChevronRight size={11} /> {current.label}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white ring-1 ring-white/30">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />{system}
            </span>
            <div className="flex-1" />
            {email && (
              <div className="hidden items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 sm:flex" title={email}>
                <span className="text-orange"><I.IconUser size={14} /></span><span className="max-w-[160px] truncate text-[12px] font-bold">{nameFromEmail(email)}</span>
              </div>
            )}
          </div>
        </header>
        {health.state === 'down' && (
          <div role="alert" className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            <span className="font-semibold">SAP not connected</span>
            <span className="flex-1 text-red-700">{health.error}</span>
            <Button variant="danger" onClick={() => void runHealth()}>Retry</Button>
          </div>
        )}
        <main className="scroll-glass min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3"><StatusBar busy={false} messages={messages} /></div>
          {SCREENS.map(({ id, label, Comp }) => (
            <section key={id} aria-label={label} hidden={current.id !== id} className="glass fade-up mb-3 rounded-2xl p-4">
              {visited.has(id) && <Comp active={current.id === id} canWrite={canWrite} notify={notify} go={go} arg={args[id]} />}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
