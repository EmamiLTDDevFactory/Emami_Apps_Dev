'use client';

import React from 'react';
import { UserPlus, UserMinus, Power, ShieldCheck, AppWindow, Phone, PenLine } from 'lucide-react';
import type { AccessChangeEntry, AccessChangeType } from '../../types';
import { colors, fonts, fontWeights } from '../../theme/tokens';
import { TONE_COLOR, changeTone, describeChange } from './adminShared';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

const TYPE_ICON: Record<AccessChangeType, React.ElementType> = {
  USER_ADDED: UserPlus,
  USER_REMOVED: UserMinus,
  ACTIVE_STATUS: Power,
  ACCESS_LEVEL: ShieldCheck,
  APP_ROLE: AppWindow,
  MOBILE_SET: Phone,
  NAME_SET: PenLine,
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** Day-grouped audit trail — each entry gets a tone-coloured icon (green = granted/added,
 * red = revoked/removed, indigo = changed). */
export default function ChangeTimeline({ changes, hideTarget, onOpenUser }: { changes: AccessChangeEntry[]; hideTarget?: boolean; onOpenUser?: (email: string) => void }) {
  const router = useRouter();
  const { access } = useAuth();
  const canOpenIncident = access?.accessLevel === 'Super Admin'; // the Requests tab is Super Admin only
  const groups: { day: string; items: AccessChangeEntry[] }[] = [];
  for (const c of changes) {
    const day = dayLabel(c.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(c);
    else groups.push({ day, items: [c] });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map((g) => (
        <div key={g.day}>
          <p style={{ margin: '0 0 8px', fontSize: 10.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.day}</p>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: 8, bottom: 8, width: 2, backgroundColor: colors.border, borderRadius: 1 }} />
            {g.items.map((c) => {
              const tone = TONE_COLOR[changeTone(c)];
              const Icon = TYPE_ICON[c.changeType] ?? AppWindow;
              return (
                <div key={c.id} style={{ position: 'relative', display: 'flex', gap: 12, padding: '6px 0' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, border: `2px solid ${tone}33`, zIndex: 1 }}>
                    <Icon size={13} color={tone} strokeWidth={2.2} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{describeChange(c)}</span>
                      <span style={{ fontSize: 11, fontFamily: fonts.sansRegular, color: colors.inkSoft, flexShrink: 0 }}>
                        {new Date(c.occurredAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {!hideTarget &&
                        (onOpenUser ? (
                          <button type="button" onClick={() => onOpenUser(c.targetEmail)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.rust, fontSize: 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
                            {c.targetEmail}
                          </button>
                        ) : (
                          c.targetEmail
                        ))}
                      {c.changedBy && c.changedBy !== c.targetEmail ? `${hideTarget ? '' : ' · '}by ${c.changedBy}` : ''}
                    </p>
                    {c.incidentRef && (
                      <p style={{ margin: '3px 0 0', fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '16px' }}>
                        Incident{' '}
                        {canOpenIncident && c.incidentId ? (
                          <button type="button" onClick={() => router.push(`/manage-access/?tab=requests&request=${c.incidentId}`)} style={{ background: `${colors.rust}12`, border: 'none', borderRadius: 6, padding: '1px 7px', cursor: 'pointer', color: colors.rust, fontSize: 11, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold }}>{c.incidentRef}</button>
                        ) : (
                          <span style={{ background: `${colors.rust}12`, borderRadius: 6, padding: '1px 7px', color: colors.rust, fontSize: 11, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold }}>{c.incidentRef}</span>
                        )}
                        {c.incidentNote ? ` — ${c.incidentNote}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
