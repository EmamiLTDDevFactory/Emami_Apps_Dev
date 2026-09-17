'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { RECENT, appById } from '../../../data/mockData';
import { useUnlockedAppIds } from '../../../hooks/useAppAccess';
import { useAuth } from '../../../context/AuthContext';
import { logEvent } from '../../../lib/authApi';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';

export default function RecentPage() {
  const router = useRouter();
  const unlockedAppIds = useUnlockedAppIds();
  const { userEmail } = useAuth();

  const openApp = (appId: string) => {
    if (!unlockedAppIds.has(appId)) return; // this page could otherwise open apps a Viewer isn't granted
    if (userEmail) logEvent(userEmail, 'APP_OPEN', appId);
    const url = appById(appId)?.url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(`/apps/${appId}`);
  };

  const visible = RECENT.filter((r) => unlockedAppIds.has(r.id));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 40px' }}>
      <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 22, color: colors.ink, marginTop: 0, marginBottom: 16 }}>Recently Used</p>
      <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.white, overflow: 'hidden' }}>
        {visible.length === 0 ? (
          <p style={{ padding: 20, textAlign: 'center', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, margin: 0 }}>
            Nothing here yet — apps you open will show up as recently used.
          </p>
        ) : (
          visible.map((r, i) => {
            const app = appById(r.id);
            if (!app) return null;
            const Icon = app.icon;
            const accent = appColor(app.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => openApp(app.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  background: 'none',
                  border: 'none',
                  borderBottom: i < visible.length - 1 ? `1px solid ${colors.border}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: radii.sm + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}1f`, flexShrink: 0 }}>
                  <Icon size={16} color={accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0 }}>{app.name}</p>
                  <p style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular, marginTop: 2, marginBottom: 0 }}>{r.when}</p>
                </div>
                <ChevronRight size={15} color={colors.inkSoft} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
