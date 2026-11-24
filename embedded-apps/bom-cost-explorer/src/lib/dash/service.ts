import { odataDate, odataString } from '../sap/filter';
import { readSet, type Read } from '../price-context/odata';
import { DASH_FILTER as F, DASH_CDRILL_FIELDS, DASH_CDRILL_SET, DASH_MARGIN_FIELDS, DASH_MARGIN_FILTER as MF, DASH_MARGIN_SET, DASH_MIS_FG_FIELDS, DASH_MIS_FIELDS, DASH_PVM_FIELDS, DASH_PVM_SET, DASH_SALES_FIELDS, DASH_SALES_SET, DASH_SET, DASH_THRESH_FIELDS, DASH_THRESH_SET } from './fields';
import type { CdrillRow, MarginRow, MisFgRow, MisRow, PvmRow, SalesRow, ThreshRow } from './types';

const NONE: ReadonlySet<string> = new Set();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** $filter of the MIS read: the plants (or-ed) and the as-of date. FTM = month start to that date, YTM = financial year start to that date (SAP decides). */
export function buildMisFilter(plants: string[], dateTo: string): string {
  const p = Array.from(new Set(plants.map((x) => x.trim().toUpperCase()).filter(Boolean)));
  if (!p.length) throw new Error('Enter at least one plant.');
  if (p.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A plant is 4 characters.');
  if (!DAY.test(dateTo)) throw new Error('Enter the as-of date.');
  const w = p.map((x) => `${F.Werks} eq ${odataString(x)}`);
  return `${w.length === 1 ? w[0] : `(${w.join(' or ')})`} and ${F.DateTo} eq ${odataDate(dateTo)}`;
}

export const fetchMis = (plants: string[], dateTo: string, signal?: AbortSignal): Promise<Read<MisRow>> =>
  readSet<MisRow>(DASH_SET, DASH_MIS_FIELDS, NONE, buildMisFilter(plants, dateTo), signal);

/** The same read at finished-good level (SAP: Grain eq 'F'): per material the actual, the budget and the budget key that was matched. */
export const fetchMisDetail = (plants: string[], dateTo: string, signal?: AbortSignal): Promise<Read<MisFgRow>> =>
  readSet<MisFgRow>(DASH_SET, DASH_MIS_FG_FIELDS, NONE, `${buildMisFilter(plants, dateTo)} and Grain eq 'F'`, signal);

/** $filter of the Sales view read: plants, from and to date. */
export interface SalesExtra { matnr?: string[]; vkorg?: string[]; vtweg?: string[]; requirePlant?: boolean }
export function buildSalesFilter(plants: string[], dateFrom: string, dateTo: string, extra: SalesExtra = {}): string {
  if (!DAY.test(dateFrom) || !DAY.test(dateTo)) throw new Error('Enter both dates.');
  if (dateFrom > dateTo) throw new Error('The "from" date is after the "to" date.');
  // blank plants = every plant (the billing plant is then not filtered); the PVM bridge still needs a plant
  const pl = Array.from(new Set(plants.map((x) => x.trim().toUpperCase()).filter(Boolean)));
  const base = pl.length || extra.requirePlant ? buildMisFilter(plants, dateTo) : `${F.DateTo} eq ${odataDate(dateTo)}`;
  const matnr = uniq((extra.matnr ?? []).map((m) => m.trim().replace(/^0+/, ''))), vkorg = uniq(extra.vkorg ?? []), vtweg = uniq(extra.vtweg ?? []);
  if (matnr.some((x) => !/^[A-Z0-9]{1,18}$/.test(x))) throw new Error('A material number is up to 18 characters.');
  if (vkorg.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A sales organisation is 4 characters.');
  if (vtweg.some((x) => !/^[A-Z0-9]{2}$/.test(x))) throw new Error('A distribution channel is 2 characters.');
  return [base, `DateFrom eq ${odataDate(dateFrom)}`, anyOf(MF.Matnr, matnr), anyOf(MF.Vkorg, vkorg), anyOf(MF.Vtweg, vtweg)].filter(Boolean).join(' and ');
}

export const fetchSales = (plants: string[], dateFrom: string, dateTo: string, signal?: AbortSignal, extra: SalesExtra = {}): Promise<Read<SalesRow>> =>
  readSet<SalesRow>(DASH_SALES_SET, DASH_SALES_FIELDS, NONE, buildSalesFilter(plants, dateFrom, dateTo, extra), signal);

export const fetchPvm = (plants: string[], dateFrom: string, dateTo: string, signal?: AbortSignal): Promise<Read<PvmRow>> =>
  readSet<PvmRow>(DASH_PVM_SET, DASH_PVM_FIELDS, NONE, buildSalesFilter(plants, dateFrom, dateTo, { requirePlant: true }), signal);

export const fetchThresholds = (signal?: AbortSignal): Promise<Read<ThreshRow>> => readSet<ThreshRow>(DASH_THRESH_SET, DASH_THRESH_FIELDS, NONE, '', signal);

export interface MarginSel { plants: string[]; vkorg: string[]; vtweg: string[]; crssku: string[]; vbeln: string[]; /** finished goods chosen by Brand > Product > SKU > Material (like BOM costing); SAP reads only these */ matnr?: string[] }
export const EMPTY_SEL: MarginSel = { plants: [], vkorg: [], vtweg: [], crssku: [], vbeln: [], matnr: [] };
const uniq = (a: string[], up = true) => Array.from(new Set(a.map((x) => (up ? x.trim().toUpperCase() : x.trim())).filter(Boolean)));
const anyOf = (field: string, v: string[]) => (v.length ? (v.length === 1 ? `${field} eq ${odataString(v[0])}` : `(${v.map((x) => `${field} eq ${odataString(x)}`).join(' or ')})`) : '');

/** $filter of the Margin read: plants, sales organisation, channel, CRSSKU and invoice numbers (each list or-ed, lists and-ed) plus the period. At least one of plant, sales organisation, CRSSKU or invoice is needed. */
export function buildMarginFilter(sel: MarginSel, dateFrom: string, dateTo: string): string {
  const plants = uniq(sel.plants), vkorg = uniq(sel.vkorg), vtweg = uniq(sel.vtweg), crssku = uniq(sel.crssku), vbeln = uniq(sel.vbeln), matnr = uniq((sel.matnr ?? []).map((m) => m.trim().replace(/^0+/, '')));
  if (!plants.length && !matnr.length && !vkorg.length && !crssku.length && !vbeln.length) throw new Error('Choose materials (Brand, Product, SKU), or enter a sales organisation, a CRSSKU or an invoice number.');
  if (matnr.some((x) => !/^[A-Z0-9]{1,18}$/.test(x))) throw new Error('A material number is up to 18 characters.');
  if (plants.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A plant is 4 characters.');
  if (vkorg.some((x) => !/^[A-Z0-9]{4}$/.test(x))) throw new Error('A sales organisation is 4 characters.');
  if (vtweg.some((x) => !/^[A-Z0-9]{2}$/.test(x))) throw new Error('A distribution channel is 2 characters.');
  if (vbeln.some((x) => !/^\d{1,10}$/.test(x))) throw new Error('An invoice number is up to 10 digits.');
  if (!DAY.test(dateFrom) || !DAY.test(dateTo)) throw new Error('Enter both dates.');
  if (dateFrom > dateTo) throw new Error('The "from" date is after the "to" date.');
  const parts = [anyOf(MF.Matnr, matnr), anyOf(F.Werks, plants), anyOf(MF.Vkorg, vkorg), anyOf(MF.Vtweg, vtweg), anyOf(MF.Crssku, crssku), anyOf(MF.Vbeln, vbeln), `DateFrom eq ${odataDate(dateFrom)}`, `${F.DateTo} eq ${odataDate(dateTo)}`];
  return parts.filter(Boolean).join(' and ');
}

export const fetchMargin = (sel: MarginSel, dateFrom: string, dateTo: string, signal?: AbortSignal): Promise<Read<MarginRow>> =>
  readSet<MarginRow>(DASH_MARGIN_SET, DASH_MARGIN_FIELDS, NONE, buildMarginFilter(sel, dateFrom, dateTo), signal);

/** $filter of the cost drill-down of ONE material: its number plus the selection of the Margin report (plant, sales org, channel, invoice) and the period. */
export function buildCdrillFilter(matnr: string, sel: MarginSel, dateFrom: string, dateTo: string): string {
  const m = matnr.trim().replace(/^0+/, '');
  if (!/^\d{1,18}$/.test(m)) throw new Error('A material number is needed.');
  const plants = uniq(sel.plants), vkorg = uniq(sel.vkorg), vtweg = uniq(sel.vtweg), vbeln = uniq(sel.vbeln);
  if (!DAY.test(dateFrom) || !DAY.test(dateTo)) throw new Error('Enter both dates.');
  const parts = [`Matnr eq ${odataString(m)}`, anyOf(F.Werks, plants), anyOf(MF.Vkorg, vkorg), anyOf(MF.Vtweg, vtweg), anyOf(MF.Vbeln, vbeln), `DateFrom eq ${odataDate(dateFrom)}`, `${F.DateTo} eq ${odataDate(dateTo)}`];
  return parts.filter(Boolean).join(' and ');
}
export const fetchCdrill = (matnr: string, sel: MarginSel, dateFrom: string, dateTo: string, signal?: AbortSignal): Promise<Read<CdrillRow>> =>
  readSet<CdrillRow>(DASH_CDRILL_SET, DASH_CDRILL_FIELDS, NONE, buildCdrillFilter(matnr, sel, dateFrom, dateTo), signal);
