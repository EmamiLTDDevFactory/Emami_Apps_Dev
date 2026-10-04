import { NextResponse } from 'next/server';
import { fetchMaterials, fetchMaterialsByNumber } from '@/lib/sap/service';
import { errorResponse, rateLimit, requireUser } from '@/lib/server/guard';
import { namedCache } from '@/lib/server/cache';
import type { MaterialRow } from '@/lib/sap/fields';

export const dynamic = 'force-dynamic';
const cache = namedCache<MaterialRow[]>('materials', 10 * 60_000, 500);

/** GET /api/materials?q=oil  (type-ahead, max 100)  |  ?numbers=FG1001,FG1002 (resolve pasted) */
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    rateLimit(user.email, 'lookup');
    const url = new URL(req.url);
    const numbers = (url.searchParams.get('numbers') || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (numbers.length) {
      const k = `n:${numbers.join(',').toUpperCase()}`;
      let r = cache.get(k);
      if (!r) cache.set(k, (r = await fetchMaterialsByNumber(numbers, { user: user.email, timeoutMs: 30_000, signal: req.signal })));
      return NextResponse.json({ materials: r });
    }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 60);
    if (q.length < 2) return NextResponse.json({ materials: [] });
    const k = `q:${q.toLowerCase()}`;
    let r = cache.get(k);
    if (!r) cache.set(k, (r = await fetchMaterials(q, { user: user.email, timeoutMs: 30_000, signal: req.signal })));
    return NextResponse.json({ materials: r.slice(0, 100) }, { headers: { 'Cache-Control': 'private, max-age=600' } });
  } catch (e) {
    return errorResponse(e);
  }
}
