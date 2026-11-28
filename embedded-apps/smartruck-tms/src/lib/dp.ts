// Typed entry point for the Distribution Planning module. The planner itself is Sanjoy Paul's dp_engine.js, used UNCHANGED
// (dpEngine.js here, and a byte-identical copy at backend/tmsDpEngine.js); dpModel.js is the DOM-free session logic ported from his page.
import DPE from './dpEngine.js';
import DPX from './dpXlsx.js';
import { createSession } from './dpModel.js';

import { LEG as _LEG, LEGS as _LEGS, TIER as _TIER, SETTINGS_FIELDS as _SF } from './dpModel.js';
import { parseForecast as _parseForecast, applyForecast as _applyForecast } from './dpForecast.js';
export { ST_HEAD, dShort, addDays } from './dpModel.js';
export { parseCsvText, channelName } from './dpForecast.js';
export { diffDatasets, diffPlans, diffSheets } from './dpDiff.js';

/* The dataset shape is documented in docs/DISTRIBUTION_PLANNING.md. Rows are positional arrays, so the typing stays loose on purpose. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DpSite { code: string; name: string; zone: string; type: string; mwh: string; lat?: number; lon?: number }
export interface DpMat { code: string; desc: string; div: 'CCD' | 'HCD' | string; key: string; cp: number; cw: number; brand: string; rate: number; ukey?: string }
export interface DpDataset { meta: Record<string, any> & { today: string }; mats: DpMat[]; sites: DpSite[]; fold?: Record<string, string>; [table: string]: any }
export interface DpSheet { name: string; head?: string[]; rows: any[][]; widths?: number[]; style?: number[]; freeze?: { row: number; col: number }; filter?: string | false; stockSrc?: string; meta?: { hdr: number; cD0: number; dcols: number[]; list: number[]; leg: number; src: number } }
export interface DpExport { name: string; sheets: DpSheet[] }
/** The session is the JS model object (dpModel.js createSession); typed loosely because its plan / line records are the engine's own shapes. */
export type DpSession = any;
export const LEG = _LEG as Record<1 | 2 | 3, string>, LEGS = _LEGS as Record<1 | 2 | 3, string>, TIER = _TIER as Record<0 | 1 | 2 | 3, string>;
export const SETTINGS_FIELDS = _SF as unknown as [string, string][];
export interface ForecastParsed { rows: { material: string; plant: string; channel: string; m0: number; m1: number; additional: number }[]; format: string; skipped: number; warnings: string[]; header: unknown[] }
export const parseForecast = _parseForecast as unknown as (rows: unknown[][]) => ForecastParsed;
export const applyForecast = _applyForecast as unknown as (D: DpDataset, rows: ForecastParsed['rows']) => { D: DpDataset; missing: { materials: string[]; plants: string[] } };

export const engine: any = DPE;
export const xlsx: { readXlsx: (buf: ArrayBuffer) => Promise<{ sheets: { name: string; rows: any[][] }[] }>; writeXlsx: (sheets: DpSheet[]) => Blob } = DPX as never;
export const newSession = (D: DpDataset): DpSession => createSession(D, DPE) as DpSession;

/** Save a workbook produced by a *Export() helper. */
export function downloadExport(x: DpExport) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(xlsx.writeXlsx(x.sheets)); a.download = x.name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
