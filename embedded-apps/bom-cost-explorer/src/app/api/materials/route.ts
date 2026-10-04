import { NextResponse } from 'next/server';
import { fetchMaterials } from '@/lib/sap/service';
import { MATERIAL_SEARCH_MIN } from '@/lib/sap/requests';
import { errorResponse, rateLimit, requireUser } from '@/lib/server/guard';
import { namedCache } from '@/lib/server/cache';
import type { MaterialRow } from '@/lib/sap/fields';

export const dynamic = 'force-dynamic';
const cache = namedCache<MaterialRow[]>('materials', 10 * 60_000, 500);

/** GET /api/materials?q=oil -> MaterialVHSet?search=oil (min 2 characters, max 100 rows). */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    rateLimit(user.email, 'lookup');
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
    if (q.length < MATERIAL_SEARCH_MIN) return NextResponse.json({ materials: [] });
    const k = `q:${q.toLowerCase()}`;
    let r = cache.get(k);
    if (!r) cache.set(k, (r = await fetchMaterials(q, { user: user.email, timeoutMs: 30_000, signal: req.signal })));
    return NextResponse.json({ materials: r.slice(0, 100) }, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (e) {
    return errorResponse(e);
  }
}
