/**
 * Fact builders for the data-quality agent (draft fix requests for the data owners) and the costing explainer (what could make a breakup differ from CK13N).
 * The findings come from deterministic checks (lib/cost/analytics.ts dataQuality, the routing / activity data); the AI only words the requests.
 */
import Decimal from 'decimal.js';
import { FactBook } from '../facts';
import { listTemplate, type NarrateSpec } from '../narrate';
import { DQ_LABEL, type DqIssue, type DqKind } from '../../cost/analytics';
import { D } from '../../cost/decimal';
import type { CostLine } from '../../sap/fields';
import type { FgBreakup } from '../../costbreakup/breakup';

const OWNER: Record<DqKind, string> = { NO_RATE: 'procurement (rates / contracts / info records)', UOM: 'master data (unit conversions)', ZERO_FX: 'finance (exchange rates)', DONOR: 'planning / costing (donor plant rates)', OPTIONS: 'the SAP costing team' };

export function dqSpec(issues: DqIssue[], rows: CostLine[]): NarrateSpec {
  const b = new FactBook(); const s = 'dq';
  const byKind = new Map<DqKind, DqIssue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  b.add('Findings in total', issues.length, { unit: 'count', source: `${s}.total` });
  const lines: string[] = [];
  for (const [k, list] of byKind) {
    b.add(`${DQ_LABEL[k]}: findings (owner: ${OWNER[k]})`, list.length, { unit: 'count', source: `${s}.${k}` });
    const plants = new Set(list.map((x) => rows[x.i]?.Hwerks).filter(Boolean));
    b.add(`${DQ_LABEL[k]}: plants affected`, plants.size, { unit: 'count', source: `${s}.${k}.plants` });
    const heads = new Set(list.map((x) => rows[x.i]?.Headmat).filter(Boolean));
    b.add(`${DQ_LABEL[k]}: finished goods affected`, heads.size, { unit: 'count', source: `${s}.${k}.fgs` });
    const big = [...list].sort((x, y) => D(rows[y.i]?.TotCostInr).abs().cmp(D(rows[x.i]?.TotCostInr).abs())).slice(0, 5);
    lines.push(`${DQ_LABEL[k]} (${OWNER[k]}), largest by cost: ${big.map((x) => `${rows[x.i]?.Idnrk} ${rows[x.i]?.Maktx ?? ''} in ${rows[x.i]?.Hwerks}`).join('; ')}`);
  }
  return {
    feature: 'dataquality', title: 'Data quality: draft fix requests', facts: b,
    task: `Draft one short fix request per data owner for these costing data-quality findings. Each request: what is wrong, how many (use the facts), and the examples below (codes are data, copy them as written, do not invent any).\nExamples:\n${lines.join('\n')}\nThese are drafts for a person to send; you cannot send or change anything. Put each request as its own paragraph beginning with the owner's name.`,
    ignore: Array.from(new Set(issues.slice(0, 200).flatMap((i) => [rows[i.i]?.Idnrk, rows[i.i]?.Headmat, rows[i.i]?.Hwerks].filter(Boolean) as string[]))),
    template: () => listTemplate('Data-quality findings (no AI text):', b.list(), 20),
  };
}

export function costingSpec(o: { fgs: FgBreakup[]; lines: Array<{ SelSource: string; SelRatePcInr: string }>; periodText: string; auto: boolean; actStatus: string }): NarrateSpec {
  const b = new FactBook(); const s = 'costing';
  const leaf = o.lines.length;
  b.add('Finished goods in the breakup', o.fgs.length, { unit: 'count', source: `${s}.fgs` });
  b.add('Component lines costed', leaf, { unit: 'count', source: `${s}.lines` });
  b.add('Component lines with no rate', o.lines.filter((l) => !l.SelSource).length, { unit: 'count', source: `${s}.noRate` });
  b.add('Component lines priced only at the moving average (MBEW, no contract, info record, market or consumption rate)', o.lines.filter((l) => l.SelSource === 'MBEW').length, { unit: 'count', source: `${s}.mbewOnly` });
  const uses = o.fgs.flatMap((f) => f.activity);
  b.add('Routings read for conversion', uses.filter((u) => u.act).length, { unit: 'count', source: `${s}.routings` });
  b.add('Materials with more than one valid routing (only the latest is used)', uses.filter((u) => u.act && u.act.otherRoutings.length > 0).length, { unit: 'count', source: `${s}.multiRouting` });
  b.add('Semi-finished components without routing activities', uses.filter((u) => !u.act).length, { unit: 'count', source: `${s}.noActivity` });
  b.add('Routings skipped because the BOM unit differs from the routing unit', uses.filter((u) => u.act && !u.unitOk).length, { unit: 'count', source: `${s}.unitSkipped` });
  const conv = o.fgs.reduce((a, f) => a.plus(f.fgQty.gt(0) ? f.conversion.inr.div(f.fgQty) : new Decimal(0)), new Decimal(0));
  if (o.fgs.length === 1) b.add('Conversion cost per piece (machine, labour, power, steam, other)', conv, { unit: 'INR/pc', source: `${s}.conversionPc`, dp: 4 });
  const nums = o.periodText.match(/\d+/g) ?? [];
  return {
    feature: 'costing', title: 'Costing breakup: what could differ from CK13N', facts: b, ignore: nums,
    task: `The cost breakup prices conversion (machine, labour, power, steam) with activity prices ${o.auto ? `of each material's latest cost estimate period` : `of period ${o.periodText}`}, material at the rates SAP selected today. List, in order of likelihood, what could make this breakup differ from the CK13N cost estimate of the same material, using the facts (price period, material rate source, routings used, routings skipped). Say which fact to check first. A CK13N estimate keeps the prices of the day it was costed.`,
    template: () => listTemplate('Costing breakup checks (no AI text):', b.list(), 12),
  };
}

/* ---------- budget rate outlook (suggestion only) ---------- */
import type { RateOutlook } from '../forecast';
export function rateOutlookSpec(o: { material: string; title: string; unit: string; currency: string; out: RateOutlook }): NarrateSpec {
  const b = new FactBook(); const s = 'rateoutlook'; const x = o.out; const u = `${o.currency || 'INR'}/${o.unit || 'unit'}`;
  b.add('Months with purchases', x.months, { unit: 'count', source: `${s}.months` });
  if (x.latest !== null) b.add('Rate of the latest month', x.latest, { unit: u, source: `${s}.latest`, dp: 3 });
  if (x.avg3 !== null) b.add('Weighted average rate, last three months', x.avg3, { unit: u, source: `${s}.avg3`, dp: 3 });
  if (x.avg6 !== null) b.add('Weighted average rate, last six months', x.avg6, { unit: u, source: `${s}.avg6`, dp: 3 });
  if (x.avg12 !== null) b.add('Weighted average rate, last twelve months', x.avg12, { unit: u, source: `${s}.avg12`, dp: 3 });
  if (x.slopePctPerMonth !== null) b.add('Trend per month in percent of the average', x.slopePctPerMonth, { unit: '%', source: `${s}.slope`, dp: 2 });
  if (x.volatilityPct !== null) b.add('Month-to-month volatility in percent of the average', x.volatilityPct, { unit: '%', source: `${s}.volatility`, dp: 1 });
  if (x.outlook !== null) { b.add('Outlook rate for the horizon ahead', x.outlook, { unit: u, source: `${s}.outlook`, dp: 3 }); b.add('Outlook range, low', x.low!, { unit: u, source: `${s}.low`, dp: 3 }); b.add('Outlook range, high', x.high!, { unit: u, source: `${s}.high`, dp: 3 }); }
  return {
    feature: 'rateoutlook', title: `Budget rate outlook: ${o.material} ${o.title}`, facts: b, ignore: [o.material],
    task: x.enough
      ? `Explain the purchase-rate outlook of ${o.material} ${o.title}: the recent level against the longer average, the trend, how volatile it is, and the outlook rate with its range. Say that this is a statistical suggestion for the budget-rate owner to review, based only on past purchases (no market view), and that ${x.reason || 'the trend move is within the cap'}.`
      : `Say that there is not enough purchase history for an outlook: ${x.reason}`,
    template: () => listTemplate('Rate outlook (no AI text):', b.list(), 12),
  };
}
