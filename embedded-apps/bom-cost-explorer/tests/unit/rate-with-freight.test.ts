import { describe, expect, it } from 'vitest';
import React, { createElement } from 'react';
(globalThis as unknown as { React: typeof React }).React = React;
import { renderToStaticMarkup } from 'react-dom/server';
import { hasFreightColumns, rateWithFreight, sourceOption, vendorOf, vendorText } from '@/lib/rates/withFreight';
import { rateSummary } from '@/lib/cost/rateSummary';
import RateSummary from '@/components/rates/RateSummary';
import { defaultQuery } from '@/lib/query/schema';
import { leaf, line, opt } from './helpers';

describe('rate + freight (Contract and Info record)', () => {
  const l = line({ FrtPcInr: '2', FrtPcLoc: '2', LocCurr: 'INR', TotCostInr: '100', TotCostLoc: '100' });

  it('only Contract and Info record get the figures', () => {
    expect(hasFreightColumns('CONTRACT')).toBe(true);
    expect(hasFreightColumns('INFOREC')).toBe(true);
    for (const s of ['MARKT', 'CONSUMP', 'MBEW']) {
      expect(hasFreightColumns(s)).toBe(false);
      expect(rateWithFreight(opt({ Source: s, RatePcInr: '10', RatePcLoc: '10' }), l)).toBeNull();
    }
  });

  it('rate + the line freight per unit, in INR and local; no figure for an unpriced option', () => {
    const w = rateWithFreight(opt({ Source: 'INFOREC', RatePcInr: '10.5', RatePcLoc: '10.5', LocCurr: 'INR' }), l)!;
    expect(w.inr.toFixed(4)).toBe('12.5000');
    expect(w.loc!.toFixed(4)).toBe('12.5000');
    expect(w.locCurr).toBe('INR');
    expect(rateWithFreight(opt({ Source: 'CONTRACT', RatePcInr: '0', RatePcLoc: '0' }), l)).toBeNull();
  });

  it('local currency of the line; an option in another currency is converted through INR', () => {
    const bd = line({ FrtPcInr: '7', FrtPcLoc: '10', LocCurr: 'BDT', TotCostInr: '70', TotCostLoc: '100' }); // 0.7 INR per BDT
    const same = rateWithFreight(opt({ Source: 'CONTRACT', RatePcInr: '14', RatePcLoc: '20', LocCurr: 'BDT' }), bd)!;
    expect(same.loc!.toFixed(2)).toBe('30.00'); // 20 + 10 BDT
    expect(same.inr.toFixed(2)).toBe('21.00'); // 14 + 7 INR
    const other = rateWithFreight(opt({ Source: 'CONTRACT', RatePcInr: '14', RatePcLoc: '14', LocCurr: 'INR' }), bd)!;
    expect(other.locCurr).toBe('BDT');
    expect(other.loc!.toFixed(2)).toBe('30.00'); // 21 INR / 0.7
  });

  it('the component plant own option first', () => {
    const o = sourceOption([opt({ Source: 'CONTRACT', RatePcInr: '9', Plant: '2000' }), opt({ Source: 'CONTRACT', RatePcInr: '8', Plant: '1000' })], 'CONTRACT', '1000');
    expect(o!.RatePcInr).toBe('8');
  });
});

describe('rate summary with freight', () => {
  const lines = [
    leaf(2, 1, 'RM1', '10', '1', '2', { RateOptions: [opt({ Source: 'CONTRACT', RatePcInr: '9', RatePcLoc: '9' }), opt({ Source: 'INFOREC', RatePcInr: '11', RatePcLoc: '11' })], FrtPcLoc: '1', LocCurr: 'INR' }),
    leaf(3, 1, 'PM1', '3', '0.5', '1', { Mtart: 'VERP', RateOptions: [opt({ Source: 'INFOREC', RatePcInr: '3', RatePcLoc: '3' })], FrtPcLoc: '0.5', LocCurr: 'INR' }),
  ];

  it('per FG piece and per component, INR and local; incomplete figures keep their priced count', () => {
    const s = rateSummary(lines as never, 1);
    const fg = s.fgs[0];
    expect(fg.withFrt.INFOREC.inr.value!.toFixed(2)).toBe('27.50'); // (11+1)x2 + (3+0.5)x1
    expect(fg.withFrt.INFOREC.loc!.toFixed(2)).toBe('27.50');
    expect(fg.withFrt.INFOREC.inr.priced).toBe(2);
    expect(fg.withFrt.CONTRACT.inr.value!.toFixed(2)).toBe('20.00'); // (9+1)x2, PM1 has no contract
    expect(fg.withFrt.CONTRACT.inr.priced).toBe(1);
    const rm = [...s.rm, ...s.pm, ...s.other].find((c) => c.idnrk === 'RM1')!;
    expect(rm.withFrt.CONTRACT.inr!.toFixed(2)).toBe('10.00');
    expect(rm.withFrt.INFOREC.loc!.toFixed(2)).toBe('12.00');
    expect(rm.lowestType).toBe('CONTRACT'); // the comparison still uses material rates only
  });

  it('the screen shows the four columns once rate options are loaded, and not before', () => {
    const ready = { status: 'ready', request: () => undefined, retest: () => undefined, note: '', rows: [] } as never;
    const html = renderToStaticMarkup(createElement(RateSummary, { rows: lines as never, rates: ready, query: { ...defaultQuery('B'), explQty: '1' } }));
    for (const h of ['Contract + freight (local)', 'Contract + freight (INR)', 'Info record + freight (local)', 'Info record + freight (INR)']) expect(html).toContain(h);
    const loading = { status: 'loading', request: () => undefined, retest: () => undefined, note: '', rows: null } as never;
    expect(renderToStaticMarkup(createElement(RateSummary, { rows: lines as never, rates: loading, query: defaultQuery('B') }))).not.toContain('+ freight (INR)');
  });
});

describe('vendor name where SAP gives it', () => {
  const l = line({ SelSource: 'CONTRACT', SelRatePcInr: '9', SelVendor: '0000100234', SelVname: 'Bengal Packaging Co' });

  it("the option's own vendor first (RateOptionSet), else the line's vendor for the option SAP used, else nothing", () => {
    expect(vendorText(vendorOf({ Source: 'INFOREC', RatePcInr: '11', Vendor: '0000100777', Vname: 'Unity Cartons' }, l))).toBe('Unity Cartons (100777)');
    expect(vendorText(vendorOf({ Source: 'CONTRACT', RatePcInr: '9' }, l))).toBe('Bengal Packaging Co (100234)'); // the used option
    expect(vendorText(vendorOf({ Source: 'INFOREC', RatePcInr: '11' }, l))).toBe(''); // not used, no vendor from SAP
    expect(vendorText(vendorOf({ Source: 'CONTRACT', RatePcInr: '8.5' }, l))).toBe(''); // another contract option
    expect(vendorText({ code: '', name: 'Name only' })).toBe('Name only');
    expect(vendorText({ code: '000042', name: '' })).toBe('42');
  });

  it('rate summary components carry the vendor(s) of the Contract / Info record figures', () => {
    const rows = [leaf(2, 1, 'RM1', '9', '1', '2', { SelSource: 'CONTRACT', SelRatePcInr: '9', SelVendor: '100234', SelVname: 'Bengal Packaging Co', LocCurr: 'INR', FrtPcLoc: '1',
      RateOptions: [opt({ Source: 'CONTRACT', RatePcInr: '9', RatePcLoc: '9' }), { ...opt({ Source: 'INFOREC', RatePcInr: '11', RatePcLoc: '11' }), Vendor: '100777', Vname: 'Unity Cartons' } as never] })];
    const c = [...rateSummary(rows as never, 1).rm, ...rateSummary(rows as never, 1).other][0];
    expect(c.withFrt.CONTRACT.vendor).toBe('Bengal Packaging Co (100234)');
    expect(c.withFrt.INFOREC.vendor).toBe('Unity Cartons (100777)');
  });
});

