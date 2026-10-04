import { COST_LINE, RATE_OPTION, type CostLine, type RateOption } from '@/lib/sap/fields';
import { normValue } from '@/lib/sap/normalize';

/** A CostLine with every field at its empty value, plus overrides. */
export function line(p: Partial<CostLine> = {}): CostLine {
  const base: Record<string, unknown> = {};
  for (const [k, [, kind]] of Object.entries(COST_LINE)) base[k] = normValue(kind, undefined);
  return { ...(base as unknown as CostLine), Land1: 'IN', Landx: 'India', Hwerks: '1000', Werks: '1000', Headmat: 'FG1', Headtxt: 'Head', LocCurr: 'INR', Meins: 'PC', RateOptions: [], ...p };
}

export function opt(p: Partial<RateOption> = {}): RateOption {
  const base: Record<string, unknown> = {};
  for (const [k, [, kind]] of Object.entries(RATE_OPTION)) base[k] = normValue(kind, undefined);
  return { ...(base as unknown as RateOption), Plant: '1000', Curr: 'INR', LocCurr: 'INR', ...p };
}

/** A leaf with consistent SAP-style figures: total = (rate + freight) x qty. */
export function leaf(seq: number, level: number, comp: string, rate: string, frt: string, qty: string, extra: Partial<CostLine> = {}): CostLine {
  const r = Number(rate), f = Number(frt), q = Number(qty);
  return line({
    Seqnr: seq, Level: level, Idnrk: comp, Maktx: comp, HasChild: '', SelSource: Number(rate) ? 'INFOREC' : '', SelCurr: 'INR',
    ProdQty: qty, SelRatePc: rate, SelRatePcInr: rate, SelRatePcLoc: rate, FrtPcInr: frt, FrtPcLoc: frt, FrtCurr: f ? 'INR' : '',
    TotCostPcInr: String(r + f), TotCostInr: (Math.round((r + f) * q * 100) / 100).toFixed(2), TotCostLoc: (Math.round((r + f) * q * 100) / 100).toFixed(2),
    ...extra,
  });
}

export function parent(seq: number, level: number, comp: string, total: string, extra: Partial<CostLine> = {}): CostLine {
  return line({ Seqnr: seq, Level: level, Idnrk: comp, Maktx: comp, HasChild: 'X', ProdQty: '1', TotCostInr: total, TotCostLoc: total, ...extra });
}
