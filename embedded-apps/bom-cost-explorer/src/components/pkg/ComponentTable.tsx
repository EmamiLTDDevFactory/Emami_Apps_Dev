'use client';
import Decimal from 'decimal.js';
import { cx } from '../ui';
import { FlagChips } from './FlagChips';
import { NumEdit, type CellApi } from './NumEdit';
import { changed, fmtPct3, fmtRate4, fmtSigned3, stripZeros } from '@/lib/pkg/rules';
import type { PkgGroup } from '@/lib/pkg/types';

const th = 'whitespace-nowrap border-b border-line px-2 py-1 text-right text-2xs font-bold text-muted';
const td = 'whitespace-nowrap px-2 py-1 text-right text-xs tabular-nums';

/** Components of one material: % and ZBUD % are editable (used column), everything else is SAP's. */
export default function ComponentTable({ g, cell }: { g: PkgGroup; cell: CellApi }) {
  const m = g.head.Matnr;
  const totalPct = g.comps.reduce((s, c) => s.plus(String(c.PctUsed)), new Decimal(0));
  const totalBud = g.comps.reduce((s, c) => s.plus(String(c.CompBudRate)), new Decimal(0));
  const ok = totalPct.minus(100).abs().lt(1e-9);
  return (
    <table className="w-full border-collapse text-xs" aria-label={`Components of ${stripZeros(m)}`}>
      <thead>
        <tr>
          <th className={cx(th, 'text-left')}>Component</th><th className={cx(th, 'text-left')}>Description</th>
          <th className={th}>% SAP</th><th className={th}>% used</th><th className={th}>ZBUD % SAP</th><th className={th}>ZBUD % used</th>
          <th className={th}>Base rate</th><th className={th}>Budgeted</th><th className={cx(th, 'text-left')}>Flags</th>
        </tr>
      </thead>
      <tbody>
        {g.comps.map((c) => (
          <tr key={c.Idnrk} className="border-b border-line/50">
            <td className="whitespace-nowrap px-2 py-1 font-semibold">{stripZeros(c.Idnrk)}</td>
            <td className="max-w-[260px] truncate px-2 py-1 text-muted" title={c.Maktx}>{c.Maktx}</td>
            <td className={td}>{fmtPct3(c.PctSap)}</td>
            <td className={td}><NumEdit cell={cell} k={`${m}|${c.Idnrk}|P`} level="P" matnr={m} idnrk={c.Idnrk} value={c.PctUsed} sap={c.PctSap} fmt={fmtPct3} label={`% of ${stripZeros(c.Idnrk)}`} /></td>
            <td className={td}>{fmtSigned3(c.ZbudSap)}</td>
            <td className={td}><NumEdit cell={cell} k={`${m}|${c.Idnrk}|Z`} level="Z" matnr={m} idnrk={c.Idnrk} value={c.ZbudUsed} sap={c.ZbudSap} fmt={fmtSigned3} label={`ZBUD % of ${stripZeros(c.Idnrk)}`} /></td>
            <td className={td}>{fmtRate4(c.CompBaseRate)}</td>
            <td className={cx(td, 'font-semibold')}>{fmtRate4(c.CompBudRate)}</td>
            <td className="px-2 py-1 text-left"><FlagChips flags={c.MsgFlags} /></td>
          </tr>
        ))}
        {!g.comps.length && <tr><td colSpan={9} className="px-2 py-2 text-center text-muted">No components</td></tr>}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td colSpan={3} className="px-2 py-1 text-right text-muted">Total % used</td>
          <td className={cx(td, ok ? 'text-good' : 'text-bad')}>{fmtPct3(totalPct.toNumber())} {ok ? '(OK)' : '(must be 100)'}</td>
          <td colSpan={3} className="px-2 py-1 text-right text-muted">Sum budgeted</td>
          <td className={td}>{fmtRate4(totalBud.toNumber())}</td><td />
        </tr>
      </tfoot>
    </table>
  );
}
