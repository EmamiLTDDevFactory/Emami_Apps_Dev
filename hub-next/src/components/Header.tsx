'use client';

import React, { useState } from 'react';
import { Search, Menu, ChevronDown, User, LogOut, Download } from 'lucide-react';
import { colors, fonts, fontWeights, radii, shadows } from '../theme/tokens';
import { useAuth } from '../context/AuthContext';
import { useIsWideScreen } from '../hooks/useIsWideScreen';
import { useIsMobile } from '../hooks/useColumnCount';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { useTypewriterPlaceholder } from '../hooks/useTypewriterPlaceholder';
import { useIsScrolling } from '../hooks/useScrollActivity';
import Avatar from './Avatar';
import { useOrgProfile } from '../hooks/useOrgProfile';
import EmpAppMark from './EmpAppMark';
import OrgHierarchy from './OrgHierarchy';
import NotificationBell from './NotificationBell';

const SEARCH_EXAMPLES = ['Dispatch Tracker', 'Recruitment Consultant Management Portal', 'Non CTC Expense', 'Mould Health Inspection'];

interface HeaderProps {
  searchValue: string;
  onSearchChange: (v: string) => void;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
}

export default function Header({ searchValue, onSearchChange, onOpenMenu, onOpenSettings }: HeaderProps) {
  const { userEmail, profile, logout } = useAuth();
  const currentUser = { name: profile?.name || userEmail || '', email: profile?.email || userEmail || '' };
  const [profileOpen, setProfileOpen] = useState(false);
  const org = useOrgProfile(userEmail);
  const orgLine = [org?.jobTitle, org?.department].filter(Boolean).join(' · ');
  const [searchFocused, setSearchFocused] = useState(false);
  const isWideScreen = useIsWideScreen();
  const isMobile = useIsMobile();
  const pwaInstall = usePwaInstall();

  const isScrolling = useIsScrolling();
  const showAnimatedPlaceholder = !searchValue && !searchFocused && !isScrolling;
  const animatedExample = useTypewriterPlaceholder(SEARCH_EXAMPLES, showAnimatedPlaceholder);

  return (
    <div style={{ backgroundColor: colors.white, borderBottom: `1px solid ${colors.border}`, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px 10px', gap: 10 }}>
        {!isWideScreen && (
          <button
            type="button"
            onClick={onOpenMenu}
            style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            aria-label="Open navigation menu"
          >
            <Menu size={22} color={colors.ink} />
          </button>
        )}

        {/* On mobile/tablet the sidebar collapses to a hidden overlay drawer (see the shell
            layout), so the brand mark has nowhere else to show — surfacing it here, before the
            search box, keeps "Emami Apps" visible whenever the drawer is closed instead of only
            on wide screens where the sidebar itself carries it. */}
        {!isWideScreen && (
          <div style={{ flexShrink: 0, display: 'flex' }}>
            <EmpAppMark size={isMobile ? 68 : 92} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: '100%',
              minWidth: 0,
              maxWidth: 460,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: searchFocused ? colors.white : colors.appBg,
              borderRadius: radii.pill,
              padding: '0 14px',
              height: 38,
              boxShadow: searchFocused ? shadows.md : 'none',
              border: searchFocused ? `1px solid ${colors.rust}` : '1px solid transparent',
            }}
          >
            <Search size={15} color={searchFocused ? colors.rust : colors.inkSoft} style={{ flexShrink: 0 }} />
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={showAnimatedPlaceholder && animatedExample ? `Search: ${animatedExample}` : 'Search anything…'}
              style={{
                flex: 1,
                minWidth: 0,
                width: '100%',
                fontSize: 13.5,
                color: colors.ink,
                fontFamily: fonts.sansRegular,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                height: '100%',
              }}
              aria-label="Search applications"
            />
          </div>
        </div>

        {pwaInstall.isSupported && (
          <button
            type="button"
            onClick={pwaInstall.openInstallCard}
            style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
            aria-label="Install Emami Apps to this device"
          >
            <Download size={20} color={colors.inkSoft} />
          </button>
        )}

        <NotificationBell />

        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={`Account menu for ${currentUser.name}`}
        >
          <div style={{ position: 'relative', padding: 2, borderRadius: 999, backgroundColor: `${colors.rust}1f` }}>
            <Avatar name={currentUser.name} size={32} photoUrl={profile?.photoUrl} />
            <span
              style={{
                position: 'absolute',
                bottom: 1,
                right: 1,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: colors.green,
                border: `1.5px solid ${colors.white}`,
              }}
            />
          </div>
          {/* Dropped on real phone widths — between the menu button, brand mark, install button
              and this button, a phone-width row has no room left for a name column too (it was
              overflowing the viewport on narrow phones once the brand mark was added above). The
              avatar alone still opens the same account menu. */}
          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, maxWidth: isWideScreen ? 170 : 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentUser.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }} title={orgLine || undefined}>
                {/* Job title from Microsoft Entra ID when known (see useOrgProfile); "Account" otherwise. */}
                <span style={{ fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, maxWidth: isWideScreen ? 156 : 106, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{org?.jobTitle || 'Account'}</span>
                <ChevronDown size={12} color={colors.inkSoft} style={{ flexShrink: 0 }} />
              </span>
            </div>
          )}
        </button>
      </div>

      {profileOpen && (
        <>
          <div onClick={() => setProfileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: 'absolute',
              top: 56,
              right: isMobile ? 8 : 16,
              width: org ? 'min(340px, calc(100vw - 16px))' : 'min(260px, calc(100vw - 16px))',
              maxHeight: 'calc(100vh - 72px)',
              overflowY: 'auto',
              backgroundColor: colors.white,
              borderRadius: radii.lg,
              border: `1px solid ${colors.border}`,
              overflow: 'hidden',
              boxShadow: shadows.xl,
              zIndex: 50,
            }}
          >
            {/* Blue header card: who you are and your reporting line (Microsoft Entra ID). */}
            <div style={{ position: 'relative', overflow: 'hidden', margin: 8, padding: 14, borderRadius: radii.lg, background: `linear-gradient(125deg, ${colors.plumDeep} 0%, #2A2070 50%, ${colors.rust} 100%)` }}>
              <div aria-hidden style={{ position: 'absolute', right: -50, top: -60, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,124,255,0.5), transparent 70%)' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar name={currentUser.name} size={40} photoUrl={profile?.photoUrl} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser.name}</p>
                  <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.72)', fontFamily: fonts.sansRegular, margin: '1px 0 0', overflowWrap: 'anywhere' }}>{currentUser.email}</p>
                  {orgLine && <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.88)', fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, margin: '3px 0 0' }}>{orgLine}</p>}
                </div>
              </div>
              {!!org?.managers?.length && (
                <div style={{ position: 'relative', marginTop: 12 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: 'rgba(255,255,255,0.6)' }}>Reporting line</p>
                  <OrgHierarchy compact tone="dark" managers={org.managers} me={{ name: currentUser.name, jobTitle: org.jobTitle, department: org.department }} />
                </div>
              )}
            </div>
            <MenuRow icon={<User size={15} color={colors.inkSoft} />} label="Profile" onClick={() => { setProfileOpen(false); onOpenSettings(); }} />
            <MenuRow icon={<LogOut size={15} color={colors.inkSoft} />} label="Sign out" onClick={() => { setProfileOpen(false); logout(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 14px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {icon}
      <span style={{ fontSize: 13, color: colors.ink, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>{label}</span>
    </button>
  );
}
