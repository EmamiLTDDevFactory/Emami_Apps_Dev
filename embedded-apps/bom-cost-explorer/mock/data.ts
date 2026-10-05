/**
 * Mock SAP master data + deterministic generators for ZMM_BOM_COST_SRV.
 * Everything here is fictitious sample data for running the app without SAP (MOCK_SAP=true),
 * for the Playwright smoke test, and for local development.
 */

export interface MockPlant { Werks: string; Name1: string; Land1: string; Landx: string; Waers: string }
export const PLANTS: MockPlant[] = [
  { Werks: '1000', Name1: 'Kolkata Plant', Land1: 'IN', Landx: 'India', Waers: 'INR' },
  { Werks: '1100', Name1: 'Pantnagar Plant', Land1: 'IN', Landx: 'India', Waers: 'INR' },
  { Werks: '1200', Name1: 'Guwahati Plant', Land1: 'IN', Landx: 'India', Waers: 'INR' },
  { Werks: '1300', Name1: 'Vapi Plant', Land1: 'IN', Landx: 'India', Waers: 'INR' },
  { Werks: 'BD10', Name1: 'Dhaka Plant', Land1: 'BD', Landx: 'Bangladesh', Waers: 'BDT' },
  { Werks: 'AE10', Name1: 'Dubai Plant', Land1: 'AE', Landx: 'United Arab Emirates', Waers: 'AED' },
];

/** Units of currency X in INR. */
export const FX_INR: Record<string, number> = { INR: 1, USD: 83.42, EUR: 90.15, BDT: 0.7012, AED: 22.71 };

export interface MockMaterial {
  Matnr: string; Maktx: string; Mtart: 'FERT' | 'HALB' | 'ROH' | 'VERP' | 'PKGN'; Meins: string;
  Matkl: string; base: number; importCurr?: string; Ntgew?: number;
}

export const MATERIALS: MockMaterial[] = [
  { Matnr: 'FG1001', Maktx: 'Herbal Hair Oil 100 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-HAIR', base: 0 },
  { Matnr: 'FG1002', Maktx: 'Herbal Hair Oil 200 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-HAIR', base: 0 },
  { Matnr: 'FG1003', Maktx: 'Cooling Hair Oil 300 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-HAIR', base: 0 },
  { Matnr: 'FG2001', Maktx: 'Fairness Cream 50 g', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-SKIN', base: 0 },
  { Matnr: 'FG2002', Maktx: 'Fairness Cream 25 g', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-SKIN', base: 0 },
  { Matnr: 'FG3001', Maktx: 'Pain Balm 10 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-OTC', base: 0 },
  { Matnr: 'FG3002', Maktx: 'Pain Balm 30 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-OTC', base: 0 },
  { Matnr: 'FG4001', Maktx: 'Antiseptic Cream 25 g', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-OTC', base: 0 },
  { Matnr: 'FG5001', Maktx: 'Honey 250 g', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-FOOD', base: 0 },
  { Matnr: 'FG6001', Maktx: 'Body Lotion 200 ml', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-SKIN', base: 0 },
  { Matnr: 'FG9000', Maktx: 'Festive Combo Kit (large BOM)', Mtart: 'FERT', Meins: 'PC', Matkl: 'FG-KIT', base: 0 },
  { Matnr: 'SF1001', Maktx: 'Hair Oil Bulk', Mtart: 'HALB', Meins: 'KG', Matkl: 'SF-BULK', base: 0 },
  { Matnr: 'SF1002', Maktx: 'Cooling Oil Bulk', Mtart: 'HALB', Meins: 'KG', Matkl: 'SF-BULK', base: 0 },
  { Matnr: 'SF2001', Maktx: 'Cream Base Bulk', Mtart: 'HALB', Meins: 'KG', Matkl: 'SF-BULK', base: 0 },
  { Matnr: 'SF3001', Maktx: 'Balm Bulk', Mtart: 'HALB', Meins: 'KG', Matkl: 'SF-BULK', base: 0 },
  { Matnr: 'SF6001', Maktx: 'Lotion Bulk', Mtart: 'HALB', Meins: 'KG', Matkl: 'SF-BULK', base: 0 },
  { Matnr: 'RM0001', Maktx: 'Light Liquid Paraffin', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-OIL', base: 118 },
  { Matnr: 'RM0002', Maktx: 'Refined Sesame Oil', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-OIL', base: 210 },
  { Matnr: 'RM0003', Maktx: 'Menthol Crystals', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-AROMA', base: 1450, importCurr: 'USD' },
  { Matnr: 'RM0004', Maktx: 'Camphor Powder', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-AROMA', base: 780 },
  { Matnr: 'RM0005', Maktx: 'Perfume Compound A', Mtart: 'ROH', Meins: 'KG', Matkl: '106', base: 3200, importCurr: 'EUR' },
  { Matnr: 'RM0006', Maktx: 'Stearic Acid', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-CHEM', base: 142 },
  { Matnr: 'RM0007', Maktx: 'Glycerin IP', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-CHEM', base: 96 },
  { Matnr: 'RM0008', Maktx: 'Purified Water', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-UTIL', base: 0.8 },
  { Matnr: 'RM0009', Maktx: 'Wintergreen Oil', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-AROMA', base: 1180 },
  { Matnr: 'RM0010', Maktx: 'Raw Honey', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-FOOD', base: 265 },
  { Matnr: 'RM0011', Maktx: 'Cetyl Alcohol', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-CHEM', base: 188 },
  { Matnr: 'RM0012', Maktx: 'Preservative Blend', Mtart: 'ROH', Meins: 'KG', Matkl: 'RM-CHEM', base: 640 },
  { Matnr: 'PM0001', Maktx: 'PET Bottle 100 ml', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-BOTTLE', base: 3.1 },
  { Matnr: 'PM0002', Maktx: 'PET Bottle 200 ml', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-BOTTLE', base: 4.6 },
  { Matnr: 'PM0003', Maktx: 'PET Bottle 300 ml', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-BOTTLE', base: 5.9 },
  { Matnr: 'PM0004', Maktx: 'Flip-top Cap 24 mm', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-CAP', base: 0.92 },
  { Matnr: 'PM0005', Maktx: 'Front Label', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-LABEL', base: 0.38 },
  { Matnr: 'PM0006', Maktx: 'Mono Carton', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-CARTON', base: 1.75 },
  { Matnr: 'PM0007', Maktx: 'Shipper Box 5-ply', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-CARTON', base: 38 },
  { Matnr: 'PM0008', Maktx: 'Laminated Tube 50 g', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-TUBE', base: 4.2 },
  { Matnr: 'PM0009', Maktx: 'Laminated Tube 25 g', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-TUBE', base: 3.3 },
  { Matnr: 'PM0010', Maktx: 'Glass Jar 10 ml', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-JAR', base: 2.6 },
  { Matnr: 'PM0011', Maktx: 'Glass Jar 30 ml', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-JAR', base: 4.4 },
  { Matnr: 'PM0012', Maktx: 'PET Jar 250 g', Mtart: 'VERP', Meins: 'PC', Matkl: 'PM-JAR', base: 6.8 },
  { Matnr: 'PM0013', Maktx: 'Shrink Film', Mtart: 'PKGN', Meins: 'KG', Matkl: 'PM-FILM', base: 165 },
];
export const MAT = new Map(MATERIALS.map((m) => [m.Matnr, m]));

export interface BomItem { comp: string; qty: number }
/** Header BOM per base quantity (Hbmeng). Finished goods: per 1000 PC. Bulks: per 100 KG. */
export const BOMS: Record<string, { base: number; unit: string; items: BomItem[] }> = {
  FG1001: { base: 1000, unit: 'PC', items: [{ comp: 'SF1001', qty: 92 }, { comp: 'PM0001', qty: 1005 }, { comp: 'PM0004', qty: 1008 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 21 }] },
  FG1002: { base: 1000, unit: 'PC', items: [{ comp: 'SF1001', qty: 184 }, { comp: 'PM0002', qty: 1005 }, { comp: 'PM0004', qty: 1008 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 42 }] },
  FG1003: { base: 1000, unit: 'PC', items: [{ comp: 'SF1002', qty: 276 }, { comp: 'PM0003', qty: 1005 }, { comp: 'PM0004', qty: 1008 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0007', qty: 50 }, { comp: 'PM0013', qty: 1.8 }] },
  FG2001: { base: 1000, unit: 'PC', items: [{ comp: 'SF2001', qty: 51 }, { comp: 'PM0008', qty: 1006 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 10 }] },
  FG2002: { base: 1000, unit: 'PC', items: [{ comp: 'SF2001', qty: 25.6 }, { comp: 'PM0009', qty: 1006 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 6 }] },
  FG3001: { base: 1000, unit: 'PC', items: [{ comp: 'SF3001', qty: 10.4 }, { comp: 'PM0010', qty: 1004 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 4 }] },
  FG3002: { base: 1000, unit: 'PC', items: [{ comp: 'SF3001', qty: 31 }, { comp: 'PM0011', qty: 1004 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0006', qty: 1004 }, { comp: 'PM0007', qty: 9 }] },
  FG4001: { base: 1000, unit: 'PC', items: [{ comp: 'SF2001', qty: 20 }, { comp: 'RM0012', qty: 0.6 }, { comp: 'RM0004', qty: 0.4 }, { comp: 'PM0009', qty: 1006 }, { comp: 'PM0006', qty: 1004 }] },
  FG5001: { base: 1000, unit: 'PC', items: [{ comp: 'RM0010', qty: 251 }, { comp: 'PM0012', qty: 1004 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0007', qty: 42 }] },
  FG6001: { base: 1000, unit: 'PC', items: [{ comp: 'SF6001', qty: 202 }, { comp: 'PM0002', qty: 1005 }, { comp: 'PM0004', qty: 1008 }, { comp: 'PM0005', qty: 1010 }, { comp: 'PM0007', qty: 42 }] },
  SF1001: { base: 100, unit: 'KG', items: [{ comp: 'RM0001', qty: 62 }, { comp: 'RM0002', qty: 34 }, { comp: 'RM0005', qty: 1.2 }, { comp: 'RM0012', qty: 0.3 }] },
  SF1002: { base: 100, unit: 'KG', items: [{ comp: 'SF1001', qty: 90 }, { comp: 'RM0003', qty: 2.4 }, { comp: 'RM0004', qty: 1.1 }] },
  SF2001: { base: 100, unit: 'KG', items: [{ comp: 'RM0006', qty: 14 }, { comp: 'RM0007', qty: 6 }, { comp: 'RM0011', qty: 3 }, { comp: 'RM0008', qty: 74 }, { comp: 'RM0005', qty: 0.6 }, { comp: 'RM0012', qty: 0.4 }] },
  SF3001: { base: 100, unit: 'KG', items: [{ comp: 'RM0003', qty: 18 }, { comp: 'RM0004', qty: 9 }, { comp: 'RM0009', qty: 12 }, { comp: 'RM0001', qty: 61 }] },
  SF6001: { base: 100, unit: 'KG', items: [{ comp: 'RM0008', qty: 78 }, { comp: 'RM0007', qty: 8 }, { comp: 'RM0011', qty: 4 }, { comp: 'RM0006', qty: 6 }, { comp: 'RM0005', qty: 0.5 }, { comp: 'RM0012', qty: 0.5 }] },
};

// FG9000: a deliberately big multi-level kit (~2,100 rows per plant) so 10k+ row trees can be
// tested with a handful of plants.
(function buildKit() {
  const fgs = ['FG1001', 'FG1002', 'FG1003', 'FG2001', 'FG2002', 'FG3001', 'FG3002', 'FG4001', 'FG5001', 'FG6001'];
  const items: BomItem[] = [];
  for (let i = 0; i < 200; i++) items.push({ comp: fgs[i % fgs.length], qty: 1000 + (i % 7) * 50 });
  BOMS.FG9000 = { base: 1000, unit: 'PC', items };
})();

/** Plants where a header has no BOM (SAP reports it in sap-message and skips it). */
export const NO_BOM: Record<string, string[]> = { FG5001: ['BD10', 'AE10'], FG9000: ['AE10'] };

// ---- deterministic randomness ------------------------------------------------------------------
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Stable pseudo-random in [0,1) for a key. */
export const rnd = (key: string) => (hash(key) % 100000) / 100000;

export const SOURCES = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] as const;
export type Src = (typeof SOURCES)[number];

export interface MockOption {
  Source: Src; Cond: string; Curr: string; Uom: string; Plant: string; ValidFrom: string;
  /** price per piece (base unit) in Curr */
  ratePc: number; priceUnit: number; vendor: string; vname: string;
}

const VENDORS = [
  ['100231', 'Shree Petrochem Pvt Ltd'], ['100877', 'Eastern Polymers'], ['101045', 'Aroma Naturals Ltd'],
  ['101322', 'Bengal Packaging Co'], ['102118', 'Global Menthol Trading'], ['102776', 'Fragrance House GmbH'],
  ['103004', 'Unity Cartons'], ['103590', 'Northeast Chemicals'],
];

/** Every rate option SAP would consider for a component in a plant (empty -> no rate there). */
export function optionsFor(matnr: string, plant: string, asof?: string): MockOption[] {
  const m = MAT.get(matnr);
  if (!m || m.base <= 0) return [];
  const p = PLANTS.find((x) => x.Werks === plant);
  if (!p) return [];
  // A few genuine gaps so "no rate" and donor-plant logic have something to show.
  if (plant === '1300' && (matnr === 'RM0009' || matnr === 'PM0011')) return [];
  if (plant === 'AE10' && matnr === 'RM0010') return [];
  const localCurr = p.Waers;
  const plantFactor = 0.93 + rnd(`pf${plant}`) * 0.16;
  const out: MockOption[] = [];
  const has = (src: Src) => {
    const r = rnd(`${matnr}|${plant}|${src}|has`);
    return src === 'MBEW' ? true : src === 'CONTRACT' ? r < 0.35 : src === 'INFOREC' ? r < 0.8 : src === 'MARKT' ? r < 0.3 : r < 0.75;
  };
  const vendor = VENDORS[hash(matnr + plant) % VENDORS.length];
  const asofT = asof ? Date.parse(asof) : Date.parse('2026-10-01');
  for (const src of SOURCES) {
    if (!has(src)) continue;
    const spread = { CONTRACT: 0.96, INFOREC: 1.0, MARKT: 1.04, CONSUMP: 1.02, MBEW: 1.07 }[src];
    const jitter = 0.97 + rnd(`${matnr}|${plant}|${src}|j`) * 0.08;
    const inr = m.base * plantFactor * spread * jitter;
    const curr = m.importCurr && (src === 'INFOREC' || src === 'CONTRACT') ? m.importCurr : localCurr;
    const ratePc = inr / FX_INR[curr];
    const daysBack = Math.floor(rnd(`${matnr}|${plant}|${src}|d`) * 300) + 5;
    const priceUnit = m.Mtart === 'VERP' && m.Meins === 'PC' ? 1000 : 1;
    out.push({
      Source: src,
      Cond: src === 'MBEW' ? 'VPRS' : src === 'CONSUMP' ? 'AVG' : src === 'MARKT' ? 'ZMKT' : 'PB00',
      Curr: curr,
      Uom: m.Meins,
      Plant: plant,
      ValidFrom: new Date(asofT - daysBack * 86400000).toISOString().slice(0, 10),
      ratePc,
      priceUnit,
      vendor: src === 'MBEW' || src === 'CONSUMP' ? '' : vendor[0],
      vname: src === 'MBEW' || src === 'CONSUMP' ? '' : vendor[1],
    });
  }
  return out;
}
