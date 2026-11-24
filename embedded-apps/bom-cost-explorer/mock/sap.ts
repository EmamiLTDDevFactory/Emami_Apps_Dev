/**
 * Mock SAP Gateway for ZMM_BOM_COST_SRV, speaking the same OData V2 JSON the real service does:
 * decimals as strings, dates as /Date(ms)/, __metadata on every entity, __deferred navigation
 * unless $expand'ed, $top/$skip/$inlinecount on the paged sets, warnings in the `sap-message`
 * header and OData error bodies on failure.
 *
 * Used in-process when MOCK_SAP=true (lib/sap/client.ts swaps fetch for mockSapFetch) and as a
 * standalone HTTP server for Playwright (mock/server.ts).
 */
import { handleHier } from './hier';
import { handleWac } from './wac';
import { handleDash } from './dash';
import { handleBudget } from './budget';
import {
  COST_LINE, ENTITY_TYPE_RATE_OPTION, FIELDS_BY_SET, FREIGHT_ROW, MATERIAL, PLANT, RATE_OPTION, RATE_ROW, RMPM_ROW,
  SELECTION, CONFIG, selectionField, type FieldKind,
} from '../src/lib/sap/fields';
import { ENTITY_SET, NAV_RATE_OPTIONS, SELECTION_SETS, SERVICE, type EntitySetKey } from '../src/lib/sap/entities';

/** Entity TYPE names the mock's $metadata declares (SAP's real type names may differ - the app only
 * relies on the SET names, check:metadata resolves the type through the EntitySet). */
const MOCK_TYPES: Record<EntitySetKey, string> = {
  COST_LINES: 'CostLine', RATES: 'RateRow', FREIGHT: 'FreightRow', RMPM: 'RmPmRow', PLANTS: 'PlantVH', MATERIALS: 'MaterialVH', CONFIG: 'ConfigItem',
};
import { BOMS, FX_INR, MAT, MATERIALS, NO_BOM, PLANTS, hash, optionsFor, rnd, SOURCES, type MockOption } from './data';
import { handlePlan } from './plan';

type Raw = Record<string, unknown>;
type FieldMap = Record<string, readonly [string, FieldKind]>;

// ---- $filter parsing (only what the app sends: "name eq literal" joined by and/or) -------------
export function parseFilter(filter: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /(\w+)\s+eq\s+(datetime'[^']*'|'(?:[^']|'')*'|-?[\d.]+m?|true|false)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter))) {
    let v = m[2];
    if (v.startsWith("datetime'")) v = v.slice(9, 19);
    else if (v.startsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
    else if (v.endsWith('m')) v = v.slice(0, -1);
    out.set(m[1], [...(out.get(m[1]) ?? []), v]);
  }
  return out;
}

const n = (v: number, dp: number) => (Number.isFinite(v) ? v : 0).toFixed(dp);
const d = (iso: string | null) => (iso ? `/Date(${Date.parse(`${iso}T00:00:00Z`)})/` : null);
const meta = (type: string, key: string): Raw => ({
  __metadata: { id: `${SERVICE}/${key}`, uri: `${SERVICE}/${key}`, type: `${SERVICE}.${type}` },
});
const plantOf = (w: string) => PLANTS.find((p) => p.Werks === w);

interface Params {
  mode: string; mats: string[]; werks: string[]; cplnt: string[]; explQty: number; maxLevel: number;
  lookback: number; freightDays: number; prio: string[]; donor: string; inclFrt: boolean; stdFrt: boolean;
  latestOnly: boolean; allItems: boolean; ekorg: string[]; inclBudget: boolean; budgetYr: number; inclCover: boolean; hor: number[];
  budatFrom: string; asof: string;
}

function params(f: Map<string, string[]>): Params {
  const s = (k: keyof typeof SELECTION) => f.get(SELECTION[k][0]) ?? [];
  const one = (k: keyof typeof SELECTION, def = '') => s(k)[0] ?? def;
  // Edm.Boolean on CostLineSet (true/false), ABAP char flags on the row sets ('X' / '').
  const b = (k: keyof typeof SELECTION, def: boolean) => (s(k)[0] === undefined ? def : s(k)[0] === 'true' || s(k)[0] === 'X');
  return {
    mode: one('Mode', 'B'),
    mats: s('Matnr').map((x) => x.toUpperCase()),
    werks: s('Werks'),
    cplnt: s('Cplnt'),
    explQty: Number(one('ExplQty', '1')) || 1,
    maxLevel: Number(one('MaxLevel', '0')) || 0,
    lookback: Number(one('Lookback', '365')) || 365,
    freightDays: Number(one('FreightDays', '180')) || 180,
    prio: (one('Prio') || 'CONTRACT,INFOREC,MARKT,CONSUMP,MBEW').split(',').map((x) => x.trim()).filter(Boolean),
    donor: one('DonorPlant'),
    inclFrt: b('InclFrt', true),
    stdFrt: b('StdFrt', false),
    latestOnly: b('LatestOnly', true),
    allItems: b('AllItems', false),
    ekorg: s('Ekorg'),
    inclBudget: b('InclBudget', false),
    budgetYr: Number(one('BudgetYr', '2026')),
    inclCover: b('InclCover', false),
    hor: [Number(one('Hor1', '30')), Number(one('Hor2', '60')), Number(one('Hor3', '90'))],
    budatFrom: one('BudatFrom'),
    asof: b('UseAsof', false) ? one('AsofDate') : '',
  };
}

interface Msg { code: string; message: string; severity: 'warning' | 'info' | 'error' }

function validatePlants(p: Params, plants: string[], msgs: Msg[]) {
  const ok: string[] = [];
  for (const w of plants) {
    if (plantOf(w)) ok.push(w);
    else msgs.push({ code: 'ZBOM/012', message: `Plant ${w} skipped: not authorised for the service user or does not exist`, severity: 'warning' });
  }
  return ok;
}

function validateMats(p: Params, msgs: Msg[]) {
  const ok: string[] = [];
  for (const m of p.mats) {
    if (MAT.has(m)) ok.push(m);
    else msgs.push({ code: 'ZBOM/004', message: `Material ${m} skipped: material does not exist`, severity: 'warning' });
  }
  return ok;
}

// ---- costing engine (mock of the ABAP) -------------------------------------------------------
function usableOptions(matnr: string, plant: string, p: Params): MockOption[] {
  const asofT = p.asof ? Date.parse(p.asof) : Date.parse('2026-10-01');
  return optionsFor(matnr, plant, p.asof || undefined).filter(
    (o) => o.Source === 'MBEW' || (asofT - Date.parse(o.ValidFrom)) / 86400000 <= p.lookback,
  );
}

function pick(opts: MockOption[], prio: string[]): MockOption | undefined {
  for (const src of prio) {
    const o = opts.find((x) => x.Source === src);
    if (o) return o;
  }
  return undefined;
}

interface Line { raw: Raw; leaf: boolean; children: Line[] }

function costLine(
  seq: number, head: string, hwerks: string, costPlant: string, comp: string, level: number, parent: string,
  prodQty: number, menge: number, bmeng: number, bmein: string, hasChild: boolean, p: Params,
): Line {
  const m = MAT.get(comp)!;
  const hm = MAT.get(head)!;
  const pl = plantOf(costPlant)!;
  const loc = pl.Waers;
  const fxLocInr = FX_INR[loc];
  const base: Raw = {
    ...meta('CostLine', `${ENTITY_SET.COST_LINES}(Seqnr=${seq},Hwerks='${hwerks}',Werks='${costPlant}')`),
    Seqnr: seq, Land1: pl.Land1, Landx: pl.Landx, Hwerks: hwerks, Headmat: head, Headtxt: hm.Maktx, Level: level,
    Parent: parent, Idnrk: comp, Maktx: m.Maktx, Mtart: m.Mtart, Meins: m.Meins, HasChild: hasChild ? 'X' : '',
    Donor: '', Sobsl: hasChild ? '50' : '', CompGrp: m.Mtart === 'VERP' ? 'PM' : m.Mtart === 'ROH' ? 'RM' : 'SF',
    CompOgrp: m.Matkl.split('-')[0], Werks: costPlant, Zskugrcodecrs: hm.Matkl, Zskugroupcrs: hm.Matkl.replace('FG-', ''),
    Prodha: `EM${hm.Matkl.replace('FG-', '').padEnd(6, '0')}`, Zskusize: hm.Maktx.match(/\d+\s*(ml|g)/)?.[0] ?? '',
    Zscheme: '', Ntgew: n(m.Mtart === 'VERP' ? 0.012 : 1, 3), Matkl: m.Matkl, Zbusiness: 'DOMESTIC',
    Menge: n(menge, 3), Bmeng: n(bmeng, 3), Bmein: bmein, Hbmeng: n(1000, 3), Hbmein: 'PC',
    LocCurr: loc, SelCurrLocal: loc,
  };

  let qtyUsed = prodQty;
  if (p.budatFrom) {
    qtyUsed = prodQty * (0.96 + rnd(`${comp}|${costPlant}|act`) * 0.08);
    Object.assign(base, { Usedqty: n(qtyUsed, 3), Qtysrc: 'ACTUAL' });
  } else Object.assign(base, { Usedqty: n(prodQty, 3), Qtysrc: 'MANUAL' });
  base.ProdQty = n(qtyUsed, 3);
  const q = Number(base.ProdQty);

  if (hasChild) {
    return { raw: { ...base, RateOptions: [] }, leaf: false, children: [] };
  }

  let opts = usableOptions(comp, costPlant, p);
  let donor = '';
  if (opts.length === 0 && p.donor && p.donor !== costPlant) {
    opts = usableOptions(comp, p.donor, p);
    if (opts.length) donor = p.donor;
  }
  const sel = pick(opts, p.prio);
  const optRaw = opts.map((o, i) => {
    const fx = FX_INR[o.Curr] / fxLocInr;
    const ratePcLoc = o.ratePc * fx;
    const ratePcInr = ratePcLoc * fxLocInr;
    return {
      ...meta(ENTITY_TYPE_RATE_OPTION, `RateOptions(Seqnr=${seq},Idx=${i})`),
      Seqnr: seq, Hwerks: hwerks, Headmat: head, Source: o.Source, Cond: o.Cond, Curr: o.Curr, LocCurr: loc, Uom: o.Uom,
      Plant: o.Plant, ValidFrom: d(o.ValidFrom), Rate: n(o.ratePc * o.priceUnit, 4), RateLoc: n(ratePcLoc * o.priceUnit, 4),
      Fx: n(fx, 6), FxInr: n(fxLocInr, 6), RatePc: n(o.ratePc, 6), RatePcLoc: n(ratePcLoc, 6), RatePcInr: n(ratePcInr, 6),
      CostLoc: n(ratePcLoc * q, 2), CostInr: n(ratePcInr * q, 2),
    };
  });

  const selRaw = sel ? optRaw[opts.indexOf(sel)] : undefined;
  const ratePc = selRaw ? Number(selRaw.RatePc) : 0;
  const ratePcLoc = selRaw ? Number(selRaw.RatePcLoc) : 0;
  const ratePcInr = selRaw ? Number(selRaw.RatePcInr) : 0;

  // Freight: a few % of the material value, actual vs standard.
  let frtPcLoc = 0;
  let frtSrc = '';
  const frtBase = (m.base / fxLocInr) * (m.Mtart === 'VERP' ? 0.022 : 0.035) * (0.8 + rnd(`${comp}|${costPlant}|frt`) * 0.4);
  if (p.inclFrt && m.base > 0) {
    const hasActual = rnd(`${comp}|${costPlant}|fa`) < 0.8;
    frtSrc = p.stdFrt || !hasActual ? 'STANDARD' : 'ACTUAL';
    frtPcLoc = frtSrc === 'STANDARD' ? frtBase * 1.08 : frtBase;
  }
  const frtPcInr = frtPcLoc * fxLocInr;
  const totPcLoc = Number(n(ratePcLoc, 6)) + Number(n(frtPcLoc, 6));
  const totPcInr = Number(n(ratePcInr, 6)) + Number(n(frtPcInr, 6));

  const r: Raw = {
    ...base,
    SelSource: sel?.Source ?? '', SelCond: sel?.Cond ?? '', SelCurr: sel?.Curr ?? '', SelVendor: sel?.vendor ?? '',
    SelVname: sel?.vname ?? '', SrcCount: opts.length, Donor: donor,
    SelRate: n(sel ? sel.ratePc * sel.priceUnit : 0, 4), SelRateLocal: n(sel ? ratePcLoc * sel.priceUnit : 0, 4),
    SelRatePc: n(ratePc, 6), SelRatePcLoc: n(ratePcLoc, 6), SelFx: selRaw ? selRaw.Fx : n(0, 6),
    CompCost: n(ratePc * q, 2), CompCostLocal: n(ratePcLoc * q, 2), SelFxInr: n(sel ? fxLocInr : 0, 6),
    SelRateInr: n(sel ? ratePcInr * sel.priceUnit : 0, 4), SelRatePcInr: n(ratePcInr, 6), CompCostInr: n(ratePcInr * q, 2),
    DelvAsof: d(p.asof || '2026-10-01'), FrtSrc: frtSrc, FrtCurr: frtSrc ? loc : '',
    TotActDelv: n(frtSrc === 'ACTUAL' ? 1000 + rnd(`${comp}ad`) * 50000 : 0, 3), TotStdDelv: n(frtSrc ? 1000 + rnd(`${comp}sd`) * 50000 : 0, 3),
    FrtFx: n(frtSrc ? 1 : 0, 6), FrtPcLoc: n(frtPcLoc, 6), FrtPcInr: n(frtPcInr, 6),
    TotCostPcLoc: n(totPcLoc, 6), TotCostLoc: n(totPcLoc * q, 2), TotCostPcInr: n(totPcInr, 6), TotCostInr: n(totPcInr * q, 2),
    [NAV_RATE_OPTIONS]: optRaw,
  };
  if (p.inclBudget) {
    const landed = totPcInr * (0.88 + rnd(`${comp}|${costPlant}|bud${p.budgetYr}`) * 0.22);
    Object.assign(r, {
      BudGjahr: String(p.budgetYr), BudSource: 'ZBUDGET', BudSrccurr: sel?.Curr ?? loc, BudLanded: n(landed, 6),
      BudSrcamt: n(landed / FX_INR[sel?.Curr ?? loc], 6), BudExchrate: n(FX_INR[sel?.Curr ?? loc], 5),
    });
  }
  if (p.inclCover) {
    const daily = Math.max(q / 30, 0.001);
    const stock = q * rnd(`${comp}|${costPlant}|st`) * 3;
    const po = q * rnd(`${comp}|${costPlant}|po`) * 2;
    const pr = q * rnd(`${comp}|${costPlant}|pr`);
    const avail = stock + po + pr;
    const noReq = rnd(`${comp}|${costPlant}|nr`) < 0.12;
    const cov = (h: number) => (noReq ? 999 : Math.min(998, Math.round((avail / (daily * h)) * h)));
    Object.assign(r, {
      StockQty: n(stock, 3), Eisbe: n(q * 0.2, 3), OpenpoQty: n(po, 3), OpenprQty: n(pr, 3), TotalAvail: n(avail, 3),
      ReqH1: n(noReq ? 0 : daily * p.hor[0], 3), ReqH2: n(noReq ? 0 : daily * p.hor[1], 3), ReqH3: n(noReq ? 0 : daily * p.hor[2], 3),
      CovH1: n(cov(p.hor[0]), 0), CovH2: n(cov(p.hor[1]), 0), CovH3: n(cov(p.hor[2]), 0),
    });
  }
  return { raw: r, leaf: true, children: [] };
}

/** Rolls children into a parent row the way SAP does (parents carry the subtree's cost). */
function rollParent(parent: Line) {
  const sum = (k: string) => parent.children.reduce((a, c) => a + Number(c.raw[k] ?? 0), 0);
  const q = Number(parent.raw.ProdQty) || 1;
  const totInr = sum('TotCostInr');
  const totLoc = sum('TotCostLoc');
  Object.assign(parent.raw, {
    CompCostInr: n(sum('CompCostInr'), 2), CompCostLocal: n(sum('CompCostLocal'), 2), TotCostInr: n(totInr, 2),
    TotCostLoc: n(totLoc, 2), TotCostPcInr: n(totInr / q, 6), TotCostPcLoc: n(totLoc / q, 6),
  });
}

function explode(head: string, hwerks: string, costPlant: string, p: Params, seqStart: number): Raw[] {
  const out: Line[] = [];
  let seq = seqStart;
  const walk = (mat: string, qtyNeeded: number, level: number, parentLine: Line | null) => {
    const bom = BOMS[mat];
    for (const it of bom.items) {
      const prodQty = (it.qty * qtyNeeded) / bom.base;
      const sub = BOMS[it.comp];
      const hasChild = !!sub && (p.maxLevel === 0 || level < p.maxLevel);
      const line = costLine(++seq, head, hwerks, costPlant, it.comp, level, mat, prodQty, it.qty, bom.base, bom.unit, hasChild, p);
      out.push(line);
      parentLine?.children.push(line);
      if (hasChild) {
        walk(it.comp, Number(line.raw.ProdQty), level + 1, line);
        rollParent(line);
      }
    }
  };
  walk(head, p.explQty, 1, null);
  return out.map((l) => l.raw);
}

function costLines(p: Params, expand: boolean, msgs: Msg[]): Raw[] {
  const mats = validateMats(p, msgs);
  const rows: Raw[] = [];
  const pairs: [string, string][] = []; // [BOM plant, plant being costed]
  if (p.mode === 'C') {
    const [bp] = validatePlants(p, p.werks.slice(0, 1), msgs);
    if (bp) for (const cp of validatePlants(p, p.cplnt, msgs)) pairs.push([bp, cp]);
  } else {
    for (const w of validatePlants(p, p.werks, msgs)) pairs.push([w, w]);
  }
  if (p.donor && !plantOf(p.donor)) msgs.push({ code: 'ZBOM/013', message: `Donor plant ${p.donor} ignored: not authorised`, severity: 'warning' });
  let seq = 0;
  for (const head of mats) {
    if (!BOMS[head] || MAT.get(head)!.Mtart !== 'FERT') {
      msgs.push({ code: 'ZBOM/006', message: `Material ${head} skipped: not a finished good with a BOM`, severity: 'warning' });
      continue;
    }
    for (const [bomPlant, cp] of pairs) {
      if (NO_BOM[head]?.includes(bomPlant)) {
        msgs.push({ code: 'ZBOM/007', message: `No BOM for ${head} in plant ${bomPlant} (usage 1)`, severity: 'warning' });
        continue;
      }
      // Hwerks = the plant being costed (BOM plant in B, comparison plant in C); Werks = component plant.
      const lines = explode(head, cp, cp, p, seq);
      seq += lines.length;
      rows.push(...lines);
    }
  }
  const noRate = rows.filter((r) => r.HasChild === '' && r.SelSource === '').length;
  if (noRate) msgs.push({ code: 'ZBOM/020', message: `${noRate} component line(s) have no rate in the look-back window`, severity: 'warning' });
  const donor = rows.filter((r) => r.Donor).length;
  if (donor) msgs.push({ code: 'ZBOM/021', message: `${donor} component line(s) costed from donor plant ${p.donor}`, severity: 'info' });
  return rows.map((r) => {
    const opts = r[NAV_RATE_OPTIONS] as Raw[];
    return { ...r, [NAV_RATE_OPTIONS]: expand ? { results: opts } : { __deferred: { uri: `${SERVICE}/${ENTITY_SET.COST_LINES}(${r.Seqnr})/${NAV_RATE_OPTIONS}` } } };
  });
}

/** Distinct leaf RM/PM materials under the given materials (or the material itself). */
function leafMaterials(mats: string[]): string[] {
  const out = new Set<string>();
  const walk = (m: string) => {
    const b = BOMS[m];
    if (!b) return void out.add(m);
    b.items.forEach((i) => walk(i.comp));
  };
  mats.forEach(walk);
  return Array.from(out).filter((m) => (MAT.get(m)?.base ?? 0) > 0);
}

function rates(p: Params, msgs: Msg[]): Raw[] {
  const mats = leafMaterials(validateMats(p, msgs));
  const plants = validatePlants(p, p.werks, msgs);
  const rows: Raw[] = [];
  for (const mat of mats) {
    const m = MAT.get(mat)!;
    for (const w of plants) {
      const loc = plantOf(w)!.Waers;
      for (const o of usableOptions(mat, w, p)) {
        const versions = 1 + (hash(`${mat}${w}${o.Source}`) % 3);
        for (let v = 0; v < versions; v++) {
          const drift = 1 - v * 0.035;
          const from = new Date(Date.parse(o.ValidFrom) - v * 95 * 86400000).toISOString().slice(0, 10);
          const to = v === 0 ? '9999-12-31' : new Date(Date.parse(o.ValidFrom) - (v - 1) * 95 * 86400000 - 86400000).toISOString().slice(0, 10);
          const ratePc = o.ratePc * drift;
          const fx = FX_INR[o.Curr] / FX_INR[loc];
          const id = rows.length + 1;
          rows.push({
            ...meta('RateRow', `${ENTITY_SET.RATES}(${id})`),
            RowId: id, Recordsource: o.Source, Material: mat, Matdesc: m.Maktx, Plant: w, Vendor: o.vendor, Vendorname: o.vname,
            Inforecord: o.Source === 'INFOREC' ? `53${String(hash(mat + w) % 1e8).padStart(8, '0')}` : '',
            Purchasedocument: o.Source === 'CONTRACT' ? `46${String(hash(w + mat) % 1e8).padStart(8, '0')}` : '',
            Conditiontype: o.Cond, Validfrom: d(from), Validto: d(to), Currency: o.Curr, Pricingunit: n(o.priceUnit, 0),
            Conditionunit: m.Meins, Baseuom: m.Meins, Localcurrency: loc, Rate: n(ratePc * o.priceUnit, 4), RateUnit: n(ratePc * o.priceUnit, 4),
            RatePc: n(ratePc, 6), Ratelocal: n(ratePc * fx * o.priceUnit, 4), RateUnitLoc: n(ratePc * fx * o.priceUnit, 4),
            RatePcLoc: n(ratePc * fx, 6), FxFactor: n(fx, 6), FxInr: n(FX_INR[loc], 6), RateUnitInr: n(ratePc * FX_INR[o.Curr] * o.priceUnit, 4),
            RatePcInr: n(ratePc * FX_INR[o.Curr], 6),
          });
        }
      }
    }
  }
  return rows;
}

/** FreightRowSet with the optional Ekorg (purchasing organisation) selection, like SAP once it has the property. */
function freight(p: Params, msgs: Msg[]): Raw[] {
  const rows = freightAll(p, msgs);
  return p.ekorg.length ? rows.filter((r) => p.ekorg.includes(String(r.Ekorg))) : rows;
}

function freightAll(p: Params, msgs: Msg[]): Raw[] {
  const mats = leafMaterials(validateMats(p, msgs));
  const plants = validatePlants(p, p.werks, msgs);
  const rows: Raw[] = [];
  for (const mat of mats) {
    const m = MAT.get(mat)!;
    for (const w of plants) {
      const loc = plantOf(w)!.Waers;
      const fxInr = FX_INR[loc];
      const count = 2 + (hash(mat + w + 'po') % 5);
      for (let i = 0; i < count; i++) {
        const days = Math.floor(rnd(`${mat}${w}${i}pd`) * 400);
        if (days > p.freightDays) continue;
        const qty = 200 + rnd(`${mat}${w}${i}q`) * 20000;
        const actRate = (m.base / fxInr) * (m.Mtart === 'VERP' ? 0.022 : 0.035) * (0.85 + rnd(`${mat}${w}${i}r`) * 0.3);
        const stdRate = actRate * 1.08;
        const hasAct = rnd(`${mat}|${w}|fa`) < 0.8;
        const used = p.stdFrt || !hasAct ? 'STANDARD' : 'ACTUAL';
        const usedRate = used === 'ACTUAL' ? actRate : stdRate;
        const id = `${mat}-${w}-${i}`;
        rows.push({
          ...meta('FreightRow', `${ENTITY_SET.FREIGHT}('${id}')`),
          Rowid: hash(id) % 1e9, Ekorg: ['1000', '2000'][hash(id + 'o') % 2], Material: mat, Matdesc: m.Maktx, Plant: w, Conditiontype: 'ZFR1',
          Bukrs: '1000', FgMatnr: `FG${String(hash(id) % 9000 + 1000)}`, Lifnr: `00${String(10000 + (hash(id + 'v') % 90000))}`, Name1: ['Blue Dart Logistics', 'Safexpress Pvt Ltd', 'VRL Logistics'][hash(id + 'n') % 3],
          Belnr: `51${String(hash(id + 'b') % 1e8).padStart(8, '0')}`, Xblnr: `INV/${hash(id + 'x') % 99999}`, Ztmode: ['T01', 'T02', 'T03'][hash(id + 't') % 3], GstPart: `19AAAC${String(hash(id + 'g') % 9999).padStart(4, '0')}`.slice(0, 10), PlcSup: 'WB',
          Purchasedocument: `45${String(hash(id) % 1e8).padStart(8, '0')}`, Purchaseline: String((i + 1) * 10).padStart(5, '0'),
          Podate: d(new Date(Date.parse('2026-10-01') - days * 86400000).toISOString().slice(0, 10)), Baseunit: m.Meins, Matuom: m.Meins,
          Currency: loc, Localcurrency: loc, Actualdelvquantity: n(hasAct ? qty : 0, 3), Actualdelvcostamount: n(hasAct ? qty * actRate : 0, 2),
          ActRate: n(hasAct ? actRate : 0, 6), Stddelvquantity: n(qty, 3), Stddelvcostamount: n(qty * stdRate, 2), StdRate: n(stdRate, 6),
          UsedSrc: used, UsedRate: n(usedRate, 6), UsedRatePc: n(usedRate, 6), FxFactor: n(1, 6), UsedPcLoc: n(usedRate, 6),
          FxInr: n(fxInr, 6), UsedPcInr: n(usedRate * fxInr, 6),
        });
      }
    }
  }
  const ts = (r: Raw) => Number(/\d+/.exec(String(r.Podate))?.[0] ?? 0);
  rows.sort((a, b) => String(a.Material).localeCompare(String(b.Material)) || String(a.Plant).localeCompare(String(b.Plant)) || ts(b) - ts(a));
  if (p.allItems) return postingRows(rows);
  if (!p.latestOnly) return rows;
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.Material}|${r.Plant}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * FreightRowSet with AllItems eq 'X' (the SAP change behind NEXT_PUBLIC_FREIGHT_ALL_ITEMS): one row per POSTING instead of one per PO line.
 * Each PO line of the old answer becomes 2 to 4 postings on different dates. The LAST posting of a side (the max posting date) carries
 * the old row's full quantity and amount, so keeping only IsMaxDate postings gives back exactly the old answer; earlier postings are
 * extra receipts / invoices. Vgabe 1 = goods receipt = standard side, 2 / 3 = invoice = actual side; an actual posting carries only
 * actual quantity / amount, a standard posting only standard ones. The first PO line with an actual delivery has exactly 2 actual and
 * 2 standard postings, and one posting is a credit (Shkzg H). IsLatestPo marks the newest PO line of each material, plant and condition.
 */
function postingRows(lines: Raw[]): Raw[] {
  const out: Raw[] = [];
  const latest = new Set<string>();
  const seen = new Set<string>();
  const sorted = [...lines].sort((a, b) => String(a.Material).localeCompare(String(b.Material)) || String(a.Plant).localeCompare(String(b.Plant)) || (Number(/\d+/.exec(String(b.Podate))?.[0] ?? 0) - Number(/\d+/.exec(String(a.Podate))?.[0] ?? 0)));
  for (const l of sorted) {
    const k = `${l.Material}|${l.Plant}|${l.Conditiontype}`;
    if (!seen.has(k)) { seen.add(k); latest.add(`${l.Material}|${l.Plant}|${l.Purchasedocument}|${l.Purchaseline}|${l.Conditiontype}`); }
  }
  let seq = 0;
  let exact = false;
  let credit = false;
  for (const l of sorted) {
    const id = `${l.Material}|${l.Plant}|${l.Purchasedocument}|${l.Purchaseline}`;
    const aq = Number(l.Actualdelvquantity);
    const sq = Number(l.Stddelvquantity);
    const hasAct = aq > 0;
    const twoTwo = hasAct && !exact;
    if (twoTwo) exact = true;
    const kAct = hasAct ? (twoTwo ? 2 : 1 + (hash(id + 'ka') % 2)) : 0;
    const kStd = twoTwo || !hasAct ? 2 : 1 + (hash(id + 'ks') % 2); // 2 to 4 postings per PO line
    const poMs = Number(/\d+/.exec(String(l.Podate))?.[0] ?? 0);
    const isLatest = latest.has(`${id}|${l.Conditiontype}`);
    const emit = (side: 'actual' | 'standard', count: number) => {
      for (let j = 0; j < count; j++) {
        const last = j === count - 1;
        const frac = last ? 1 : 0.2 + 0.15 * j; // earlier postings: smaller extra receipts / invoices
        const qty = (side === 'actual' ? aq : sq) * frac;
        const amt = Number(side === 'actual' ? l.Actualdelvcostamount : l.Stddelvcostamount) * frac * (last ? 1 : 0.97 + 0.02 * j);
        const vgabe = side === 'standard' ? '1' : last && count > 1 && hash(id + 'v3') % 3 === 0 ? '3' : '2';
        const isCredit = side === 'actual' && !last && !credit;
        if (isCredit) credit = true;
        const offset = (side === 'standard' ? 2 : 5) + j * 6 + (hash(`${id}${side}${j}`) % 3); // days after the PO date, different per posting
        seq++;
        out.push({
          ...l, __metadata: { ...(l.__metadata as object) } as never,
          Rowid: 1_000_000 + seq,
          Cpudt: d(new Date(poMs + offset * 86400000).toISOString().slice(0, 10)),
          Vgabe: vgabe, Buzei: String(j + 1).padStart(3, '0'), Gjahr: '2026', Shkzg: isCredit ? 'H' : 'S',
          Belnr: `5${vgabe === '1' ? '0' : '1'}${String(hash(`${id}${side}${j}b`) % 1e8).padStart(8, '0')}`,
          Actualdelvquantity: n(side === 'actual' ? qty : 0, 3), Actualdelvcostamount: n(side === 'actual' ? amt : 0, 2), ActRate: n(side === 'actual' ? Number(l.ActRate) : 0, 6),
          Stddelvquantity: n(side === 'standard' ? qty : 0, 3), Stddelvcostamount: n(side === 'standard' ? amt : 0, 2), StdRate: n(side === 'standard' ? Number(l.StdRate) : 0, 6),
          IsMaxDate: last ? 'X' : '', IsLatestPo: isLatest ? 'X' : '',
        });
      }
    };
    emit('actual', kAct);
    emit('standard', kStd);
  }
  return out;
}

function rmpm(p: Params, msgs: Msg[]): Raw[] {
  const lines = costLines({ ...p, mode: 'B', inclFrt: true, inclBudget: false, inclCover: false, budatFrom: '' }, true, msgs).filter((r) => r.HasChild === '');
  const agg = new Map<string, Raw[]>();
  for (const l of lines) {
    const k = `${l.Idnrk}|${l.Werks}`;
    agg.set(k, [...(agg.get(k) ?? []), l]);
  }
  return Array.from(agg.values()).map((group) => {
    const l = group[0];
    const qty = group.reduce((a, g) => a + Number(g.ProdQty), 0);
    const fxInr = FX_INR[String(l.LocCurr)];
    const ratePcLoc = Number(l.SelRatePcLoc);
    const frtPcLoc = Number(l.FrtPcLoc);
    return {
      ...meta('RmPmRow', `${ENTITY_SET.RMPM}(Material='${l.Idnrk}',Plant='${l.Werks}')`),
      Material: l.Idnrk, Matdesc: l.Maktx, Mtart: l.Mtart, Plant: l.Werks, Baseuom: l.Meins, Qty: n(qty, 3),
      RateSrc: l.SelSource, Vendor: l.SelVendor, Vendname: l.SelVname, RateCurr: l.SelCurr, RatePcOrg: l.SelRatePc,
      LocCurr: l.LocCurr, FxLoc: l.SelFx, RatePcLoc: n(ratePcLoc, 6), FrtSrc: l.FrtSrc, FrtPcLoc: n(frtPcLoc, 6),
      TotPcLoc: n(ratePcLoc + frtPcLoc, 6), RateCostLoc: n(ratePcLoc * qty, 2), FrtCostLoc: n(frtPcLoc * qty, 2),
      TotCostLoc: n((ratePcLoc + frtPcLoc) * qty, 2), FxInr: n(fxInr, 6), RatePcInr: n(ratePcLoc * fxInr, 6),
      FrtPcInr: n(frtPcLoc * fxInr, 6), TotPcInr: n((ratePcLoc + frtPcLoc) * fxInr, 6), RateCostInr: n(ratePcLoc * fxInr * qty, 2),
      FrtCostInr: n(frtPcLoc * fxInr * qty, 2), TotCostInr: n((ratePcLoc + frtPcLoc) * fxInr * qty, 2),
    };
  });
}

// ---- $metadata --------------------------------------------------------------------------------
const EDM: Record<FieldKind, string> = { s: 'Edm.String', d: 'Edm.Decimal', i: 'Edm.Int32', b: 'Edm.Boolean', t: 'Edm.DateTime', f: 'Edm.String' };

/** Internal keys -> the SAP property names in fields.ts (e.g. HasChild -> Haschild), the way the
 * live service spells them. */
function toSap(raw: Raw, map: FieldMap, nav?: FieldMap): Raw {
  const out: Raw = {};
  for (const [k, v] of Object.entries(raw)) out[map[k]?.[0] ?? k] = v;
  const n = out[NAV_RATE_OPTIONS] as { results?: Raw[] } | undefined;
  if (nav && n?.results) out[NAV_RATE_OPTIONS] = { results: n.results.map((o) => toSap(o, nav)) };
  return out;
}

export function metadataXml(drop: string[] = []): string {
  const prop = (name: string, k: FieldKind, filterable: boolean) =>
    `<Property Name="${name}" Type="${EDM[k]}" Nullable="false"${k === 'd' ? ' Precision="23" Scale="6"' : ''} sap:filterable="${filterable}"/>`;
  const props = (m: FieldMap, filterable: boolean) => Object.values(m).filter(([name]) => !drop.includes(name)).map(([name, k]) => prop(name, k, filterable)).join('');
  const sets = Object.entries(ENTITY_SET) as [EntitySetKey, string][];
  const types = sets.map(([k]) => {
    const fields = FIELDS_BY_SET[k] as FieldMap;
    const isSel = (SELECTION_SETS as readonly string[]).includes(k);
    const sel = isSel
      ? Object.fromEntries(Object.keys(SELECTION).map((sk) => [sk, selectionField(k, sk as keyof typeof SELECTION)]).filter(([, [n]]) => !Object.values(fields).some(([f]) => f === n)))
      : {};
    const selFieldNames = new Set(Object.values(SELECTION).map(([n]) => n));
    const resultProps = Object.values(fields).filter(([name]) => !drop.includes(name)).map(([name, kind]) => prop(name, kind, isSel && selFieldNames.has(name))).join('');
    const nav = k === 'COST_LINES' ? `<NavigationProperty Name="${NAV_RATE_OPTIONS}" Relationship="${SERVICE}.CostLineRateOptions" FromRole="FromRole" ToRole="ToRole"/>` : '';
    return `<EntityType Name="${MOCK_TYPES[k]}"><Key><PropertyRef Name="${Object.values(fields)[0][0]}"/></Key>${resultProps}${props(sel as FieldMap, true)}${nav}</EntityType>`;
  });
  types.push(`<EntityType Name="${ENTITY_TYPE_RATE_OPTION}"><Key><PropertyRef Name="Seqnr"/></Key>${props(RATE_OPTION, false)}</EntityType>`);
  const container = sets.map(([k, s]) => `<EntitySet Name="${s}" EntityType="${SERVICE}.${MOCK_TYPES[k]}" sap:content-version="1"/>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata" xmlns:sap="http://www.sap.com/Protocols/SAPData"><edmx:DataServices m:DataServiceVersion="2.0"><Schema Namespace="${SERVICE}" xmlns="http://schemas.microsoft.com/ado/2008/09/edm">${types.join('')}<EntityContainer Name="${SERVICE}_Entities" m:IsDefaultEntityContainer="true">${container}</EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}

// ---- request handling -------------------------------------------------------------------------
function json(body: unknown, status = 200, msgs: Msg[] = []): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (msgs.length) {
    const [first, ...rest] = msgs;
    headers['sap-message'] = JSON.stringify({ ...first, target: '', details: rest.map((m) => ({ ...m, target: '' })) });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function odataError(status: number, code: string, message: string): Response {
  return json({ error: { code, message: { lang: 'en', value: message }, innererror: { errordetails: [{ code, message, severity: 'error' }] } } }, status);
}

function sleep(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
}

const delay = () => Number(process.env.MOCK_SAP_DELAY_MS ?? 250);

function page(rows: Raw[], sp: URLSearchParams) {
  const skip = Number(sp.get('$skip') ?? 0);
  const top = sp.get('$top') ? Number(sp.get('$top')) : rows.length;
  const d: Raw = { results: rows.slice(skip, skip + top) };
  if (sp.get('$inlinecount') === 'allpages') d.__count = String(rows.length);
  return { d };
}

/** Every URL the mock was asked for (tests assert RateOptionSet / per-line navigations never are). */
export const mockRequestLog: string[] = [];

/** fetch-compatible entry point. */
export async function mockSapFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  mockRequestLog.push(url.pathname + url.search);
  if (mockRequestLog.length > 500) mockRequestLog.shift();
  const signal = init?.signal ?? undefined;
  const set = decodeURIComponent(url.pathname.split('/').pop() || '');
  const sp = url.searchParams;

  if (set === '$metadata') {
    const drop = (process.env.MOCK_SAP_METADATA_DROP || '').split(',').filter(Boolean);
    return new Response(metadataXml(drop), { headers: { 'Content-Type': 'application/xml' } });
  }
  if (set === ENTITY_SET.PLANTS) {
    await sleep(60, signal);
    return json({ d: { results: PLANTS.map((p) => ({ ...meta('PlantVH', `${ENTITY_SET.PLANTS}('${p.Werks}')`), [PLANT.Werks[0]]: p.Werks, [PLANT.Name1[0]]: p.Name1, [PLANT.Land1[0]]: p.Land1, [PLANT.Waers[0]]: p.Waers })) } });
  }
  if (set === ENTITY_SET.CONFIG) {
    const cfg = { GROUP_CURR: 'INR', DEFAULT_PRIO: 'CONTRACT,INFOREC,MARKT,CONSUMP,MBEW', MAX_HEADS: '50' };
    return json({ d: { results: Object.entries(cfg).map(([k, v]) => ({ ...meta('ConfigItem', `${ENTITY_SET.CONFIG}('${k}')`), [CONFIG.CfgKey[0]]: k, [CONFIG.CfgVal[0]]: v })) } });
  }
  // RateOption: InclFrt, StdFrt, InclBudget, InclCover, UseAsof, LatestOnly are Edm.String (CHAR1) - a boolean
  // literal is refused like SAP does (CostLine keeps them as Edm.Boolean).
  if (set === 'RateOptionSet' && /\b(InclFrt|StdFrt|InclBudget|InclCover|UseAsof|LatestOnly) eq (true|false)\b/.test(sp.get('$filter') ?? '')) {
    return odataError(400, '/IWBEP/CM_MGW_RT/001', "Invalid parametertype used at function 'eq'");
  }
  // HierVHSet + MaterialVHSet filtered by Brand / Product / CRS (mock/hier.ts).
  const hierRes = handleHier(set, sp, { json, odataError, parseFilter });
  if (hierRes) { await sleep(60, signal); return hierRes; }
  // Costing dashboard sets (mock/dash.ts): invented figures for local design review.
  const dashRes = handleDash(set, sp, { json, odataError, parseFilter });
  if (dashRes) { await sleep(60, signal); return dashRes; }
  // BomPlantSet: the plants that have a BOM of the materials (every mock material has one in the first two mock plants).
  if (set === 'BomPlantSet') {
    await sleep(60, signal);
    const mats = (parseFilter(sp.get('$filter') ?? '').get('Matnr') ?? []).map((m) => m.toUpperCase());
    const results = mats.flatMap((m) => PLANTS.slice(0, 2).map((pl) => ({ ...meta('BomPlant', `BomPlantSet(Matnr='${m}',Werks='${pl.Werks}',Stlal='1')`), Matnr: m, Werks: pl.Werks, Stlal: '1', Name1: pl.Name1, Stlan: '1', Stlnr: '00000001', Stlst: '01' })));
    return json({ d: { results } });
  }
  // Weighted average actual cost sets (mock/wac.ts).
  const wacRes = handleWac(set, sp, { json, odataError, parseFilter });
  // Budget costing sets (mock/budget.ts).
  const budRes = handleBudget(set, sp, init, { json, odataError, parseFilter });
  if (budRes) { await sleep(60, signal); return budRes; }
  if (wacRes) { await sleep(60, signal); return wacRes; }
  if (set === ENTITY_SET.MATERIALS) {
    await sleep(80, signal);
    // Like SAP: no search term and no filter -> empty list by design.
    if (!(sp.get('search') ?? sp.get('$search') ?? '').trim() && !(sp.get('$filter') ?? '').trim()) return json({ d: { results: [] } });
    const term = (sp.get('search') ?? sp.get('$search') ?? '').toLowerCase();
    const mf = parseFilter(sp.get('$filter') ?? '');
    const exact = mf.get(MATERIAL.Matnr[0]) ?? [];
    let list = MATERIALS;
    // Plant run: (Werks eq ...) and Mtart eq 'FERT' -> the finished goods (every mock FG exists in every mock plant).
    const mtart = mf.get('Mtart') ?? [];
    if (mtart.length) list = list.filter((m) => mtart.includes(m.Mtart));
    if (exact.length) list = list.filter((m) => exact.map((e) => e.toUpperCase()).includes(m.Matnr));
    else if (term) list = list.filter((m) => m.Matnr.toLowerCase().includes(term) || m.Maktx.toLowerCase().includes(term));
    const top = Number(sp.get('$top') ?? 100);
    return json({ d: { results: list.slice(0, top).map((m) => ({ ...meta('MaterialVH', `${ENTITY_SET.MATERIALS}('${m.Matnr}')`), Matnr: m.Matnr, Maktx: m.Maktx, Mtart: m.Mtart, Meins: m.Meins })) } });
  }

  // Production Plan sets (mock/plan.ts): PlanHeadSet / PlanEntrySet / PlanUploadSet / PlanCheckSet /
  // PlanSummarySet / PlanWipSet and CostLineSet with Mode eq 'P'.
  const planRes = await handlePlan(set, sp, init, {
    parseFilter,
    costLinesFor: (matnr, plant, qty, m, expand = false, budget = null) =>
      costLines(params(new Map([['Mode', ['B']], ['Matnr', [matnr]], ['Werks', [plant]], ['ExplQty', [String(qty)]], ...(budget ? [['InclBudget', ['true']], ['BudgetYr', [budget.year]]] as [string, string[]][] : [])])), expand, m).map((r) => toSap(r, COST_LINE, RATE_OPTION)),
    json, odataError, sleep, delay,
  });
  if (planRes) return planRes;

  // ActivityCostSet (live on NGQ / NWP): routing activities per material x BOM alternative x period, shaped like the
  // live rows - every row twice, two BOM alternatives with the same routing, ActGrp 'OTHER', ValuePc 0, a '000' row.
  // FGs: machine, labour, power (packing line); SF bulk: machine, labour, power, steam. MOCK_SAP_ACTIVITY=missing -> 404.
  if (set === 'ActivityCostSet') {
    if (process.env.MOCK_SAP_ACTIVITY === 'missing') return odataError(404, '/IWBEP/CM_MGW_RT/020', "Resource not found for segment 'ActivityCostSet'");
    const pf = parseFilter(sp.get('$filter') ?? '');
    const mats = pf.get('Matnr') ?? [];
    const plants = pf.get('Werks') ?? [];
    if (!mats.length && !plants.length) return odataError(400, '/IWBEP/CM_MGW_RT/022', 'Material or plant is required');
    await sleep(100, signal);
    const poper = (pf.get('Poper') ?? ['007'])[0];
    const gjahr = (pf.get('Gjahr') ?? ['2026'])[0];
    const out: Record<string, unknown>[] = [];
    let rowid = 0;
    for (const w of plants.length ? plants : ['1000']) for (const m of mats) {
      const bom = BOMS[m];
      if (!bom || m === 'FG9000') continue;
      const sf = m.startsWith('SF');
      const acts: [string, string, string, number, number][] = sf
        ? [['MACHRS', 'Machine Hours', 'MIN', 48, 69.84], ['LABHRS', 'Labour Hours', 'MIN', 44, 2.18], ['POWER', 'Power', 'KWH', 9.5, 5.82], ['STEAM', 'Steam', 'KG', 40, 2.91]]
        : [['MACHRS', 'Machine Hours', 'MIN', 3, 69.84], ['LABHRS', 'Labour Hours', 'MIN', 80, 2.18], ['POWER', 'Power', 'KWH', 1.4, 5.82]];
      const v = 1 + ((hash(`${w}${m}act`) % 7) - 3) / 100;
      for (const stlal of ['1', '2']) for (const [i, [lstar, name, unit, q, price]] of acts.entries()) for (const per of [poper, ...(i === 0 && stlal === '1' ? ['000'] : [])]) for (let dup = 0; dup < 2; dup++) {
        const actQty = q * v;
        const p = per === '000' ? 0 : price;
        out.push({
          ...meta('ActivityCost', `ActivityCostSet(${++rowid})`), Rowid: rowid, Matnr: m, Maktx: MAT.get(m)?.Maktx ?? m, Werks: w, Stlnr: String(10000 + (hash(m) % 9000)).padStart(8, '0'), Stlal: stlal,
          Plnnr: String(50000000 + (hash(m) % 90000)), Plnal: '1', Vornr: '0020', Resrc: sf ? 'MIXCR05' : 'PACKL01', ResrcTxt: sf ? 'Mixing vessel 5' : 'Packing line 1', Actseq: i + 2, Poper: per,
          Kokrs: '1000', Kostl: `P${w}03`, Lstar: lstar, ActName: name, ActDesc: name, ActGrp: 'OTHER', GrpSeq: '99', BomUnit: bom.unit, BomQty: n(bom.base, 3), RcpQty: n(bom.base * 10, 3),
          ActQty: n(actQty, 3), ActUnit: unit, Curr: '', ActPrice: n(p, 6), ActValue: n(actQty * p, 2), ValuePc: '0.000000', FxInr: '0.000000', ValuePcInr: '0.000000', NoPrice: 'X', Gjahr: gjahr, Versn: '0', AsofDate: null,
        });
      }
    }
    return json({ d: { results: out } });
  }

  // ProcOrderCostSet (proposed, lib/costbreakup/procOrder): process-order actuals by cost element.
  // MOCK_SAP_PROCORDER=missing -> 404 like the live systems before SAP adds the set.
  if (set === 'ProcOrderCostSet') {
    if (process.env.MOCK_SAP_PROCORDER === 'missing') return odataError(404, '/IWBEP/CM_MGW_RT/020', "Resource not found for segment 'ProcOrderCostSet'");
    await sleep(120, signal);
    const pf = parseFilter(sp.get('$filter') ?? '');
    const plants = pf.get('Werks') ?? ['1000'];
    const fgs = pf.get('Matnr') ?? [];
    const out: Record<string, unknown>[] = [];
    for (const w of plants) for (const fg of fgs) {
      if (!BOMS[fg]) continue;
      for (let o = 0; o < 3; o++) {
        const aufnr = `00${String(1000000 + (hash(`${w}${fg}`) % 800000) + o).padStart(10, '0')}`;
        const yld = 10000 + (hash(`${aufnr}y`) % 5000);
        const budat = `202609${String(5 + o * 8).padStart(2, '0')}`;
        const row = (Element: string, extra: Record<string, unknown>, perPc: number, qtyPc: number, Meins: string) => out.push({
          ...meta('ProcOrderCost', `ProcOrderCostSet('${aufnr}${Element}')`), Werks: w, Matnr: fg, Aufnr: aufnr, Budat: budat, Yield: n(yld, 3), YieldUom: 'PC', Element,
          Lstar: '', Kostl: '', Kstar: '', Idnrk: '', Maktx: '', Menge: n(qtyPc * yld, 3), Meins, Cost: n(perPc * yld, 2), Waers: 'INR', CostInr: n(perPc * yld, 2), ...extra,
        });
        const v = 1 + ((hash(`${aufnr}v`) % 9) - 4) / 100;
        row('RM', { Idnrk: 'RM0001', Maktx: 'Light Liquid Paraffin', Kstar: '51000100' }, 9.2 * v, 0.06, 'KG');
        row('PERFUME', { Idnrk: 'RM0005', Maktx: 'Perfume Compound A', Kstar: '51000110' }, 3.1 * v, 0.001, 'KG');
        row('PM', { Idnrk: 'PM0001', Maktx: 'PET Bottle 100 ml', Kstar: '51000200' }, 6.4 * v, 1.005, 'PC');
        row('LABOUR', { Lstar: 'LAB001', Kostl: `${w}PRD01`, Kstar: '94300001' }, 0.42 * v, 0.0016, 'HR');
        row('POWER', { Lstar: 'PWR001', Kostl: `${w}UTL01`, Kstar: '94300002' }, 0.18 * v, 0.021, 'KWH');
        row('MACHINE', { Lstar: 'MCH001', Kostl: `${w}PRD01`, Kstar: '94300003' }, 0.31 * v, 0.0009, 'HR');
        row('STEAM', { Lstar: 'STM001', Kostl: `${w}UTL02`, Kstar: '94300004' }, 0.07 * v, 0.012, 'KG');
        row('CONV', { Lstar: 'CNV001', Kostl: `${w}TPM01`, Kstar: '94300009' }, 0.25 * v, 1, 'PC');
      }
    }
    return json({ d: { results: out } });
  }

  // MOCK_SAP_RATES picks how rate options can be read (lib/rates):
  //   expand-fails      $expand=RateOptions -> 501 (the live services today); RateOptionSet -> 404
  //   direct-works      RateOptionSet answers flat rows; $expand -> 501
  //   only-expand-works $expand works; RateOptionSet -> 404
  //   expand-empty      $expand answers {results: []} on every line although SrcCount > 0 (SAP bug); RateOptionSet -> 404
  //   (unset)           as before: $expand works, RateOptionSet -> 404
  const ratesMode = process.env.MOCK_SAP_RATES || '';
  const known = [ENTITY_SET.COST_LINES, ENTITY_SET.RATES, ENTITY_SET.FREIGHT, ENTITY_SET.RMPM, ...(ratesMode === 'direct-works' ? ['RateOptionSet'] : [])] as string[];
  if (!known.includes(set)) return odataError(404, '/IWBEP/CM_MGW_RT/020', `Resource not found for segment '${set}'`); // incl. RateOptions on its own

  // MOCK_SAP_NO_FGMATNR=1: a FreightRowSet without FgMatnr (NGQ on 26.10.2026).
  if (process.env.MOCK_SAP_NO_FGMATNR === '1' && set === ENTITY_SET.FREIGHT && /FgMatnr/.test(sp.get('$filter') ?? '')) return odataError(400, '/IWBEP/CM_MGW_RT/004', 'Property FgMatnr not found in type FreightRow');
  const f = parseFilter(sp.get('$filter') ?? '');
  const p = params(f);
  // Like the SAP service after 3 Nov 2026: FreightRowSet and RmPmRowSet take a plant alone, materials alone, or both (no finished good needed).
  // The other sets keep the old rule (a material AND a plant).
  const eitherIsEnough = set === ENTITY_SET.FREIGHT || set === ENTITY_SET.RMPM;
  if (eitherIsEnough && p.mats.length === 0 && p.werks.length === 0) return odataError(400, 'ZBOM/004', 'Enter a plant or at least one material in the filter (Werks / Matnr)');
  if (eitherIsEnough && p.mats.length === 0) p.mats = MATERIALS.filter((m) => BOMS[m.Matnr]).map((m) => m.Matnr).slice(0, 50); // every finished good: its leaves are the plant's components
  if (eitherIsEnough && p.werks.length === 0) p.werks = PLANTS.map((x) => x.Werks);
  if (p.mats.length === 0) return odataError(400, 'ZBOM/001', 'Enter at least one material in the filter (Matnr)');
  if (p.werks.length === 0) return odataError(400, 'ZBOM/003', 'Enter at least one plant in the filter (Werks)');
  if (p.mats.length > 50) return odataError(400, 'ZBOM/002', `At most 50 header materials per request (${p.mats.length} sent)`);
  const fail = p.mats.find((m) => m.startsWith('FAIL'));
  if (fail) return odataError(400, 'ZBOM/099', `Costing for ${fail} failed: BOM explosion error in plant ${p.werks[0] ?? '?'} (mock error)`);

  // Two sample warnings on every selection-set response, so the warnings panel always has content.
  const msgs: Msg[] = [
    { code: 'ZBOM/030', message: 'Mock SAP: exchange rates taken from TCURR (type M) as of 01.10.2026', severity: 'warning' },
    { code: 'ZBOM/031', message: `Mock SAP: rates older than ${p.lookback} days were ignored`, severity: 'warning' },
  ];
  try {
    if (set === ENTITY_SET.COST_LINES) {
      // MOCK_SAP_EXPAND_501=true (or MOCK_SAP_RATES expand-fails / direct-works) reproduces the live service: $expand=RateOptions -> 501.
      if ((process.env.MOCK_SAP_EXPAND_501 === 'true' || ratesMode === 'expand-fails' || ratesMode === 'direct-works') && (sp.get('$expand') ?? '').includes(NAV_RATE_OPTIONS)) {
        return odataError(501, '/IWBEP/CM_MGW_RT/021', "Method 'RATEOPTIONSET_GET_ENTITYSET' not implemented in data provider class.");
      }
      await sleep(delay() + 40 * p.mats.length * Math.max(1, p.werks.length + p.cplnt.length), signal);
      const rows = costLines(p, (sp.get('$expand') ?? '').includes(NAV_RATE_OPTIONS), msgs);
      msgs.unshift({ code: 'ZBOM/000', message: `Costing finished: ${rows.length} line(s)`, severity: 'info' });
      let out = rows.map((r) => toSap(r, COST_LINE, RATE_OPTION));
      if (ratesMode === 'expand-empty') out = out.map((r) => (NAV_RATE_OPTIONS in r ? { ...r, [NAV_RATE_OPTIONS]: { results: [] } } : r));
      // $select like SAP: only the listed properties; an expanded navigation only if selected;
      // an unknown property is a 400.
      const select = (sp.get('$select') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
      if (select.length) {
        const known = new Set([...Object.values(COST_LINE).map(([n]) => n), ...Object.values(SELECTION).map(([n]) => n), NAV_RATE_OPTIONS]);
        const bad = select.find((x) => !known.has(x));
        if (bad) return odataError(400, '/IWBEP/CM_MGW_RT/022', `Property '${bad}' is invalid`);
        const keep = new Set(select);
        out = out.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k === '__metadata' || keep.has(k))));
      }
      return json({ d: { results: out } }, 200, msgs);
    }
    if (set === 'RateOptionSet') {
      // Direct set: one flat row per component and source, with the extra per-component fields.
      await sleep(delay(), signal);
      const lines = costLines(p, true, msgs).map((r) => toSap(r, COST_LINE, RATE_OPTION)) as Raw[];
      const flat: Raw[] = [];
      for (const l of lines) {
        const opts = ((l[NAV_RATE_OPTIONS] as { results?: Raw[] } | Raw[] | undefined) ?? []) as Raw[] | { results?: Raw[] };
        const list = Array.isArray(opts) ? opts : opts.results ?? [];
        for (const o of list) {
          const q = Number(l.ProdQty ?? 0);
          const frtPcLoc = Number(l.FrtPcLoc ?? 0);
          const tot = Number(o.RatePcInr ?? 0) * q + Number(l.FrtPcInr ?? 0) * q;
          flat.push({
            ...o, Cost: o.CostLoc, FrtPcLoc: n(frtPcLoc, 6), TotCostLoc: n(Number(o.RatePcLoc ?? 0) * q + frtPcLoc * q, 2), TotCostInr: n(tot, 2),
            Selected: o.Source === l.SelSource ? 'X' : '', Haschild: l.Haschild, Idnrk: l.Idnrk, Maktx: l.Maktx, Mtart: l.Mtart, Meins: l.Meins,
            Level: l.Level, ProdQty: l.ProdQty, Vendor: l.SelVendor, Vname: l.SelVname,
          });
        }
      }
      return json({ d: { results: flat } }, 200, msgs);
    }
    await sleep(delay(), signal);
    const [all, map] = set === ENTITY_SET.RATES ? [rates(p, msgs), RATE_ROW] : set === ENTITY_SET.FREIGHT ? [freight(p, msgs), FREIGHT_ROW] : [rmpm(p, msgs), RMPM_ROW];
    return json(page(all.map((r) => toSap(r, map as FieldMap)), sp), 200, msgs);
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') throw e;
    return odataError(500, 'ZBOM/500', `Mock SAP internal error: ${(e as Error).message}`);
  }
}

export { SOURCES, COST_LINE, RATE_ROW, FREIGHT_ROW, RMPM_ROW };
