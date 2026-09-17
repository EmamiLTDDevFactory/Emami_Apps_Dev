'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RotateCw, ExternalLink } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../theme/tokens';

interface EmbeddedWebViewProps {
  url: string;
  appName: string;
}

const STUCK_TIMEOUT_MS = 7000;

// Cross-origin embedded apps render in a plain iframe. Some sites send an X-Frame-Options / CSP
// frame-ancestors header that silently blocks being framed — browsers don't always fire a JS
// error for that, so this also detects a "stuck loading" state via timeout and always keeps an
// "Open in new tab" escape hatch visible.
export default function EmbeddedWebView({ url, appName }: EmbeddedWebViewProps) {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setStuck(false);
    timeoutRef.current = setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [reloadKey]);

  const retry = () => {
    setBlocked(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const openExternally = () => window.open(url, '_blank', 'noopener,noreferrer');

  if (blocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: colors.appBg, height: '100%' }}>
        <div style={{ width: 52, height: 52, borderRadius: radii.pill, backgroundColor: `${colors.rust}17`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <AlertTriangle size={24} color={colors.rust} />
        </div>
        <p style={{ fontSize: 16, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginBottom: 6 }}>Couldn't load {appName}</p>
        <p style={{ fontSize: 13, color: colors.inkSoft, fontFamily: fonts.sansRegular, textAlign: 'center', marginBottom: 20, maxWidth: 320 }}>
          This app may not allow being embedded. Try opening it directly instead.
        </p>
        <button
          type="button"
          onClick={openExternally}
          style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: colors.plum, color: colors.white, border: 'none', padding: '12px 20px', borderRadius: radii.md, marginBottom: 10, cursor: 'pointer', fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, fontSize: 13.5 }}
        >
          <ExternalLink size={15} color={colors.white} />
          Open in new tab
        </button>
        <button
          type="button"
          onClick={retry}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, fontSize: 12.5 }}
        >
          <RotateCw size={14} color={colors.inkSoft} />
          Try again
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, backgroundColor: colors.appBg, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', backgroundColor: colors.white, borderBottom: `1px solid ${colors.border}` }}>
        <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {appName}
        </span>
        <button
          type="button"
          onClick={openExternally}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <ExternalLink size={13} color={colors.inkSoft} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft }}>Open in new tab</span>
        </button>
      </div>

      {stuck && loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 0', backgroundColor: `${colors.amber}22`, borderBottom: `1px solid ${colors.amber}55` }}>
          <span style={{ fontSize: 12, color: colors.ink, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>Taking longer than usual to load.</span>
          <button type="button" onClick={openExternally} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ fontSize: 12, color: colors.rust, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold }}>Open in new tab instead</span>
          </button>
        </div>
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        <iframe
          key={reloadKey}
          src={url}
          title={appName}
          style={{ border: 0, width: '100%', height: '100%', backgroundColor: colors.appBg }}
          onLoad={() => setLoading(false)}
          onError={() => setBlocked(true)}
        />
        {loading && !stuck && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.appBg, gap: 10 }}>
            <div className="spinner" style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${colors.border}`, borderTopColor: colors.rust }} />
            <span style={{ fontSize: 13, color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>Loading {appName}…</span>
          </div>
        )}
      </div>
      <style jsx>{`
        .spinner {
          animation: embedded-webview-spin 0.8s linear infinite;
        }
        @keyframes embedded-webview-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
