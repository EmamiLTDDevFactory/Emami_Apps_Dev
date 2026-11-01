import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { SO_FIELDS, SO_NULLABLE } from '@/lib/so/fields';
import { normalizeRow, selectOfMap } from '@/lib/price-context/odata';
import { CONSUMED_NOTE, hasConsumed, hasPcCost, pcSource, rowWarnings } from '@/lib/so/view';
import { pricesSheet } from '@/lib/so/export';
import { stripTitle } from '@/lib/price-context/display';
import { parseMarginSearch } from '@/lib/margin/selection';
import type { SoPriceRow } from '@/lib/so/types';

const raw = (p: Record<string, unknown> = {}) => ({ Matnr: 'FG1', Maktx: 'Oil', Vkorg: '1000', Vtweg: '10', Auart: 'ZOD1', Curr: 'INR', Uom: 'PC', Mrp: '120', Sp: '95.5', Vbeln: '8711536', Posnr: '000160', Audat: '/Date(1791417600000)/', DaysOld: 5, NSkip: 0, Msg: '', ...p });
const row = (p: Record<string, unknown> = {}) => normalizeRow<SoPriceRow>(raw(p), SO_FIELDS.PRICE, SO_NULLABLE.PRICE);
const COST = { RmCost: '40.5', PmCost: '12.25', PerfCost: '3', PcTotal: '55.75', PcRatio: '58.38', PcDate: '/Date(1791331200000)/', PcAufnr: '1000234', PcWerks: 'UN13', PcCharg: 'B01' };

describe('Sales price: cost of the latest production order (SAP figures)', () => {
  it('the cost fields are in the field map, so they are in the $select', () => {
    const sel = selectOfMap(SO_FIELDS.PRICE).split(',');
    for (const f of ['RmCost', 'PmCost', 'PerfCost', 'ConsRm', 'ConsPm', 'ConsPerf', 'PcTotal', 'PcRatio', 'PcDate', 'PcAufnr', 'PcWerks', 'PcCharg', 'PcMsg']) expect(sel).toContain(f);
  });
  it('amounts are kept as SAP sent them; nothing sent reads as "" (n/a), never 0', () => {
    const r = row(COST);
    expect(r.PcTotal).toBe('55.75'); expect(r.PcRatio).toBe('58.38'); expect(r.PcDate).toBe('2026-10-07');
    const none = row();
    expect(none.PcTotal).toBe(''); expect(none.RmCost).toBe(''); expect(none.PcDate).toBeNull();
    expect(hasPcCost(none)).toBe(false); expect(hasPcCost(r)).toBe(true);
  });
  it('the total is SAP\'s PcTotal: consumed cost is separate and never added to it', () => {
    const r = row({ ...COST, ConsRm: '2', ConsPm: '1', ConsPerf: '0.5' });
    expect(hasConsumed(r)).toBe(true);
    expect(r.PcTotal).toBe('55.75'); // not 55.75 + 3.5
    expect(CONSUMED_NOTE).toMatch(/not part of the total/);
    expect(hasConsumed(row({ ...COST, ConsRm: '0', ConsPm: '0.0000', ConsPerf: '' }))).toBe(false);
  });
  it('detail text: order, plant, batch and date; parts SAP did not send are left out; none = null', () => {
    expect(pcSource(row(COST))).toBe('Cost from order 1000234, plant UN13, batch B01, dated 2026-10-07');
    expect(pcSource(row({ PcAufnr: '77' }))).toBe('Cost from order 77');
    expect(pcSource(row())).toBeNull();
  });
  it('PcMsg is a row warning; no cost and no message adds none', () => {
    expect(rowWarnings(row({ PcMsg: 'No production order in the last 90 days' })).some((w) => w.key === 'pcmsg' && /No production order/.test(w.detail ?? ''))).toBe(true);
    expect(rowWarnings(row()).some((w) => w.key === 'pcmsg')).toBe(false);
  });
  it('price strip tooltip carries the cost values, the source, the consumed line and PcMsg', () => {
    const t = stripTitle(row({ ...COST, ConsRm: '2', PcMsg: 'Batch ignored' }));
    expect(t).toContain('RM 40.5 INR'); expect(t).toContain('Total (RM+PM+perfume) 55.75 INR'); expect(t).toContain('58.38 % of selling price'); expect(t).toContain('Cost from order 1000234'); expect(t).toContain('Consumed:'); expect(t).toContain('Batch ignored');
    expect(stripTitle(row())).toContain('Cost of the latest production order: n/a');
    expect(stripTitle(row())).not.toContain('Consumed');
  });
  it('the Excel export has the cost columns, the consumed ones labelled "not in total"', () => {
    const s = pricesSheet([row({ ...COST, ConsRm: '2' })]);
    const get = (h: string) => s.cols.find((c) => c.header === h)!.get(0);
    expect(get('RM cost (per unit)')).toBe(40.5); expect(get('Total cost RM+PM+perfume (per unit)')).toBe(55.75); expect(get('% of selling price (SAP)')).toBe(58.38);
    expect(get('RM consumed (not in total)')).toBe(2); expect(get('Cost order')).toBe('1000234'); expect(get('Cost order date')).toBe('2026-10-07');
  });
});

// The component module has JSX at module level: give it the classic React global before importing it.
let marginBoardHref: typeof import('@/components/so/CompareWithCost').marginBoardHref;
beforeAll(async () => { (globalThis as unknown as { React: typeof React }).React = React; ({ marginBoardHref } = await import('@/components/so/CompareWithCost')); });

describe('Compare with cost opens the Margin board with the same selection', () => {
  it('latest sales order (PriceSrcIn O): materials, plants, sales area, segment, days and the lists travel in the URL; no auto-run flag, no "+"', () => {
    const href = marginBoardHref(['400009226', '400009227'], ['UB01'], { vkorg: ['EM01'], vtweg: ['10'], segment: ['DOM'], daysBack: 60, auart: { in: ['ZOD1'], ex: [] }, kunnr: { in: [], ex: ['24366'] } });
    expect(href).toContain('/margin/?'); expect(href).not.toContain('+');
    const s = parseMarginSearch(href.slice(href.indexOf('?')));
    expect(s).toMatchObject({ materials: ['400009226', '400009227'], plants: ['UB01'], priceSrc: 'O', vkorg: ['EM01'], vtweg: ['10'], segment: 'DOM', days: 60, auart: { in: ['ZOD1'], ex: [] }, kunnr: { in: [], ex: ['24366'] } });
  });
});
