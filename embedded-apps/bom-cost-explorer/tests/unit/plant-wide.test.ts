import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement } from 'react';
// The test transform compiles JSX classically (React.createElement): provide React like the app's runtime does.
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { resetSapConfig } from '@/lib/sap/config';
import { mockRequestLog } from '../../mock/sap';
import { api } from '@/lib/client/api';
import { SapError, sapGetCollection } from '@/lib/sap/client';
import { fetchCostLines } from '@/lib/sap/service';
import { defaultQuery, type CostQuery } from '@/lib/query/schema';
import { buildTree } from '@/lib/cost/tree';
import { isPlantWide, needsOnePlant, plantWideSettings } from '@/lib/plantwide/flag';
import { isNoWerksProperty, listHeaders, PlantListError } from '@/lib/plantwide/listHeaders';
import { resetCascadeFields } from '@/lib/client/hier';
import { chunk, etaText, mergeLines, newPwState, runBatches, type CostFn } from '@/lib/plantwide/runBatches';
import FilterPanel from '@/components/FilterPanel';
import type { PlantWide } from '@/lib/plantwide/usePlantWide';
import type { CostLine } from '@/lib/sap/fields';
import { line } from './helpers';

const ENV = ['MOCK_SAP', 'MOCK_SAP_DELAY_MS', 'MOCK_SAP_HIER', 'CASCADE_FIELDS'];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
beforeEach(() => { process.env.MOCK_SAP = 'true'; process.env.MOCK_SAP_DELAY_MS = '0'; delete process.env.MOCK_SAP_HIER; delete process.env.CASCADE_FIELDS; resetSapConfig(); resetCascadeFields(); mockRequestLog.length = 0; });
afterEach(() => { for (const k of ENV) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; resetSapConfig(); vi.restoreAllMocks(); });
const setOf = (u: string) => u.split('?')[0].split('/').pop();
const q1 = (p: Partial<CostQuery> = {}): CostQuery => ({ ...defaultQuery('B'), plants: ['UB01'], ...p });

/* ---------- fakes ---------- */
/** Costing fake: 3 lines per header (Seqnr restarts per request like SAP), headers in `noBom` come back without lines. */
function fakeCost(opts: { failWhen?: (list: string[]) => SapError | null; noBom?: Set<string>; calls?: { list: string[]; opts: unknown }[] } = {}): CostFn {
  return async (q, o) => {
    opts.calls?.push({ list: q.materials, opts: o });
    const err = opts.failWhen?.(q.materials);
    if (err) throw err;
    let seq = 0;
    const rows: CostLine[] = [];
    const messages = [];
    for (const m of q.materials) {
      if (opts.noBom?.has(m)) { messages.push({ code: 'ZBOM/001', severity: 'warning' as const, message: `No BOM for material ${m} in plant ${q.plants[0]}` }); continue; }
      rows.push(line({ Seqnr: ++seq, Level: 0, Hwerks: q.plants[0], Werks: q.plants[0], Headmat: m, Idnrk: m, HasChild: 'X', TotCostInr: '10' }));
      rows.push(line({ Seqnr: ++seq, Level: 1, Hwerks: q.plants[0], Werks: q.plants[0], Headmat: m, Idnrk: `${m}-RM`, TotCostInr: '6' }));
      rows.push(line({ Seqnr: ++seq, Level: 1, Hwerks: q.plants[0], Werks: q.plants[0], Headmat: m, Idnrk: `${m}-PM`, TotCostInr: '4' }));
    }
    return { rows, messages, ms: 5, rateOptions: false, capability: 'unknown' as const, sapMessageHeader: false };
  };
}
const headers = (n: number) => Array.from({ length: n }, (_, i) => `H${String(i + 1).padStart(4, '0')}`);

describe('trigger and settings', () => {
  it('active only with the flag on, BOM costing, exactly one plant and Materials empty', () => {
    expect(isPlantWide(q1(), false)).toBe(false); // flag off
    expect(isPlantWide(q1(), true)).toBe(true);
    expect(isPlantWide(q1({ plants: ['UB01', 'UB02'] }), true)).toBe(false);
    expect(isPlantWide(q1({ materials: ['FG1001'] }), true)).toBe(false);
    expect(isPlantWide({ ...q1(), mode: 'C' }, true)).toBe(false);
    expect(needsOnePlant(q1({ plants: ['UB01', 'UB02'] }), true)).toBe(true);
    expect(needsOnePlant(q1({ plants: ['UB01', 'UB02'] }), false)).toBe(false);
  });

  it('settings: default off, batch 25 capped at 50, FERT, concurrency 1, no confirmation', () => {
    expect(plantWideSettings({})).toEqual({ enabled: false, vhCap: 500, batch: 25, mtart: ['FERT'], concurrency: 1, confirmAbove: 0 });
    expect(plantWideSettings({ enabled: 'true', batch: '80', mtart: 'fert, halb', vhCap: '200' })).toMatchObject({ enabled: true, batch: 50, mtart: ['FERT', 'HALB'], vhCap: 200 });
  });

  it('flag off: a blank-materials run makes exactly the same SAP calls as before (existing plant run)', async () => {
    await api.cost({ ...defaultQuery('B'), plants: ['1000'] });
    const baseline = [...mockRequestLog];
    mockRequestLog.length = 0;
    await api.cost({ ...defaultQuery('B'), plants: ['1000'] });
    expect(mockRequestLog).toEqual(baseline);
    expect(baseline.map(setOf)[0]).toBe('MaterialVHSet');
    expect(baseline.slice(1).every((u) => setOf(u) === 'CostLineSet')).toBe(true);
    mockRequestLog.length = 0;
    await api.cost({ ...defaultQuery('B'), materials: ['FG1001'], plants: ['1000'] });
    expect(mockRequestLog.map(setOf)).toEqual(['CostLineSet']);
  });
});

describe('listHeaders', () => {
  it('under the cap: one MaterialVHSet call with the plant filter, sorted, complete, no "+" in the URL', async () => {
    const r = await listHeaders({ plant: '1000', mtart: ['FERT'] }, { vhCap: 500 });
    expect(mockRequestLog.map(setOf)).toEqual(['MaterialVHSet']);
    expect(decodeURIComponent(mockRequestLog[0])).toContain("Werks eq '1000' and Mtart eq 'FERT'");
    expect(r.complete).toBe(true);
    expect(r.plantFiltered).toBe(true);
    expect(r.rows.length).toBeGreaterThan(3);
    expect(r.rows.map((m) => m.Matnr)).toEqual([...r.rows.map((m) => m.Matnr)].sort());
    for (const u of mockRequestLog) expect(u).not.toContain('+');
  });

  it('at the cap: slices by brand, then product, then SKU; a SKU still at the cap is listed as incomplete; de-duplicated', async () => {
    const CAP = 4;
    const calls: string[] = [];
    const mats = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ Matnr: `${prefix}${i}`, Mtart: 'FERT' }));
    const get = async (set: string, params: Record<string, string | undefined>) => {
      const f = params.$filter ?? '';
      calls.push(`${set}?${f}`);
      if (set === 'HierVHSet') {
        if (f.includes("Level eq 'B'")) return { rows: [{ Code: 'BA', Descr: 'Alpha' }, { Code: 'BB', Descr: 'Beta' }] };
        if (f.includes("Level eq 'P'")) return { rows: [{ Code: 'P1', Descr: 'One' }, { Code: 'P2', Descr: 'Two' }] };
        return { rows: [{ Code: 'C1', Descr: 'Cee1' }, { Code: 'C2', Descr: 'Cee2' }] };
      }
      if (f.includes("Zsku eq 'C2'")) return { rows: mats('X', CAP) }; // still at the cap
      if (f.includes("Zsku eq 'C1'")) return { rows: [...mats('Y', 2), { Matnr: 'A0', Mtart: 'FERT' }] }; // A0 again: de-duplicated
      if (f.includes("Prodha eq 'P1'")) return { rows: mats('Z', 3) };
      if (f.includes("Zbrand eq 'BA'")) return { rows: mats('A', 2) };
      return { rows: mats('W', CAP) }; // plant list, brand BB and product P2: at the cap
    };
    const r = await listHeaders({ plant: 'UB01', mtart: ['FERT'] }, { vhCap: CAP, get });
    expect(r.complete).toBe(false);
    expect(r.incomplete).toEqual(['brand Beta › product Two › SKU Cee2']);
    const ids = r.rows.map((m) => m.Matnr);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['A0', 'A1', 'Z0', 'Y0', 'X0']));
    expect(calls.filter((c) => c.startsWith('HierVHSet')).every((c) => c.includes("Werks eq 'UB01'"))).toBe(true);
  });

  it('the cascade picker narrows the list (brand / product / SKU in the filter, new names)', async () => {
    const seen: string[] = [];
    await listHeaders({ plant: 'UB01', mtart: ['FERT'], brand: 'NAV', product: 'P1', sku: 'C9' }, { get: async (_s, p) => { seen.push(p.$filter ?? ''); return { rows: [] }; } });
    expect(seen[0]).toBe("Zbrand eq 'NAV' and Prodha eq 'P1' and Zsku eq 'C9' and Mtart eq 'FERT' and Werks eq 'UB01'");
  });

  it('legacy names in legacy mode, and the same fallback as the picker when SAP lacks the new names', async () => {
    const seen: string[] = [];
    process.env.CASCADE_FIELDS = 'legacy';
    await listHeaders({ plant: 'UB01', mtart: ['FERT'], brand: 'NAV', sku: 'C9' }, { get: async (_s, p) => { seen.push(p.$filter ?? ''); return { rows: [] }; } });
    expect(seen[0]).toBe("Zbrandcode eq 'NAV' and Zskugrcodecrs eq 'C9' and Mtart eq 'FERT' and Werks eq 'UB01'");
    delete process.env.CASCADE_FIELDS;
    seen.length = 0;
    const r = await listHeaders({ plant: 'UB01', mtart: ['FERT'], brand: 'NAV' }, { get: async (_s, p) => {
      const f = p.$filter ?? ''; seen.push(f);
      if (/Zbrand eq/.test(f)) throw new SapError('Property Zbrand not found in type MaterialVH', 'http', 400, [], 400);
      return { rows: [{ Matnr: 'M1' }] };
    } });
    expect(seen).toEqual(["Zbrand eq 'NAV' and Mtart eq 'FERT' and Werks eq 'UB01'", "Zbrandcode eq 'NAV' and Mtart eq 'FERT' and Werks eq 'UB01'"]);
    expect(r.rows.map((m) => m.Matnr)).toEqual(['M1']);
  });

  it('live services without Werks on MaterialVH: the plant comes from the hierarchy (plantFiltered false)', async () => {
    const noWerks = new SapError("Property Werks not found in type MaterialVH", 'http', 400, [], 400);
    expect(isNoWerksProperty(noWerks)).toBe(true);
    const seen: string[] = [];
    const get = async (set: string, p: Record<string, string | undefined>) => {
      const f = p.$filter ?? '';
      seen.push(`${set}?${f}`);
      if (set === 'MaterialVHSet' && f.includes('Werks')) throw noWerks;
      if (set === 'HierVHSet') return { rows: [{ Code: 'B1', Cnt: 3 }, { Code: 'B2', Cnt: 1 }] };
      return { rows: [{ Matnr: f.includes('B1') ? 'M1' : 'M2' }] };
    };
    const r = await listHeaders({ plant: 'UB01', mtart: ['FERT'] }, { get });
    expect(r.plantFiltered).toBe(false);
    expect(r.plantCount).toBe(4);
    expect(r.rows.map((m) => m.Matnr)).toEqual(['M1', 'M2']);
    expect(seen).toContain("HierVHSet?Level eq 'B' and Werks eq 'UB01'");
    expect(seen.filter((x) => x.startsWith('MaterialVHSet')).slice(1).every((x) => !x.includes('Werks'))).toBe(true);
  });

  it('neither set filters by plant: a clear error', async () => {
    const err = (t: string) => new SapError(`Property Werks not found in type ${t}`, 'http', 400, [], 400);
    await expect(listHeaders({ plant: '1000', mtart: ['FERT'] }, { get: async (set) => { throw err(set === 'HierVHSet' ? 'HierVH' : 'MaterialVH'); } })).rejects.toBeInstanceOf(PlantListError);
  });

  it('list requests start no client timer either', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await listHeaders({ plant: '1000', mtart: ['FERT'] });
    expect(spy.mock.calls.some(([, ms]) => (ms ?? 0) >= 1000)).toBe(false);
  });
});

describe('runBatches', () => {
  const q = q1();

  it('batches 25 + 25 + remainder, each through the costing call with NO timeout or deadline', async () => {
    const calls: { list: string[]; opts: unknown }[] = [];
    const state = newPwState();
    await runBatches({ q, headers: headers(60), state, batchSize: 25, cost: fakeCost({ calls }) });
    expect(calls.map((c) => c.list.length)).toEqual([25, 25, 10]);
    for (const c of calls) {
      expect(c.opts).toMatchObject({ noTimeout: true });
      expect((c.opts as { timeoutMs?: number }).timeoutMs).toBeUndefined();
    }
    expect(state.costed.size).toBe(60);
    expect(state.rows.length).toBe(180);
  });

  it('an HTTP error splits the batch in halves down to one header, which is then marked failed', async () => {
    const calls: { list: string[]; opts: unknown }[] = [];
    const state = newPwState();
    const failWhen = (l: string[]) => (l.includes('H0007') ? new SapError('Gateway 502', 'http', 502, [], 502) : null);
    await runBatches({ q, headers: headers(10), state, batchSize: 10, cost: fakeCost({ calls, failWhen }) });
    expect(calls.map((c) => c.list.length)).toEqual([10, 5, 5, 3, 2, 1, 1, 1, 2]); // H6-H10 -> H6-H8 -> H6,H7 -> H6 ok, H7 failed; H8; H9,H10
    expect(state.issues.get('H0007')).toMatchObject({ kind: 'failed' });
    expect(state.costed.size).toBe(9);
  });

  it('a dropped connection splits too; any other error does not (no retry because of time either)', async () => {
    const s1 = newPwState();
    const c1: { list: string[]; opts: unknown }[] = [];
    await runBatches({ q, headers: headers(4), state: s1, batchSize: 4, cost: fakeCost({ calls: c1, failWhen: (l) => (l.length > 1 ? new SapError('offline', 'network', 502) : null) }) });
    expect(c1.map((c) => c.list.length)).toEqual([4, 2, 1, 1, 2, 1, 1]);
    expect(s1.costed.size).toBe(4);
    const s2 = newPwState();
    const c2: { list: string[]; opts: unknown }[] = [];
    await runBatches({ q, headers: headers(4), state: s2, batchSize: 4, cost: fakeCost({ calls: c2, failWhen: () => new SapError('bad JSON', 'parse', 502) }) });
    expect(c2).toHaveLength(1);
    expect([...s2.issues.values()].every((i) => i.kind === 'failed')).toBe(true);
  });

  it('headers without a BOM are skipped with the SAP message', async () => {
    const state = newPwState();
    await runBatches({ q, headers: headers(5), state, batchSize: 25, cost: fakeCost({ noBom: new Set(['H0002']) }) });
    expect(state.issues.get('H0002')).toEqual({ matnr: 'H0002', kind: 'skipped', message: 'No BOM for material H0002 in plant UB01' });
  });

  it('Stop keeps what is done; retry runs only the failed headers; merging never duplicates', async () => {
    const state = newPwState();
    const ctl = new AbortController();
    let batches = 0;
    await expect(runBatches({ q, headers: headers(100), state, batchSize: 25, cost: fakeCost(), signal: ctl.signal, onPartial: () => { if (++batches === 2) ctl.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
    expect(state.costed.size).toBe(50);
    expect(state.rows.length).toBe(150);

    const s = newPwState();
    let broken = true;
    await runBatches({ q, headers: headers(6), state: s, batchSize: 6, cost: fakeCost({ failWhen: (l) => (broken && l.includes('H0003') ? new SapError('500', 'http', 500) : null) }) });
    const failed = [...s.issues.values()].filter((i) => i.kind === 'failed').map((i) => i.matnr);
    expect(failed).toEqual(['H0003']);
    broken = false;
    const calls: { list: string[]; opts: unknown }[] = [];
    await runBatches({ q, headers: failed, state: s, batchSize: 25, cost: fakeCost({ calls }) });
    expect(calls.map((c) => c.list)).toEqual([['H0003']]);
    expect(s.issues.size).toBe(0);
    expect(s.costed.size).toBe(6);
    expect(s.rows.length).toBe(18);
    const before = s.rows.length;
    await runBatches({ q, headers: headers(6), state: s, batchSize: 25, cost: fakeCost() }); // same lines again
    expect(s.rows.length).toBe(before); // re-costed headers come back with other Seqnr values: still no duplicates
  });

  it('mergeLines keys on Seqnr + Hwerks + Headmat into one flat array', () => {
    const s = newPwState();
    const arr = s.rows;
    expect(mergeLines(s, [line({ Seqnr: 1, Headmat: 'A' }), line({ Seqnr: 1, Headmat: 'B' }), line({ Seqnr: 1, Headmat: 'A' })])).toBe(2);
    expect(s.rows).toBe(arr);
  });

  it('the tree fills progressively as batches finish', async () => {
    const state = newPwState();
    const heads: number[] = [];
    await runBatches({ q, headers: headers(75), state, batchSize: 25, cost: fakeCost(), onPartial: () => heads.push(buildTree(state.rows).nodes.filter((n) => n.kind === 'header').length) });
    expect(heads).toEqual([25, 50, 75]);
  });

  it('no cap on the number of headers: 1,000 headers run completely', async () => {
    const state = newPwState();
    const progress: number[] = [];
    await runBatches({ q, headers: headers(1000), state, batchSize: 25, cost: fakeCost(), onProgress: (p) => progress.push(p.headersDone) });
    expect(state.costed.size).toBe(1000);
    expect(chunk(headers(1000), 25)).toHaveLength(40);
    expect(progress[progress.length - 1]).toBe(1000);
  });

  it('estimate only after the first batch, information only', async () => {
    let t = 0;
    const etas: (number | null)[] = [];
    await runBatches({ q, headers: headers(75), state: newPwState(), batchSize: 25, cost: async (...a) => { t += 60_000; return fakeCost()(...a); }, now: () => t, onProgress: (p) => etas.push(p.etaMs) });
    expect(etas[0]).toBeNull();
    expect(etas[1]).toBe(120_000);
    expect(etaText(120_000)).toBe('about 2 min left');
    expect(etaText(null)).toBe('');
  });

  it('end to end against the mock SAP: the existing costing call, no client timer, no "+" in any URL', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const list = await listHeaders({ plant: '1000', mtart: ['FERT'] });
    const state = newPwState();
    await runBatches({ q: { ...defaultQuery('B'), plants: ['1000'] }, headers: list.rows.map((m) => m.Matnr), state, batchSize: 2, cost: fetchCostLines });
    expect(state.costed.size).toBe(list.rows.length);
    expect(mockRequestLog.slice(1).every((u) => setOf(u) === 'CostLineSet')).toBe(true);
    for (const u of mockRequestLog) expect(u).not.toContain('+');
    // Neither the list nor the costing calls start a timer.
    expect(spy.mock.calls.some(([, ms]) => (ms ?? 0) >= 1000)).toBe(false);
  });

  it('the SAP client starts no timer with noTimeout (and still does without it)', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await sapGetCollection('PlantVHSet', {}, { noTimeout: true, costing: true });
    expect(spy.mock.calls.some(([, ms]) => ms === 230_000)).toBe(false);
    spy.mockClear();
    await sapGetCollection('PlantVHSet', {}, { costing: true });
    expect(spy.mock.calls.some(([, ms]) => ms === 230_000)).toBe(true);
  });
});

describe('form (additive, only while active)', () => {
  const plants = { plants: [], loading: false, error: '', reload: () => undefined };
  const base = { query: q1(), onChange: () => undefined, plants, running: false, onRun: () => undefined, onCancel: () => undefined, collapsed: false, onToggle: () => undefined };
  const pw = (p: Partial<PlantWide>): PlantWide => ({ active: true, plant: 'UB01', status: 'ready', count: 143, batches: 6, error: '', progress: null, incomplete: [], plantFiltered: true, run: vi.fn(), retryFailed: vi.fn(), stop: vi.fn(), retryCount: vi.fn(), failedCount: () => 0, settings: plantWideSettings({ enabled: 'true' }), ...p } as unknown as PlantWide);

  it('without the plant-wide props the form renders exactly as before', () => {
    const html = renderToStaticMarkup(createElement(FilterPanel, base));
    expect(html).toContain('Materials · 0/50');
    expect(html).toContain('Leave empty to cost every finished good');
    expect(html).not.toContain('all materials of');
  });

  it('ready: hint, counter "all (143)", Run enabled with the plant label', () => {
    const html = renderToStaticMarkup(createElement(FilterPanel, { ...base, plantWide: pw({}) }));
    expect(html).toContain('Materials · all (143)');
    expect(html).toContain('Blank = all FERT materials of UB01: 143 found. Costed in 6 batches.');
    expect(html).toContain('Run in SAP · all materials of UB01');
    expect(html).not.toMatch(/<button type="submit"[^>]* disabled=""/);
  });

  it('counting / error / incomplete states, and several plants keep Run disabled with the hint', () => {
    const counting = renderToStaticMarkup(createElement(FilterPanel, { ...base, plantWide: pw({ status: 'counting' }) }));
    expect(counting).toContain('Blank = all FERT materials of UB01: counting…');
    expect(counting).toMatch(/<button type="submit"[^>]* disabled=""/);
    expect(renderToStaticMarkup(createElement(FilterPanel, { ...base, plantWide: pw({ status: 'error', error: 'SAP 502' }) }))).toContain('Retry</button>');
    expect(renderToStaticMarkup(createElement(FilterPanel, { ...base, plantWide: pw({ incomplete: ['brand Beta'] }) }))).toContain('List may be incomplete for brand Beta: narrow it.');
    const many = renderToStaticMarkup(createElement(FilterPanel, { ...base, query: q1({ plants: ['UB01', 'UB02'] }), onePlantHint: true }));
    expect(many).toContain('Pick one plant to cost all its materials.');
    expect(many).toMatch(/<button type="submit"[^>]* disabled=""/);
  });
});
