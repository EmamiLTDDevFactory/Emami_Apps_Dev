/** Mock of RigidSet (ZRIGID read-only) with invented figures, only to see the screens locally. Rigid items = materials whose number ends in 0 or 5. */
type Raw = Record<string, unknown>;
interface Deps { // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: (body: unknown, status?: number, msgs?: any[]) => Response; odataError: (status: number, code: string, message: string) => Response; parseFilter: (f: string) => Map<string, string[]> }
const P = (m: string) => m.padStart(18, '0');
const n = (v: number, dp = 6) => v.toFixed(dp);
const isRigid = (m: string) => /[05]$/.test(m);
const base = (grain: string, i: number, m: string, extra: Raw): Raw => ({ Grain: grain, Rowid: String(i).padStart(12, '0'), Matnr: P(m), Maktx: `PME-PLASTIC CONTAINER ${m.slice(-4)}`, Werks: 'UN13', Mould: '', MouldTxt: '', Mds: '', Design: '', Mcat: '', McatTxt: '', Lifnr: '', Vendor: '', Mach: '', MachTxt: '', Flag: '', Msg: '', Gjahr: '', Uname: '', Infnr: '', Comp: '', CompTxt: '', Gewei: '', Origin: '', Meins: '', Waers: '', Category: '', Mode: '', ValidFrom: null, ValidTo: null, CrtDate: null, Nmould: 0, ...extra });

export function handleRigid(set: string, sp: URLSearchParams, d: Deps): Response | null {
  if (set !== 'RigidSet') return null;
  const f = d.parseFilter(sp.get('$filter') ?? '');
  const mode = (f.get('Mode') ?? ['C'])[0];
  const mats = (f.get('Matnr') ?? []).map((m) => m.replace(/^0+/, ''));
  const rows: Raw[] = []; let i = 0;
  for (const m of mats) {
    if (mode === 'G') {
      if (!/[1357]$/.test(m)) continue;
      const q = 1.02, land = 1908, mat = 1703, conv = 113;
      rows.push(base('R', ++i, m, { Comp: P('151000753'), CompTxt: 'PME-PLASTIC CONTAINER ZANDU BALM 25/30ML', CompQty: n(q), LandRate: n(land), MatCost: n(mat), ConvCost: n(conv), ValidFrom: '2026-09-01', ValidTo: '2026-09-30', Mould: P('600000095'), Lifnr: P('99'), Flag: 'OK' }),
        base('G', ++i, m, { Nmould: 1, LandRate: n(q * land / 1000), MatCost: n(q * mat / 1000), ConvCost: n(q * conv / 1000), Flag: 'OK' }));
      continue;
    }
    if (mode === 'U') { rows.push(base('U', ++i, '151000753', { Comp: P(m), BomQty: n(2.5), Maktx: 'PME-PLASTIC CONTAINER ZANDU BALM 25/30ML' }), base('U', ++i, '151000762', { Comp: P(m), BomQty: n(1.8), Maktx: 'PME-PLASTIC CAP 40MM' })); continue; }
    if (!isRigid(m)) continue;
    if (mode === 'F') { rows.push(base('F', ++i, m, { Flag: 'RIGID', Nmould: 3 })); continue; }
    if (mode === 'B') {
      rows.push(base('D', ++i, m, { Gjahr: '2026', ValidFrom: '2026-04-01', ValidTo: '2027-03-31', Category: 'PM', Meins: 'PC', Waers: 'INR', Basic: n(1.62), DiscAmt: n(0), TaxAmt: n(0.29), FrgAmt: n(0.04), Freight: n(0.04), Landed: n(1.95), Total: n(1.95), Budqty: n(4200000, 3), BomQty: n(1) }),
        base('D', ++i, m, { Gjahr: '2025', ValidFrom: '2025-04-01', ValidTo: '2026-03-31', Category: 'PM', Meins: 'PC', Waers: 'INR', Basic: n(1.55), TaxAmt: n(0.28), Freight: n(0.04), Landed: n(1.87), Total: n(1.87), Budqty: n(3900000, 3), BomQty: n(1) }),
        base('P', ++i, m, { CompTxt: 'PML-KK-AH-SH-200ML-PL CN+CO15EG -DTV', Origin: 'PC', Mould: P('850002273'), Infnr: '0000000007', Flag: 'NORATE', Waers: 'INR', Meins: 'PC', BomQty: n(1000, 3), RSap: n(5222), RUsed: n(5222), Br: n(5137.62), Total: n(-84.38), VarPct: n(-1.62, 2), LandedRate: n(5137.62), FrtTotal: n(0) }),
        base('Q', ++i, m, { Comp: P('850002287'), CompTxt: 'ZBUDC - MATERIAL COST', Infnr: '0000000007', Flag: 'OK', Waers: 'INR', Meins: 'PC', DosPerc: n(55, 3), DosPercS: n(-2.938, 3), FUsed: n(-2.938, 3), Cbr: n(2872.1), Cbud: n(2787.7177) }),
        base('Q', ++i, m, { Comp: P('850002288'), CompTxt: 'ZBUDC - CONVERSION COST', Infnr: '0000000007', Flag: 'OK', Waers: 'INR', Meins: 'PC', DosPerc: n(45, 3), DosPercS: n(0, 3), FUsed: n(0, 3), Cbr: n(2349.9), Cbud: n(2349.9) }));
      continue;
    }
    if (mode === 'H') {
      for (const [k, vf, vt, land] of [[0, '2026-09-01', '2026-09-30', 1980], [1, '2026-08-01', '2026-08-31', 1941], [2, '2026-07-01', '2026-07-31', 1903]] as const)
        rows.push(base('H', ++i, m, { Mould: P('600000095'), Lifnr: P('99'), Comp: P('151002525'), Infnr: '5300057755', ValidFrom: vf, ValidTo: vt, CrtDate: vf, Uname: 'IT_FCOMMON', LandRate: n(land), ConvCost: n(113 + k), MatCost: n(1703 + k * 20) }));
      continue;
    }
    for (const [mould, txt, lif, vend, cav, cyc, zmrt, shift] of [['600000095', 'MLD-BP PHP 50GM CAP', '99', 'PLASTO PRODUCTS', 16, 9.5, 14371, 0], ['600000100', 'MLD-MB RG 9ML OUTER MOULD', '99', 'PLASTO PRODUCTS', 48, 9.5, 14371, 0], ['600000099', 'MLD-BP PHP 150GM CONTAINER', '71', 'ASIAN MOULDERS', 16, 11, 16500, 5]] as const) {
      const out = (22 * 3600 * 0.95) / cyc * cav, conv = zmrt / out * 1000, mat = 1703, land = Math.round(mat + conv + 20 + shift * 4);
      rows.push(base('M', ++i, m, { Mould: P(mould), MouldTxt: txt, Mds: '10', Design: txt, Mcat: '1', McatTxt: 'INJECTION', Lifnr: P(lif), Vendor: vend, Mach: '02', MachTxt: 'FERRO (MILACRON)', Flag: 'OK', Ntgew: n(18), Gewei: 'G', RunCavity: n(cav), CycTime: n(cyc), HoursDay: n(22), FacProd: n(95), TotOut: n(out, 0), TotOutMon: n(out * 24, 0), Kansw: n(2500000), Nafag: n(310000), OpenPr: n(120000), Nmould: 3,
        Zmrt: n(zmrt), ConvCost: n(conv), MatCost: n(mat), Zmbx: n(20), Zmpb: n(0), Zmtp: n(0), ZppbT: n(0), Zmfg: n(shift * 4), LandRate: n(land), ValidFrom: '2026-09-12' }));
      rows.push(base('B', ++i, m, { Mould: P(mould), Lifnr: P(lif), Comp: P('151002525'), CompTxt: 'PMP-PLASTIC GRANULES-KOYLENE-CP SRM100NC', BomQty: n(2.5), CompQty: n(2.5), Zpbr: n(79.2), CompCost: n(198), DosPerc: n(50) }),
        base('B', ++i, m, { Mould: P(mould), Lifnr: P(lif), Comp: P('151002526'), CompTxt: 'PMM-MB POLYONE-3085-7125-GD-50BC GOLD PE', BomQty: n(2.5), CompQty: n(2.5), Zpbr: n(602), CompCost: n(1505), DosPerc: n(50) }));
    }
  }
  return d.json({ d: { results: rows } });
}
