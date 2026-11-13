/**
 * Previous-year component rates for the budget analysis: zcomponent (BudCompSet, India) and zcomponent_n (BudCompNSet, the other countries, by Land1),
 * read per component plant for Gjahr - 1. Rate = Landed per Meins of the row valid longest (the last row of the year when there are several).
 * A set that errors or answers nothing is reported in the status (the workbook then leaves the prior-year columns empty), never fatal.
 */
import { fetchBudget } from '../budgetRatesApi';
import type { BudCompDom, BudCompIntl } from '../budgetRatesTypes';
import type { PlanCostLine } from './fields';
import { priorKey, type PriorRates, type PriorStatus } from './analysis';

const LIMIT = 3;

export async function fetchPriorRates(lines: PlanCostLine[], budgetYr: string, signal?: AbortSignal, onStep?: (done: number, total: number) => void): Promise<{ rates: PriorRates; status: PriorStatus }> {
  const year = String(Number(budgetYr) - 1);
  const rates: PriorRates = new Map();
  const status: PriorStatus = { year, asked: 0, found: 0, notes: [] };
  const leaves = lines.filter((l) => !l.HasChild?.trim());
  // one request per component plant (India) or plant + country (zcomponent_n)
  const asks = new Map<string, { werks: string; land1: string }>();
  for (const l of leaves) { if (!l.Werks) continue; const intl = l.Land1 && l.Land1 !== 'IN'; asks.set(`${l.Werks}|${intl ? l.Land1 : 'IN'}`, { werks: l.Werks, land1: intl ? l.Land1 : 'IN' }); }
  const wanted = new Set(leaves.map((l) => priorKey(l.Land1, l.Werks, l.Idnrk)));
  status.asked = wanted.size;
  const list = [...asks.values()];
  let next = 0; let done = 0;
  const worker = async () => {
    while (next < list.length && !signal?.aborted) {
      const a = list[next++];
      try {
        const r = await fetchBudget({ tableType: a.land1 === 'IN' ? 'DOM' : 'INTL', gjahr: year, werks: [a.werks], matnr: [], land1: a.land1 === 'IN' ? [] : [a.land1 as 'LK'] }, { signal });
        const rows = r.rows as (BudCompDom | BudCompIntl)[];
        // last row of the year wins when a component has several validity periods
        for (const row of [...rows].sort((x, y) => String(x.ValidFrom).localeCompare(String(y.ValidFrom)))) {
          const k = priorKey(a.land1, a.werks, row.Matnr);
          if (!wanted.has(k)) continue;
          const curr = String(row.Waers || (a.land1 === 'IN' ? 'INR' : ''));
          const rate = Number(row.Landed) || 0;
          if (!rate) continue;
          rates.set(k, { rate, curr, inr: curr === 'INR' ? rate : null });
        }
      } catch (e) {
        if (signal?.aborted) return;
        status.notes.push(`${a.land1 === 'IN' ? 'ZCOMPONENT' : 'ZCOMPONENT_N'} ${year} plant ${a.werks}${a.land1 === 'IN' ? '' : ' ' + a.land1}: ${(e as Error).message}`);
      }
      onStep?.(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(LIMIT, list.length || 1) }, worker));
  status.found = [...wanted].filter((k) => rates.has(k)).length;
  if (!status.found && !status.notes.length) status.notes.push(`ZCOMPONENT / ZCOMPONENT_N answered no ${year} rate for any component of this plan.`);
  return { rates, status };
}

/** Converts foreign-currency prior rates to INR with the line's own exchange rate (INR per local unit), per component. */
export function priorWithFx(lines: PlanCostLine[], rates: PriorRates, fxOf: (l: PlanCostLine) => number | null): PriorRates {
  const out: PriorRates = new Map(rates);
  for (const l of lines) {
    if (l.HasChild?.trim()) continue;
    const k = priorKey(l.Land1, l.Werks, l.Idnrk);
    const r = out.get(k);
    if (!r || r.inr !== null) continue;
    const fx = fxOf(l);
    out.set(k, { ...r, inr: fx ? r.rate * fx : null });
  }
  return out;
}
