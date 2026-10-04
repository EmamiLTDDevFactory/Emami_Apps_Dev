import { NextResponse } from 'next/server';
import { fetchConfig } from '@/lib/sap/service';
import { errorResponse, requireUser } from '@/lib/server/guard';
import { namedCache } from '@/lib/server/cache';

export const dynamic = 'force-dynamic';
const cache = namedCache<Record<string, string>>('config', 10 * 60_000, 1);

/** GET /api/config - ConfigItemSet (CfgKey/CfgVal) as { GROUP_CURR, DEFAULT_PRIO, MAX_HEADS } (cached 10 min). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    let cfg = cache.get('cfg');
    if (!cfg) {
      cfg = await fetchConfig({ user: user.email, timeoutMs: 30_000 });
      cache.set('cfg', cfg);
    }
    return NextResponse.json(
      { ...cfg, user: { email: user.email, plants: user.plants, role: user.role }, mock: String(process.env.MOCK_SAP) === 'true' },
      { headers: { 'Cache-Control': 'private, max-age=600' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
