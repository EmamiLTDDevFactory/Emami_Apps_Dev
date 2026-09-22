// Talks to the read-only "Configure SSO" status endpoint on the hub-auth Lambda
// (backend/saml-sso.js) — reports the Microsoft Entra IdP metadata that's bundled as a static
// file (backend/azure-idp-metadata.xml, see idpConfig.js) and read by /hub-auth/saml/login and
// /hub-auth/saml/acs at login time. Same backend + same env var as authApi.ts and accessApi.ts.
import type { SsoConfig } from '../types';

const SSO_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

export async function getSsoConfig(): Promise<{ ok: boolean; config?: SsoConfig; error?: string }> {
  try {
    const res = await fetch(`${SSO_API_URL}/sso/config`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not load SSO configuration.' };
    return { ok: true, config: { sp: data.sp, idp: data.idp } };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
