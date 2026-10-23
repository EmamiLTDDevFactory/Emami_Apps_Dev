import type { Row } from './types';

/**
 * The export price cascade, from the consumer price in the destination market back to the billing price:
 *   RRP incl VAT -> VAT -> RRP excl VAT -> retailer margin -> PTT incl A&P -> A&P on PTT, damage/expiry -> PTT excl A&P
 *   -> distributor margin -> DLC (distributor landed cost) -> customs duty, C&F, LC charge -> CIF
 *   -> damage/expiry -> billing price before A&P -> A&P -> billing price after A&P (net realisation).
 * Percentages are of the step they apply to; customs duty, C&F and LC charge are % of CIF (DLC = CIF x (1 + duty + C&F + LC)).
 * The consumer side (up to DLC, duty, C&F, LC) is in local currency, the CIF side in billing currency (fx = local per billing).
 * Used by the mock simulation and the KPIs; in production SAP returns these values.
 */
export interface CascadeRates {
  rrpInclVat: number;
  vatPct: number;
  retailPct: number;
  apOnPttPct: number;
  damagePct: number;
  distMarginPct: number;
  dutyPct: number;
  cfPct: number;
  lcPct: number;
  daxPct: number;
  apPct: number;
  fx: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildCascade(rt: CascadeRates): Row {
  const eRrp = rt.rrpInclVat / (1 + rt.vatPct / 100);
  const retail = (eRrp * rt.retailPct) / 100;
  const ptt = eRrp - retail;
  const apOnPtt = (ptt * rt.apOnPttPct) / 100;
  const damage = (ptt * rt.damagePct) / 100;
  const pttExAp = ptt - apOnPtt - damage;
  const dMargin = (pttExAp * rt.distMarginPct) / 100;
  const dlc = pttExAp - dMargin;
  const cifLocal = dlc / (1 + (rt.dutyPct + rt.cfPct + rt.lcPct) / 100);
  const fx = rt.fx > 0 ? rt.fx : 1;
  const cif = cifLocal / fx;
  const dax = (cif * rt.daxPct) / 100;
  const cifF = cif - dax;
  const ap = (cifF * rt.apPct) / 100;
  return {
    ZI_RRP_PER_PC: r2(rt.rrpInclVat),
    ZVAT: r2(rt.rrpInclVat - eRrp),
    ZE_RRP_PER_PC: r2(eRrp),
    ZRRP_PER_DZ: r2(rt.rrpInclVat * 12),
    ZRETAIL: r2(retail),
    ZPTT: r2(ptt),
    ZAP_ON_PTT: r2(apOnPtt),
    ZDAMGE: r2(damage),
    ZPTT_E_AP: r2(pttExAp),
    ZDMARGIN: r2(dMargin),
    ZDLC: r2(dlc),
    ZCUS_DUTY: r2((cifLocal * rt.dutyPct) / 100),
    ZCF: r2((cifLocal * rt.cfPct) / 100),
    ZLC_CHARGE: r2((cifLocal * rt.lcPct) / 100),
    ZCIF: r2(cif),
    ZDAM_ZDAX: r2(dax),
    ZCIF_F: r2(cifF),
    ZAP: r2(ap),
    ZCIF_AFTER_AP: r2(cifF - ap),
  };
}

/** Rates back out of a rate-upload row (…_KBETR fields); fx comes from the caller. */
export function ratesFromRateRow(rate: Row, fx: number): CascadeRates {
  const n = (k: string) => Number(rate[k] ?? 0) || 0;
  return {
    rrpInclVat: n('ZRRP_KBETR'), vatPct: n('ZCVT_KBETR'), retailPct: n('ZRTL_KBETR'), apOnPttPct: n('ZPTT_KBETR'),
    damagePct: n('ZDEX_KBETR'), distMarginPct: n('ZDML_KBETR'), dutyPct: n('ZCUD_KBETR'), cfPct: n('ZCFD_KBETR'),
    lcPct: n('ZLCC_KBETR'), daxPct: n('ZDAX_KBETR'), apPct: n('ZAP_KBETR'), fx,
  };
}
