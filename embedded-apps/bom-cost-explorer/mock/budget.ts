/**
 * Mock of the Budget costing sets (BudgetSumSet, BudgetSplitSet, BudgetChkSet, BudgetPendSet, BudgetPendDetSet, BudgetInitSet, BudgetApproveSet).
 * The real sets are not published yet: this follows the contract in src/lib/budget/fields.ts and docs/budget-cost-odata-spec.md.
 *
 * Cases: FG1001 normal (actual and last rate). FG1002 actual 12 % above budget (red). FG1003 no actual yet. FG2001 checklist issues
 * (multiple BoMs + alt. BoM issue, only with Checklist 'X'). FAILFG -> SAP error. Plant EMPT -> no rows. Missing required filter -> SAP's message.
 * Initiate takes RunIds of earlier runs (SAP saves what it computed then), version = max + 1 of the year. Approve sets status A.
 */
import { MATERIALS } from './data';

type Raw = Record<string, unknown>;
interface Deps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: (body: unknown, status?: number, msgs?: any[]) => Response;
  odataError: (status: number, code: string, message: string) => Response;
  parseFilter: (f: string) => Map<string, string[]>;
}
const SETS = new Set(['BudgetSumSet', 'BudgetSplitSet', 'BudgetChkSet', 'BudgetPendSet', 'BudgetPendDetSet', 'BudgetInitSet', 'BudgetApproveSet']);
const ORIG = ['Cap', 'Cbsv', 'Fw', 'Gb', 'Lbel', 'Lflt', 'Lmns', 'Mrcn', 'Pc', 'Spc', 'Spt', 'Tube', 'Wwf', 'Dghr', 'Grns', 'Ip', 'Opi'];
const f4 = (n: number) => n.toFixed(4);
const f3 = (n: number) => n.toFixed(3);
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const dt = (iso: string) => `/Date(${Date.parse(`${iso}T00:00:00Z`)})/`;
const fyOf = (iso: string) => { const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)); return String(m >= 4 ? y : y - 1); };
const businessOf = (matnr: string) => (matnr.startsWith('FG1') ? '01' : matnr.startsWith('FG2') ? '02' : '03');

interface Fg { Matnr: string; Maktx: string }
interface Comp { code: string; desc: string; mtart: string; hrkft: string; stufe: number; erskz: string; qty: number; cost: number; act: number; last: number }
interface Sum { row: Raw; comps: Comp[] }

const runs = new Map<string, { werks: string; rows: Raw[]; comps: Map<string, Comp[]>; budgetYr: string; fy: string }>();
interface Saved { sum: Raw; det: Raw[] }
const saved: Saved[] = [];
let runNo = 0;
export function resetBudgetMock() { runs.clear(); saved.length = 0; runNo = 0; seedPending(); }

function compsOf(fg: string, werks: string): Comp[] {
  const s = seedOf(`${fg}|${werks}`);
  const base = [
    ['RM100', 'Mineral oil', 'ROH', 'CAP', 0.9], ['RM200', 'Coconut oil', 'ROH', 'FW', 1.4], ['RM300', 'Perfume compound', 'ROH', 'OPI', 0.35],
    ['PM100', 'Plastic bottle', 'VERP', 'PC', 1.1], ['PM200', 'Cap', 'VERP', 'CAP', 0.3], ['PM300', 'Label', 'VERP', 'LBEL', 0.2], ['PM400', 'Carton', 'PKGN', 'MRCN', 0.45],
  ] as const;
  const out: Comp[] = [{ code: 'WIP9', desc: 'Bulk oil (WIP)', mtart: 'WIP', hrkft: '', stufe: 1, erskz: '', qty: 0.1, cost: 0, act: 0, last: 0 }];
  base.forEach(([code, desc, mtart, hrkft, c], i) => {
    const cost = c * (0.9 + ((s + i * 17) % 20) / 100);
    const fgv = fg === 'FG1002' ? 1.12 : fg === 'FG1003' ? 0 : 1 + (((s + i) % 7) - 3) / 100;
    out.push({ code, desc, mtart, hrkft, stufe: mtart === 'ROH' ? 2 : 1, erskz: '', qty: 0.1 + i * 0.05, cost, act: cost * fgv, last: cost * (1 + (((s + i * 3) % 9) - 4) / 100) });
  });
  return out;
}

function buildSum(fg: Fg, werks: string, year: string, checklist: boolean, runId: string, rowid: number, fy: string): Sum {
  const comps = compsOf(fg.Matnr, werks);
  const t = (pred: (c: Comp) => boolean, k: 'cost' | 'act' | 'last') => comps.filter(pred).reduce((a, c) => a + c[k], 0);
  const rm = t((c) => c.mtart === 'ROH', 'cost'), pm = t((c) => c.mtart === 'VERP' || c.mtart === 'PKGN', 'cost');
  const row: Raw = {
    Rowid: rowid, RunId: runId, Matnr: fg.Matnr, Maktx: fg.Maktx, MtartFg: 'FERT', Werks: werks, Zscheme: 'F', Zbusiness: businessOf(fg.Matnr), Year: fy,
    Zskugrcodecrs: `CRS${fg.Matnr.slice(2)}`, Zskugroupcrs: `${fg.Maktx} group`, Zskusize: '100.000', Ntgew: '0.110', Gewei: 'KG', Lifnr: '', Name1: '',
    WipCode: 'WIP9', WipDesc: 'Bulk oil (WIP)', WipStlal: '1', WipBaseUnit: 'KG', WipBaseQty: '100.000', WipUsedQty: '10.000', WipCostp: f4(rm * 10),
    RmCost: f4(rm), PmCost: f4(pm), PerfumeCost: f4(0.35), CostPerpc1: f4(rm + pm), PCostPerpc1: f4(rm + pm), ACostPerpc1: f4(t(() => true, 'act')), LastRate: f4(t(() => true, 'last')),
    ARmcostPerpc1: f4(t((c) => c.mtart === 'ROH', 'act')), APmcostPerpc1: f4(t((c) => c.mtart !== 'ROH', 'act')), APerfcostPerpc1: '0.0000',
    RmlastRate: f4(t((c) => c.mtart === 'ROH', 'last')), PmlastRate: f4(t((c) => c.mtart !== 'ROH', 'last')), PerfumelastRate: '0.0000',
    CRmCost: '0.0000', CPmCost: '0.0000', CPerfCost: '0.0000', COthCost: '0.0000', TRmCost: '0.0000', TPmCost: '0.0000', TPerfCost: '0.0000', TOthCost: '0.0000',
    Machine: '0.2100', Labour: '0.1300', Power: '0.0400', Steam: '0.0000', Labour3p: '0.0000', Bmsch: '1000.000', Vgw02: '30.000', Vgw03: '20.000', Vgw04: '5.000', Vgw05: '0.000', Vgw01: '0.000',
    Machrs: '7.0000', Labhrs: '6.5000', Powerhrs: '8.0000', Steamhrs: '0.0000', MachrsQty: '0.030', LabhrsQty: '0.020', PowerQty: '0.005', SteamQty: '0.000', Labour3pQty: '0.000', BomBmeng: '1000.000', Bmeng: '1000.000',
    PlanCost: f4(((rm + pm) * 120000) / 100000), PlanQty: '120000.000', QtyMt: f3(13.2),
    StartD: null, EndD: null, InfoDateFrm: null, InfoDateTo: null,
    MulUnlock: '', MulBom: '', MulProd: '', AllBomIn: '', AllPverIn: '', Msg: '',
  };
  for (const o of ORIG) { row[o] = '0.0000'; row[`A${o}`] = '0.0000'; row[`L${o}`] = '0.0000'; }
  for (const [o, hr] of [['Cap', 'CAP'], ['Fw', 'FW'], ['Lbel', 'LBEL'], ['Mrcn', 'MRCN'], ['Pc', 'PC'], ['Opi', 'OPI']] as const) {
    row[o] = f4(t((c) => c.hrkft === hr, 'cost')); row[`A${o}`] = f4(t((c) => c.hrkft === hr, 'act')); row[`L${o}`] = f4(t((c) => c.hrkft === hr, 'last'));
  }
  if (fg.Matnr === 'FG3001') { row.ACostPerpc1 = '0.0000'; }
  if (checklist && fg.Matnr === 'FG2001') { row.MulBom = 'X'; row.MulProd = 'X'; row.Msg = 'Checklist: two BoMs active'; }
  void year;
  return { row, comps };
}

const splitRows = (sum: Sum, rowidBase: number): Raw[] => sum.comps.map((c, i) => ({
  Rowid: rowidBase + i, MatnrFg: sum.row.Matnr, MaktxFg: sum.row.Maktx, Werks: sum.row.Werks, Stlal: '1', Bmeng: '1000.000', Stufe: c.stufe,
  ItemCode: c.code, ItemDesc: c.desc, ItemBom: '', ItemStlal: '', Mtart: c.mtart, Hrkft: c.hrkft, Sobsl: '', Erskz: c.erskz, Xtlty: '', Pcindi: '', PcindiDesc: '', WipPcindi: 'WIP9', WipPcindiDesc: 'Bulk oil (WIP)',
  Menge: f3(c.qty), Meins: 'KG', MeinsFg: 'KG', Epein: '1', DiscountBasic: '0.0000', FrgAmt: '0.0000', Landed: f4(c.cost / c.qty || 0), Total: f4(c.cost / c.qty || 0), PTotal: f4(c.cost / c.qty || 0), ATotal: f4(c.act / c.qty || 0),
  CostPerpc: f4(c.cost), PCostPerpc: f4(c.cost), ACostPerpc: f4(c.act), CostPerpc1: f4(c.cost), PCostPerpc1: f4(c.cost), ACostPerpc1: f4(c.act), CostPer1000: f4(c.cost * 1000), PCostPer1000: f4(c.cost * 1000), ACostPer1000: f4(c.act * 1000), LastRate: f4(c.last),
  Machine: '0.0000', Labour: '0.0000', Power: '0.0000', Steam: '0.0000', Labour3p: '0.0000', Bmsch: '0.000', Vgw01: '0.000', Vgw02: '0.000', Vgw03: '0.000', Vgw04: '0.000', Vgw05: '0.000',
  Machrs: '0.0000', Labhrs: '0.0000', Powerhrs: '0.0000', Steamhrs: '0.0000', MachrsQty: '0.000', LabhrsQty: '0.000', PowerQty: '0.000', SteamQty: '0.000', Labour3pQty: '0.000',
  Lifnr: '', Name1: '', Zscheme: 'F', Zbusiness: sum.row.Zbusiness, Zskusize: '100.000', Zskugrcodecrs: sum.row.Zskugrcodecrs,
  MulUnlock: '', MulBom: sum.row.MulBom ?? '', MulProd: sum.row.MulProd ?? '', AllBomIn: '', AllPverIn: '',
}));

function pendFromSum(row: Raw, gjahr: string, version: string, status: string, by: string, remarks: string): Raw {
  const p: Raw = { ...row, Gjahr: gjahr, Monat: '10', Version: version, Status: status, Mtart: row.MtartFg, CostPc: row.CostPerpc1, PcostPc: row.PCostPerpc1, AcostPc: row.ACostPerpc1, LRate: row.LastRate,
    ArmCostPc: row.ARmcostPerpc1, ApmCostPc: row.APmcostPerpc1, AperfCostPc: row.APerfcostPerpc1, RmLrate: row.RmlastRate, PmLrate: row.PmlastRate, PerfLrate: row.PerfumelastRate,
    Remarks: remarks, Remarks1: '', InitiatedBy: by, InitiatedOn: dt('2026-10-28'), ApprovedBy: '', ApprovedOn: null };
  return p;
}
function seedPending() {
  for (const fgm of MATERIALS.filter((m) => m.Mtart === 'FERT').slice(0, 3)) {
    const sum = buildSum({ Matnr: fgm.Matnr, Maktx: fgm.Maktx }, '1000', '2026', false, 'SEED', 0, '2026');
    saved.push({ sum: pendFromSum(sum.row, '2026', '03', 'I', 'planner@emamiltd.in', 'Q4 budget refresh'), det: splitRows(sum, 0).map((r, i) => ({ ...r, Gjahr: '2026', Version: '03', SrNo: i + 1, Idnrk: r.ItemCode, Matnr: r.MatnrFg, Maktx: r.MaktxFg, MtartFg: 'FERT', Matkl: '', BaseUnit: 'KG', BasicD: '0.0000',
      Cost: r.CostPerpc, PCost: r.PCostPerpc, ACost: r.ACostPerpc, CostPc: r.CostPerpc1, PcostPc: r.PCostPerpc1, AcostPc: r.ACostPerpc1, LRate: r.LastRate, Cost1000: r.CostPer1000, Pcost1000: r.PCostPer1000, Acost1000: r.ACostPer1000, Ptotal: r.PTotal, Atotal: r.ATotal })) });
  }
}
seedPending();

export function handleBudget(set: string, sp: URLSearchParams, init: RequestInit | undefined, d: Deps): Response | null {
  if (!SETS.has(set)) return null;
  const method = (init?.method ?? 'GET').toUpperCase();
  const f = d.parseFilter(sp.get('$filter') ?? '');
  const one = (k: string) => (f.get(k) ?? [])[0] ?? '';

  if (set === 'BudgetInitSet' || set === 'BudgetApproveSet') {
    if (method !== 'POST') return d.odataError(405, '/IWBEP/CM_MGW_RT/005', `${set} accepts POST only`);
    const body = JSON.parse(String(init?.body ?? '{}')) as Raw;
    if (!String(body.AppUser ?? '').trim()) return d.odataError(400, 'ZMM_BUD/010', 'You are not an initiator');
    if (set === 'BudgetInitSet') {
      if (body.ExclDiv !== 'X') return d.odataError(400, 'ZMM_BUD/011', 'Initiate without exclude division not possible');
      if (String(body.AppUser) === 'noinit@emamiltd.in') return d.odataError(400, 'ZMM_BUD/010', 'You are not an initiator');
      const ids = String(body.RunIds ?? '').split(',').filter(Boolean);
      const found = ids.map((i) => runs.get(i)).filter(Boolean) as NonNullable<ReturnType<typeof runs.get>>[];
      if (!found.length) return d.odataError(400, 'ZMM_BUD/012', 'The run is no longer available in SAP. Run the budget again.');
      const fy = found[0].fy;
      const maxV = Math.max(0, ...saved.filter((s) => s.sum.Gjahr === fy).map((s) => Number(s.sum.Version)));
      const version = String(maxV + 1).padStart(2, '0');
      let det = 0;
      for (const r of found) for (const row of r.rows) {
        const comps = r.comps.get(String(row.Rowid)) ?? [];
        const sum: Sum = { row, comps };
        const detRows = splitRows(sum, 0).map((x, i) => ({ ...x, Gjahr: fy, Version: version, SrNo: i + 1, Idnrk: x.ItemCode, Matnr: x.MatnrFg, Maktx: x.MaktxFg, MtartFg: 'FERT', Matkl: '', BaseUnit: 'KG', BasicD: '0.0000',
          Cost: x.CostPerpc, PCost: x.PCostPerpc, ACost: x.ACostPerpc, CostPc: x.CostPerpc1, PcostPc: x.PCostPerpc1, AcostPc: x.ACostPerpc1, LRate: x.LastRate, Cost1000: x.CostPer1000, Pcost1000: x.PCostPer1000, Acost1000: x.ACostPer1000, Ptotal: x.PTotal, Atotal: x.ATotal }));
        saved.push({ sum: pendFromSum(row, fy, version, 'I', String(body.AppUser), String(body.Remarks ?? '')), det: detRows });
        det += detRows.length;
      }
      return d.json({ d: { Gjahr: fy, Monat: '10', Version: version, Status: 'S', SavedSum: found.reduce((a, r) => a + r.rows.length, 0), SavedDet: det, MsgTxt: 'Data updated' } }, 201);
    }
    const g = String(body.Gjahr ?? ''), v = String(body.Version ?? '');
    const hit = saved.filter((s) => s.sum.Gjahr === g && s.sum.Version === v && s.sum.Status === 'I');
    if (!hit.length) return d.odataError(400, 'ZMM_BUD/020', 'No pending approval for this version');
    for (const h of hit) { h.sum.Status = 'A'; h.sum.Remarks1 = String(body.Remarks1 ?? ''); h.sum.ApprovedBy = String(body.AppUser); h.sum.ApprovedOn = dt('2026-11-04'); }
    return d.json({ d: { Gjahr: g, Version: v, Status: 'S', Approved: hit.length, MsgTxt: 'Data approved' } }, 201);
  }

  if (set === 'BudgetPendSet' || set === 'BudgetPendDetSet') {
    if (!one('AppUser')) return d.odataError(400, 'ZMM_BUD/010', 'You are not an approver');
    if (one('AppUser') === 'nobody@emamiltd.in') return d.json({ d: { results: [] } });
    const rows = saved.filter((s) => s.sum.Status === 'I' && (!one('Gjahr') || s.sum.Gjahr === one('Gjahr')) && (!one('Version') || s.sum.Version === one('Version')));
    if (set === 'BudgetPendSet') return d.json({ d: { results: rows.map((s, i) => ({ ...s.sum, Rowid: i + 1 })) } });
    let id = 0;
    return d.json({ d: { results: rows.flatMap((s) => s.det.map((x) => ({ ...x, Rowid: ++id }))) } });
  }

  // read sets with the selection
  const werks = one('Werks');
  if (!werks) return d.odataError(400, 'ZMM_BUD/001', 'Select a plant');
  if (!one('Mtart') || !one('BudatFrom') || !one('BudgetYr') || !one('RateYr')) return d.odataError(400, 'ZMM_BUD/002', 'Material Type , Posting Date , Activity Rate Of Year & Budgeted Year are required field');
  const mats = f.get('Matnr') ?? [];
  if (mats.includes('FAILFG')) return d.odataError(500, 'ZMM_BUD/999', 'Budget costing failed for FAILFG (mock SAP error)');
  if (werks === 'EMPT') return d.json({ d: { results: [] } }, 200, [{ code: 'ZMM_BUD/003', message: 'No data to display', severity: 'info' }]);
  const exclDiv = one('ExclDiv') === 'X', business = one('Business');
  const overrides = one('Overrides');
  let list: Fg[] = MATERIALS.filter((m) => m.Mtart === 'FERT').map((m) => ({ Matnr: m.Matnr, Maktx: m.Maktx }));
  if (mats.length) list = mats.map((m) => MATERIALS.find((x) => x.Matnr === m) ?? { Matnr: m, Maktx: `Finished good ${m}` });
  if (!exclDiv && business) list = list.filter((m) => businessOf(m.Matnr) === business);
  if (one('OnlyOverrides') === 'X') { const ov = overrides.split(';').map((x) => x.split('|')[0]); list = list.filter((m) => ov.includes(m.Matnr)); }
  const fy = fyOf(one('BudatTo') || one('BudatFrom'));

  if (set === 'BudgetChkSet') {
    return d.json({ d: { results: list.map((m, i) => ({ Rowid: i + 1, Matnr: m.Matnr, Maktx: m.Maktx, Mtart: 'FERT', Werks: werks, AllBomIn: '', AllPverIn: '', MulUnlock: '', MulBom: m.Matnr === 'FG2001' ? 'X' : '', MulProd: m.Matnr === 'FG2001' ? 'X' : '' })) } });
  }
  if (set === 'BudgetSplitSet') {
    const fg = list[0];
    if (!fg) return d.json({ d: { results: [] } });
    return d.json({ d: { results: splitRows(buildSum(fg, werks, fy, one('Checklist') === 'X', '', 1, fy), 1) } });
  }
  // BudgetSumSet
  const runId = `RUN${String(++runNo).padStart(6, '0')}`;
  const rows: Raw[] = [], comps = new Map<string, Comp[]>();
  list.forEach((m, i) => { const s = buildSum(m, werks, fy, one('Checklist') === 'X', runId, i + 1, fy); rows.push(s.row); comps.set(String(i + 1), s.comps); });
  runs.set(runId, { werks, rows, comps, budgetYr: one('BudgetYr'), fy });
  const msgs = one('FgSource') === 'N' ? [{ code: 'ZMM_BUD/004', message: 'NPD: budget date taken from the posting date (from)', severity: 'warning' }] : [];
  return d.json({ d: { results: rows } }, 200, msgs);
}
