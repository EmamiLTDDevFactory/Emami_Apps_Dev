'use client';
/** MIS drill-down: the finished goods behind a brand row (actual, budget, and the budget key SAP matched or could not match). Display only. */
import Decimal from 'decimal.js';
import { cx } from '../ui';
import type { MisFgRow } from '@/lib/dash/types';
import { BAND, lakh, tdCls, thCls } from './parts';
import { bandOf } from '@/lib/dash/logic';

const D = (v: string) => { try { return new Decimal(v || 0); } catch { return new Decimal(0); } };
const n4 = (d: Decimal) => d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MisFgTable({ rows, showBrand = false, bn }: { rows: MisFgRow[]; showBrand?: boolean; bn?: (c: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            {showBrand && <th className={cx(thCls, '!text-left')}>Brand</th>}
            <th className={cx(thCls, '!text-left')}>Finished good</th><th className={thCls}>YTM qty</th>
            <th className={thCls}>Actual / pc</th><th className={thCls}>Budget / pc</th>
            <th className={thCls}>YTM budget (L)</th><th className={thCls}>YTM actual (L)</th><th className={thCls}>Variance %</th>
            <th className={cx(thCls, '!text-left')}>Source: actual = SAP process orders; budget =</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const has = r.FgNobud === 0;
            const bud = D(r.YtmBudget), cmp = D(r.YtmActualCmp), v = cmp.minus(bud), p = has && bud.gt(0) ? v.div(bud).times(100) : null;
            return (
              <tr key={`${r.Matnr}-${r.Zbrand}`} className={cx('border-t border-line/60', !has && 'bg-warn/[0.06]')}>
                {showBrand && <td className="px-2.5 py-1.5 text-left text-xs font-bold">{bn ? bn(r.Zbrand) || r.Zbrand : r.Zbrand}</td>}
                <td className="px-2.5 py-1.5 text-left text-xs"><span className="font-bold">{r.Matnr.replace(/^0+/, '')}</span> <span className="text-muted">{r.Maktx}</span></td>
                <td className={tdCls}>{D(r.YtmQty).toNumber().toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className={tdCls}>{D(r.ActPc).gt(0) ? n4(D(r.ActPc)) : '-'}</td>
                <td className={tdCls}>{has && D(r.BudPc).gt(0) ? n4(D(r.BudPc)) : <span className="font-semibold text-warn">no budget</span>}</td>
                <td className={tdCls}>{has ? lakh(bud, 2) : '-'}</td><td className={tdCls}>{lakh(D(r.YtmActual), 2)}</td>
                <td className={cx(tdCls, 'font-bold', BAND[bandOf(p)])}>{p ? `${p.toFixed(1)} %` : '-'}</td>
                <td className="px-2.5 py-1.5 text-left text-2xs text-muted">{r.BudSrc}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={showBrand ? 9 : 8} className="p-3 text-center text-xs text-muted">No finished goods.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
