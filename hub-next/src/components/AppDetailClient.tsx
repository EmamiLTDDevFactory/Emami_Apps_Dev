'use client';

import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { appById } from '../data/mockData';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';
import { useUnlockedAppIds } from '../hooks/useAppAccess';
import { useAuth } from '../context/AuthContext';
import EmbeddedWebView from './EmbeddedWebView';

// A relative URL (starting with "/") means the app is genuinely merged into this hub's own web
// build and served same-origin (see mockData.ts's EMBEDDED_APP_URLS) — that gets a full page
// navigation, not an iframe, since it's not a separate site being embedded. An absolute URL is a
// real cross-origin app, which still gets the iframe treatment (see EmbeddedWebView).
function isSameOriginRoute(url: string) {
  return url.startsWith('/');
}

export default function AppDetailClient({ appId }: { appId: string }) {
  const app = appById(appId);
  const unlockedAppIds = useUnlockedAppIds();
  const { refreshAccess } = useAuth();
  // Tiles already block taps on a locked app (AppCard.tsx), but this guards the route itself too —
  // a deep link, a stale Recently-Used entry, or a favorite added before access was revoked could
  // all still land here directly.
  const locked = !!app && !unlockedAppIds.has(app.id);

  // `access` (and so `unlockedAppIds`) is otherwise only refetched once per session/tab-focus (see
  // AuthContext.tsx) — re-checking right when someone navigates to a specific app means a grant an
  // admin just made in Manage Access opens this app immediately, without waiting for either of
  // those to happen to fire first.
  useEffect(() => {
    refreshAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  useEffect(() => {
    if (app?.url && !locked && isSameOriginRoute(app.url)) {
      // replace, not href: this hub page shouldn't stay in history as an entry of its own —
      // otherwise browser Back re-mounts it and its redirect fires again, bouncing straight back
      // into the embedded app.
      //
      // Do NOT add a pushState before this. Replacing the CURRENT entry is the whole point: it
      // consumes this /apps/<id> launch entry, so the entry sitting directly behind the embedded
      // app is the real hub page the user came from (normally Home, "/"). That is exactly what
      // makes one Back press land on the hub Dashboard.
      window.location.replace(app.url);
    }
  }, [app?.url, locked]);

  if (!app) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: colors.appBg }}>
        <p style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>Application not found.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: colors.appBg, padding: 24, gap: 10 }}>
        <Lock size={28} color={colors.inkSoft} />
        <p style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, textAlign: 'center' }}>
          You don&apos;t have access to {app.name}. Contact your admin.
        </p>
      </div>
    );
  }

  if (app.url && isSameOriginRoute(app.url)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: colors.appBg }}>
        <div className="spinner" style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.rust }} />
        <style jsx>{`
          .spinner {
            animation: app-detail-spin 0.8s linear infinite;
          }
          @keyframes app-detail-spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (app.url) {
    return (
      <div style={{ height: '100vh' }}>
        <EmbeddedWebView url={app.url} appName={app.name} />
      </div>
    );
  }

  const Icon = app.icon;

  return (
    <div style={{ height: '100vh', overflowY: 'auto', backgroundColor: colors.appBg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 24, background: `linear-gradient(135deg, ${colors.plum}, ${colors.plumDeep})` }}>
        <div style={{ width: 48, height: 48, borderRadius: radii.lg, backgroundColor: `${colors.amber}2a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={24} color={colors.amber} />
        </div>
        <div>
          <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 19, color: colors.white, margin: 0 }}>{app.name}</p>
          <p style={{ color: `${colors.cream}b3`, fontSize: 13, fontFamily: fonts.sansRegular, marginTop: 4, marginBottom: 0 }}>{app.desc}</p>
        </div>
      </div>
      <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
        <p style={{ fontSize: 14, color: colors.inkSoft, fontFamily: fonts.sansRegular, textAlign: 'center', lineHeight: '21px', maxWidth: 480, margin: 0 }}>
          {app.name} isn&apos;t wired up to a real backend yet — add its URL to EMBEDDED_APP_URLS in
          src/data/mockData.ts and it&apos;ll load here automatically.
        </p>
      </div>
    </div>
  );
}
