'use client';
/**
 * Plant-wide costing for the BOM costing screen (flag PLANT_WIDE_ENABLED): active only with exactly one plant and
 * Materials empty. While active it lists the plant's header materials in the background (500 ms debounce, the old
 * request aborted when the form changes; no request at all when not active). run() / retryFailed() are executed through
 * the screen's existing runner (useRun.runWith), so Stop, the elapsed ticker and the result state are the existing ones.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCostLines } from '../sap/service';
import type { CostQuery } from '../query/schema';
import type { SapMessage } from '../sap/messages';
import type { CostResult } from '../client/api';
import type { HierPick } from '../client/hier';
import { isPlantWide, PLANT_WIDE, type PlantWideSettings } from './flag';
import { listHeaders, type HeaderRow, type ListHeadersOptions } from './listHeaders';
import { chunk, newPwState, runBatches, type CostFn, type PwProgress, type PwState } from './runBatches';

export type { HierPick };
export const NO_PICK: HierPick = { brand: '', product: '', sku: '' };

export interface PlantWideInfo { plant: string; headers: number; costed: number; skipped: number; failed: number; batches: number; plantFiltered: boolean; incomplete: string[] }

export interface UsePlantWideOptions {
  query: CostQuery;
  pick?: HierPick;
  settings?: PlantWideSettings;
  /** the screen runner's cancel (Stop) */
  cancel?: () => void;
  /** test seams */
  cost?: CostFn;
  get?: ListHeadersOptions['get'];
  debounceMs?: number;
}

export function usePlantWide({ query, pick = NO_PICK, settings = PLANT_WIDE, cancel, cost = fetchCostLines, get, debounceMs = 500 }: UsePlantWideOptions) {
  const active = isPlantWide(query, settings.enabled);
  const plant = active ? query.plants[0].toUpperCase() : '';
  const listKey = active ? JSON.stringify([plant, settings.mtart, pick.brand, pick.product, pick.sku]) : '';

  const [status, setStatus] = useState<'idle' | 'counting' | 'ready' | 'error'>('idle');
  const [list, setList] = useState<{ key: string; rows: HeaderRow[]; incomplete: string[]; plantFiltered: boolean; plantCount?: number } | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<PwProgress | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const state = useRef<PwState>(newPwState());
  const runInfo = useRef<{ plant: string; headers: string[]; plantFiltered: boolean; incomplete: string[] } | null>(null);
  const running = useRef(false);

  // Background count: only while active; any change of the list inputs aborts the old request and discards the list.
  useEffect(() => {
    if (!active) { setStatus('idle'); setList(null); setError(''); return; }
    setStatus('counting');
    setList(null);
    setError('');
    const ctl = new AbortController();
    const t = setTimeout(() => {
      listHeaders({ plant, mtart: settings.mtart, brand: pick.brand || undefined, product: pick.product || undefined, sku: pick.sku || undefined }, { signal: ctl.signal, vhCap: settings.vhCap, get })
        .then((r) => { if (!ctl.signal.aborted) { setList({ key: listKey, rows: r.rows, incomplete: r.incomplete, plantFiltered: r.plantFiltered, plantCount: r.plantCount }); setStatus('ready'); } })
        .catch((e) => { if (!ctl.signal.aborted) { setError((e as Error).message || 'Could not list the materials of the plant.'); setStatus('error'); } });
    }, debounceMs);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [listKey, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = list && list.key === listKey ? list.rows.length : 0;
  const batches = Math.ceil(count / settings.batch);

  const compose = useCallback((): CostResult => {
    const s = state.current;
    const info = runInfo.current!;
    const issues = [...s.issues.values()];
    const skipped = issues.filter((i) => i.kind === 'skipped');
    const failed = issues.filter((i) => i.kind === 'failed');
    const head: SapMessage[] = [
      { code: 'APP/PLANT_WIDE', severity: 'info', message: `Plant-wide: ${info.headers.length} header materials (${settings.mtart.join(', ')}) of plant ${info.plant} in ${chunk(info.headers, settings.batch).length} batch(es) of up to ${settings.batch}.${info.plantFiltered ? '' : ` Listed through the plant's brands (SAP has no plant filter on MaterialVH here): materials without a BOM in ${info.plant} are skipped.`}` },
      ...info.incomplete.map((n): SapMessage => ({ code: 'APP/PW_INCOMPLETE', severity: 'warning', message: `List may be incomplete for ${n}: SAP answered the maximum number of rows. Narrow it with the brand / product / SKU picker.` })),
      ...skipped.map((i): SapMessage => ({ code: 'APP/PW_SKIPPED', severity: 'warning', message: `${i.matnr.replace(/^0+/, '')} skipped: ${i.message}` })),
      ...failed.map((i): SapMessage => ({ code: 'APP/PW_FAILED', severity: 'error', message: `${i.matnr.replace(/^0+/, '')} failed: ${i.message}` })),
    ];
    const last = s.last;
    return {
      rows: s.rows, messages: [...head, ...s.messages.values()], ms: s.ms, total: s.rows.length,
      rateOptions: last?.rateOptions, capability: last?.capability, resolvedMaterials: [...s.costed],
      plantWide: { plant: info.plant, headers: info.headers.length, costed: s.costed.size, skipped: skipped.length, failed: failed.length, batches: chunk(info.headers, settings.batch).length, plantFiltered: info.plantFiltered, incomplete: info.incomplete },
    };
  }, [settings.batch, settings.mtart]);

  const exec = useCallback(async (signal: AbortSignal, q: CostQuery, headers: string[], publish: (r: CostResult) => void): Promise<CostResult> => {
    if (running.current) throw Object.assign(new Error('A plant-wide run is already going.'), { name: 'PlantWideBusy' });
    running.current = true;
    try {
      await runBatches({ q, headers, state: state.current, batchSize: settings.batch, concurrency: settings.concurrency, cost, signal, onProgress: setProgress, onPartial: () => publish(compose()) });
      return compose();
    } finally {
      running.current = false;
      setProgress(null);
    }
  }, [settings.batch, settings.concurrency, cost, compose]);

  /** Costs every listed header; lines appear through publish() batch by batch. */
  const run = useCallback((signal: AbortSignal, q: CostQuery, publish: (r: CostResult) => void) => {
    if (!list || list.key !== listKey) throw new Error('The materials of the plant are not listed yet.');
    state.current = newPwState();
    runInfo.current = { plant, headers: list.rows.map((m) => m.Matnr), plantFiltered: list.plantFiltered, incomplete: list.incomplete };
    return exec(signal, q, runInfo.current.headers, publish);
  }, [list, listKey, plant, exec]);

  /** Costs only the headers that failed, into the same result. */
  const retryFailed = useCallback((signal: AbortSignal, q: CostQuery, publish: (r: CostResult) => void) => {
    const failed = [...state.current.issues.values()].filter((i) => i.kind === 'failed').map((i) => i.matnr);
    return exec(signal, q, failed, publish);
  }, [exec]);

  const stop = useCallback(() => cancel?.(), [cancel]);
  const retryCount = useCallback(() => setReloadTick((n) => n + 1), []);
  const failedCount = useCallback(() => [...state.current.issues.values()].filter((i) => i.kind === 'failed').length, []);

  return useMemo(() => ({
    active, plant, status, count, batches, error, progress,
    incomplete: list?.key === listKey ? list.incomplete : [], plantFiltered: list?.key === listKey ? list.plantFiltered : true, plantCount: list?.key === listKey ? list.plantCount : undefined,
    run, retryFailed, stop, retryCount, failedCount, settings,
  }), [active, plant, status, count, batches, error, progress, list, listKey, run, retryFailed, stop, retryCount, failedCount, settings]);
}

export type PlantWide = ReturnType<typeof usePlantWide>;
