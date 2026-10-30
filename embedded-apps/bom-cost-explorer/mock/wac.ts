/**
 * Mock of the weighted-average-cost sets of ZMM_BOM_COST_SRV (WacRowSet, WacCompareSet, WacCompSet, WacDocSet), shaped like
 * NWP on 2026-10-31 (key `Rowid` numeric; a source without rates answers 0.0000 with a blank flag).
 *
 * Cases (by Matnr / filter):
 *   FG1001  normal, all four sources (the only one with Average-rate data)
 *   FG1002  Status 'D' (documents with several PO-cost rows), no Average data
 *   FG1003  low coverage: C-MAP rates exist for only 7 of 12 components
 *   FG2001  produced quantity 0
 *   EMPTYFG no rows            BIGFG  "More than N rows" message        ERRFG  SAP error
 *   Prodha BIGSET  30 finished goods (with the comparison on: the "25 at most" warning, no comparison values)
 * No plant, or no date range: SAP's message. Nothing here recomputes anything the real service would not send.
 */
import { MATERIALS } from './data';

type Raw = Record<string, unknown>;
interface Deps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: (body: unknown, status?: number, msgs?: any[]) => Response;
  odataError: (status: number, code: string, message: string) => Response;
  parseFilter: (f: string) => Map<string, string[]>;
}

const SETS = new Set(['WacRowSet', 'WacCompareSet', 'WacCompSet', 'WacDocSet']);
const f6 = (n: number) => n.toFixed(6);
const f4 = (n: number) => n.toFixed(4);
const seedOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const flagOf = (v: number) => (Math.abs(v) >= 10 ? 'H' : Math.abs(v) >= 5 ? 'M' : '');
const dateMs = (iso: string) => '/Date(' + Date.parse(iso + 'T00:00:00Z') + ')/';

interface Fg { Matnr: string; Maktx: string }
const SOURCES = ['SEL', 'CMAP', 'CON', 'AVG'] as const;
const DELTA: Record<(typeof SOURCES)[number], number> = { SEL: 0.042, CMAP: -0.01, CON: 0.11, AVG: -0.06 };

function figures(fg: string, werks: string) {
  const s = seedOf(`${fg}|${werks}`);
  const rm = 5 + (s % 50) / 10, pm = 2 + (s % 30) / 10, perf = fg === 'FG2001' ? 0 : (s % 7) / 10 + 0.2;
  const mat = rm + pm + perf, conv = 1.5 + (s % 20) / 10;
  const qty = fg === 'FG2001' ? 0 : 1000 + (s % 90) * 100;
  const recon = fg === 'FG3001' ? 0.35 * (mat + conv) : 0;
  return { rm, pm, perf, mat, conv, landed: mat + conv + recon, recon, qty };
}
const hasSource = (fg: string, src: string) => (src === 'AVG' ? fg === 'FG1001' : true);
/** source cost per unit of one group: the actual shifted by the source's delta (so the variance is a known number) */
const srcPu = (act: number, src: (typeof SOURCES)[number]) => act / (1 + DELTA[src]);
const varPct = (act: number, src: number) => ((act - src) / src) * 100;

function fgList(plants: string[], matnr: string[], prodha: string[]): { fg: Fg; werks: string }[] {
  let list: Fg[];
  if (prodha.includes('BIGSET')) list = Array.from({ length: 30 }, (_, i) => ({ Matnr: `FGB${String(i + 1).padStart(3, '0')}`, Maktx: `Bulk finished good ${i + 1}` }));
  else if (matnr.length) list = matnr.map((m) => MATERIALS.find((x) => x.Matnr === m) ?? { Matnr: m, Maktx: `Finished good ${m}` });
  else list = MATERIALS.filter((m) => m.Mtart === 'FERT');
  list = list.filter((m) => m.Matnr !== 'EMPTYFG');
  return plants.flatMap((werks) => list.map((fg) => ({ fg, werks })));
}

export function handleWac(set: string, sp: URLSearchParams, d: Deps): Response | null {
  if (!SETS.has(set)) return null;
  const f = d.parseFilter(sp.get('$filter') ?? '');
  const plants = f.get('Werks') ?? [], matnr = f.get('Matnr') ?? [], prodha = f.get('Prodha') ?? [];
  const from = f.get('DateFrom')?.[0], to = f.get('DateTo')?.[0];
  const cmp = (f.get('InclCmp') ?? [])[0] === 'X';
  if (!plants.length) return d.odataError(400, 'ZMM_BOM/001', 'Select at least one manufacturing unit (plant)');
  if (!from || !to) return d.odataError(400, 'ZMM_BOM/002', 'Enter the date range (from and to)');
  if (matnr.includes('ERRFG')) return d.odataError(500, 'ZMM_BOM/999', 'Costing run failed for ERRFG (mock SAP error)');
  if (matnr.includes('BIGFG')) return d.odataError(400, 'ZMM_BOM/003', 'More than 5000 rows: shorten the date range or select fewer plants');
  const list = fgList(plants, matnr, prodha);

  if (set === 'WacRowSet') {
    const distinct = new Set(list.map((x) => x.fg.Matnr)).size;
    const limited = cmp && distinct > 25;
    const rows: Raw[] = list.map(({ fg, werks }, i) => {
      const a = figures(fg.Matnr, werks);
      const row: Raw = {
        Rowid: i + 1, Matnr: fg.Matnr, Maktx: fg.Maktx, Werks: werks, Mtart: 'FERT', Zbrand: '0116', Prodha: prodha[0] ?? '0101160653', Zskugrcodecrs: '10116065373702', Zskugroupcrs: 'MOCK CRS GROUP',
        Uom: 'PC', Docs: fg.Matnr === 'FG1002' ? 22 : 6, Batches: 4, DupDocs: fg.Matnr === 'FG1002' ? 14 : 0, Qty: a.qty.toFixed(3),
        ActRm: f6(a.rm), ActPm: f6(a.pm), ActPerf: f6(a.perf), ActMat: f6(a.mat), ActConv: f6(a.conv), ActLanded: f6(a.landed), ActRecon: f6(a.recon),
        Status: fg.Matnr === 'FG1002' ? 'D' : '', Msg: fg.Matnr === 'FG1002' ? 'Documents with several PO-cost rows: check the PO utility view' : '',
      };
      for (const src of SOURCES) {
        const key = src === 'SEL' ? 'Sel' : src === 'CMAP' ? 'Cmap' : src === 'CON' ? 'Con' : 'Avg';
        const live = cmp && !limited && hasSource(fg.Matnr, src) && a.mat > 0;
        const v = live ? varPct(a.mat, srcPu(a.mat, src)) : 0;
        row[`Varp${key}`] = f4(v);
        row[`Flag${key}`] = live ? flagOf(v) : '';
      }
      return row;
    });
    return d.json({ d: { results: rows } }, 200, limited ? [{ code: 'ZMM_BOM/004', message: 'Too many finished goods: the comparison runs for 25 at most; no comparison values are returned.', severity: 'warning' }] : []);
  }

  if (set === 'WacCompareSet') {
    const out: Raw[] = [];
    let id = 0;
    for (const { fg, werks } of list) {
      const a = figures(fg.Matnr, werks);
      for (const grp of ['RM', 'PM', 'PERF', 'MAT'] as const) {
        const act = grp === 'RM' ? a.rm : grp === 'PM' ? a.pm : grp === 'PERF' ? a.perf : a.mat;
        if (act <= 0) continue;
        for (const src of SOURCES) {
          if (!hasSource(fg.Matnr, src)) continue;
          const sp2 = srcPu(act, src);
          const v = varPct(act, sp2);
          const low = fg.Matnr === 'FG1003' && src === 'CMAP';
          out.push({ Rowid: ++id, Matnr: fg.Matnr, Maktx: fg.Maktx, Werks: werks, Grp: grp, Src: src, ActPu: f6(act), SrcPu: f6(sp2), VarAbs: f6(act - sp2), VarPct: f4(v), Flag: flagOf(v), Dir: v >= 0 ? '+' : '-',
            NComp: 12, NRated: low ? 7 : 12, CoverPct: low ? '58.3333' : '100.0000' });
        }
      }
    }
    return d.json({ d: { results: out } });
  }

  if (set === 'WacCompSet') {
    const out: Raw[] = [];
    let id = 0;
    for (const { fg, werks } of list) {
      const s = seedOf(`${fg.Matnr}|${werks}`);
      for (let i = 0; i < 12; i++) {
        const grp = i < 6 ? 'RM' : i < 10 ? 'PM' : 'PERF';
        const sel = 1 + ((s + i * 13) % 90) / 10, qtyPu = 0.5 + (i % 4) * 0.25;
        const noCmap = fg.Matnr === 'FG1003' && i >= 7;
        const cmap = noCmap ? 0 : sel * (1 + ((i % 5) - 2) * 0.03), con = sel * (1 + ((i % 7) - 3) * 0.04), avg = fg.Matnr === 'FG1001' ? sel * (1 + ((i % 3) - 1) * 0.06) : 0;
        const v = (r: number) => (r > 0 ? ((r - sel) / sel) * 100 : 0);
        const worst = Math.max(Math.abs(v(cmap)), Math.abs(v(con)), Math.abs(v(avg)));
        out.push({ Rowid: ++id, Matnr: fg.Matnr, Werks: werks, Idnrk: `${grp === 'RM' ? '1' : grp === 'PM' ? '2' : '3'}0000${i + 10}`, CompTxt: `${grp} component ${i + 1}`, Mtart: grp === 'RM' ? 'ROH' : grp === 'PM' ? 'VERP' : 'PKGN',
          Grp: grp, SrcSel: ['CONTRACT', 'INFOREC', 'MBEW'][i % 3], Uom: 'KG', QtyPu: f6(qtyPu), RateSel: f6(sel), RateCmap: f6(cmap), RateCon: f6(con), RateAvg: f6(avg),
          CostSel: f6(sel * qtyPu), CostCmap: f6(cmap * qtyPu), CostCon: f6(con * qtyPu), CostAvg: f6(avg * qtyPu), VarpCmap: f4(v(cmap)), VarpCon: f4(v(con)), VarpAvg: f4(v(avg)), Flag: flagOf(worst) });
      }
    }
    return d.json({ d: { results: out } });
  }

  // WacDocSet
  const out: Raw[] = [];
  let id = 0;
  for (const { fg, werks } of list) {
    const a = figures(fg.Matnr, werks);
    if (a.qty === 0) continue;
    const docs: { via: string; q: number; rows: number }[] = [{ via: 'PROD_ORDER', q: a.qty * 0.6, rows: 1 }, { via: 'SUBCONTRACTING', q: a.qty * 0.5, rows: fg.Matnr === 'FG1002' ? 2 : 1 }, { via: 'PROD_ORDER', q: -a.qty * 0.1, rows: 1 }];
    docs.forEach((doc, i) => out.push({ Rowid: ++id, Mblnr: `50059${String(25000 + i)}`, Mjahr: '2026', Werks: werks, Matnr: fg.Matnr, Charg: `KU00${10 + i}`, Budat: dateMs(from), Aufnr: `0002004720${37 + i}`, Via: doc.via,
      Qty: doc.q.toFixed(3), Uom: 'PC', Hwaer: 'INR', FxInr: '1.000000', Rm: f6(a.rm * doc.q), Pm: f6(a.pm * doc.q), Perf: f6(a.perf * doc.q), Conv: f6(a.conv * doc.q), Landed: f6(a.landed * doc.q), Rows: doc.rows }));
  }
  return d.json({ d: { results: out } });
}
