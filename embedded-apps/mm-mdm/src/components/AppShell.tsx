'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { LANGS, useI18n, type Lang } from '@/i18n';
import type { SessionInfo } from '@/lib/types';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const raw = usePathname() ?? '/';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw; // the static export serves pages with a trailing slash
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => { api.session().then(setSession).catch(() => setSession(null)); }, []);
  const nav = [['/', t('nav.home')], ['/requests', t('nav.requests')], ['/requests/new', t('nav.new')]] as const;
  return (
    <>
      <a className="skip" href="#main">{t('nav.skip')}</a>
      <header className="top">
        <span className="brand">{t('app.brand')}</span>
        <nav className="row" aria-label={t('nav.main')}>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'active' : ''} aria-current={path === href ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <span className="spacer" />
        <select aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.label}</option>)}
        </select>
        {session && (
          <>
            <span className="badge">{session.mode === 'mock' ? t('badge.demo') : t('badge.sap')}</span>
            {session.mode === 'mock' ? (
              <select
                aria-label={t('user.label')}
                value={session.user}
                onChange={async (e) => { await api.switchUser(e.target.value); window.location.reload(); }}
              >
                <option value="initiator">{t('user.initiator')}</option>
                <option value="reviewer">{t('user.reviewer')}</option>
                <option value="approver">{t('user.approver')}</option>
              </select>
            ) : (
              <span>{session.displayName}</span>
            )}
          </>
        )}
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
    </>
  );
}
