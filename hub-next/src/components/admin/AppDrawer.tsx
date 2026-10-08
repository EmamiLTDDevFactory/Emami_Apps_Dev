'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Users, X, ChevronRight } from 'lucide-react';
import { appById } from '../../data/mockData';
import { getAdminAppUserStats, type AdminAppStat, type AdminAppUserStat } from '../../lib/adminApi';
import { exportAppUserStatsToExcel } from '../../lib/exportAdminExcel';
import { appColor, colors, fontWeights, fonts, radii } from '../../theme/tokens';
import SidePanel, { PanelTabs } from './SidePanel';
import {
  ROLE_MANAGED_INTERNALLY, AppIcon, EmptyState, Initials, Skeleton, Spinner, StatusDot,
  appLabel, displayName, inputStyle, inputWrapStyle, roleOf, secondaryBtnStyle, timeAgo,
  type AdminUser,
} from './adminShared';

type Tab = 'access' | 'usage';

/** One app's drill-down: who is granted it (and with what role) plus who actually opens it. */
export default function AppDrawer({
  appId,
  users,
  stat,
  onClose,
  onOpenUser,
}: {
  appId: string;
  users: AdminUser[];
  stat: AdminAppStat | undefined;
  onClose: () => void;
  onOpenUser: (email: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('access');
  const [search, setSearch] = useState('');
  const [usage, setUsage] = useState<AdminAppUserStat[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setUsageLoading(true);
    getAdminAppUserStats(appId).then((r) => {
      setUsageLoading(false);
      if (r.ok && r.users) setUsage([...r.users].sort((a, b) => b.opens - a.opens));
    });
  }, [appId]);

  const app = appById(appId);
  const accent = appColor(appId);
  const holders = useMemo(() => users.filter((u) => roleOf(u, appId)), [users, appId]);
  const q = search.trim().toLowerCase();
  const visibleHolders = holders.filter((u) => !q || u.email.includes(q) || displayName(u.email, u.usage?.name).toLowerCase().includes(q));
  const visibleUsage = usage.filter((u) => !q || u.email.includes(q));
  const roleCounts = holders.reduce<Record<string, number>>((acc, u) => {
    const r = roleOf(u, appId) as string;
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {});
  const nameOf = (email: string) => displayName(email, users.find((u) => u.email === email)?.usage?.name);

  const header = (
    <>
      <div style={{ padding: '20px 64px 14px 20px', display: 'flex', alignItems: 'center', gap: 14, background: `linear-gradient(135deg, ${accent}14, transparent 70%)` }}>
        <AppIcon appId={appId} size={50} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{appLabel(appId)}</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>
            {app?.cat ? `${app.cat} · ` : ''}{holders.length} with access · {stat?.opens ?? 0} opens · last used {timeAgo(stat?.lastOpened)}
          </p>
          {Object.keys(roleCounts).length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {Object.entries(roleCounts).map(([r, n]) => (
                <span key={r} style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: accent, backgroundColor: `${accent}14`, borderRadius: 999, padding: '3px 9px' }}>{n} {r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <PanelTabs<Tab> tabs={[{ id: 'access', label: 'Who has access', count: holders.length }, { id: 'usage', label: 'Who uses it', count: usageLoading ? undefined : usage.length }]} value={tab} onChange={setTab} />
    </>
  );

  return (
    <SidePanel onClose={onClose} header={header} width={540}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div className="ac-input" style={{ ...inputWrapStyle, flex: 1, height: 36 }}>
            <Search size={14} color={colors.inkSoft} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people…" style={inputStyle} />
            {!!search && <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={13} color={colors.inkSoft} /></button>}
          </div>
          {tab === 'usage' && (
            <button
              type="button"
              className="ac-btn"
              disabled={usage.length === 0 || downloading}
              onClick={async () => { setDownloading(true); try { await exportAppUserStatsToExcel(appId, usage); } finally { setDownloading(false); } }}
              style={{ ...secondaryBtnStyle, height: 36 }}
            >
              {downloading ? <Spinner size={13} /> : <Download size={14} />} Export
            </button>
          )}
        </div>

        {tab === 'access' ? (
          visibleHolders.length === 0 ? (
            <EmptyState icon={Users} title={q ? 'No one matches' : 'No one has access yet'} hint={q ? undefined : 'Open a person from the People tab to grant this app.'} />
          ) : (
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, overflow: 'hidden' }}>
              {visibleHolders.map((u, i) => (
                <button key={u.email} type="button" className="ac-row" onClick={() => onOpenUser(u.email)} style={{ ...rowStyle, borderTop: i === 0 ? 'none' : `1px solid ${colors.border}` }}>
                  <Initials email={u.email} name={u.usage?.name} size={32} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={nameStyle}>{displayName(u.email, u.usage?.name)}</span>
                    <span style={emailStyle}>{u.email}</span>
                  </span>
                  {!u.isActive && <StatusDot active={false} />}
                  <span style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: accent, backgroundColor: `${accent}14`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                    {roleOf(u, appId)}{u.apps.find((g) => g.appId === appId)?.depot ? ` · ${u.apps.find((g) => g.appId === appId)?.depot}` : ''}
                  </span>
                  <ChevronRight size={15} color={colors.inkSoft} />
                </button>
              ))}
            </div>
          )
        ) : usageLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={44} radius={10} />)}</div>
        ) : visibleUsage.length === 0 ? (
          <EmptyState icon={Users} title={q ? 'No one matches' : 'Nobody has opened this app yet'} />
        ) : (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, overflow: 'hidden' }}>
            {visibleUsage.map((u, i) => {
              const max = usage[0]?.opens || 1;
              return (
                <button key={u.email} type="button" className="ac-row" onClick={() => onOpenUser(u.email)} style={{ ...rowStyle, borderTop: i === 0 ? 'none' : `1px solid ${colors.border}` }}>
                  <Initials email={u.email} size={32} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={nameStyle}>{nameOf(u.email)}</span>
                    <span style={{ display: 'block', height: 5, borderRadius: 3, backgroundColor: colors.appBg, marginTop: 6, overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.max(4, (u.opens / max) * 100)}%`, background: accent, borderRadius: 3 }} />
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{u.opens}</span>
                    <span style={{ display: 'block', fontSize: 10.5, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{timeAgo(u.lastOpened)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {ROLE_MANAGED_INTERNALLY.has(appId) && (
          <p style={{ fontSize: 11.5, color: colors.inkSoft, fontFamily: fonts.sansRegular, marginTop: 14, lineHeight: '16px' }}>
            {appLabel(appId)} manages its own roles internally — the role shown here is only the hub-level grant.
          </p>
        )}
      </div>
    </SidePanel>
  );
}

const rowStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: colors.white, border: 'none', cursor: 'pointer', textAlign: 'left' };
const nameStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const emailStyle: React.CSSProperties = { display: 'block', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
