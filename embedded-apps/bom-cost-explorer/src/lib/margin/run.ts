'use client';
/**
 * Runs one Margin read set. LIVE (Source 'L'): finished goods in batches of 25, one call after the other (each is SAP's live costing, 10 to 15 s),
 * with progress and Stop. SNAPSHOT (Source 'S'): one unit that pages through $top / $skip. No call has a time limit; results stay in the shared
 * cache (no expiry) for the same inputs; Refresh refetches; Stop / leaving the page aborts. Nothing starts until run() is called.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { abortAll, ensure, invalidate, peek, stop as stopCtx, subscribe, type WacEntry } from '../wac/cache';
import { buildMarginFilter, chunkMaterials, MARGIN_LIVE_MAX, type MarginQuery } from './filter';
import { fetchMargin, fetchMarginAll, rowMessages } from './service';
import type { MarginReadKey } from './fields';
import { MARGIN_SET } from './fields';
import type { MarginRowsBySet } from './types';
import type { SapMessage } from '../sap/messages';

export interface Unit { key: string; q: MarginQuery; label: string }
/** The calls of a run: live = one per 25 finished goods; snapshot (or no materials) = one. */
export function unitsOf(set: MarginReadKey, q: MarginQuery): Unit[] {
  const live = (q.source ?? 'L') === 'L';
  const mats = q.materials ?? [];
  const parts = live && mats.length > MARGIN_LIVE_MAX ? chunkMaterials(mats) : [mats];
  return parts.map((m, i) => { const uq = { ...q, materials: m }; return { key: `margin|${MARGIN_SET[set]}|${buildMarginFilter(uq, set)}`, q: uq, label: parts.length > 1 ? `batch ${i + 1} of ${parts.length}` : 'run' }; });
}
/** Cache context of a whole run. It is built while the screen is drawn, so it must never throw: a live run of more than 25 finished goods is valid (it is split
 * into batches by unitsOf), only a single call is limited, so the material list is kept out of the filter and added as plain text. */
export const runCtx = (set: MarginReadKey, q: MarginQuery): string => {
  const mats = Array.from(new Set((q.materials ?? []).map((m) => m.trim()).filter(Boolean))).sort().join(',');
  let f: string;
  try { f = buildMarginFilter({ ...q, materials: [] }, set); } catch { f = 'invalid'; }   // e.g. History needs a material: the real error is raised by the calls themselves
  return `margin-run|${MARGIN_SET[set]}|${f}|${mats}`;
};

export interface MarginRunState<K extends MarginReadKey> {
  q: MarginQuery | null;
  units: { unit: Unit; entry: WacEntry<MarginRowsBySet[K]> | undefined }[];
  rows: MarginRowsBySet[K][];
  messages: SapMessage[];
  running: boolean;
  doneCount: number;
  total: number;
  stopped: boolean;
  error: string | null;
  ms: number;
}

export function useMarginRun<K extends MarginReadKey>(set: K) {
  const [q, setQ] = useState<MarginQuery | null>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const token = useRef(0);
  useEffect(() => subscribe(bump), []);
  useEffect(() => () => { token.current++; abortAll(); }, []);

  let units: Unit[] = [];
  try { units = q ? unitsOf(set, q) : []; } catch { units = []; }
  const ctx = q ? runCtx(set, q) : '';
  const entries = units.map((unit) => ({ unit, entry: peek<MarginRowsBySet[K]>(unit.key) }));
  const done = entries.filter((e) => e.entry?.status === 'done');
  const rows = done.flatMap((e) => (e.entry!.data ?? []) as MarginRowsBySet[K][]);
  const messages = rowMessages(rows as { Msg?: string }[], done.flatMap((e) => e.entry!.messages));
  const state: MarginRunState<K> = {
    q, units: entries, rows, messages,
    running: entries.some((e) => e.entry?.status === 'loading'), doneCount: done.length, total: units.length,
    stopped: entries.some((e) => e.entry?.status === 'cancelled'),
    error: entries.find((e) => e.entry?.status === 'error')?.entry?.error ?? null,
    ms: done.reduce((a, e) => a + e.entry!.ms, 0),
  };

  const drive = useCallback(async (query: MarginQuery, force: boolean) => {
    const my = ++token.current;
    const list = unitsOf(set, query);
    const c = runCtx(set, query);
    if (force) invalidate(c);
    for (const u of list) {
      if (token.current !== my) return;
      await ensure<MarginRowsBySet[K]>(u.key, c, set, (signal) => ((query.source ?? 'L') === 'S' ? fetchMarginAll(set, u.q, { signal }) : fetchMargin(set, u.q, { signal })) as never, force);
      const e = peek(u.key);
      if (!e || e.status !== 'done') return; // stopped or failed: the rest waits for "Continue"
    }
  }, [set]);

  const run = useCallback((query: MarginQuery) => { setQ(query); void drive(query, false); }, [drive]);
  const stop = useCallback(() => { token.current++; if (q) stopCtx(ctx); }, [q, ctx]);
  const resume = useCallback(() => { if (q) void drive(q, false); }, [q, drive]);
  const refresh = useCallback(() => { if (q) void drive(q, true); }, [q, drive]);
  return { state, run, stop, resume, refresh };
}

/** Elapsed ms of the running unit, for the Stop button. */
export function useElapsed(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const start = useRef(0);
  useEffect(() => { if (!running) { start.current = 0; return; } if (!start.current) start.current = Date.now(); const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [running]);
  return running && start.current ? now - start.current : 0;
}
