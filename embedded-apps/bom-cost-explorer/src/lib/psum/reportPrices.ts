/**
 * The price lookup of the Cost and margin report: SoPriceSet for the SKUs of the result, 50 materials per call, up to 3 calls in parallel, with the sales
 * organisation(s) (VkorgIn, required by SAP) and the optional channel / segment / document-type filters and DaysBack. The producing plant is NEVER sent as a
 * plant filter (the plant of a sales-order item is the delivering depot, not the factory). Every SAP error text becomes a message of the answer (the
 * cost columns stay); an abort (Stop) ends all calls. No call has a time limit.
 */
import { fetchSo } from '../so/service';
import { chunkCodes, SO_MAX_MATERIALS, type SoQuery } from '../so/filter';
import type { ListFilter, SoPriceRow } from '../so/types';
import type { SapMessage } from '../sap/messages';

export const REPORT_PRICE_SELECT = 'Matnr,Vkorg,Vtweg,Auart,AuartTxt,Segment,Curr,Uom,Mrp,Sp,Vbeln,Audat,DaysOld,Msg';
export const PRICE_PARALLEL = 3;
export const NEED_ORG = 'Select a sales organisation to see the last MRP and selling price';

export interface PriceFilters { vkorg: string[]; vtweg: string[]; segment: string[]; auart: ListFilter; pstyv: ListFilter; kdgrp: ListFilter; kunnr: ListFilter; days: number }
export const priceSignature = (f: PriceFilters): string => JSON.stringify([f.vkorg, f.vtweg, f.segment, f.auart, f.pstyv, f.kdgrp, f.kunnr, f.days]);

/** The SoPriceSet query of one batch: sales area and lists, DaysBack; no plants. */
export const priceQuery = (materials: string[], f: PriceFilters): SoQuery => ({ materials, vkorg: f.vkorg, vtweg: f.vtweg, segment: f.segment, auart: f.auart, pstyv: f.pstyv, kdgrp: f.kdgrp, kunnr: f.kunnr, daysBack: f.days });
export const priceBatches = (materials: string[]): string[][] => chunkCodes(Array.from(new Set(materials.map((m) => m.trim()).filter(Boolean))), SO_MAX_MATERIALS);

export async function fetchReportPrices(materials: string[], f: PriceFilters, signal?: AbortSignal): Promise<{ rows: SoPriceRow[]; messages: SapMessage[]; ms: number }> {
  const batches = priceBatches(materials);
  const rows: SoPriceRow[] = [];
  const messages: SapMessage[] = [];
  let ms = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      if (signal?.aborted) return;
      const mine = batches[next++];
      try {
        const r = await fetchSo('PRICE', priceQuery(mine, f), { signal, select: REPORT_PRICE_SELECT });
        rows.push(...r.rows); ms += r.ms;
        for (const m of r.messages) if (!messages.some((x) => x.message === m.message)) messages.push(m);
      } catch (e) {
        if (signal?.aborted || (e as Error).name === 'AbortError' || /cancel/i.test((e as Error).message)) throw e;
        const text = (e as Error).message;
        if (!messages.some((x) => x.message === text)) messages.push({ code: '', message: text, severity: 'error' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PRICE_PARALLEL, batches.length) }, worker));
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  return { rows, messages, ms };
}
