/**
 * RateOptionSet filter = the costing filter with ONE difference: on RateOption the flags InclFrt, StdFrt,
 * InclBudget, InclCover, UseAsof and LatestOnly are Edm.String (CHAR1), while on CostLine they are Edm.Boolean.
 * "InclFrt eq true" on RateOptionSet fails with 400 "Invalid parametertype used at function 'eq'".
 *
 * RATEOPTION_BOOL_STYLE (default "string"):
 *   "string"  true -> Flag eq 'X',  false -> Flag eq ''  (a false flag is never left out: SAP defaults several to true)
 *   "boolean" unchanged (eq true / eq false), exactly as the costing call
 * Everything else (Mode, Plan1, Werks, MtartFilter, Fallback 'X', BudgetYr, Prio, Lookback, DonorPlant, ...) stays
 * byte for byte as in the costing filter, same order, because the options filter is DERIVED from it here.
 * Text inside quoted literals is never touched.
 */
export const RATEOPTION_STRING_FLAGS = ['InclFrt', 'StdFrt', 'InclBudget', 'InclCover', 'UseAsof', 'LatestOnly'] as const;
export type RateOptionBoolStyle = 'string' | 'boolean';

/** RATEOPTION_BOOL_STYLE from the build (NEXT_PUBLIC_ in the browser), default "string". */
export function rateOptionBoolStyle(): RateOptionBoolStyle {
  const v = (process.env.NEXT_PUBLIC_RATEOPTION_BOOL_STYLE || (typeof process !== 'undefined' ? process.env.RATEOPTION_BOOL_STYLE : '') || '').trim().toLowerCase();
  return v === 'boolean' ? 'boolean' : 'string';
}

const FLAG_RE = new RegExp(`\\b(${RATEOPTION_STRING_FLAGS.join('|')}) eq (true|false)\\b`, 'g');

/** The costing filter rewritten for RateOptionSet (only the six flags change). */
export function rateOptionFilter(costingFilter: string, style: RateOptionBoolStyle = rateOptionBoolStyle()): string {
  if (style === 'boolean') return costingFilter;
  // Split into quoted literals ('...' with '' escapes) and the rest; rewrite only outside quotes.
  return costingFilter
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(FLAG_RE, (_m, flag: string, v: string) => `${flag} eq ${v === 'true' ? "'X'" : "''"}`)))
    .join('');
}
