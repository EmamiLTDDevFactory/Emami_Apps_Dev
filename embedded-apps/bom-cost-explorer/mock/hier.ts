/**
 * Mock of SAP's grouped HierVHSet and of MaterialVHSet filtered by Brand / Product hierarchy / CRS.
 * Each finished good of mock/data.ts gets a brand, product hierarchy (PRODHA) and CRS group below.
 * MOCK_SAP_HIER: missing  -> HierVHSet 404 "Resource not found for segment"
 *                property -> 400 "Property 'Werks' not found in type 'ZMM_BOM_COST_SRV.HierVH'"
 *                empty    -> no brands
 *                big      -> brand BIG with 650 finished goods (MaterialVHSet caps at 500)
 * MaterialVHSet accepts the new cascade names (Zbrand, Zsku) and the legacy ones (Zbrandcode, Zskugrcodecrs).
 * MOCK_SAP_CASCADE=legacy -> the new names are rejected like the live systems on 23.10.2026 ("Property Zbrand not found").
 */
import { MATERIALS } from './data';

type Raw = Record<string, unknown>;
interface HierDeps {
  json: (body: unknown, status?: number) => Response;
  odataError: (status: number, code: string, message: string) => Response;
  parseFilter: (f: string) => Map<string, string[]>;
}

const BRANDS: Record<string, string> = { NAV: 'Navratna', BOR: 'BoroPlus', ZAN: 'Zandu', KES: 'Kesh King', BIG: 'Big Brand' };
const PRODUCTS: Record<string, string> = { '001001001000000000': 'Hair Oil 100 ml', '001001002000000000': 'Hair Oil 200 ml', '002001001000000000': 'Antiseptic Cream', '003001001000000000': 'Pain Balm', '004001001000000000': 'Ayurvedic Oil', '009009009000000000': 'Big Product' };
const CRS: Record<string, string> = { C101: 'Navratna Cool', C102: 'Navratna Extra', C201: 'BoroPlus Classic', C301: 'Zandu Balm', C401: 'Kesh King Oil', C999: 'Big CRS' };

interface HierMat { Matnr: string; Maktx: string; Mtart: string; Meins: string; brand: string; prodha: string; crs: string; werks: string[] }

function assign(m: { Matnr: string; Maktx: string; Mtart: string; Meins: string }): HierMat | null {
  if (m.Mtart !== 'FERT') return null;
  const n = m.Matnr;
  if (n.startsWith('FG1')) return { ...m, brand: 'NAV', prodha: n.endsWith('2') ? '001001002000000000' : '001001001000000000', crs: n.endsWith('2') ? 'C102' : 'C101', werks: ['1000', '1100', 'AE10'] };
  if (n.startsWith('FG2')) return { ...m, brand: 'BOR', prodha: '002001001000000000', crs: 'C201', werks: ['1000', '1200'] };
  if (n.startsWith('FG3')) return { ...m, brand: 'ZAN', prodha: '003001001000000000', crs: 'C301', werks: ['1000'] };
  return { ...m, brand: 'KES', prodha: '004001001000000000', crs: 'C401', werks: ['1000', 'BD10'] };
}

function hierMaterials(): HierMat[] {
  const base = MATERIALS.map(assign).filter((x): x is HierMat => !!x);
  if (process.env.MOCK_SAP_HIER !== 'big') return base;
  return [...base, ...Array.from({ length: 650 }, (_, i) => ({ Matnr: `BIG${String(i).padStart(5, '0')}`, Maktx: `Big pack ${i}`, Mtart: 'FERT', Meins: 'PC', brand: 'BIG', prodha: '009009009000000000', crs: 'C999', werks: ['1000'] }))];
}

const pass = (vals: string[] | undefined, v: string) => !vals?.length || vals.map((x) => x.toUpperCase()).includes(v.toUpperCase());

export function handleHier(set: string, sp: URLSearchParams, deps: HierDeps): Response | null {
  const mode = process.env.MOCK_SAP_HIER || '';
  if (set === 'HierVHSet') {
    if (mode === 'missing') return deps.odataError(404, '/IWBEP/CM_MGW_RT/020', "Resource not found for segment 'HierVHSet'");
    if (mode === 'property') return deps.odataError(400, '/IWBEP/CM_MGW_RT/022', "Property 'Werks' not found in type 'ZMM_BOM_COST_SRV.HierVH'");
    const f = deps.parseFilter(sp.get('$filter') ?? '');
    const level = f.get('Level')?.[0] ?? '';
    if (!['B', 'P', 'C'].includes(level)) return deps.odataError(400, 'ZHIER/001', 'Filter Level eq B, P or C is required');
    if (mode === 'empty') return deps.json({ d: { results: [] } });
    const mats = hierMaterials().filter((m) => pass(f.get('Brand'), m.brand) && pass(f.get('Product'), m.prodha) && (!f.get('Werks')?.length || m.werks.some((w) => pass(f.get('Werks'), w))));
    const key = (m: HierMat) => (level === 'B' ? m.brand : level === 'P' ? m.prodha : m.crs);
    const names = level === 'B' ? BRANDS : level === 'P' ? PRODUCTS : CRS;
    const cnt = new Map<string, number>();
    for (const m of mats) cnt.set(key(m), (cnt.get(key(m)) ?? 0) + 1);
    const rows: Raw[] = [...cnt].map(([Code, Cnt]) => ({ __metadata: { type: 'ZMM_BOM_COST_SRV.HierVH' }, Level: level, Code, Descr: names[Code] ?? '', Cnt }));
    return deps.json({ d: { results: rows } });
  }
  if (set === 'MaterialVHSet') {
    const raw = sp.get('$filter') ?? '';
    const hierFilter = /Zbrand|Prodha|Zsku/.test(raw);
    if (!hierFilter) return null; // the existing search / exact-material mock answers
    if (process.env.MOCK_SAP_CASCADE === 'legacy') {
      const bad = /\b(Zbrand|Zsku)\b(?!code|grcodecrs)/.exec(raw);
      if (bad) return deps.odataError(400, '/IWBEP/CM_MGW_RT/022', `Property ${bad[1]} not found in type MaterialVH`);
    }
    if (mode === 'property' && /Werks/.test(raw)) return deps.odataError(400, '/IWBEP/CM_MGW_RT/022', "Property 'Werks' not found in type 'ZMM_BOM_COST_SRV.MaterialVH'");
    const f = deps.parseFilter(raw);
    const term = (sp.get('search') ?? '').toLowerCase();
    const list = hierMaterials().filter((m) => pass(f.get('Zbrand') ?? f.get('Zbrandcode'), m.brand) && pass(f.get('Prodha'), m.prodha) && pass(f.get('Zsku') ?? f.get('Zskugrcodecrs'), m.crs) && pass(f.get('Mtart'), m.Mtart)
      && (!f.get('Werks')?.length || m.werks.some((w) => pass(f.get('Werks'), w))) && (!term || m.Matnr.toLowerCase().includes(term) || m.Maktx.toLowerCase().includes(term)));
    return deps.json({ d: { results: list.slice(0, 500).map((m) => ({ __metadata: { type: 'ZMM_BOM_COST_SRV.MaterialVH' }, Matnr: m.Matnr, Maktx: m.Maktx, Mtart: m.Mtart, Meins: m.Meins })) } });
  }
  return null;
}
