'use client';
import type { CostQuery } from '@/lib/query/schema';
import { describeQuery } from '@/lib/query/schema';
import type { CostTree } from '@/lib/cost/tree';
import type { Pivot } from '@/lib/cost/pivot';
import type { SimRow } from '@/lib/cost/simulate';
import type { Decimal } from '@/lib/cost/decimal';
import type { SapMessage } from '@/lib/sap/messages';
import { fmtNum, fmtQty, fmtRate } from '@/lib/format';
import { componentFreightInr, type FreightTagged } from '@/lib/cost/freightIncluded';

const MAX = 5000;

/** Non-virtualised, print-only rendering of the current result (the screen tree only renders
 * the rows in view). */
export default function PrintView({ query, tree, pivot, sim, simOn, total, messages }: { query: CostQuery; tree: CostTree | null; pivot: Pivot | null; sim: SimRow[]; simOn: boolean; total: Decimal | null; messages: SapMessage[] }) {
  return (
    <div className="print-only p-2 text-black">
      <h1 className="text-lg font-bold">BOM Simulator — {query.mode === 'C' ? 'Plant comparison' : 'BOM costing'}</h1>
      <p className="mb-2 text-xs">Printed {new Date().toLocaleString('en-IN')} · Totals = sum of leaf lines (HasChild blank). {simOn && 'Columns marked SIM are client-side simulations, not SAP figures.'}</p>
      <table className="print-table mb-3">
        <tbody>{describeQuery(query).map(([k, v]) => <tr key={k}><th className="text-left">{k}</th><td>{v}</td></tr>)}</tbody>
      </table>
      {messages.filter((m) => m.severity !== 'info').length > 0 && (
        <ul className="mb-3 text-xs">{messages.filter((m) => m.severity !== 'info').map((m, i) => <li key={i}>⚠ {m.message}</li>)}</ul>
      )}
      {tree && (
        <table className="print-table">
          <thead>
            <tr><th>Plant</th><th>Header</th><th>Lvl</th><th>Component</th><th>Description</th><th>Qty</th><th>Source</th><th>Rate/pc INR</th><th>Freight/pc INR</th><th>Total INR</th>{simOn && <th>SIM Total INR</th>}</tr>
          </thead>
          <tbody>
            {tree.rows.slice(0, MAX).map((r, i) => (
              <tr key={i} style={{ fontStyle: tree.isLeaf[i] ? 'normal' : 'italic' }}>
                <td>{r.Hwerks}</td><td>{r.Headmat}</td><td>{r.Level}</td>
                <td style={{ paddingLeft: (r.Level - 1) * 8 }}>{r.Idnrk}</td><td>{r.Maktx}</td>
                <td style={{ textAlign: 'right' }}>{fmtQty(r.ProdQty)} {r.Meins}</td>
                <td>{tree.isLeaf[i] ? r.SelSource || 'NO RATE' : ''}</td>
                <td style={{ textAlign: 'right' }}>{tree.isLeaf[i] ? fmtRate(r.SelRatePcInr) : ''}</td>
                <td style={{ textAlign: 'right' }}>{tree.isLeaf[i] ? `${fmtRate(String(componentFreightInr(r)))}${(r as FreightTagged).FrtIncluded ? ' (not added)' : ''}` : ''}</td>
                <td style={{ textAlign: 'right' }}>{fmtNum(r.TotCostInr, 2)}</td>
                {simOn && <td style={{ textAlign: 'right' }}>{tree.isLeaf[i] ? fmtNum(sim[i].total, 2) : ''}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th colSpan={9} style={{ textAlign: 'right' }}>Total (leaf lines)</th><th style={{ textAlign: 'right' }}>{total ? fmtNum(total, 2) : ''} INR</th>{simOn && <th />}</tr></tfoot>
        </table>
      )}
      {tree && tree.rows.length > MAX && <p className="text-xs">Only the first {MAX} lines are printed — export to Excel for all {tree.rows.length}.</p>}
      {pivot && (
        <table className="print-table">
          <thead><tr><th>Header</th><th>Component</th>{pivot.plants.map((p) => <th key={p}>{p} INR</th>)}<th>Min</th><th>Max</th><th>Diff</th><th>Cheapest</th></tr></thead>
          <tbody>
            {pivot.rows.slice(0, MAX).map((r, i) => (
              <tr key={i} style={{ fontWeight: r.kind === 'total' ? 700 : 400 }}>
                <td>{r.head}</td><td>{r.kind === 'total' ? 'TOTAL' : `${r.comp} ${r.compText}`}</td>
                {pivot.plants.map((p) => <td key={p} style={{ textAlign: 'right' }}>{r.cells[p] ? fmtNum(r.cells[p]!.cost, 2) : '—'}</td>)}
                <td style={{ textAlign: 'right' }}>{r.min ? fmtNum(r.min, 2) : '—'}</td><td style={{ textAlign: 'right' }}>{r.max ? fmtNum(r.max, 2) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{r.diff ? fmtNum(r.diff, 2) : '—'}</td><td>{r.cheapest ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
