/**
 * Mock of the Costing dashboard sets (DashMisSet, DashSalesSet, DashMarginSet, DashCdrillSet, DashPvmSet, DashThreshSet) with invented
 * figures, only to see the screens locally (design review, screenshots). Never part of a normal build (mock/sap.ts is replaced by mock/stub.ts).
 */
type Raw = Record<string, unknown>;
interface Deps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: (body: unknown, status?: number, msgs?: any[]) => Response;
  odataError: (status: number, code: string, message: string) => Response;
  parseFilter: (f: string) => Map<string, string[]>;
}
const SETS = new Set(['CogmBoardSet', 'DashMisSet', 'DashSalesSet', 'DashMarginSet', 'DashCdrillSet', 'DashPvmSet', 'DashThreshSet']);
const BRANDS = [['NAV', 'NAVRATNA'], ['KES', 'KESH KING'], ['ZAN', 'ZANDU'], ['BOR', 'BOROPLUS'], ['BIG', 'BIG BRAND']] as const;
const n = (v: number, dp = 6) => v.toFixed(dp);
const MAT = (i: number) => String(400000000 + i * 137).padStart(18, '0');

export function handleDash(set: string, sp: URLSearchParams, d: Deps): Response | null {
  if (!SETS.has(set)) return null;
  if (set === 'CogmBoardSet') {
    const g = (sp.get('$filter') ?? '').match(/GroupBy eq '(\w)'/)?.[1] ?? 'P';
    const mk = (k: string, t: string, i: number, imp: string): Raw => ({ GroupKind: g, GrpKey: k, GrpTxt: t, FgCnt: 8 + i, AlertHigh: i % 3, AlertMed: i % 2, NoDataCnt: i === 3 ? 2 : 0, WratioStd: n(38 + i, 4), WratioCur: i === 4 ? '' : n(40 + i, 4), RevenueInr: n(9e6 + i * 1.3e6, 2), AnnualImpactInr: imp });
    const big = Array.from({ length: 12 }, (_, k) => mk(k % 9 === 0 ? '' : `GRP${k % 3}`, k % 5 === 0 ? 'A very long group description that keeps going and going' : k % 7 === 0 ? '' : `Group ${k}`, k, k % 4 === 0 ? '' : k % 3 === 0 ? n(-1.7e12 + k, 2) : n(3.3e11 + k * 977, 2)));
    return d.json({ d: { results: big } });
  }
  if (set === 'DashThreshSet') return d.json({ d: { results: [{ Metric: 'GM', Category: '', RedPct: '18.000000', AmberPct: '22.000000', HighBad: '' }] } });
  if (set === 'DashPvmSet') return d.json({ d: { results: [{ Effect: 'No budget', SortNo: 0, Value: '0', Msg: 'No approved sales budget for financial year 2026 in ZSALES_BUD_TGT' }] } });
  if (set === 'DashMisSet') {
    const rows: Raw[] = BRANDS.map(([b], i) => {
      const bud = 1.2e7 * (1 + i * 0.4), act = bud * (0.97 + i * 0.015);
      return { Zbrand: b, Gjahr: '2026', Version: '02', FgCnt: 12 + i * 3, FgNobud: i === 2 ? 2 : 0, FtmQty: n(180000 + i * 9000, 3), FtmBudget: n(bud / 8), FtmActual: n(act / 8), FtmActualCmp: n(act / 8), YtmQty: n(1.2e6 + i * 50000, 3), YtmBudget: n(bud), YtmActual: n(act), YtmActualCmp: n(act), Msg: '' };
    });
    return d.json({ d: { results: rows } });
  }
  if (set === 'DashSalesSet') {
    const rows: Raw[] = [];
    BRANDS.forEach(([b], bi) => {
      let q = 0, g = 0, ns = 0, cg = 0;
      for (let k = 0; k < 4; k++) {
        const qty = 40000 + bi * 7000 + k * 3100, nsv = qty * (62 + k * 9 + bi * 4), cogm = nsv * (0.58 + k * 0.04);
        rows.push({ Grain: 'S', Zbrand: b, Matnr: MAT(bi * 4 + k), Maktx: `${BRANDS[bi][1]} PACK ${k + 1}`, Matkl: '414', Vtweg: k % 2 ? '10' : '35', VtwegTxt: k % 2 ? 'General Trade-Urban' : 'Super Stockist', SoldQty: n(qty, 3), Gsv: n(nsv * 1.08), Deductions: n(nsv * 0.08), Nsv: n(nsv), CogmQty: n(qty, 3), NsvCmp: n(nsv), Cogm: n(cogm), CogmPc: n(cogm / qty), SkuCnt: 1, SkuNocogm: 0, Msg: '' });
        q += qty; g += nsv * 1.08; ns += nsv; cg += cogm;
      }
      rows.push({ Grain: 'B', Zbrand: b, SoldQty: n(q, 3), Gsv: n(g), Deductions: n(g - ns), Nsv: n(ns), CogmQty: n(q, 3), NsvCmp: n(ns), Cogm: n(cg), SkuCnt: 4, SkuNocogm: 0, Msg: '' });
    });
    return d.json({ d: { results: rows } });
  }
  if (set === 'DashMarginSet') {
    const rows: Raw[] = [];
    BRANDS.forEach(([b, name], bi) => {
      for (let k = 0; k < 4; k++) {
        const qty = 40000 + bi * 7000 + k * 3100, sp = qty * (55 + k * 8 + bi * 3), mrp = sp * 1.55;
        const rm = sp * 0.22, pm = sp * 0.19, pf = sp * 0.05, oh = sp * 0.12;
        rows.push({ Grain: 'S', Zbrand: b, Matnr: MAT(bi * 4 + k), Kunag: '', Maktx: `${name} PACK ${k + 1}`, Matkl: '414', KunagTxt: '', Zscheme: '0', Crssku: `CRS${bi}${k}`, Zbusiness: '01', BudVer: '02', BudFlag: k === 3 ? 'NBC' : 'OK', Msg: '',
          Qty: n(qty, 3), Mrp: n(mrp), Sp: n(sp), ChRet: n(-mrp * 0.12), ChDis: n(-mrp * 0.06), ChSs: n(-mrp * 0.04), Gst: n(sp * 0.18), Rm: n(rm), Pm: n(pm), Pf: n(pf), Oh: n(oh), CRm: '0', CPm: '0', CPf: '0', COh: '0', TRm: n(sp * 0.01), TPm: '0', TPf: '0', TOh: '0',
          BudRm: n(rm / qty * 0.97), BudPm: n(pm / qty * 1.02), BudPf: n(pf / qty), BudOh: n(oh / qty * 0.98) });
      }
    });
    ['CUSTOMER A', 'CUSTOMER B', 'CUSTOMER C'].forEach((c, i) => rows.push({ Grain: 'C', Zbrand: '', Matnr: '', Kunag: String(100100 + i), Maktx: '', Matkl: '', KunagTxt: c, Zscheme: '', Crssku: '', Zbusiness: '', BudVer: '', BudFlag: '', Msg: '', Qty: n(90000 - i * 20000, 3), Mrp: n(9e6 - i * 1e6), Sp: n(5.5e6 - i * 7e5), ChRet: n(-1e6), ChDis: n(-4e5), ChSs: n(-2e5), Gst: n(1e6), Rm: n(1.2e6), Pm: n(1e6), Pf: n(2.5e5), Oh: n(6e5), CRm: '0', CPm: '0', CPf: '0', COh: '0', TRm: '0', TPm: '0', TPf: '0', TOh: '0', BudRm: '0', BudPm: '0', BudPf: '0', BudOh: '0' }));
    return d.json({ d: { results: rows } });
  }
  // DashCdrillSet
  const comps = [['100000522', 'MENTHOL CRYSTAL', 'ROH', '10', 'R', 0.41], ['100000025', 'LIQUID PARAFFIN', 'ROH', '12', 'R', 0.88], ['100000900', 'PERFUME COMPOUND A', 'ROH', '106', 'F', 1.62], ['150003952', 'PET CONTAINER 100ML', 'VERP', '302', 'P', 3.1], ['150003953', 'FLIP CAP', 'VERP', '303', 'P', 0.95], ['150003954', 'INNER BOX', 'VERP', '211', 'P', 0.4]] as const;
  const out: Raw[] = [{ Grain: 'S', Matnr: '400000137', Charg: '', Idnrk: '', Maktx: '', Mtart: '', Matkl: '', Cat: '', Meins: '', Flag: 'OK', Msg: '3 of 5 sold batches costed from 4 process orders', Orders: 4, SoldQty: n(52000, 3), ProdQty: n(52000, 3), Qty: '0', Val: '0', AvgQtyPc: '0', AvgCostPc: '0', RmPc: n(1.29), PmPc: n(4.45), PfPc: n(1.62), OthPc: '0' }];
  ['JNH0001', 'JNH0002', 'JNH0003', 'OLD2008', 'TEST'].forEach((c, i) => out.push({ Grain: 'B', Matnr: '400000137', Charg: c, Idnrk: '', Maktx: '', Mtart: '', Matkl: '', Cat: '', Meins: '', Flag: i < 3 ? 'OK' : 'NBC', Msg: '', Orders: i < 3 ? 1 : 0, SoldQty: n(30000 - i * 5000, 3), ProdQty: i < 3 ? n(30000 - i * 5000, 3) : '0', Qty: '0', Val: '0', AvgQtyPc: '0', AvgCostPc: '0', RmPc: i < 3 ? n(1.29) : '0', PmPc: i < 3 ? n(4.45) : '0', PfPc: i < 3 ? n(1.62) : '0', OthPc: '0' }));
  comps.forEach(([id, t, mt, mk, cat, pc]) => out.push({ Grain: 'C', Matnr: '400000137', Charg: '', Idnrk: id.padStart(18, '0'), Maktx: t, Mtart: mt, Matkl: mk, Cat: cat, Meins: mt === 'VERP' ? 'PC' : 'KG', Flag: '', Msg: '', Orders: 0, SoldQty: n(52000, 3), ProdQty: '0', Qty: n(52000 * (mt === 'VERP' ? 1 : 0.012), 3), Val: n(52000 * pc), AvgQtyPc: n(mt === 'VERP' ? 1 : 0.012), AvgCostPc: n(pc), RmPc: '0', PmPc: '0', PfPc: '0', OthPc: '0' }));
  return d.json({ d: { results: out } });
}
