import { NextResponse } from 'next/server';
import { AuthError, demoLoginAllowed, demoUser, issueSession, userFromHubToken, userFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** GET  -> { demo, user|null }  (is local demo sign-in on; who is the bearer, if any)
 *  POST { hubToken } | { demo: { email } } -> { token, expiresAt, user } */
export async function GET(req: Request) {
  const user = await userFromRequest(req).catch(() => null);
  return NextResponse.json({ demo: demoLoginAllowed(), user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { hubToken?: string; demo?: { email?: string } };
    const user = body.demo ? demoUser(body.demo.email ?? '') : await userFromHubToken(String(body.hubToken ?? ''));
    const s = await issueSession(user);
    console.info(`[auth] session issued for ${user.email}`);
    return NextResponse.json({ ...s, user });
  } catch (e) {
    const status = e instanceof AuthError ? e.status : 500;
    if (status === 500) console.error('[auth]', e);
    return NextResponse.json({ error: e instanceof AuthError ? e.message : 'Sign-in failed.' }, { status });
  }
}
