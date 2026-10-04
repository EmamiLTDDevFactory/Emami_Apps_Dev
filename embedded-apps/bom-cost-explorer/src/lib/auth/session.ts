import jwt from 'jsonwebtoken';
import { encode, getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/**
 * Sessions are NextAuth JWTs (next-auth/jwt encode/getToken, NEXTAUTH_SECRET). The UI is a static
 * embedded app served from the hub's origin while this BFF runs on another host, so a NextAuth
 * cookie can't be shared. Instead POST /api/session exchanges the hub's own session token for a
 * NextAuth JWT, and the UI sends it back as `Authorization: Bearer` (getToken reads either).
 */
export const SESSION_MAX_AGE = 12 * 60 * 60; // matches the hub's own 12 h session

export const demoLoginAllowed = () => String(process.env.MOCK_SAP).toLowerCase() === 'true' || process.env.ALLOW_DEMO_LOGIN === 'true';

export interface AppUser {
  email: string;
  name: string;
  role: string;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const secret = () => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new AuthError(503, 'Sign-in is not configured (NEXTAUTH_SECRET).');
  return s;
};

/** Manage Access role on this app (null = not granted, 'skip' = check disabled). */
async function hubRole(email: string): Promise<string | null | 'skip'> {
  const base = process.env.HUB_ACCESS_API_BASE;
  if (!base) return 'skip';
  const appId = process.env.HUB_APP_ID || 'bom-cost-explorer';
  const res = await fetch(`${base.replace(/\/+$/, '')}/access/me?email=${encodeURIComponent(email)}`, { cache: 'no-store' });
  const data = (await res.json().catch(() => null)) as { apps?: { appId: string; role: string }[] } | null;
  if (!res.ok || !data) throw new Error(`Manage Access lookup failed (${res.status})`);
  return data.apps?.find((a) => a.appId === appId)?.role ?? null;
}

/** The hub already authenticated the person: verify its token (same secret as the hub's
 * backend/sessionAuth.js) and check Manage Access. No plant-level restriction: every plant SAP
 * returns in PlantVHSet can be costed. */
export async function userFromHubToken(hubToken: string): Promise<AppUser> {
  const hubSecret = process.env.HUB_AUTH_JWT_SECRET;
  if (!hubSecret) throw new AuthError(503, 'Sign-in is not configured (HUB_AUTH_JWT_SECRET).');
  if (!hubToken) throw new AuthError(401, 'No Emami Apps session found. Sign in to Emami Apps first.');
  let p: { email?: string; name?: string };
  try {
    p = jwt.verify(hubToken, hubSecret) as typeof p;
  } catch (e) {
    throw new AuthError(401, (e as Error).name === 'TokenExpiredError' ? 'Your Emami Apps session has expired. Sign in to Emami Apps again.' : 'Could not verify your Emami Apps session. Please contact IT.');
  }
  const email = String(p.email || '').trim().toLowerCase();
  if (!email) throw new AuthError(401, 'Invalid Emami Apps session.');
  let role: string | null | 'skip';
  try {
    role = await hubRole(email);
  } catch {
    throw new AuthError(502, 'Could not check your access in Manage Access. Please try again.');
  }
  if (role === null) throw new AuthError(403, "You don't have access to BOM Cost Explorer. Ask your Emami Apps admin to grant it in Manage Access.");
  return { email, name: p.name || email, role: role === 'skip' ? 'User' : role };
}

/** Local development only (MOCK_SAP=true or ALLOW_DEMO_LOGIN=true); never on in a deployed env. */
export function demoUser(email: string): AppUser {
  if (!demoLoginAllowed()) throw new AuthError(404, 'Demo sign-in is disabled.');
  const e = String(email || 'demo.user@example.com').trim().toLowerCase();
  return { email: e, name: e, role: 'Admin' };
}

export async function issueSession(u: AppUser): Promise<{ token: string; expiresAt: number }> {
  const token = await encode({ token: { sub: u.email, email: u.email, name: u.name, role: u.role }, secret: secret(), maxAge: SESSION_MAX_AGE });
  return { token, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 };
}

/** Reads the NextAuth JWT from `Authorization: Bearer` (or the NextAuth cookie). */
export async function userFromRequest(req: Request): Promise<AppUser | null> {
  const t = await getToken({ req: req as unknown as NextRequest, secret: secret() });
  if (!t?.email) return null;
  return { email: String(t.email), name: String(t.name ?? t.email), role: (t.role as string) ?? 'User' };
}
