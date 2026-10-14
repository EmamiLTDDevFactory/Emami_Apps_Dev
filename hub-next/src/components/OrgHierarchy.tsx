'use client';
/**
 * Reporting line from Microsoft Entra ID, top-down: L2 manager -> L1 manager -> the signed-in person, drawn as a
 * small tree (connector line + step indent per level) so the hierarchy reads at a glance. Used inside the blue
 * header cards of My Profile and of the account menu ('dark'), and works on light surfaces too ('light').
 * Pure layout: wraps and truncates, so it fits a 320px phone as well as the wide profile hero.
 */
import React from 'react';
import { colors, fonts, fontWeights } from '../theme/tokens';
import type { OrgManager } from '../lib/authApi';

export interface OrgPerson {
  name: string;
  jobTitle?: string | null;
  department?: string | null;
  mail?: string | null;
}

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';

export default function OrgHierarchy({ managers, me, tone = 'dark', compact = false }: { managers?: OrgManager[]; me: OrgPerson; tone?: 'dark' | 'light'; compact?: boolean }) {
  const dark = tone === 'dark';
  // Highest level first (L2, then L1), then the person themself.
  const chain: { key: string; badge: string; person: OrgPerson; self?: boolean }[] = [
    ...[...(managers ?? [])].sort((a, b) => b.level - a.level).map((m) => ({ key: `L${m.level}`, badge: `L${m.level}`, person: { name: m.displayName || 'Not set in the directory', jobTitle: m.jobTitle, department: m.department, mail: m.mail } })),
    { key: 'me', badge: 'You', person: me, self: true },
  ];
  const step = compact ? 12 : 18;
  const dot = compact ? 28 : 34;
  const ink = dark ? colors.white : colors.ink;
  const soft = dark ? 'rgba(255,255,255,0.72)' : colors.inkSoft;
  const line = dark ? 'rgba(255,255,255,0.28)' : colors.border;

  return (
    <ol aria-label="Reporting line" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      {chain.map((c, i) => {
        const indent = i * step;
        const sub = [c.person.jobTitle, c.person.department].filter(Boolean).join(' · ');
        return (
          <li key={c.key} style={{ position: 'relative', paddingLeft: indent, minWidth: 0 }}>
            {i > 0 && (
              // Elbow from the row above into this one.
              <span aria-hidden style={{ position: 'absolute', left: indent - step + dot / 2, top: -(compact ? 6 : 8), width: step - dot / 2 + 4, height: dot / 2 + (compact ? 6 : 8), borderLeft: `1.5px solid ${line}`, borderBottom: `1.5px solid ${line}`, borderBottomLeftRadius: 8 }} />
            )}
            <div
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: compact ? 8 : 10, minWidth: 0,
                padding: compact ? '5px 8px' : '7px 10px', borderRadius: 12,
                backgroundColor: c.self ? (dark ? 'rgba(255,255,255,0.16)' : `${colors.rust}10`) : dark ? 'rgba(255,255,255,0.07)' : colors.appBg,
                border: `1px solid ${c.self ? (dark ? 'rgba(255,255,255,0.32)' : `${colors.rust}40`) : dark ? 'rgba(255,255,255,0.12)' : colors.border}`,
              }}
            >
              <span aria-hidden style={{ width: dot, height: dot, borderRadius: dot / 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: compact ? 10.5 : 12, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: c.self ? (dark ? colors.plumDeep : colors.white) : ink, backgroundColor: c.self ? (dark ? colors.white : colors.rust) : dark ? 'rgba(255,255,255,0.14)' : `${colors.rust}14` }}>
                {initials(c.person.name)}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: compact ? 12.5 : 13.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={c.person.name}>{c.person.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 9.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, padding: '1px 6px', borderRadius: 6, color: dark ? colors.white : colors.rust, backgroundColor: dark ? 'rgba(255,255,255,0.16)' : `${colors.rust}14` }}>{c.badge}</span>
                </span>
                {sub && <span style={{ display: 'block', marginTop: 1, fontSize: compact ? 11 : 11.5, fontFamily: fonts.sansRegular, color: soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sub}>{sub}</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
