'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Camera, LogOut, Pencil, Check, X, Mail, Phone, ShieldCheck, Crown, Eye, Clock, LogIn, Layers,
  MousePointerClick, Star, Download, Timer, Search, ChevronRight, ChevronDown, Lock, KeyRound, LifeBuoy,
  History, Sparkles, Copy, CheckCircle2, Circle, Settings2, Info,
} from 'lucide-react';
import Avatar from '../../../components/Avatar';
import StageBadge from '../../../components/StageBadge';
import { useAuth } from '../../../context/AuthContext';
import { useFavorites } from '../../../context/FavoritesContext';
import { useAppStages } from '../../../context/AppStagesContext';
import { useIsWideScreen } from '../../../hooks/useIsWideScreen';
import { uploadProfilePhoto, updateMobile, getRecentApps, logEvent } from '../../../lib/authApi';
import { cropAndResizeImageToDataUri } from '../../../lib/imageUtils';
import { storage } from '../../../lib/storage';
import { APPS, appById } from '../../../data/mockData';
import type { AccessLevel, AppItem } from '../../../types';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';
import {
  AdminStyles, AppIcon, EmptyState, Skeleton, Spinner, StatusDot,
  cardStyle, chipStyle, inputStyle, inputWrapStyle, labelStyle, sectionSubStyle, sectionTitleStyle, secondaryBtnStyle, timeAgo,
} from '../../../components/admin/adminShared';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PHOTO_SIZE = 512;
/** AuthContext signs people out after this much inactivity — any one session can't honestly run longer. */
const MAX_SESSION_HOURS = 12;

/** Mirrors backend/userProfile.js's normalizeIndianMobile — instant feedback only; the backend re-validates. */
function normalizeIndianMobileClient(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}
function formatMobile(m: string | null | undefined): string | null {
  if (!m) return null;
  const d = m.replace(/^\+91/, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : m;
}
/** "4088h 59m" → hours. Sessions closed without a sign-out pair up wrongly in the backend view and
 * inflate the total, so a figure no real usage could reach is shown as "not tracked" instead. */
function plausibleTimeSpent(timeSpent: string | undefined, sessions: number): string | null {
  if (!timeSpent || timeSpent === '—') return null;
  const h = Number(/(\d+)h/.exec(timeSpent)?.[1] || 0);
  const m = Number(/(\d+)m/.exec(timeSpent)?.[1] || 0);
  const hours = h + m / 60;
  if (hours <= 0) return null;
  if (hours / Math.max(1, sessions) > MAX_SESSION_HOURS) return null;
  return timeSpent;
}
function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const LEVEL_INFO: Record<AccessLevel, { icon: React.ElementType; color: string; text: string }> = {
  'Super Admin': { icon: Crown, color: '#B45309', text: 'Full control of Emami Apps — you can add people, grant any app and make others Admin.' },
  Admin: { icon: ShieldCheck, color: colors.rust, text: 'You can open Admin Center to add people and grant them app access.' },
  Viewer: { icon: Eye, color: '#64748B', text: 'You can sign in and open the apps you have been granted.' },
};

export default function ProfilePage() {
  const router = useRouter();
  const isWide = useIsWideScreen();
  const { logout, userEmail, profile, access, refreshProfile } = useAuth();
  const { favorites } = useFavorites();
  const { stageOf } = useAppStages();

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingMobile, setEditingMobile] = useState(false);
  const [mobileInput, setMobileInput] = useState('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [savingMobile, setSavingMobile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [showLocked, setShowLocked] = useState(false);
  const [recent, setRecent] = useState<{ appId: string; lastOpenedAt: string }[] | null>(null);
  const [loginMethod, setLoginMethod] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userEmail) getRecentApps(userEmail).then(setRecent);
    setLoginMethod(storage.getItem('emami_apps_login_method'));
  }, [userEmail]);

  // ── Actions ──────────────────────────────────────────────────────────────────────────────
  const startEditMobile = () => {
    setMobileInput(profile?.mobile ? profile.mobile.replace(/^\+91/, '') : '');
    setMobileError(null);
    setEditingMobile(true);
  };
  const saveMobile = async () => {
    if (!userEmail || savingMobile) return;
    const normalized = normalizeIndianMobileClient(mobileInput);
    if (!normalized) return setMobileError('Enter a valid 10-digit Indian mobile number.');
    setSavingMobile(true);
    setMobileError(null);
    try {
      const res = await updateMobile(userEmail, normalized);
      if (!res.ok) throw new Error(res.error || 'Could not save mobile number.');
      setEditingMobile(false);
      refreshProfile();
    } catch (err: any) {
      setMobileError(err?.message || 'Could not save mobile number.');
    } finally {
      setSavingMobile(false);
    }
  };
  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userEmail || uploadingPhoto) return;
    if (file.size > MAX_UPLOAD_BYTES) return setUploadError('Please choose an image 4MB or smaller.');
    setUploadingPhoto(true);
    setUploadError(null);
    try {
      // Center-crop to square first so a non-square photo is cropped, not stretched.
      const dataUri = await cropAndResizeImageToDataUri(file, PHOTO_SIZE, 0.8);
      const res = await uploadProfilePhoto(userEmail, dataUri);
      if (!res.ok) throw new Error(res.error || 'Could not upload photo.');
      refreshProfile();
    } catch (err: any) {
      setUploadError(err?.message || 'Could not upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };
  const copyEmail = () => {
    if (!userEmail) return;
    navigator.clipboard?.writeText(userEmail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const roleByApp = useMemo(() => new Map((access?.apps ?? []).map((a) => [a.appId, a])), [access]);
  const openApp = (app: AppItem) => {
    if (!roleByApp.has(app.id)) return;
    if (userEmail) logEvent(userEmail, 'APP_OPEN', app.id);
    if (app.url) window.location.assign(app.url);
    else router.push(`/apps/${app.id}`);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────────────────
  const name = profile?.name || userEmail || '';
  const firstName = name.split(' ')[0];
  const level = access?.accessLevel;
  const levelInfo = level ? LEVEL_INFO[level] : null;
  const isActive = (profile?.status || 'Active') === 'Active';
  const sessions = profile?.sessionsTotal ?? 0;
  const timeSpent = plausibleTimeSpent(profile?.timeSpent, sessions);
  const lastSession = profile?.lastSessionDuration && profile.lastSessionDuration !== '0s' ? profile.lastSessionDuration : null;
  const mobile = formatMobile(profile?.mobile);

  const sortedApps = useMemo(() => [...APPS].sort((a, b) => a.name.localeCompare(b.name)), []);
  const q = appSearch.trim().toLowerCase();
  const myApps = sortedApps.filter((a) => roleByApp.has(a.id) && (!q || a.name.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)));
  const lockedApps = sortedApps.filter((a) => !roleByApp.has(a.id) && (!q || a.name.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q)));
  const grantedTotal = sortedApps.filter((a) => roleByApp.has(a.id)).length;
  const favoriteApps = APPS.filter((a) => favorites.has(a.id));
  const topApps = profile?.topApps ?? [];
  const maxOpens = Math.max(1, ...topApps.map((a) => a.opens));
  const recentApps = (recent ?? []).filter((r) => appById(r.appId)).slice(0, 6);

  const checklist = [
    { done: !!profile?.photoUrl, label: 'Add a profile photo', action: () => fileInputRef.current?.click() },
    { done: !!profile?.mobile, label: 'Add your mobile number', action: startEditMobile },
    { done: favoriteApps.length > 0, label: 'Star your favourite apps', action: () => router.push('/my-applications') },
  ];
  const completeCount = checklist.filter((c) => c.done).length;
  const pad = isWide ? 24 : 14;

  return (
    <div style={{ minHeight: '100%', padding: pad, paddingBottom: 48 }}>
      <AdminStyles />
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoSelected} style={{ display: 'none' }} />

      <button type="button" className="ac-btn" onClick={() => router.push('/')} style={{ ...secondaryBtnStyle, height: 34, borderRadius: radii.pill, marginBottom: 14 }}>
        <ArrowLeft size={14} /> Back to Emami Apps
      </button>

      {/* ── Hero ── */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: radii.xxxl + 4, padding: isWide ? 28 : 18, background: `linear-gradient(125deg, ${colors.plumDeep} 0%, #2A2070 45%, ${colors.rust} 100%)`, boxShadow: '0 18px 40px -18px rgba(37,27,120,0.6)' }}>
        <div aria-hidden style={{ position: 'absolute', right: -60, top: -80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,124,255,0.55), transparent 70%)' }} />
        <div aria-hidden style={{ position: 'absolute', left: '35%', bottom: -140, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.25), transparent 70%)' }} />

        <div style={{ position: 'relative', display: 'flex', gap: isWide ? 24 : 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ borderRadius: '50%', padding: 4, background: 'linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.15))' }}>
              <Avatar name={name} size={isWide ? 104 : 80} photoUrl={profile?.photoUrl} />
            </div>
            <button
              type="button"
              className="ac-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              title="Change photo (JPG, PNG or WebP, max 4MB)"
              aria-label="Change profile photo"
              style={{ position: 'absolute', right: 2, bottom: 2, width: 34, height: 34, borderRadius: 17, border: `3px solid ${colors.plumDeep}`, backgroundColor: colors.white, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {uploadingPhoto ? <Spinner size={13} /> : <Camera size={15} color={colors.rust} />}
            </button>
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, fontSize: 12.5, fontFamily: fonts.sansMedium, color: 'rgba(255,255,255,0.7)' }}>{greeting()}, {firstName}</p>
            <h1 style={{ margin: '4px 0 10px', fontSize: isWide ? 26 : 21, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.white, letterSpacing: -0.3 }}>{name || <Skeleton width={200} height={24} />}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {level && levelInfo && (
                <HeroPill>
                  <levelInfo.icon size={13} color="#FCD34D" /> {level}
                </HeroPill>
              )}
              <HeroPill>
                <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isActive ? '#4ADE80' : '#94A3B8', boxShadow: isActive ? '0 0 0 3px rgba(74,222,128,0.25)' : 'none' }} />
                {isActive ? 'Active' : profile?.status}
              </HeroPill>
              {profile?.role && <HeroPill>{profile.role}</HeroPill>}
              <HeroPill>
                <Layers size={13} /> {access ? `${grantedTotal} apps` : '…'}
              </HeroPill>
            </div>
            {uploadError && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#FDA4AF', fontFamily: fonts.sansMedium }}>{uploadError}</p>}
          </div>

          <button type="button" className="ac-btn" onClick={() => logout()} style={{ ...secondaryBtnStyle, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.22)', color: colors.white }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>

        {/* Contact strip */}
        <div style={{ position: 'relative', marginTop: 22, display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isWide ? 220 : 200}px, 1fr))`, gap: 10 }}>
          <ContactTile icon={Mail} label="Work email">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={contactValueStyle}>{profile?.email || userEmail}</span>
              <button type="button" onClick={copyEmail} style={heroIconBtnStyle} aria-label="Copy email" title="Copy">
                {copied ? <Check size={13} color="#4ADE80" /> : <Copy size={13} color="rgba(255,255,255,0.75)" />}
              </button>
            </span>
          </ContactTile>
          <ContactTile icon={Phone} label="Mobile">
            {editingMobile ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: fonts.sansSemiBold }}>+91</span>
                  <input
                    value={mobileInput}
                    onChange={(e) => { setMobileInput(e.target.value); setMobileError(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveMobile(); if (e.key === 'Escape') setEditingMobile(false); }}
                    placeholder="10-digit number"
                    maxLength={15}
                    autoFocus
                    disabled={savingMobile}
                    style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white, border: 'none', borderBottom: '1px solid rgba(255,255,255,0.5)', outline: 'none', background: 'transparent', padding: '2px 0' }}
                  />
                  {savingMobile ? (
                    <Spinner light size={14} />
                  ) : (
                    <>
                      <button type="button" onClick={saveMobile} style={heroIconBtnStyle} aria-label="Save mobile"><Check size={15} color="#4ADE80" /></button>
                      <button type="button" onClick={() => setEditingMobile(false)} style={heroIconBtnStyle} aria-label="Cancel"><X size={15} color="#FDA4AF" /></button>
                    </>
                  )}
                </span>
                {mobileError && <span style={{ fontSize: 11, color: '#FDA4AF', fontFamily: fonts.sansMedium }}>{mobileError}</span>}
              </span>
            ) : (
              <button type="button" onClick={startEditMobile} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0 }}>
                <span style={{ ...contactValueStyle, color: mobile ? colors.white : '#FCD34D' }}>{mobile || 'Add mobile number'}</span>
                <Pencil size={12} color="rgba(255,255,255,0.7)" />
              </button>
            )}
          </ContactTile>
          <ContactTile icon={LogIn} label="Last sign-in">
            <span style={contactValueStyle} title={profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : undefined}>
              {profile?.lastLogin ? `${timeAgo(profile.lastLogin)} · ${new Date(profile.lastLogin).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '—'}
            </span>
          </ContactTile>
          <ContactTile icon={KeyRound} label="Signed in with">
            <span style={contactValueStyle}>{loginMethod === 'sso' ? 'Microsoft (Emami account)' : loginMethod === 'direct' ? 'Email sign-in link' : '—'}</span>
          </ContactTile>
        </div>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isWide ? 165 : 140}px, 1fr))`, gap: 12, marginTop: 18 }}>
        <Stat icon={LogIn} accent="#0EA5E9" label="Sign-ins" value={profile?.logins} hint="See every sign-in" onClick={() => router.push('/settings/activity?view=signins')} />
        <Stat icon={History} accent={colors.rust} label="Sessions" value={profile?.sessionsTotal} hint="See each visit and its apps" onClick={() => router.push('/settings/activity?view=sessions')} />
        <Stat icon={MousePointerClick} accent="#9333EA" label="Apps opened" value={profile?.appsOpened} hint="All-time app launches" />
        <Stat icon={Star} accent="#F59E0B" label="Favourites" value={favoriteApps.length} hint={`${profile?.favoritesAdded ?? 0} stars added over time`} />
        <Stat icon={Download} accent="#16A34A" label="Downloads" value={profile?.downloads} hint="Files downloaded from apps" />
        <Stat icon={Timer} accent="#0D9488" label={lastSession ? 'Last session' : 'Time on app'} value={profile ? lastSession ?? timeSpent ?? 'Not tracked' : undefined} hint={lastSession ? (timeSpent ? `${timeSpent} in total` : 'Length of your last visit') : 'Tracked when you use Sign out'} small={!lastSession && !timeSpent} onClick={() => router.push('/settings/activity?view=sessions')} />
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isWide ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : '1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
        {/* My apps */}
        <div style={{ ...cardStyle, padding: isWide ? 20 : 16 }}>
          <CardHead
            icon={Layers}
            accent={colors.rust}
            title="My apps"
            sub={access ? `You can open ${grantedTotal} of ${APPS.length} apps` : 'Loading your access…'}
          />
          <div className="ac-input" style={{ ...inputWrapStyle, height: 38, marginBottom: 12 }}>
            <Search size={14} color={colors.inkSoft} />
            <input value={appSearch} onChange={(e) => setAppSearch(e.target.value)} placeholder="Find an app or category…" style={inputStyle} aria-label="Search your apps" />
            {!!appSearch && <button type="button" onClick={() => setAppSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} aria-label="Clear"><X size={13} color={colors.inkSoft} /></button>}
          </div>

          {!access ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={46} radius={12} />)}</div>
          ) : myApps.length === 0 ? (
            <EmptyState icon={Layers} title={q ? 'None of your apps match' : 'No apps granted yet'} hint={q ? undefined : 'Ask your admin for access — see Help & Support.'} />
          ) : (
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, overflow: 'hidden' }}>
              {myApps.map((app, i) => {
                const grant = roleByApp.get(app.id)!;
                const stage = stageOf(app.id);
                const accent = appColor(app.id);
                return (
                  <button key={app.id} type="button" className="ac-row" onClick={() => openApp(app)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`, backgroundColor: colors.white, cursor: 'pointer', textAlign: 'left' }}>
                    <AppIcon appId={app.id} size={36} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                        {favorites.has(app.id) && <Star size={12} color={colors.amber} fill={colors.amber} style={{ flexShrink: 0 }} />}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>{app.cat}</span>
                        {stage && <StageBadge stage={stage} compact />}
                      </span>
                    </span>
                    <span style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: accent, backgroundColor: `${accent}14`, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }} title="Your role in this app">
                      {grant.role}{grant.depot ? ` · ${grant.depot}` : ''}
                    </span>
                    <ChevronRight size={16} color="#A0A6B1" />
                  </button>
                );
              })}
            </div>
          )}

          {access && lockedApps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <button type="button" onClick={() => setShowLocked((s) => !s)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '6px 2px', cursor: 'pointer', textAlign: 'left' }}>
                <Lock size={14} color={colors.inkSoft} />
                <span style={{ flex: 1, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft }}>
                  {lockedApps.length} other app{lockedApps.length === 1 ? '' : 's'} you don&apos;t have access to
                </span>
                {showLocked ? <ChevronDown size={15} color={colors.inkSoft} /> : <ChevronRight size={15} color={colors.inkSoft} />}
              </button>
              {showLocked && (
                <div className="ac-fade" style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {lockedApps.map((a) => (
                      <span key={a.id} style={{ ...chipStyle(false), cursor: 'default', opacity: 0.85 }} title={a.desc}>
                        <AppIcon appId={a.id} size={18} /> {a.name}
                      </span>
                    ))}
                  </div>
                  <button type="button" className="ac-btn" onClick={() => router.push('/help')} style={{ ...secondaryBtnStyle, height: 34, marginTop: 12 }}>
                    <LifeBuoy size={14} color={colors.rust} /> Request access
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Profile completeness */}
          {completeCount < checklist.length && (
            <div style={{ ...cardStyle, padding: 18, background: `linear-gradient(135deg, ${colors.rust}0c, ${colors.white} 60%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Ring value={completeCount / checklist.length} />
                <div style={{ flex: 1 }}>
                  <p style={sectionTitleStyle}>Complete your profile</p>
                  <p style={sectionSubStyle}>{completeCount} of {checklist.length} done — helps colleagues and admins reach you</p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {checklist.map((c) => (
                  <button key={c.label} type="button" className={c.done ? undefined : 'ac-row'} onClick={c.done ? undefined : c.action} disabled={c.done} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', border: 'none', background: 'transparent', borderRadius: radii.md, cursor: c.done ? 'default' : 'pointer', textAlign: 'left' }}>
                    {c.done ? <CheckCircle2 size={17} color="#16A34A" /> : <Circle size={17} color="#A0A6B1" />}
                    <span style={{ flex: 1, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: c.done ? colors.inkSoft : colors.ink, textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
                    {!c.done && <ChevronRight size={14} color={colors.rust} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Most used */}
          <div style={{ ...cardStyle, padding: 18 }}>
            <CardHead icon={Sparkles} accent="#9333EA" title="Your most used apps" sub="By number of times opened" />
            {!profile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={26} />)}</div>
            ) : topApps.length === 0 ? (
              <EmptyState icon={Sparkles} title="Nothing yet" hint="Open a few apps and your favourites will show up here." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topApps.map((t, i) => {
                  const app = appById(t.appId);
                  const accent = appColor(t.appId);
                  return (
                    <button key={t.appId} type="button" onClick={() => app && openApp(app)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                      <AppIcon appId={t.appId} size={30} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {i === 0 && <Crown size={12} color={colors.amber} style={{ marginRight: 4, verticalAlign: -1 }} />}
                            {app?.name || t.appId}
                          </span>
                          <span style={{ fontSize: 11.5, fontFamily: fonts.sansSemiBold, color: colors.inkSoft, whiteSpace: 'nowrap' }}>{t.opens} opens</span>
                        </span>
                        <span style={{ display: 'block', height: 6, borderRadius: 3, backgroundColor: colors.appBg, overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${Math.max(5, (t.opens / maxOpens) * 100)}%`, borderRadius: 3, background: `linear-gradient(90deg, ${accent}88, ${accent})` }} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recently opened */}
          <div style={{ ...cardStyle, padding: 18 }}>
            <CardHead icon={Clock} accent="#0EA5E9" title="Recently opened" sub="Pick up where you left off" action={recentApps.length > 0 ? <LinkBtn onClick={() => router.push('/recent')}>See all</LinkBtn> : undefined} />
            {recent === null ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
            ) : recentApps.length === 0 ? (
              <EmptyState icon={Clock} title="No recent apps" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {recentApps.map((r) => {
                  const app = appById(r.appId)!;
                  const allowed = roleByApp.has(r.appId);
                  return (
                    <button key={r.appId} type="button" className="ac-row" onClick={() => openApp(app)} disabled={!allowed} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', border: 'none', background: 'transparent', borderRadius: radii.md, cursor: allowed ? 'pointer' : 'not-allowed', textAlign: 'left', width: '100%', opacity: allowed ? 1 : 0.55 }}>
                      <AppIcon appId={r.appId} size={28} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.name}</span>
                      {!allowed && <Lock size={12} color={colors.inkSoft} />}
                      <span style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, color: colors.inkSoft, whiteSpace: 'nowrap' }} title={new Date(r.lastOpenedAt).toLocaleString()}>{timeAgo(r.lastOpenedAt)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Favourites */}
          <div style={{ ...cardStyle, padding: 18 }}>
            <CardHead icon={Star} accent="#F59E0B" title="Favourites" sub="Shown under Quick access in the sidebar" />
            {favoriteApps.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft }}>Star an app from My Applications to pin it here.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {favoriteApps.map((a) => (
                  <button key={a.id} type="button" className="ac-btn" onClick={() => openApp(a)} disabled={!roleByApp.has(a.id)} style={{ ...chipStyle(false), color: colors.ink }}>
                    <AppIcon appId={a.id} size={20} /> {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Account & security ── */}
      <div style={{ ...cardStyle, padding: isWide ? 20 : 16, marginTop: 16 }}>
        <CardHead icon={ShieldCheck} accent="#16A34A" title="Account & security" sub="How your access to Emami Apps works" />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${isWide ? 260 : 220}px, 1fr))`, gap: 12 }}>
          {levelInfo && level && (
            <InfoTile icon={levelInfo.icon} accent={levelInfo.color} title={`Access level · ${level}`} text={levelInfo.text} />
          )}
          <InfoTile icon={CheckCircle2} accent={isActive ? '#16A34A' : '#94A3B8'} title={<>Account status · <StatusDot active={isActive} label={isActive ? 'Active' : profile?.status} /></>} text={isActive ? 'You are allowed to sign in. If this ever changes, contact your admin.' : 'Your sign-in has been paused by an admin.'} />
          <InfoTile icon={Timer} accent="#0D9488" title="Automatic sign-out" text={`For your security you are signed out after ${MAX_SESSION_HOURS} hours without activity. Use Sign out on shared computers.`} />
          <InfoTile icon={Info} accent="#64748B" title="Your role in each app" text="The role badge next to each app (User, Admin, Finance…) is what you can do inside it. Some apps also check your role in SAP." />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <button type="button" className="ac-btn" onClick={() => router.push('/help')} style={secondaryBtnStyle}>
            <LifeBuoy size={15} color={colors.rust} /> Help &amp; Support
          </button>
          {(level === 'Admin' || level === 'Super Admin') && (
            <button type="button" className="ac-btn" onClick={() => router.push('/manage-access')} style={secondaryBtnStyle}>
              <Settings2 size={15} color={colors.rust} /> Open Admin Center
            </button>
          )}
          <button type="button" className="ac-btn" onClick={() => logout()} style={{ ...secondaryBtnStyle, color: '#E11D48', borderColor: '#FECDD3' }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────────────────────

function HeroPill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: colors.white, fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function ContactTile({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: radii.xl, backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)', minWidth: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={colors.white} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 10.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
        {children}
      </span>
    </div>
  );
}

function Stat({ icon: Icon, accent, label, value, hint, small, onClick }: { icon: React.ElementType; accent: string; label: string; value: number | string | undefined; hint: string; small?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={onClick ? 'ac-card' : undefined} style={{ ...cardStyle, padding: 16, position: 'relative', overflow: 'hidden', textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'block', width: '100%' }} title={hint}>
      {onClick && <ChevronRight size={16} color="#A0A6B1" style={{ position: 'absolute', right: 12, bottom: 14 }} />}
      <span aria-hidden style={{ position: 'absolute', right: -18, top: -18, width: 70, height: 70, borderRadius: 35, backgroundColor: `${accent}10` }} />
      <span style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: `${accent}17`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={accent} />
      </span>
      <span style={{ display: 'block', marginTop: 10 }}>
        {value === undefined ? (
          <Skeleton width={60} height={24} />
        ) : (
          <span style={{ display: 'block', fontSize: small ? 15 : 24, lineHeight: '28px', fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: small ? colors.inkSoft : colors.ink, letterSpacing: -0.3 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
        )}
        <span style={{ display: 'block', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, marginTop: 4 }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1 }}>{hint}</span>
      </span>
    </Tag>
  );
}

function CardHead({ icon: Icon, accent, title, sub, action }: { icon: React.ElementType; accent: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <span style={{ width: 34, height: 34, borderRadius: radii.md, backgroundColor: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} color={accent} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={sectionTitleStyle}>{title}</p>
        {sub && <p style={sectionSubStyle}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function InfoTile({ icon: Icon, accent, title, text }: { icon: React.ElementType; accent: string; title: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: radii.xl, border: `1px solid ${colors.border}`, backgroundColor: '#FCFCFE' }}>
      <span style={{ width: 32, height: 32, borderRadius: radii.md, backgroundColor: `${accent}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={accent} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, flexWrap: 'wrap' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '17px', marginTop: 3 }}>{text}</span>
      </span>
    </div>
  );
}

function LinkBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust, whiteSpace: 'nowrap' }}>
      {children} <ChevronRight size={13} />
    </button>
  );
}

/** Small progress ring for the profile checklist. */
function Ring({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
      <circle cx={22} cy={22} r={r} fill="none" stroke={colors.border} strokeWidth={4} />
      <circle cx={22} cy={22} r={r} fill="none" stroke={colors.rust} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 22 22)" />
      <text x={22} y={26} textAnchor="middle" fontSize={11} fontWeight={700} fill={colors.ink} fontFamily="var(--font-montserrat)">{Math.round(value * 100)}%</text>
    </svg>
  );
}

const contactValueStyle: React.CSSProperties = { fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
const heroIconBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 };
