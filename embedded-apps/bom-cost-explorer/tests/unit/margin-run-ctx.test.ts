import { describe, expect, it } from 'vitest';
import { runCtx, unitsOf } from '@/lib/margin/run';
import type { MarginQuery } from '@/lib/margin/filter';

const mats = (n: number) => Array.from({ length: n }, (_, i) => `FG${1000 + i}`);
const q = (m: string[], extra: Partial<MarginQuery> = {}): MarginQuery => ({ materials: m, plants: ['1000'], source: 'L', ...extra } as MarginQuery);

describe('margin run context', () => {
  it('never throws for a live run of more than 25 finished goods (the Portfolio / Board screens draw with it)', () => {
    expect(() => runCtx('BOARD', q(mats(60)))).not.toThrow();
    expect(runCtx('BOARD', q(mats(60)))).toContain('FG1059');
  });
  it('the same selection gives the same context, a different one a different context', () => {
    expect(runCtx('BOARD', q(['B', 'A']))).toBe(runCtx('BOARD', q(['A', 'B'])));
    expect(runCtx('BOARD', q(['A']))).not.toBe(runCtx('BOARD', q(['B'])));
    expect(runCtx('BOARD', q(['A']))).not.toBe(runCtx('BOARD', q(['A'], { groupBy: 'W' } as Partial<MarginQuery>)));
  });
  it('a live run of 60 finished goods is split into batches of 25', () => {
    expect(unitsOf('BOARD', q(mats(60))).map((u) => u.label)).toEqual(['batch 1 of 3', 'batch 2 of 3', 'batch 3 of 3']);
  });
  it('History without a material does not throw while drawing', () => { expect(() => runCtx('HISTORY', q([]))).not.toThrow(); });
});
