/**
 * Upload kinds of the Margin module (CogmUploadSet): the columns of each Kind, in the order of its Excel template. The browser checks FORMAT only
 * (required columns, numbers, dates, flags); SAP validates the content and wins. Property names follow the agreed contract (Matnr, Werks, Market, Channel,
 * ValidFrom, ValidTo, Curr, Uom, PriceUnit, Mrp, SellPrice, GstPct, Gjahr, Poper, Volume, BudCogm, ScopeType, ScopeVal, ProdhPfx, DelFlag). The names of the
 * ACTUAL, TARGET and RULE columns beyond those (ActCogm, TgtRatio, TgtRemain, MarginMin, MarginMax, Rule, Threshold, Severity) are UNCHECKED guesses: fix them
 * ONLY here once SAP's $metadata is known.
 */
export type UploadKind = 'PRICE' | 'VOLUME' | 'BUDGET' | 'ACTUAL' | 'TARGET' | 'RULE';
export const UPLOAD_KINDS: UploadKind[] = ['PRICE', 'VOLUME', 'BUDGET', 'ACTUAL', 'TARGET', 'RULE'];
export const KIND_LABEL: Record<UploadKind, string> = { PRICE: 'Prices', VOLUME: 'Volumes', BUDGET: 'Budgets', ACTUAL: 'Actuals', TARGET: 'Targets', RULE: 'Alert rules' };

export type ColType = 'text' | 'decimal' | 'date' | 'int' | 'flag';
export interface UploadCol { key: string; header: string; type: ColType; required?: boolean; max?: number; example: string; hint?: string }

const c = (key: string, header: string, type: ColType, example: string, o: Partial<UploadCol> = {}): UploadCol => ({ key, header, type, example, ...o });
const MATNR = c('Matnr', 'Material', 'text', '400009226', { required: true, max: 40 });
const WERKS = (req = false) => c('Werks', 'Plant', 'text', 'UB01', { required: req, max: 4, hint: '4 characters' });
const MARKET = c('Market', 'Market', 'text', 'EM01', { max: 10 });
const CHANNEL = c('Channel', 'Channel', 'text', '10', { max: 10 });
const DEL = c('DelFlag', 'Delete (X)', 'flag', '', { hint: 'X deletes the entry' });

export const KIND_COLUMNS: Record<UploadKind, UploadCol[]> = {
  PRICE: [MATNR, WERKS(), MARKET, CHANNEL, c('ValidFrom', 'Valid from', 'date', '2026-11-01', { required: true, hint: 'YYYY-MM-DD' }), c('ValidTo', 'Valid to', 'date', '2026-12-31', { hint: 'YYYY-MM-DD' }),
    c('Curr', 'Currency', 'text', 'INR', { required: true, max: 5 }), c('Uom', 'Unit', 'text', 'PC', { required: true, max: 3 }), c('PriceUnit', 'Price unit', 'decimal', '1'),
    c('Mrp', 'MRP', 'decimal', '99'), c('SellPrice', 'Selling price', 'decimal', '75'), c('GstPct', 'GST %', 'decimal', '18'), DEL],
  VOLUME: [MATNR, WERKS(), MARKET, CHANNEL, c('Gjahr', 'Year', 'int', '2026', { required: true, max: 4, hint: '4 digits' }), c('Poper', 'Period', 'int', '11', { required: true, hint: '1 to 12' }),
    c('Volume', 'Volume', 'decimal', '120000', { required: true }), c('Uom', 'Unit', 'text', 'PC', { max: 3 }), DEL],
  BUDGET: [MATNR, WERKS(true), MARKET, CHANNEL, c('Gjahr', 'Year', 'int', '2026', { required: true, max: 4 }), c('Poper', 'Period', 'int', '11', { hint: '1 to 12; empty = whole year' }),
    c('BudCogm', 'Budget COGM', 'decimal', '48.5', { required: true }), c('Curr', 'Currency', 'text', 'INR', { required: true, max: 5 }), c('Uom', 'Unit', 'text', 'PC', { max: 3 }), DEL],
  ACTUAL: [MATNR, WERKS(true), MARKET, CHANNEL, c('Gjahr', 'Year', 'int', '2026', { required: true, max: 4 }), c('Poper', 'Period', 'int', '10', { required: true, hint: '1 to 12' }),
    c('ActCogm', 'Actual COGM', 'decimal', '49.2', { required: true }), c('Curr', 'Currency', 'text', 'INR', { required: true, max: 5 }), c('Uom', 'Unit', 'text', 'PC', { max: 3 }), DEL],
  TARGET: [c('ScopeType', 'Scope type', 'text', 'PRODH', { required: true, max: 10, hint: 'e.g. MATNR, PRODH, BRAND' }), c('ScopeVal', 'Scope value', 'text', '0101', { required: true, max: 40 }), c('ProdhPfx', 'Product hierarchy prefix', 'text', '0101', { max: 18 }),
    c('TgtRatio', 'Target ratio %', 'decimal', '60'), c('TgtRemain', 'Target remaining amount', 'decimal', '30'), c('MarginMin', 'Margin minimum %', 'decimal', '35'), c('MarginMax', 'Margin maximum %', 'decimal', '50'), DEL],
  RULE: [c('Rule', 'Rule', 'text', 'E1', { required: true, max: 4, hint: 'E1 to E9' }), c('ScopeType', 'Scope type', 'text', 'PRODH', { max: 10 }), c('ScopeVal', 'Scope value', 'text', '0101', { max: 40 }), c('ProdhPfx', 'Product hierarchy prefix', 'text', '0101', { max: 18 }),
    c('Threshold', 'Threshold', 'decimal', '5', { required: true }), c('Severity', 'Severity', 'text', 'H', { max: 1, hint: 'H, M or L' }), DEL],
};
export const columnsOf = (k: UploadKind): UploadCol[] => KIND_COLUMNS[k];
export const templateHeaders = (k: UploadKind): string[] => KIND_COLUMNS[k].map((x) => x.header);
export const templateExample = (k: UploadKind): string[] => KIND_COLUMNS[k].map((x) => x.example);
/** Most rows one upload may carry (a guard against a wrong file; SAP has its own limits). */
export const UPLOAD_MAX_ROWS = 5000;
