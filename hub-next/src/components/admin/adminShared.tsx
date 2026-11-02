'use client';

import React from 'react';
import { ShieldCheck, Crown, Eye } from 'lucide-react';
import { APPS, appById } from '../../data/mockData';
import type { AccessChangeEntry, AccessLevel, AppRole, UserAccessEntry } from '../../types';
import type { AdminRosterUsage } from '../../lib/adminApi';
import { appColor, colors, fontWeights, fonts, gradients, radii, shadows } from '../../theme/tokens';

/** Shared bits for the Admin Center (the merged Manage Access + Administration screen) — role
 * rules, formatters and the small visual primitives every panel/drawer there reuses. */

export const AUDIT_CAPA_APP_ID = 'audit-capa';
/** CQA's depot list (2026-10-14), in their order; must match embedded-apps/audit-capa/backend/config/depots.js. */
export const AUDIT_CAPA_DEPOTS = [
  'Kolkata Depot', 'Delhi Depot', 'Ambala Depot', 'Indore Depot', 'Jaipur Depot', 'Ahmedabad Depot',
  'Mumbai Depot', 'Pune Depot', 'Nagpur Depot', 'Dehradun Depot', 'Kanpur/Unnao Depot', 'Varanasi Depot',
  'Patna Depot', 'Bhagalpur Depot', 'Ranchi Depot', 'Raipur Depot', 'Cuttack Depot', 'Guwahati Depot',
  'Bangalore Depot', 'Hyderabad Depot', 'Coimbatore Depot', 'Siliguri Depot', 'Jabalpur Depot', 'HO',
];
/** Audit & CAPA roles that belong to a depot: Depot, and View (read-only Depot-side access; a
 * View user at 'HO' sees every depot inside Audit & CAPA). */
export const auditCapaRoleNeedsDepot = (role: string | null | undefined) => role === 'Depot' || role === 'View';
const PAYMENT_TRACKING_APP_ID = 'payment-tracking';
/** Apps that only take a single hub-level grant — their real screen roles come from SAP or the
 * app's own DB (PO Approval, Audit Tool, Shelf Life Deviation). */
const SINGLE_GRANT_APP_IDS = new Set(['fm-po-deviation', 'audit-tool', 'shelf-life-deviation']);
/** Apps that manage their own role internally — the hub grant is only generic access to them. */
export const ROLE_MANAGED_INTERNALLY = new Set(['audit-capa', 'finance', 'market-rate', 'inventory', 'expense', 'hr']);

/** Alphabetical — mockData.ts insertion order reflects when each app was added, not display order. */
export const SORTED_APPS = [...APPS].sort((a, b) => a.name.localeCompare(b.name));
export const GRANTABLE_LEVELS: AccessLevel[] = ['Admin', 'Viewer'];
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function roleOptionsFor(appId: string): AppRole[] {
  if (appId === AUDIT_CAPA_APP_ID) return ['Depot', 'View', 'CQA'];
  if (appId === PAYMENT_TRACKING_APP_ID) return ['User', 'Admin', 'Finance', 'Super Admin'];
  if (appId === 'bom-cost-explorer') return ['User', 'Admin', 'Planner']; // Planner: upload / edit production plans
  if (appId === 'setu') return ['Agent', 'Supervisor', 'Admin']; // Supervisor: daily report; Admin: Setu configuration
  if (SINGLE_GRANT_APP_IDS.has(appId)) return ['User'];
  return ['User', 'Admin'];
}

export function roleOf(user: UserAccessEntry, appId: string): AppRole | null {
  return user.apps.find((a) => a.appId === appId)?.role ?? null;
}
export function depotOf(user: UserAccessEntry, appId: string): string | null {
  return user.apps.find((a) => a.appId === appId)?.depot ?? null;
}

/** Super Admin can grant Admin or Viewer; Admin can only grant Viewer; Super Admin is fixed. */
export function canSetLevel(actingLevel: AccessLevel | undefined, target: UserAccessEntry, level: AccessLevel): boolean {
  if (target.accessLevel === 'Super Admin') return false;
  if (actingLevel === 'Super Admin') return true;
  return actingLevel === 'Admin' && level === 'Viewer';
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
export async function runBatched<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const batch of chunk(items, size)) out.push(...(await Promise.all(batch.map(fn))));
  return out;
}

export function appLabel(appId: string): string {
  return appById(appId)?.name || appId;
}
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
/** "3h ago" / "2d ago" — falls back to a short date past a month. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateShort(iso);
}

/** A readable name out of an email when the roster has none — "indranil.banerjee@…" → "Indranil Banerjee". */
export function displayName(email: string, name?: string | null): string {
  if (name && name.trim()) return name.trim();
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function describeChange(c: AccessChangeEntry): string {
  switch (c.changeType) {
    case 'USER_ADDED':
      return 'Added to the hub';
    case 'USER_REMOVED':
      return 'Removed from the hub';
    case 'ACTIVE_STATUS':
      return c.newValue === 'true' ? 'Sign-in activated' : 'Sign-in deactivated';
    case 'ACCESS_LEVEL':
      return `Access level ${c.oldValue ?? '—'} → ${c.newValue ?? '—'}`;
    case 'APP_ROLE': {
      const app = c.appId ? appLabel(c.appId) : 'an app';
      if (!c.oldValue) return `Granted ${app} · ${c.newValue}`;
      if (!c.newValue) return `Revoked ${app} (was ${c.oldValue})`;
      return `${app} role ${c.oldValue} → ${c.newValue}`;
    }
    case 'MOBILE_SET':
      return 'Mobile number updated';
    case 'NAME_SET':
      return c.oldValue ? `Name changed from ${c.oldValue} to ${c.newValue ?? '—'}` : `Name set to ${c.newValue ?? '—'}`;
    default:
      return c.changeType;
  }
}

export type ChangeTone = 'positive' | 'negative' | 'neutral';
export function changeTone(c: AccessChangeEntry): ChangeTone {
  if (c.changeType === 'USER_ADDED') return 'positive';
  if (c.changeType === 'USER_REMOVED') return 'negative';
  if (c.changeType === 'ACTIVE_STATUS') return c.newValue === 'true' ? 'positive' : 'negative';
  if (c.changeType === 'APP_ROLE') return !c.oldValue ? 'positive' : !c.newValue ? 'negative' : 'neutral';
  return 'neutral';
}
export const TONE_COLOR: Record<ChangeTone, string> = { positive: colors.green, negative: '#E11D48', neutral: colors.rust };

/** The one merged view of a person — Manage Access's editable row plus Administration's usage. */
export type AdminUser = UserAccessEntry & { usage: AdminRosterUsage | null };

// ── Visual primitives ────────────────────────────────────────────────────────────────────────

const AVATAR_HUES = [colors.rust, '#0EA5E9', '#E11D48', colors.green, '#F59E0B', '#9333EA', '#0D9488', '#DB2777', '#EA580C'];
export function Initials({ email, name, size = 34 }: { email: string; name?: string | null; size?: number }) {
  const label = displayName(email, name);
  const initials = label.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length];
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${hue}, ${hue}b3)`, boxShadow: `0 2px 6px ${hue}40` }}>
      <span style={{ color: colors.white, fontSize: size * 0.36, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.3 }}>{initials}</span>
    </div>
  );
}

export function LevelBadge({ level, compact }: { level: AccessLevel; compact?: boolean }) {
  const tone = level === 'Super Admin' ? { c: colors.uat, Icon: Crown } : level === 'Admin' ? { c: colors.rust, Icon: ShieldCheck } : { c: colors.inkSoft, Icon: Eye };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: radii.pill, padding: compact ? '3px 8px' : '4px 10px', backgroundColor: `${tone.c}14`, border: `1px solid ${tone.c}2e`, color: tone.c, fontSize: compact ? 10.5 : 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, whiteSpace: 'nowrap' }}>
      <tone.Icon size={compact ? 11 : 12} strokeWidth={2.2} />
      {level}
    </span>
  );
}

export function StatusDot({ active, label }: { active: boolean; label?: string }) {
  const c = active ? colors.green : colors.inkSoft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: active ? colors.green : colors.inkSoft, whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c, boxShadow: active ? `0 0 0 3px ${c}26` : 'none' }} />
      {label ?? (active ? 'Active' : 'Inactive')}
    </span>
  );
}

export function AppIcon({ appId, size = 30 }: { appId: string; size?: number }) {
  const Icon = appById(appId)?.icon;
  const accent = appColor(appId);
  return (
    <span style={{ width: size, height: size, borderRadius: radii.md, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: `${accent}17` }}>
      {Icon && <Icon size={Math.round(size * 0.5)} color={accent} />}
    </span>
  );
}

/** Toggle switch — used for Active/Inactive so it reads as a setting, not a form checkbox. */
export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled} style={{ width: 40, height: 23, borderRadius: 12, border: 'none', padding: 2, cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: on ? colors.green : '#CBD5E1', transition: 'background-color 180ms', flexShrink: 0, opacity: disabled ? 0.6 : 1 }}>
      <span style={{ display: 'block', width: 19, height: 19, borderRadius: 10, backgroundColor: colors.white, boxShadow: shadows.sm, transform: `translateX(${on ? 17 : 0}px)`, transition: 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
    </button>
  );
}

export function Spinner({ light, size = 16 }: { light?: boolean; size?: number }) {
  return <span className="ac-spin" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', border: `2px solid ${light ? 'rgba(255,255,255,0.4)' : colors.border}`, borderTopColor: light ? colors.white : colors.rust, flexShrink: 0 }} />;
}

export function Skeleton({ height = 14, width = '100%', radius = 6 }: { height?: number; width?: number | string; radius?: number }) {
  return <span className="ac-skel" style={{ display: 'block', height, width, borderRadius: radius }} />;
}

export function EmptyState({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div style={{ padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
      <span style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: `${colors.rust}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={colors.rust} />
      </span>
      <p style={{ margin: 0, fontSize: 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{title}</p>
      {hint && <p style={{ margin: 0, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, maxWidth: 340 }}>{hint}</p>}
    </div>
  );
}

/** Hover/focus/animation rules inline styles can't express. Rendered once by the Admin Center page. */
export function AdminStyles() {
  return (
    <style jsx global>{`
      .ac-spin { animation: ac-spin 0.8s linear infinite; }
      @keyframes ac-spin { to { transform: rotate(360deg); } }
      .ac-skel { background: linear-gradient(90deg, #eceef3 25%, #f6f7fa 37%, #eceef3 63%); background-size: 400% 100%; animation: ac-shimmer 1.3s ease infinite; }
      @keyframes ac-shimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
      .ac-fade { animation: ac-fade 220ms cubic-bezier(0.22, 1, 0.36, 1); }
      @keyframes ac-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      .ac-drawer { animation: ac-slide 260ms cubic-bezier(0.22, 1, 0.36, 1); }
      @keyframes ac-slide { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .ac-backdrop { animation: ac-backdrop 200ms ease; }
      @keyframes ac-backdrop { from { opacity: 0; } to { opacity: 1; } }
      .ac-pop { animation: ac-pop 240ms cubic-bezier(0.22, 1, 0.36, 1); }
      @keyframes ac-pop { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .ac-row { transition: background-color 120ms; }
      .ac-row:hover { background-color: ${colors.cream} !important; }
      .ac-card { transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 180ms, border-color 180ms; }
      .ac-card:hover { transform: translateY(-2px); box-shadow: ${shadows.md}; border-color: ${colors.rust}33 !important; }
      .ac-btn { transition: filter 120ms, background-color 120ms, transform 80ms; }
      .ac-btn:hover:not(:disabled) { filter: brightness(0.96); }
      .ac-btn:active:not(:disabled) { transform: scale(0.97); }
      .ac-btn:disabled { opacity: 0.55; cursor: not-allowed !important; }
      .ac-input:focus-within { box-shadow: 0 0 0 3px ${colors.rust}29; border-color: ${colors.rust} !important; }
      .ac-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
      .ac-scroll::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 8px; }
    `}</style>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────────────────────

export const cardStyle: React.CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radii.xxl, backgroundColor: colors.white, boxShadow: shadows.sm };
export const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink };
export const sectionSubStyle: React.CSSProperties = { margin: '2px 0 0', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft };
export const labelStyle: React.CSSProperties = { fontSize: 10.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 };
export const inputWrapStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, borderRadius: radii.lg, padding: '0 12px', height: 40, backgroundColor: colors.white, border: `1px solid ${colors.border}`, transition: 'box-shadow 150ms, border-color 150ms' };
export const inputStyle: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 13, color: colors.ink, fontFamily: fonts.sansRegular, border: 'none', outline: 'none', background: 'transparent', height: '100%' };
export const primaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', borderRadius: radii.lg, padding: '0 16px', height: 40, background: `linear-gradient(135deg, ${gradients.primary.join(', ')})`, color: colors.white, cursor: 'pointer', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, boxShadow: `0 4px 12px -4px ${colors.rust}80`, whiteSpace: 'nowrap' };
export const secondaryBtnStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '0 14px', height: 40, backgroundColor: colors.white, color: colors.ink, cursor: 'pointer', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, whiteSpace: 'nowrap' };
export const ghostIconBtnStyle: React.CSSProperties = { width: 32, height: 32, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', flexShrink: 0 };
export const chipStyle = (active: boolean, accent: string = colors.rust): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: radii.pill, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${active ? accent : colors.border}`, backgroundColor: active ? `${accent}12` : colors.white,
  color: active ? accent : colors.inkSoft, fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold,
});
export const errorTextStyle: React.CSSProperties = { fontSize: 12, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#DC2626', margin: '8px 0 0' };
