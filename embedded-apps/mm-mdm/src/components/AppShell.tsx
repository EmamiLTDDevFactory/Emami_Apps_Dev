'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { api } from '@/lib/api';
import { LANGS, useI18n, type Lang } from '@/i18n';
import type { SessionInfo } from '@/lib/types';
import { IconHome, IconList, IconMenu, IconPackage, IconPlusSquare, IconUser, IconX } from './icons';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type Item = { id: 'home' | 'requests' | 'new'; href: string; group: 'overview' | 'requests'; icon: ComponentType<{ size?: number }> };
const NAV: Item[] = [
  { id: 'home', href: '/', group: 'overview', icon: IconHome },
  { id: 'requests', href: '/requests', group: 'requests', icon: IconList },
  { id: 'new', href: '/requests/new', group: 'requests', icon: IconPlusSquare },
];
const GROUPS = [...new Set(NAV.map((n) => n.group))];

/** The hub's own sign-in name (read only), like every sibling app: "first.last@..." -> "First Last". */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || '';
  return local.split(/[._-]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ') || email;
}

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const raw = usePathname() ?? '/';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw; // the static export serves pages with a trailing slash
  const wide = useIsWide();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [email, setEmail] = useState('');
  useEffect(() => { api.session().then(setSession).catch(() => setSession(null)); }, []);
  useEffect(() => { try { setEmail(window.localStorage.getItem('emami_apps_user_email') || ''); } catch { /* storage blocked */ } }, []);
  useEffect(() => { setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // A request page (/requests/view) belongs to "Requests".
  const isActive = (href: string) => (href === '/requests' ? path === '/requests' || path === '/requests/view' : path === href);
  const current = NAV.find((n) => isActive(n.href)) ?? NAV[0];
  const CurrentIcon = current.icon;
  const drawer = !wide;
  const text = {
    home: { label: t('nav.home'), hint: t('nav.hintHome') },
    requests: { label: t('nav.requests'), hint: t('nav.hintRequests') },
    new: { label: t('nav.new'), hint: t('nav.hintNew') },
  };
  const groupName = { overview: t('nav.groupOverview'), requests: t('nav.groupRequests') };

  return (
    <div className="aurora shell">
      <div className="grain" aria-hidden="true" />
      <a className="skip" href="#main">{t('nav.skip')}</a>
      {drawer && menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <aside className={`pane glass${drawer ? ' drawer' : ''}${drawer && menuOpen ? ' open' : ''}`} aria-label={t('nav.sections')} {...(drawer && !menuOpen ? { inert: true } : {})}>
        {drawer && <button type="button" className="pane-close" onClick={() => setMenuOpen(false)} aria-label={t('nav.menuClose')}><IconX size={18} /></button>}
        <div className="pane-logo">
          <a href="/" title={t('nav.logo')} aria-label={t('nav.logo')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/emami-apps-logo.png`} alt="Emami Apps" width={150} height={124} />
          </a>
        </div>
        <nav className="pane-nav" aria-label={t('nav.main')}>
          {GROUPS.map((g) => (
            <div key={g} className="nav-group">
              <p className="nav-group-label">{groupName[g]}</p>
              {NAV.filter((n) => n.group === g).map((n) => {
                const active = isActive(n.href);
                const I = n.icon;
                return (
                  <div key={n.href} className={`nav-item${active ? ' active' : ''}`}>
                    <span className="nav-ico"><I size={16} /></span>
                    <span className="nav-text">
                      {/* the link is stretched over the whole item (CSS); the hint is plain text beside it, so the link's name is just the label */}
                      <Link href={n.href} className="nav-label" aria-current={active ? 'page' : undefined}>{text[n.id].label}</Link>
                      <span className="nav-hint">{text[n.id].hint}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
        <p className="pane-foot">{session ? (session.mode === 'mock' ? t('foot.demo') : t('foot.live')) : ''}</p>
      </aside>

      <div className="content">
        <div className="topbar glass-dark">
          {drawer && <button type="button" className="menu-btn" onClick={() => setMenuOpen(true)} aria-label={t('nav.menuOpen')} aria-expanded={menuOpen}><IconMenu size={20} /></button>}
          <span className="topbar-app"><IconPackage size={14} /> {t('app.sub')}</span>
          <span className="spacer" />
          <select aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
          </select>
          {session && (
            <>
              <span className="badge">{session.mode === 'mock' ? t('badge.demo') : t('badge.sap')}</span>
              {session.mode === 'mock' && (
                <select
                  aria-label={t('user.label')}
                  value={session.user}
                  onChange={async (e) => { await api.switchUser(e.target.value); window.location.reload(); }}
                >
                  <option value="initiator">{t('user.initiator')}</option>
                  <option value="reviewer">{t('user.reviewer')}</option>
                  <option value="approver">{t('user.approver')}</option>
                </select>
              )}
            </>
          )}
        </div>
        <header className="pagehead glass">
          <p className="brandtitle"><span className="text-gradient">{t('app.brand')}</span></p>
          <span className="chip pagechip"><CurrentIcon size={11} /> {text[current.id].label}</span>
          <span className="spacer" />
          {(email || (session && session.mode !== 'mock')) && (
            <span className="chip userchip" title={email || session?.displayName}>
              <span className="avatar"><IconUser size={11} /></span>
              <span className="uname">{email ? nameFromEmail(email) : session?.displayName}</span>
            </span>
          )}
        </header>
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
