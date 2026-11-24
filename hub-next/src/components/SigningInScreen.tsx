'use client';

import React, { useEffect, useState } from 'react';
import { colors, fonts, fontWeights } from '../theme/tokens';

const STEPS = ['Verifying your Microsoft sign-in', 'Checking your access', 'Loading your apps', 'Almost there'];

/**
 * Full-screen "signing you in" loader. Shown by the login page and, because Microsoft SSO / magic
 * links redirect back to `/?ssoToken=` (the shell, not /login), by the shell layout too while the
 * token is verified and the persisted session is restored.
 */
export default function SigningInScreen() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((i) => Math.min(i + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'linear-gradient(180deg, #F8F7FB 0%, #EFEDF9 100%)' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(21,17,41,0.07) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
      <div style={{ position: 'absolute', width: 620, height: 620, borderRadius: 999, left: '12%', top: '30%', background: 'radial-gradient(circle, rgba(139,111,245,0.32) 0%, rgba(139,111,245,0) 68%)' }} />
      <div style={{ position: 'absolute', width: 560, height: 560, borderRadius: 999, right: '4%', bottom: '4%', background: 'radial-gradient(circle, rgba(245,201,224,0.35) 0%, rgba(245,201,224,0) 68%)' }} />

      <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 430, backgroundColor: colors.white, borderRadius: 32, padding: '44px 40px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 30px 70px -12px rgba(79,63,214,0.22), 0 4px 14px rgba(21,17,41,0.05)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/emami-apps-logo.png" alt="Emami Apps" className="pulse" style={{ width: 200, height: 'auto', marginBottom: 20 }} />
          <p style={{ fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 28, color: colors.ink, margin: 0 }}>Signing you in…</p>
          <p style={{ fontFamily: fonts.sansRegular, fontSize: 15, color: colors.inkSoft, marginTop: 8, marginBottom: 30, textAlign: 'center', minHeight: 22 }}>{STEPS[step]}…</p>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 }}>
            <div className="orbit" />
            <div style={{ display: 'flex', gap: 8 }}>
              {STEPS.map((_, i) => (
                <span key={i} style={{ width: i === step ? 22 : 7, height: 7, borderRadius: 4, background: i <= step ? 'linear-gradient(90deg,#6D5BF5,#E879B9)' : '#E4E0F5', transition: 'all .4s ease' }} />
              ))}
            </div>
            <div className="bar"><div className="barFill" /></div>
          </div>
        </div>
        <div style={{ marginTop: 36, textAlign: 'center', fontFamily: fonts.sansRegular, color: colors.inkSoft }}>
          <p style={{ margin: 0, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, fontSize: 14, letterSpacing: 0.3 }}>Emami Apps</p>
          <p style={{ margin: '6px 0 0', fontSize: 13 }}>Powered by AI · © 2026 Emami Group</p>
        </div>
      </div>
      <style jsx>{`
        .orbit { width: 54px; height: 54px; border-radius: 50%;
          background: conic-gradient(from 0deg, rgba(109,91,245,0) 0%, #6d5bf5 55%, #e879b9 100%);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
          animation: spin 1s linear infinite; filter: drop-shadow(0 4px 10px rgba(109,91,245,0.35)); }
        .bar { width: 100%; height: 4px; border-radius: 4px; background: #ece9f8; overflow: hidden; }
        .barFill { width: 40%; height: 100%; border-radius: 4px; background: linear-gradient(90deg,#6d5bf5,#e879b9); animation: slide 1.3s ease-in-out infinite; }
        .pulse { animation: pulse 1.8s ease-in-out infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(260%); } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      `}</style>
    </div>
  );
}
