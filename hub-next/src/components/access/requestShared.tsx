'use client';

import React from 'react';
import { CheckCircle2, Clock, XCircle, CircleDashed, MinusCircle } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../theme/tokens';
import { appLabel, formatDateTime } from '../admin/adminShared';
import type { ItemDecision, RequestStatus, RequestItem } from '../../lib/accessRequestsApi';

const TONES: Record<RequestStatus | ItemDecision, { color: string; icon: React.ElementType }> = {
  Pending: { color: colors.uat, icon: Clock },
  Approved: { color: colors.green, icon: CheckCircle2 },
  'Partially Approved': { color: '#0E7490', icon: MinusCircle },
  Rejected: { color: '#DC2626', icon: XCircle },
};

export function StatusPill({ status, small }: { status: RequestStatus | ItemDecision; small?: boolean }) {
  const t = TONES[status] ?? { color: colors.inkSoft, icon: CircleDashed };
  const Icon = t.icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: small ? '2px 8px' : '4px 11px', borderRadius: radii.pill, backgroundColor: `${t.color}14`, border: `1px solid ${t.color}33`, color: t.color, fontSize: small ? 10.5 : 11.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, whiteSpace: 'nowrap' }}>
      <Icon size={small ? 11 : 13} /> {status}
    </span>
  );
}

/** One requested (app, role) line with its outcome and the reviewer's reason, as the requester sees it. */
export function ItemOutcomeList({ items }: { items: Pick<RequestItem, 'appId' | 'role' | 'depot' | 'decision' | 'decisionNote'>[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((i) => (
        <div key={`${i.appId}/${i.role}`} style={{ border: `1px solid ${colors.border}`, borderRadius: radii.lg, padding: '10px 12px', backgroundColor: colors.white }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 140, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>
              {appLabel(i.appId)} <span style={{ color: colors.inkSoft, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium }}>· {i.role}{i.depot ? ` · ${i.depot}` : ''}</span>
            </span>
            <StatusPill status={i.decision} small />
          </div>
          {i.decisionNote && <p style={{ margin: '6px 0 0', fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '17px' }}>Reviewer: {i.decisionNote}</p>}
        </div>
      ))}
    </div>
  );
}

export const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: 'Request raised',
  FILE_ADDED: 'Document attached',
  FILE_DOWNLOADED: 'Document opened',
  VIEWED: 'Opened by reviewer',
  USER_CREATED: 'Sign-in created',
  GRANT_APPLIED: 'Access granted',
  ITEM_APPROVED: 'Line approved',
  ITEM_REJECTED: 'Line rejected',
  REQUEST_DECIDED: 'Request decided',
  SENT_BACK: 'Sent back to requester',
  MAIL_SENT: 'Mail sent',
  MAIL_FAILED: 'Mail failed',
  MAIL_SKIPPED: 'Mail not sent',
};
export const EVENT_COLORS: Record<string, string> = {
  SUBMITTED: colors.rust, FILE_ADDED: colors.inkSoft, FILE_DOWNLOADED: colors.inkSoft, VIEWED: colors.inkSoft,
  USER_CREATED: colors.green, GRANT_APPLIED: colors.green, ITEM_APPROVED: colors.green, ITEM_REJECTED: '#DC2626',
  REQUEST_DECIDED: colors.rust, SENT_BACK: '#DC2626',
  MAIL_SENT: colors.green, MAIL_FAILED: '#DC2626', MAIL_SKIPPED: '#D97706',
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export { formatDateTime };
