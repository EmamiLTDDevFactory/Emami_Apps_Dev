import { NextResponse } from 'next/server';
import { fetchPlants } from '@/lib/sap/service';
import { errorResponse, rateLimit, requireUser } from '@/lib/server/guard';
import { namedCache } from '@/lib/server/cache';
import type { PlantRow } from '@/lib/sap/fields';

export const dynamic = 'force-dynamic';
const cache = namedCache<PlantRow[]>('plants', 10 * 60_000, 1);

/** GET /api/plants - every plant in PlantVHSet (server cache 10 min; never cached by the browser,
 * so a BFF switch (e.g. mock -> real SAP) shows up on the next page load). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    rateLimit(user.email, 'lookup');
    let all = cache.get('all');
    if (!all) {
      all = await fetchPlants({ user: user.email, timeoutMs: 30_000 });
      if (all.length) cache.set('all', all);
    }
    return NextResponse.json({ plants: all }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
