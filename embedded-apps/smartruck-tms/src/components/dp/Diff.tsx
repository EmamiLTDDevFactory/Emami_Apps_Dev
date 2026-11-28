'use client';
import React, { useState } from 'react';
import { diffDatasets, diffPlans, diffSheets, downloadExport, newSession, type DpDataset } from '../../lib/dp';
import { Card, Kpi } from '../ui';
import { SProps, Td, Th, f0, f1 } from './common';

type InDiff = ReturnType<typeof diffDatasets>;
type OutDiff = ReturnType<typeof diffPlans>;

/* Parallel run: drop Sanjoy's dp_data.json (what HIS tool was fed). Both datasets are planned by the SAME engine, so every difference
   comes from the data. Input diff = what each side was fed; output diff = what the engine planned from it. A = Trip Trail (live SAP), B = his. */
export function Diff({ s, toast }: SProps) {
  const [res, setRes] = useState<{ file: string; inp: InDiff; out: OutDiff; msB: number } | null>(null);
  const [open, setOpen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const run = async (f: File) => {
    setBusy(true);
    try {
      const B = JSON.parse(await f.text()) as DpDataset;
      if (!B || !Array.isArray(B.mats) || !Array.isArray(B.sites) || !Array.isArray(B.stk)) throw new Error('This is not a dp_data.json (mats / sites / stk missing).');
      await new Promise((r) => setTimeout(r, 20));
      const SB = newSession(B), t0 = Date.now(); SB.runPlan();
      const msB = Date.now() - t0;
      setRes({ file: f.name, inp: diffDatasets(s.D, B), out: diffPlans(s, SB), msB });
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const labels = { a: 'Trip Trail (SAP)', b: 'Sanjoy (console)' };
  const out = res?.out, inp = res?.inp;
  return (
    <div className="space-y-4">
      <Card title="Compare with Sanjoy's plan">
        <div className="hint mb-3">Drop his <b>dp_data.json</b> (in his Distribution Planning folder). We plan both datasets with the same engine and show where the inputs differ and where the plans differ. Nothing is saved.</div>
        <input type="file" accept=".json,application/json" data-testid="diff-file" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); }} />
        {busy && <span className="ml-3 text-sm text-inkSoft">Planning both datasets…</span>}
      </Card>
      {res && inp && out && <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="diff-kpis">
          <Kpi label="Plan date" value={inp.sameToday ? inp.todayA : `${inp.todayA} vs ${inp.todayB}`} sub={inp.sameToday ? 'same day' : 'different days: expect differences'} tone={inp.sameToday ? 'green' : 'amber'} />
          <Kpi label="Trucks" value={`${f0(out.trucks.a.total)} vs ${f0(out.trucks.b.total)}`} sub={`${f1(out.trucks.a.tonnes)} t vs ${f1(out.trucks.b.tonnes)} t`} tone="blue" />
          <Kpi label="Plan lines" value={`${f0(out.counts.linesA)} vs ${f0(out.counts.linesB)}`} sub={`${f0(out.counts.same)} identical · ${f0(out.counts.differ)} differ · ${f0(out.counts.onlyA)} only A · ${f0(out.counts.onlyB)} only B`} />
          <Kpi label="Input tables with differences" value={`${inp.tables.filter((t) => t.diffRows > 0).length} of ${inp.tables.length}`} tone="amber" />
        </div>
        <div className="flex gap-2"><button className="btn-primary" data-testid="diff-xlsx" onClick={() => downloadExport({ name: `Plan diff ${inp.todayA} vs ${inp.todayB}.xlsx`, sheets: diffSheets(inp, out, labels) as never })}>Download diff (xlsx)</button></div>

        <Card title="Input diff · what each tool was fed" pad={false}>
          <div className="overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Table</Th><Th n>Rows A</Th><Th n>Rows B</Th><Th n>Only A</Th><Th n>Only B</Th><Th n>Differ</Th><Th>Totals A</Th><Th>Totals B</Th><Th /></tr></thead><tbody>
            {inp.tables.map((t) => <React.Fragment key={t.name}>
              <tr className={t.diffRows ? '' : 'text-inkSoft'}><Td>{t.label} <span className="hint">({t.vals.join(' / ')})</span></Td><Td n>{f0(t.rowsA)}</Td><Td n>{f0(t.rowsB)}</Td><Td n>{f0(t.onlyA)}</Td><Td n>{f0(t.onlyB)}</Td><Td n>{f0(t.differ)}</Td><Td>{t.totA.map(f0).join(' / ')}</Td><Td>{t.totB.map(f0).join(' / ')}</Td>
                <Td>{t.top.length > 0 && <button className="text-xs font-bold text-rust" onClick={() => setOpen(open === t.name ? '' : t.name)}>{open === t.name ? 'hide' : `top ${t.top.length}`}</button>}</Td></tr>
              {open === t.name && <tr><td colSpan={9} className="bg-cream p-0"><div className="max-h-72 overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Key</Th><Th>Side</Th><Th>A</Th><Th>B</Th><Th>B − A</Th></tr></thead><tbody>
                {t.top.map((r) => <tr key={r.key}><Td>{r.key}</Td><Td>{r.side}</Td><Td>{r.a.map(f0).join(' / ')}</Td><Td>{r.b.map(f0).join(' / ')}</Td><Td>{r.delta.map(f0).join(' / ')}</Td></tr>)}</tbody></table></div></td></tr>}
            </React.Fragment>)}
          </tbody></table></div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Output diff · by leg" pad={false}><table className="w-full border-collapse"><thead><tr><Th>Leg</Th><Th n>Lines A</Th><Th n>Lines B</Th><Th n>Tonnes A</Th><Th n>Tonnes B</Th><Th n>Critical A</Th><Th n>Critical B</Th></tr></thead><tbody>
            {out.legs.map((l) => <tr key={l.leg}><Td>{l.leg}</Td><Td n>{f0(l.a.lines)}</Td><Td n>{f0(l.b.lines)}</Td><Td n>{f1(l.a.t)}</Td><Td n>{f1(l.b.t)}</Td><Td n>{f0(l.a.crit)}</Td><Td n>{f0(l.b.crit)}</Td></tr>)}
          </tbody></table></Card>
          <Card title="Output diff · by depot (tonnes in, B − A)" pad={false}><div className="max-h-64 overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Depot</Th><Th n>A t</Th><Th n>B t</Th><Th n>B − A</Th></tr></thead><tbody>
            {out.depots.slice(0, 60).map((d) => <tr key={d.code}><Td>{d.code}</Td><Td n>{f1(d.a)}</Td><Td n>{f1(d.b)}</Td><Td n className={d.delta > 0 ? 'text-green' : 'text-red'}>{d.delta > 0 ? '+' : ''}{f1(d.delta)}</Td></tr>)}
            {out.depots.length === 0 && <tr><Td colSpan={4} className="text-inkSoft">No depot differs.</Td></tr>}
          </tbody></table></div></Card>
        </div>
        <Card title={`Plan lines that differ (top ${out.lines.length} of ${f0(out.counts.diffLines)}, by kg)`} pad={false}><div className="max-h-[50vh] overflow-auto"><table className="w-full border-collapse"><thead><tr><Th>Leg</Th><Th>Material</Th><Th>Description</Th><Th>From</Th><Th>To</Th><Th n>Pcs A</Th><Th n>Pcs B</Th><Th n>B − A</Th><Th n>Kg</Th><Th>Side</Th></tr></thead><tbody>
          {out.lines.map((l) => <tr key={l.key}><Td>{l.leg}</Td><Td>{l.mat}</Td><Td>{l.desc}</Td><Td>{l.from}</Td><Td>{l.to}</Td><Td n>{f0(l.aPcs)}</Td><Td n>{f0(l.bPcs)}</Td><Td n>{f0(l.delta)}</Td><Td n>{f0(l.kg)}</Td><Td>{l.side}</Td></tr>)}
          {out.lines.length === 0 && <tr><Td colSpan={10} className="text-inkSoft">The two plans are identical.</Td></tr>}
        </tbody></table></div></Card>
      </>}
    </div>
  );
}
