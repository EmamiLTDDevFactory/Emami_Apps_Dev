import { NextResponse } from 'next/server';
import { AuthError, userFromRequest } from '../auth/session';
import { SapError } from '../sap/client';

export interface ApiUser {
  email: string;
  plants: string[];
  role: string;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

/** Every BFF route needs a valid NextAuth JWT session (Bearer token from POST /api/session). */
export async function requireUser(req: Request): Promise<ApiUser> {
  const u = await userFromRequest(req).catch((e) => {
    if (e instanceof AuthError) throw new HttpError(e.status, e.message);
    return null;
  });
  if (!u) throw new HttpError(401, 'Not signed in or session expired.');
  return { email: u.email, plants: u.plants, role: u.role };
}

// ---- per-user rate limit (sliding window, in memory: one PM2 fork process per environment) ----
const hits = new Map<string, number[]>();
export function rateLimit(user: string, bucket: 'cost' | 'lookup') {
  const limit = bucket === 'cost' ? Number(process.env.RATE_LIMIT_COST_PER_MIN) || 12 : Number(process.env.RATE_LIMIT_LOOKUP_PER_MIN) || 240;
  const key = `${bucket}|${user}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= limit) {
    const retry = Math.ceil((60_000 - (now - list[0])) / 1000);
    throw new HttpError(429, `Too many requests - try again in ${retry} s.`, { retryAfter: retry });
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (e.extra.retryAfter) headers['Retry-After'] = String(e.extra.retryAfter);
    return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status, headers });
  }
  if (e instanceof SapError) {
    return NextResponse.json({ error: e.message, kind: e.kind, details: e.details }, { status: e.status });
  }
  console.error('[api] unexpected', e);
  return NextResponse.json({ error: 'Unexpected server error.' }, { status: 500 });
}
