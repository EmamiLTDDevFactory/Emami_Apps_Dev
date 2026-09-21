'use client';

import { useEffect, useState } from 'react';
import { hasHubSession } from '../lib/hubEmailLogin';

/** This app has no login screen of its own — reaching it at all is only ever valid because the
 * hub already authenticated the visitor (same posture as every sibling embedded app's own Shell/
 * layout guard). Unlike fm-po-deviation's Shell, this app keeps its own complete navy-sidebar
 * dashboard chrome (see Sidebar.tsx/Topbar.tsx) rather than a generic hub-style header/sidebar, so
 * this component is deliberately just the auth gate — no nav, no header — leaving the page's own
 * layout untouched. */
export default function HubGate({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (hasHubSession()) {
      setAuthorized(true);
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  }, []);

  if (authorized !== true) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f2f6fa' }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '3px solid #2878ff',
            borderTopColor: 'transparent',
            animation: 'spin 0.9s linear infinite',
          }}
        />
      </div>
    );
  }

  return <>{children}</>;
}
