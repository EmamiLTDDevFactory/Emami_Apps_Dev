import { NextResponse } from 'next/server';
import { fetchPlants } from '@/lib/sap/service';
import { plantAllowed } from '@/lib/auth/plants';
import { errorResponse, rateLimit, requireUser } from '@/lib/server/guard';
import { namedCache } from '@/lib/server/cache';
import type { PlantRow } from '@/lib/sap/fields';

export const dynamic = 'force-dynamic';
const cache = namedCache<PlantRow[]>('plants', 10 * 60_000, 1);

/** GET /api/plants - only the plants the signed-in user may cost. */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    rateLimit(user.email, 'lookup');
    let all = cache.get('all');
    if (!all) {
      all = await fetchPlants({ user: user.email, timeoutMs: 30_000 });
      cache.set('all', all);
    }
    return NextResponse.json({ plants: all.filter((p) => plantAllowed(user.plants, p.Werks)) }, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (e) {
    return errorResponse(e);
  }
}
