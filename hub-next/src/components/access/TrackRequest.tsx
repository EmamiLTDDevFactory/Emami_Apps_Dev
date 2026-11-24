'use client';

import React, { useState } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../theme/tokens';
import { Spinner, errorTextStyle, inputStyle, inputWrapStyle, labelStyle, primaryBtnStyle } from '../admin/adminShared';
import { lookupRequestStatus, type AccessRequestSummary } from '../../lib/accessRequestsApi';
import { ItemOutcomeList, StatusPill, formatDateTime } from './requestShared';

/** Login-page "track my request": the incident number plus the email used is the only key — no sign-in needed. */
export default function TrackRequest({ initialRef = '', initialEmail = '' }: { initialRef?: string; initialEmail?: string }) {
  const [ref, setRef] = useState(initialRef);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<AccessRequestSummary | null>(null);

  const look = async () => {
    setError('');
    setRequest(null);
    setBusy(true);
    const res = await lookupRequestStatus(ref.trim().toUpperCase(), email.trim().toLowerCase());
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setRequest(res.request);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Incident number</div>
        <div className="ac-input" style={inputWrapStyle}><input style={inputStyle} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INC-2026-00012" /></div>
      </div>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Email used in the request</div>
        <div className="ac-input" style={inputWrapStyle}><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" type="email" autoCapitalize="none" onKeyDown={(e) => { if (e.key === 'Enter') look(); }} /></div>
      </div>
      {error && <p style={{ ...errorTextStyle, margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={14} /> {error}</p>}
      <button type="button" className="ac-btn" onClick={look} disabled={busy || !ref.trim() || !email.trim()} style={{ ...primaryBtnStyle, height: 44 }}>
        {busy ? <Spinner light /> : <Search size={15} />} Check status
      </button>
      {request && (
        <div className="ac-fade" style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, padding: 14, backgroundColor: colors.cream }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ flex: 1, fontSize: 15, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>{request.ref}</span>
            <StatusPill status={request.status} />
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: colors.inkSoft, fontFamily: fonts.sansRegular }}>
            Raised {formatDateTime(request.createdAt)}{request.decidedAt ? ` · decided ${formatDateTime(request.decidedAt)}` : ' · waiting for a Super Admin'}
          </p>
          {request.decisionNote && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: colors.ink, fontFamily: fonts.sansMedium, lineHeight: '18px' }}>Reviewer note: {request.decisionNote}</p>}
          <ItemOutcomeList items={request.items} />
          {(request.status === 'Approved' || request.status === 'Partially Approved') && (
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: colors.green, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>Your access is active — go back and sign in.</p>
          )}
        </div>
      )}
    </div>
  );
}
