// Talks to the "Configure SSO" admin endpoints on the hub-auth Lambda (backend/saml-sso.js) —
// upload/inspect/enable/clear the Microsoft Entra IdP metadata that backend/saml-sso.js's
// /hub-auth/saml/login and /hub-auth/saml/acs routes read at login time. Same backend + same env
// var as authApi.ts and accessApi.ts.
import type { SsoConfig, SsoIdentityProviderInfo } from '../types';

const SSO_API_URL = process.env.EXPO_PUBLIC_AUTH_API_URL || 'http://localhost:4000/api';

type ApiResult = { ok: boolean; error?: string };

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

/** Uploads the raw text content of an IdP Federation Metadata XML file — parsed server-side. */
export async function uploadIdpMetadata(xml: string, uploadedBy?: string): Promise<{ ok: boolean; idp?: SsoIdentityProviderInfo; error?: string }> {
  try {
    const res = await fetch(`${SSO_API_URL}/sso/config/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml, uploadedBy }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not save this configuration.' };
    return { ok: true, idp: data.idp };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function setSsoEnabled(isEnabled: boolean): Promise<ApiResult> {
  try {
    const res = await fetch(`${SSO_API_URL}/sso/config/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not update this setting.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}

export async function clearSsoConfig(): Promise<ApiResult> {
  try {
    const res = await fetch(`${SSO_API_URL}/sso/config`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) return { ok: false, error: data?.error || 'Could not clear this configuration.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Please try again.' };
  }
}
