'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Info, Copy, Check, KeyRound, CalendarClock } from 'lucide-react';
import { colors, fonts, fontWeights, radii } from '../../../../theme/tokens';
import { getSsoConfig } from '../../../../lib/ssoConfigApi';
import type { SsoConfig } from '../../../../types';

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Highlights an expiry date once it's close — an expired/soon-to-expire signing certificate is
 * the single most common way SAML SSO silently breaks. */
function expiryTone(iso?: string | null): 'ok' | 'soon' | 'expired' | null {
  if (!iso) return null;
  const daysLeft = (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft < 30) return 'soon';
  return 'ok';
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser — the value is still visible to select by hand.
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${colors.border}`, borderRadius: radii.lg, backgroundColor: colors.appBg, padding: '10px 14px', marginTop: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.inkSoft, marginTop: 0, marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 12.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: colors.ink, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      </div>
      <button type="button" onClick={copy} style={{ width: 30, height: 30, flexShrink: 0, borderRadius: radii.md, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, border: `1px solid ${colors.border}`, cursor: 'pointer' }} aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} color={colors.green} /> : <Copy size={14} color={colors.inkSoft} />}
      </button>
    </div>
  );
}

export default function SsoConfigPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const result = await getSsoConfig();
      setLoading(false);
      if (result.ok && result.config) setConfig(result.config);
      else setError(result.error || 'Could not load SSO configuration.');
    })();
  }, []);

  const idp = config?.idp;
  const tone = expiryTone(idp?.certificateExpiresAt);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 20, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <button type="button" onClick={() => router.push('/manage-access/?tab=settings')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${colors.border}`, borderRadius: radii.pill, padding: '7px 12px', backgroundColor: colors.white, cursor: 'pointer' }}>
          <ArrowLeft size={13} color={colors.ink} />
          <span style={{ fontSize: 12, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>Back to Admin Center</span>
        </button>
        <p style={{ fontSize: 18, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>Configure SSO</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${colors.rust}33`, backgroundColor: `${colors.rust}0d`, borderRadius: radii.lg, padding: 14, marginBottom: 16 }}>
        <Info size={15} color={colors.rust} style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ flex: 1, fontSize: 12, fontFamily: fonts.sansRegular, color: colors.ink, lineHeight: '17px', margin: 0 }}>
          Microsoft is the Identity Provider (IdP); EmamiApps is the Service Provider (SP). Give Azure the SP details below when creating the Enterprise Application. The IdP metadata below is bundled with the backend at deploy time (not uploaded through the app) — to rotate the certificate or change the SSO URL, replace backend/azure-idp-metadata.xml and redeploy.
        </p>
      </div>

      {loading ? (
        <div className="sso-spinner" style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${colors.border}`, borderTopColor: colors.rust, marginTop: 18 }} />
      ) : (
        <>
          {!!error && <p style={{ fontSize: 11.5, fontFamily: fonts.sansMedium, fontWeight: fontWeights.sansMedium, color: '#C0392B', marginBottom: 12 }}>{error}</p>}

          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <KeyRound size={15} color={colors.rust} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>1. Service Provider (give these to Azure)</p>
                <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1, marginBottom: 0 }}>
                  In Azure: Enterprise Applications → New application → non-gallery → Single sign-on → SAML
                </p>
              </div>
            </div>

            <CopyField label="Identifier (Entity ID)" value={config?.sp.entityId || ''} />
            <CopyField label="Reply URL (Assertion Consumer Service URL)" value={config?.sp.acsUrl || ''} />
          </div>

          <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.xl, backgroundColor: colors.white, padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 30, height: 30, borderRadius: radii.md, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={15} color={colors.rust} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14.5, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink, margin: 0 }}>2. Identity Provider (bundled from Azure)</p>
                <p style={{ fontSize: 12, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 1, marginBottom: 0 }}>backend/azure-idp-metadata.xml, deployed with the backend</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0 }}>Sign in with Microsoft</p>
                <p style={{ fontSize: 11.5, fontFamily: fonts.sansRegular, color: colors.inkSoft, marginTop: 2, marginBottom: 0 }}>
                  {!idp?.configured
                    ? 'Not configured — no metadata file is bundled.'
                    : idp.isEnabled
                      ? 'Live — the Login page shows the Microsoft button.'
                      : 'Off — email sign-in only. Set HUB_AUTH_SAML_ENABLED=true to turn on.'}
                </p>
              </div>
            </div>

            {idp?.configured && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ minWidth: 200, flexGrow: 1 }}>
                  <p style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.inkSoft, marginTop: 0, marginBottom: 4 }}>IdP Entity ID</p>
                  <p style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0, overflowWrap: 'break-word' }}>{idp.entityId}</p>
                </div>
                <div style={{ minWidth: 200, flexGrow: 1 }}>
                  <p style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.inkSoft, marginTop: 0, marginBottom: 4 }}>SSO URL</p>
                  <p style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink, margin: 0, overflowWrap: 'break-word' }}>{idp.ssoUrl}</p>
                </div>
                <div style={{ minWidth: 200, flexGrow: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <CalendarClock size={11} color={colors.inkSoft} />
                    <p style={{ fontSize: 10, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.inkSoft, margin: 0 }}>Certificate expires</p>
                  </div>
                  <p style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, margin: 0, color: tone === 'expired' ? '#C0392B' : tone === 'soon' ? '#B45309' : colors.ink }}>
                    {formatDate(idp.certificateExpiresAt)}
                    {tone === 'expired' ? ' · Expired' : tone === 'soon' ? ' · Expiring soon' : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      <style jsx>{`
        .sso-spinner {
          animation: sso-spin 0.8s linear infinite;
        }
        @keyframes sso-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
