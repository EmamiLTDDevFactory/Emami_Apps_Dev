'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilePlus2, Inbox, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { colors, fonts, fontWeights, radii } from '../../../theme/tokens';
import { AdminStyles, EmptyState, Skeleton, cardStyle, sectionSubStyle, sectionTitleStyle } from '../../../components/admin/adminShared';
import AccessRequestForm from '../../../components/access/AccessRequestForm';
import { ItemOutcomeList, StatusPill, formatDateTime } from '../../../components/access/requestShared';
import { getMyRequests, type AccessRequestSummary } from '../../../lib/accessRequestsApi';

/** Access Requests for a signed-in person: raise a ticket for more app roles, and follow every request they have raised. */
function AccessRequests() {
  const router = useRouter();
  const params = useSearchParams();
  const { userEmail, profile } = useAuth();
  const tab = params.get('tab') === 'new' ? 'new' : 'mine';
  const [requests, setRequests] = useState<AccessRequestSummary[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(() => {
    getMyRequests().then((r) => {
      if (r.ok) setRequests(r.requests);
      else { setError(r.error); setRequests([]); }
    });
  }, []);
  useEffect(load, [load]);

  const [firstName, ...rest] = (profile?.name || '').trim().split(/\s+/);
  const go = (t: 'mine' | 'new') => router.replace(`/access-requests/?tab=${t}`);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px 56px' }}>
      <AdminStyles />
      <h1 style={{ margin: 0, fontSize: 24, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>Access requests</h1>
      <p style={{ ...sectionSubStyle, fontSize: 13, marginTop: 4 }}>Need an application unlocked, or a different role? Raise a request — a Super Admin approves it and your access is granted automatically.</p>

      <div style={{ display: 'flex', gap: 4, margin: '18px 0', borderBottom: `1px solid ${colors.border}` }}>
        {([['mine', 'My requests', Inbox], ['new', 'New request', FilePlus2]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', marginBottom: -1, borderBottom: `2px solid ${tab === id ? colors.rust : 'transparent'}`, color: tab === id ? colors.rust : colors.inkSoft, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'new' ? (
        <div style={{ ...cardStyle, padding: 22 }}>
          <AccessRequestForm
            key={formKey}
            mode="member"
            initialFirstName={firstName || ''}
            initialLastName={rest.join(' ')}
            initialEmail={userEmail || ''}
            onSubmitted={load}
            onReset={() => { setFormKey((k) => k + 1); go('mine'); }}
          />
        </div>
      ) : requests === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={64} radius={14} />)}</div>
      ) : requests.length === 0 ? (
        <div style={cardStyle}>
          <EmptyState icon={Inbox} title={error || 'No requests yet'} hint={error ? undefined : 'Raise one from “New request” when you need access to an application.'} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => {
            const open = openId === r.id;
            const Chev = open ? ChevronUp : ChevronDown;
            return (
              <div key={r.id} style={{ ...cardStyle, overflow: 'hidden' }}>
                <button type="button" onClick={() => setOpenId(open ? null : r.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...sectionTitleStyle, display: 'block' }}>{r.ref}</span>
                    <span style={{ ...sectionSubStyle, display: 'block' }}>
                      {r.items.length} role{r.items.length === 1 ? '' : 's'} · raised {formatDateTime(r.createdAt)}
                    </span>
                  </span>
                  <StatusPill status={r.status} />
                  <Chev size={17} color={colors.inkSoft} />
                </button>
                {open && (
                  <div className="ac-fade" style={{ padding: '0 16px 16px', borderTop: `1px solid ${colors.border}`, backgroundColor: colors.cream }}>
                    <p style={{ margin: '12px 0 10px', fontSize: 12.5, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '18px' }}><b>Your reason:</b> {r.justification}</p>
                    {r.decisionNote && <p style={{ margin: '0 0 10px', fontSize: 12.5, fontFamily: fonts.sansMedium, color: colors.ink, lineHeight: '18px', padding: '8px 10px', borderRadius: radii.md, backgroundColor: colors.white, border: `1px solid ${colors.border}` }}><FileText size={12} style={{ verticalAlign: -1 }} /> Reviewer note: {r.decisionNote}</p>}
                    <ItemOutcomeList items={r.items} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AccessRequestsPage() {
  return (
    <Suspense fallback={null}>
      <AccessRequests />
    </Suspense>
  );
}
