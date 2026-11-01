import React from 'react';
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import PriceStrip from '@/components/price-context/PriceStrip';
import { PriceBlank, PriceCells, PriceHeads } from '@/components/price-context/PriceCols';
import { ScopeCtx } from '@/components/price-context/PriceScope';
import * as slots from '@/components/price-context/slots';
import { PriceContextCtx, type PcApi } from '@/lib/price-context/context';
import { costPctOfPrice, currencyDiffers, hasPrice, isStale, orderRows, segmentChip, stripState } from '@/lib/price-context/display';
import { DEFAULT_PC, type PriceContextState } from '@/lib/price-context/state';
import type { SoPriceRow } from '@/lib/so/types';

const row = (p: Partial<SoPriceRow> = {}): SoPriceRow => ({
  Matnr: 'FG1', Maktx: 'Oil', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', AuartTxt: 'Domestic', Segment: 'DOM', SegTxt: 'Domestic', Kalsm: 'ZSDP01', KalsmTxt: 'Std pricing', Curr: 'INR', Uom: 'PC', Werks: 'UN13',
  Mrp: '120.00', Sp: '95.50', NetPrice: '94.00', SpCond: 'ZP12', Vbeln: '0010000123', Posnr: '000010', Kunnr: 'C1', Audat: '2026-10-20', DaysOld: 11, NOrders: 4, NSkip: 0, Src: 'O', Msg: '', RmCost: '', PmCost: '', PerfCost: '', ConsRm: '', ConsPm: '', ConsPerf: '', PcTotal: '', PcRatio: '', PcDate: null, PcAufnr: '', PcWerks: '', PcCharg: '', PcMsg: '', ...p,
});
const on: PriceContextState = { ...DEFAULT_PC, on: true, vkorg: ['1000'] };
const api = (state: PriceContextState, admin = true): PcApi => ({ state, admin, set: () => {}, replace: () => {} });
const render = (el: React.ReactElement, state: PriceContextState = on, admin = true, prices: Record<string, SoPriceRow[]> = {}, opts: { loading?: boolean; error?: string | null } = {}) =>
  renderToStaticMarkup(
    React.createElement(PriceContextCtx.Provider, { value: api(state, admin) },
      React.createElement(ScopeCtx.Provider, { value: { pc: { prices: new Map(Object.entries(prices)), active: true, loading: !!opts.loading, error: opts.error ?? null, messages: [] } } }, el)),
  );
const strip = (props: Partial<React.ComponentProps<typeof PriceStrip>> = {}, prices: Record<string, SoPriceRow[]> = { FG1: [row()] }, state = on, opts = {}) =>
  render(React.createElement(PriceStrip, { matnr: 'FG1', plant: 'UN13', costCurr: 'INR', std: { value: '88.10', curr: 'INR' }, ...props }), state, true, prices, opts);

describe('display rules', () => {
  it('0 or empty is not a price (n/a), never a zero', () => {
    expect(hasPrice('95.5')).toBe(true);
    expect(hasPrice('0.00')).toBe(false);
    expect(hasPrice('')).toBe(false);
  });
  it('usable and newest orders first', () => {
    const rows = orderRows([row({ Auart: 'A', Audat: '2026-09-01' }), row({ Auart: 'B', Sp: '0', Msg: 'No order', Audat: null }), row({ Auart: 'C', Audat: '2026-10-25' })]);
    expect(rows.map((r) => r.Auart)).toEqual(['C', 'A', 'B']);
  });
  it('stale above the limit (default 60 days); currency differs is case-insensitive; the percentage needs equal currencies', () => {
    expect(isStale(row({ DaysOld: 61 }))).toBe(true);
    expect(isStale(row({ DaysOld: 60 }))).toBe(false);
    expect(isStale(row({ DaysOld: 20 }), 10)).toBe(true);
    expect(currencyDiffers('aed', 'INR')).toBe(true);
    expect(currencyDiffers('inr', 'INR')).toBe(false);
    expect(currencyDiffers('AED', undefined)).toBe(false);
    expect(costPctOfPrice('50', 'INR', '100', 'INR')?.toFixed(1)).toBe('50.0');
    expect(costPctOfPrice('50', 'INR', '100', 'AED')).toBeNull();
    expect(costPctOfPrice('50', 'INR', '0', 'INR')).toBeNull();
    expect(costPctOfPrice('0', 'INR', '100', 'INR')).toBeNull();
    expect(segmentChip(row())).toBe('DOM · ZOD1');
  });
  it('strip states', () => {
    expect(stripState({ on: false, loading: false, error: null, rows: [row()] })).toBe('off');
    expect(stripState({ on: true, loading: true, error: null, rows: [] })).toBe('loading');
    expect(stripState({ on: true, loading: true, error: null, rows: [row()] })).toBe('ok');
    expect(stripState({ on: true, loading: false, error: 'x', rows: [] })).toBe('error');
    expect(stripState({ on: true, loading: false, error: null, rows: [] })).toBe('none');
  });
});

describe('PriceStrip', () => {
  it('all values: standard cost, MRP, selling price with their currency and unit, segment / document type, order date and age, order + condition in the tooltip', () => {
    const h = strip();
    expect(h).toContain('Standard');
    expect(h).toContain('88.10');
    expect(h).toContain('MRP');
    expect(h).toContain('120.00');
    expect(h).toContain('Selling price');
    expect(h).toContain('95.50');
    expect(h).toContain('INR / PC');
    expect(h).toContain('DOM · ZOD1');
    expect(h).toContain('20.10.2026');
    expect(h).toContain('11 d');
    expect(h).toContain('Order 0010000123/000010');
    expect(h).toContain('condition ZP12');
    expect(h).not.toContain('currency differs');
  });
  it('no order: a grey note, no zero', () => {
    const h = strip({}, { FG1: [] });
    expect(h).toContain('No MRP / selling price');
    expect(h).not.toContain('0.00');
  });
  it('a row with no usable order shows n/a for both prices and keeps the message in the tooltip', () => {
    const h = strip({}, { FG1: [row({ Sp: '0', Mrp: '0', Msg: 'No order in the last 90 days' })] });
    expect(h.match(/>n\/a</g)?.length).toBe(2);
    expect(h).toContain('No order in the last 90 days');
  });
  it('stale order: amber age badge with a screen-reader word', () => {
    const h = strip({}, { FG1: [row({ DaysOld: 120 })] });
    expect(h).toContain('120 d');
    expect(h).toContain('(stale)');
    expect(h).toContain('text-warn');
  });
  it('currency differs: a badge on each amount that is in another currency than the cost', () => {
    expect(strip({ costCurr: 'AED' })).toContain('currency differs');
    expect(strip({ std: { value: '10', curr: 'AED' } })).toContain('currency differs');
  });
  it('skipped orders and the standard cost "n/a" when SAP has none', () => {
    expect(strip({}, { FG1: [row({ NSkip: 3 })] })).toContain('skip 3');
    const noStd = strip({ std: { value: '0', curr: 'INR' }, plant: '' });
    expect(noStd).toContain('n/a');
  });
  it('loading and error states', () => {
    expect(strip({}, {}, on, { loading: true })).toContain('loading prices');
    expect(strip({}, {}, on, { error: 'No authorised sales area' })).toContain('No authorised sales area');
  });
  it('switch off, no sales organisation, or not an Admin: nothing is rendered', () => {
    expect(strip({}, { FG1: [row()] }, { ...on, on: false })).toBe('');
    expect(strip({}, { FG1: [row()] }, { ...on, vkorg: [] })).toBe('');
    expect(render(React.createElement(PriceStrip, { matnr: 'FG1' }), on, false, { FG1: [row()] })).toBe('');
  });
  it('more than two orders: the first two and a "+n more" control', () => {
    const rows = [row({ Auart: 'A' }), row({ Auart: 'B' }), row({ Auart: 'C' }), row({ Auart: 'D' })];
    const h = strip({}, { FG1: rows });
    expect(h).toContain('+2 more');
    expect(h).not.toContain('DOM · D');
  });
});

describe('extra source columns of the matrices', () => {
  const heads = (state: PriceContextState, admin = true) => render(React.createElement('table', null, React.createElement('thead', null, React.createElement('tr', null, React.createElement(PriceHeads, { className: 'h' })))), state, admin);
  it('Standard (CK13N), MRP and Selling price appear only when the switch is on, a sales organisation is chosen and the person is an Admin', () => {
    const h = heads(on);
    expect(h).toContain('Standard (CK13N)');
    expect(h).toContain('>MRP<');
    expect(h).toContain('Selling price');
    expect(heads({ ...on, on: false })).not.toContain('MRP');
    expect(heads({ ...on, vkorg: [] })).not.toContain('MRP');
    expect(heads(on, false)).not.toContain('MRP');
  });
  it('the cells and the blank cells keep three columns, and with the switch off add nothing', () => {
    const body = (state: PriceContextState) => render(React.createElement('table', null, React.createElement('tbody', null, React.createElement('tr', null, React.createElement(PriceBlank, { className: 'c' }), React.createElement(PriceCells, { matnr: 'FG1', plant: 'UN13', className: 'c', costCurr: 'INR' })))), state, true, { FG1: [row()] });
    expect((body(on).match(/<td/g) ?? []).length).toBe(6);
    expect(body({ ...on, on: false })).not.toContain('<td');
  });
  it('MRP and selling price cells: n/a when there is no order, the percentage only with equal currencies', () => {
    const cells = (costCurr: string, prices: Record<string, SoPriceRow[]>) => render(React.createElement('table', null, React.createElement('tbody', null, React.createElement('tr', null, React.createElement(PriceCells, { matnr: 'FG1', plant: 'UN13', className: 'c', costCurr, costValue: '47.75' })))), on, true, prices);
    expect(cells('INR', { FG1: [row()] })).toContain('% of selling price');
    expect(cells('INR', { FG1: [row()] })).toContain('(computed here)');
    expect(cells('AED', { FG1: [row()] })).not.toContain('% of selling price');
    expect(cells('AED', { FG1: [row()] })).toContain('currency differs');
    expect(cells('INR', {})).toContain('n/a');
  });
});

describe('flag off: no extra code, no extra element', () => {
  it('the slots render nothing and pass children through', () => {
    expect(renderToStaticMarkup(React.createElement(slots.PriceStrip, { matnr: 'FG1' }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(slots.PriceHeads, { className: 'h' }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(slots.PriceContextBar))).toBe('');
    expect(renderToStaticMarkup(React.createElement(slots.FgStrips, { fgs: [{ matnr: 'FG1', plant: 'UN13', text: '' }] }))).toBe('');
    expect(renderToStaticMarkup(React.createElement(slots.PriceScope, { materials: ['FG1'], children: React.createElement('i', null, 'child') }))).toBe('<i>child</i>');
    expect(renderToStaticMarkup(React.createElement(slots.PriceContextProvider, { email: 'a@b.c', children: React.createElement('i', null, 'child') }))).toBe('<i>child</i>');
  });
  it('the build-time check is the literal env test (so the heavy code is dropped when off), and no existing screen imports it any other way', () => {
    const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
    expect(src('src/components/price-context/slots.tsx')).toMatch(/process\.env\.NEXT_PUBLIC_PRICE_CONTEXT_ENABLED === 'true' \? \(require\('\.\/impl'\)/);
    for (const f of ['src/components/Explorer.tsx', 'src/components/Shell.tsx', 'src/components/rates/RateSummary.tsx', 'src/components/plan/FgPerPiece.tsx', 'src/components/plan/BreakupTab.tsx', 'src/components/costbreakup/CostBreakup.tsx', 'src/components/freight/FreightCompare.tsx', 'src/components/watch/WatchPage.tsx', 'src/components/wac/RowDetail.tsx']) {
      const s = src(f);
      expect(s, f).not.toMatch(/price-context\/(PriceStrip|PriceScope|PriceCols|FgStrips|impl|PriceContextProvider|PriceContextBar)/);
      expect(s, f).not.toMatch(/lib\/price-context\/usePriceContext/);
    }
  });
});
