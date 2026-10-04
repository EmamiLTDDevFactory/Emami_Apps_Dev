import Decimal from 'decimal.js';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export const ZERO = new Decimal(0);
export const D = (v: string | number | Decimal | null | undefined): Decimal => {
  if (v instanceof Decimal) return v;
  if (v === null || v === undefined || v === '') return ZERO;
  try {
    return new Decimal(v);
  } catch {
    return ZERO;
  }
};
export const sum = (vals: Iterable<Decimal>): Decimal => {
  let s = ZERO;
  for (const v of vals) s = s.plus(v);
  return s;
};
export const isZero = (v: string | Decimal | null | undefined) => D(v).isZero();
/** Percentage change a -> b, null when a is 0. */
export const pctChange = (a: Decimal, b: Decimal): Decimal | null => (a.isZero() ? null : b.minus(a).div(a.abs()).times(100));
