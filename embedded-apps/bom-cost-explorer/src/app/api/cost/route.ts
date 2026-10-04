import { NextResponse } from 'next/server';
import { costRequestSchema, pageSchema } from '@/lib/query/schema';
import { fetchCostLines, fetchPagedSet } from '@/lib/sap/service';
import { errorResponse, HttpError, rateLimit, requireUser } from '@/lib/server/guard';
import { FilterError } from '@/lib/sap/filter';
import { hashKey, namedCache } from '@/lib/server/cache';
import { queryTable } from '@/lib/server/table';
import { VIEW_COLUMNS } from '@/lib/views';
import type { SapMessage } from '@/lib/sap/messages';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Cached = { rows: Record<string, unknown>[]; messages: SapMessage[]; ms: number; truncated: boolean; at: number };
const resultCache = namedCache<Cached>('paged-results', 10 * 60_000, 40);

/**
 * POST /api/cost  { query, page? }
 *  B / C -> every CostLineSet row for the tree / pivot (RateOptions expanded for B only)
 *  R / F / M -> one page of the full result (fetched from SAP once, cached 10 min per user+query):
 *           { rows, total, totals, messages, ms, cached }
 */
export async function POST(req: Request) {
  const started = Date.now();
  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => {
      throw new HttpError(400, 'Request body must be JSON.');
    });
    const parsed = costRequestSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
      throw new HttpError(400, issues[0]?.message ?? 'Invalid query.', { issues });
    }
    const { query } = parsed.data;

    if (query.mode === 'B' || query.mode === 'C') {
      rateLimit(user.email, 'cost');
      const r = await fetchCostLines(query, { signal: req.signal, user: user.email });
      return NextResponse.json({ rows: r.rows, messages: r.messages, ms: r.ms, total: r.rows.length, serverMs: Date.now() - started });
    }

    const page = pageSchema.parse(parsed.data.page ?? {});
    const key = hashKey(user.email, query);
    let entry = resultCache.get(key);
    const cached = !!entry;
    if (!entry) {
      rateLimit(user.email, 'cost');
      const r = await fetchPagedSet<Record<string, unknown>>(query, { signal: req.signal, user: user.email });
      const rows = r.rows;
      const messages = [...r.messages];
      if (r.truncated) messages.push({ code: 'BFF/002', severity: 'warning', message: 'Result truncated at 200,000 rows - narrow the selection.' });
      entry = { rows, messages, ms: r.ms, truncated: r.truncated, at: Date.now() };
      resultCache.set(key, entry);
    } else {
      rateLimit(user.email, 'lookup');
    }
    const t = queryTable(entry.rows, VIEW_COLUMNS[query.mode], page);
    return NextResponse.json({ ...t, messages: entry.messages, ms: entry.ms, cached, fetchedAt: entry.at, serverMs: Date.now() - started });
  } catch (e) {
    if (e instanceof FilterError) return errorResponse(new HttpError(400, e.message));
    return errorResponse(e);
  }
}
