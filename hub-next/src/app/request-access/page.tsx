'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, FilePlus2, Search } from 'lucide-react';
import { colors, fonts, fontWeights } from '../../theme/tokens';
import { AdminStyles } from '../../components/admin/adminShared';
import AccessRequestForm from '../../components/access/AccessRequestForm';
import TrackRequest from '../../components/access/TrackRequest';

/** Public (no sign-in) access request page, linked from the login page. For people who cannot sign in to Emami Apps
 * at all: once a Super Admin approves, the sign-in and the requested roles are created automatically. */
function RequestAccess() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<'new' | 'track'>(params.get('track') ? 'track' : 'new');
  const [formKey, setFormKey] = useState(0);
  const prefillEmail = params.get('email') || '';

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'linear-gradient(180deg, #F8F7FB 0%, #EFEDF9 100%)' }}>
      <AdminStyles />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(21,17,41,0.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 48px' }}>
        <div style={{ width: '100%', maxWidth: 620, backgroundColor: colors.white, borderRadius: 28, padding: '28px 28px 30px', boxShadow: '0 30px 70px -12px rgba(79,63,214,0.22), 0 4px 14px rgba(21,17,41,0.05)' }}>
          <button type="button" onClick={() => router.push('/login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.inkSoft }}>
            <ArrowLeft size={15} /> Back to sign in
          </button>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 14px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emami-apps-logo.png" alt="Emami Apps" style={{ width: 150, height: 'auto' }} />
          </div>
          <p style={{ margin: 0, textAlign: 'center', fontSize: 22, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>Request access</p>
          <p style={{ margin: '6px 0 18px', textAlign: 'center', fontSize: 13.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, lineHeight: '20px' }}>
            Can’t sign in yet? Tell us which applications and roles you need. A Super Admin reviews it and your access is switched on automatically once approved.
          </p>
          <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${colors.border}` }}>
            {([['new', 'New request', FilePlus2], ['track', 'Track a request', Search]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 8px', border: 'none', background: 'none', cursor: 'pointer', marginBottom: -1, borderBottom: `2px solid ${tab === id ? colors.rust : 'transparent'}`, color: tab === id ? colors.rust : colors.inkSoft, fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
          {tab === 'new' ? (
            <AccessRequestForm key={formKey} mode="public" initialEmail={prefillEmail} onReset={() => setFormKey((k) => k + 1)} />
          ) : (
            <TrackRequest initialRef={params.get('ref') || ''} initialEmail={prefillEmail} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function RequestAccessPage() {
  return (
    <Suspense fallback={null}>
      <RequestAccess />
    </Suspense>
  );
}
