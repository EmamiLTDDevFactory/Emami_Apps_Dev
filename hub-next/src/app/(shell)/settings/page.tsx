'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Clock3, LogOut, Pencil, Check, X, ShieldCheck } from 'lucide-react';
import Avatar from '../../../components/Avatar';
import Badge from '../../../components/Badge';
import { useAuth } from '../../../context/AuthContext';
import { uploadProfilePhoto, updateMobile } from '../../../lib/authApi';
import { cropAndResizeImageToDataUri } from '../../../lib/imageUtils';
import { appById } from '../../../data/mockData';
import { colors, fonts, fontWeights, radii, appColor } from '../../../theme/tokens';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PHOTO_SIZE = 512;

/** Mirrors backend/userProfile.js's normalizeIndianMobile — same acceptance rules (with/without
 * +91, 91 or a leading 0, spaces/dashes ignored, must be a 10-digit number starting with 6-9) so
 * the user gets instant feedback instead of a round-trip just to learn the format was wrong. The
 * backend re-validates independently; this is only for a fast Save button state, never trusted
 * as the real check. */
function normalizeIndianMobileClient(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout, userEmail, profile, access, refreshProfile } = useAuth();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editingMobile, setEditingMobile] = useState(false);
  const [mobileInput, setMobileInput] = useState('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [savingMobile, setSavingMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPressEditMobile = () => {
    setMobileInput(profile?.mobile ? profile.mobile.replace(/^\+91/, '') : '');
    setMobileError(null);
    setEditingMobile(true);
  };

  const onCancelEditMobile = () => {
    setEditingMobile(false);
    setMobileError(null);
  };

  const onSaveMobile = async () => {
    if (!userEmail || savingMobile) return;
    const normalized = normalizeIndianMobileClient(mobileInput);
    if (!normalized) {
      setMobileError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
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

  const onPickPhoto = () => fileInputRef.current?.click();

  const onPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file || !userEmail || uploadingPhoto) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('Please choose an image 4MB or smaller.');
      return;
    }

    setUploadingPhoto(true);
    setUploadError(null);
    try {
      // Center-crop to square first — a plain resize with independent width/height would stretch
      // a non-square photo instead of cropping it, distorting the image.
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

  const mostUsedAppLabel = profile?.mostUsedApp
    ? appById(profile.mostUsedApp)?.name || profile.mostUsedApp
    : '—';

  const user = {
    name: profile?.name || userEmail || '',
    email: profile?.email || userEmail || '',
    mobile: profile?.mobile || '—',
    role: profile?.role || '—',
    status: profile?.status || '—',
    lastLogin: profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : '—',
  };
  const accessLevel = access?.accessLevel || '—';

  // First row matches the reference design's primary tiles (minus chat/token stats, which don't
  // apply to this hub); the rest are existing tiles this hub already tracked before that redesign
  // — kept so nothing already working gets dropped just to match the reference more literally.
  const STATS = [
    { label: 'Logins', value: profile?.logins ?? '—' },
    { label: 'Time Spent', value: profile?.timeSpent ?? '—' },
    { label: 'Apps Opened', value: profile?.appsOpened ?? '—' },
    { label: 'Downloads', value: profile?.downloads ?? '—' },
    { label: 'Favorites Added', value: profile?.favoritesAdded ?? '—' },
    { label: 'Notifications Read', value: profile?.notificationsRead ?? '—' },
    { label: 'Most Used App', value: mostUsedAppLabel },
  ];

  const topApps = profile?.topApps ?? [];
  const maxOpens = Math.max(1, ...topApps.map((a) => a.opens));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/')} style={backBtnStyle}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Emami Apps</span>
        </button>
        <p style={{ fontSize: 18, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>My Profile</p>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => logout()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.rust}40`, borderRadius: radii.pill, padding: '7px 12px', backgroundColor: `${colors.rust}0d`, cursor: 'pointer' }}
        >
          <LogOut size={13} color={colors.rust} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.rust }}>Sign out</span>
        </button>
      </div>

      <div style={{ ...baseCardStyle, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
          <div style={{ minWidth: 160 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={user.name} size={56} photoUrl={profile?.photoUrl} />
              <button
                type="button"
                onClick={onPickPhoto}
                disabled={uploadingPhoto}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '6px 10px', backgroundColor: colors.appBg, cursor: uploadingPhoto ? 'default' : 'pointer' }}
              >
                {uploadingPhoto ? (
                  <div className="spinner" style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.ink }} />
                ) : (
                  <Camera size={12} color={colors.ink} />
                )}
                <span style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{uploadingPhoto ? 'Uploading…' : 'Upload Photo'}</span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhotoSelected} style={{ display: 'none' }} />
            </div>
            <p style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 8, marginBottom: 0 }}>JPG, PNG or WebP · max 4MB · resized to 512×512</p>
            {uploadError && <p style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: '#DC2626', marginTop: 6, marginBottom: 0 }}>{uploadError}</p>}
          </div>

          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{user.name}</span>
              {accessLevel !== '—' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck size={12} color={colors.rust} />
                  <Badge label={accessLevel} color={colors.rust} />
                </span>
              )}
            </div>
            <p style={{ fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 4, marginBottom: 0 }}>{user.mobile}</p>
            <p style={{ fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 4, marginBottom: 0 }}>{user.email}</p>
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: colors.border, margin: '18px 0' }} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ minWidth: 170 }}>
            <p style={metaLabelStyle}>Mobile</p>
            {editingMobile ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    value={mobileInput}
                    onChange={(e) => { setMobileInput(e.target.value); setMobileError(null); }}
                    placeholder="10-digit number"
                    maxLength={15}
                    autoFocus
                    disabled={savingMobile}
                    style={{ flex: 1, fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, border: 'none', borderBottom: `1px solid ${colors.border}`, outline: 'none', minWidth: 90, background: 'transparent' }}
                  />
                  {savingMobile ? (
                    <div className="spinner" style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.ink }} />
                  ) : (
                    <>
                      <button type="button" onClick={onSaveMobile} style={iconBtnStyle}><Check size={15} color={colors.green} /></button>
                      <button type="button" onClick={onCancelEditMobile} style={iconBtnStyle}><X size={15} color={colors.rust} /></button>
                    </>
                  )}
                </div>
                {mobileError && <p style={{ fontSize: 10.5, fontFamily: fonts.sansRegular, color: colors.rust, marginTop: 4, marginBottom: 0 }}>{mobileError}</p>}
              </div>
            ) : (
              <button type="button" onClick={onPressEditMobile} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span style={metaValueStyle}>{user.mobile}</span>
                <Pencil size={12} color={colors.inkSoft} />
              </button>
            )}
          </div>
          <div style={{ minWidth: 110 }}>
            <p style={metaLabelStyle}>Access Level</p>
            <p style={metaValueStyle}>{accessLevel}</p>
          </div>
          <div style={{ minWidth: 110 }}>
            <p style={metaLabelStyle}>Status</p>
            <p style={{ ...metaValueStyle, color: colors.green }}>{user.status}</p>
          </div>
          <div style={{ minWidth: 110 }}>
            <p style={metaLabelStyle}>Last Login</p>
            <p style={metaValueStyle}>{user.lastLogin}</p>
          </div>
        </div>
      </div>

      <div style={{ ...baseCardStyle, borderLeft: `3px solid ${'#0D9488'}`, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: radii.md, backgroundColor: '#0D9488', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Clock3 size={15} color={colors.white} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.5, color: colors.ink, margin: 0 }}>YOUR TIME ON APP</p>
            <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 3, marginBottom: 0 }}>
              {profile?.lastSessionDuration
                ? `Last session · ${profile.timeSpent} all-time`
                : profile && profile.sessionsTotal <= 1
                  ? 'This is your first session — keep going, your time will land here next visit.'
                  : `Total time spent across all your sessions: ${profile?.timeSpent ?? '—'}.`}
            </p>
          </div>
          <Badge label={`${profile?.sessionsTotal ?? 0} sessions total`} color={colors.inkSoft} />
        </div>

        {profile?.lastSessionDuration && (
          <p style={{ fontSize: 30, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, marginTop: 14, marginLeft: 46, marginBottom: 0 }}>
            {profile.lastSessionDuration}
          </p>
        )}

        {topApps.length > 0 && (
          <div style={{ marginTop: 16, marginLeft: 46, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topApps.map((a) => {
              const app = appById(a.appId);
              const accent = appColor(a.appId);
              const pct = Math.max(6, Math.round((a.opens / maxOpens) * 100));
              return (
                <div key={a.appId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 110, fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app?.name || a.appId}
                  </span>
                  <div style={{ flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.appBg, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: radii.pill, width: `${pct}%`, backgroundColor: accent }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft }}>{a.opens}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ ...baseCardStyle, padding: 20 }}>
        <p style={{ fontSize: 12, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.6, color: colors.ink, marginTop: 0, marginBottom: 14 }}>ACTIVITY</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ minWidth: 140, flexGrow: 1, border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.appBg, padding: '12px 14px' }}>
              <p style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.inkSoft, marginTop: 0, marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 16, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .spinner {
          animation: settings-spin 0.8s linear infinite;
        }
        @keyframes settings-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

const backBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: `1px solid ${colors.border}`,
  borderRadius: radii.pill,
  padding: '7px 12px',
  backgroundColor: colors.white,
  cursor: 'pointer',
};

const baseCardStyle: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radii.xl,
  backgroundColor: colors.white,
};

const iconBtnStyle: React.CSSProperties = { padding: 2, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' };

const metaLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontFamily: fonts.sansBold,
  fontWeight: fontWeights.sansBold,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: colors.inkSoft,
  marginTop: 0,
  marginBottom: 4,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontFamily: fonts.sansSemiBold,
  fontWeight: fontWeights.sansSemiBold,
  color: colors.ink,
  margin: 0,
};
