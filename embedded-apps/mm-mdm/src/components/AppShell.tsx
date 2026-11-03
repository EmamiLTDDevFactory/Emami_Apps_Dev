'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SessionInfo } from '@/lib/types';

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => { api.session().then(setSession).catch(() => setSession(null)); }, []);
  const nav = [['/', 'Home'], ['/requests', 'Requests'], ['/requests/new', 'New material']] as const;
  return (
    <>
      <header className="top">
        <span className="brand">Material master</span>
        <nav className="row" aria-label="Main">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>
          ))}
        </nav>
        <span className="spacer" />
        {session && (
          <>
            <span className="badge">{session.mode === 'mock' ? 'Demo data' : 'SAP'}</span>
            {session.mode === 'mock' ? (
              <select
                aria-label="Demo user"
                value={session.user}
                onChange={async (e) => { await api.switchUser(e.target.value); window.location.reload(); }}
              >
                <option value="initiator">Initiator</option>
                <option value="reviewer">Reviewer (level 1)</option>
                <option value="approver">Approver (level 2)</option>
              </select>
            ) : (
              <span>{session.displayName}</span>
            )}
          </>
        )}
      </header>
      <main>{children}</main>
    </>
  );
}
