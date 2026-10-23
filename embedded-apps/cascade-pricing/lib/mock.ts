/**
 * In-memory stand-in for the ZMM_CASCADE_PRICING service while it is not available (NEXT_PUBLIC_CASCADE_MOCK).
 * Same contract as GET /cascade/{set} and POST /action, same workflow:
 *   simulation -> Send for Approval (red, pending) -> Approve (green) -> Condition Creation -> condition created.
 * Reject turns a row red again, Delete removes it, Approve Simulation approves straight from the simulation.
 * Customer names are fictional; materials are Emami export SKUs. Nothing is persisted: a reload starts again.
 */
import { RATE_COLUMNS } from './columns';
import { buildCascade, ratesFromRateRow, type CascadeRates } from './cascade';
import { DATED_ACTIONS, priceKey, rowKey, type ActionRequest, type ActionResult, type CascadeSet, type Row } from './types';

export class MockError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type State = 'P' | 'R' | 'A' | 'C'; // pending, rejected, approved (condition pending), condition created
const LIGHT: Record<State, string> = { P: '1', R: '1', A: '3', C: '3' };

interface Market {
  sLand: string; dLand: string; vkorg: string; kunnr: string; name: string; werks: string;
  curr: string; fx: number; step: number;
  vat: number; retail: number; apPtt: number; dmg: number; dist: number; duty: number; cf: number; lc: number; dax: number; ap: number;
}
const MARKETS: Market[] = [
  { sLand: 'AE', dLand: 'AE', vkorg: '5100', kunnr: '0000510012', name: 'Al Noor Trading LLC', werks: '5101', curr: 'AED', fx: 3.6725, step: 0.25, vat: 5, retail: 25, apPtt: 3, dmg: 1, dist: 12, duty: 5, cf: 4, lc: 0.5, dax: 1, ap: 4 },
  { sLand: 'SA', dLand: 'SA', vkorg: '5100', kunnr: '0000510045', name: 'Riyadh Consumer Goods Co.', werks: '5101', curr: 'SAR', fx: 3.75, step: 0.25, vat: 15, retail: 25, apPtt: 3, dmg: 1, dist: 12, duty: 5, cf: 5, lc: 0.5, dax: 1, ap: 4 },
  { sLand: 'OM', dLand: 'AE', vkorg: '5100', kunnr: '0000510077', name: 'Gulf Bridge Distribution LLC', werks: '5101', curr: 'OMR', fx: 0.3845, step: 0.05, vat: 5, retail: 24, apPtt: 3, dmg: 1, dist: 13, duty: 5, cf: 6, lc: 0.5, dax: 1, ap: 4 },
  { sLand: 'BD', dLand: 'BD', vkorg: '1100', kunnr: '0000110231', name: 'Dhaka Consumer Distribution Ltd', werks: '1101', curr: 'BDT', fx: 121.5, step: 5, vat: 15, retail: 20, apPtt: 2, dmg: 1.5, dist: 10, duty: 37, cf: 3, lc: 1, dax: 1, ap: 3 },
  { sLand: 'NP', dLand: 'NP', vkorg: '1100', kunnr: '0000110305', name: 'Kathmandu FMCG Traders Pvt Ltd', werks: '1101', curr: 'NPR', fx: 136.2, step: 5, vat: 13, retail: 18, apPtt: 2, dmg: 1, dist: 9, duty: 15, cf: 3, lc: 0.75, dax: 1, ap: 3 },
  { sLand: 'LK', dLand: 'LK', vkorg: '1100', kunnr: '0000110412', name: 'Colombo Health & Beauty (Pvt) Ltd', werks: '1101', curr: 'LKR', fx: 296, step: 10, vat: 18, retail: 22, apPtt: 3, dmg: 1, dist: 10, duty: 30, cf: 4, lc: 1, dax: 1, ap: 3 },
  { sLand: 'NG', dLand: 'NG', vkorg: '1100', kunnr: '0000110520', name: 'Lagos Prime Distributors Ltd', werks: '1101', curr: 'NGN', fx: 1520, step: 50, vat: 7.5, retail: 25, apPtt: 3, dmg: 2, dist: 12, duty: 20, cf: 6, lc: 1, dax: 2, ap: 4 },
  { sLand: 'KE', dLand: 'KE', vkorg: '1100', kunnr: '0000110588', name: 'Nairobi Consumer Brands Ltd', werks: '1101', curr: 'KES', fx: 129, step: 5, vat: 16, retail: 22, apPtt: 3, dmg: 1.5, dist: 11, duty: 25, cf: 5, lc: 1, dax: 1.5, ap: 4 },
];

interface Material { matnr: string; maktx: string; desc: string; business: string; size: string; usd: number }
const MATERIALS: Material[] = [
  { matnr: '000000000400012001', maktx: 'NAVRATNA AYURVEDIC OIL 100ML', desc: 'NAVRATNA OIL 100ML EXPORT', business: 'HAIR CARE', size: '100 ML', usd: 1.6 },
  { matnr: '000000000400012002', maktx: 'NAVRATNA AYURVEDIC OIL 200ML', desc: 'NAVRATNA OIL 200ML EXPORT', business: 'HAIR CARE', size: '200 ML', usd: 2.9 },
  { matnr: '000000000400012010', maktx: 'NAVRATNA EXTRA THANDA OIL 300ML', desc: 'NAVRATNA XTRA THANDA 300ML EXPORT', business: 'HAIR CARE', size: '300 ML', usd: 3.9 },
  { matnr: '000000000400013001', maktx: 'BOROPLUS ANTISEPTIC CREAM 40ML', desc: 'BOROPLUS CREAM 40ML EXPORT', business: 'SKIN CARE', size: '40 ML', usd: 1.3 },
  { matnr: '000000000400013002', maktx: 'BOROPLUS ANTISEPTIC CREAM 80ML', desc: 'BOROPLUS CREAM 80ML EXPORT', business: 'SKIN CARE', size: '80 ML', usd: 2.2 },
  { matnr: '000000000400013020', maktx: 'BOROPLUS BODY LOTION 300ML', desc: 'BOROPLUS LOTION 300ML EXPORT', business: 'SKIN CARE', size: '300 ML', usd: 4.2 },
  { matnr: '000000000400014001', maktx: 'ZANDU BALM 8ML', desc: 'ZANDU BALM 8ML EXPORT', business: 'OTC', size: '8 ML', usd: 0.9 },
  { matnr: '000000000400014005', maktx: 'ZANDU BALM ULTRA POWER 25ML', desc: 'ZANDU BALM ULTRA 25ML EXPORT', business: 'OTC', size: '25 ML', usd: 2.1 },
  { matnr: '000000000400015001', maktx: 'KESH KING AYURVEDIC OIL 100ML', desc: 'KESH KING OIL 100ML EXPORT', business: 'HAIR CARE', size: '100 ML', usd: 2.6 },
  { matnr: '000000000400016001', maktx: '7 OILS IN ONE NON STICKY OIL 100ML', desc: '7 OILS IN ONE 100ML EXPORT', business: 'HAIR CARE', size: '100 ML', usd: 1.9 },
  { matnr: '000000000400017001', maktx: 'SMART AND HANDSOME CREAM 60G', desc: 'SMART & HANDSOME 60G EXPORT', business: 'MALE GROOMING', size: '60 G', usd: 2.4 },
  { matnr: '000000000400018001', maktx: 'DERMICOOL PRICKLY HEAT POWDER 150G', desc: 'DERMICOOL POWDER 150G EXPORT', business: 'SKIN CARE', size: '150 G', usd: 2.3 },
  { matnr: '000000000400019001', maktx: 'NAVRATNA COOL TALC 100G', desc: '', business: 'SKIN CARE', size: '100 G', usd: 1.4 },
];

const nice = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Consumer price (RRP incl VAT) that lands a near-uniform net billing price across markets: the target net USD price
 * (half the reference consumer price, +/-5% by market) worked back up the cascade, then rounded to a price point.
 * High-duty markets therefore get higher shelf prices, as real export price lists do.
 */
function listPrice(m: Market, mat: Material): number {
  const net = mat.usd * 0.5 * (1 + (((hash(m.kunnr + mat.matnr) % 11) - 5) / 100));
  const cif = net / (1 - m.ap / 100) / (1 - m.dax / 100);
  const dlc = cif * m.fx * (1 + (m.duty + m.cf + m.lc) / 100);
  const eRrp = dlc / (1 - m.dist / 100) / (1 - (m.apPtt + m.dmg) / 100) / (1 - m.retail / 100);
  return nice(eRrp * (1 + m.vat / 100), m.step);
}

function marketRates(m: Market, rrpInclVat: number): CascadeRates {
  return { rrpInclVat, vatPct: m.vat, retailPct: m.retail, apOnPttPct: m.apPtt, damagePct: m.dmg, distMarginPct: m.dist, dutyPct: m.duty, cfPct: m.cf, lcPct: m.lc, daxPct: m.dax, apPct: m.ap, fx: m.fx };
}

function cascadeRow(m: Market, mat: Material, rates: CascadeRates, version: number, vfrom: string, vto: string, state: State | null): Row {
  return {
    S_LAND1: m.sLand, D_LAND1: m.dLand, VKORG: m.vkorg, KUNNR: m.kunnr, NAME1: m.name, MATNR: mat.matnr, MAKTX: mat.maktx,
    CASCADE_DESC: mat.desc, ZSKUSIZE: mat.size, ZVERSION: String(version), VALIDFROM: vfrom, VALIDTO: vto, L_WAERK: m.curr, B_WAERK: 'USD',
    ...buildCascade(rates), LIGHT: state ? LIGHT[state] : '', STATUS: state ?? '',
  };
}

interface Store { rows: Row[]; rates: Row[] }
let store: Store | null = null;

function seed(): Store {
  const rows: Row[] = [];
  MARKETS.forEach((m, mi) => {
    MATERIALS.filter((mat) => mat.desc).forEach((mat, ci) => {
      if ((mi + ci) % 3 === 0) return;
      const h = hash(m.kunnr + mat.matnr);
      const rrp = listPrice(m, mat);
      rows.push(cascadeRow(m, mat, marketRates(m, nice(rrp * (0.92 + (h % 11) / 100), m.step)), 1, '20250401', '20260331', 'C'));
      const state = (['A', 'A', 'P', 'R', 'C', 'P'] as State[])[h % 6];
      const drift = state === 'R' ? 1.12 : 1;
      rows.push(cascadeRow(m, mat, { ...marketRates(m, nice(rrp * drift, m.step)), retailPct: m.retail + ((h >> 3) % 5) - 2 }, 2, '20260401', h % 5 === 0 ? '20261130' : '20270331', state));
      if (h % 7 === 0) rows.push(cascadeRow(m, mat, marketRates(m, nice(rrp * 1.05, m.step)), 3, '20261101', '20270331', 'P'));
    });
  });
  const rates: Row[] = MARKETS.flatMap((m) => MATERIALS.slice(0, 4).map((mat) => rateRow(m, mat, listPrice(m, mat))));
  return { rows, rates };
}

function rateRow(m: Market, mat: Material, rrp: number): Row {
  return {
    LLAND: m.sLand, MATNR: mat.matnr, ZRRP_KSCHL: 'ZRRP', ZRRP_KBETR: rrp, ZCVT_KSCHL: 'ZCVT', ZCVT_KBETR: m.vat, ZRPI_KSCHL: 'ZRPI',
    ZRPI_KBETR: Math.round((rrp / (1 + m.vat / 100)) * 100) / 100, ZRTL_KSCHL: 'ZRTL', ZRTL_KBETR: m.retail, ZPTT_KSCHL: 'ZPTT', ZPTT_KBETR: m.apPtt,
    ZDEX_KSCHL: 'ZDEX', ZDEX_KBETR: m.dmg, ZDML_KSCHL: 'ZDML', ZDML_KBETR: m.dist, ZCUD_KSCHL: 'ZCUD', ZCUD_KBETR: m.duty, ZCFD_KSCHL: 'ZCFD',
    ZCFD_KBETR: m.cf, ZLCC_KSCHL: 'ZLCC', ZLCC_KBETR: m.lc, ZDAX_KSCHL: 'ZDAX', ZDAX_KBETR: m.dax, ZAP_KSCHL: 'ZAP', ZAP_KBETR: m.ap,
    VFROM: '20260401', VTO: '20270331', WAERK: m.curr,
  };
}

function db(): Store {
  if (!store) store = seed();
  return store;
}

/** Back to the seeded data (tests). */
export function resetMock(): void {
  store = null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (r: Row): Row => ({ ...r });
const nextVersion = (rows: Row[], key: string) => rows.filter((r) => priceKey(r) === key).reduce((v, r) => Math.max(v, Number(r.ZVERSION) || 0), 0) + 1;

export async function mockGetSet(set: CascadeSet): Promise<Row[]> {
  await delay(250);
  const s = db();
  if (set === 'CascadeMapSet') return MATERIALS.map((m) => ({ MATNR: m.matnr, ZBUSINESS: m.business, MAKTX: m.maktx, CASCADE_DESC: m.desc }));
  if (set === 'ApprovalSet') return s.rows.filter((r) => r.STATUS === 'P' || r.STATUS === 'R' || r.STATUS === 'A').map(clean);
  return s.rows.filter((r) => r.STATUS === 'A').map(clean);
}

const result = (processed: number, failed: number, message: string, data: unknown = ''): ActionResult => ({ processed, failed, message, data: data === '' ? '' : JSON.stringify(data) });

export async function mockAction(req: ActionRequest): Promise<ActionResult> {
  await delay(400);
  const s = db();
  const rows = req.payload?.ROWS ?? [];
  if (!rows.length) throw new MockError('Select at least one row', 400);
  if (DATED_ACTIONS.has(req.action) && (!/^\d{8}$/.test(req.vfrom ?? '') || !/^\d{8}$/.test(req.vto ?? ''))) throw new MockError('Valid From and Valid To (YYYYMMDD) are required for this action.', 400);
  const find = (r: Row) => s.rows.find((x) => rowKey(x) === rowKey(r));
  let ok = 0;
  let bad = 0;

  switch (req.action) {
    case 'SAVE_RATES': {
      for (const r of rows) {
        const k = [r.LLAND, r.MATNR, r.VFROM, r.VTO].join('|');
        const i = s.rates.findIndex((x) => [x.LLAND, x.MATNR, x.VFROM, x.VTO].join('|') === k);
        if (i >= 0) s.rates[i] = { ...r }; else s.rates.push({ ...r });
        ok++;
      }
      return result(ok, 0, `${ok} rate row(s) saved as condition records.`);
    }
    case 'RUN_SIM': {
      const pdate = req.payload?.PARAMS?.PDATE || '';
      const out: Row[] = [];
      const missing: string[] = [];
      for (const r of rows) {
        const m = MARKETS.find((x) => x.kunnr === r.KUNNR && (!r.VKORG || x.vkorg === r.VKORG));
        const mat = MATERIALS.find((x) => x.matnr === r.MATNR);
        if (!m || !mat) { bad++; missing.push(`${r.KUNNR}/${r.MATNR}`); continue; }
        const rate = s.rates.filter((x) => x.LLAND === m.sLand && x.MATNR === mat.matnr && (!pdate || (x.VFROM <= pdate && x.VTO >= pdate))).pop();
        const rates = rate ? ratesFromRateRow(rate, m.fx) : marketRates(m, listPrice(m, mat));
        const row = cascadeRow(m, mat, rates, nextVersion(s.rows, priceKey({ S_LAND1: m.sLand, D_LAND1: m.dLand, VKORG: m.vkorg, KUNNR: m.kunnr, MATNR: mat.matnr })), '', '', null);
        out.push({ ...row, L_WAERK: r.L_WAERK || row.L_WAERK, B_WAERK: r.B_WAERK || row.B_WAERK, WERKS: r.WERKS, CHARG: r.CHARG });
        ok++;
      }
      return result(ok, bad, `Simulation priced ${ok} row(s)${bad ? `; ${bad} without customer or material master (${missing.slice(0, 3).join(', ')})` : ''}.`, out);
    }
    case 'SEND_APPROVAL':
    case 'APPROVE_SIM': {
      const state: State = req.action === 'SEND_APPROVAL' ? 'P' : 'A';
      for (const r of rows) {
        const { WERKS: _w, CHARG: _c, ...base } = r;
        void _w; void _c;
        s.rows.push({ ...base, ZVERSION: String(nextVersion(s.rows, priceKey(r))), VALIDFROM: req.vfrom, VALIDTO: req.vto, LIGHT: LIGHT[state], STATUS: state });
        ok++;
      }
      return result(ok, 0, req.action === 'SEND_APPROVAL' ? `${ok} row(s) sent for approval.` : `${ok} row(s) approved from the simulation; they are now in Condition Creation.`);
    }
    case 'APPROVE':
    case 'REJECT': {
      for (const r of rows) {
        const x = find(r);
        if (!x || x.STATUS === 'C') { bad++; continue; }
        x.STATUS = req.action === 'APPROVE' ? 'A' : 'R';
        x.LIGHT = LIGHT[x.STATUS as State];
        if (req.action === 'APPROVE') { x.VALIDFROM = req.vfrom; x.VALIDTO = req.vto; }
        ok++;
      }
      return result(ok, bad, `${ok} row(s) ${req.action === 'APPROVE' ? 'approved' : 'rejected'}${bad ? `, ${bad} not found or already in SAP` : ''}.`);
    }
    case 'DELETE': {
      for (const r of rows) {
        const i = s.rows.findIndex((x) => rowKey(x) === rowKey(r) && x.STATUS !== 'C');
        if (i < 0) { bad++; continue; }
        s.rows.splice(i, 1);
        ok++;
      }
      return result(ok, bad, `${ok} record(s) deleted${bad ? `, ${bad} not found` : ''}.`);
    }
    case 'CREATE_COND': {
      for (const r of rows) {
        const x = find(r);
        if (!x || x.STATUS !== 'A') { bad++; continue; }
        x.STATUS = 'C';
        ok++;
      }
      return result(ok, bad, `Condition records created for ${ok} row(s)${bad ? `; ${bad} skipped (not approved)` : ''}.`);
    }
    case 'COMPARE': {
      const keys = new Set(rows.map(priceKey));
      const hist = s.rows.filter((x) => keys.has(priceKey(x))).map(clean)
        .sort((a, b) => priceKey(a).localeCompare(priceKey(b)) || Number(b.ZVERSION) - Number(a.ZVERSION));
      return result(hist.length, 0, `${hist.length} version(s) for ${keys.size} price point(s).`, hist);
    }
    default:
      throw new MockError(`Unknown action ${String(req.action)}.`, 400);
  }
}

/** Sample rows for the Excel templates. */
export function sampleRateRows(): (string | number)[][] {
  return [MARKETS[0], MARKETS[3]].map((m) => {
    const r = rateRow(m, MATERIALS[0], listPrice(m, MATERIALS[0]));
    return RATE_COLUMNS.map(({ key: k }) => (k === 'VFROM' ? '01.04.2026' : k === 'VTO' ? '31.03.2027' : k === 'MATNR' ? '400012001' : r[k]));
  });
}

export function sampleSimRows(): (string | number)[][] {
  return MARKETS.slice(0, 4).map((m, i) => [m.vkorg, m.werks, m.kunnr.replace(/^0+/, ''), MATERIALS[i].matnr.replace(/^0+/, ''), '', m.curr, 'USD']);
}
