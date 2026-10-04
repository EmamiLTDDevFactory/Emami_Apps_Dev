import { NextResponse } from 'next/server';
import { costRequestSchema, pageSchema, plantsOf } from '@/lib/query/schema';
import { fetchCostLines, fetchPagedSet } from '@/lib/sap/service';
import { forbiddenPlants, hasAll, plantAllowed } from '@/lib/auth/plants';
import { errorResponse, HttpError, rateLimit, requireUser } from '@/lib/server/guard';
import { hashKey, namedCache } from '@/lib/server/cache';
import { queryTable } from '@/lib/server/table';
import { VIEW_COLUMNS, PLANT_FIELD } from '@/lib/views';
import type { SapMessage } from '@/lib/sap/messages';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Cached = { rows: Record<string, unknown>[]; messages: SapMessage[]; ms: number; truncated: boolean; at: number };
const resultCache = namedCache<Cached>('paged-results', 10 * 60_000, 40);

/**
 * POST /api/cost  { query, page? }
 *  B / C -> every CostLine (with RateOptions) for the tree / pivot: { rows, messages, ms }
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
    const bad = forbiddenPlants(user.plants, plantsOf(query));
    if (bad.length) throw new HttpError(403, `You are not authorised for plant${bad.length > 1 ? 's' : ''} ${bad.join(', ')}.`);

    const keepPlant = (p: unknown) => !p || plantAllowed(user.plants, String(p));
    const dropped = (n: number): SapMessage[] => (n ? [{ code: 'BFF/001', severity: 'warning', message: `${n} row(s) for plants outside your authorisation were removed.` }] : []);

    if (query.mode === 'B' || query.mode === 'C') {
      rateLimit(user.email, 'cost');
      const r = await fetchCostLines(query, { signal: req.signal, user: user.email });
      let removed = 0;
      const rows = hasAll(user.plants)
        ? r.rows
        : r.rows
            .filter((row) => {
              const ok = keepPlant(row.Werks) && keepPlant(row.Hwerks);
              if (!ok) removed++;
              return ok;
            })
            .map((row) => ({ ...row, RateOptions: row.RateOptions.filter((o) => keepPlant(o.Plant)) }));
      return NextResponse.json({ rows, messages: [...r.messages, ...dropped(removed)], ms: r.ms, total: rows.length, serverMs: Date.now() - started });
    }

    const page = pageSchema.parse(parsed.data.page ?? {});
    const key = hashKey(user.email, query);
    let entry = resultCache.get(key);
    const cached = !!entry;
    if (!entry) {
      rateLimit(user.email, 'cost');
      const r = await fetchPagedSet<Record<string, unknown>>(query, { signal: req.signal, user: user.email });
      const plantField = PLANT_FIELD[query.mode];
      const rows = hasAll(user.plants) ? r.rows : r.rows.filter((row) => keepPlant(row[plantField]));
      const messages = [...r.messages, ...dropped(r.rows.length - rows.length)];
      if (r.truncated) messages.push({ code: 'BFF/002', severity: 'warning', message: 'Result truncated at 200,000 rows - narrow the selection.' });
      entry = { rows, messages, ms: r.ms, truncated: r.truncated, at: Date.now() };
      resultCache.set(key, entry);
    } else {
      rateLimit(user.email, 'lookup');
    }
    const t = queryTable(entry.rows, VIEW_COLUMNS[query.mode], page);
    return NextResponse.json({ ...t, messages: entry.messages, ms: entry.ms, cached, fetchedAt: entry.at, serverMs: Date.now() - started });
  } catch (e) {
    return errorResponse(e);
  }
}
