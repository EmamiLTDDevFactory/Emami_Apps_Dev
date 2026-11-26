import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import fx from '../fixtures/ck-structure-400016966-UN13.json';
import { buildStructure, flatten, lastLevel } from '@/lib/ck/structure';
import { explosionFromStructure } from '@/lib/dash/ckItemVariance';
import type { CkItemRow, CkListRow } from '@/lib/ck/types';

// Recorded from live NWP 26.11.2026: 400016966 @ UN13, estimate 01.11.2026 / Z9P1 / 01. Expected values are CK13N's costing structure (SAP GUI screenshot).
const data = fx as unknown as Record<string, unknown[]>;
const look = (k: string) => (data[k] ?? []) as never[];
const head = look('HEADER|{"matnr":"400016966","werks":"UN13"}')[0] as unknown as { Kadky: string; Tvers: string; Klvar: string; Bwvar: string; Losgr: string; TotalLot: string };
const deps = {
  list: async (matnr: string, werks: string) => look(`LIST|${JSON.stringify({ matnr, werks })}`) as CkListRow[],
  items: async (key: object) => look(`ITEM|${JSON.stringify({ key })}`) as CkItemRow[],
};
const build = (scale: string) => buildStructure(look('ITEM|{"matnr":"400016966","werks":"UN13"}') as CkItemRow[], { kadky: head.Kadky, tvers: head.Tvers, klvar: head.Klvar, bwvar: head.Bwvar }, 'UN13', new Decimal(scale), deps);

describe('CK13N costing structure, all levels (400016966 @ UN13)', () => {
  it('first level matches CK13N, components valued with their own estimate of the same costing date', async () => {
    const r = await build(head.Losgr);
    const v = Object.fromEntries(r.nodes.map((n) => [n.item.Typps === 'E' ? n.item.Lstar : n.matnr, n.value.toFixed(2)]));
    expect(v).toMatchObject({ MACHRS: '369.51', LABHRS: '109.60', POWER: '8.41', '151030516': '82.25', '151039244': '552.75', '151029143': '1477.52', '151028872': '57.54', '150004292': '1.20', '151001693': '2.26', '250005237': '2872.00' });
    expect(r.nodes.find((n) => n.matnr === '151029143')!.itemValue.toFixed(2)).toBe('1467.40'); // what the finished good's own itemization stored
    expect(head.TotalLot.startsWith('5557.97')).toBe(true); // SAP header total; the lines add up to less (re-costed components), as in CK13N
    expect(r.total.toFixed(2)).toBe('5533.05');
  });
  it('the bulk is opened to the last level with CK13N values', async () => {
    const r = await build(head.Losgr);
    const wip = r.nodes.find((n) => n.matnr === '250005237')!;
    const v = Object.fromEntries(wip.children.map((n) => [n.item.Typps === 'E' ? n.item.Lstar : n.matnr, n.value.toFixed(2)]));
    expect(v).toMatchObject({ MACHRS: '300.36', LABHRS: '18.76', POWER: '99.46', STEAM: '20.85', '100000235': '2.44', '100000158': '4.50', '100000288': '0.86', '100004837': '0.75', '100000354': '1.06', '100000350': '0.81', '100001881': '0.69', '100000246': '0.22', '100000251': '0.28', '100000520': '74.85' });
    expect(wip.children[4].qty.toFixed(3)).toBe('16.809');
    expect(r.nodes.filter((n) => n.matnr !== '250005237').every((n) => n.children.length === 0)).toBe(true); // bought parts are not opened
    expect(flatten(r.nodes)).toHaveLength(39);
  });
  it('per piece for the MIS comparison: last-level lines, activities of every level as conversion', async () => {
    const r = await build('1');
    const e = explosionFromStructure(r.nodes);
    expect(lastLevel(r.nodes).length).toBe(e.lines.length + 3 + 4);
    expect(e.convPc.toFixed(4)).toBe('0.9269'); // ~(369.51 + 109.60 + 8.41 + 300.36 + 18.76 + 99.46 + 20.85) / 1000
    expect(e.lines.find((l) => l.matnr === '151029143')!.valPc.toFixed(4)).toBe('1.4775');
    expect(e.lines.find((l) => l.matnr === '100000158')!.via).toBe('250005237');
    expect(e.bulks[0].ownPc.toFixed(4)).toBe('2.8720');
  });
});
