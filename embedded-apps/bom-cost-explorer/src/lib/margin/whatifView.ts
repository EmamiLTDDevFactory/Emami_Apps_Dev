/**
 * Presentation logic of the What-if screen (CogmSimSet). SAP computes every before / after figure, the change of the remaining amount, the annual
 * change and the prices that reach the target; this file only validates the inputs, words the signs and sorts. No arithmetic on money here.
 * Wording: "Amount remaining after manufacturing cost" (never "profit"). Annual change in INR: positive = loss, negative = saving.
 */
import Decimal from 'decimal.js';
import type { MarginQuery } from './filter';
import type { MarginSim, Scenario } from './types';
import { dec } from '../wac/view';

export interface WhatIfInputs { newMrp: string; newSp: string; cogmDpct: string; cogmDabs: string; scenario: Scenario; tgtRatio: string; tgtRemain: string }
export const EMPTY_WHATIF: WhatIfInputs = { newMrp: '', newSp: '', cogmDpct: '', cogmDabs: '', scenario: 'STD', tgtRatio: '', tgtRemain: '' };

const num = (v: string) => { const t = v.trim().replace(',', '.'); if (!t) return null; try { const d = new Decimal(t); return d.isFinite() ? d : undefined; } catch { return undefined; } };
const NAMES: Record<'newMrp' | 'newSp' | 'cogmDpct' | 'cogmDabs' | 'tgtRatio' | 'tgtRemain', string> = {
  newMrp: 'The new MRP', newSp: 'The new selling price', cogmDpct: 'The COGM change %', cogmDabs: 'The COGM change amount', tgtRatio: 'The target ratio', tgtRemain: 'The target remaining amount',
};

/** Input errors by field ('' key = general). One of new MRP / new selling price at most; every filled number must be a number; something must be asked. */
export function validateWhatIf(i: WhatIfInputs): Partial<Record<keyof WhatIfInputs | 'general', string>> {
  const e: Partial<Record<keyof WhatIfInputs | 'general', string>> = {};
  for (const k of Object.keys(NAMES) as (keyof typeof NAMES)[]) if (num(i[k]) === undefined) e[k] = `${NAMES[k]} must be a number.`;
  if (num(i.newMrp) && num(i.newSp)) { e.newMrp = 'Give a new MRP or a new selling price, not both.'; e.newSp = e.newMrp; }
  const any = (Object.keys(NAMES) as (keyof typeof NAMES)[]).some((k) => i[k].trim() !== '');
  if (!any) e.general = 'Give at least one change (new MRP or selling price, COGM change) or a target.';
  const neg = (k: 'newMrp' | 'newSp' | 'tgtRatio') => { const d = num(i[k]); if (d && d.lt(0)) e[k] = `${NAMES[k]} cannot be negative.`; };
  neg('newMrp'); neg('newSp'); neg('tgtRatio');
  return e;
}
export const hasErrors = (e: object) => Object.keys(e).length > 0;

/** The filter inputs of the call: only what was typed (the filter builder adds the m suffix). */
export function whatIfQuery(base: MarginQuery, i: WhatIfInputs): MarginQuery {
  const v = (s: string) => (s.trim() ? s.trim().replace(',', '.') : undefined);
  return { ...base, scenario: i.scenario, newMrp: v(i.newMrp), newSp: v(i.newSp), cogmDpct: v(i.cogmDpct), cogmDabs: v(i.cogmDabs), tgtRatio: v(i.tgtRatio), tgtRemain: v(i.tgtRemain) };
}

export type Direction = 'up' | 'down' | 'same' | 'na';
/** Sign of a figure SAP sent; '' (nothing) is n/a, never "same". */
export function direction(v: string): Direction {
  const d = dec(v);
  return d === null ? 'na' : d.gt(0) ? 'up' : d.lt(0) ? 'down' : 'same';
}
/** Annual change in INR: positive = loss, negative = saving (the word travels with the sign, so colour is never the only signal). */
export const ANNUAL_WORD: Record<Direction, string> = { up: 'Loss', down: 'Saving', same: 'No change', na: 'n/a' };
/** Change of the amount remaining after manufacturing cost: positive = more remains. */
export const REMAIN_WORD: Record<Direction, string> = { up: 'Remaining amount up', down: 'Remaining amount down', same: 'No change', na: 'n/a' };
export const annualWord = (v: string) => ANNUAL_WORD[direction(v)];
export const remainWord = (v: string) => REMAIN_WORD[direction(v)];

/** One row per finished good / market / channel, in the order SAP sent (stable key for React). */
export const simKey = (r: Pick<MarginSim, 'Matnr' | 'Werks' | 'Market' | 'Channel'>, i: number) => `${r.Werks}|${r.Matnr}|${r.Market}|${r.Channel}|${i}`;
/** A row SAP could not compute (a message and no after-values at all). */
export const noResult = (r: MarginSim): boolean => !!r.Msg.trim() && [r.MrpAfter, r.SpAfter, r.CogmAfter, r.RemainAfter, r.RatioAfter].every((v) => dec(v) === null);
export const withTarget = (r: MarginSim): boolean => [r.ReqSpRatio, r.ReqSpRemain, r.ReqMrpRestore].some((v) => dec(v) !== null);
