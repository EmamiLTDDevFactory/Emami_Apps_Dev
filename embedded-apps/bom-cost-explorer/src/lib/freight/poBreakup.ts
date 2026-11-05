/**
 * PO-line breakup of the Freight analysis: EVERY posting of one PO line (goods receipts, invoices, subsequent debits / credits),
 * whatever the Basis and Latest only choices on screen. Pure logic on the rows already loaded (FreightRowSet with AllItems):
 * opening it never calls SAP. The name breakup.ts is taken (freight break-up of a cost line by condition type).
 *
 * Quantity and amount follow poLines (lib/freight/analysis.ts postingFigures): INR = document amount x FxInr (1 when missing), an amount
 * counts only together with a positive quantity, a credit posting keeps its quantity. Subtotal rate = sum of amounts / sum of quantities
 * (never an average of the row rates).
 */
import { D, ZERO, type Decimal } from '../cost/decimal';
import type { FreightRow } from '../sap/fields';
import type { XCol } from '../client/export';
import { drCr, postingFigures, postingTypeText, type Side } from './analysis';

const tx = (v: string | null | undefined) => String(v ?? '').trim();
const day = (v: string | null | undefined) => String(v ?? '').slice(0, 10);
const n = (v: Decimal | null, dp: number): number | null => (v ? Number(v.toFixed(dp)) : null);

export interface PoLineKey { plant: string; material: string; po: string; line: string; cond?: string }

export interface BreakupItem {
  key: string;
  side: Side;
  typeText: string;
  postingDate: string;
  document: string;
  fiscalYear: string;
  item: string;
  drCr: string;
  qty: Decimal;
  amount: Decimal;
  /** INR per unit; null when the quantity is 0 */
  rate: Decimal | null;
  isMaxDate: boolean;
  vendor: string;
  vendorName: string;
  transporter: string;
  reference: string;
}
export interface Subtotal { qty: Decimal; amount: Decimal; /** sum amount / sum quantity; null when the quantity is 0 */ rate: Decimal | null; count: number }
export interface PoLineBreakup {
  key: PoLineKey;
  unit: string;
  items: BreakupItem[];
  actual: Subtotal;
  standard: Subtotal;
  /** actual rate - standard rate, INR per unit; null when either rate is missing */
  variance: Decimal | null;
  /** variance / standard rate x 100; null when the standard rate is 0 or missing */
  variancePct: Decimal | null;
}

const sub = (items: BreakupItem[]): Subtotal => {
  const qty = items.reduce((a, i) => a.plus(i.qty), ZERO);
  // the subtotal of a side is the ABSOLUTE of its net (S minus H), the same figure as on the PO line
  const amount = items.reduce((a, i) => a.plus(i.amount), ZERO).abs();
  return { qty, amount, rate: qty.gt(0) ? amount.div(qty) : null, count: items.length };
};

/** Every posting of the PO line, actual side first, then posting date newest first, then document. EXCLUDED lines are not shown (as in the PO view). */
export function poLineBreakup(rows: FreightRow[], key: PoLineKey): PoLineBreakup {
  const items: BreakupItem[] = [];
  let unit = '';
  rows.forEach((r, i) => {
    if (String(r.UsedSrc ?? '').trim().toUpperCase() === 'EXCLUDED') return;
    if (tx(r.Plant) !== tx(key.plant) || tx(r.Material) !== tx(key.material) || tx(r.Purchasedocument) !== tx(key.po) || tx(r.Purchaseline) !== tx(key.line)) return;
    if (key.cond !== undefined && tx(r.Conditiontype) !== tx(key.cond)) return;
    const f = postingFigures(r);
    unit = unit || r.Baseunit || r.Matuom || '';
    items.push({
      key: `${i}`, side: f.side, typeText: postingTypeText(r.Vgabe), postingDate: day(r.Cpudt), document: tx(r.Belnr), fiscalYear: tx(r.Gjahr), item: tx(r.Buzei),
      drCr: drCr(r.Shkzg), qty: f.qty, amount: f.amount, rate: f.qty.gt(0) ? f.amount.div(f.qty) : null, isMaxDate: !!r.IsMaxDate,
      vendor: tx(r.Lifnr), vendorName: tx(r.Name1), transporter: tx(r.Ztmode), reference: tx(r.Xblnr),
    });
  });
  items.sort((a, b) => Number(b.side === 'actual') - Number(a.side === 'actual') || b.postingDate.localeCompare(a.postingDate) || a.document.localeCompare(b.document));
  const actual = sub(items.filter((i) => i.side === 'actual'));
  const standard = sub(items.filter((i) => i.side === 'standard'));
  const variance = actual.rate && standard.rate ? actual.rate.minus(standard.rate) : null;
  return { key, unit, items, actual, standard, variance, variancePct: variance && standard.rate && !standard.rate.isZero() ? variance.div(standard.rate).times(100) : null };
}

/** Rows of the Excel / CSV export: every posting, then the Actual total, Standard total and Variance rows. */
export function breakupSheet(b: PoLineBreakup): { cols: XCol[]; count: number } {
  type Line = { side: string; type: string; date: string; doc: string; fy: string; item: string; dc: string; qty: Decimal | null; amount: Decimal | null; rate: Decimal | null; max: string; vendor: string; transporter: string; reference: string };
  const lines: Line[] = b.items.map((i) => ({
    side: i.side === 'actual' ? 'Actual' : 'Standard', type: i.typeText, date: i.postingDate, doc: i.document, fy: i.fiscalYear, item: i.item, dc: i.drCr, qty: i.qty, amount: i.amount, rate: i.rate,
    max: i.isMaxDate ? 'yes' : 'no', vendor: `${i.vendor} ${i.vendorName}`.trim(), transporter: i.transporter, reference: i.reference,
  }));
  const total = (label: string, s: Subtotal): Line => ({ side: label, type: '', date: '', doc: '', fy: '', item: '', dc: '', qty: s.qty, amount: s.amount, rate: s.rate, max: '', vendor: '', transporter: '', reference: '' });
  lines.push(total('Actual total', b.actual), total('Standard total', b.standard), { ...total('Variance (INR / unit)', { qty: ZERO, amount: ZERO, rate: b.variance, count: 0 }), qty: null, amount: null, type: b.variancePct ? `${b.variancePct.toFixed(2)} %` : '' });
  return {
    count: lines.length,
    cols: [
      { header: 'Side', width: 20, get: (i) => lines[i].side },
      { header: 'Posting type', width: 24, get: (i) => lines[i].type },
      { header: 'Posting date', width: 12, get: (i) => lines[i].date },
      { header: 'Document', width: 16, get: (i) => lines[i].doc },
      { header: 'Fiscal year', width: 8, get: (i) => lines[i].fy },
      { header: 'Item', width: 6, get: (i) => lines[i].item },
      { header: 'Dr / Cr', width: 8, get: (i) => lines[i].dc },
      { header: 'Quantity', dp: 3, width: 14, get: (i) => n(lines[i].qty, 3) },
      { header: 'Amount (INR)', dp: 2, curr: 'INR', width: 16, get: (i) => n(lines[i].amount, 2) },
      { header: 'Freight per unit (INR)', dp: 4, curr: 'INR', width: 18, get: (i) => n(lines[i].rate, 6) },
      { header: 'Max date', width: 9, get: (i) => lines[i].max },
      { header: 'Vendor', width: 30, get: (i) => lines[i].vendor },
      { header: 'Transporter', width: 12, get: (i) => lines[i].transporter },
      { header: 'Reference', width: 16, get: (i) => lines[i].reference },
    ],
  };
}
