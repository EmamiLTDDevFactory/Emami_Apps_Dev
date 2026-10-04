import { NextResponse, type NextRequest } from 'next/server';

/**
 * CORS for the BFF (server build only - .ts is excluded from the static export). The UI is
 * served from the hub's origin (dev/www.emamiapps.in) and calls this server on another host.
 * Sessions travel as a Bearer token, never a cookie, so credentials mode is not needed.
 */
const DEFAULT_ORIGINS = 'https://dev.emamiapps.in,https://www.emamiapps.in,https://emamiapps.in,http://localhost:3000,http://localhost:3210';
const allowed = () => (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const ok = origin && allowed().includes(origin);
  const headers: Record<string, string> = ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : {};
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: ok ? 204 : 403, headers });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: ['/api/:path*'] };
