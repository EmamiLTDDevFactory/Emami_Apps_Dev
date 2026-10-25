import { fmt2, fmtPct } from './format';
import { GUARDRAILS, type Kpis, type WaterfallStep } from './kpis';

/**
 * The Pricing KPI report in words: every KPI with its value, what it means, how it is calculated, the target and a
 * status, grouped in sections. One definition feeds the screen (PricingKpis) and the Excel report (kpiReportWorkbook),
 * so both always say the same thing.
 */

export type KpiStatus = 'ok' | 'watch' | 'bad' | 'info';
export type SectionId = 'pipeline' | 'profit' | 'risk';

export interface KpiItem {
  id: string;
  section: SectionId;
  label: string;
  /** display value */
  value: string;
  /** number for Excel (null when the KPI is a list or a count text) */
  raw: number | null;
  unit: string;
  /** one line under the value */
  sub: string;
  meaning: string;
  formula: string;
  target: string;
  status: KpiStatus;
  statusText: string;
}

export const SECTIONS: Record<SectionId, { title: string; hint: string }> = {
  pipeline: { title: 'Pipeline', hint: 'Where the price points stand: waiting for approval, waiting for their SAP condition, and how much of the range has a cascade.' },
  profit: { title: 'Profitability', hint: 'Where the consumer price goes. Shares are % of RRP excl. VAT (the price the trade and the company split); simple averages, no volumes.' },
  risk: { title: 'Risks', hint: 'What needs attention: price points outside the guardrails, big price gaps between markets, and big changes against the previous version.' },
};

export const STATUS_LABEL: Record<KpiStatus, string> = { ok: 'On target', watch: 'Watch', bad: 'Off target', info: 'For information' };

const G = GUARDRAILS;

export function kpiItems(k: Kpis): KpiItem[] {
  const realBad = k.realisationPct < G.realisationMin;
  const apBad = k.apPct > G.apMax;
  const retailOff = k.retailPct < G.retailMin || k.retailPct > G.retailMax;
  const distOff = k.distOnPttPct < G.distMin || k.distOnPttPct > G.distMax;
  const noStatus = Math.max(0, k.points - k.red - k.green);
  return [
    {
      id: 'points', section: 'pipeline', label: 'Price points in review', value: String(k.points), raw: k.points, unit: 'rows',
      sub: `${k.skus} SKU(s) · ${k.markets} market(s)`, meaning: 'Price points (customer x material x version) currently in Review / Approval.',
      formula: 'Count of rows in Review / Approval', target: '—', status: 'info', statusText: STATUS_LABEL.info,
    },
    {
      id: 'awaiting', section: 'pipeline', label: 'Awaiting approval', value: String(k.red), raw: k.red, unit: 'rows',
      sub: `${k.green} already approved${noStatus ? ` · ${noStatus} with no status from SAP` : ''}`, meaning: 'Red rows: sent for approval and not approved yet, or rejected. Rows SAP sends without a status light are counted apart.',
      formula: 'Rows with a red status light', target: '0 waiting',
      status: k.red || noStatus ? 'watch' : 'ok', statusText: k.red ? `${k.red} to approve or reject` : noStatus ? `${noStatus} without a status` : 'Nothing waiting',
    },
    {
      id: 'pending', section: 'pipeline', label: 'Condition pending', value: String(k.conditionPending), raw: k.conditionPending, unit: 'rows',
      sub: 'approved, SAP condition not created yet', meaning: 'Approved price points whose condition records are not in SAP yet: customers are still billed at the old price.',
      formula: 'Rows in Condition Creation', target: '0 pending', status: k.conditionPending ? 'watch' : 'ok', statusText: k.conditionPending ? 'Create the conditions' : 'Nothing pending',
    },
    {
      id: 'coverage', section: 'pipeline', label: 'Cascade coverage', value: fmtPct(k.coveragePct), raw: round(k.coveragePct), unit: '%',
      sub: `${k.mapped.toLocaleString('en-IN')} of ${k.materials.toLocaleString('en-IN')} materials mapped`, meaning: 'Share of the cascade materials that have a cascade description, so they can be priced through the cascade.',
      formula: 'Materials with a cascade description ÷ all cascade materials', target: '100%', status: k.coveragePct >= 100 ? 'ok' : 'watch', statusText: k.coveragePct >= 100 ? 'All mapped' : `${(k.materials - k.mapped).toLocaleString('en-IN')} without a description`,
    },
    {
      id: 'expiring', section: 'pipeline', label: `Expiring in ${G.expiryDays} days`, value: String(k.expiringSoon), raw: k.expiringSoon, unit: 'rows',
      sub: 'validity ends soon', meaning: `Price points whose Valid To date falls within the next ${G.expiryDays} days: a new version is needed before then.`,
      formula: `Rows with Valid To between today and today + ${G.expiryDays} days`, target: '0', status: k.expiringSoon ? 'watch' : 'ok', statusText: k.expiringSoon ? 'Renew before expiry' : 'None expiring',
    },
    {
      id: 'realisation', section: 'profit', label: 'Net realisation', value: fmtPct(k.realisationPct), raw: round(k.realisationPct), unit: '% of RRP excl. VAT',
      sub: 'what the company keeps of the consumer price', meaning: 'The billing price after A&P (what Emami bills, net), as a share of the consumer price excl. VAT. Higher is better.',
      formula: 'Billing price after A&P (CIF, in local currency) ÷ RRP excl. VAT', target: `≥ ${G.realisationMin}%`, status: realBad ? 'bad' : 'ok', statusText: realBad ? `Below ${G.realisationMin}%` : `At or above ${G.realisationMin}%`,
    },
    {
      id: 'channel', section: 'profit', label: 'Channel margin', value: fmtPct(k.channelPct), raw: round(k.channelPct), unit: '% of RRP excl. VAT',
      sub: `retailer ${fmtPct(k.retailPct)} of RRP · distributor ${fmtPct(k.distOnPttPct)} of PTT`, meaning: 'What the retailer and the distributor keep together.',
      formula: '(Retailer margin + distributor margin) ÷ RRP excl. VAT', target: `retailer ${G.retailMin}-${G.retailMax}% · distributor ${G.distMin}-${G.distMax}% of PTT`,
      status: retailOff || distOff ? 'watch' : 'ok', statusText: retailOff && distOff ? 'Retailer and distributor out of range' : retailOff ? 'Retailer out of range' : distOff ? 'Distributor out of range' : 'Both in range',
    },
    {
      id: 'ap', section: 'profit', label: 'A&P investment', value: fmtPct(k.apPct), raw: round(k.apPct), unit: '% of RRP excl. VAT',
      sub: 'trade A&P + A&P on the billing price', meaning: 'Advertising and promotion given away in the price: A&P on PTT plus A&P deducted from the CIF billing price.',
      formula: '(A&P on PTT + A&P on CIF in local currency) ÷ RRP excl. VAT', target: `≤ ${G.apMax}%`, status: apBad ? 'bad' : 'ok', statusText: apBad ? `Above ${G.apMax}%` : `At or below ${G.apMax}%`,
    },
    {
      id: 'landing', section: 'profit', label: 'Landing cost on CIF', value: fmtPct(k.landingOnCifPct), raw: round(k.landingOnCifPct), unit: '% of CIF',
      sub: 'import duty + C&F + LC charge', meaning: 'What it costs to land the goods in the market, on top of the CIF price.',
      formula: '(Custom duty + C&F + LC charge) ÷ CIF in local currency', target: '—', status: 'info', statusText: STATUS_LABEL.info,
    },
    {
      id: 'perdz', section: 'profit', label: 'Net price per dozen', value: k.netPerDz.map((x) => `${fmt2(x.value)} ${x.currency}`).join(' · ') || '—', raw: k.netPerDz.length === 1 ? round(k.netPerDz[0].value) : null, unit: 'billing currency',
      sub: 'average billing after A&P x 12', meaning: 'The average net billing price for 12 pieces, per billing currency.',
      formula: 'Average of (billing price after A&P x 12)', target: '—', status: 'info', statusText: STATUS_LABEL.info,
    },
    {
      id: 'exceptions', section: 'risk', label: 'Guardrail exceptions', value: String(k.exceptions.length), raw: k.exceptions.length, unit: 'rows',
      sub: 'margins, realisation or A&P out of range', meaning: 'Price points where at least one guardrail is broken (listed below with the reason).',
      formula: `Retailer ${G.retailMin}-${G.retailMax}% · distributor ${G.distMin}-${G.distMax}% of PTT · realisation ≥ ${G.realisationMin}% · A&P ≤ ${G.apMax}%`, target: '0', status: k.exceptions.length ? 'bad' : 'ok', statusText: k.exceptions.length ? 'Review the list below' : 'All within the guardrails',
    },
    {
      id: 'corridor', section: 'risk', label: 'Price corridor breaches', value: String(k.corridorBreaches), raw: k.corridorBreaches, unit: 'SKUs',
      sub: `SKUs with > ${G.corridorMax}% spread across markets`, meaning: 'The same SKU billed at very different net prices in different markets invites parallel trade.',
      formula: '(Highest − lowest net billing price across markets) ÷ lowest, per SKU and billing currency', target: `≤ ${G.corridorMax}% spread`, status: k.corridorBreaches ? 'watch' : 'ok', statusText: k.corridorBreaches ? 'Check the corridor table' : 'No breach',
    },
    {
      id: 'change', section: 'risk', label: 'Change vs previous version', value: k.changes.length ? `${k.avgBillingChangePct > 0 ? '+' : ''}${fmtPct(k.avgBillingChangePct)}` : '—', raw: k.changes.length ? round(k.avgBillingChangePct) : null, unit: '% net billing',
      sub: `${k.increases} up · ${k.decreases} down`, meaning: 'Average change of the net billing price against the previous version of the same price point.',
      formula: '(New billing after A&P − previous) ÷ previous, averaged', target: '—', status: k.changes.length && k.avgBillingChangePct < 0 ? 'watch' : 'info', statusText: !k.changes.length ? 'No earlier versions' : k.avgBillingChangePct < 0 ? 'Prices going down' : STATUS_LABEL.info,
    },
  ];
}

const round = (x: number) => Math.round(x * 100) / 100;

export const STEP_MEANING: Record<string, string> = {
  'Retailer margin': 'What the retailer keeps (RRP excl. VAT − PTT).',
  'Distributor margin': 'What the distributor keeps, between PTT and the landed cost.',
  'A&P (trade + CIF)': 'Advertising and promotion given in the price, at trade level and on the billing price.',
  'Damage / expiry': 'Allowance for damaged and expired stock.',
  'Duty, C&F, LC charge': 'Import duty, cost and freight, and the letter-of-credit charge to land the goods.',
  'Net realisation': 'What the company bills, net of A&P.',
  'Other / not explained': 'The steps do not add up to 100% of RRP excl. VAT: rounding or values SAP keeps outside these fields.',
};

/** The waterfall with an "Other / not explained" step when the steps do not add up to 100% (more than 0.5 point off). */
export function waterfallWithRest(steps: WaterfallStep[]): WaterfallStep[] {
  const sum = steps.reduce((a, s) => a + s.pct, 0);
  const rest = 100 - sum;
  return Math.abs(rest) > 0.5 ? [...steps.slice(0, -1), { label: 'Other / not explained', pct: rest, kind: 'landing' }, steps[steps.length - 1]] : steps;
}

/** "Of every 100 AED of RRP excl. VAT ..." when the selection has one local currency. */
export function waterfallSentence(steps: WaterfallStep[], currencies: string[]): string {
  const cur = currencies.length === 1 ? ` ${currencies[0]}` : '';
  const net = steps.find((s) => s.kind === 'net');
  const trade = steps.filter((s) => s.kind === 'trade').reduce((a, s) => a + s.pct, 0);
  const inv = steps.filter((s) => s.kind === 'investment').reduce((a, s) => a + s.pct, 0);
  return `Of every 100${cur} the consumer pays (excl. VAT), the trade keeps about ${fmt2(trade)}${cur}, A&P and damage take ${fmt2(inv)}${cur}, and the company realises ${fmt2(net?.pct ?? 0)}${cur}.`;
}

/* ---------- Excel ---------- */

export interface ReportContext { system: string; market: string; loadedAt: string; points: number }

type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][]; widths: number[] };

/** The report as sheets (rows of cells); kpiReportWorkbook writes them. Pure, so it is tested without SheetJS. */
export function kpiReportSheets(k: Kpis, ctx: ReportContext, currencies: string[]): Sheet[] {
  const items = kpiItems(k);
  const steps = waterfallWithRest(k.waterfall);
  return [
    {
      name: 'Summary', widths: [16, 30, 16, 20, 16, 28, 60, 60],
      rows: [
        ['Cascade Pricing - KPI report'],
        [`SAP ${ctx.system} · ${ctx.market || 'All markets'} · ${ctx.points} price point(s) in Review / Approval · loaded ${ctx.loadedAt}`],
        [],
        ['Section', 'KPI', 'Value', 'Unit', 'Status', 'Target', 'What it means', 'How it is calculated'],
        ...items.map((i) => [SECTIONS[i.section].title, i.label, i.raw ?? i.value, i.unit, i.statusText, i.target, i.meaning, i.formula]),
      ],
    },
    {
      name: 'Price waterfall', widths: [26, 22, 70],
      rows: [[waterfallSentence(steps, currencies)], [], ['Step', '% of RRP excl. VAT', 'What it is'], ...steps.map((s) => [s.label, round(s.pct), STEP_MEANING[s.label] ?? '']), ['Total', round(steps.reduce((a, s) => a + s.pct, 0)), '']],
    },
    {
      name: 'By selling country', widths: [16, 12, 10, 22, 22, 22, 22, 26],
      rows: [['Selling country', 'Currency', 'Price points', 'Net realisation % RRP', 'Channel margin % RRP', 'Landing cost % CIF', 'Net billing / pc', 'Realisation status'],
        ...k.byMarket.map((m) => [m.country, m.currency, m.points, round(m.realisationPct), round(m.channelPct), round(m.landingOnCifPct), round(m.netBilling), m.realisationPct < G.realisationMin ? `Below ${G.realisationMin}%` : 'On target'])],
    },
    {
      name: 'Price corridor', widths: [14, 40, 10, 12, 14, 14, 14, 14, 12, 16],
      rows: [['Material', 'Description', 'Markets', 'Currency', 'Lowest', 'Lowest in', 'Highest', 'Highest in', 'Spread %', 'Status'],
        ...k.corridor.map((c) => [short(c.matnr), c.maktx, c.markets, c.currency, round(c.min), c.minMarket, round(c.max), c.maxMarket, round(c.spreadPct), c.spreadPct > G.corridorMax ? `Above ${G.corridorMax}%` : 'Within corridor'])],
    },
    {
      name: 'Guardrail exceptions', widths: [12, 14, 40, 10, 80],
      rows: [['Market', 'Material', 'Description', 'Version', 'Why (value and the guardrail)'], ...k.exceptions.map((x) => [String(x.row.S_LAND1 ?? ''), short(x.row.MATNR), String(x.row.MAKTX ?? ''), String(x.row.ZVERSION ?? '').trim() || '01', x.reasons.join('; ')])],
    },
    {
      name: 'Changes vs previous', widths: [12, 14, 40, 14, 18, 16, 14],
      rows: [['Market', 'Material', 'Description', 'Version', 'Net billing change %', 'RRP incl VAT change %', 'Valid from'],
        ...k.changes.map((c) => [String(c.row.S_LAND1 ?? ''), short(c.row.MATNR), String(c.row.MAKTX ?? ''), `${String(c.prev.ZVERSION ?? '').trim() || '01'} → ${String(c.row.ZVERSION ?? '').trim() || '01'}`, round(c.billingPct), round(c.rrpPct), String(c.row.VALIDFROM ?? '')])],
    },
    {
      name: 'Notes', widths: [28, 90],
      rows: [
        ['Source', `SAP ${ctx.system}, ZMM_CASCADE_SRV_SRV: Review / Approval (ApprovalSet), Condition Creation (ConditionPendingSet), Cascade materials (CascadeMapSet), version history (COMPARE).`],
        ['Shares', 'Percentages are of RRP excl. VAT unless the column says otherwise. The CIF side is converted to local currency with the rate implied by each row.'],
        ['Averages', 'Simple averages over the price points (SAP gives no volumes).'],
        ['Guardrails', `Retailer margin ${G.retailMin}-${G.retailMax}% of RRP · distributor margin ${G.distMin}-${G.distMax}% of PTT · net realisation ≥ ${G.realisationMin}% · A&P ≤ ${G.apMax}% · price corridor ≤ ${G.corridorMax}% · expiry window ${G.expiryDays} days.`],
        ['Glossary', 'RRP: consumer price. PTT: price to trade (what the retailer pays). DLC: distributor landed cost. CIF: cost, insurance and freight = the billing price. A&P: advertising and promotion.'],
      ],
    },
  ];
}

const short = (m: unknown) => String(m ?? '').replace(/^0+/, '');

/** Writes the report as .xlsx (SheetJS loaded on demand). */
export async function kpiReportWorkbook(sheets: Sheet[], fileName: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = s.widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}
