/**
 * Plant-wide costing engine: header materials in batches through the EXISTING costing call (fetchCostLines), with no
 * time limit of any kind. Only the caller's signal (Stop, leaving the page) ends a request.
 *
 * - batches of `batchSize` (<= 50, SAP's limit), `concurrency` at a time (default 1)
 * - an HTTP error or a dropped connection splits the batch in two and retries each half, down to one header; a single
 *   header that still fails is marked failed. Nothing is ever retried because of elapsed time.
 * - lines merge into ONE flat array as batches finish (key Seqnr + Hwerks + Headmat, no duplicates)
 * - headers that come back without lines are "skipped" with SAP's message when there is one
 */
import { SapError, type SapGetOptions } from '../sap/client';
import type { CostLine } from '../sap/fields';
import type { SapMessage } from '../sap/messages';
import type { CostLinesResult } from '../sap/service';
import type { CostQuery } from '../query/schema';

export type CostFn = (q: CostQuery, opts: SapGetOptions) => Promise<CostLinesResult>;

export interface HeaderIssue { matnr: string; kind: 'skipped' | 'failed'; message: string }
export interface PwProgress {
  batch: number;
  batches: number;
  lines: number;
  headersDone: number;
  headersTotal: number;
  /** information only, after the first batch has finished */
  etaMs: number | null;
}

export interface PwState {
  rows: CostLine[];
  keys: Set<string>;
  messages: Map<string, SapMessage>;
  issues: Map<string, HeaderIssue>;
  costed: Set<string>;
  ms: number;
  last: CostLinesResult | null;
  /** Hwerks|Headmat of every header merged so far */
  headers?: Set<string>;
}

export const newPwState = (): PwState => ({ rows: [], keys: new Set(), messages: new Map(), issues: new Map(), costed: new Set(), ms: 0, last: null, headers: new Set() });

export const lineKey = (r: Pick<CostLine, 'Seqnr' | 'Hwerks' | 'Headmat'>) => `${r.Seqnr}|${r.Hwerks}|${r.Headmat}`;

/**
 * Appends lines not seen yet to the one flat array (no copies); returns how many were added. SAP numbers Seqnr per
 * request, so a header costed again in another batch would come back with other Seqnr values: lines of a header that an
 * earlier merge already brought are skipped as well.
 */
export function mergeLines(state: PwState, add: CostLine[]): number {
  let n = 0;
  const before = state.headers ?? (state.headers = new Set(state.rows.map((r) => `${r.Hwerks}|${r.Headmat}`)));
  const now = new Set<string>();
  for (const r of add) {
    const k = lineKey(r);
    const h = `${r.Hwerks}|${r.Headmat}`;
    if (state.keys.has(k) || before.has(h)) continue;
    now.add(h);
    state.keys.add(k);
    state.rows.push(r);
    n++;
  }
  now.forEach((h) => before.add(h));
  return n;
}

export function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const isAbort = (e: unknown, signal?: AbortSignal) => !!signal?.aborted || (e as Error)?.name === 'AbortError' || (e instanceof SapError && e.kind === 'aborted');
/** Split-and-retry only on an HTTP error or a dropped connection - never because of time. */
export const isSplittable = (e: unknown) => e instanceof SapError && (e.kind === 'http' || e.kind === 'network');
const bare = (m: string) => m.replace(/^0+/, '');

export interface RunBatchesInput {
  q: CostQuery;
  headers: string[];
  state: PwState;
  batchSize: number;
  concurrency?: number;
  cost: CostFn;
  signal?: AbortSignal;
  onProgress?: (p: PwProgress) => void;
  onPartial?: () => void;
  now?: () => number;
}

export async function runBatches({ q, headers, state, batchSize, concurrency = 1, cost, signal, onProgress, onPartial, now = Date.now }: RunBatchesInput): Promise<void> {
  const size = Math.min(50, Math.max(1, batchSize));
  const batches = chunk(headers, size);
  const started = now();
  let done = 0;
  let headersDone = 0;
  const report = () => {
    const elapsed = now() - started;
    const left = batches.length - done;
    onProgress?.({ batch: Math.min(done + 1, batches.length), batches: batches.length, lines: state.rows.length, headersDone, headersTotal: headers.length, etaMs: done > 0 && left > 0 ? Math.round((elapsed / done) * left / concurrency) : done > 0 ? 0 : null });
  };

  const costList = async (list: string[]): Promise<void> => {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    let r: CostLinesResult;
    try {
      // The existing costing call, unchanged - only told not to start a timer.
      r = await cost({ ...q, materials: list }, { signal, noTimeout: true });
    } catch (e) {
      if (isAbort(e, signal)) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      if (isSplittable(e) && list.length > 1) {
        const half = Math.ceil(list.length / 2);
        await costList(list.slice(0, half));
        await costList(list.slice(half));
        return;
      }
      for (const m of list) state.issues.set(m, { matnr: m, kind: 'failed', message: (e as Error).message || 'SAP request failed.' });
      return;
    }
    mergeLines(state, r.rows);
    state.ms += r.ms;
    state.last = r;
    r.messages.forEach((m) => state.messages.set(`${m.severity}|${m.code}|${m.message}`, m));
    const withLines = new Set(r.rows.map((l) => l.Headmat));
    for (const m of list) {
      if (withLines.has(m) || withLines.has(bare(m))) { state.costed.add(m); state.issues.delete(m); continue; }
      const said = r.messages.find((x) => x.message.includes(bare(m)));
      state.issues.set(m, { matnr: m, kind: 'skipped', message: said?.message || `No costing lines from SAP for ${bare(m)} in plant ${q.plants.join(', ')} (no usable BOM).` });
    }
    onPartial?.();
  };

  report();
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const list = batches[next++];
      await costList(list);
      done++;
      headersDone += list.length;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), batches.length || 1) }, worker));
}

/** "about 3 min left" (information only). */
export function etaText(ms: number | null): string {
  if (ms === null || ms <= 0) return '';
  const min = Math.round(ms / 60000);
  return min >= 1 ? `about ${min} min left` : 'less than a minute left';
}
